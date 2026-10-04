import { describe, it, expect, vi, beforeEach } from 'vitest';

// Auditoria 2026-09-18 — logout limpa a cópia local de dados pessoais que o
// Supabase já guarda (para a próxima pessoa no mesmo navegador não vê-los
// pelo devtools), mas nunca o que só existe localmente, e nunca nada pessoal
// enquanto houver operação de sincronização pendente.
//
// Fica em tests/component só por precisar de localStorage (jsdom).

const pendingOps: Array<{ id: string; state?: string }> = [];

vi.mock('../../src/services/syncQueue', () => ({
  getOps: () => pendingOps,
  onActiveUserChanged: () => {},
  syncQueueStorageKey: (uid: string) => `synapse_${uid}_sync_queue_v1`,
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
    pendingOps.push({ id: 'op-1', state: 'pending' });

    expect(StorageService.clearLocalDataOnLogout(UID)).toBe(false);

    expect(localStorage.getItem(`synapse_${UID}_answers_v1`)).toBe('[1]');
    expect(localStorage.getItem(`synapse_${UID}_notes_v1`)).toBe('{"n":"anotação"}');
    expect(localStorage.getItem('synapse_questions_v1')).toBeNull();
  });

  // 45-F (AUD-27): a fila guarda as últimas operações já sincronizadas como
  // histórico. Antes, qualquer operação na fila — mesmo essa — impedia a
  // limpeza, então quase nunca se apagava nada ao sair.
  it('histórico já sincronizado na fila não impede a limpeza, e a fila também sai', () => {
    pendingOps.push({ id: 'op-velha', state: 'synced' });
    localStorage.setItem(`synapse_${UID}_simulado_draft_s1`, '{"q":"a"}');

    expect(StorageService.clearLocalDataOnLogout(UID)).toBe(true);

    expect(localStorage.getItem(`synapse_${UID}_answers_v1`)).toBeNull();
    expect(localStorage.getItem(`synapse_${UID}_sync_queue_v1`)).toBeNull();
    expect(localStorage.getItem(`synapse_${UID}_simulado_draft_s1`)).toBeNull();
    expect(localStorage.getItem('synapse_user-b_answers_v1')).toBe('[2]');
  });

  it('operação com falha também é progresso não enviado e segura a limpeza', () => {
    pendingOps.push({ id: 'op-falhou', state: 'failed' });
    expect(StorageService.clearLocalDataOnLogout(UID)).toBe(false);
    expect(localStorage.getItem(`synapse_${UID}_answers_v1`)).toBe('[1]');
  });

  it('com discardUnsynced (depois de avisar o estudante), apaga mesmo com envio pendente, inclusive a fila', () => {
    pendingOps.push({ id: 'op-1', state: 'pending' });

    expect(StorageService.clearLocalDataOnLogout(UID, { discardUnsynced: true })).toBe(true);

    expect(localStorage.getItem(`synapse_${UID}_answers_v1`)).toBeNull();
    expect(localStorage.getItem(`synapse_${UID}_notes_v1`)).toBeNull();
    expect(localStorage.getItem(`synapse_${UID}_sync_queue_v1`)).toBeNull();
    expect(localStorage.getItem(`synapse_${UID}_theme_v1`)).toBe('"dark"');
  });
});
