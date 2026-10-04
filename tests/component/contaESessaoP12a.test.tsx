import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// P12a — dois ajustes de conta apontados nas revisões da 45-F:
//  (3) o modo "Definir senha nova" não liga por `?type=recovery&code=...` sem
//      sessão de recuperação (só pelo evento PASSWORD_RECOVERY ou pelo hash
//      `#access_token=...&type=recovery`, do fluxo implicit);
//  (4) 401 na leitura do perfil de quem já era ativo renova a sessão e lê de
//      novo antes de cair em "aguardando aprovação".

type AuthEvent = 'TOKEN_REFRESHED' | 'SIGNED_IN' | 'PASSWORD_RECOVERY';
type Listener = (event: AuthEvent, session: { user: typeof USER } | null) => Promise<void> | void;
type ProfileReply = { data: Record<string, unknown> | null; error: { message: string; code?: string } | null; status: number };

const USER = { id: 'user-a', email: 'a@exemplo.test', email_confirmed_at: '2026-01-01T00:00:00Z' };

const h = vi.hoisted(() => ({
  listeners: [] as Listener[],
  hasSession: true,
  profileReplies: [] as unknown[],
  profileCalls: 0,
  refreshCalls: 0,
  refreshError: null as null | { message: string },
}));

const profileRow = (status: string): ProfileReply => ({
  data: { id: 'user-a', email: 'a@exemplo.test', display_name: 'Ana', avatar_url: null, role: 'student', status, created_at: '2026-01-01' },
  error: null,
  status: 200,
});
const unauthorized = (): ProfileReply => ({ data: null, error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 });

vi.mock('../../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: h.hasSession ? { user: USER } : null } }),
      onAuthStateChange: (cb: Listener) => {
        h.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      refreshSession: async () => {
        h.refreshCalls++;
        if (h.refreshError) return { data: { session: null }, error: h.refreshError };
        // supabase-js avisa os assinantes durante a própria renovação.
        for (const l of h.listeners) await l('TOKEN_REFRESHED', { user: USER });
        return { data: { session: { user: USER } }, error: null };
      },
      signOut: async () => ({ error: null }),
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
  getOps: () => [],
  getSummary: () => ({ pending: 0, syncing: 0, failed: 0 }),
  flush: async () => undefined,
  onActiveUserChanged: () => undefined,
  syncQueueStorageKey: (uid: string) => `synapse_${uid}_sync_queue_v1`,
}));
vi.mock('../../src/services/legacyRecovery', () => ({ recoverLegacyLocalProgress: async () => undefined }));

// O AuthContext lê a URL na carga do módulo: cada cenário o importa de novo.
async function loadAuth() {
  vi.resetModules();
  return import('../../src/contexts/AuthContext');
}

type Mod = Awaited<ReturnType<typeof loadAuth>>;
let auth: ReturnType<Mod['useAuth']>;

function mount(mod: Mod) {
  function Probe() {
    auth = mod.useAuth();
    return (
      <div>
        <span data-testid="status">{auth.profile ? auth.profile.status : 'sem-perfil'}</span>
        <span data-testid="aviso">{auth.profileRefreshFailed ? 'aviso' : 'sem-aviso'}</span>
        <span data-testid="recuperacao">{auth.passwordRecovery ? 'recuperando' : 'normal'}</span>
      </div>
    );
  }
  render(
    <mod.AuthProvider>
      <Probe />
    </mod.AuthProvider>
  );
}

async function mountLoggedIn() {
  const mod = await loadAuth();
  mount(mod);
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('active'));
}

async function emit(event: AuthEvent) {
  await act(async () => {
    for (const l of h.listeners) await l(event, { user: USER });
  });
}

beforeEach(() => {
  vi.stubEnv('DEV', false);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  h.listeners.length = 0;
  h.hasSession = true;
  h.profileReplies.length = 0;
  h.profileCalls = 0;
  h.refreshCalls = 0;
  h.refreshError = null;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('P12a item 3 — senha nova só com sessão de recuperação', () => {
  it('?type=recovery&code=... sem sessão de recuperação não liga o modo "definir senha nova"', async () => {
    window.history.replaceState(null, '', '/?type=recovery&code=abc123');
    await mountLoggedIn();
    expect(screen.getByTestId('recuperacao').textContent).toBe('normal');
  });

  it('?type=recovery&token_hash=... também não liga', async () => {
    window.history.replaceState(null, '', '/?type=recovery&token_hash=abc123');
    await mountLoggedIn();
    expect(screen.getByTestId('recuperacao').textContent).toBe('normal');
  });

  it('o hash do fluxo implicit (#access_token=...&type=recovery) liga o modo', async () => {
    window.history.replaceState(null, '', '/#access_token=eyJabc&refresh_token=r&type=recovery');
    await mountLoggedIn();
    expect(screen.getByTestId('recuperacao').textContent).toBe('recuperando');
  });

  it('hash com type=recovery mas sem access_token não liga', async () => {
    window.history.replaceState(null, '', '/#type=recovery');
    await mountLoggedIn();
    expect(screen.getByTestId('recuperacao').textContent).toBe('normal');
  });

  it('o evento PASSWORD_RECOVERY continua ligando o modo (fluxo com code, depois da troca pela sessão)', async () => {
    window.history.replaceState(null, '', '/?type=recovery&code=abc123');
    await mountLoggedIn();
    await emit('PASSWORD_RECOVERY');
    expect(screen.getByTestId('recuperacao').textContent).toBe('recuperando');
  });
});

describe('P12a item 4 — 401 ao ler o perfil de quem já era ativo', () => {
  it('renova a sessão, lê de novo e segue ativo, sem passar por "aguardando aprovação"', async () => {
    await mountLoggedIn();
    const callsBefore = h.profileCalls;
    h.profileReplies.push(unauthorized(), profileRow('active'));

    await emit('SIGNED_IN');

    expect(h.refreshCalls).toBe(1);
    expect(h.profileCalls).toBeGreaterThanOrEqual(callsBefore + 2);
    expect(screen.getByTestId('status').textContent).toBe('active');
    expect(screen.getByTestId('aviso').textContent).toBe('sem-aviso');
  });

  it('se o 401 continua depois de renovar, é o comportamento de hoje (pending, uma única renovação)', async () => {
    await mountLoggedIn();
    h.profileReplies.push(unauthorized(), unauthorized(), unauthorized(), unauthorized());

    await emit('SIGNED_IN');

    expect(h.refreshCalls).toBe(1);
    expect(screen.getByTestId('status').textContent).toBe('pending');
  });

  it('se a renovação falha, não lê de novo: comportamento de hoje (pending)', async () => {
    await mountLoggedIn();
    h.refreshError = { message: 'refresh token inválido' };
    h.profileReplies.push(unauthorized());
    const callsBefore = h.profileCalls;

    await emit('SIGNED_IN');

    expect(h.refreshCalls).toBe(1);
    expect(h.profileCalls).toBe(callsBefore + 1);
    expect(screen.getByTestId('status').textContent).toBe('pending');
  });

  it('quem nunca foi lido como ativo não ganha renovação: 401 no primeiro carregamento segue barrando', async () => {
    h.profileReplies.push(unauthorized());
    const mod = await loadAuth();
    mount(mod);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('pending'));
    expect(h.refreshCalls).toBe(0);
  });

  it('erro de permissão (403) de quem já era ativo continua sem renovar: fail-closed', async () => {
    await mountLoggedIn();
    h.profileReplies.push({ data: null, error: { message: 'permission denied', code: '42501' }, status: 403 });

    await emit('SIGNED_IN');

    expect(h.refreshCalls).toBe(0);
    expect(screen.getByTestId('status').textContent).toBe('pending');
  });
});
