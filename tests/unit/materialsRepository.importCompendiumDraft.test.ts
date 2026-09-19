import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Compendium } from '../../src/types';

// Missão 42-B — Entrada assistida de materiais (correção de atomicidade).
//
// Prova a regra do `ResilientMaterialsRepository.importCompendiumDraft`:
// a cópia local só é escrita DEPOIS do sucesso integral da gravação remota
// — nunca antes, ao contrário do padrão usado pelos demais métodos deste
// repositório (grava local primeiro, sincroniza depois). Sem Supabase
// configurado, grava só local (modo genuinamente local, sem fingir
// sincronização inexistente).
//
// Usa `vi.doMock` + import dinâmico por cenário porque `isSupabaseConfigured`
// é uma constante calculada na carga do módulo `lib/supabaseClient` — cada
// teste precisa de um valor diferente, o que exige reset de módulos entre
// cenários (mock estático de topo de arquivo não serviria aqui).

const compendium: Compendium = {
  id: 'material-1',
  disciplineId: 'disc-1',
  themeId: 'tema-1',
  title: 'Material de Teste',
  subtitle: '',
  estimatedReadTimeMinutes: 10,
  lastUpdated: '',
  author: '',
  sections: [{ id: 'sec-1', title: 'Seção 1', content: 'Conteúdo', keyTakeaways: [] }],
  references: ['Referência 1'],
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../../src/lib/supabaseClient');
  vi.doUnmock('../../src/repositories/SupabaseMaterialsRepository');
  vi.doUnmock('../../src/services/storage');
});

describe('ResilientMaterialsRepository.importCompendiumDraft', () => {
  it('sem Supabase configurado, grava só localmente (sem fingir sincronização remota)', async () => {
    const localSaveMock = vi.fn();
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: false, supabase: {} }));
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { saveCompendium: localSaveMock, getCompendiums: () => [], saveCompendiums: () => {} },
    }));

    const { materialsRepository } = await import('../../src/repositories/MaterialsRepository');
    const result = await materialsRepository.importCompendiumDraft(compendium);

    expect(localSaveMock).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('material-1');
  });

  it('com Supabase configurado e sucesso remoto, grava local só DEPOIS do sucesso remoto', async () => {
    const callOrder: string[] = [];
    const remoteImportMock = vi.fn().mockImplementation(async (c: Compendium) => {
      callOrder.push('remote');
      return { ...c, lastUpdated: 'remote-confirmed' };
    });
    const localSaveMock = vi.fn().mockImplementation(() => {
      callOrder.push('local');
    });

    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));
    vi.doMock('../../src/repositories/SupabaseMaterialsRepository', () => ({
      SupabaseMaterialsRepository: vi.fn().mockImplementation(() => ({
        importCompendiumDraft: remoteImportMock,
      })),
    }));
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { saveCompendium: localSaveMock, getCompendiums: () => [], saveCompendiums: () => {} },
    }));

    const { materialsRepository } = await import('../../src/repositories/MaterialsRepository');
    const result = await materialsRepository.importCompendiumDraft(compendium);

    expect(callOrder).toEqual(['remote', 'local']); // remoto sempre antes do local
    expect(remoteImportMock).toHaveBeenCalledTimes(1);
    expect(localSaveMock).toHaveBeenCalledTimes(1);
    expect(result.lastUpdated).toBe('remote-confirmed');
  });

  it('com Supabase configurado e falha remota, NÃO grava nada localmente e propaga o erro', async () => {
    const localSaveMock = vi.fn();
    const remoteImportMock = vi.fn().mockRejectedValue(new Error('falha simulada de rede/servidor'));

    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));
    vi.doMock('../../src/repositories/SupabaseMaterialsRepository', () => ({
      SupabaseMaterialsRepository: vi.fn().mockImplementation(() => ({
        importCompendiumDraft: remoteImportMock,
      })),
    }));
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { saveCompendium: localSaveMock, getCompendiums: () => [], saveCompendiums: () => {} },
    }));

    const { materialsRepository } = await import('../../src/repositories/MaterialsRepository');

    await expect(materialsRepository.importCompendiumDraft(compendium)).rejects.toThrow(
      'falha simulada de rede/servidor'
    );
    expect(localSaveMock).not.toHaveBeenCalled();
  });
});
