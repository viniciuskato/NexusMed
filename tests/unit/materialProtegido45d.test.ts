import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 45-D — repositórios:
// - associar referência a fonte curada sem URL mantém a URL original (AUD-24);
// - a anotação de seção removida não sobrescreve a anotação do material e é
//   lida à parte;
// - exclusão recusada pelo banco não some da cópia local.

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../../src/lib/supabaseClient');
  vi.doUnmock('../../src/repositories/SupabaseMaterialsRepository');
  vi.doUnmock('../../src/services/storage');
});

/** Cliente Supabase falso que registra `update`/`select` e devolve `rows`. */
function fakeSupabase(rows: unknown[] = []) {
  const calls: { table: string; op: string; arg?: unknown; filters: Array<[string, string, unknown]> }[] = [];
  const from = (table: string) => {
    const call = { table, op: '', arg: undefined as unknown, filters: [] as Array<[string, string, unknown]> };
    calls.push(call);
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
      then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return builder;
  };
  return { client: { from }, calls };
}

describe('updateMaterialReferenceSource (AUD-24)', () => {
  it('associar a fonte curada sem URL não apaga a URL da referência', async () => {
    const { client, calls } = fakeSupabase();
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: client }));
    const { SupabaseMaterialsRepository } = await import('../../src/repositories/SupabaseMaterialsRepository');

    await new SupabaseMaterialsRepository().updateMaterialReferenceSource('ref-1', 'fonte-1', null);

    expect(calls[0].op).toBe('update');
    expect(calls[0].arg).toEqual({ source_id: 'fonte-1' });
  });

  it('com URL da fonte, grava a URL junto', async () => {
    const { client, calls } = fakeSupabase();
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: client }));
    const { SupabaseMaterialsRepository } = await import('../../src/repositories/SupabaseMaterialsRepository');

    await new SupabaseMaterialsRepository().updateMaterialReferenceSource('ref-1', 'fonte-1', 'https://exemplo.org');

    expect(calls[0].arg).toEqual({ source_id: 'fonte-1', url: 'https://exemplo.org' });
  });
});

describe('SupabaseNotesRepository — anotação de seção removida', () => {
  const rows = [
    { material_id: 'mat-1', material_section_id: null, question_id: null, flashcard_id: null, note_text: 'nota do material', updated_at: 't1', removed_section_title: null },
    { material_id: 'mat-1', material_section_id: null, question_id: null, flashcard_id: null, note_text: 'nota da seção', updated_at: 't2', removed_section_title: 'Seção que saiu' },
  ];

  it('getNotes não deixa a da seção removida sobrescrever a do material', async () => {
    const { client } = fakeSupabase(rows);
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: client }));
    vi.doMock('../../src/services/storage', () => ({ StorageService: { setNoteBaseVersion: vi.fn() } }));
    const { SupabaseNotesRepository } = await import('../../src/repositories/SupabaseNotesRepository');

    expect(await new SupabaseNotesRepository().getNotes()).toEqual({ 'mat-1': 'nota do material' });
  });

  it('getRemovedSectionNotes devolve as do material, com o título da seção', async () => {
    const { client, calls } = fakeSupabase([rows[1]]);
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: client }));
    const { SupabaseNotesRepository } = await import('../../src/repositories/SupabaseNotesRepository');

    const result = await new SupabaseNotesRepository().getRemovedSectionNotes('mat-1');

    expect(result).toEqual([{ sectionTitle: 'Seção que saiu', noteText: 'nota da seção' }]);
    expect(calls[0].filters).toContainEqual(['eq', 'material_id', 'mat-1']);
    expect(calls[0].filters).toContainEqual(['not', 'removed_section_title', 'is:null']);
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
