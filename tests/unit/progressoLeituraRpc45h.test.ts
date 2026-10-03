import { describe, expect, it, vi } from 'vitest';

// 45-H (AUD-31.3/AUD-06): o progresso de leitura só é gravado pela RPC
// `set_section_read` (que valida a seção e calcula o percentual no servidor);
// o repositório nunca faz INSERT/UPDATE direto em reading_progress.

const rpc = vi.fn();
const escritasDiretas: string[] = [];
let lidas: string[] = [];

vi.mock('../../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => {
      const cadeia: Record<string, unknown> = {};
      cadeia.select = () => cadeia;
      cadeia.eq = () => cadeia;
      cadeia.maybeSingle = async () => ({ data: { id: 'p1', read_section_ids: lidas }, error: null });
      cadeia.insert = () => {
        escritasDiretas.push('insert');
        return Promise.resolve({ error: null });
      };
      cadeia.update = () => {
        escritasDiretas.push('update');
        return cadeia;
      };
      return cadeia;
    },
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
  },
}));

describe('SupabaseReadingProgressRepository.toggleSectionRead', () => {
  it('marca pela RPC (estado desejado explícito) e devolve o percentual do servidor', async () => {
    rpc.mockResolvedValue({ data: { read_section_ids: ['s1'], percent: 50 }, error: null });
    lidas = [];
    const { supabaseReadingProgressRepository } = await import('../../src/repositories/SupabaseReadingProgressRepository');

    const percent = await supabaseReadingProgressRepository.toggleSectionRead('m1', 's1', 2);

    expect(rpc).toHaveBeenCalledWith('set_section_read', {
      p_material_id: 'm1',
      p_section_id: 's1',
      p_is_read: true,
      p_total_sections: 2,
    });
    expect(percent).toBe(50);
    expect(escritasDiretas).toEqual([]);
  });

  it('desmarca (seção já lida) pela RPC, sem escrita direta', async () => {
    rpc.mockResolvedValue({ data: { read_section_ids: [], percent: 0 }, error: null });
    lidas = ['s1'];
    const { supabaseReadingProgressRepository } = await import('../../src/repositories/SupabaseReadingProgressRepository');

    await supabaseReadingProgressRepository.toggleSectionRead('m1', 's1', 2);

    expect(rpc).toHaveBeenLastCalledWith('set_section_read', expect.objectContaining({ p_is_read: false }));
    expect(escritasDiretas).toEqual([]);
  });

  it('erro da RPC sobe', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'compêndio não encontrado' } });
    const { supabaseReadingProgressRepository } = await import('../../src/repositories/SupabaseReadingProgressRepository');
    await expect(supabaseReadingProgressRepository.toggleSectionRead('m1', 's1', 2)).rejects.toBeTruthy();
  });
});
