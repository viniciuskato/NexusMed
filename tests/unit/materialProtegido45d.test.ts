import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 45-D — repositórios e scripts:
// - associar referência a fonte curada sem URL mantém a URL original, mas não
//   a herdada de outra fonte (AUD-24, revisão do a4af38c item 1);
// - a anotação de seção removida não sobrescreve a do material, é lida à
//   parte, em ordem de criação, e erro de leitura fica registrado;
// - exclusão recusada pelo banco não some da cópia local;
// - limpeza de script com service_role usa o caminho de manutenção e não
//   engole erro.

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../../src/lib/supabaseClient');
  vi.doUnmock('../../src/repositories/SupabaseMaterialsRepository');
  vi.doUnmock('../../src/repositories/SupabaseNotesRepository');
  vi.doUnmock('../../src/services/storage');
  vi.restoreAllMocks();
});

type Filter = [string, string, unknown];
interface Call {
  table: string;
  op: string;
  arg?: unknown;
  filters: Filter[];
}

/**
 * Cliente Supabase falso: registra cada consulta e responde por tabela.
 * `rows[table]` é o que `select` devolve (lista, ou o primeiro em `maybeSingle`).
 */
function fakeSupabase(rows: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: '', filters: [] };
    calls.push(call);
    const result = () => ({ data: rows[table] ?? [], error: null });
    const builder = {
      update(arg: unknown) {
        call.op = 'update';
        call.arg = arg;
        return builder;
      },
      select(arg: unknown) {
        call.op = 'select';
        call.arg = arg;
        return builder;
      },
      eq(col: string, val: unknown) {
        call.filters.push(['eq', col, val]);
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        call.filters.push(['not', col, `${op}:${String(val)}`]);
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        call.filters.push(['order', col, opts?.ascending ?? true]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null });
      },
      then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(result()).then(resolve);
      },
    };
    return builder;
  };
  return { client: { from }, calls };
}

async function repoCom(rows: Record<string, unknown[]>) {
  const fake = fakeSupabase(rows);
  vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: fake.client }));
  const { SupabaseMaterialsRepository } = await import('../../src/repositories/SupabaseMaterialsRepository');
  return { repo: new SupabaseMaterialsRepository(), calls: fake.calls };
}

const update = (calls: Call[]) => calls.find((c) => c.op === 'update')?.arg;

describe('updateMaterialReferenceSource (AUD-24)', () => {
  it('fonte sem URL mantém a URL original da referência', async () => {
    const { repo, calls } = await repoCom({ material_references: [{ source_id: null, url: 'https://original.org' }] });
    await repo.updateMaterialReferenceSource('ref-1', 'fonte-b', null);
    expect(update(calls)).toEqual({ source_id: 'fonte-b' });
  });

  it('reassociar a fonte sem URL tira a URL herdada da fonte anterior', async () => {
    const { repo, calls } = await repoCom({
      material_references: [{ source_id: 'fonte-a', url: 'https://a.org/' }],
      sources: [{ identificadores: { url: 'https://a.org/' } }],
    });
    await repo.updateMaterialReferenceSource('ref-1', 'fonte-b', null);
    expect(update(calls)).toEqual({ source_id: 'fonte-b', url: null });
  });

  it('reassociar mantém a URL que não veio da fonte anterior', async () => {
    const { repo, calls } = await repoCom({
      material_references: [{ source_id: 'fonte-a', url: 'https://original.org' }],
      sources: [{ identificadores: { doi: '10.1/x' } }],
    });
    await repo.updateMaterialReferenceSource('ref-1', 'fonte-b', null);
    expect(update(calls)).toEqual({ source_id: 'fonte-b' });
  });

  it('com URL da fonte, grava a URL junto', async () => {
    const { repo, calls } = await repoCom({ material_references: [{ source_id: null, url: null }] });
    await repo.updateMaterialReferenceSource('ref-1', 'fonte-1', 'https://exemplo.org');
    expect(update(calls)).toEqual({ source_id: 'fonte-1', url: 'https://exemplo.org' });
  });
});

describe('SupabaseNotesRepository — anotação de seção removida', () => {
  const rows = [
    { material_id: 'mat-1', material_section_id: null, question_id: null, flashcard_id: null, note_text: 'nota do material', updated_at: 't1', removed_section_title: null },
    { material_id: 'mat-1', material_section_id: null, question_id: null, flashcard_id: null, note_text: 'nota da seção', updated_at: 't2', removed_section_title: 'Seção que saiu' },
  ];

  it('getNotes não deixa a da seção removida sobrescrever a do material', async () => {
    const { client } = fakeSupabase({ notes: rows });
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: client }));
    vi.doMock('../../src/services/storage', () => ({ StorageService: { setNoteBaseVersion: vi.fn() } }));
    const { SupabaseNotesRepository } = await import('../../src/repositories/SupabaseNotesRepository');

    expect(await new SupabaseNotesRepository().getNotes()).toEqual({ 'mat-1': 'nota do material' });
  });

  it('getRemovedSectionNotes agrupa por material, com o título da seção, em ordem de criação', async () => {
    const { client, calls } = fakeSupabase({
      notes: [
        { material_id: 'mat-1', note_text: 'primeira', removed_section_title: 'A' },
        { material_id: 'mat-1', note_text: 'segunda', removed_section_title: 'B' },
        { material_id: 'mat-2', note_text: 'outra', removed_section_title: 'C' },
      ],
    });
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: client }));
    const { SupabaseNotesRepository } = await import('../../src/repositories/SupabaseNotesRepository');

    const result = await new SupabaseNotesRepository().getRemovedSectionNotes();

    expect(result).toEqual({
      'mat-1': [
        { sectionTitle: 'A', noteText: 'primeira' },
        { sectionTitle: 'B', noteText: 'segunda' },
      ],
      'mat-2': [{ sectionTitle: 'C', noteText: 'outra' }],
    });
    expect(calls[0].filters).toContainEqual(['not', 'removed_section_title', 'is:null']);
    expect(calls[0].filters).toContainEqual(['order', 'created_at', true]);
  });

  // 45-G (D-2): a falha sobe para a tela, que avisa "sem conexão" — antes,
  // era registrada no console e a leitura devolvia {} ("nenhuma anotação de
  // seção removida"), o que a tela não tinha como distinguir de verdade.
  it('erro ao ler as de seção removida é propagado, sem {} silencioso', async () => {
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));
    vi.doMock('../../src/repositories/SupabaseNotesRepository', () => ({
      SupabaseNotesRepository: vi.fn().mockImplementation(() => ({
        getRemovedSectionNotes: vi.fn().mockRejectedValue(new Error('column notes.removed_section_title does not exist')),
      })),
    }));
    const { notesRepository } = await import('../../src/repositories/NotesRepository');

    await expect(notesRepository.getRemovedSectionNotes()).rejects.toThrow('removed_section_title');
  });
});

describe('ResilientMaterialsRepository.deleteCompendium', () => {
  it('exclusão recusada pelo banco não apaga a cópia local', async () => {
    const localDelete = vi.fn();
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));
    vi.doMock('../../src/repositories/SupabaseMaterialsRepository', () => ({
      SupabaseMaterialsRepository: vi.fn().mockImplementation(() => ({
        deleteCompendium: vi.fn().mockRejectedValue(new Error('material publicado não pode ser excluído.')),
      })),
    }));
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { deleteCompendium: localDelete, getCompendiums: () => [], saveCompendiums: () => {} },
    }));
    const { materialsRepository } = await import('../../src/repositories/MaterialsRepository');

    await expect(materialsRepository.deleteCompendium('mat-1')).rejects.toThrow('publicado');
    expect(localDelete).not.toHaveBeenCalled();
  });
});

describe('scripts — limpeza de material semeado (revisão do a4af38c, item 3)', () => {
  it('usa o caminho de manutenção e devolve o erro em vez de engoli-lo', async () => {
    const { deleteSeededMaterial } = await import('../../scripts/maintenance');
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(deleteSeededMaterial({ rpc }, 'mat-1')).rejects.toThrow('permission denied');
    expect(rpc).toHaveBeenCalledWith('delete_material_maintenance', { p_material_id: 'mat-1' });
  });

  it('sem erro, conclui', async () => {
    const { deleteSeededMaterial } = await import('../../scripts/maintenance');
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await expect(deleteSeededMaterial({ rpc }, 'mat-1')).resolves.toBeUndefined();
  });
});
