import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Compendium, Discipline, Theme } from '../../src/types';

// Missão 42-A/42-B — Entrada assistida de materiais.
//
// Prova o fluxo do wizard "Importar material" na Área Editorial sem precisar
// de Supabase real: mocka `materialsRepository.importCompendiumDraft` (42-B:
// gravação atômica dedicada, não mais `saveCompendium`) e simula a seleção
// de um arquivo via `File`/`FileReader` (jsdom). Cobre: arquivo válido ->
// pré-visualização -> confirmar (só então grava); arquivo inválido -> erro
// em linguagem simples, sem gravação; duplicata -> bloqueada; e cancelar
// antes de confirmar -> nenhuma gravação.

const importCompendiumDraftMock = vi.fn().mockImplementation((c: unknown) => Promise.resolve(c));
vi.mock('../../src/repositories/MaterialsRepository', () => ({
  materialsRepository: {
    importCompendiumDraft: (...args: unknown[]) => importCompendiumDraftMock(...args),
  },
}));

import { ImportMaterialModal } from '../../src/components/admin/ImportMaterialModal';

const discipline: Discipline = {
  id: 'disc-infecto',
  name: 'Infectologia',
  code: 'INFECTO',
  icon: 'bug',
  description: '',
  cycle: 'clinico',
  color: '#000',
};

const theme: Theme = {
  id: 'tema-clinica',
  disciplineId: 'disc-infecto',
  name: 'Clínica',
  description: '',
  highYield: false,
  order: 1,
};

const validYaml = `
title: "Meningite Bacteriana Aguda"
subtitle: "Da fisiopatologia ao manejo"
disciplineName: Infectologia
themeName: Clínica
author: "Equipe Editorial"
estimatedReadTimeMinutes: 22
tags:
  - meningite
sections:
  - id: definicao
    title: Definição
    content: Texto da seção.
    keyTakeaways:
      - Ponto 1
references:
  - "Referência 1"
`;

function makeYamlFile(contents: string, name = 'compendio.yaml'): File {
  const file = new File([contents], name, { type: 'application/x-yaml' });
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
  importCompendiumDraftMock.mockClear();
});

describe('ImportMaterialModal', () => {
  it('mostra pré-visualização de um arquivo válido e só grava após confirmar', async () => {
    const onImported = vi.fn();
    render(
      <ImportMaterialModal
        disciplines={[discipline]}
        themes={[theme]}
        compendiums={[]}
        onClose={vi.fn()}
        onImported={onImported}
      />
    );

    await selectFile(makeYamlFile(validYaml));

    await waitFor(() => screen.getByText('Meningite Bacteriana Aguda'));
    expect(screen.getByText(/apenas um/i)).toBeTruthy(); // aviso "cria apenas um rascunho"
    expect(importCompendiumDraftMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /salvar rascunho/i }));

    await waitFor(() => expect(importCompendiumDraftMock).toHaveBeenCalledTimes(1));
    const saved = importCompendiumDraftMock.mock.calls[0][0] as Compendium;
    expect(saved.title).toBe('Meningite Bacteriana Aguda');
    expect(saved.disciplineId).toBe('disc-infecto');
    expect(saved.themeId).toBe('tema-clinica');
    expect(saved.sections).toHaveLength(1);
    expect(onImported).toHaveBeenCalledTimes(1);
    await waitFor(() => screen.getByText(/criado com sucesso/i));
  });

  it('mostra erro em linguagem simples para arquivo inválido e não grava nada', async () => {
    render(
      <ImportMaterialModal
        disciplines={[discipline]}
        themes={[theme]}
        compendiums={[]}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />
    );

    await selectFile(makeYamlFile('subtitle: "sem título nem seções"'));

    await waitFor(() => screen.getByText(/não foi possível importar/i));
    expect(screen.getByText(/título/i)).toBeTruthy();
    expect(importCompendiumDraftMock).not.toHaveBeenCalled();
  });

  it('bloqueia confirmação quando já existe material com o mesmo título', async () => {
    const existing: Compendium = {
      id: 'existing-id',
      disciplineId: 'disc-infecto',
      themeId: 'tema-clinica',
      title: 'Meningite Bacteriana Aguda',
      subtitle: '',
      estimatedReadTimeMinutes: 10,
      lastUpdated: '',
      author: '',
      sections: [],
      references: [],
    };
    render(
      <ImportMaterialModal
        disciplines={[discipline]}
        themes={[theme]}
        compendiums={[existing]}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />
    );

    await selectFile(makeYamlFile(validYaml));

    await waitFor(() => screen.getByText(/já existe um material com o título/i));
    const confirmButton = screen.getByRole('button', { name: /salvar rascunho/i }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    fireEvent.click(confirmButton);
    expect(importCompendiumDraftMock).not.toHaveBeenCalled();
  });

  it('cancelar antes de confirmar fecha sem gravar nada', async () => {
    const onClose = vi.fn();
    render(
      <ImportMaterialModal
        disciplines={[discipline]}
        themes={[theme]}
        compendiums={[]}
        onClose={onClose}
        onImported={vi.fn()}
      />
    );

    await selectFile(makeYamlFile(validYaml));
    await waitFor(() => screen.getByText('Meningite Bacteriana Aguda'));

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(importCompendiumDraftMock).not.toHaveBeenCalled();
  });

  it('falha na gravação atômica mostra erro, não declara sucesso e não chama onImported', async () => {
    importCompendiumDraftMock.mockRejectedValueOnce(new Error('falha simulada de rede/servidor'));
    const onImported = vi.fn();
    render(
      <ImportMaterialModal
        disciplines={[discipline]}
        themes={[theme]}
        compendiums={[]}
        onClose={vi.fn()}
        onImported={onImported}
      />
    );

    await selectFile(makeYamlFile(validYaml));
    await waitFor(() => screen.getByText('Meningite Bacteriana Aguda'));
    fireEvent.click(screen.getByRole('button', { name: /salvar rascunho/i }));

    await waitFor(() => screen.getByText(/não foi possível salvar o rascunho agora/i));
    expect(screen.queryByText(/criado com sucesso/i)).toBeNull();
    expect(onImported).not.toHaveBeenCalled();
  });
});
