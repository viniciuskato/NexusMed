import { describe, it, expect } from 'vitest';
import { classifySyncError } from '../../src/services/syncQueue';

// Testa só a lógica pura de classificação de erro — nenhum acesso a rede,
// Supabase ou localStorage. Prova o contrato que decide a política de
// retentativa (ver docs/SINCRONIZACAO-CONFIAVEL.md): errar a classificação
// aqui vira retry infinito de um erro permanente, ou desistir cedo demais
// de um erro transitório de rede.
describe('classifySyncError', () => {
  it('classifica erro de sessão/JWT expirado como auth', () => {
    expect(classifySyncError({ message: 'JWT expired' })).toBe('auth');
    expect(classifySyncError({ code: 401 })).toBe('auth');
    expect(classifySyncError({ code: 'PGRST301' })).toBe('auth');
    expect(classifySyncError({ name: 'AuthApiError', message: 'invalid_grant' })).toBe('auth');
  });

  it('classifica violação de RLS/permissão como permission', () => {
    expect(classifySyncError({ code: '42501' })).toBe('permission');
    expect(classifySyncError({ code: 403 })).toBe('permission');
    expect(classifySyncError({ message: 'row-level security policy violated' })).toBe('permission');
  });

  it('classifica schema ausente/incompatível como schema', () => {
    expect(classifySyncError({ code: 'PGRST204' })).toBe('schema');
    expect(classifySyncError({ code: 'PGRST202' })).toBe('schema');
    expect(classifySyncError({ message: 'function submit_x does not exist' })).toBe('schema');
  });

  it('classifica erro de validação de negócio/constraint como validation', () => {
    expect(classifySyncError({ code: '23514' })).toBe('validation');
    expect(classifySyncError({ code: '22P02' })).toBe('validation');
    expect(classifySyncError({ message: 'rating inválido: deve ser 1, 2, 3 ou 4' })).toBe('validation');
  });

  it('classifica falha de rede/offline como network', () => {
    expect(classifySyncError({ message: 'Failed to fetch' })).toBe('network');
    expect(classifySyncError({ message: 'NetworkError when attempting to fetch resource' })).toBe('network');
  });

  it('classifica conflito de mesclagem explícito (SYNC_CONFLICT) como conflict', () => {
    expect(classifySyncError({ code: 'SYNC_CONFLICT', message: 'esgotou tentativas de merge' })).toBe('conflict');
  });

  it('cai em unknown para erro não reconhecido, e trata ausência de erro também como unknown', () => {
    // `classifySyncError` também consulta `navigator.onLine` como sinal de
    // rede — em Node/Vitest o global `navigator` existe mas `onLine` vem
    // `undefined`, o que o código (corretamente, do ponto de vista de
    // browser real) trataria como "offline" e classificaria como 'network'.
    // Fixamos onLine=true aqui para isolar o comportamento sob teste
    // (mensagem não reconhecida, navegador online) do sinal de conectividade.
    const originalOnLine = Object.getOwnPropertyDescriptor(globalThis.navigator ?? {}, 'onLine');
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    try {
      expect(classifySyncError({ message: 'algo bizarro e nunca visto' })).toBe('unknown');
      expect(classifySyncError(null)).toBe('unknown');
      expect(classifySyncError(undefined)).toBe('unknown');
    } finally {
      if (originalOnLine) Object.defineProperty(globalThis.navigator, 'onLine', originalOnLine);
    }
  });

  it('prioriza a marca explícita de conflito mesmo se a mensagem também pareceria validação', () => {
    // Regressão: um erro de conflito não deve ser reclassificado como
    // 'validation' só porque o texto humano da mensagem contém palavras
    // parecidas com as regras de validação.
    expect(classifySyncError({ code: 'SYNC_CONFLICT', message: 'inválido para merge' })).toBe('conflict');
  });
});
