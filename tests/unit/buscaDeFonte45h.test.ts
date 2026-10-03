import { describe, expect, it, vi } from 'vitest';
import { filtroBuscaDeFonte } from '../../src/utils/buscaDeFonte';

// 45-H (AUD-32.3): a busca de fonte com parênteses monta o filtro com o valor
// entre aspas. Que o PostgREST de verdade ENCONTRA a fonte "Harrison (21ª ed.)":
// tests/e2e/specs/busca-fonte-45h.spec.ts (este arquivo só confere a forma do filtro).

describe('filtroBuscaDeFonte', () => {
  it('o texto com parênteses vai entre aspas, em cada uma das três condições', () => {
    expect(filtroBuscaDeFonte('Harrison (21ª ed.)')).toBe(
      'citation_text.ilike."%Harrison (21ª ed.)%",' +
        'identificadores->>doi.ilike."%Harrison (21ª ed.)%",' +
        'identificadores->>url.ilike."%Harrison (21ª ed.)%"'
    );
  });

  it('vírgula digitada faz parte do texto procurado, não separa condições', () => {
    expect(filtroBuscaDeFonte('Harrison, T.R.')).toContain('citation_text.ilike."%Harrison, T.R.%"');
  });

  it('aspas digitadas são escapadas e nunca fecham o valor', () => {
    expect(filtroBuscaDeFonte('a"b')).toContain('citation_text.ilike."%a\\"b%"');
  });

  it('curinga (%) e barra invertida digitados saem', () => {
    expect(filtroBuscaDeFonte('100% \\ certo')).toContain('citation_text.ilike."%100  certo%"');
  });
});

// A busca do repositório passa o filtro pronto ao `.or()`.
const or = vi.fn();
const chain: Record<string, unknown> = {};
for (const m of ['select', 'order', 'limit']) chain[m] = () => chain;
chain.or = (f: string) => {
  or(f);
  return Object.assign(Promise.resolve({ data: [], error: null }), chain);
};
vi.mock('../../src/lib/supabaseClient', () => ({
  supabase: { from: () => chain },
  isSupabaseConfigured: true,
}));

describe('ContentProvenanceRepository.searchSources', () => {
  it('usa o filtro entre aspas ("Harrison (21ª ed.)")', async () => {
    const { contentProvenanceRepository } = await import('../../src/repositories/ContentProvenanceRepository');
    await contentProvenanceRepository.searchSources('Harrison (21ª ed.)');
    expect(or).toHaveBeenCalledWith(filtroBuscaDeFonte('Harrison (21ª ed.)'));
  });
});
