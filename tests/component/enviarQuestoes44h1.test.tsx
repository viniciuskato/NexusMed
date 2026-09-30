import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { Compendium, Discipline, Theme } from '../../src/types';
import type { MaterialSubmission } from '../../src/repositories/MaterialSubmissionsRepository';
import type { QuestionSubmission } from '../../src/repositories/QuestionSubmissionsRepository';
import { loteParaEnvio, questaoParaEnvio } from '../e2e/fixtures/questoesParaEnvio';

// 44-H1 — o modo "Questões" da tela "Enviar material" e "Meus envios" com os dois
// tipos. Os repositórios são simulados: o que se prova aqui é o que a tela exige
// antes de enviar, o que ela manda e o que mostra. As regras do banco (RLS,
// limites) são provadas em pgTAP.

const repoMaterial = {
  listMine: vi.fn<() => Promise<MaterialSubmission[]>>(),
  listAll: vi.fn(),
  submit: vi.fn(),
  replaceText: vi.fn(),
  retry: vi.fn(),
  situacaoDaRevisao: vi.fn().mockResolvedValue(null),
};
vi.mock('../../src/repositories/MaterialSubmissionsRepository', () => ({
  materialSubmissionsRepository: repoMaterial,
  envioDeMaterialDisponivel: true,
}));

const repoQuestoes = {
  listMine: vi.fn<() => Promise<QuestionSubmission[]>>(),
  submit: vi.fn<(i: { title: string; contentMd: string; materialIds: string[] }) => Promise<QuestionSubmission>>(),
};
vi.mock('../../src/repositories/QuestionSubmissionsRepository', () => ({
  questionSubmissionsRepository: repoQuestoes,
}));

const { EnviarMaterialView } = await import('../../src/components/material/EnviarMaterialView');

const disc = (id: string, name: string): Discipline => ({ id, name, code: id, icon: 'book', description: '', cycle: 'basico', color: '#000' });
const tema = (id: string, disciplineId: string, name: string): Theme => ({ id, disciplineId, name, description: '', highYield: false, order: 1 });
const disciplinas = [disc('d1', 'Pneumologia')];
const temas = [tema('t1', 'd1', 'Espirometria')];
const compendios = [
  { id: 'm-esp', disciplineId: 'd1', themeId: 't1', title: 'Espirometria: como interpretar', publicationStatus: 'published' },
  { id: 'm-dpoc', disciplineId: 'd1', themeId: 't1', title: 'DPOC', publicationStatus: 'published' },
  { id: 'm-rasc', disciplineId: 'd1', themeId: 't1', title: 'Material em rascunho', publicationStatus: 'draft' },
] as unknown as Compendium[];

function envioDeQuestoes(over: Partial<QuestionSubmission> = {}): QuestionSubmission {
  return {
    kind: 'questoes',
    id: 'q1',
    title: 'Questões de Espirometria (2 questões)',
    status: 'aguardando_revisao',
    createdAt: '2026-09-30T10:00:00.000Z',
    updatedAt: '2026-09-30T10:00:00.000Z',
    materialIds: [],
    ...over,
  };
}
function envioDeMaterial(over: Partial<MaterialSubmission> = {}): MaterialSubmission {
  return {
    id: 'm1',
    title: 'Material de exemplo',
    disciplineId: 'd1',
    themeId: 't1',
    parentMaterialId: null,
    status: 'aguardando_revisao',
    createdAt: '2026-09-29T15:30:00.000Z',
    updatedAt: '2026-09-29T15:30:00.000Z',
    ...over,
  };
}

function renderTela(props: { modoInicial?: 'material' | 'questoes'; onAbrirComoEscreverQuestoes?: () => void } = {}) {
  return render(
    <EnviarMaterialView disciplines={disciplinas} themes={temas} compendiums={compendios} modoInicial="questoes" {...props} />,
  );
}

async function colar(texto: string) {
  const area = (await screen.findByLabelText('Questões em Markdown (.md)')) as HTMLTextAreaElement;
  fireEvent.change(area, { target: { value: texto } });
}
const botaoEnviar = () => screen.getByRole('button', { name: 'Enviar questões' }) as HTMLButtonElement;

beforeEach(() => {
  repoMaterial.listMine.mockReset().mockResolvedValue([]);
  repoQuestoes.listMine.mockReset().mockResolvedValue([]);
  repoQuestoes.submit.mockReset().mockImplementation(async (i) => envioDeQuestoes({ id: 'novo', title: i.title }));
});
afterEach(() => cleanup());

describe('44-H1 — a tela alterna entre material e questões', () => {
  it('abre no modo pedido; as duas abas trocam o formulário; a lista fica', async () => {
    renderTela({ modoInicial: 'material' });
    expect(await screen.findByRole('heading', { name: 'Novo envio' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Novo envio de questões' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Material' }) as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Questões' }));
    expect(screen.getByRole('heading', { name: 'Novo envio de questões' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Novo envio' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Meus envios' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Material' }));
    expect(screen.getByRole('heading', { name: 'Novo envio' })).toBeTruthy();
  });

  it('com modoInicial "questoes", abre direto no formulário de questões', async () => {
    renderTela({ modoInicial: 'questoes' });
    expect(await screen.findByRole('heading', { name: 'Novo envio de questões' })).toBeTruthy();
  });

  it('o link "Veja como escrever questões" chama a página de como escrever', async () => {
    const abrir = vi.fn();
    renderTela({ onAbrirComoEscreverQuestoes: abrir });
    fireEvent.click(await screen.findByRole('button', { name: 'Veja como escrever questões' }));
    expect(abrir).toHaveBeenCalledTimes(1);
  });
});

describe('44-H1 — enviar questões: checagem ao vivo do importador', () => {
  it('sem texto: Enviar desabilitado e a tela pede o arquivo', async () => {
    renderTela();
    expect(await screen.findByText('Cole o texto ou carregue o arquivo para ver a checagem das questões.')).toBeTruthy();
    expect(botaoEnviar().disabled).toBe(true);
  });

  it('arquivo aceito: mostra quantas questões passaram, sugere o nome e habilita Enviar', async () => {
    renderTela();
    await colar(loteParaEnvio(2));
    const resultado = await screen.findByText(/Arquivo aceito/);
    expect(resultado.textContent).toContain('2 questões passaram pela importação, sem nenhuma pendência');
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));
    expect((screen.getByLabelText('Nome do lote') as HTMLInputElement).value).toBe('Questões de Espirometria (2 questões)');
  });

  it('com pendência: lista a questão e a pendência e mantém Enviar desabilitado', async () => {
    renderTela();
    await colar([questaoParaEnvio(1), questaoParaEnvio(2, { perola: null })].join('\n\n'));
    expect(await screen.findByText('1 pendência')).toBeTruthy();
    const itens = document.querySelector('#envio-questoes-pendencias')!;
    expect(itens.textContent).toContain('Questão 2:');
    expect(itens.textContent).toContain('Pérola High-Yield vazia');
    expect(botaoEnviar().disabled).toBe(true);
    fireEvent.click(botaoEnviar());
    expect(repoQuestoes.submit).not.toHaveBeenCalled();
  });

  it('arquivo que a importação recusa (nenhum "## Questão") mostra a mensagem dela e barra o envio', async () => {
    renderTela();
    await colar('# Título solto\n\nsem questão');
    expect(await screen.findByText(/Nenhum bloco "## Questão" encontrado/)).toBeTruthy();
    expect(botaoEnviar().disabled).toBe(true);
  });

  it('material do arquivo que não é um publicado: a pendência diz o título', async () => {
    renderTela();
    await colar(questaoParaEnvio(1, { materiais: 'Material Inventado' }));
    const itens = await waitFor(() => {
      const el = document.querySelector('#envio-questoes-pendencias');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(itens.textContent).toContain('O material “Material Inventado” não é o título exato de um material publicado.');
    expect(botaoEnviar().disabled).toBe(true);
  });

  it('só materiais publicados aparecem para escolher (rascunho não)', async () => {
    renderTela();
    const lista = await screen.findByText('Pneumologia', { selector: 'p' });
    const grupo = lista.closest('div')!;
    expect(within(grupo).getByLabelText('Espirometria: como interpretar')).toBeTruthy();
    expect(within(grupo).getByLabelText('DPOC')).toBeTruthy();
    expect(within(grupo).queryByLabelText('Material em rascunho')).toBeNull();
  });

  it('questão sem "Materiais cobertos": pede o material; escolhido na tela, habilita', async () => {
    renderTela();
    await colar(questaoParaEnvio(1, { materiais: null }));
    await screen.findByText(/Sem material: escreva “Materiais cobertos”/);
    expect(botaoEnviar().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('DPOC'));
    await screen.findByText(/Arquivo aceito/);
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));
  });
});

describe('44-H1 — enviar questões: o que vai ao servidor', () => {
  it('manda o nome, o texto inteiro e os materiais escolhidos; mostra a confirmação e recarrega a lista', async () => {
    renderTela();
    const texto = loteParaEnvio(2, { materiais: null });
    await colar(texto);
    fireEvent.click(screen.getByLabelText('DPOC'));
    fireEvent.change(screen.getByLabelText('Nome do lote'), { target: { value: 'Meu lote de espirometria' } });
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));
    fireEvent.click(botaoEnviar());

    const ok = await screen.findByText(/Lote “Meu lote de espirometria” enviado/);
    expect(ok.textContent).toContain('aguardando revisão');
    expect(repoQuestoes.submit).toHaveBeenCalledWith({ title: 'Meu lote de espirometria', contentMd: texto, materialIds: ['m-dpoc'] });
    // Nada de autor, estado ou Disciplina/Tema: são do banco.
    expect(Object.keys(repoQuestoes.submit.mock.calls[0][0]).sort()).toEqual(['contentMd', 'materialIds', 'title']);
    await waitFor(() => expect(repoQuestoes.listMine.mock.calls.length).toBeGreaterThanOrEqual(2));
    // O formulário limpa: o texto some e Enviar volta a ficar desabilitado.
    expect((screen.getByLabelText('Questões em Markdown (.md)') as HTMLTextAreaElement).value).toBe('');
    expect(botaoEnviar().disabled).toBe(true);
  });

  it('o banco recusa por limite de fila: a mensagem é leiga e o texto continua na tela', async () => {
    repoQuestoes.submit.mockRejectedValue({ code: 'P0001', hint: 'limite_envios_em_espera', message: 'Você já tem 3 envios de questões esperando revisão' });
    renderTela();
    await colar(loteParaEnvio(1));
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));
    fireEvent.click(botaoEnviar());
    const erro = await screen.findByText(/Você já tem 3 envios esperando revisão/);
    expect(erro.closest('[role="alert"]')).not.toBeNull();
    expect((screen.getByLabelText('Questões em Markdown (.md)') as HTMLTextAreaElement).value).toContain('## Questão 1');
  });

  it('material que saiu do ar entre a escolha e o envio: mensagem leiga', async () => {
    repoQuestoes.submit.mockRejectedValue({ code: 'P0001', message: 'os materiais escolhidos precisam estar publicados' });
    renderTela();
    await colar(loteParaEnvio(1));
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));
    fireEvent.click(botaoEnviar());
    expect(await screen.findByText('Um dos materiais escolhidos não está mais publicado. Escolha outro.')).toBeTruthy();
  });

  it('3 lotes de questões esperando: Enviar fica desabilitado e a tela explica; envios de material esperando não contam', async () => {
    repoMaterial.listMine.mockResolvedValue([envioDeMaterial({ id: 'a' }), envioDeMaterial({ id: 'b' }), envioDeMaterial({ id: 'c' })]);
    repoQuestoes.listMine.mockResolvedValue([
      envioDeQuestoes({ id: 'q1' }),
      envioDeQuestoes({ id: 'q2', status: 'em_revisao' }),
    ]);
    renderTela();
    await colar(loteParaEnvio(1));
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));

    cleanup();
    repoQuestoes.listMine.mockResolvedValue([
      envioDeQuestoes({ id: 'q1' }),
      envioDeQuestoes({ id: 'q2', status: 'em_revisao' }),
      envioDeQuestoes({ id: 'q3' }),
    ]);
    renderTela();
    await colar(loteParaEnvio(1));
    const aviso = await screen.findByText(/Você já tem 3 envios de questões esperando revisão/);
    expect(aviso.closest('[role="alert"]')).not.toBeNull();
    await screen.findByText(/Arquivo aceito/);
    expect(botaoEnviar().disabled).toBe(true);
  });
});

describe('44-H1 — "Meus envios" lista os dois tipos', () => {
  it('mostra material e questões juntos, do mais novo para o mais antigo, com a marca "Questões"', async () => {
    repoMaterial.listMine.mockResolvedValue([envioDeMaterial({ id: 'mat', title: 'Material antigo', createdAt: '2026-09-28T10:00:00.000Z' })]);
    repoQuestoes.listMine.mockResolvedValue([envioDeQuestoes({ id: 'q-novo', title: 'Lote novo de questões', createdAt: '2026-09-30T10:00:00.000Z' })]);
    renderTela();
    const itens = await waitFor(() => {
      const lis = document.querySelectorAll('#meus-envios-lista > li');
      expect(lis).toHaveLength(2);
      return Array.from(lis) as HTMLElement[];
    });
    expect(itens[0].textContent).toContain('Lote novo de questões');
    expect(itens[0].getAttribute('data-tipo')).toBe('questoes');
    expect(within(itens[0]).getByText('Questões')).toBeTruthy();
    expect(itens[0].textContent).toContain('Aguardando revisão');
    expect(itens[0].textContent).toContain('Recebemos o lote de questões');
    expect(itens[1].getAttribute('data-tipo')).toBe('material');
    expect(within(itens[1]).queryByText('Questões')).toBeNull();
    expect(itens[1].textContent).toContain('Material antigo');
  });

  it('o envio de questões não oferece corrigir, tentar de novo nem abrir material', async () => {
    repoQuestoes.listMine.mockResolvedValue([envioDeQuestoes({ status: 'nao_apto' }), envioDeQuestoes({ id: 'q2', status: 'erro' })]);
    renderTela();
    await waitFor(() => expect(document.querySelectorAll('#meus-envios-lista > li')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: /Corrigir/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tentar de novo/ })).toBeNull();
    expect(screen.queryByTestId('abrir-material-publicado')).toBeNull();
  });

  it('sem nenhum envio: diz que nada foi enviado', async () => {
    renderTela();
    expect(await screen.findByText('Você ainda não enviou nenhum material nem questões.')).toBeTruthy();
  });
});
