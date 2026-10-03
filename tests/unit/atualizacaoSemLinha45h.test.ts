import { beforeEach, describe, expect, it, vi } from 'vitest';

// 45-H (AUD-32.4): atualização que não atinge nenhuma linha é erro — antes, o
// PostgREST devolvia sucesso com 0 linhas (linha inexistente, ou negada pela
// RLS) e o admin/estudante via "salvo".

// Resultado de cada `.update(...).eq(...).select(...)`, por tabela.
const linhasAtingidas: Record<string, { id: string }[]> = {};
const chamadas: { tabela: string; select: boolean }[] = [];

function tabela(nome: string) {
  const registro = { tabela: nome, select: false };
  chamadas.push(registro);
  const cadeia: Record<string, unknown> = {};
  cadeia.update = () => cadeia;
  cadeia.eq = () => cadeia;
  cadeia.select = () => {
    registro.select = true;
    return cadeia;
  };
  cadeia.maybeSingle = async () => ({ data: null, error: null });
  cadeia.single = async () => ({
    data: { title: 'a', mechanism_tag: null, content: 'x', key_takeaways: [], clinical_pearl: null, warning_alert: null },
    error: null,
  });
  cadeia.insert = async () => ({ error: null });
  // `await` na cadeia: sem `.select()` o PostgREST devolve data null; com ele, as linhas.
  cadeia.then = (resolve: (v: unknown) => void) =>
    resolve({ data: registro.select ? (linhasAtingidas[nome] ?? []) : null, error: null });
  return cadeia;
}

vi.mock('../../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (nome: string) => tabela(nome),
    auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
    rpc: async () => ({ data: null, error: null }),
  },
}));

beforeEach(() => {
  for (const k of Object.keys(linhasAtingidas)) delete linhasAtingidas[k];
  chamadas.length = 0;
});

const NENHUMA = /não encontrada/;

describe('atualização que não atinge linha', () => {
  it('caderno de erros (repositório): 0 linhas vira erro; 1 linha é sucesso', async () => {
    const { supabaseErrorNotebookRepository } = await import('../../src/repositories/SupabaseErrorNotebookRepository');
    const item = { id: 'e1', resolved: true, userNotes: 'n' } as never;
    linhasAtingidas['error_notebook'] = [];
    await expect(supabaseErrorNotebookRepository.updateErrorLog(item)).rejects.toThrow(NENHUMA);
    linhasAtingidas['error_notebook'] = [{ id: 'e1' }];
    await expect(supabaseErrorNotebookRepository.updateErrorLog(item)).resolves.toBeUndefined();
  });

  it('vínculo de fonte da referência do material: 0 linhas vira erro; 1 linha é sucesso', async () => {
    const { supabaseMaterialsRepository } = await import('../../src/repositories/SupabaseMaterialsRepository');
    linhasAtingidas['material_references'] = [];
    await expect(supabaseMaterialsRepository.updateMaterialReferenceSource('r1', 's1', 'https://x.org')).rejects.toThrow(NENHUMA);
    linhasAtingidas['material_references'] = [{ id: 'r1' }];
    await expect(supabaseMaterialsRepository.updateMaterialReferenceSource('r1', 's1', 'https://x.org')).resolves.toBeUndefined();
  });

  it('edição de seção do material: 0 linhas vira erro; 1 linha é sucesso', async () => {
    const { supabaseMaterialsRepository } = await import('../../src/repositories/SupabaseMaterialsRepository');
    linhasAtingidas['material_sections'] = [];
    await expect(supabaseMaterialsRepository.updateSectionContent('s1', { content: 'novo' })).rejects.toThrow(NENHUMA);
    linhasAtingidas['material_sections'] = [{ id: 's1' }];
    await expect(supabaseMaterialsRepository.updateSectionContent('s1', { content: 'novo' })).resolves.toBeUndefined();
  });

  it('despublicar questão: 0 linhas vira erro; 1 linha é sucesso', async () => {
    const { supabaseQuestionsRepository } = await import('../../src/repositories/SupabaseQuestionsRepository');
    linhasAtingidas['questions'] = [];
    await expect(supabaseQuestionsRepository.unpublishQuestion('q1')).rejects.toThrow(NENHUMA);
    linhasAtingidas['questions'] = [{ id: 'q1' }];
    await expect(supabaseQuestionsRepository.unpublishQuestion('q1')).resolves.toBeUndefined();
  });

  it('decisão sobre afirmação da revisão: 0 linhas vira erro; 1 linha é sucesso', async () => {
    const { contentProvenanceRepository } = await import('../../src/repositories/ContentProvenanceRepository');
    linhasAtingidas['claims'] = [];
    await expect(contentProvenanceRepository.decideClaim('c1', 'aprovada' as never)).rejects.toThrow(NENHUMA);
    linhasAtingidas['claims'] = [{ id: 'c1' }];
    await expect(contentProvenanceRepository.decideClaim('c1', 'aprovada' as never)).resolves.toBeUndefined();
  });
});
