import { beforeEach, describe, expect, it, vi } from 'vitest';

// 44-H2 — o repositório dos selos das questões: UMA consulta traz o selo de todas (a lista
// tem centenas de cartões), guardada por pouco tempo; falha não fica guardada.

const rpc = vi.fn();
vi.mock('../../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

const carregar = async () => {
  vi.resetModules();
  return (await import('../../src/repositories/QuestionSealRepository')).questionSealsRepository;
};

beforeEach(() => {
  rpc.mockReset();
  vi.useRealTimers();
});

describe('44-H2 — selos das questões', () => {
  it('uma consulta só atende todos os cartões, e traz só os selos que o banco conhece', async () => {
    rpc.mockResolvedValue({
      data: [
        { question_id: 'a', selo: 'ia' },
        { question_id: 'b', selo: 'ia_e_pessoa' },
        { question_id: 'c', selo: 'qualquer-outra-coisa' },
      ],
      error: null,
    });
    const repo = await carregar();
    const [x, y, z] = await Promise.all([repo.getSeals(), repo.getSeals(), repo.getSeals()]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('selos_de_questoes');
    expect(x).toBe(y);
    expect(y).toBe(z);
    expect(x.get('a')).toBe('ia');
    expect(x.get('b')).toBe('ia_e_pessoa');
    expect(x.has('c')).toBe(false);
  });

  it('a consulta falhou: o erro sobe e a próxima tentativa consulta de novo', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'rede' } });
    rpc.mockResolvedValueOnce({ data: [{ question_id: 'a', selo: 'ia' }], error: null });
    const repo = await carregar();
    await expect(repo.getSeals()).rejects.toBeTruthy();
    const mapa = await repo.getSeals();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(mapa.get('a')).toBe('ia');
  });

  it('passados 2 minutos, consulta de novo (o selo pode ter mudado)', async () => {
    vi.useFakeTimers();
    rpc.mockResolvedValue({ data: [], error: null });
    const repo = await carregar();
    await repo.getSeals();
    vi.advanceTimersByTime(60_000);
    await repo.getSeals();
    expect(rpc).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    await repo.getSeals();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
