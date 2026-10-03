import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { Compendium, Discipline, Theme } from '../../src/types';
import type { MaterialSubmission } from '../../src/repositories/MaterialSubmissionsRepository';
import { exportarMaterialParaMarkdown } from '../../src/utils/exportarMaterial';
import { materialComPendencia } from '../e2e/fixtures/materialParaEnvio';

// 44-B — "Exportar .md" e "Atualizar a partir de arquivo" no leitor. O repositório é simulado: o que se
// prova aqui é quem vê os botões, o arquivo que sai, o que a prévia mostra e o que a tela manda. A regra
// de quem pode, o lugar e a aplicação são provados em pgTAP e no E2E.

const { repo, baixar } = vi.hoisted(() => ({
  baixar: vi.fn(),
  repo: {
    podeAtualizar: vi.fn<(id: string) => Promise<boolean>>(),
    secoesDasQuestoes: vi.fn<(id: string) => Promise<string[]>>(),
    submitUpdate: vi.fn<(i: { targetMaterialId: string; title: string; contentMd: string }) => Promise<unknown>>(),
  },
}));
vi.mock('../../src/repositories/MaterialSubmissionsRepository', () => ({
  materialSubmissionsRepository: repo,
  envioDeMaterialDisponivel: true,
}));
vi.mock('../../src/utils/exportarMaterial', async () => {
  const real = await vi.importActual<typeof import('../../src/utils/exportarMaterial')>('../../src/utils/exportarMaterial');
  return { ...real, baixarArquivoDeTexto: baixar };
});

const { AtualizarMaterial } = await import('../../src/components/material/AtualizarMaterial');
const { ListaDeEnvios } = await import('../../src/components/material/ListaDeEnvios');

const disciplina = { id: 'd1', name: 'Farmacologia', code: 'FARM', icon: 'pill', description: '', cycle: 'basico', color: '#000' } as unknown as Discipline;
const tema: Theme = { id: 't1', disciplineId: 'd1', name: 'Clínica', description: '', highYield: false, order: 1 };

function material(): Compendium {
  return {
    id: 'mat-1',
    disciplineId: 'd1',
    themeId: 't1',
    title: 'Diuréticos',
    subtitle: 'Mecanismo e uso',
    estimatedReadTimeMinutes: 14,
    lastUpdated: '',
    author: 'Equipe',
    publicationStatus: 'published',
    tags: ['diurético'],
    sections: [
      { id: 'sec-a', title: 'Mecanismo', content: 'Alça bloqueia Na-K-2Cl [1](#ref-1).', keyTakeaways: ['Alça: potente'] },
      { id: 'sec-b', title: 'Uso clínico', content: 'Indicados na sobrecarga [2](#ref-2).', keyTakeaways: [] },
    ],
    references: ['Fonte 1. [Diretriz de prática clínica — entidade de exemplo]', 'Fonte 2. [Revisão sistemática]'],
  } as Compendium;
}

function arquivoDe(texto: string, nome = 'material.md'): File {
  const arquivo = new File([texto], nome, { type: 'text/markdown' });
  if (typeof arquivo.text !== 'function') (arquivo as unknown as { text: () => Promise<string> }).text = async () => texto;
  return arquivo;
}

function renderizar(c: Compendium = material()) {
  return render(<AtualizarMaterial compendium={c} disciplines={[disciplina]} themes={[tema]} />);
}

async function abrirEEscolher(texto: string) {
  fireEvent.click(await screen.findByRole('button', { name: /Atualizar a partir de arquivo/ }));
  fireEvent.change(await screen.findByLabelText('Arquivo do material atualizado (.md)'), { target: { files: [arquivoDe(texto)] } });
}

beforeEach(() => {
  repo.podeAtualizar.mockReset().mockResolvedValue(true);
  repo.secoesDasQuestoes.mockReset().mockResolvedValue([]);
  repo.submitUpdate.mockReset().mockResolvedValue({ id: 'u1', title: 'x', status: 'aguardando_revisao' } as MaterialSubmission);
  baixar.mockReset();
});
afterEach(cleanup);

describe('44-B — quem vê os botões', () => {
  it('quem pode (o banco responde sim) vê "Exportar .md" e "Atualizar a partir de arquivo"', async () => {
    renderizar();
    expect(await screen.findByRole('button', { name: /Exportar \.md/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Atualizar a partir de arquivo/ })).toBeTruthy();
    expect(repo.podeAtualizar).toHaveBeenCalledWith('mat-1');
  });

  it('quem não pode, ou se a pergunta falha, não vê nada', async () => {
    repo.podeAtualizar.mockResolvedValue(false);
    const { container, unmount } = renderizar();
    await waitFor(() => expect(repo.podeAtualizar).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    unmount();
    repo.podeAtualizar.mockRejectedValue(new Error('sem rede'));
    const outro = renderizar();
    await waitFor(() => expect(repo.podeAtualizar).toHaveBeenCalledTimes(2));
    expect(outro.container.textContent).toBe('');
  });
});

describe('44-B — Exportar .md', () => {
  it('baixa o arquivo do padrão com o conteúdo do material e diz o nome', async () => {
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: /Exportar \.md/ }));
    expect(baixar).toHaveBeenCalledTimes(1);
    const [nome, texto] = baixar.mock.calls[0] as [string, string];
    expect(nome).toBe('diureticos.md');
    expect(texto.startsWith('# Diuréticos\n')).toBe(true);
    expect(texto).toContain('### Mecanismo');
    expect(texto).toContain('### Referências Bibliográficas');
    expect(await screen.findByText(/Arquivo “diureticos.md” gerado/)).toBeTruthy();
  });
});

describe('44-B — Atualizar a partir de arquivo', () => {
  it('arquivo igual ao exportado: não há nada a atualizar e o envio fica desabilitado', async () => {
    renderizar();
    await abrirEEscolher(exportarMaterialParaMarkdown(material(), [disciplina], [tema]).texto);
    await screen.findByText(/não há nada a atualizar/);
    expect((screen.getByRole('button', { name: 'Enviar atualização para revisão' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('mostra a prévia (seção alterada, nova e removida; referência nova) e envia a atualização do material, sem lugar nem estado', async () => {
    const original = exportarMaterialParaMarkdown(material(), [disciplina], [tema]).texto;
    const editado = original
      .replace('Alça bloqueia Na-K-2Cl [1](#ref-1).', 'Alça bloqueia Na-K-2Cl e age rápido [1](#ref-1).')
      .replace('### Uso clínico\n\nIndicados na sobrecarga [2](#ref-2).', '### Efeitos adversos\n\nHipocalemia é comum [2](#ref-2).');
    renderizar();
    await abrirEEscolher(editado);

    const previa = await screen.findByText(/Veja o que vai mudar/);
    expect(previa).toBeTruthy();
    const area = document.getElementById('atualizar-previa') as HTMLElement;
    expect(area.textContent).toContain('Seções alteradas');
    expect(area.textContent).toContain('Mecanismo');
    expect(area.textContent).toContain('Seções novas');
    expect(area.textContent).toContain('Efeitos adversos');
    expect(area.textContent).toContain('Seções removidas');
    expect(area.textContent).toContain('Uso clínico');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar atualização para revisão' }));
    await screen.findByText(/Atualização enviada para revisão/);
    expect(repo.submitUpdate).toHaveBeenCalledTimes(1);
    expect(repo.submitUpdate).toHaveBeenCalledWith({ targetMaterialId: 'mat-1', title: 'Diuréticos', contentMd: editado });
  });

  it('avisa quantas questões apontam para seções que vão sumir', async () => {
    repo.secoesDasQuestoes.mockResolvedValue(['sec-b', 'sec-b', 'sec-a']);
    const original = exportarMaterialParaMarkdown(material(), [disciplina], [tema]).texto;
    const editado = original.replace('### Uso clínico\n\nIndicados na sobrecarga [2](#ref-2).', '### Efeitos adversos\n\nHipocalemia é comum [2](#ref-2).');
    renderizar();
    await abrirEEscolher(editado);
    const aviso = await screen.findByText(/2 questões apontam para seções que vão sumir/);
    expect(aviso).toBeTruthy();
  });

  it('arquivo com pendência do padrão: explica e não deixa enviar', async () => {
    renderizar();
    await abrirEEscolher(materialComPendencia({ titulo: 'Diuréticos' }));
    await screen.findByText(/ainda não pode ser enviado/);
    expect((screen.getByRole('button', { name: 'Enviar atualização para revisão' }) as HTMLButtonElement).disabled).toBe(true);
    expect(repo.submitUpdate).not.toHaveBeenCalled();
  });

  it('o banco recusou o pedido: a tela diz em palavras leigas e nada some', async () => {
    repo.submitUpdate.mockRejectedValue({ code: 'P0001', message: 'o material a atualizar precisa estar publicado' });
    const original = exportarMaterialParaMarkdown(material(), [disciplina], [tema]).texto;
    renderizar();
    await abrirEEscolher(original.replace('Alça: potente', 'Alça: potente e rápida'));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar atualização para revisão' }));
    expect(await screen.findByText(/não está mais publicado/)).toBeTruthy();
    expect(screen.queryByText(/Atualização enviada para revisão/)).toBeNull();
  });
});

describe('44-B — "Meus envios" mostra a atualização', () => {
  const envio = (over: Partial<MaterialSubmission> = {}): MaterialSubmission => ({
    id: 'u1',
    title: 'Diuréticos',
    disciplineId: 'd1',
    themeId: 't1',
    parentMaterialId: null,
    status: 'aguardando_revisao',
    createdAt: '2026-10-02T12:00:00.000Z',
    updatedAt: '2026-10-02T12:00:00.000Z',
    targetMaterialId: 'mat-1',
    ...over,
  });

  it('rotula como atualização do material e, depois de publicada, abre o material (e mostra o recado "nada mudou")', () => {
    const abrir = vi.fn();
    render(
      <ListaDeEnvios
        id="lista"
        envios={[envio({ status: 'publicado', publicationNote: 'O arquivo é igual ao material que está no ar: nada mudou.' })]}
        disciplines={[disciplina]}
        themes={[tema]}
        vazio="nenhum"
        onAbrirMaterial={abrir}
        materiais={[{ id: 'mat-1', title: 'Diuréticos' }]}
      />,
    );
    expect(screen.getByTestId('envio-de-atualizacao').textContent).toBe('Atualização de “Diuréticos”');
    expect(screen.getByTestId('recado-do-servidor').textContent).toContain('nada mudou');
    fireEvent.click(screen.getByTestId('abrir-material-publicado'));
    expect(abrir).toHaveBeenCalledWith('mat-1');
  });

  it('atualização "não apto" não oferece "Corrigir e enviar de novo" (o texto novo vem do botão do material)', () => {
    render(
      <ListaDeEnvios
        id="lista"
        envios={[envio({ status: 'nao_apto' })]}
        disciplines={[disciplina]}
        themes={[tema]}
        vazio="nenhum"
        onCorrigir={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Corrigir e enviar de novo/ })).toBeNull();
    expect(screen.getByText(/continua como estava/)).toBeTruthy();
  });
});
