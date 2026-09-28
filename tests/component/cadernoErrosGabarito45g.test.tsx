import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { Question, QuestionAnswerRecord } from '../../src/types';

// 45-G: no caderno de erros, a falha ao carregar o gabarito de UMA questão
// não esconde o gabarito das outras (correção que ficou na branch antiga
// `work/integracao-estabilizacao-11b`, 9baea23 — `Promise.all` derrubava
// todas numa rejeição só). E o aviso não fica preso quando não sobra
// gabarito a buscar (revisão do #93, item 7).

const wrong = (id: string, opt: string): QuestionAnswerRecord => ({
  questionId: id,
  selectedOption: opt,
  isCorrect: false,
  timestamp: '2026-09-20T10:00:00.000Z',
  timeSpentSeconds: 10,
});

const getAnswers = vi.fn();
const getQuestionReview = vi.fn();

vi.mock('../../src/services/storage', () => ({ getStorageUser: () => null }));
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: { getAnswers: (...a: unknown[]) => getAnswers(...a) },
}));
vi.mock('../../src/repositories/ErrorNotebookRepository', () => ({
  errorNotebookRepository: { getErrorLogs: vi.fn(async () => []), updateErrorLog: vi.fn() },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: { createFlashcardFromQuestion: vi.fn() },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: { getQuestionReview: (...a: unknown[]) => getQuestionReview(...a) },
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

function renderCaderno() {
  return render(
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
}

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  getQuestionReview.mockImplementation(async (id: string) => {
    if (id === 'q-1') throw new Error('permission denied');
    return { questionId: id, isCorrect: false, options: [], highYieldSummary: 'PEROLA-DO-GABARITO-Q2' };
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('IntegratedCadernoErros — gabarito isolado por questão', () => {
  it('a falha no gabarito de uma questão não esconde o gabarito da outra', async () => {
    getAnswers.mockResolvedValue({ 'q-1': wrong('q-1', 'A'), 'q-2': wrong('q-2', 'B') });
    renderCaderno();

    expect(await screen.findByText('PEROLA-DO-GABARITO-Q2')).toBeTruthy();
    // A falha aparece como aviso, não some em silêncio.
    expect(await screen.findByText(/Não foi possível carregar agora/)).toBeTruthy();
  });

  it('o aviso sai quando não sobra gabarito a buscar (a questão deixou de ser erro) — revisão, item 7', async () => {
    getAnswers.mockResolvedValue({ 'q-1': wrong('q-1', 'A') });
    renderCaderno();
    expect(await screen.findByText(/Não foi possível carregar agora/)).toBeTruthy();

    // Na nova tentativa, q-1 já não é erro (respondida certo em outro aparelho).
    getAnswers.mockResolvedValue({ 'q-1': { ...wrong('q-1', 'B'), isCorrect: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));

    await waitFor(() => expect(screen.queryByText(/Não foi possível carregar agora/)).toBeNull());
  });
});
