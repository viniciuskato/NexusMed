import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Discipline, Question, Theme } from '../../src/types';

// IMPORT-2 (D-14) — "Colar texto" no modal "Importar questões": o admin cola o
// texto de uma prova de residência, informa banca e ano do lote, vê a prévia
// (questão por questão) e confirma; a gravação é a mesma do import por arquivo
// (questionsRepository.importQuestionDraft -> RPC import_question_draft), aqui
// mockada.

const importQuestionDraftMock = vi.fn().mockImplementation((q: unknown) => Promise.resolve(q));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: {
    importQuestionDraft: (...args: unknown[]) => importQuestionDraftMock(...args),
  },
}));

import { ImportQuestionsModal } from '../../src/components/admin/ImportQuestionsModal';

const discipline: Discipline = {
  id: 'disc-pneumo',
  name: 'Pneumologia',
  code: 'PNEUMO',
  icon: 'lungs',
  description: '',
  cycle: 'clinico',
  color: '#000',
};
const theme: Theme = {
  id: 'tema-espirometria',
  disciplineId: 'disc-pneumo',
  name: 'Espirometria',
  description: '',
  highYield: false,
  order: 1,
};

// 3 questões, a segunda sem gabarito. Abertas por "Questão N": com "2." a questão 1 também ficaria
// bloqueada (IMPORT-2b, regra e: a seguinte, aberta por número, bloqueada pode ter cortado a anterior).
const provaDeTres = `Questão 1
Pergunta um?
A) Sim
B) Não
Resposta: B
Questão 2
Pergunta dois, sem gabarito?
A) Sim
B) Não
Questão 3
Pergunta três, com
quebra de linha?
A) Um
B) Dois
C) Três
Resposta: C
`;

afterEach(() => {
  cleanup();
  importQuestionDraftMock.mockClear();
});

type Existentes = React.ComponentProps<typeof ImportQuestionsModal>['existingQuestions'];

function abrir(existingQuestions?: Existentes) {
  return render(
    <ImportQuestionsModal
      disciplines={[discipline]}
      themes={[theme]}
      compendiums={[]}
      existingQuestions={existingQuestions}
      onClose={vi.fn()}
      onImported={vi.fn()}
    />
  );
}

function preencher({ banca = 'ENARE', ano = '2025', texto = provaDeTres }: { banca?: string; ano?: string; texto?: string } = {}) {
  fireEvent.change(screen.getByLabelText('Banca / instituição'), { target: { value: banca } });
  fireEvent.change(screen.getByLabelText('Ano'), { target: { value: ano } });
  fireEvent.change(screen.getByLabelText('Texto da prova'), { target: { value: texto } });
}

const botaoLer = () => screen.getByRole('button', { name: /ler texto e ver a prévia/i }) as HTMLButtonElement;

function lerEAplicarATodas() {
  fireEvent.click(botaoLer());
  fireEvent.change(screen.getByLabelText('Disciplina para todas'), { target: { value: 'disc-pneumo' } });
  fireEvent.change(screen.getByLabelText('Tema para todas'), { target: { value: 'tema-espirometria' } });
  fireEvent.click(screen.getByRole('button', { name: /^aplicar a todas$/i }));
}

describe('ImportQuestionsModal — Colar texto: banca e ano obrigatórios', () => {
  it('além do arquivo, há a caixa de texto com banca e ano; o botão nasce desligado com os motivos escritos', () => {
    abrir();
    expect(screen.getByLabelText(/selecionar arquivo/i, { selector: 'input' })).toBeTruthy();
    expect(screen.getByLabelText('Texto da prova')).toBeTruthy();
    expect(botaoLer().disabled).toBe(true);
    expect(screen.getByText('Informe a banca / instituição da prova.')).toBeTruthy();
    expect(screen.getByText(/Informe o ano da prova com 4 dígitos/)).toBeTruthy();
    expect(screen.getByText('Cole o texto da prova na caixa.')).toBeTruthy();
    // O motivo é ligado ao botão (leitor de tela).
    expect(botaoLer().getAttribute('aria-describedby')).toBe('import-questions-colar-motivo');
  });

  it('sem o ano, continua desligado; completando banca, ano e texto, liga', () => {
    abrir();
    preencher({ ano: '' });
    expect(botaoLer().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2025' } });
    expect(botaoLer().disabled).toBe(false);
    expect(screen.queryByText('Informe a banca / instituição da prova.')).toBeNull();
  });

  it('banca que começa com "NexusMed" é recusada no campo, com o motivo escrito', () => {
    abrir();
    preencher({ banca: 'NexusMed (questão autoral)' });
    expect(botaoLer().disabled).toBe(true);
    expect(screen.getByText(/A banca não pode começar com "NexusMed"/)).toBeTruthy();
  });

  it('nada é gravado ao ler o texto: só depois de confirmar', () => {
    abrir();
    preencher();
    fireEvent.click(botaoLer());
    expect(screen.getByText(/3 questão\(ões\) encontrada\(s\) no texto colado/i)).toBeTruthy();
    expect(importQuestionDraftMock).not.toHaveBeenCalled();
  });
});

describe('ImportQuestionsModal — Colar texto: prévia e gravação', () => {
  it('cola 3 questões (1 sem gabarito): a RPC é chamada 2 vezes, com banca e ano do lote e a alternativa correta certa', async () => {
    abrir();
    preencher();
    lerEAplicarATodas();

    // Prévia: banca e ano do lote, a questão sem gabarito bloqueada com o motivo.
    expect(screen.getByTestId('import-questions-lote').textContent).toContain('ENARE');
    expect(screen.getByTestId('import-questions-lote').textContent).toContain('2025');
    const linha2 = screen.getByTestId('import-questions-row-2');
    expect(within(linha2).getByText('Bloqueada')).toBeTruthy();
    expect(within(linha2).getByText('Sem gabarito.')).toBeTruthy();
    expect(screen.getAllByText('Pronta')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /importar 2 rascunho/i }));
    await waitFor(() => expect(importQuestionDraftMock).toHaveBeenCalledTimes(2));

    const [primeira, terceira] = importQuestionDraftMock.mock.calls.map((c) => c[0] as Question);
    for (const q of [primeira, terceira]) {
      expect(q.institution).toBe('ENARE');
      expect(q.year).toBe(2025);
      expect(q.disciplineId).toBe('disc-pneumo');
      expect(q.themeId).toBe('tema-espirometria');
      expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1);
    }
    expect(primeira.questionStem).toBe('Pergunta um?');
    expect(primeira.options.find((o) => o.isCorrect)?.letter).toBe('B');
    expect(terceira.questionStem).toBe('Pergunta três, com quebra de linha?');
    expect(terceira.options.map((o) => o.letter)).toEqual(['A', 'B', 'C']);
    expect(terceira.options.find((o) => o.isCorrect)?.letter).toBe('C');
    await waitFor(() => screen.getByText(/2 de 2 rascunho\(s\) criado\(s\) com sucesso/i));
  });

  it('a prévia mostra o enunciado e as alternativas, com a correta marcada', () => {
    abrir();
    preencher();
    fireEvent.click(botaoLer());
    const linha3 = screen.getByTestId('import-questions-row-3');
    expect(within(linha3).getByText('Pergunta três, com quebra de linha?')).toBeTruthy();
    expect(within(linha3).getByText(/C\) Três/).textContent).toContain('alternativa correta');
    expect(within(linha3).getByText(/A\) Um/).textContent).not.toContain('alternativa correta');
  });

  it('sem Disciplina e Tema escolhidos, nada fica pronto; escolher por questão também vale', async () => {
    abrir();
    preencher();
    fireEvent.click(botaoLer());
    expect((screen.getByRole('button', { name: /importar 0 rascunho/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Disciplina da questão 1'), { target: { value: 'disc-pneumo' } });
    fireEvent.change(screen.getByLabelText('Tema da questão 1'), { target: { value: 'tema-espirometria' } });
    fireEvent.click(screen.getByRole('button', { name: /importar 1 rascunho/i }));
    await waitFor(() => expect(importQuestionDraftMock).toHaveBeenCalledTimes(1));
    expect((importQuestionDraftMock.mock.calls[0][0] as Question).questionStem).toBe('Pergunta um?');
  });

  it('desmarcar uma questão a tira da gravação', async () => {
    abrir();
    preencher();
    lerEAplicarATodas();
    fireEvent.click(screen.getByLabelText('Importar a questão 1'));
    expect(within(screen.getByTestId('import-questions-row-1')).getByText('Desmarcada')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /importar 1 rascunho/i }));
    await waitFor(() => expect(importQuestionDraftMock).toHaveBeenCalledTimes(1));
    expect((importQuestionDraftMock.mock.calls[0][0] as Question).questionStem).toMatch(/Pergunta três/);
  });

  it('questão anulada no gabarito vem marcada como Anulada e não é gravada', async () => {
    abrir();
    preencher({ texto: '1. Um?\nA) x\nB) y\nResposta: A\n2. Dois?\nA) x\nB) y\n\nGabarito\n1-A\n2-ANULADA\n' });
    lerEAplicarATodas();
    expect(within(screen.getByTestId('import-questions-row-2')).getByText('Anulada')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /importar 1 rascunho/i }));
    await waitFor(() => expect(importQuestionDraftMock).toHaveBeenCalledTimes(1));
  });

  it('numeração pulada aparece como aviso na prévia', () => {
    abrir();
    preencher({ texto: '1. Um?\nA) x\nB) y\nResposta: A\n4. Quatro?\nA) x\nB) y\nResposta: A\n' });
    fireEvent.click(botaoLer());
    expect(within(screen.getByTestId('import-questions-avisos')).getByText(/Numeração pulada: depois da questão 1 vem a 4/)).toBeTruthy();
  });

  it('texto sem questão nenhuma mostra o erro e volta para o texto colado', () => {
    abrir();
    preencher({ texto: 'um texto solto qualquer' });
    fireEvent.click(botaoLer());
    expect(screen.getByText(/não foi possível importar o texto colado/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /voltar ao texto colado/i }));
    expect((screen.getByLabelText('Texto da prova') as HTMLTextAreaElement).value).toBe('um texto solto qualquer');
    expect(importQuestionDraftMock).not.toHaveBeenCalled();
  });
});

describe('ImportQuestionsModal — Colar texto: questão repetida', () => {
  const jaNoSistema: Existentes = [
    // Mesmo enunciado da questão 1, com outras maiúsculas e espaços, banca e ano iguais.
    { clinicalVignette: '', questionStem: 'PERGUNTA   um?', institution: 'enare', year: 2025 },
    // Mesmo enunciado da questão 3, mas de outro ano: não é a mesma.
    { clinicalVignette: '', questionStem: 'Pergunta três, com quebra de linha?', institution: 'ENARE', year: 2024 },
  ];

  it('"Já existe": a questão repetida vem desmarcada e não é gravada; a de outro ano segue', async () => {
    abrir(jaNoSistema);
    preencher();
    lerEAplicarATodas();
    const linha1 = screen.getByTestId('import-questions-row-1');
    expect(within(linha1).getByText('Já existe')).toBeTruthy();
    expect(within(linha1).getByText('Desmarcada')).toBeTruthy();
    expect((within(linha1).getByLabelText('Importar a questão 1') as HTMLInputElement).checked).toBe(false);
    expect(within(screen.getByTestId('import-questions-row-3')).queryByText('Já existe')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /importar 1 rascunho/i }));
    await waitFor(() => expect(importQuestionDraftMock).toHaveBeenCalledTimes(1));
    expect((importQuestionDraftMock.mock.calls[0][0] as Question).questionStem).toMatch(/Pergunta três/);
  });

  it('marcar a questão repetida a põe de volta na gravação', async () => {
    abrir(jaNoSistema);
    preencher();
    lerEAplicarATodas();
    fireEvent.click(screen.getByLabelText('Importar a questão 1'));
    fireEvent.click(screen.getByRole('button', { name: /importar 2 rascunho/i }));
    await waitFor(() => expect(importQuestionDraftMock).toHaveBeenCalledTimes(2));
  });
});

describe('ImportQuestionsModal — Colar texto: repetida no próprio texto e leitura ambígua', () => {
  it('a mesma questão duas vezes no texto: a segunda vem desmarcada como "Repetida neste texto"', async () => {
    abrir();
    preencher({
      texto: '1. Mesma pergunta?\nA) x\nB) y\nResposta: A\n2. Mesma   PERGUNTA?\nA) x\nB) y\nResposta: A\n3. Outra?\nA) x\nB) y\nResposta: B\n',
    });
    lerEAplicarATodas();
    const linha2 = screen.getByTestId('import-questions-row-2');
    expect(within(linha2).getByText('Repetida neste texto')).toBeTruthy();
    expect(within(linha2).getByText('Desmarcada')).toBeTruthy();
    expect(within(screen.getByTestId('import-questions-row-1')).queryByText('Repetida neste texto')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /importar 2 rascunho/i }));
    await waitFor(() => expect(importQuestionDraftMock).toHaveBeenCalledTimes(2));
    expect((importQuestionDraftMock.mock.calls[1][0] as Question).questionStem).toBe('Outra?');
  });

  it('numeração ambígua: as questões envolvidas ficam bloqueadas com o motivo na linha e nada é gravado', () => {
    abrir();
    preencher({
      texto: '1. Dose?\nA) 50 mg/kg/dia\nB) 100 mg/kg/dia dividida em\n2 - 3 tomadas\n2. Outra pergunta.\nA) sim\nB) não\n\nGabarito\n1-A 2-B\n',
    });
    lerEAplicarATodas();
    expect(screen.getAllByText('Numeração ambígua — confira o texto.').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText('Pronta')).toHaveLength(0);
    expect((screen.getByRole('button', { name: /importar 0 rascunho/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(importQuestionDraftMock).not.toHaveBeenCalled();
  });

  it('leitura duvidosa (IMPORT-2b): a questão fica Bloqueada com o motivo na própria linha, e a outra segue', async () => {
    abrir();
    preencher({
      texto: 'QUESTÃO 31\nPaciente com dor.\n(A) IAM\n(B) TEP\nQUESTÃO32\nCriança com febre.\n(A) Otite\n(B) Faringite\nResposta: A\nQUESTÃO 33\nOutra.\n(A) um\n(B) dois\nResposta: B\n',
    });
    lerEAplicarATodas();
    const linha31 = screen.getByTestId('import-questions-row-31');
    expect(within(linha31).getByText('Bloqueada')).toBeTruthy();
    expect(within(linha31).getByText('Leitura duvidosa — confira o texto: sobrou "QUESTÃO32" no meio da alternativa B.')).toBeTruthy();
    expect(within(screen.getByTestId('import-questions-row-33')).getByText('Pronta')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /importar 1 rascunho/i }));
    await waitFor(() => expect(importQuestionDraftMock).toHaveBeenCalledTimes(1));
    expect((importQuestionDraftMock.mock.calls[0][0] as Question).questionStem).toBe('Outra.');
  });
});

describe('ImportQuestionsModal — Colar texto no formato .md', () => {
  const md = `## Questão 1

**Disciplina:** Pneumologia
**Tema:** Espirometria

**Comando da Questão (Pergunta):**
Qual o padrão esperado?

**A)** Restritivo
**B)** Obstrutivo [GABARITO]
`;

  it('o texto no formato .md colado continua funcionando; banca e ano do lote entram onde o texto não traz', async () => {
    abrir();
    preencher({ texto: md, banca: 'USP-SP', ano: '2023' });
    fireEvent.click(botaoLer());
    expect(screen.getByText(/1 questão\(ões\) encontrada\(s\) no texto colado/i)).toBeTruthy();
    // Disciplina e tema vieram do próprio texto: a questão já está pronta.
    fireEvent.click(screen.getByRole('button', { name: /importar 1 rascunho/i }));
    await waitFor(() => expect(importQuestionDraftMock).toHaveBeenCalledTimes(1));
    const q = importQuestionDraftMock.mock.calls[0][0] as Question;
    expect(q.institution).toBe('USP-SP');
    expect(q.year).toBe(2023);
    expect(q.options.find((o) => o.isCorrect)?.letter).toBe('B');
  });
});
