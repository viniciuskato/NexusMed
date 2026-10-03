import { describe, expect, it, vi } from 'vitest';

// 45-H (AUD-32.4): o envio pela fila do caderno de erros (`error_notebook_update`)
// também falha quando o UPDATE não atinge nenhuma linha — e a falha é
// permanente ("validation"), não uma nova tentativa sem fim.

let linhas: { id: string }[] = [];
const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();

vi.mock('../../src/services/syncQueue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/syncQueue')>()),
  registerHandler: (categoria: string, fn: (payload: unknown) => Promise<unknown>) => handlers.set(categoria, fn),
}));
vi.mock('../../src/repositories/SupabaseFlashcardsRepository', () => ({ supabaseFlashcardsRepository: {} }));
vi.mock('../../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => {
      const cadeia: Record<string, unknown> = {};
      cadeia.update = () => cadeia;
      cadeia.eq = () => cadeia;
      cadeia.select = () => Promise.resolve({ data: linhas, error: null });
      return cadeia;
    },
  },
}));

const payload = { errorItem: { id: 'e1', resolved: true, userNotes: 'n' } };

describe('error_notebook_update (fila)', () => {
  it('0 linhas atingidas: falha permanente; 1 linha: sucesso', async () => {
    const { registerSyncHandlers } = await import('../../src/services/syncHandlers');
    const { classifySyncError } = await import('../../src/services/syncQueue');
    registerSyncHandlers();
    const handler = handlers.get('error_notebook_update')!;

    linhas = [];
    const falha = await handler(payload).catch((e: unknown) => e);
    expect(falha).toBeInstanceOf(Error);
    expect(classifySyncError(falha)).toBe('validation');

    linhas = [{ id: 'e1' }];
    await expect(handler(payload)).resolves.toBeNull();
  });
});
