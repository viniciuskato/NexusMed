import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Compendium, Discipline, Theme } from '../../src/types';

// ED-2 — editar a seção direto na página de leitura (admin). O editor visual de verdade é testado à parte
// (editorVisualDeSecao.test.tsx, editarNaLeituraEditorRealED2.test.tsx); aqui ele é trocado por uma caixa de texto simples
// para comandar o que "foi digitado" e se "fiel" é verdadeiro, e conferir a tela em volta: o botão "Editar", o formulário,
// "Salvar" e "Cancelar", o que vai para a gravação e o que fica depois.

const estado = vi.hoisted(() => ({ admin: true }));

vi.mock('../../src/hooks/useEhAdmin', () => ({ useEhAdmin: () => estado.admin }));
vi.mock('../../src/hooks/useScrollMemory', () => ({ useScrollMemory: vi.fn() }));
vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({ ContextualFeedbackPopover: () => null }));
vi.mock('../../src/services/storage', () => ({ StorageService: { saveLastReadingSession: vi.fn() } }));
vi.mock('../../src/repositories/FigurasRepository', () => ({ urlDaFigura: vi.fn().mockResolvedValue(null) }));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: { getBookmarks: vi.fn().mockResolvedValue({ questions: [], compendiums: [], flashcards: [] }), setBookmark: vi.fn() },
}));
vi.mock('../../src/repositories/NotesRepository', () => ({
  notesRepository: { getNotes: vi.fn().mockResolvedValue({}), getRemovedSectionNotes: vi.fn().mockResolvedValue({}), saveNote: vi.fn() },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { createFlashcardFromSection: vi.fn() } }));
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: { getReadingProgress: vi.fn().mockResolvedValue({}), setSectionRead: vi.fn() },
}));
vi.mock('../../src/repositories/MaterialsRepository', () => ({
  materialsRepository: { updateSectionContent: vi.fn().mockResolvedValue(undefined) },
}));
// O editor visual, trocado por uma caixa de texto: cada linha do que se digita vira o texto do campo. Escrever "#FALSO#"
// faz o editor dizer que a formatação não é fiel ao leitor.
vi.mock('../../src/components/editor/EditorVisualCarregavel', () => ({
  EditorVisualCarregavel: ({
    texto,
    onChange,
    rotulo,
    modo,
  }: {
    texto: string;
    onChange: (t: string, info: { fiel: boolean }) => void;
    rotulo?: string;
    modo?: string;
  }) => (
    <textarea
      aria-label={rotulo ?? 'Texto da seção'}
      data-editor-visual={modo ?? 'secao'}
      defaultValue={texto}
      onChange={(e) => onChange(e.target.value, { fiel: !e.target.value.includes('#FALSO#') })}
    />
  ),
}));

const { CompendiumReader } = await import('../../src/components/compendium/CompendiumReader');
const { materialsRepository } = await import('../../src/repositories/MaterialsRepository');
const { esquecerEdicoesSalvas } = await import('../../src/components/compendium/secoesEditadas');
const atualizar = vi.mocked(materialsRepository.updateSectionContent);

const discipline: Discipline = { id: 'd1', name: 'Nefrologia', code: 'NEFRO', icon: 'kidney', description: '', cycle: 'clinico', color: '#0F766E' };
const theme: Theme = { id: 't1', disciplineId: 'd1', name: 'Função renal', description: '', highYield: true, order: 1 };

const compendium: Compendium = {
  id: 'c1',
  disciplineId: 'd1',
  themeId: 't1',
  title: 'Avaliação da função renal',
  subtitle: 'Material de teste',
  estimatedReadTimeMinutes: 10,
  lastUpdated: '2026-09-21T12:00:00.000Z',
  author: 'Equipe Editorial',
  sections: [
    {
      id: 's1',
      title: 'Primeira seção',
      mechanismTag: 'Conduta',
      content: 'Texto da primeira seção.',
      keyTakeaways: ['Primeiro ponto.', 'Segundo ponto.'],
      clinicalPearl: 'Pérola original.',
      warningAlert: 'Alerta original.',
    },
    { id: 's2', title: 'Segunda seção', content: 'Texto da segunda seção.', keyTakeaways: [] },
    { id: 's3', title: 'Terceira seção', content: 'Texto da terceira seção.', keyTakeaways: ['Só um.'] },
  ],
  references: [],
};

function abrirLeitor(material: Compendium = compendium, extras: { onSectionSaved?: () => void } = {}) {
  return render(
    <CompendiumReader
      compendium={material}
      compendiums={[material]}
      onOpenCompendium={vi.fn()}
      disciplines={[discipline]}
      themes={[theme]}
      onBack={vi.fn()}
      onOpenQuestionsForTheme={vi.fn()}
      onOpenQuestionsForMaterial={vi.fn()}
      onOpenFlashcardsForTheme={vi.fn()}
      {...extras}
    />
  );
}

const botoesEditar = () => screen.queryAllByRole('button', { name: /^Editar a seção/ });
const secao = (id: string) => document.getElementById(id) as HTMLElement;
const editarSecao = (titulo: string) => fireEvent.click(screen.getByRole('button', { name: `Editar a seção ${titulo}` }));
const digitar = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const salvar = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

beforeEach(() => {
  estado.admin = true;
  esquecerEdicoesSalvas();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('ED-2 — o botão "Editar" é só do admin', () => {
  it('admin: exatamente um botão "Editar" por seção, dentro da própria seção', () => {
    abrirLeitor();
    expect(botoesEditar()).toHaveLength(3);
    for (const s of compendium.sections) {
      const doGrupo = within(secao(s.id)).getAllByRole('button', { name: /^Editar a seção/ });
      expect(doGrupo).toHaveLength(1);
      expect(doGrupo[0].getAttribute('aria-label')).toBe(`Editar a seção ${s.title}`);
      expect(doGrupo[0].textContent).toMatch(/Editar/);
    }
  });

  it('quem não é admin não vê "Editar" em nenhuma seção', () => {
    estado.admin = false;
    abrirLeitor();
    expect(botoesEditar()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  });
});

describe('ED-2 — "Editar" troca a seção, no mesmo lugar, por um editor', () => {
  it('abre o título, o texto, os pontos-chave, a Pérola e o Alerta, com "Salvar" e "Cancelar"', () => {
    abrirLeitor();
    editarSecao('Primeira seção');

    const dentro = within(secao('s1'));
    expect((dentro.getByLabelText('Título da seção') as HTMLInputElement).value).toBe('Primeira seção');
    expect((dentro.getByLabelText('Texto da seção') as HTMLTextAreaElement).value).toBe('Texto da primeira seção.');
    expect((dentro.getByLabelText('Ponto-chave 1') as HTMLTextAreaElement).value).toBe('Primeiro ponto.');
    expect((dentro.getByLabelText('Ponto-chave 2') as HTMLTextAreaElement).value).toBe('Segundo ponto.');
    expect((dentro.getByLabelText('Pérola clínica') as HTMLTextAreaElement).value).toBe('Pérola original.');
    expect((dentro.getByLabelText('Alerta de armadilha') as HTMLTextAreaElement).value).toBe('Alerta original.');
    expect(dentro.getByRole('button', { name: 'Salvar' })).toBeTruthy();
    expect(dentro.getByRole('button', { name: 'Cancelar' })).toBeTruthy();

    // O texto principal usa o editor da seção; os campos curtos, o de uma linha.
    expect(dentro.getByLabelText('Texto da seção').getAttribute('data-editor-visual')).toBe('secao');
    for (const rotulo of ['Ponto-chave 1', 'Pérola clínica', 'Alerta de armadilha']) {
      expect(dentro.getByLabelText(rotulo).getAttribute('data-editor-visual'), rotulo).toBe('linha');
    }
    // A leitura dessa seção sai do lugar (o editor ocupa o lugar dela); as outras seções continuam como estavam.
    expect(dentro.queryByText('Marcar lida')).toBeNull();
    expect(within(secao('s2')).getByText('Texto da segunda seção.')).toBeTruthy();
  });

  it('só uma seção em edição por vez: com uma aberta, "Editar" das outras fica desligado', () => {
    abrirLeitor();
    editarSecao('Primeira seção');

    const restantes = botoesEditar();
    expect(restantes).toHaveLength(2);
    for (const b of restantes) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelectorAll('[data-testid="edicao-da-secao"]')).toHaveLength(1);

    // Cancelando, as outras voltam a poder abrir.
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(botoesEditar()).toHaveLength(3);
    for (const b of botoesEditar()) expect((b as HTMLButtonElement).disabled).toBe(false);
  });

  it('seção sem Pontos-chave, Pérola nem Alerta também os oferece, vazios', () => {
    abrirLeitor();
    editarSecao('Segunda seção');
    const dentro = within(secao('s2'));
    expect(dentro.queryByLabelText('Ponto-chave 1')).toBeNull();
    expect(dentro.getByRole('button', { name: 'Adicionar ponto-chave' })).toBeTruthy();
    expect((dentro.getByLabelText('Pérola clínica') as HTMLTextAreaElement).value).toBe('');
    expect((dentro.getByLabelText('Alerta de armadilha') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('ED-2 — "Salvar" grava só o que mudou, pela função que registra versão', () => {
  it('mudou o título e a Pérola: um pedido com só esses dois campos, e a leitura mostra o novo, com o aviso "Seção salva"', async () => {
    const aoSalvar = vi.fn();
    abrirLeitor(compendium, { onSectionSaved: aoSalvar });
    editarSecao('Primeira seção');
    fireEvent.change(screen.getByLabelText('Título da seção'), { target: { value: '  Título novo  ' } });
    digitar('Pérola clínica', 'Pérola nova.');
    salvar();

    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    const [id, patch, motivo] = atualizar.mock.calls[0];
    expect(id).toBe('s1');
    expect(patch).toStrictEqual({ title: 'Título novo', clinicalPearl: 'Pérola nova.' });
    expect(typeof motivo).toBe('string');

    // Voltou à leitura, já com o texto novo, e avisou.
    expect(await screen.findByText('Seção salva')).toBeTruthy();
    expect(document.querySelectorAll('[data-testid="edicao-da-secao"]')).toHaveLength(0);
    const dentro = within(secao('s1'));
    expect(dentro.getByRole('heading', { name: 'Título novo' })).toBeTruthy();
    expect(dentro.getByText('Pérola nova.')).toBeTruthy();
    expect(dentro.queryByText('Pérola original.')).toBeNull();
    expect(dentro.getByText('Texto da primeira seção.')).toBeTruthy();
    expect(botoesEditar()).toHaveLength(3);
    expect(aoSalvar).toHaveBeenCalledTimes(1);
  });

  it('mudou o texto principal e um ponto-chave: só content e keyTakeaways', async () => {
    abrirLeitor();
    editarSecao('Primeira seção');
    digitar('Texto da seção', 'Texto reescrito.');
    digitar('Ponto-chave 2', 'Segundo ponto, melhorado.');
    salvar();

    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    expect(atualizar.mock.calls[0][1]).toStrictEqual({
      content: 'Texto reescrito.',
      keyTakeaways: ['Primeiro ponto.', 'Segundo ponto, melhorado.'],
    });
    expect(await screen.findByText('Texto reescrito.')).toBeTruthy();
    expect(within(secao('s1')).getByText('Segundo ponto, melhorado.')).toBeTruthy();
  });

  it('adicionar e remover pontos-chave: a lista final, sem ponto vazio', async () => {
    abrirLeitor();
    editarSecao('Primeira seção');
    fireEvent.click(screen.getByRole('button', { name: 'Remover ponto-chave 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ponto-chave' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ponto-chave' })); // este fica vazio e some
    digitar('Ponto-chave 2', 'Terceiro ponto.');
    salvar();

    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    expect(atualizar.mock.calls[0][1]).toStrictEqual({ keyTakeaways: ['Segundo ponto.', 'Terceiro ponto.'] });
  });

  it('esvaziar a Pérola e o Alerta: grava os dois como ausentes (undefined), sem tocar no resto', async () => {
    abrirLeitor();
    editarSecao('Primeira seção');
    digitar('Pérola clínica', '   ');
    digitar('Alerta de armadilha', '');
    salvar();

    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    const patch = atualizar.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(['clinicalPearl', 'warningAlert']);
    expect(patch.clinicalPearl).toBeUndefined();
    expect(patch.warningAlert).toBeUndefined();
    await waitFor(() => expect(within(secao('s1')).queryByText('Pérola original.')).toBeNull());
  });

  it('salvar sem nenhuma mudança não grava nada (AGENTS.md, item 17): fecha e avisa', async () => {
    abrirLeitor();
    editarSecao('Primeira seção');
    salvar();

    expect(await screen.findByText('Nenhuma alteração para salvar.')).toBeTruthy();
    expect(atualizar).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-testid="edicao-da-secao"]')).toHaveLength(0);
  });

  it('digitar e voltar ao que estava também não conta como mudança', async () => {
    abrirLeitor();
    editarSecao('Primeira seção');
    digitar('Texto da seção', 'Outro texto');
    digitar('Texto da seção', 'Texto da primeira seção.');
    fireEvent.change(screen.getByLabelText('Título da seção'), { target: { value: 'Primeira seção  ' } });
    salvar();

    await screen.findByText('Nenhuma alteração para salvar.');
    expect(atualizar).not.toHaveBeenCalled();
  });

  it('título vazio: "Salvar" fica desligado, com a razão à vista', () => {
    abrirLeitor();
    editarSecao('Primeira seção');
    fireEvent.change(screen.getByLabelText('Título da seção'), { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Escreva o título da seção/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Título da seção'), { target: { value: 'Voltou' } });
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('editor dizendo fiel=false: "Salvar" fica desligado, com a explicação à vista; ajustar o trecho liga de novo', async () => {
    abrirLeitor();
    editarSecao('Primeira seção');
    digitar('Texto da seção', 'Texto #FALSO# que o leitor mostraria diferente');

    const botao = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(screen.getByText(/Salvar está desligado/).textContent).toMatch(/não aparece no leitor do jeito que está no editor/);
    fireEvent.click(botao);
    expect(atualizar).not.toHaveBeenCalled();

    digitar('Texto da seção', 'Texto ajustado');
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/Salvar está desligado/)).toBeNull();
    salvar();
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    expect(atualizar.mock.calls[0][1]).toStrictEqual({ content: 'Texto ajustado' });
  });

  it('erro ao gravar: mensagem em português, o que foi digitado continua nos campos e o editor continua aberto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    atualizar.mockRejectedValueOnce(new Error('permission denied'));
    abrirLeitor();
    editarSecao('Primeira seção');
    fireEvent.change(screen.getByLabelText('Título da seção'), { target: { value: 'Título que não pode se perder' } });
    digitar('Texto da seção', 'Texto que não pode se perder.');
    digitar('Pérola clínica', 'Pérola que não pode se perder.');
    salvar();

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/Não foi possível salvar a seção/);
    expect(alerta.textContent).toMatch(/continua aqui/);
    expect(alerta.textContent).not.toMatch(/permission denied/);
    expect(document.querySelectorAll('[data-testid="edicao-da-secao"]')).toHaveLength(1);
    expect((screen.getByLabelText('Título da seção') as HTMLInputElement).value).toBe('Título que não pode se perder');
    expect((screen.getByLabelText('Texto da seção') as HTMLTextAreaElement).value).toBe('Texto que não pode se perder.');
    expect((screen.getByLabelText('Pérola clínica') as HTMLTextAreaElement).value).toBe('Pérola que não pode se perder.');
    expect(screen.queryByText('Seção salva')).toBeNull();
    // A leitura das outras seções e o texto de antes não foram trocados.
    expect(within(secao('s2')).getByText('Texto da segunda seção.')).toBeTruthy();

    // Tentar de novo grava o mesmo (e dá certo).
    salvar();
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(2));
    expect(atualizar.mock.calls[1][1]).toStrictEqual(atualizar.mock.calls[0][1]);
    expect(await screen.findByText('Seção salva')).toBeTruthy();
  });

  it('enquanto grava, os botões ficam desligados (sem gravar duas vezes)', async () => {
    let terminar: () => void = () => undefined;
    atualizar.mockImplementationOnce(() => new Promise<void>((resolve) => (terminar = resolve)));
    abrirLeitor();
    editarSecao('Primeira seção');
    digitar('Texto da seção', 'Novo texto.');
    salvar();

    const botao = await screen.findByRole('button', { name: 'Salvando…' });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => terminar());
    expect(await screen.findByText('Seção salva')).toBeTruthy();
    expect(atualizar).toHaveBeenCalledTimes(1);
  });

  it('o texto salvo continua na tela ao sair do material e voltar, enquanto a lista do app não é recarregada', async () => {
    const primeira = abrirLeitor();
    editarSecao('Primeira seção');
    digitar('Texto da seção', 'Texto salvo na leitura.');
    salvar();
    await screen.findByText('Seção salva');
    primeira.unmount();

    abrirLeitor(); // a lista do app ainda traz o texto antigo
    expect(screen.getByText('Texto salvo na leitura.')).toBeTruthy();
    expect(screen.queryByText('Texto da primeira seção.')).toBeNull();
    cleanup();

    // Quando a lista é recarregada e traz o texto de agora (ou outro), vale o da lista.
    const recarregado: Compendium = {
      ...compendium,
      sections: compendium.sections.map((s) => (s.id === 's1' ? { ...s, content: 'Texto de outra edição.' } : s)),
    };
    abrirLeitor(recarregado);
    expect(screen.getByText('Texto de outra edição.')).toBeTruthy();
    expect(screen.queryByText('Texto salvo na leitura.')).toBeNull();
  });
});

describe('ED-2 — "Cancelar" e sair da página', () => {
  it('Cancelar com mudança pergunta "Descartar as alterações?": "não" mantém, "sim" descarta sem gravar', () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    abrirLeitor();
    editarSecao('Primeira seção');
    digitar('Texto da seção', 'Texto mudado.');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(confirmar).toHaveBeenCalledWith('Descartar as alterações?');
    expect(document.querySelectorAll('[data-testid="edicao-da-secao"]')).toHaveLength(1);
    expect((screen.getByLabelText('Texto da seção') as HTMLTextAreaElement).value).toBe('Texto mudado.');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(confirmar).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll('[data-testid="edicao-da-secao"]')).toHaveLength(0);
    expect(screen.getByText('Texto da primeira seção.')).toBeTruthy();
    expect(atualizar).not.toHaveBeenCalled();
  });

  it('Cancelar sem mudança fecha direto, sem perguntar', () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    abrirLeitor();
    editarSecao('Primeira seção');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(confirmar).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-testid="edicao-da-secao"]')).toHaveLength(0);
  });

  it('sair da página (beforeunload) com edição não salva avisa; sem edição, ou depois de fechar, não', () => {
    const tentarSair = () => {
      const evento = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(evento);
      return evento.defaultPrevented;
    };
    abrirLeitor();
    expect(tentarSair()).toBe(false);

    editarSecao('Primeira seção');
    expect(tentarSair()).toBe(false); // aberto, mas sem mudança

    digitar('Pérola clínica', 'Mudou.');
    expect(tentarSair()).toBe(true);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(tentarSair()).toBe(false);
  });

  it('o aviso de sair some depois de salvar', async () => {
    abrirLeitor();
    editarSecao('Primeira seção');
    digitar('Pérola clínica', 'Mudou.');
    const evento = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);

    salvar();
    await screen.findByText('Seção salva');
    const depois = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(depois);
    expect(depois.defaultPrevented).toBe(false);
  });
});

describe('ED-2 — texto que o editor visual não reconhece abre num editor de texto, com prévia', () => {
  const FRASE = 'Este trecho tem uma formatação que o editor visual não reconhece; editando como texto.';
  const comTextos = (content: string, extra: Partial<Compendium['sections'][number]> = {}): Compendium => ({
    ...compendium,
    sections: [{ id: 's1', title: 'Primeira seção', content, keyTakeaways: [], ...extra }],
  });

  it('texto não seguro e não normalizável (HTML): editor de texto com a frase e a prévia pelo leitor, sem o botão', async () => {
    const material = comTextos('Texto com <b>HTML</b> dentro.');
    abrirLeitor(material);
    editarSecao('Primeira seção');

    const dentro = within(secao('s1'));
    expect(dentro.getByText(FRASE)).toBeTruthy();
    const caixa = dentro.getByLabelText('Texto da seção') as HTMLTextAreaElement;
    expect(caixa.tagName).toBe('TEXTAREA');
    expect(caixa.hasAttribute('data-editor-visual')).toBe(false); // não é o editor visual
    expect(caixa.value).toBe('Texto com <b>HTML</b> dentro.');
    // A prévia usa a tipografia do leitor.
    const previa = dentro.getByTestId('previa-do-leitor-texto-da-secao');
    expect(previa.textContent).toBe('Texto com <b>HTML</b> dentro.');
    expect(previa.querySelector('p')).not.toBeNull();

    // Dá tempo de a conferência de "igual para o leitor" terminar: nenhum botão.
    await new Promise((r) => setTimeout(r, 700));
    expect(dentro.queryByRole('button', { name: 'Abrir no editor visual' })).toBeNull();
  });

  it('a prévia acompanha o que se digita', async () => {
    abrirLeitor(comTextos('Texto com <b>HTML</b> dentro.'));
    editarSecao('Primeira seção');
    const dentro = within(secao('s1'));
    fireEvent.change(dentro.getByLabelText('Texto da seção'), { target: { value: 'Agora **negrito** e <i>HTML</i>.' } });
    const previa = dentro.getByTestId('previa-do-leitor-texto-da-secao');
    expect(previa.querySelector('strong')?.textContent).toBe('negrito');
  });

  it('texto normalizável (lista com * e espaço no fim): mostra "Abrir no editor visual", que troca para o visual com o texto normalizado', async () => {
    const original = 'As causas são:\n* uma\n* outra  ';
    abrirLeitor(comTextos(original));
    editarSecao('Primeira seção');
    const dentro = within(secao('s1'));
    expect(dentro.getByText(FRASE)).toBeTruthy();

    const abrir = await dentro.findByRole('button', { name: 'Abrir no editor visual' });
    // Até clicar, nada mudou no que será gravado.
    salvar();
    await screen.findByText('Nenhuma alteração para salvar.');
    expect(atualizar).not.toHaveBeenCalled();

    editarSecao('Primeira seção');
    const abrir2 = await within(secao('s1')).findByRole('button', { name: 'Abrir no editor visual' });
    expect(abrir).not.toBe(abrir2);
    fireEvent.click(abrir2);

    const visual = within(secao('s1')).getByLabelText('Texto da seção') as HTMLTextAreaElement;
    expect(visual.getAttribute('data-editor-visual')).toBe('secao');
    expect(visual.value).toBe('As causas são:\n\n- uma\n- outra');
    expect(within(secao('s1')).queryByText(FRASE)).toBeNull();

    // A normalização só é gravada se a pessoa salvar.
    expect(atualizar).not.toHaveBeenCalled();
    salvar();
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    expect(atualizar.mock.calls[0][1]).toStrictEqual({ content: 'As causas são:\n\n- uma\n- outra' });
  });

  it('cancelar depois de abrir no editor visual descarta a normalização (pergunta antes, pois mudou o texto)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    abrirLeitor(comTextos('Um parágrafo.  '));
    editarSecao('Primeira seção');
    fireEvent.click(await within(secao('s1')).findByRole('button', { name: 'Abrir no editor visual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(window.confirm).toHaveBeenCalledWith('Descartar as alterações?');
    expect(atualizar).not.toHaveBeenCalled();
    expect(screen.getByText('Um parágrafo.')).toBeTruthy();
  });

  it('o botão só vale para o texto que está na caixa: se o texto muda, a oferta antiga some', async () => {
    abrirLeitor(comTextos('* um\n* dois'));
    editarSecao('Primeira seção');
    const dentro = within(secao('s1'));
    await dentro.findByRole('button', { name: 'Abrir no editor visual' });
    fireEvent.change(dentro.getByLabelText('Texto da seção'), { target: { value: 'Agora com <b>HTML</b>' } });
    expect(dentro.queryByRole('button', { name: 'Abrir no editor visual' })).toBeNull();
  });

  it('campo de uma linha não seguro (Pérola com quebra de linha dentro): editor de texto, sem botão; com quebra no fim: com botão', async () => {
    const material = comTextos('Texto simples.', { clinicalPearl: 'Primeira linha\nsegunda linha', warningAlert: 'Alerta com quebra no fim\n' });
    abrirLeitor(material);
    editarSecao('Primeira seção');
    const dentro = within(secao('s1'));

    const perola = dentro.getByLabelText('Pérola clínica') as HTMLTextAreaElement;
    expect(perola.hasAttribute('data-editor-visual')).toBe(false);
    const alerta = dentro.getByLabelText('Alerta de armadilha') as HTMLTextAreaElement;
    expect(alerta.hasAttribute('data-editor-visual')).toBe(false);
    expect(dentro.getAllByText(FRASE)).toHaveLength(2);

    const botoes = await dentro.findAllByRole('button', { name: 'Abrir no editor visual' });
    expect(botoes).toHaveLength(1); // só o Alerta é normalizável
    fireEvent.click(botoes[0]);
    expect((dentro.getByLabelText('Alerta de armadilha') as HTMLTextAreaElement).getAttribute('data-editor-visual')).toBe('linha');
    expect((dentro.getByLabelText('Alerta de armadilha') as HTMLTextAreaElement).value).toBe('Alerta com quebra no fim');
    expect(dentro.getByText(FRASE)).toBeTruthy(); // a Pérola continua como texto
  });

  it('em texto não seguro editado como texto, salvar grava o que foi digitado, sem aparar', async () => {
    abrirLeitor(comTextos('Texto com <b>HTML</b>.'));
    editarSecao('Primeira seção');
    fireEvent.change(within(secao('s1')).getByLabelText('Texto da seção'), { target: { value: 'Texto com <b>HTML</b> e mais.  ' } });
    salvar();
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    expect(atualizar.mock.calls[0][1]).toStrictEqual({ content: 'Texto com <b>HTML</b> e mais.  ' });
  });
});

describe('ED-2 — rótulos e dicas em português, para quem não programa', () => {
  it('"Editar" é discreto (ícone de lápis e texto) e o editor explica cada campo', () => {
    abrirLeitor();
    const botao = within(secao('s1')).getByRole('button', { name: /^Editar a seção/ });
    expect(botao.textContent?.trim()).toBe('Editar');
    expect(botao.querySelector('svg')).not.toBeNull();
    expect(botao.getAttribute('title')).toMatch(/\S{3,}/);

    fireEvent.click(botao);
    const dentro = within(secao('s1'));
    for (const rotulo of ['Título da seção', 'Texto da seção', 'Pontos-chave', 'Pérola clínica', 'Alerta de armadilha']) {
      expect(dentro.getAllByText(rotulo).length, rotulo).toBeGreaterThan(0);
    }
    expect(dentro.getByRole('button', { name: 'Salvar' }).textContent).toBe('Salvar');
    expect(dentro.getByRole('button', { name: 'Cancelar' }).textContent).toBe('Cancelar');
    // Cada campo tem uma dica curta, logo abaixo do nome.
    for (const campo of ['titulo', 'texto-da-secao', 'pontos-chave', 'perola', 'alerta']) {
      const dica = dentro.getByTestId(`campo-${campo}`).querySelector('[data-dica]');
      expect(dica?.textContent, campo).toMatch(/\S{3,}/);
    }
  });
});
