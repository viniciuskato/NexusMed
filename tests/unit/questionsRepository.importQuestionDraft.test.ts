import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Question } from '../../src/types';

// Importação assistida de QUESTÕES — mesma regra do
// `ResilientMaterialsRepository.importCompendiumDraft` (Missão 42-B): a
// cópia local só é escrita DEPOIS do sucesso integral da gravação remota —
// nunca antes, ao contrário do padrão usado pelos demais métodos deste
// repositório (grava local primeiro, sincroniza depois). Sem Supabase
// configurado, grava só local (modo genuinamente local, sem fingir
// sincronização inexistente).
//
// Usa `vi.doMock` + import dinâmico por cenário porque `isSupabaseConfigured`
// é uma constante calculada na carga do módulo `lib/supabaseClient` — cada
// teste precisa de um valor diferente, o que exige reset de módulos entre
// cenários.

const question: Question = {
  id: 'question-1',
  disciplineId: 'disc-1',
  themeId: 'tema-1',
  compendiumRefId: '',
  cycle: 'internato_residencia',
  difficulty: 'medio',
  institution: 'ENARE',
  year: 2025,
  clinicalVignette: '',
  questionStem: 'Pergunta de teste',
  options: [
    { letter: 'A', text: 'A', isCorrect: false, explanation: '' },
    { letter: 'B', text: 'B', isCorrect: true, explanation: '' },
  ],
  generalCommentary: 'Comentário',
  highYieldSummary: 'Pérola',
  tags: [],
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../../src/lib/supabaseClient');
  vi.doUnmock('../../src/repositories/SupabaseQuestionsRepository');
  vi.doUnmock('../../src/services/storage');
});

describe('ResilientQuestionsRepository.importQuestionDraft', () => {
  it('sem Supabase configurado, grava só localmente (sem fingir sincronização remota)', async () => {
    const localSaveMock = vi.fn();
    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: false, supabase: {} }));
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { saveCustomQuestion: localSaveMock, getQuestions: () => [], saveQuestions: () => {} },
    }));

    const { questionsRepository } = await import('../../src/repositories/QuestionsRepository');
    const result = await questionsRepository.importQuestionDraft(question);

    expect(localSaveMock).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('question-1');
    expect(result.publicationStatus).toBe('draft');
  });

  it('com Supabase configurado e sucesso remoto, grava local só DEPOIS do sucesso remoto', async () => {
    const callOrder: string[] = [];
    const remoteImportMock = vi.fn().mockImplementation(async (q: Question) => {
      callOrder.push('remote');
      return { ...q, publicationStatus: 'draft' as const };
    });
    const localSaveMock = vi.fn().mockImplementation(() => {
      callOrder.push('local');
    });

    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));
    vi.doMock('../../src/repositories/SupabaseQuestionsRepository', () => ({
      SupabaseQuestionsRepository: vi.fn().mockImplementation(() => ({
        importQuestionDraft: remoteImportMock,
      })),
    }));
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { saveCustomQuestion: localSaveMock, getQuestions: () => [], saveQuestions: () => {} },
    }));

    const { questionsRepository } = await import('../../src/repositories/QuestionsRepository');
    const result = await questionsRepository.importQuestionDraft(question);

    expect(callOrder).toEqual(['remote', 'local']); // remoto sempre antes do local
    expect(remoteImportMock).toHaveBeenCalledTimes(1);
    expect(localSaveMock).toHaveBeenCalledTimes(1);
    expect(result.publicationStatus).toBe('draft');
  });

  it('com Supabase configurado e falha remota, NÃO grava nada localmente e propaga o erro', async () => {
    const localSaveMock = vi.fn();
    const remoteImportMock = vi.fn().mockRejectedValue(new Error('falha simulada de rede/servidor'));

    vi.doMock('../../src/lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));
    vi.doMock('../../src/repositories/SupabaseQuestionsRepository', () => ({
      SupabaseQuestionsRepository: vi.fn().mockImplementation(() => ({
        importQuestionDraft: remoteImportMock,
      })),
    }));
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { saveCustomQuestion: localSaveMock, getQuestions: () => [], saveQuestions: () => {} },
    }));

    const { questionsRepository } = await import('../../src/repositories/QuestionsRepository');

    await expect(questionsRepository.importQuestionDraft(question)).rejects.toThrow(
      'falha simulada de rede/servidor'
    );
    expect(localSaveMock).not.toHaveBeenCalled();
  });
});
