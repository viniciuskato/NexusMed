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
    expect(reaberto.referenceSources).toBeUndefined();
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
