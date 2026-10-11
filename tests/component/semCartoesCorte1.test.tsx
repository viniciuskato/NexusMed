import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Flashcard } from '../../src/types';

// jsdom não tem ResizeObserver (usado pelo Header para a altura do cabeçalho).
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// CORTE-1 (D-14): o menu perde "Cards" e "Estudo Temático"; nada mais muda nele. Os cartões que o usuário já tem
// saem pelo menu da conta, em "Baixar meus cartões para o Anki".

const auth = vi.hoisted(() => ({ role: 'student' as 'student' | 'admin' }));
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.c', user_metadata: {} },
    profile: { role: auth.role, status: 'active', displayName: 'Fulana' },
    logout: vi.fn(),
  }),
}));
vi.mock('../../src/components/common/SyncStatusIndicator', () => ({ SyncStatusIndicator: () => null }));

const getFlashcards = vi.hoisted(() => vi.fn());
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { getFlashcards } }));
const baixar = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/exportarMaterial', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/exportarMaterial')>()),
  baixarArquivoDeTexto: baixar,
}));

const { Header } = await import('../../src/components/Header');
const { MobileBottomNav } = await import('../../src/components/navigation/MobileBottomNav');
const { DailyHandoffModal } = await import('../../src/components/common/DailyHandoffModal');

const cartao = (id: string, front: string, back: string): Flashcard =>
  ({
    id,
    disciplineId: 'd',
    themeId: 't',
    front,
    back,
    mechanismHighlight: '',
    tags: [],
    difficulty: 'medio',
    srs: { intervalDays: 1, repetitionCount: 0, easeFactor: 2.5, nextDueDate: '2020-01-01', state: 'new', reviewHistory: [] },
  }) as Flashcard;

beforeEach(() => {
  auth.role = 'student';
  getFlashcards.mockReset();
  baixar.mockReset();
});
afterEach(cleanup);

function renderHeader(activeView = 'dashboard') {
  const onSelectView = vi.fn();
  render(
    <Header
      onOpenSearch={vi.fn()}
      activeView={activeView}
      onSelectView={onSelectView}
      theme={'light' as never}
      onToggleTheme={vi.fn()}
      onOpenFeedback={vi.fn()}
    />
  );
  return onSelectView;
}

describe('CORTE-1 — menu do topo', () => {
  it('lista exatamente Hoje, Início e Recursos; Recursos tem Biblioteca, Questões e Meu desempenho', () => {
    renderHeader();
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Hoje', 'Início', 'Recursos']);
    expect(document.getElementById('nav-thematic-study')).toBeNull();

    fireEvent.click(document.getElementById('nav-resources') as HTMLElement);
    const menu = screen.getByRole('menu', { name: 'Recursos' });
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent?.trim())).toEqual([
      'Biblioteca',
      'Questões',
      'Meu desempenho',
    ]);
  });

  it('não há mais a ofensiva (chama e "Nd") no cabeçalho', () => {
    renderHeader();
    expect(document.querySelector('header')?.textContent).not.toMatch(/\d+d\b|ofensiva|dias seguidos/i);
    expect(document.querySelector('header [title*="dias seguidos"]')).toBeNull();
  });
});

describe('CORTE-1 — dock do celular', () => {
  it('lista exatamente Hoje, Início e Recursos (e CMS para o admin); Recursos tem Biblioteca, Questões e Desempenho', () => {
    const { unmount } = render(<MobileBottomNav activeView="dashboard" onSelectView={vi.fn()} />);
    const dock = screen.getByRole('navigation', { name: 'Navegação Principal' });
    expect(within(dock).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Hoje', 'Início', 'Recursos']);
    expect(document.getElementById('dock-nav-thematic-study')).toBeNull();
    fireEvent.click(document.getElementById('dock-nav-resources') as HTMLElement);
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent?.trim())).toEqual([
      'Biblioteca',
      'Questões',
      'Desempenho',
    ]);
    unmount();

    auth.role = 'admin';
    render(<MobileBottomNav activeView="dashboard" onSelectView={vi.fn()} />);
    expect(
      within(screen.getByRole('navigation', { name: 'Navegação Principal' })).getAllByRole('button').map((b) => b.textContent?.trim())
    ).toEqual(['Hoje', 'Início', 'Recursos', 'CMS']);
  });
});

describe('CORTE-1 — "Baixar meus cartões para o Anki" no menu da conta', () => {
  function abrirMenuDaConta() {
    fireEvent.click(document.getElementById('btn-user-profile-menu') as HTMLElement);
    return screen.getByRole('menuitem', { name: 'Baixar meus cartões para o Anki' });
  }
  /** O aviso mora fora do menu da conta e continua ali depois que ele fecha. */
  function avisoDaConta() {
    expect(screen.queryByRole('menu')).toBeNull();
    return screen.getByRole('status');
  }

  it('está no menu da conta de qualquer usuário logado', () => {
    renderHeader();
    expect(screen.queryByRole('menuitem', { name: 'Baixar meus cartões para o Anki' })).toBeNull();
    expect(abrirMenuDaConta()).toBeTruthy();
  });

  it('com cartões: baixa um .txt de importação do Anki, uma linha por cartão, e diz quantos fora do menu', async () => {
    getFlashcards.mockResolvedValue([cartao('1', 'Frente um', 'Verso um'), cartao('2', 'Frente dois', 'Verso dois')]);
    renderHeader();
    fireEvent.click(abrirMenuDaConta());

    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
    const [nome, texto, tipo] = baixar.mock.calls[0] as [string, string, string];
    expect(nome).toMatch(/^cartoes-nexusmed-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(tipo).toContain('text/plain');
    expect(texto).toBe('#separator:tab\n#html:false\n"Frente um"\t"Verso um"\n"Frente dois"\t"Verso dois"\n');
    await waitFor(() => expect(avisoDaConta().textContent).toMatch(/2 cartões no arquivo/));
  });

  it('com 0 cartões: avisa "Você não tem cartões." fora do menu e não baixa nada', async () => {
    getFlashcards.mockResolvedValue([]);
    renderHeader();
    fireEvent.click(abrirMenuDaConta());

    await waitFor(() => expect(avisoDaConta().textContent).toBe('Você não tem cartões.'));
    expect(baixar).not.toHaveBeenCalled();
  });

  it('se não consegue carregar os cartões, avisa fora do menu e não baixa nada', async () => {
    getFlashcards.mockRejectedValue(new TypeError('Failed to fetch'));
    renderHeader();
    fireEvent.click(abrirMenuDaConta());

    await waitFor(() => expect(avisoDaConta().textContent).toMatch(/Não foi possível carregar seus cartões/));
    expect(baixar).not.toHaveBeenCalled();
  });

  it('o menu fecha ao clicar, e o aviso fica fora de qualquer role="menu"', async () => {
    let resolver: (v: Flashcard[]) => void = () => undefined;
    getFlashcards.mockReturnValue(new Promise<Flashcard[]>((r) => (resolver = r)));
    renderHeader();
    fireEvent.click(abrirMenuDaConta());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(getFlashcards).toHaveBeenCalledTimes(1);

    resolver([cartao('1', 'F', 'V')]);
    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(avisoDaConta().textContent).toMatch(/1 cartão no arquivo/));
    expect(document.querySelector('[role="menu"] [role="status"]')).toBeNull();
  });
});

describe('CORTE-1 — Passagem de Plantão', () => {
  it('não mostra nem copia ofensiva/streak, e não manda revisar flashcards', () => {
    const agora = new Date().toISOString();
    render(
      <DailyHandoffModal
        isOpen
        onClose={vi.fn()}
        questions={[{ id: 'q1', themeId: 't1', disciplineId: 'd1' } as never]}
        disciplines={[{ id: 'd1', name: 'Clínica' } as never]}
        themes={[{ id: 't1', name: 'Tema Um' } as never]}
        answers={{ q1: { questionId: 'q1', selectedOption: 'B', isCorrect: false, timestamp: agora, timeSpentSeconds: 5 } }}
        errorLogs={[]}
      />
    );
    const modal = screen.getByRole('dialog');
    expect(within(modal).getByText(/Médico: Fulana/)).toBeTruthy();
    expect(modal.textContent).toMatch(/Tema Um/);
    expect(modal.textContent).not.toMatch(/streak|ofensiva|flashcard|SRS/i);
  });
});
