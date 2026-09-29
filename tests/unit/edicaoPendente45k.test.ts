import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Compendium } from '../../src/types';
import { buildSaveCompendiumPayload, compendiumFromSavePayload } from '../../src/utils/compendiumSavePayload';

// 45-K — edição pendente de material publicado, no cliente:
// - a carga guardada como edição pendente volta ao formulário e, salva sem
//   mexer, é a mesma carga (não cria edição nova nem muda hash);
// - quando a edição fica pendente, a cópia local NÃO recebe o conteúdo novo
//   (senão este aparelho mostraria o que ainda não foi atestado).

const material: Compendium = {
  id: 'mat-1',
  disciplineId: 'd',
  themeId: 't',
  title: 'Ceftriaxona',
  subtitle: 'C3G',
  estimatedReadTimeMinutes: 12,
  lastUpdated: '2026-09-27',
  author: 'Equipe',
  mode: 'mecanismos',
  tags: ['C3G'],
  parentMaterialId: 'pai',
  treeSortOrder: 20,
  navShortTitle: 'Ceftri',
  taxonomyKind: 'farmaco',
  navigationLinks: [{ materialId: 'outro', linkType: 'related', sortOrder: 0 }],
  sections: [
    { id: 's1', title: 'Espectro', content: 'Texto.', keyTakeaways: ['a'], mechanismTag: 'Espectro de ação', clinicalPearl: 'p' },
    { id: 's2', title: 'Dose', content: 'Dose.', keyTakeaways: [] },
  ],
  references: ['Ref A', 'Ref B'],
  referenceSources: [{ linked: true, sourceId: 'x' }, { linked: false }],
  publicationStatus: 'published',
};

describe('carga do save_compendium: ida e volta', () => {
  it('material → carga → material → carga devolve a mesma carga', () => {
    const payload = buildSaveCompendiumPayload(material);
    const reaberto = compendiumFromSavePayload(material, {
      material: payload.p_material,
      sections: payload.p_sections,
      references: payload.p_references,
    });
    expect(buildSaveCompendiumPayload(reaberto)).toEqual(payload);
  });

  it('a edição reaberta traz o conteúdo da edição, não o atestado', () => {
    const editado: Compendium = { ...material, sections: [{ ...material.sections[0], content: 'Texto NOVO.' }] };
    const p = buildSaveCompendiumPayload(editado);
    const reaberto = compendiumFromSavePayload(material, { material: p.p_material, sections: p.p_sections, references: p.p_references });
    expect(reaberto.sections.map((s) => s.content)).toEqual(['Texto NOVO.']);
    expect(reaberto.publicationStatus).toBe('published');
    // Mesmas referências: os vínculos com fonte curada continuam (item 7 da revisão).
    expect(reaberto.referenceSources).toEqual(material.referenceSources);
  });

  it('referências resolvidas pelo banco (com id) voltam só como texto', () => {
    const p = buildSaveCompendiumPayload(material);
    const comIds = p.p_references.map((r, i) => ({ ...r, id: `ref-${i}` }));
    const reaberto = compendiumFromSavePayload(material, { material: p.p_material, sections: p.p_sections, references: comIds });
    expect(buildSaveCompendiumPayload(reaberto).p_references).toEqual(p.p_references);
  });
});

describe('ResilientMaterialsRepository.saveCompendium — edição pendente', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.doUnmock('../../src/lib/supabaseClient');
    vi.doUnmock('../../src/repositories/SupabaseMaterialsRepository');
    vi.doUnmock('../../src/services/storage');
  });

  async function repoCom(resultado: 'aplicado' | 'pendente') {
    const localSave = vi.fn();
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));
    vi.doMock('../../src/repositories/SupabaseMaterialsRepository', () => ({
      SupabaseMaterialsRepository: vi.fn().mockImplementation(() => ({
        saveCompendium: vi.fn().mockResolvedValue(resultado),
      })),
    }));
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { saveCompendium: localSave, getCompendiums: () => [], saveCompendiums: () => {} },
    }));
    const { materialsRepository } = await import('../../src/repositories/MaterialsRepository');
    return { materialsRepository, localSave };
  }

  it('edição pendente não vai para a cópia local, e o resultado chega a quem salvou', async () => {
    const { materialsRepository, localSave } = await repoCom('pendente');
    expect(await materialsRepository.saveCompendium(material)).toBe('pendente');
    expect(localSave).not.toHaveBeenCalled();
  });

  it('gravação aplicada atualiza a cópia local, como antes', async () => {
    const { materialsRepository, localSave } = await repoCom('aplicado');
    expect(await materialsRepository.saveCompendium(material)).toBe('aplicado');
    expect(localSave).toHaveBeenCalledTimes(1);
  });
});

describe('reabrir a edição pendente (revisão do 8e71e5f, itens 5 e 7)', () => {
  it('a navegação vem sempre do material atual, não da carga guardada', () => {
    const guardada = buildSaveCompendiumPayload({ ...material, parentMaterialId: 'pai-velho', treeSortOrder: 0, navigationLinks: [] });
    const atual: Compendium = { ...material, parentMaterialId: 'pai-novo', treeSortOrder: 40, taxonomyKind: 'classe' };
    const reaberto = compendiumFromSavePayload(atual, { material: guardada.p_material, sections: guardada.p_sections, references: guardada.p_references });
    expect(reaberto.parentMaterialId).toBe('pai-novo');
    expect(reaberto.treeSortOrder).toBe(40);
    expect(reaberto.taxonomyKind).toBe('classe');
    expect(reaberto.navigationLinks).toEqual(atual.navigationLinks);
  });

  it('o vínculo com fonte curada acompanha a referência pelo texto', () => {
    const p = buildSaveCompendiumPayload({ ...material, references: ['Ref nova', 'Ref A'] });
    const reaberto = compendiumFromSavePayload(material, { material: p.p_material, sections: p.p_sections, references: p.p_references });
    expect(reaberto.referenceSources).toEqual([{ linked: false }, { linked: true, sourceId: 'x' }]);
  });
});

describe('getCompendiums — edições pendentes só para admin (revisão do 8e71e5f, item 9)', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('../../src/lib/supabaseClient'));

  async function repoComTabelas() {
    const { makeFakeSupabase } = await import('./helpers/fakePostgrest');
    const state = {
      tables: {
        materials: [{ id: 'mat-1', discipline_id: 'd', theme_id: 't', title: 'M', status: 'published', tags: [] }],
        material_sections: [],
        material_references: [],
        material_links: [],
        material_pending_edits: [{ material_id: 'mat-1' }],
      },
      requests: [],
    } as unknown as import('./helpers/fakePostgrest').FakePostgrestState;
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: makeFakeSupabase(state) }));
    const { SupabaseMaterialsRepository } = await import('../../src/repositories/SupabaseMaterialsRepository');
    return { repo: new SupabaseMaterialsRepository(), state };
  }

  it('estudante: nenhuma consulta às edições pendentes', async () => {
    const { repo, state } = await repoComTabelas();
    const [c] = await repo.getCompendiums();
    expect(c.hasPendingEdit).toBeUndefined();
    expect(state.requests.some((r) => r.table === 'material_pending_edits')).toBe(false);
  });

  it('admin: marca o material com edição pendente', async () => {
    const { repo } = await repoComTabelas();
    const [c] = await repo.getCompendiums({ includePendingEdits: true });
    expect(c.hasPendingEdit).toBe(true);
  });
});
