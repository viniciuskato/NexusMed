import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { Compendium, Question, QuestionAnswerRecord } from '../../src/types';

// P10: no caderno de erros, a questão ligada a uma SEÇÃO do material mostra o trecho dessa seção ao lado do
// erro, sem trocar de tela, com "Abrir no material" (que abre o material na seção). Questão sem seção
// continua como antes (sem trecho).

const wrong = (id: string): QuestionAnswerRecord => ({
  questionId: id,
  selectedOption: 'A',
  isCorrect: false,
  timestamp: '2026-09-20T10:00:00.000Z',
  timeSpentSeconds: 10,
});

vi.mock('../../src/services/storage', () => ({ getStorageUser: () => null }));
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: { getAnswers: vi.fn(async () => ({ 'q-sec': wrong('q-sec'), 'q-mat': wrong('q-mat') })) },
}));
vi.mock('../../src/repositories/ErrorNotebookRepository', () => ({
  errorNotebookRepository: { getErrorLogs: vi.fn(async () => []), updateErrorLog: vi.fn() },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: { createFlashcardFromQuestion: vi.fn() },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: {
    getQuestionReview: vi.fn(async (id: string) => ({ questionId: id, isCorrect: false, options: [], highYieldSummary: 'Pérola' })),
  },
}));
vi.mock('../../src/components/dashboard/ExportCadernoModal', () => ({ ExportCadernoModal: () => null }));

const { IntegratedCadernoErros } = await import('../../src/components/dashboard/IntegratedCadernoErros');

const material = {
  id: 'mat-1',
  disciplineId: 'd-1',
  themeId: 't-1',
  title: 'Espirometria',
  sections: [
    { id: 'sec-obs', title: 'Padrão obstrutivo', content: 'A relação VEF1/CVF fica **reduzida** no padrão obstrutivo.', keyTakeaways: [] },
    { id: 'sec-res', title: 'Padrão restritivo', content: 'Texto da outra seção.', keyTakeaways: [] },
  ],
  references: [],
} as unknown as Compendium;

function question(id: string, extra: Partial<Question>): Question {
  return {
    id,
    disciplineId: 'd-1',
    themeId: 't-1',
    questionStem: `Enunciado ${id}`,
    options: [{ letter: 'A', text: 'a' }, { letter: 'B', text: 'b' }],
    ...extra,
  } as unknown as Question;
}

const onOpenCompendium = vi.fn();

function renderCaderno() {
  return render(
    <IntegratedCadernoErros
      questions={[
        question('q-sec', { compendiumRefId: 'mat-1', compendiumSectionId: 'sec-obs' }),
        question('q-mat', { compendiumRefId: 'mat-1' }),
      ]}
      disciplines={[]}
      themes={[]}
      compendiums={[material]}
      onOpenCompendium={onOpenCompendium}
      onOpenQuestion={() => {}}
      onStartErrorSimulado={() => {}}
      onUpdate={() => {}}
    />
  );
}

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('IntegratedCadernoErros — trecho da seção ao lado do erro (P10)', () => {
  it('a questão ligada à seção mostra o trecho (título e texto da seção) no próprio cartão do erro', async () => {
    renderCaderno();
    const trecho = await screen.findByTestId('trecho-do-erro-q-sec');
    expect(within(trecho).getByText(/Trecho do material: Padrão obstrutivo/)).toBeTruthy();
    expect(within(trecho).getByText('reduzida').tagName).toBe('STRONG'); // passa pelo SafeMarkdown, não é texto cru
    expect(within(trecho).queryByText(/Texto da outra seção/)).toBeNull();
    // Está no cartão do erro (mesma tela): o enunciado da questão está no mesmo cartão.
    const cartao = trecho.closest('div.space-y-4');
    expect(cartao && within(cartao as HTMLElement).getByText('Enunciado q-sec')).toBeTruthy();
  });

  it('"Abrir no material" abre o material NAQUELA seção, com a questão de origem', async () => {
    renderCaderno();
    const trecho = await screen.findByTestId('trecho-do-erro-q-sec');
    fireEvent.click(within(trecho).getByRole('button', { name: /Abrir no material/ }));
    expect(onOpenCompendium).toHaveBeenCalledWith('mat-1', 'sec-obs', 'q-sec');
  });

  it('a questão sem seção (só o material) não mostra trecho', async () => {
    renderCaderno();
    await screen.findByText('Enunciado q-mat');
    expect(screen.queryByTestId('trecho-do-erro-q-mat')).toBeNull();
    expect(screen.getAllByTestId(/^trecho-do-erro-/)).toHaveLength(1);
  });
});
