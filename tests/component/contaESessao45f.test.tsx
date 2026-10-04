import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// 45-F — conta e sessão (AUD-01, AUD-26, AUD-27). AuthProvider real, com o
// Supabase (auth + leitura do perfil) e a fila de sincronização simulados.

type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'TOKEN_REFRESHED' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY';
type Listener = (event: AuthEvent, session: { user: { id: string; email: string; email_confirmed_at: string } } | null) => Promise<void> | void;

const USER = { id: 'user-a', email: 'a@exemplo.test', email_confirmed_at: '2026-01-01T00:00:00Z' };

type ProfileReply = { data: Record<string, unknown> | null; error: { message: string; code?: string } | null; status: number };

const h = vi.hoisted(() => ({
  listeners: [] as Listener[],
  profileReplies: [] as unknown[],
  profileCalls: 0,
  signOutCalls: 0,
  updateUserCalls: [] as unknown[],
  resetCalls: [] as unknown[],
  unsynced: 0,
  flushCalls: 0,
  flushClears: false,
}));

const profileRow = (status: string) => ({
  data: { id: 'user-a', email: 'a@exemplo.test', display_name: 'Ana', avatar_url: null, role: 'student', status, created_at: '2026-01-01' },
  error: null,
  status: 200,
});
const networkError = (): ProfileReply => ({ data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 });
const serverError = (): ProfileReply => ({ data: null, error: { message: 'Bad gateway', code: '' }, status: 503 });
const deniedError = (): ProfileReply => ({ data: null, error: { message: 'permission denied', code: '42501' }, status: 403 });

vi.mock('../../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: USER } } }),
      onAuthStateChange: (cb: Listener) => {
        h.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signOut: async () => {
        h.signOutCalls++;
        // supabase-js avisa os assinantes durante o próprio signOut.
        for (const l of h.listeners) await l('SIGNED_OUT', null);
        return { error: null };
      },
      updateUser: async (attrs: unknown) => {
        h.updateUserCalls.push(attrs);
        return { data: { user: USER }, error: null };
      },
      resetPasswordForEmail: async (...args: unknown[]) => {
        h.resetCalls.push(args);
        return { data: {}, error: null };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            h.profileCalls++;
            const next = h.profileReplies.shift() as ProfileReply | undefined;
            return next ?? profileRow('active');
          },
        }),
      }),
    }),
  },
}));

vi.mock('../../src/services/syncQueue', () => ({
  getOps: () =>
    Array.from({ length: h.unsynced }, (_, i) => ({ id: `op-${i}`, state: 'pending' })).concat(
      [{ id: 'old-1', state: 'synced' }, { id: 'old-2', state: 'synced' }]
    ),
  getSummary: () => ({ pending: h.unsynced, syncing: 0, failed: 0 }),
  flush: async () => {
    h.flushCalls++;
    if (h.flushClears) h.unsynced = 0;
  },
  onActiveUserChanged: () => undefined,
  syncQueueStorageKey: (uid: string) => `synapse_${uid}_sync_queue_v1`,
}));
vi.mock('../../src/services/legacyRecovery', () => ({ recoverLegacyLocalProgress: async () => undefined }));

const { AuthProvider, useAuth } = await import('../../src/contexts/AuthContext');
const { SetNewPasswordView } = await import('../../src/components/auth/SetNewPasswordView');

type AuthValue = ReturnType<typeof useAuth>;
let auth: AuthValue;
function Probe() {
  auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.profile ? auth.profile.status : 'sem-perfil'}</span>
      <span data-testid="aviso">{auth.profileRefreshFailed ? 'aviso' : 'sem-aviso'}</span>
      <span data-testid="recuperacao">{auth.passwordRecovery ? 'recuperando' : 'normal'}</span>
    </div>
  );
}

async function emit(event: AuthEvent) {
  await act(async () => {
    for (const l of h.listeners) await l(event, event === 'SIGNED_OUT' ? null : { user: USER });
  });
}

async function mountLoggedIn() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('active'));
}

beforeEach(() => {
  vi.stubEnv('DEV', false);
  localStorage.clear();
  h.listeners.length = 0;
  h.profileReplies.length = 0;
  h.profileCalls = 0;
  h.signOutCalls = 0;
  h.updateUserCalls.length = 0;
  h.resetCalls.length = 0;
  h.unsynced = 0;
  h.flushCalls = 0;
  h.flushClears = false;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('45-F item 1 — falha momentânea ao ler o perfil', () => {
  it('erro de rede com usuário já ativo: continua no app, com aviso, e não vira "pending"', async () => {
    await mountLoggedIn();
    h.profileReplies.push(networkError());
    await emit('TOKEN_REFRESHED');

    expect(screen.getByTestId('status').textContent).toBe('active');
    expect(screen.getByTestId('aviso').textContent).toBe('aviso');
  });

  it('erro 5xx com usuário já ativo: continua no app, com aviso', async () => {
    await mountLoggedIn();
    h.profileReplies.push(serverError());
    await emit('SIGNED_IN');

    expect(screen.getByTestId('status').textContent).toBe('active');
    expect(screen.getByTestId('aviso').textContent).toBe('aviso');
  });

  it('"Tentar agora" lê de novo e, lendo, tira o aviso', async () => {
    await mountLoggedIn();
    h.profileReplies.push(networkError());
    await emit('TOKEN_REFRESHED');
    expect(screen.getByTestId('aviso').textContent).toBe('aviso');

    await act(async () => {
      await auth.retryProfile();
    });

    expect(screen.getByTestId('status').textContent).toBe('active');
    expect(screen.getByTestId('aviso').textContent).toBe('sem-aviso');
  });

  it('tenta de novo sozinho, sem ninguém clicar', async () => {
    await mountLoggedIn();
    vi.useFakeTimers();
    h.profileReplies.push(networkError());
    await emit('TOKEN_REFRESHED');
    const callsAfterFailure = h.profileCalls;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(h.profileCalls).toBeGreaterThan(callsAfterFailure);
    expect(screen.getByTestId('aviso').textContent).toBe('sem-aviso');
    expect(screen.getByTestId('status').textContent).toBe('active');
  });

  it('perfil "pending" de verdade continua barrando, mesmo de quem era ativo (fail-closed)', async () => {
    await mountLoggedIn();
    h.profileReplies.push(profileRow('pending'));
    await emit('TOKEN_REFRESHED');
    expect(screen.getByTestId('status').textContent).toBe('pending');
    expect(screen.getByTestId('aviso').textContent).toBe('sem-aviso');
  });

  it('perfil "blocked" de verdade continua barrando', async () => {
    await mountLoggedIn();
    h.profileReplies.push(profileRow('blocked'));
    await emit('TOKEN_REFRESHED');
    expect(screen.getByTestId('status').textContent).toBe('blocked');
  });

  it('erro que não é de rede nem 5xx (ex.: permissão negada) não preserva o acesso: fail-closed', async () => {
    await mountLoggedIn();
    h.profileReplies.push(deniedError());
    await emit('TOKEN_REFRESHED');
    expect(screen.getByTestId('status').textContent).toBe('pending');
  });

  it('primeiro carregamento com erro nunca libera acesso (nunca foi carregado como ativo)', async () => {
    h.profileReplies.push(networkError());
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('pending'));
    expect(screen.getByTestId('status').textContent).not.toBe('active');
  });

  it('quem nunca foi carregado e vê "pending" por erro entra quando a leitura volta', async () => {
    h.profileReplies.push(networkError());
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('pending'));

    await act(async () => {
      await auth.retryProfile();
    });
    expect(screen.getByTestId('status').textContent).toBe('active');
  });

  it('sair e entrar de novo zera o "já foi ativo": o erro seguinte não libera outra sessão', async () => {
    await mountLoggedIn();
    await act(async () => {
      await auth.logout();
    });
    expect(screen.getByTestId('status').textContent).toBe('sem-perfil');

    h.profileReplies.push(networkError());
    await emit('SIGNED_IN');
    expect(screen.getByTestId('status').textContent).toBe('pending');
  });
});

describe('45-F item 2 — senha nova pelo link do e-mail', () => {
  it('"Esqueci a senha" pede o e-mail com retorno para a origem do site', async () => {
    await mountLoggedIn();
    await act(async () => {
      await auth.sendPasswordReset(' a@exemplo.test ');
    });
    expect(h.resetCalls).toEqual([['a@exemplo.test', { redirectTo: window.location.origin }]]);
  });

  it('o evento PASSWORD_RECOVERY liga o modo "definir senha nova"', async () => {
    await mountLoggedIn();
    expect(screen.getByTestId('recuperacao').textContent).toBe('normal');
    await emit('PASSWORD_RECOVERY');
    expect(screen.getByTestId('recuperacao').textContent).toBe('recuperando');
  });

  it('updatePassword grava a senha nova no Supabase', async () => {
    await mountLoggedIn();
    await emit('PASSWORD_RECOVERY');
    await act(async () => {
      await auth.updatePassword('senha-nova-123');
    });
    expect(h.updateUserCalls).toEqual([{ password: 'senha-nova-123' }]);
  });

  it('a tela "Definir senha nova" exige as duas senhas iguais e grava', async () => {
    render(
      <AuthProvider>
        <Probe />
        <SetNewPasswordView />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('active'));
    await emit('PASSWORD_RECOVERY');

    expect(screen.getByRole('heading', { name: 'Definir senha nova' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'senha-nova-123' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'outra-coisa-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
    expect(await screen.findByText('As duas senhas precisam ser iguais.')).toBeTruthy();
    expect(h.updateUserCalls).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'senha-nova-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
    expect(await screen.findByText('Senha atualizada')).toBeTruthy();
    expect(h.updateUserCalls).toEqual([{ password: 'senha-nova-123' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByTestId('recuperacao').textContent).toBe('normal'));
  });

  it('a tela recusa senha curta sem chamar o servidor', async () => {
    render(
      <AuthProvider>
        <Probe />
        <SetNewPasswordView />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('active'));
    await emit('PASSWORD_RECOVERY');
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
    expect(await screen.findByText('A senha precisa ter pelo menos 6 caracteres.')).toBeTruthy();
    expect(h.updateUserCalls).toHaveLength(0);
  });
});

describe('45-F item 3 — sair apaga os dados locais do usuário', () => {
  function seed() {
    localStorage.setItem('synapse_user-a_answers_v1', '[1]');
    localStorage.setItem('synapse_user-a_notes_v1', '{"n":"anotação"}');
    localStorage.setItem('synapse_user-a_simulados_v1', '[{"id":"s"}]');
    localStorage.setItem('synapse_user-a_sync_queue_v1', '[{"id":"old-1","state":"synced"}]');
    localStorage.setItem('synapse_user-a_simulado_draft_s1', '{"q1":"a"}');
    localStorage.setItem('synapse_user-b_answers_v1', '[2]');
  }

  it('sem nada pendente (só histórico já sincronizado), apaga respostas, anotações, simulados, rascunho e fila', async () => {
    await mountLoggedIn();
    seed();

    await act(async () => {
      await auth.logout();
    });

    expect(h.signOutCalls).toBe(1);
    expect(localStorage.getItem('synapse_user-a_answers_v1')).toBeNull();
    expect(localStorage.getItem('synapse_user-a_notes_v1')).toBeNull();
    expect(localStorage.getItem('synapse_user-a_simulados_v1')).toBeNull();
    expect(localStorage.getItem('synapse_user-a_simulado_draft_s1')).toBeNull();
    expect(localStorage.getItem('synapse_user-a_sync_queue_v1')).toBeNull();
    // dado de outra conta no mesmo navegador não é tocado
    expect(localStorage.getItem('synapse_user-b_answers_v1')).toBe('[2]');
  });

  it('com envio pendente, tenta enviar antes e, se enviou, sai e apaga sem perguntar', async () => {
    await mountLoggedIn();
    seed();
    h.unsynced = 2;
    h.flushClears = true;

    await act(async () => {
      await auth.logout();
    });

    expect(h.flushCalls).toBe(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.signOutCalls).toBe(1);
    expect(localStorage.getItem('synapse_user-a_answers_v1')).toBeNull();
  });

  it('com envio que não saiu, avisa e pergunta: não sai, não apaga nada', async () => {
    await mountLoggedIn();
    seed();
    h.unsynced = 2;

    await act(async () => {
      await auth.logout();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('2 alterações');
    expect(h.signOutCalls).toBe(0);
    expect(localStorage.getItem('synapse_user-a_answers_v1')).toBe('[1]');
    expect(localStorage.getItem('synapse_user-a_sync_queue_v1')).not.toBeNull();
    expect(screen.getByTestId('status').textContent).toBe('active');
  });

  it('"Voltar" fecha o aviso e continua na conta', async () => {
    await mountLoggedIn();
    seed();
    h.unsynced = 1;
    await act(async () => {
      await auth.logout();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.signOutCalls).toBe(0);
    expect(screen.getByTestId('status').textContent).toBe('active');
    expect(localStorage.getItem('synapse_user-a_answers_v1')).toBe('[1]');
  });

  it('"Sair e manter no aparelho" sai sem apagar o que não subiu', async () => {
    await mountLoggedIn();
    seed();
    h.unsynced = 1;
    await act(async () => {
      await auth.logout();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sair e manter no aparelho' }));

    await waitFor(() => expect(h.signOutCalls).toBe(1));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('sem-perfil'));
    expect(localStorage.getItem('synapse_user-a_answers_v1')).toBe('[1]');
    expect(localStorage.getItem('synapse_user-a_sync_queue_v1')).not.toBeNull();
  });

  it('"Sair e apagar" sai e apaga tudo do usuário, inclusive a fila', async () => {
    await mountLoggedIn();
    seed();
    h.unsynced = 1;
    await act(async () => {
      await auth.logout();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sair e apagar' }));

    await waitFor(() => expect(h.signOutCalls).toBe(1));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('sem-perfil'));
    expect(localStorage.getItem('synapse_user-a_answers_v1')).toBeNull();
    expect(localStorage.getItem('synapse_user-a_sync_queue_v1')).toBeNull();
    expect(localStorage.getItem('synapse_user-b_answers_v1')).toBe('[2]');
  });
});
