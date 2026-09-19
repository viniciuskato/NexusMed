import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { UserProfile } from '../types';
import { StorageService } from '../services/storage';
import { getSupabaseAuthErrorMessage } from '../utils/supabaseAuthErrors';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginError: string | null;
  isConfigured: boolean;
  isEmailVerified: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithDemo: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean>(false);

  // Busca o perfil em public.profiles (criado pelo trigger handle_new_user no signup)
  const fetchProfile = useCallback(async (supaUser: User): Promise<UserProfile> => {
    StorageService.setActiveUser(supaUser.id);

    const fallbackProfile: UserProfile = {
      uid: supaUser.id,
      email: supaUser.email || null,
      displayName: supaUser.user_metadata?.display_name || 'Estudante NexusMed',
      photoURL: supaUser.user_metadata?.avatar_url || null,
      role: 'student',
      plan: 'free',
      status: 'pending',
    };

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, avatar_url, role, status, created_at')
        .eq('id', supaUser.id)
        .single();

      if (error || !data) {
        console.warn('Não foi possível carregar o perfil em public.profiles:', error);
        return fallbackProfile;
      }

      return {
        uid: data.id,
        email: data.email,
        displayName: data.display_name || 'Estudante NexusMed',
        photoURL: data.avatar_url,
        // plan ainda não existe em public.profiles (fora do escopo desta etapa) — mantido 'free'.
        role: data.role === 'admin' ? 'admin' : 'student',
        plan: 'free',
        status: data.status === 'active' || data.status === 'blocked' ? data.status : 'pending',
        createdAt: data.created_at,
      };
    } catch (err) {
      console.error('Erro ao sincronizar perfil do Supabase:', err);
      return fallbackProfile;
    }
  }, []);

  const applySession = useCallback(
    async (supaUser: User | null) => {
      if (supaUser) {
        setUser(supaUser);
        setIsEmailVerified(Boolean(supaUser.email_confirmed_at));
        const nextProfile = await fetchProfile(supaUser);
        setProfile(nextProfile);
      } else {
        StorageService.setActiveUser(null);
        setUser(null);
        setProfile(null);
        setIsEmailVerified(false);
      }
    },
    [fetchProfile]
  );

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
        plan: 'free',
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
            plan: 'free',
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
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
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
      plan: 'premium',
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
        plan: 'premium',
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
        plan: 'premium',
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
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
    } catch (err) {
      const ptMsg = getSupabaseAuthErrorMessage(err);
      setLoginError(ptMsg);
      throw new Error(ptMsg);
    }
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

  const logout = async () => {
    if (!isSupabaseConfigured) {
      localStorage.removeItem('synapse_local_user');
      StorageService.setActiveUser(null);
      setUser(null);
      setProfile(null);
      setIsEmailVerified(false);
      return;
    }
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
    StorageService.clearLocalDataOnLogout(StorageService.getActiveUser());
    StorageService.setActiveUser(null);
    setUser(null);
    setProfile(null);
    setIsEmailVerified(false);
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
        loginWithGoogle,
        loginWithDemo,
        loginWithEmail,
        registerWithEmail,
        sendPasswordReset,
        sendVerificationEmail,
        reloadUser,
        logout,
        clearError,
      }}
    >
      {children}
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
