import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { UserProfile } from '../types';
import { StorageService } from '../services/storage';
import { flush, getSummary } from '../services/syncQueue';
import { getSupabaseAuthErrorMessage } from '../utils/supabaseAuthErrors';
import { UnsyncedLogoutDialog } from '../components/auth/UnsyncedLogoutDialog';

// 45-F (AUD-01): o link do e-mail de "Esqueci a senha" (fluxo implicit) volta
// para o site com `#access_token=...&type=recovery`. O Supabase tira isso da
// URL e avisa com o evento PASSWORD_RECOVERY, mas o aviso pode sair antes de o
// React assinar — por isso o hash é lido aqui, na carga do módulo, antes de o
// cliente limpá-lo. Só o hash com `access_token` e `type=recovery` liga o modo
// (P12a): `?type=recovery&code=...` não basta, porque sem sessão de recuperação
// não há senha nova a definir; no fluxo com `code`, quem liga é o evento
// PASSWORD_RECOVERY, depois de o cliente trocar o código pela sessão.
const OPENED_FROM_RECOVERY_LINK = (() => {
  try {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash;
    return /(^|[#&])type=recovery(&|$)/.test(hash) && /(^|[#&])access_token=/.test(hash);
  } catch {
    return false;
  }
})();

// Falha momentânea (45-F, AUD-26) é rede fora do ar (status 0), servidor com
// problema (5xx) ou pedido que o servidor mandou repetir (408/429). Qualquer
// outra resposta de erro (permissão negada, perfil inexistente...) não é
// momentânea: continua barrando.
function isTransientProfileError(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

// Espera entre novas tentativas de ler o perfil depois de uma falha momentânea.
const PROFILE_RETRY_DELAYS_MS = [3_000, 10_000, 30_000, 60_000];

// Ao sair, tenta enviar o que ficou na fila por no máximo este tempo.
const FLUSH_BEFORE_LOGOUT_MS = 6_000;

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginError: string | null;
  isConfigured: boolean;
  isEmailVerified: boolean;
  /** Leitura do perfil falhou agora, mas a pessoa já estava ativa: segue no app e a leitura é refeita. */
  profileRefreshFailed: boolean;
  /** A pessoa abriu o link de "Esqueci a senha": deve definir a senha nova antes de seguir. */
  passwordRecovery: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithDemo: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  finishPasswordRecovery: () => void;
  retryProfile: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

type ProfileResult =
  | { ok: true; profile: UserProfile }
  | { ok: false; transient: boolean; status?: number; fallbackProfile: UserProfile };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean>(false);
  const [profileRefreshFailed, setProfileRefreshFailed] = useState<boolean>(false);
  const [passwordRecovery, setPasswordRecovery] = useState<boolean>(OPENED_FROM_RECOVERY_LINK);
  // Próxima nova tentativa de ler o perfil (null: nenhuma pendente).
  const [profileRetry, setProfileRetry] = useState<{ uid: string; attempt: number } | null>(null);
  // Aviso de "Sair" com envio pendente (null: fechado).
  const [unsyncedPrompt, setUnsyncedPrompt] = useState<{ uid: string; count: number } | null>(null);
  // Sessão que o app está mostrando agora e se o perfil dela já foi lido como
  // 'active' nesta sessão — só quem já foi lido assim é poupado de uma falha
  // momentânea (fail-closed para todo o resto).
  const latestUserRef = useRef<User | null>(null);
  const activeProfileUidRef = useRef<string | null>(null);
  // Renovação da sessão (P12a) em andamento: o evento TOKEN_REFRESHED que ela
  // mesma provoca não pode disparar outra renovação.
  const renewingSessionRef = useRef(false);

  // Busca o perfil em public.profiles (criado pelo trigger handle_new_user no signup)
  const fetchProfile = useCallback(async (supaUser: User): Promise<ProfileResult> => {
    StorageService.setActiveUser(supaUser.id);

    const fallbackProfile: UserProfile = {
      uid: supaUser.id,
      email: supaUser.email || null,
      displayName: supaUser.user_metadata?.display_name || 'Estudante NexusMed',
      photoURL: supaUser.user_metadata?.avatar_url || null,
      role: 'student',
      status: 'pending',
    };

    try {
      const { data, error, status } = await supabase
        .from('profiles')
        .select('id, email, display_name, avatar_url, role, status, created_at')
        .eq('id', supaUser.id)
        .single();

      if (error || !data) {
        console.warn('Não foi possível carregar o perfil em public.profiles:', error);
        return { ok: false, transient: isTransientProfileError(status), status, fallbackProfile };
      }

      return {
        ok: true,
        profile: {
          uid: data.id,
          email: data.email,
          displayName: data.display_name || 'Estudante NexusMed',
          photoURL: data.avatar_url,
          role: data.role === 'admin' ? 'admin' : 'student',
          status: data.status === 'active' || data.status === 'blocked' ? data.status : 'pending',
          createdAt: data.created_at,
        },
      };
    } catch (err) {
      console.error('Erro ao sincronizar perfil do Supabase:', err);
      return { ok: false, transient: true, fallbackProfile };
    }
  }, []);

  const applySession = useCallback(
    async (supaUser: User | null) => {
      if (supaUser) {
        latestUserRef.current = supaUser;
        setUser(supaUser);
        setIsEmailVerified(Boolean(supaUser.email_confirmed_at));
        let result = await fetchProfile(supaUser);
        // 401 na leitura do perfil de quem já era ativo (P12a): o token pode
        // ter vencido sem a renovação automática ter rodado. Renova a sessão e
        // lê de novo antes de tratar como "aguardando aprovação"; se o 401
        // continuar, segue o caminho de sempre (fail-closed).
        if (
          !result.ok &&
          result.status === 401 &&
          activeProfileUidRef.current === supaUser.id &&
          !renewingSessionRef.current
        ) {
          renewingSessionRef.current = true;
          try {
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError) result = await fetchProfile(supaUser);
          } catch (err) {
            console.warn('Não foi possível renovar a sessão para reler o perfil:', err);
          } finally {
            renewingSessionRef.current = false;
          }
        }
        // Saiu, ou trocou de conta, enquanto o perfil era lido: esta resposta não vale mais.
        if (latestUserRef.current?.id !== supaUser.id) return;

        if (result.ok) {
          activeProfileUidRef.current = result.profile.status === 'active' ? supaUser.id : null;
          setProfileRefreshFailed(false);
          setProfileRetry(null);
          setProfile(result.profile);
          return;
        }

        // Falha de leitura. Falha momentânea tenta de novo sozinha (e quando a
        // rede volta); as demais não têm o que repetir.
        setProfileRetry(
          result.transient
            ? (prev) => ({ uid: supaUser.id, attempt: prev && prev.uid === supaUser.id ? prev.attempt + 1 : 0 })
            : null
        );
        if (result.transient && activeProfileUidRef.current === supaUser.id) {
          // Já foi lida como ativa nesta sessão: a tela mantém o que tinha e avisa.
          setProfileRefreshFailed(true);
          return;
        }
        // Nunca foi lida como ativa (ou o erro não é momentâneo): fail-closed.
        activeProfileUidRef.current = null;
        setProfileRefreshFailed(false);
        setProfile(result.fallbackProfile);
      } else {
        latestUserRef.current = null;
        activeProfileUidRef.current = null;
        StorageService.setActiveUser(null);
        setUser(null);
        setProfile(null);
        setIsEmailVerified(false);
        setProfileRefreshFailed(false);
        setProfileRetry(null);
        setPasswordRecovery(false);
      }
    },
    [fetchProfile]
  );

  // Nova tentativa de ler o perfil depois de uma falha momentânea: por tempo,
  // e na hora em que o navegador diz que a rede voltou.
  useEffect(() => {
    if (!profileRetry) return;
    const retryNow = () => {
      const current = latestUserRef.current;
      if (current && current.id === profileRetry.uid) void applySession(current);
    };
    const delay = PROFILE_RETRY_DELAYS_MS[Math.min(profileRetry.attempt, PROFILE_RETRY_DELAYS_MS.length - 1)];
    const timer = setTimeout(retryNow, delay);
    window.addEventListener('online', retryNow);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', retryNow);
    };
  }, [profileRetry, applySession]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const savedUserJson = localStorage.getItem('synapse_local_user');
      if (savedUserJson) {
        try {
          const parsed = JSON.parse(savedUserJson);
          setUser(parsed.user);
          setProfile(parsed.profile);
          setIsEmailVerified(true);
          StorageService.setActiveUser(parsed.user.id);
          setLoading(false);
          return;
        } catch {
          // ignore parsing error
        }
      }

      // Inicializa automaticamente com a conta de demonstração para que o preview funcione instantaneamente
      const defaultDemoUser = {
        id: 'local-demo-user',
        app_metadata: {},
        user_metadata: { display_name: 'Dr. Estudante NexusMed' },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email: 'estudante@synapsemed.com',
        email_confirmed_at: new Date().toISOString(),
      } as unknown as User;

      const defaultDemoProfile: UserProfile = {
        uid: 'local-demo-user',
        email: 'estudante@synapsemed.com',
        displayName: 'Dr. Estudante NexusMed',
        photoURL: null,
        role: 'student',
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      setUser(defaultDemoUser);
      setProfile(defaultDemoProfile);
      setIsEmailVerified(true);
      StorageService.setActiveUser(defaultDemoUser.id);
      localStorage.setItem(
        'synapse_local_user',
        JSON.stringify({ user: defaultDemoUser, profile: defaultDemoProfile })
      );

      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      try {
        if (session?.user) {
          await applySession(session.user);
        } else if (import.meta.env.DEV) {
          // Em ambiente de desenvolvimento / preview do AI Studio, caso não haja
          // sessão ativa no Supabase remoto, inicializa o usuário de demonstração
          // para que a interface completa do sistema seja renderizada no preview.
          const savedUserJson = localStorage.getItem('synapse_local_user');
          if (savedUserJson) {
            try {
              const parsed = JSON.parse(savedUserJson);
              setUser(parsed.user);
              setProfile(parsed.profile);
              setIsEmailVerified(true);
              StorageService.setActiveUser(parsed.user.id);
              return;
            } catch {
              // segue para fallback padrão de demonstração
            }
          }

          const defaultDemoUser = {
            id: 'local-demo-user',
            app_metadata: {},
            user_metadata: { display_name: 'Dr. Estudante NexusMed' },
            aud: 'authenticated',
            created_at: new Date().toISOString(),
            email: 'estudante@synapsemed.com',
            email_confirmed_at: new Date().toISOString(),
          } as unknown as User;

          const defaultDemoProfile: UserProfile = {
            uid: 'local-demo-user',
            email: 'estudante@synapsemed.com',
            displayName: 'Dr. Estudante NexusMed',
            photoURL: null,
            role: 'student',
            status: 'active',
            createdAt: new Date().toISOString(),
          };

          setUser(defaultDemoUser);
          setProfile(defaultDemoProfile);
          setIsEmailVerified(true);
          StorageService.setActiveUser(defaultDemoUser.id);
          localStorage.setItem(
            'synapse_local_user',
            JSON.stringify({ user: defaultDemoUser, profile: defaultDemoProfile })
          );
        } else {
          // Sem sessão: um link de recuperação que não valeu não deixa a tela de senha nova armada.
          await applySession(null);
        }
      } catch (err) {
        console.error('Erro ao processar sessão inicial:', err);
        setLoginError(getSupabaseAuthErrorMessage(err));
      } finally {
        if (mounted) setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
        if (session?.user) {
          await applySession(session.user);
        } else if (!import.meta.env.DEV) {
          await applySession(null);
        }
      } catch (err) {
        console.error('Erro ao processar alteração de autenticação:', err);
        setLoginError(getSupabaseAuthErrorMessage(err));
      } finally {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const loginWithDemo = async () => {
    setLoginError(null);
    const demoUser = {
      id: 'local-demo-user',
      app_metadata: {},
      user_metadata: { display_name: 'Dr. Estudante NexusMed' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email: 'estudante@synapsemed.com',
      email_confirmed_at: new Date().toISOString(),
    } as unknown as User;

    const demoProfile: UserProfile = {
      uid: 'local-demo-user',
      email: 'estudante@synapsemed.com',
      displayName: 'Dr. Estudante NexusMed',
      photoURL: null,
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem('synapse_local_user', JSON.stringify({ user: demoUser, profile: demoProfile }));
    StorageService.setActiveUser(demoUser.id);
    setUser(demoUser);
    setProfile(demoProfile);
    setIsEmailVerified(true);
  };

  const loginWithGoogle = async () => {
    setLoginError(null);
    if (!isSupabaseConfigured) {
      return loginWithDemo();
    }

    try {
      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

      if (isInIframe) {
        // No ambiente iframe (preview do AI Studio), Google OAuth bloqueia renderização
        // direta com X-Frame-Options: DENY. Solicitamos a URL e abrimos em nova janela/aba.
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.href,
            skipBrowserRedirect: true,
          },
        });

        if (error) throw error;

        if (data?.url) {
          const popup = window.open(data.url, '_blank');
          if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            throw new Error(
              'O navegador bloqueou a abertura da janela do Google. Permita pop-ups no navegador ou utilize o Acesso Imediato de Demonstração.'
            );
          }
          return;
        }
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.href,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error('Falha na autenticação com o Google:', err);
      setLoginError(getSupabaseAuthErrorMessage(err));
      throw err;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setLoginError(null);
    if (!isSupabaseConfigured) {
      const cleanEmail = email.trim() || 'estudante@synapsemed.com';
      const userId = 'local-' + (cleanEmail.replace(/[^a-zA-Z0-9]/g, '_') || 'user');
      const localUser = {
        id: userId,
        app_metadata: {},
        user_metadata: { display_name: cleanEmail.split('@')[0] || 'Estudante' },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email: cleanEmail,
        email_confirmed_at: new Date().toISOString(),
      } as unknown as User;

      const localProfile: UserProfile = {
        uid: userId,
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0] || 'Estudante NexusMed',
        photoURL: null,
        role: 'admin',
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem('synapse_local_user', JSON.stringify({ user: localUser, profile: localProfile }));
      StorageService.setActiveUser(userId);
      setUser(localUser);
      setProfile(localProfile);
      setIsEmailVerified(true);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (data.user) {
        await applySession(data.user);
      }
    } catch (err) {
      const ptMsg = getSupabaseAuthErrorMessage(err);
      setLoginError(ptMsg);
      throw new Error(ptMsg);
    }
  };

  const registerWithEmail = async (name: string, email: string, password: string) => {
    setLoginError(null);
    if (!isSupabaseConfigured) {
      const cleanEmail = email.trim() || 'estudante@synapsemed.com';
      const userId = 'local-' + (cleanEmail.replace(/[^a-zA-Z0-9]/g, '_') || 'user');
      const localUser = {
        id: userId,
        app_metadata: {},
        user_metadata: { display_name: name.trim() || 'Estudante' },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email: cleanEmail,
        email_confirmed_at: new Date().toISOString(),
      } as unknown as User;

      const localProfile: UserProfile = {
        uid: userId,
        email: cleanEmail,
        displayName: name.trim() || 'Estudante NexusMed',
        photoURL: null,
        role: 'admin',
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem('synapse_local_user', JSON.stringify({ user: localUser, profile: localProfile }));
      StorageService.setActiveUser(userId);
      setUser(localUser);
      setProfile(localProfile);
      setIsEmailVerified(true);
      return;
    }

    try {
      // O trigger public.handle_new_user cria a linha em public.profiles
      // automaticamente a partir de raw_user_meta_data.display_name.
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: name.trim() },
        },
      });
      if (error) throw error;
      if (data.user) {
        await applySession(data.user);
      }
    } catch (err) {
      const ptMsg = getSupabaseAuthErrorMessage(err);
      setLoginError(ptMsg);
      throw new Error(ptMsg);
    }
  };

  const sendPasswordReset = async (email: string) => {
    setLoginError(null);
    if (!isSupabaseConfigured) {
      setLoginError('O envio de recuperação de senha requer Supabase ativo.');
      return;
    }

    try {
      // O link do e-mail volta para a origem do site (já liberada no Supabase), onde o
      // evento PASSWORD_RECOVERY abre a tela de senha nova.
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
    } catch (err) {
      const ptMsg = getSupabaseAuthErrorMessage(err);
      setLoginError(ptMsg);
      throw new Error(ptMsg);
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    } catch (err) {
      throw new Error(getSupabaseAuthErrorMessage(err));
    }
  };

  const finishPasswordRecovery = () => setPasswordRecovery(false);

  const retryProfile = async () => {
    const current = latestUserRef.current;
    if (current) await applySession(current);
  };

  const sendVerificationEmail = async () => {
    if (!isSupabaseConfigured) {
      setIsEmailVerified(true);
      return;
    }
    if (!user?.email) {
      throw new Error('Nenhum usuário ativo para enviar e-mail de verificação.');
    }
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
      if (error) throw error;
    } catch (err) {
      const ptMsg = getSupabaseAuthErrorMessage(err);
      throw new Error(ptMsg);
    }
  };

  const reloadUser = async (): Promise<boolean> => {
    if (!isSupabaseConfigured) {
      setIsEmailVerified(true);
      return true;
    }
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return false;
      const verified = Boolean(data.user.email_confirmed_at);
      setIsEmailVerified(verified);
      setUser(data.user);
      return verified;
    } catch (err) {
      console.error('Erro ao recarregar status do usuário:', err);
      return false;
    }
  };

  // Encerra a sessão e apaga os dados locais de `uid` (45-F, AUD-27). `uid` vem de
  // quem chamou, lido ANTES do signOut: o evento SIGNED_OUT tira o usuário ativo
  // do armazenamento durante o próprio signOut, e a limpeza ficava sem saber de quem.
  const finishLogout = async (uid: string | null, discardUnsynced: boolean) => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      // Falha real ao encerrar sessão no Supabase não deve ficar escondida:
      // registra em loginError (exibido pela LoginView) em vez de um
      // catch {} silencioso. O estado local ainda é limpo abaixo — do ponto
      // de vista do usuário, "Sair da conta" sempre remove o acesso deste
      // dispositivo à interface, mesmo que a invalidação da sessão no
      // servidor não tenha sido confirmada.
      console.error('Erro ao encerrar sessão:', err);
      setLoginError(getSupabaseAuthErrorMessage(err));
    }
    StorageService.clearLocalDataOnLogout(uid, { discardUnsynced });
    latestUserRef.current = null;
    activeProfileUidRef.current = null;
    StorageService.setActiveUser(null);
    setUser(null);
    setProfile(null);
    setIsEmailVerified(false);
    setProfileRefreshFailed(false);
    setProfileRetry(null);
    setPasswordRecovery(false);
  };

  const logout = async () => {
    if (!isSupabaseConfigured) {
      localStorage.removeItem('synapse_local_user');
      StorageService.setActiveUser(null);
      setUser(null);
      setProfile(null);
      setIsEmailVerified(false);
      return;
    }
    const uid = StorageService.getActiveUser();
    const notSent = (id: string) => {
      const summary = getSummary(id);
      return summary.pending + summary.syncing + summary.failed;
    };
    if (uid && notSent(uid) > 0) {
      // Sincroniza primeiro: com rede, o que estava na fila sobe e a saída segue sem perguntar nada.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        flush(uid, true).catch(() => undefined),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, FLUSH_BEFORE_LOGOUT_MS);
        }),
      ]);
      clearTimeout(timer);
      const left = notSent(uid);
      if (left > 0) {
        // Não subiu: o que só existe neste aparelho não some sem a pessoa decidir.
        setUnsyncedPrompt({ uid, count: left });
        return;
      }
    }
    await finishLogout(uid, false);
  };

  const answerUnsyncedPrompt = async (choice: 'cancel' | 'keep' | 'discard') => {
    const prompt = unsyncedPrompt;
    setUnsyncedPrompt(null);
    if (!prompt || choice === 'cancel') return;
    await finishLogout(prompt.uid, choice === 'discard');
  };

  const clearError = () => setLoginError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        loginError,
        isConfigured: isSupabaseConfigured,
        isEmailVerified,
        profileRefreshFailed,
        passwordRecovery,
        loginWithGoogle,
        loginWithDemo,
        loginWithEmail,
        registerWithEmail,
        sendPasswordReset,
        updatePassword,
        finishPasswordRecovery,
        retryProfile,
        sendVerificationEmail,
        reloadUser,
        logout,
        clearError,
      }}
    >
      {children}
      {unsyncedPrompt && (
        <UnsyncedLogoutDialog
          count={unsyncedPrompt.count}
          onCancel={() => void answerUnsyncedPrompt('cancel')}
          onKeep={() => void answerUnsyncedPrompt('keep')}
          onDiscard={() => void answerUnsyncedPrompt('discard')}
        />
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
