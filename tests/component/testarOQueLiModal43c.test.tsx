import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Compendium, Question, Theme } from '../../src/types';

// 43-C: o modal "Testar o que li" — materiais lidos hoje, marcados por padrão,
// contagem antes de começar e a saída para o tema quando não há questão.

const getLeituras = vi.fn();
vi.mock('../../src/repositories/LeiturasRepository', () => ({
  leiturasRepository: { getLeituras: () => getLeituras() },
}));

const { TestarOQueLiModal } = await import('../../src/components/testar/TestarOQueLiModal');

const material = (id: string, title: string, themeId = 't'): Compendium => ({
  id, disciplineId: 'd', themeId, title, subtitle: '', estimatedReadTimeMinutes: 10,
  lastUpdated: '', author: '', sections: [], references: [],
});
const q = (id: string, links: string[]): Question => ({
  id, disciplineId: 'd', themeId: 't', compendiumRefId: links[0] ?? '', materialLinks: links.map((m) => ({ materialId: m })),
  cycle: 'clinico', difficulty: 'medio', institution: '', year: 2026, clinicalVignette: '', questionStem: `Questão ${id}`,
  options: [], generalCommentary: '', highYieldSummary: '', tags: [],
});

const compendiums = [material('a', 'Penicilinas'), material('b', 'Cefalosporinas'), material('c', 'Carbapenêmicos', 't2')];
const themes: Theme[] = [
  { id: 't', disciplineId: 'd', name: 'β-lactâmicos' } as Theme,
  { id: 't2', disciplineId: 'd', name: 'Outro tema' } as Theme,
];
const questions = [q('1', ['a']), q('2', ['b']), q('3', ['a', 'b'])];
const agora = new Date().toISOString();
const ontem = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

function renderModal(props: Partial<React.ComponentProps<typeof TestarOQueLiModal>> = {}) {
  const onStart = vi.fn();
  const onOpenQuestionsForTheme = vi.fn();
  render(
    <TestarOQueLiModal
      compendiums={compendiums}
      themes={themes}
      questions={questions}
      onClose={vi.fn()}
      onStart={onStart}
      onOpenQuestionsForTheme={onOpenQuestionsForTheme}
      {...props}
    />
  );
  return { onStart, onOpenQuestionsForTheme };
}

beforeEach(() => {
  getLeituras.mockReset();
});
afterEach(cleanup);

describe('TestarOQueLiModal (43-C)', () => {
  it('mostra os materiais lidos hoje, todos marcados, e a contagem de questões', async () => {
    getLeituras.mockResolvedValue([
      { materialId: 'a', secoesLidas: 2, ultimaLeitura: agora },
      { materialId: 'b', secoesLidas: 1, ultimaLeitura: agora },
      { materialId: 'c', secoesLidas: 1, ultimaLeitura: ontem },
    ]);
    renderModal();
    const a = (await screen.findByRole('checkbox', { name: /Penicilinas/ })) as HTMLInputElement;
    const b = screen.getByRole('checkbox', { name: /Cefalosporinas/ }) as HTMLInputElement;
    expect(a.checked).toBe(true);
    expect(b.checked).toBe(true);
    expect(screen.queryByText(/Carbapenêmicos/)).toBeNull();
    expect(screen.getByText('3 questões disponíveis')).toBeTruthy();
  });

  it('desmarcar um material tira as questões dele e as que cobram os dois', async () => {
    getLeituras.mockResolvedValue([
      { materialId: 'a', secoesLidas: 1, ultimaLeitura: agora },
      { materialId: 'b', secoesLidas: 1, ultimaLeitura: agora },
    ]);
    const { onStart } = renderModal();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Cefalosporinas/ }));
    expect(screen.getByText('1 questão disponível')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Começar/ }));
    expect(onStart).toHaveBeenCalledWith(['1']);
  });

  it('sem questões para os materiais lidos, diz isso e oferece "Resolver questões do tema"', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'c', secoesLidas: 1, ultimaLeitura: agora }]);
    const { onOpenQuestionsForTheme } = renderModal();
    expect(await screen.findByText(/Nenhuma questão cobra os materiais marcados/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Começar/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Resolver questões do tema/ }));
    expect(onOpenQuestionsForTheme).toHaveBeenCalledWith('t2');
  });

  it('nada lido hoje: diz isso claramente', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: ontem }]);
    renderModal();
    expect(await screen.findByText(/Nenhum material lido hoje/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Começar/ })).toBeNull();
  });

  it('sem conexão: avisa e não finge que nada foi lido', async () => {
    getLeituras.mockRejectedValue(new TypeError('Failed to fetch'));
    renderModal();
    expect(await screen.findByText(/Não foi possível carregar/)).toBeTruthy();
    expect(screen.queryByText(/Nenhum material lido hoje/)).toBeNull();
  });
});
