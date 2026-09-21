import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Discipline, Question, Theme } from '../../src/types';

// Importação assistida de QUESTÕES ("Importar questões" — equivalente de
// ImportMaterialModal, antes inexistente para questões).
//
// Prova o fluxo do wizard sem precisar de Supabase real: mocka
// `questionsRepository.importQuestionDraft` (gravação atômica dedicada) e
// simula a seleção de um arquivo via `File`/`FileReader` (jsdom). Cobre:
// lote válido -> pré-visualização em lista -> confirmar cria só as linhas
// prontas; linha sem tema exige seleção manual antes de contar como pronta;
// arquivo inválido -> erro em linguagem simples, sem gravação; cancelar
// antes de confirmar -> nenhuma gravação.

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

const validBatch = `
## Questão 1

**Disciplina:** Pneumologia
**Tema:** Espirometria
**Instituição / Banca:** ENARE
**Ano:** 2025

**Comando da Questão (Pergunta):**
Qual o padrão espirométrico esperado?

**A)** Padrão restritivo
**Explicação A:** Incorreto.
**B)** Padrão obstrutivo [GABARITO]
**Explicação B:** Correto.

## Questão 2

**Disciplina:** Pneumologia
**Instituição / Banca:** USP-SP
**Ano:** 2024

**Comando da Questão (Pergunta):**
Segunda pergunta, sem tema informado.

**A)** X
**B)** Y [GABARITO]
`;

function makeMarkdownFile(contents: string, name = 'questoes.md'): File {
  const file = new File([contents], name, { type: 'text/markdown' });
  // jsdom (ambiente destes testes) ainda não implementa File.prototype.text() —
  // API padrão em navegadores reais, usada pelo componente para ler o arquivo.
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(contents) });
  return file;
}

async function selectFile(file: File) {
  const input = screen.getByLabelText(/selecionar arquivo/i, { selector: 'input' }) as HTMLInputElement;
  await fireEvent.change(input, { target: { files: [file] } });
}

afterEach(() => {
  cleanup();
  importQuestionDraftMock.mockClear();
});

describe('ImportQuestionsModal', () => {
  it('mostra a lista de questões do lote e só grava as prontas após confirmar', async () => {
    const onImported = vi.fn();
    render(
      <ImportQuestionsModal disciplines={[discipline]} themes={[theme]} onClose={vi.fn()} onImported={onImported} />
    );

    await selectFile(makeMarkdownFile(validBatch));

    await waitFor(() => screen.getByText(/2 questão\(ões\) encontrada\(s\)/i));
    expect(importQuestionDraftMock).not.toHaveBeenCalled();

    // Questão 1 está pronta (disciplina e tema resolvidos); Questão 2 falta tema.
    expect(screen.getByText('Pronta')).toBeTruthy();
    expect(screen.getByText('Falta disciplina/tema')).toBeTruthy();
    expect(screen.getByRole('button', { name: /importar 1 rascunho/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /importar 1 rascunho/i }));

    await waitFor(() => expect(importQuestionDraftMock).toHaveBeenCalledTimes(1));
    const saved = importQuestionDraftMock.mock.calls[0][0] as Question;
    expect(saved.disciplineId).toBe('disc-pneumo');
    expect(saved.themeId).toBe('tema-espirometria');
    expect(saved.compendiumRefId).toBe(''); // sem palpite automático de vínculo
    expect(saved.options.filter((o) => o.isCorrect)).toHaveLength(1);
    expect(onImported).toHaveBeenCalledTimes(1);
    await waitFor(() => screen.getByText(/1 de 1 rascunho\(s\) criado\(s\) com sucesso/i));
  });

  it('selecionar o tema manualmente na linha incompleta a torna pronta e importável', async () => {
    render(
      <ImportQuestionsModal disciplines={[discipline]} themes={[theme]} onClose={vi.fn()} onImported={vi.fn()} />
    );

    await selectFile(makeMarkdownFile(validBatch));
    await waitFor(() => screen.getByText(/2 questão\(ões\) encontrada\(s\)/i));

    const themeSelect = screen.getByDisplayValue(/"não encontrado" — selecione um|selecione/i, { selector: 'select' });
    fireEvent.change(themeSelect, { target: { value: 'tema-espirometria' } });

    await waitFor(() => expect(screen.getAllByText('Pronta')).toHaveLength(2));
    expect(screen.getByRole('button', { name: /importar 2 rascunho/i })).toBeTruthy();
  });

  it('mostra erro em linguagem simples quando o arquivo não tem nenhum bloco "## Questão"', async () => {
    render(
      <ImportQuestionsModal disciplines={[discipline]} themes={[theme]} onClose={vi.fn()} onImported={vi.fn()} />
    );

    await selectFile(makeMarkdownFile('Só um texto solto, sem heading nenhum.'));

    await waitFor(() => screen.getByText(/não foi possível importar/i));
    expect(screen.getByText(/## Questão/)).toBeTruthy();
    expect(importQuestionDraftMock).not.toHaveBeenCalled();
  });

  it('bloqueia uma linha sem Comando da Questão/alternativas suficientes, sem impedir as demais', async () => {
    const batch = `
## Questão 1

**Comando da Questão (Pergunta):**
Pergunta incompleta.

**A)** Única alternativa

## Questão 2

**Disciplina:** Pneumologia
**Tema:** Espirometria
**Comando da Questão (Pergunta):** Pergunta válida
**A)** X
**B)** Y [GABARITO]
`;
    render(
      <ImportQuestionsModal disciplines={[discipline]} themes={[theme]} onClose={vi.fn()} onImported={vi.fn()} />
    );

    await selectFile(makeMarkdownFile(batch));
    await waitFor(() => screen.getByText('Bloqueada'));
    expect(screen.getByText('Pronta')).toBeTruthy();
    expect(screen.getByRole('button', { name: /importar 1 rascunho/i })).toBeTruthy();
  });

  it('cancelar antes de confirmar fecha sem gravar nada', async () => {
    const onClose = vi.fn();
    render(
      <ImportQuestionsModal disciplines={[discipline]} themes={[theme]} onClose={onClose} onImported={vi.fn()} />
    );

    await selectFile(makeMarkdownFile(validBatch));
    await waitFor(() => screen.getByText(/2 questão\(ões\) encontrada\(s\)/i));

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(importQuestionDraftMock).not.toHaveBeenCalled();
  });

  it('falha na gravação de uma linha é reportada, sem travar as demais nem chamar onImported se nada foi salvo', async () => {
    importQuestionDraftMock.mockRejectedValueOnce(new Error('falha simulada de rede/servidor'));
    const onImported = vi.fn();
    const batch = `
## Questão 1

**Disciplina:** Pneumologia
**Tema:** Espirometria
**Comando da Questão (Pergunta):** Pergunta válida
**A)** X
**B)** Y [GABARITO]
`;
    render(
      <ImportQuestionsModal disciplines={[discipline]} themes={[theme]} onClose={vi.fn()} onImported={onImported} />
    );

    await selectFile(makeMarkdownFile(batch));
    await waitFor(() => screen.getByRole('button', { name: /importar 1 rascunho/i }));
    fireEvent.click(screen.getByRole('button', { name: /importar 1 rascunho/i }));

    await waitFor(() => screen.getByText(/0 de 1 rascunho\(s\) criado\(s\) com sucesso/i));
    expect(screen.getByText(/falha simulada de rede\/servidor/)).toBeTruthy();
    expect(onImported).not.toHaveBeenCalled();
  });
});
