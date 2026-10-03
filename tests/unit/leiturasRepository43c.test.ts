import { describe, expect, it, vi } from 'vitest';

// 43-C, revisão do #96, item 4: só operação pendente ou em envio conta como
// leitura feita agora — a que falhou de vez nunca vai chegar ao servidor.

const ops = [
  { category: 'reading_progress_set', state: 'pending', createdAt: new Date().toISOString(), payload: { compendiumId: 'pendente', sectionId: 's', isRead: true, totalSections: 1 } },
  { category: 'reading_progress_set', state: 'syncing', createdAt: new Date().toISOString(), payload: { compendiumId: 'enviando', sectionId: 's', isRead: true, totalSections: 1 } },
  { category: 'reading_progress_set', state: 'failed', createdAt: new Date().toISOString(), payload: { compendiumId: 'falhou', sectionId: 's', isRead: true, totalSections: 1 } },
  { category: 'reading_progress_set', state: 'synced', createdAt: new Date().toISOString(), payload: { compendiumId: 'subiu', sectionId: 's', isRead: true, totalSections: 1 } },
];

vi.mock('../../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => ({ select: async () => ({ data: [], error: null }) }) },
}));
vi.mock('../../src/services/syncQueue', () => ({ getOps: () => ops }));
vi.mock('../../src/services/storage', () => ({ getStorageUser: () => 'u1', StorageService: {} }));

const { leiturasRepository } = await import('../../src/repositories/LeiturasRepository');

describe('LeiturasRepository (43-C)', () => {
  it('conta marcações pendentes e em envio, nunca as que falharam de vez', async () => {
    const ids = (await leiturasRepository.getLeituras()).map((l) => l.materialId).sort();
    expect(ids).toEqual(['enviando', 'pendente']);
  });
});
