import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { Compendium, Discipline, Theme } from '../../src/types';
import type { MaterialSubmission } from '../../src/repositories/MaterialSubmissionsRepository';
import type { QuestionSubmission } from '../../src/repositories/QuestionSubmissionsRepository';
import { loteParaEnvio } from '../e2e/fixtures/questoesParaEnvio';

// 44-H2 — "Meus envios" com questões revisadas por IA: veredito, achados, correção,
// "Tentar de novo", "Publicado", a fila única e a frase da espera. Os repositórios são
// simulados: o que se prova aqui é o que a tela mostra e manda. As regras do banco
// (revisão válida para texto e materiais, publicação, limites) são provadas em pgTAP.

const repoMaterial = {
  listMine: vi.fn<() => Promise<MaterialSubmission[]>>(),
  listAll: vi.fn(),
  submit: vi.fn(),
  replaceText: vi.fn(),
  retry: vi.fn(),
  situacaoDaRevisao: vi.fn(),
};
vi.mock('../../src/repositories/MaterialSubmissionsRepository', () => ({
  materialSubmissionsRepository: repoMaterial,
  envioDeMaterialDisponivel: true,
}));

const repoQuestoes = {
  listMine: vi.fn<() => Promise<QuestionSubmission[]>>(),
  listAll: vi.fn(),
  submit: vi.fn(),
  replaceText: vi.fn<(id: string, i: { title: string; contentMd: string; materialIds: string[] }) => Promise<QuestionSubmission>>(),
  retry: vi.fn<(id: string, title: string) => Promise<QuestionSubmission>>(),
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
] as unknown as Compendium[];

function envioDeQuestoes(over: Partial<QuestionSubmission> = {}): QuestionSubmission {
  return {
    kind: 'questoes',
    id: 'q1',
    title: 'Questões de Espirometria (1 questão)',
    status: 'aguardando_revisao',
    createdAt: '2026-09-30T10:00:00.000Z',
    updatedAt: '2026-09-30T10:00:00.000Z',
    materialIds: ['m-esp'],
    ...over,
  };
}

const REVISAO_NAO_APTO = {
  id: 'r1',
  verdict: 'nao_apto' as const,
  findingsText: '1. **Gabarito**: a fonte citada não sustenta a alternativa B.',
  correctionBlock: 'Corrija o material conforme os achados abaixo: troque a fonte da questão 1.',
  errorKind: null,
  completedAt: '2026-09-30T11:00:00.000Z',
};

function renderTela(props: Partial<React.ComponentProps<typeof EnviarMaterialView>> = {}) {
  return render(
    <EnviarMaterialView disciplines={disciplinas} themes={temas} compendiums={compendios} modoInicial="questoes" {...props} />,
  );
}
const itemDe = async (titulo: string) => {
  const p = await screen.findByText(titulo);
  return p.closest('li') as HTMLElement;
};

beforeEach(() => {
  repoMaterial.listMine.mockReset().mockResolvedValue([]);
  repoMaterial.situacaoDaRevisao.mockReset().mockResolvedValue(null);
  repoQuestoes.listMine.mockReset().mockResolvedValue([]);
  repoQuestoes.replaceText.mockReset().mockImplementation(async (id, i) => envioDeQuestoes({ id, title: i.title }));
  repoQuestoes.retry.mockReset();
});
afterEach(() => cleanup());

describe('44-H2 — "Meus envios": veredito, achados e correção das questões', () => {
  it('"não apto": estado leigo, achados em texto, bloco de correção copiável e o botão de corrigir', async () => {
    repoQuestoes.listMine.mockResolvedValue([envioDeQuestoes({ status: 'nao_apto', review: REVISAO_NAO_APTO })]);
    renderTela();
    const li = await itemDe('Questões de Espirometria (1 questão)');
    expect(li.getAttribute('data-tipo')).toBe('questoes');
    expect(li.textContent).toContain('Precisa de correção');
    expect(li.textContent).toContain('Corrija as questões e envie de novo');
    fireEvent.click(within(li).getByText('Ver a revisão'));
    expect(li.textContent).toContain('a fonte citada não sustenta a alternativa B');
    const bloco = within(li).getByTestId('bloco-de-correcao');
    expect(bloco.textContent).toContain('Corrija o material conforme os achados abaixo');
    // O bloco é para quem escreveu as questões, não para "o material".
    expect(li.textContent).toContain('quem escreveu as questões');
    expect(within(li).getByRole('button', { name: /Corrigir e enviar de novo/ })).toBeTruthy();
  });

  it('achado com HTML ou script vira texto: nada é executado nem vira elemento', async () => {
    repoQuestoes.listMine.mockResolvedValue([
      envioDeQuestoes({
        status: 'nao_apto',
        review: { ...REVISAO_NAO_APTO, findingsText: 'Veja <img src=x onerror="window.__xss=1"> e <script>window.__xss=2</script>' },
      }),
    ]);
    renderTela();
    const li = await itemDe('Questões de Espirometria (1 questão)');
    fireEvent.click(within(li).getByText('Ver a revisão'));
    expect(li.querySelector('img')).toBeNull();
    expect(li.querySelector('script')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('corrigir: o formulário abre em modo de correção com o nome e os materiais do envio; o texto novo substitui o antigo', async () => {
    repoQuestoes.listMine.mockResolvedValue([envioDeQuestoes({ status: 'nao_apto', review: REVISAO_NAO_APTO })]);
    renderTela({ modoInicial: 'material' });
    const li = await itemDe('Questões de Espirometria (1 questão)');
    fireEvent.click(within(li).getByRole('button', { name: /Corrigir e enviar de novo/ }));

    expect(await screen.findByRole('heading', { name: /Corrigir o envio “Questões de Espirometria \(1 questão\)”/ })).toBeTruthy();
    expect((screen.getByLabelText('Nome do lote') as HTMLInputElement).value).toBe('Questões de Espirometria (1 questão)');
    expect((screen.getByRole('checkbox', { name: 'Espirometria: como interpretar' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'DPOC' }) as HTMLInputElement).checked).toBe(false);

    const area = screen.getByLabelText('Questões em Markdown (.md)');
    fireEvent.change(area, { target: { value: loteParaEnvio(1) } });
    const botao = (await screen.findByRole('button', { name: 'Substituir o texto e enviar de novo' })) as HTMLButtonElement;
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);

    await waitFor(() => expect(repoQuestoes.replaceText).toHaveBeenCalledTimes(1));
    const [id, dados] = repoQuestoes.replaceText.mock.calls[0];
    expect(id).toBe('q1');
    expect(dados.title).toBe('Questões de Espirometria (1 questão)');
    expect(dados.materialIds).toEqual(['m-esp']);
    expect(dados.contentMd).toBe(loteParaEnvio(1));
    expect(repoQuestoes.submit).not.toHaveBeenCalled();
    await screen.findByText(/enviado\. Ele aparece em “Meus envios”, aguardando revisão/);
    // Terminada a correção, o formulário volta a ser o de novo envio.
    expect(screen.getByRole('heading', { name: 'Novo envio de questões' })).toBeTruthy();
  });

  it('cancelar a correção volta ao formulário de novo envio, sem enviar nada', async () => {
    repoQuestoes.listMine.mockResolvedValue([envioDeQuestoes({ status: 'nao_apto', review: REVISAO_NAO_APTO })]);
    renderTela();
    const li = await itemDe('Questões de Espirometria (1 questão)');
    fireEvent.click(within(li).getByRole('button', { name: /Corrigir e enviar de novo/ }));
    await screen.findByRole('heading', { name: /Corrigir o envio/ });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar a correção' }));
    expect(await screen.findByRole('heading', { name: 'Novo envio de questões' })).toBeTruthy();
    expect(repoQuestoes.replaceText).not.toHaveBeenCalled();
  });

  it('"Tentar de novo": só no envio com erro; com revisão apto do texto e dos materiais o envio volta a "apto" sem nova revisão', async () => {
    repoQuestoes.listMine.mockResolvedValue([envioDeQuestoes({ status: 'erro' })]);
    repoQuestoes.retry.mockResolvedValue(envioDeQuestoes({ status: 'apto' }));
    renderTela();
    const li = await itemDe('Questões de Espirometria (1 questão)');
    fireEvent.click(within(li).getByRole('button', { name: /Tentar de novo/ }));
    await waitFor(() => expect(repoQuestoes.retry).toHaveBeenCalledWith('q1', 'Questões de Espirometria (1 questão)'));
    expect(await screen.findByText(/já foi aprovado na revisão\. A publicação será refeita em alguns minutos, sem nova revisão/)).toBeTruthy();
  });

  it('"Tentar de novo" sem revisão apto que valha: o envio volta para a fila de revisão', async () => {
    repoQuestoes.listMine.mockResolvedValue([envioDeQuestoes({ status: 'erro' })]);
    repoQuestoes.retry.mockResolvedValue(envioDeQuestoes({ status: 'aguardando_revisao' }));
    renderTela();
    const li = await itemDe('Questões de Espirometria (1 questão)');
    fireEvent.click(within(li).getByRole('button', { name: /Tentar de novo/ }));
    expect(await screen.findByText(/voltou para a fila de revisão/)).toBeTruthy();
  });

  it('"aprovado": explica que será publicado; "publicado": conta as questões e abre as questões publicadas', async () => {
    const abrir = vi.fn();
    repoQuestoes.listMine.mockResolvedValue([
      envioDeQuestoes({ id: 'a', title: 'Lote aprovado', status: 'apto' }),
      envioDeQuestoes({ id: 'p', title: 'Lote publicado', status: 'publicado', publishedQuestionIds: ['x1', 'x2'], createdAt: '2026-09-29T10:00:00.000Z' }),
    ]);
    renderTela({ onAbrirQuestoes: abrir });
    const aprovado = await itemDe('Lote aprovado');
    expect(aprovado.textContent).toContain('Aprovado na revisão');
    expect(aprovado.textContent).toContain('Elas serão publicadas em alguns minutos');
    expect(within(aprovado).queryByTestId('abrir-questoes-publicadas')).toBeNull();

    const publicado = await itemDe('Lote publicado');
    expect(publicado.textContent).toContain('Publicado');
    expect(within(publicado).getByTestId('questoes-publicadas').textContent).toBe('2 questões publicadas.');
    fireEvent.click(within(publicado).getByTestId('abrir-questoes-publicadas'));
    expect(abrir).toHaveBeenCalledWith(['x1', 'x2']);
  });

  it('o recado do servidor (material ambíguo etc.) aparece no envio "não apto"', async () => {
    repoQuestoes.listMine.mockResolvedValue([
      envioDeQuestoes({ status: 'nao_apto', publicationNote: 'Questão 1: o título “DPOC” pertence a mais de um material publicado.' }),
    ]);
    renderTela();
    const li = await itemDe('Questões de Espirometria (1 questão)');
    expect(within(li).getByTestId('recado-do-servidor').textContent).toContain('pertence a mais de um material publicado');
  });

  it('a frase da espera (limite de custo) vale também para o envio de questões aguardando revisão', async () => {
    repoMaterial.situacaoDaRevisao.mockResolvedValue({ usadasHoje: 3, limitePorDia: 3, mesEsgotado: false });
    repoQuestoes.listMine.mockResolvedValue([envioDeQuestoes({ status: 'aguardando_revisao' })]);
    renderTela();
    const li = await itemDe('Questões de Espirometria (1 questão)');
    await waitFor(() => expect(within(li).getByTestId('aviso-da-fila').textContent).toContain('Seu envio será revisado amanhã'));
  });

  it('a fila é uma só: 2 de material e 1 de questões esperando bloqueiam os dois formulários', async () => {
    repoMaterial.listMine.mockResolvedValue([
      { id: 'a', title: 'M1', disciplineId: 'd1', themeId: 't1', parentMaterialId: null, status: 'aguardando_revisao', createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z' },
      { id: 'b', title: 'M2', disciplineId: 'd1', themeId: 't1', parentMaterialId: null, status: 'em_revisao', createdAt: '2026-09-29T11:00:00.000Z', updatedAt: '2026-09-29T11:00:00.000Z' },
    ]);
    repoQuestoes.listMine.mockResolvedValue([envioDeQuestoes({ status: 'aguardando_revisao' })]);
    renderTela({ modoInicial: 'material' });
    expect(await screen.findByText(/Você já tem 3 envios esperando revisão/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Questões' }));
    expect(await screen.findByText(/Você já tem 3 envios esperando revisão/)).toBeTruthy();
  });
});
