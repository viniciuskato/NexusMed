import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Question, QuestionAnswerRecord } from '../../src/types';

// 45-G: no caderno de erros, a falha ao carregar o gabarito de UMA questão
// não esconde o gabarito das outras (correção que ficou na branch antiga
// `work/integracao-estabilizacao-11b`, 9baea23 — `Promise.all` derrubava
// todas numa rejeição só).

const answers: Record<string, QuestionAnswerRecord> = {
  'q-1': { questionId: 'q-1', selectedOption: 'A', isCorrect: false, timestamp: '2026-09-20T10:00:00.000Z', timeSpentSeconds: 10 },
  'q-2': { questionId: 'q-2', selectedOption: 'B', isCorrect: false, timestamp: '2026-09-20T10:01:00.000Z', timeSpentSeconds: 10 },
};

vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: { getAnswers: vi.fn(async () => answers) },
}));
vi.mock('../../src/repositories/ErrorNotebookRepository', () => ({
  errorNotebookRepository: { getErrorLogs: vi.fn(async () => []), updateErrorLog: vi.fn() },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: { createFlashcardFromQuestion: vi.fn() },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: {
    getQuestionReview: vi.fn(async (id: string) => {
      if (id === 'q-1') throw new Error('permission denied');
      return { questionId: id, isCorrect: false, options: [], highYieldSummary: 'PEROLA-DO-GABARITO-Q2' };
    }),
  },
}));
vi.mock('../../src/components/dashboard/ExportCadernoModal', () => ({ ExportCadernoModal: () => null }));

const { IntegratedCadernoErros } = await import('../../src/components/dashboard/IntegratedCadernoErros');

function question(id: string): Question {
  return {
    id,
    disciplineId: 'd-1',
    themeId: 't-1',
    questionStem: `Enunciado ${id}`,
    options: [
      { letter: 'A', text: 'a' },
      { letter: 'B', text: 'b' },
    ],
  } as unknown as Question;
}

afterEach(() => cleanup());

describe('IntegratedCadernoErros — gabarito isolado por questão', () => {
  it('a falha no gabarito de uma questão não esconde o gabarito da outra', async () => {
    render(
      <IntegratedCadernoErros
        questions={[question('q-1'), question('q-2')]}
        disciplines={[]}
        themes={[]}
        compendiums={[]}
        onOpenCompendium={() => {}}
        onOpenQuestion={() => {}}
        onStartErrorSimulado={() => {}}
        onUpdate={() => {}}
      />
    );

    expect(await screen.findByText('PEROLA-DO-GABARITO-Q2')).toBeTruthy();
    // A falha aparece como aviso, não some em silêncio.
    expect(await screen.findByText(/Não foi possível carregar agora/)).toBeTruthy();
  });
});
