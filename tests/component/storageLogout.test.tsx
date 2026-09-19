import { describe, it, expect, vi, beforeEach } from 'vitest';

// Auditoria 2026-09-18 — logout limpa a cópia local de dados pessoais que o
// Supabase já guarda (para a próxima pessoa no mesmo navegador não vê-los
// pelo devtools), mas nunca o que só existe localmente, e nunca nada pessoal
// enquanto houver operação de sincronização pendente.
//
// Fica em tests/component só por precisar de localStorage (jsdom).

const pendingOps: unknown[] = [];

vi.mock('../../src/services/syncQueue', () => ({
  getOps: () => pendingOps,
  onActiveUserChanged: () => {},
}));
vi.mock('../../src/services/legacyRecovery', () => ({
  recoverLegacyLocalProgress: async () => {},
}));

const { StorageService } = await import('../../src/services/storage');

const UID = 'user-a';

function seed() {
  localStorage.setItem('synapse_questions_v1', '[{"id":"q-draft"}]');
  localStorage.setItem('synapse_compendiums_v1', '[]');
  localStorage.setItem(`synapse_${UID}_answers_v1`, '[1]');
  localStorage.setItem(`synapse_${UID}_notes_v1`, '{"n":"anotação"}');
  localStorage.setItem(`synapse_${UID}_sync_queue_v1`, '[]');
  localStorage.setItem(`synapse_${UID}_compendium_highlights_v1`, '{"h":1}');
  localStorage.setItem(`synapse_${UID}_theme_v1`, '"dark"');
  localStorage.setItem('synapse_user-b_answers_v1', '[2]');
}

describe('StorageService.clearLocalDataOnLogout', () => {
  beforeEach(() => {
    localStorage.clear();
    pendingOps.length = 0;
    seed();
  });

  it('remove caches de conteúdo e dados pessoais espelhados no servidor', () => {
    expect(StorageService.clearLocalDataOnLogout(UID)).toBe(true);

    expect(localStorage.getItem('synapse_questions_v1')).toBeNull();
    expect(localStorage.getItem('synapse_compendiums_v1')).toBeNull();
    expect(localStorage.getItem(`synapse_${UID}_answers_v1`)).toBeNull();
    expect(localStorage.getItem(`synapse_${UID}_notes_v1`)).toBeNull();
  });

  it('preserva o que só existe localmente e os dados de outro usuário', () => {
    StorageService.clearLocalDataOnLogout(UID);

    expect(localStorage.getItem(`synapse_${UID}_compendium_highlights_v1`)).toBe('{"h":1}');
    expect(localStorage.getItem(`synapse_${UID}_theme_v1`)).toBe('"dark"');
    expect(localStorage.getItem('synapse_user-b_answers_v1')).toBe('[2]');
  });

  it('com sincronização pendente, não remove nenhum dado pessoal', () => {
    pendingOps.push({ id: 'op-1' });

    expect(StorageService.clearLocalDataOnLogout(UID)).toBe(false);

    expect(localStorage.getItem(`synapse_${UID}_answers_v1`)).toBe('[1]');
    expect(localStorage.getItem(`synapse_${UID}_notes_v1`)).toBe('{"n":"anotação"}');
    expect(localStorage.getItem('synapse_questions_v1')).toBeNull();
  });
});
