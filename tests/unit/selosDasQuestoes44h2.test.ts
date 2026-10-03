import { beforeEach, describe, expect, it, vi } from 'vitest';

// 44-H2/44-H3 — o repositório dos selos das questões: os pedidos que chegam juntos viram UMA
// consulta, só dos ids pedidos (a API corta em 1000 linhas: "todos os selos" perderia os das
// questões além da milésima), em blocos de até 500 ids; guardado por pouco tempo; falha não
// fica guardada.

const rpc = vi.fn();
vi.mock('../../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

const carregar = async () => {
  vi.resetModules();
  return import('../../src/repositories/QuestionSealRepository');
};

const idsDe = (n: number, prefixo = 'q') => Array.from({ length: n }, (_, i) => `${prefixo}${i}`);
const argsDaChamada = (i: number) => (rpc.mock.calls[i][1] as { p_question_ids: string[] }).p_question_ids;

beforeEach(() => {
  rpc.mockReset();
  vi.useRealTimers();
});

describe('44-H3 — selos das questões', () => {
  it('cartões montados juntos viram uma consulta só, com os ids pedidos (e só eles)', async () => {
    rpc.mockResolvedValue({
      data: [
        { question_id: 'a', selo: 'ia' },
        { question_id: 'b', selo: 'ia_e_pessoa' },
        { question_id: 'c', selo: 'qualquer-outra-coisa' },
      ],
      error: null,
    });
    const { questionSealsRepository: repo } = await carregar();
    const [a, b, c, d, a2] = await Promise.all(['a', 'b', 'c', 'd', 'a'].map((id) => repo.getSeal(id)));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('selos_de_questoes', { p_question_ids: ['a', 'b', 'c', 'd'] });
    expect([a, b, c, d, a2]).toEqual(['ia', 'ia_e_pessoa', null, null, 'ia']);
  });

  it('mais de 500 questões na tela: várias consultas de até 500 ids, e NENHUMA pede "todas" (o corte de 1000 linhas da API não afeta)', async () => {
    rpc.mockImplementation(async (_fn: string, args: { p_question_ids: string[] }) => ({
      data: args.p_question_ids.map((id) => ({ question_id: id, selo: 'ia' })),
      error: null,
    }));
    const { questionSealsRepository: repo, IDS_POR_CONSULTA } = await carregar();
    const ids = idsDe(1300);
    const selos = await Promise.all(ids.map((id) => repo.getSeal(id)));
    expect(IDS_POR_CONSULTA).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(argsDaChamada(0)).toHaveLength(500);
    expect(argsDaChamada(1)).toHaveLength(500);
    expect(argsDaChamada(2)).toHaveLength(300);
    // Cada consulta devolve no máximo 500 linhas, bem abaixo do corte de 1000 da API; e todas as 1300 recebem o selo.
    expect(selos.every((s) => s === 'ia')).toBe(true);
    expect(new Set([...argsDaChamada(0), ...argsDaChamada(1), ...argsDaChamada(2)]).size).toBe(1300);
  });

  it('a consulta falhou: o erro sobe só para os cartões daquele bloco e a próxima tentativa consulta de novo', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'rede' } });
    rpc.mockResolvedValueOnce({ data: [{ question_id: 'a', selo: 'ia' }], error: null });
    const { questionSealsRepository: repo } = await carregar();
    await expect(repo.getSeal('a')).rejects.toBeTruthy();
    expect(await repo.getSeal('a')).toBe('ia');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('o que já foi consultado fica guardado por 2 minutos; depois consulta de novo (o selo pode ter mudado)', async () => {
    rpc.mockResolvedValue({ data: [{ question_id: 'a', selo: 'ia' }], error: null });
    const { questionSealsRepository: repo, VALIDADE_DO_SELO_MS } = await carregar();
    const agora = Date.now();
    const relogio = vi.spyOn(Date, 'now');
    relogio.mockReturnValue(agora);
    expect(await repo.getSeal('a')).toBe('ia');
    relogio.mockReturnValue(agora + 60_000);
    expect(await repo.getSeal('a')).toBe('ia');
    expect(rpc).toHaveBeenCalledTimes(1);
    relogio.mockReturnValue(agora + VALIDADE_DO_SELO_MS + 1_000);
    expect(await repo.getSeal('a')).toBe('ia');
    expect(rpc).toHaveBeenCalledTimes(2);
    relogio.mockRestore();
  });
});
