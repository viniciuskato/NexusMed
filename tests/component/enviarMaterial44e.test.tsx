import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { Compendium, Discipline, Theme } from '../../src/types';
import type { MaterialSubmission, SituacaoDaRevisao } from '../../src/repositories/MaterialSubmissionsRepository';
import { materialComPendencia, materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';

// 44-E — tela "Enviar material" e "Meus envios". O repositório é simulado: o
// que se prova aqui é o que a tela exige antes de enviar, o que ela manda e o
// que mostra. As regras do banco (RLS, limites) são provadas em pgTAP.

const repo = {
  listMine: vi.fn<() => Promise<MaterialSubmission[]>>(),
  listAll: vi.fn<() => Promise<MaterialSubmission[]>>(),
  submit: vi.fn(),
  replaceText: vi.fn(),
  retry: vi.fn(),
  situacaoDaRevisao: vi.fn<() => Promise<SituacaoDaRevisao | null>>(),
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
  repo.replaceText.mockReset();
  repo.retry.mockReset();
  repo.situacaoDaRevisao.mockReset().mockResolvedValue({ usadasHoje: 0, limitePorDia: 5, mesEsgotado: false });
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

// ---------------------------------------------------------------------------
// 44-F — a revisão de IA aparece em "Meus envios"; o autor corrige e reenvia
// ---------------------------------------------------------------------------

const REVISAO_NAO_APTO = {
  id: 'rev-1',
  verdict: 'nao_apto' as const,
  findingsText: '1. **Fato** — seção Espectro: o espectro citado não confere.\n2. Referência — a 3 não sustenta a frase.',
  correctionBlock: 'Corrija o material conforme os achados abaixo, mude só o que eles pedem:\n1. Espectro: corrigir.',
  errorKind: null,
  completedAt: '2026-09-30T12:00:00.000Z',
};

const listaMeus = () => document.querySelector('#meus-envios-lista') as HTMLElement;
const aguardarLista = async () => waitFor(() => expect(listaMeus()).toBeTruthy());

describe('44-F — veredito, achados e bloco de correção do autor', () => {
  it('"não apto": estado em palavras leigas, achados renderizados e bloco de correção copiável', async () => {
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
    repo.listMine.mockResolvedValue([envio({ id: 's1', title: 'Material corrigível', status: 'nao_apto', review: REVISAO_NAO_APTO })]);
    renderTela();
    await aguardarLista();

    const item = within(listaMeus()).getAllByRole('listitem')[0];
    expect(item.textContent).toContain('Precisa de correção');
    expect(item.textContent).toContain('Ver a revisão');
    const revisao = within(item).getByTestId('revisao-do-envio');
    expect(revisao.textContent).toContain('o espectro citado não confere');
    // Markdown da IA renderizado: o negrito vira <strong>, sem asteriscos na tela.
    expect(revisao.querySelector('strong')?.textContent).toBe('Fato');
    expect(revisao.textContent).not.toContain('**');
    const bloco = within(item).getByTestId('bloco-de-correcao');
    expect(bloco.textContent).toMatch(/^Corrija o material conforme os achados abaixo/);

    fireEvent.click(within(item).getByRole('button', { name: 'Copiar bloco de correção' }));
    await waitFor(() => expect(escrever).toHaveBeenCalledWith(REVISAO_NAO_APTO.correctionBlock));
  });

  it('o texto da IA nunca vira HTML: tag e script aparecem como texto e nada executa', async () => {
    (window as unknown as { __xss?: number }).__xss = undefined;
    repo.listMine.mockResolvedValue([
      envio({
        id: 's1',
        status: 'nao_apto',
        review: {
          ...REVISAO_NAO_APTO,
          findingsText:
            '1. <img src=x onerror="window.__xss=1"> e <script>window.__xss=2</script> e [clique](javascript:window.__xss=3)\n\n```\n<b onclick="x">código</b>\n```',
          correctionBlock: '<iframe src="https://exemplo.test"></iframe>',
        },
      }),
    ]);
    renderTela();
    await aguardarLista();

    const revisao = within(listaMeus()).getByTestId('revisao-do-envio');
    expect(revisao.querySelector('img, script, iframe, b')).toBeNull();
    expect(revisao.textContent).toContain('<img src=x onerror="window.__xss=1">');
    expect(revisao.textContent).toContain('<script>window.__xss=2</script>');
    expect(revisao.textContent).toContain('<b onclick="x">código</b>');
    expect(within(listaMeus()).getByTestId('bloco-de-correcao').textContent).toBe('<iframe src="https://exemplo.test"></iframe>');
    // O link com protocolo perigoso não sai como link executável.
    const link = revisao.querySelector('a');
    expect(link?.getAttribute('href') ?? '#').not.toMatch(/^javascript:/i);
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('"aprovado na revisão": mostra os achados, sem botão de corrigir', async () => {
    repo.listMine.mockResolvedValue([
      envio({ id: 's1', status: 'apto', review: { ...REVISAO_NAO_APTO, verdict: 'apto', correctionBlock: null, findingsText: 'Tudo confere.' } }),
    ]);
    renderTela();
    await aguardarLista();
    const item = within(listaMeus()).getAllByRole('listitem')[0];
    expect(item.textContent).toContain('Aprovado na revisão');
    expect(within(item).getByTestId('revisao-do-envio').textContent).toContain('Tudo confere.');
    expect(within(item).queryByRole('button', { name: /Corrigir e enviar de novo/ })).toBeNull();
    expect(within(item).queryByRole('button', { name: /Tentar de novo/ })).toBeNull();
  });

  it('envio sem revisão (na fila ou em revisão) não mostra "Ver a revisão" nem botão de corrigir', async () => {
    repo.listMine.mockResolvedValue([envio({ id: 'a', status: 'aguardando_revisao' }), envio({ id: 'b', status: 'em_revisao' })]);
    renderTela();
    await aguardarLista();
    expect(listaMeus().textContent).not.toContain('Ver a revisão');
    expect(within(listaMeus()).queryByRole('button', { name: /Corrigir/ })).toBeNull();
  });

  it('"não apto" pela conferência do servidor mostra a lista de pendências como achados', async () => {
    repo.listMine.mockResolvedValue([
      envio({
        id: 's1',
        status: 'nao_apto',
        review: {
          ...REVISAO_NAO_APTO,
          findingsText:
            'Antes de pedir a revisão de IA, o NexusMed conferiu o arquivo e ele ainda não está no padrão. Corrija os pontos abaixo e envie de novo. Esta conferência não gastou revisão de IA.\n\n- Linha 12 · Espectro: troque "<=" por "≤".',
          correctionBlock: null,
          errorKind: 'pre_checagem',
        },
      }),
    ]);
    renderTela();
    await aguardarLista();
    const revisao = within(listaMeus()).getByTestId('revisao-do-envio');
    expect(revisao.textContent).toContain('não gastou revisão de IA');
    expect(within(revisao).getAllByRole('listitem')).toHaveLength(1);
    expect(within(listaMeus()).queryByTestId('bloco-de-correcao')).toBeNull();
  });
});

describe('44-F — corrigir e enviar de novo', () => {
  const enviosComNaoApto = () => [
    envio({ id: 's-corrigir', title: 'Material corrigível', status: 'nao_apto', review: REVISAO_NAO_APTO }),
  ];

  it('o botão abre o formulário no modo de correção, já com Disciplina e Tema; o texto novo substitui o antigo', async () => {
    repo.listMine.mockResolvedValue(enviosComNaoApto());
    repo.replaceText.mockResolvedValue(envio({ id: 's-corrigir', title: 'Material corrigido' }));
    renderTela();
    await aguardarLista();

    fireEvent.click(within(listaMeus()).getByRole('button', { name: 'Corrigir e enviar de novo' }));
    expect(screen.getByRole('heading', { name: 'Corrigir envio' })).toBeTruthy();
    expect(document.querySelector('#envio-substituindo')?.textContent).toContain('Material corrigível');
    expect((screen.getByLabelText('Disciplina') as HTMLSelectElement).value).toBe('d-farma');
    expect((screen.getByLabelText('Tema') as HTMLSelectElement).value).toBe('t-clinica');

    await colar(materialParaEnvio({ titulo: 'Material corrigido' }));
    const botao = await screen.findByRole('button', { name: 'Substituir o texto e enviar de novo' });
    await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(false));
    repo.listMine.mockResolvedValue([envio({ id: 's-corrigir', title: 'Material corrigido', status: 'aguardando_revisao' })]);
    fireEvent.click(botao);

    await waitFor(() => expect(repo.replaceText).toHaveBeenCalledTimes(1));
    const [id, dados] = repo.replaceText.mock.calls[0];
    expect(id).toBe('s-corrigir');
    expect(dados).toEqual({
      title: 'Material corrigido',
      disciplineId: 'd-farma',
      themeId: 't-clinica',
      parentMaterialId: null,
      contentMd: materialParaEnvio({ titulo: 'Material corrigido' }),
    });
    expect(repo.submit).not.toHaveBeenCalled();
    await screen.findByText(/Material “Material corrigido” enviado/);
    expect(document.querySelector('#envio-substituindo')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Novo envio' })).toBeTruthy();
  });

  it('a correção também exige o arquivo aceito e sem pendência', async () => {
    repo.listMine.mockResolvedValue(enviosComNaoApto());
    renderTela();
    await aguardarLista();
    fireEvent.click(within(listaMeus()).getByRole('button', { name: 'Corrigir e enviar de novo' }));
    await colar(materialComPendencia());
    await screen.findByText('1 pendência do padrão');
    expect((screen.getByRole('button', { name: 'Substituir o texto e enviar de novo' }) as HTMLButtonElement).disabled).toBe(true);
    expect(repo.replaceText).not.toHaveBeenCalled();
  });

  it('cancelar a correção volta ao formulário de novo envio', async () => {
    repo.listMine.mockResolvedValue(enviosComNaoApto());
    renderTela();
    await aguardarLista();
    fireEvent.click(within(listaMeus()).getByRole('button', { name: 'Corrigir e enviar de novo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar correção' }));
    expect(screen.getByRole('heading', { name: 'Novo envio' })).toBeTruthy();
    expect(document.querySelector('#envio-substituindo')).toBeNull();
    expect((screen.getByLabelText('Disciplina') as HTMLSelectElement).value).toBe('');
  });

  it('se o banco recusar a troca (o estado do envio já mudou), a tela diz em uma frase', async () => {
    repo.listMine.mockResolvedValue(enviosComNaoApto());
    repo.replaceText.mockRejectedValue({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
    renderTela();
    await aguardarLista();
    fireEvent.click(within(listaMeus()).getByRole('button', { name: 'Corrigir e enviar de novo' }));
    await colar(materialParaEnvio());
    const botao = await screen.findByRole('button', { name: 'Substituir o texto e enviar de novo' });
    await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(botao);
    const erro = await screen.findByText(/já não pode ser alterado/);
    expect(erro.textContent).not.toMatch(/PGRST|JSON object/);
  });

  it('envio em "erro" tem "Tentar de novo com o mesmo texto", que só reenvia o título (o banco o devolve à fila)', async () => {
    repo.listMine.mockResolvedValue([envio({ id: 's-erro', title: 'Material com erro', status: 'erro' })]);
    repo.retry.mockResolvedValue(envio({ id: 's-erro', title: 'Material com erro' }));
    renderTela();
    await aguardarLista();
    const item = within(listaMeus()).getAllByRole('listitem')[0];
    expect(item.textContent).toContain('A revisão não foi concluída');
    expect(item.textContent).toContain('Seu material não foi rejeitado');

    repo.listMine.mockResolvedValue([envio({ id: 's-erro', title: 'Material com erro', status: 'aguardando_revisao' })]);
    fireEvent.click(within(item).getByRole('button', { name: 'Tentar de novo com o mesmo texto' }));
    await waitFor(() => expect(repo.retry).toHaveBeenCalledWith('s-erro', 'Material com erro'));
    await screen.findByText(/voltou para a fila de revisão/);
  });

  it('"não apto" não oferece "tentar de novo com o mesmo texto" (o mesmo texto daria o mesmo veredito)', async () => {
    repo.listMine.mockResolvedValue(enviosComNaoApto());
    renderTela();
    await aguardarLista();
    expect(within(listaMeus()).queryByRole('button', { name: /mesmo texto/ })).toBeNull();
  });
});

describe('44-F — por que o envio está esperando (limite de revisões)', () => {
  const NA_FILA = () => [
    envio({ id: 'a', title: 'Na fila', status: 'aguardando_revisao' }),
    envio({ id: 'b', title: 'Em revisão', status: 'em_revisao' }),
  ];

  it('limite diário: uma frase leiga, só nos envios que esperam', async () => {
    repo.listMine.mockResolvedValue(NA_FILA());
    repo.situacaoDaRevisao.mockResolvedValue({ usadasHoje: 5, limitePorDia: 5, mesEsgotado: false });
    renderTela();
    await aguardarLista();
    await waitFor(() => expect(within(listaMeus()).getAllByTestId('aviso-da-fila')).toHaveLength(1));
    const [aviso] = within(listaMeus()).getAllByTestId('aviso-da-fila');
    expect(aviso.textContent).toBe('Você já usou as 5 revisões de hoje. Seu envio será revisado amanhã.');
    expect(aviso.closest('li')?.textContent).toContain('Na fila');
  });

  it('limite do mês esgotado: outra frase leiga', async () => {
    repo.listMine.mockResolvedValue(NA_FILA());
    repo.situacaoDaRevisao.mockResolvedValue({ usadasHoje: 0, limitePorDia: 5, mesEsgotado: true });
    renderTela();
    await aguardarLista();
    const aviso = await within(listaMeus()).findByTestId('aviso-da-fila');
    expect(aviso.textContent).toMatch(/limite de revisões deste mês foi atingido/);
  });

  it('sem limite atingido, nenhuma frase de espera', async () => {
    repo.listMine.mockResolvedValue(NA_FILA());
    renderTela();
    await aguardarLista();
    expect(within(listaMeus()).queryByTestId('aviso-da-fila')).toBeNull();
  });

  it('se a situação não puder ser lida, a lista aparece do mesmo jeito', async () => {
    repo.listMine.mockResolvedValue(NA_FILA());
    repo.situacaoDaRevisao.mockRejectedValue(new Error('falhou'));
    renderTela();
    await aguardarLista();
    expect(within(listaMeus()).getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('44-F — o que barra o envio na tela (título e avisos da importação)', () => {
  it('título acima de 300 caracteres é recusado com uma frase leiga', async () => {
    renderTela();
    await colar(materialParaEnvio({ titulo: 'T'.repeat(301) }));
    const aviso = await screen.findByText(/O título passa de 300 caracteres/);
    expect(aviso.textContent).toMatch(/Encurte-o/);
    expect(botaoEnviar().disabled).toBe(true);
  });

  it('aviso da importação ("Citações em formato antigo") barra o envio e aparece na lista de pendências', async () => {
    renderTela();
    await colar(materialParaEnvio({ corpo: 'Texto com citação antiga [12] e outra [3].' }));
    const lista = await waitFor(() => {
      const el = document.querySelector('#envio-pendencias') as HTMLElement | null;
      if (!el) throw new Error('sem lista');
      return el;
    });
    expect(lista.textContent).toMatch(/Importação:.*Citações em formato antigo/);
    expect(botaoEnviar().disabled).toBe(true);
    expect(repo.submit).not.toHaveBeenCalled();
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
