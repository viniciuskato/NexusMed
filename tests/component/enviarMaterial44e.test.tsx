import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { Compendium, Discipline, Theme } from '../../src/types';
import type { MaterialSubmission } from '../../src/repositories/MaterialSubmissionsRepository';
import { materialComPendencia, materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';

// 44-E — tela "Enviar material" e "Meus envios". O repositório é simulado: o
// que se prova aqui é o que a tela exige antes de enviar, o que ela manda e o
// que mostra. As regras do banco (RLS, limites) são provadas em pgTAP.

const repo = {
  listMine: vi.fn<() => Promise<MaterialSubmission[]>>(),
  listAll: vi.fn<() => Promise<MaterialSubmission[]>>(),
  submit: vi.fn(),
};
vi.mock('../../src/repositories/MaterialSubmissionsRepository', () => ({
  materialSubmissionsRepository: repo,
  envioDeMaterialDisponivel: true,
}));

const { EnviarMaterialView } = await import('../../src/components/material/EnviarMaterialView');
const { EnviosDeMaterialAdmin } = await import('../../src/components/admin/EnviosDeMaterialAdmin');

const disc = (id: string, name: string): Discipline => ({
  id,
  name,
  code: id,
  icon: 'book',
  description: '',
  cycle: 'basico',
  color: '#000',
});
const tema = (id: string, disciplineId: string, name: string): Theme => ({
  id,
  disciplineId,
  name,
  description: '',
  highYield: false,
  order: 1,
});
const disciplinas = [disc('d-farma', 'Farmacologia'), disc('d-cardio', 'Cardiologia')];
const temas = [tema('t-clinica', 'd-farma', 'Clínica'), tema('t-basica', 'd-cardio', 'Básica')];
const compendios = [
  { id: 'm-pub', disciplineId: 'd-farma', themeId: 't-clinica', title: 'Material publicado', publicationStatus: 'published' },
  { id: 'm-rasc', disciplineId: 'd-farma', themeId: 't-clinica', title: 'Material em rascunho', publicationStatus: 'draft' },
] as unknown as Compendium[];

function envio(over: Partial<MaterialSubmission> = {}): MaterialSubmission {
  return {
    id: 's1',
    title: 'Envio de exemplo',
    disciplineId: 'd-farma',
    themeId: 't-clinica',
    parentMaterialId: null,
    status: 'aguardando_revisao',
    createdAt: '2026-09-29T15:30:00.000Z',
    updatedAt: '2026-09-29T15:30:00.000Z',
    ...over,
  };
}

function renderTela(props: { onAbrirComoEscrever?: () => void } = {}) {
  return render(
    <EnviarMaterialView disciplines={disciplinas} themes={temas} compendiums={compendios} {...props} />,
  );
}

async function colar(texto: string) {
  const area = (await screen.findByLabelText('Material em Markdown (.md)')) as HTMLTextAreaElement;
  fireEvent.change(area, { target: { value: texto } });
}

const botaoEnviar = () => screen.getByRole('button', { name: /^Enviar/ }) as HTMLButtonElement;

beforeEach(() => {
  repo.listMine.mockReset().mockResolvedValue([]);
  repo.listAll.mockReset().mockResolvedValue([]);
  repo.submit.mockReset();
});
afterEach(() => cleanup());

describe('44-E — Enviar material: checagem ao vivo', () => {
  it('com arquivo conforme, mostra "Arquivo aceito" e habilita Enviar', async () => {
    renderTela();
    await colar(materialParaEnvio({ titulo: 'Meu material bom' }));

    const resultado = await screen.findByText(/Arquivo aceito/);
    expect(resultado.textContent).toContain('Meu material bom');
    expect(resultado.textContent).toMatch(/nenhuma pendência do padrão/);
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));
    // Disciplina e Tema vieram do arquivo.
    expect((screen.getByLabelText('Disciplina') as HTMLSelectElement).value).toBe('d-farma');
    expect((screen.getByLabelText('Tema') as HTMLSelectElement).value).toBe('t-clinica');
  });

  it('com pendência do padrão, lista a pendência e mantém Enviar desabilitado', async () => {
    renderTela();
    await colar(materialComPendencia());

    const lista = await screen.findByText('1 pendência do padrão');
    expect(lista).toBeTruthy();
    const itens = document.querySelector('#envio-pendencias')!;
    expect(itens.textContent).toMatch(/Linha \d+ · Primeira seção:/);
    expect(itens.textContent).toMatch(/≤/);
    expect(botaoEnviar().disabled).toBe(true);
    fireEvent.click(botaoEnviar());
    expect(repo.submit).not.toHaveBeenCalled();
  });

  it('arquivo que a importação recusa mostra a mensagem dela e barra o envio', async () => {
    renderTela();
    await colar(materialParaEnvio().replace(/\*\*Tema:\*\*.*\n/, ''));

    await screen.findByText(/O arquivo não informa o tema/);
    expect(botaoEnviar().disabled).toBe(true);
  });

  it('Disciplina do arquivo diferente da escolhida: avisa e barra', async () => {
    renderTela();
    await colar(materialParaEnvio());
    await screen.findByText(/Arquivo aceito/);

    fireEvent.change(screen.getByLabelText('Disciplina'), { target: { value: 'd-cardio' } });
    fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 't-basica' } });

    await screen.findByText(/Disciplina escrita no arquivo \(“Farmacologia”\) não é a que você escolheu \(“Cardiologia”\)/);
    expect(botaoEnviar().disabled).toBe(true);
  });

  it('texto acima de 300 KB: explica em uma frase leiga e barra', async () => {
    renderTela();
    await colar(materialParaEnvio({ corpo: 'x '.repeat(160000) + '[1](#ref-1)[2](#ref-2).' }));

    const aviso = await screen.findByText(/O texto tem .* e o limite é 300 KB/);
    expect(aviso.textContent).toMatch(/Reduza o\s+material ou divida-o em mais de um/);
    expect(botaoEnviar().disabled).toBe(true);
  });

  it('sem texto, pede para colar ou carregar e Enviar fica desabilitado', async () => {
    renderTela();
    await screen.findByText(/Cole o texto ou carregue o arquivo para ver a checagem/);
    expect(botaoEnviar().disabled).toBe(true);
  });

  it('carregar o arquivo .md preenche o texto e mostra o nome', async () => {
    renderTela();
    const arquivo = new File([materialParaEnvio({ titulo: 'Do arquivo' })], 'meu-material.md', { type: 'text/markdown' });
    // O jsdom só tem File.text() em versões novas.
    if (typeof arquivo.text !== 'function') {
      (arquivo as unknown as { text: () => Promise<string> }).text = async () => materialParaEnvio({ titulo: 'Do arquivo' });
    }
    fireEvent.change(screen.getByLabelText('Arquivo do material (.md)'), { target: { files: [arquivo] } });

    await screen.findByText(/Arquivo aceito: “Do arquivo”/);
    expect(screen.getByText('meu-material.md')).toBeTruthy();
    expect((screen.getByLabelText('Material em Markdown (.md)') as HTMLTextAreaElement).value).toContain('# Do arquivo');
  });
});

describe('44-E — Enviar material: envio', () => {
  it('envia só o que a pessoa escolhe (sem autor, sem estado) e mostra o novo envio em "Meus envios"', async () => {
    repo.submit.mockResolvedValue(envio({ id: 's-novo', title: 'Meu material bom' }));
    renderTela();
    await colar(materialParaEnvio({ titulo: 'Meu material bom' }));
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Material acima (opcional)'), { target: { value: 'm-pub' } });

    repo.listMine.mockResolvedValue([envio({ id: 's-novo', title: 'Meu material bom' })]);
    fireEvent.click(botaoEnviar());

    await waitFor(() => expect(repo.submit).toHaveBeenCalledTimes(1));
    const enviado = repo.submit.mock.calls[0][0];
    expect(enviado).toEqual({
      title: 'Meu material bom',
      disciplineId: 'd-farma',
      themeId: 't-clinica',
      parentMaterialId: 'm-pub',
      contentMd: materialParaEnvio({ titulo: 'Meu material bom' }),
    });
    expect(Object.keys(enviado)).not.toContain('authorId');
    expect(Object.keys(enviado)).not.toContain('status');

    await screen.findByText(/Material “Meu material bom” enviado/);
    await waitFor(() =>
      expect(
        within(document.querySelector('#meus-envios-lista') as HTMLElement).getByText('Meu material bom'),
      ).toBeTruthy(),
    );
    // O formulário volta ao início.
    expect((screen.getByLabelText('Material em Markdown (.md)') as HTMLTextAreaElement).value).toBe('');
  });

  it('só materiais publicados aparecem como "Material acima"', async () => {
    renderTela();
    const select = (await screen.findByLabelText('Material acima (opcional)')) as HTMLSelectElement;
    const opcoes = Array.from(select.options).map((o) => o.textContent);
    expect(opcoes).toContain('Material publicado');
    expect(opcoes).not.toContain('Material em rascunho');
  });

  it('o banco recusa por limite: a tela diz em uma frase leiga', async () => {
    repo.submit.mockRejectedValue({ code: 'P0001', message: 'x', hint: 'limite_envios_em_espera' });
    renderTela();
    await colar(materialParaEnvio());
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));
    fireEvent.click(botaoEnviar());

    const erro = await screen.findByText(/Você já tem 3 envios esperando revisão/);
    expect(erro.textContent).not.toMatch(/P0001|hint|limite_envios/);
  });

  it('com 3 envios esperando revisão, avisa e não deixa enviar mais um', async () => {
    repo.listMine.mockResolvedValue([
      envio({ id: 'a', status: 'aguardando_revisao' }),
      envio({ id: 'b', status: 'aguardando_revisao' }),
      envio({ id: 'c', status: 'em_revisao' }),
      envio({ id: 'd', status: 'apto' }),
    ]);
    renderTela();
    await colar(materialParaEnvio());

    await screen.findByText(/Você já tem 3 envios esperando revisão\. Quando a revisão de um deles terminar/);
    expect(botaoEnviar().disabled).toBe(true);
    fireEvent.click(botaoEnviar());
    expect(repo.submit).not.toHaveBeenCalled();
  });

  it('com 2 esperando e 1 já aprovado, ainda pode enviar', async () => {
    repo.listMine.mockResolvedValue([
      envio({ id: 'a', status: 'aguardando_revisao' }),
      envio({ id: 'b', status: 'em_revisao' }),
      envio({ id: 'c', status: 'apto' }),
    ]);
    renderTela();
    await colar(materialParaEnvio());
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));
    expect(screen.queryByText(/Você já tem 3 envios esperando revisão/)).toBeNull();
  });

  it('o link "Veja como escrever um material" abre a página de instruções', async () => {
    const abrir = vi.fn();
    renderTela({ onAbrirComoEscrever: abrir });
    fireEvent.click(await screen.findByRole('button', { name: 'Veja como escrever um material' }));
    expect(abrir).toHaveBeenCalledTimes(1);
  });
});

describe('44-E — Meus envios', () => {
  it('lista título, data e estado em palavras leigas', async () => {
    repo.listMine.mockResolvedValue([
      envio({ id: '1', title: 'Envio esperando', status: 'aguardando_revisao' }),
      envio({ id: '2', title: 'Envio a corrigir', status: 'nao_apto' }),
      envio({ id: '3', title: 'Envio no ar', status: 'publicado' }),
      envio({ id: '4', title: 'Envio aprovado', status: 'apto' }),
      envio({ id: '5', title: 'Envio com falha', status: 'erro' }),
      envio({ id: '6', title: 'Envio sendo revisado', status: 'em_revisao' }),
    ]);
    renderTela();

    const lista = await waitFor(() => {
      const el = document.querySelector('#meus-envios-lista') as HTMLElement | null;
      if (!el) throw new Error('lista ainda não carregou');
      return el;
    });
    const linhas = within(lista).getAllByRole('listitem');
    expect(linhas).toHaveLength(6);
    const por = (titulo: string) => linhas.find((li) => li.textContent?.includes(titulo))!;
    expect(por('Envio esperando').textContent).toContain('Aguardando revisão');
    expect(por('Envio a corrigir').textContent).toContain('Precisa de correção');
    expect(por('Envio no ar').textContent).toContain('Publicado');
    expect(por('Envio aprovado').textContent).toContain('Aprovado na revisão');
    expect(por('Envio com falha').textContent).toContain('A revisão não foi concluída');
    expect(por('Envio sendo revisado').textContent).toContain('Em revisão');
    // Data em pt-BR e Disciplina › Tema.
    expect(por('Envio esperando').textContent).toMatch(/Enviado em \d{2}\/\d{2}\/\d{4}/);
    expect(por('Envio esperando').textContent).toContain('Farmacologia › Clínica');
    // Nenhum código interno do estado na tela.
    expect(lista.textContent).not.toMatch(/aguardando_revisao|nao_apto|em_revisao/);
  });

  it('sem envios, diz isso', async () => {
    renderTela();
    await screen.findByText('Você ainda não enviou nenhum material.');
  });

  it('sem conexão, avisa em vez de mostrar lista vazia como se estivesse certa', async () => {
    repo.listMine.mockRejectedValue(new TypeError('Failed to fetch'));
    renderTela();
    await screen.findByText(/Sem conexão/);
  });
});

describe('44-E — Área Editorial: envios de todos, só leitura', () => {
  it('admin vê os envios de várias pessoas, com quem enviou, e nenhum botão de ação', async () => {
    repo.listAll.mockResolvedValue([
      envio({ id: '1', title: 'Envio da Ana', author: { id: 'u1', name: 'Ana', email: 'ana@x.test' } }),
      envio({ id: '2', title: 'Envio do Beto', status: 'nao_apto', author: { id: 'u2', name: '', email: 'beto@x.test' } }),
    ]);
    render(<EnviosDeMaterialAdmin disciplines={disciplinas} themes={temas} />);

    const lista = await waitFor(() => {
      const el = document.querySelector('#admin-envios-lista') as HTMLElement | null;
      if (!el) throw new Error('lista ainda não carregou');
      return el;
    });
    expect(lista.textContent).toContain('Envio da Ana');
    expect(lista.textContent).toContain('por Ana');
    expect(lista.textContent).toContain('Envio do Beto');
    expect(lista.textContent).toContain('por beto@x.test');
    expect(lista.textContent).toContain('Precisa de correção');
    expect(within(document.querySelector('#admin-envios-de-material') as HTMLElement).queryAllByRole('button')).toHaveLength(0);
    expect(repo.listAll).toHaveBeenCalledTimes(1);
  });

  it('sem envios, diz isso', async () => {
    render(<EnviosDeMaterialAdmin disciplines={disciplinas} themes={temas} />);
    await screen.findByText('Nenhum material foi enviado ainda.');
  });
});
