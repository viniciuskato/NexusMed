import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { Compendium, Discipline, Theme } from '../../src/types';
import type { MaterialSubmission } from '../../src/repositories/MaterialSubmissionsRepository';
import { exportarMaterialParaMarkdown } from '../../src/utils/exportarMaterial';
import { materialComPendencia } from '../e2e/fixtures/materialParaEnvio';

// 44-B / MAT-1 — "Exportar .md", "Baixar para atualizar" e "Enviar versão nova" no leitor. O repositório é simulado: o que
// se prova aqui é quem vê os botões, o arquivo que sai, o que a prévia mostra e o que a tela manda. A regra de quem pode,
// o lugar e a aplicação são provados em pgTAP e no E2E.

const { repo, baixar, estado } = vi.hoisted(() => ({
  estado: { admin: true },
  baixar: vi.fn(),
  repo: {
    podeAtualizar: vi.fn<(id: string) => Promise<boolean>>(),
    secoesDasQuestoes: vi.fn<(id: string) => Promise<string[]>>(),
    submitUpdate: vi.fn<(i: { targetMaterialId: string; title: string; contentMd: string }) => Promise<unknown>>(),
    textoParaPublicar: vi.fn<(id: string) => Promise<{ contentMd: string; contentSha256: string }>>(),
    aplicarAtualizacaoComoAdmin: vi.fn<(id: string, sha: string, material: unknown) => Promise<{ resultado: string }>>(),
  },
}));
vi.mock('../../src/hooks/useEhAdmin', () => ({ useEhAdmin: () => estado.admin }));
vi.mock('../../src/repositories/MaterialSubmissionsRepository', () => ({
  materialSubmissionsRepository: repo,
  envioDeMaterialDisponivel: true,
}));
vi.mock('../../src/utils/exportarMaterial', async () => {
  const real = await vi.importActual<typeof import('../../src/utils/exportarMaterial')>('../../src/utils/exportarMaterial');
  return { ...real, baixarArquivoDeTexto: baixar };
});

const { VERSAO_ATUAL_DO_PADRAO } = await import('../../src/utils/compendiumStandardCheck');
const { PARTE_1_DO_PADRAO, PROMPT_CRIAR_MATERIAL } = await import('../../src/content/padraoMaterial');
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
    standardVersion: VERSAO_ATUAL_DO_PADRAO,
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
  fireEvent.click(await screen.findByRole('button', { name: /Enviar versão nova/ }));
  fireEvent.change(await screen.findByLabelText('Arquivo do material atualizado (.md)'), { target: { files: [arquivoDe(texto)] } });
}

beforeEach(() => {
  estado.admin = true;
  repo.textoParaPublicar.mockReset();
  repo.aplicarAtualizacaoComoAdmin.mockReset().mockResolvedValue({ resultado: 'aplicado' });
  repo.podeAtualizar.mockReset().mockResolvedValue(true);
  repo.secoesDasQuestoes.mockReset().mockResolvedValue([]);
  repo.submitUpdate.mockReset().mockResolvedValue({ id: 'u1', title: 'x', status: 'aguardando_revisao' } as MaterialSubmission);
  baixar.mockReset();
});
afterEach(cleanup);

describe('44-B / MAT-1 — quem vê os botões', () => {
  it('o admin (o banco responde sim) vê "Baixar para atualizar", "Enviar versão nova" e "Exportar .md"', async () => {
    renderizar();
    expect(await screen.findByRole('button', { name: /Baixar para atualizar/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enviar versão nova/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exportar \.md/ })).toBeTruthy();
    expect(repo.podeAtualizar).toHaveBeenCalledWith('mat-1');
  });

  it('quem não é admin não vê botão nenhum, mesmo que o banco diga que pode (e nem pergunta)', async () => {
    estado.admin = false;
    const { container } = renderizar();
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
    expect(repo.podeAtualizar).not.toHaveBeenCalled();
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

describe('MAT-1 — o material antigo não passa por atual ao ser exportado e reenviado', () => {
  it('versão registrada nula: o export sai sem a linha da versão e o arquivo editado não é aceito como atual (nada é publicado)', async () => {
    const antigo = { ...material(), standardVersion: null };
    const editado = exportarMaterialParaMarkdown(antigo, [disciplina], [tema]).texto.replace('Alça: potente', 'Alça: potente e rápida');
    expect(editado).not.toContain('Versão do padrão');
    renderizar(antigo);
    await abrirEEscolher(editado);
    await screen.findByText(/ainda não pode ser enviado/);
    expect(screen.getByText(/Falta a linha .*Versão do padrão/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Publicar versão nova' }) as HTMLButtonElement).disabled).toBe(true);
    expect(repo.submitUpdate).not.toHaveBeenCalled();
  });

  it('"Baixar para atualizar" leva o material com a versão registrada (ou sem linha), e a abertura pede a atual', async () => {
    renderizar({ ...material(), standardVersion: 2 });
    fireEvent.click(await screen.findByRole('button', { name: /Baixar para atualizar/ }));
    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
    const texto = (baixar.mock.calls[0] as [string, string])[1];
    expect(texto).toContain(`com a linha "**Versão do padrão:** ${VERSAO_ATUAL_DO_PADRAO}"`);
    const materialNoArquivo = texto.slice(texto.indexOf('=== MATERIAL ATUAL ==='));
    expect(materialNoArquivo).toContain('**Versão do padrão:** 2');
    expect(materialNoArquivo).not.toContain(`**Versão do padrão:** ${VERSAO_ATUAL_DO_PADRAO}`);
  });
});

describe('MAT-1 — Baixar para atualizar', () => {
  it('baixa UM .txt: a abertura, o prompt de criação com a Parte 1 do padrão e o material atual, nesta ordem', async () => {
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: /Baixar para atualizar/ }));
    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
    const [nome, texto, tipo] = baixar.mock.calls[0] as [string, string, string];
    expect(nome).toMatch(/^diureticos-para-atualizar-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(tipo).toContain('text/plain');
    expect(texto.startsWith(`Atualizar o material "Diuréticos" para o padrão NexusMed de conteúdos, versão ${VERSAO_ATUAL_DO_PADRAO}.`)).toBe(true);
    const iAbertura = texto.indexOf('Reescreva o material que está no fim deste arquivo');
    const iPrompt = texto.indexOf(PROMPT_CRIAR_MATERIAL.slice(0, 60));
    const iPadrao = texto.indexOf(PARTE_1_DO_PADRAO.slice(0, 60));
    const iMaterial = texto.indexOf('# Diuréticos\n');
    expect(iAbertura).toBeGreaterThan(0);
    expect(iPrompt).toBeGreaterThan(iAbertura);
    expect(iPadrao).toBeGreaterThan(iPrompt);
    expect(iMaterial).toBeGreaterThan(iPadrao);
    expect(texto).toContain('### Mecanismo');
    expect(await screen.findByText(/Arquivo “diureticos-para-atualizar-/)).toBeTruthy();
  });
});

describe('MAT-1 — Enviar versão nova: publicar sem esperar o parecer', () => {
  it('grava o envio, aplica pelo admin e avisa o app para recarregar; o parecer não é pedido', async () => {
    const original = exportarMaterialParaMarkdown(material(), [disciplina], [tema]).texto;
    const editado = original.replace('Alça: potente', 'Alça: potente e rápida');
    repo.submitUpdate.mockResolvedValue({ id: 'u9', title: 'Diuréticos', status: 'aguardando_revisao' });
    repo.textoParaPublicar.mockResolvedValue({ contentMd: editado, contentSha256: 'sha-do-texto' });
    const aoPublicar = vi.fn();
    render(<AtualizarMaterial compendium={material()} disciplines={[disciplina]} themes={[tema]} onPublicado={aoPublicar} />);
    await abrirEEscolher(editado);
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar versão nova' }));

    expect(await screen.findByText(/Atualização aplicada/)).toBeTruthy();
    expect(repo.submitUpdate).toHaveBeenCalledWith({ targetMaterialId: 'mat-1', title: 'Diuréticos', contentMd: editado });
    expect(repo.textoParaPublicar).toHaveBeenCalledWith('u9');
    expect(repo.aplicarAtualizacaoComoAdmin).toHaveBeenCalledTimes(1);
    const [id, sha, enviado] = repo.aplicarAtualizacaoComoAdmin.mock.calls[0] as [string, string, { title: string; sections: Array<{ key_takeaways: string[] }> }];
    expect(id).toBe('u9');
    expect(sha).toBe('sha-do-texto');
    expect(enviado.title).toBe('Diuréticos');
    expect(enviado.sections[0].key_takeaways).toEqual(['Alça: potente e rápida']);
    expect(aoPublicar).toHaveBeenCalledTimes(1);
  });

  it('o banco recusou a aplicação: diz o motivo, onde o arquivo ficou, e não avisa o app', async () => {
    const original = exportarMaterialParaMarkdown(material(), [disciplina], [tema]).texto;
    const editado = original.replace('Alça: potente', 'Alça: potente e rápida');
    repo.submitUpdate.mockResolvedValue({ id: 'u9', title: 'Diuréticos', status: 'aguardando_revisao' });
    repo.textoParaPublicar.mockResolvedValue({ contentMd: editado, contentSha256: 'sha' });
    repo.aplicarAtualizacaoComoAdmin.mockResolvedValue({ resultado: 'recusado', motivo: 'O material mudou depois que você enviou.' } as never);
    const aoPublicar = vi.fn();
    render(<AtualizarMaterial compendium={material()} disciplines={[disciplina]} themes={[tema]} onPublicado={aoPublicar} />);
    await abrirEEscolher(editado);
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar versão nova' }));
    const aviso = await screen.findByText(/O material mudou depois que você enviou/);
    expect(aviso.textContent).toContain('Meus envios');
    expect(aoPublicar).not.toHaveBeenCalled();
    expect(screen.queryByText(/Atualização aplicada/)).toBeNull();
  });

  it('arquivo igual ao material: "Publicar versão nova" fica desabilitado', async () => {
    renderizar();
    await abrirEEscolher(exportarMaterialParaMarkdown(material(), [disciplina], [tema]).texto);
    await screen.findByText(/não há nada a atualizar/);
    expect((screen.getByRole('button', { name: 'Publicar versão nova' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('44-B — Enviar versão nova (para revisão)', () => {
  it('arquivo igual ao exportado: não há nada a atualizar e o envio fica desabilitado', async () => {
    renderizar();
    await abrirEEscolher(exportarMaterialParaMarkdown(material(), [disciplina], [tema]).texto);
    await screen.findByText(/não há nada a atualizar/);
    expect((screen.getByRole('button', { name: 'Enviar para revisão' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('mostra a prévia (seção alterada, nova e removida; referência nova) e envia a atualização do material, sem lugar nem estado', async () => {
    const original = exportarMaterialParaMarkdown(material(), [disciplina], [tema]).texto;
    const editado = original
      .replace('Alça bloqueia Na-K-2Cl [1](#ref-1).', 'Alça bloqueia Na-K-2Cl e age rápido [1](#ref-1).')
      .replace('### Uso clínico\n\nIndicados na sobrecarga [2](#ref-2).', '### Efeitos adversos\n\nHipocalemia é comum [2](#ref-2).');
    renderizar();
    await abrirEEscolher(editado);

    const previa = await screen.findByText(/Veja o que muda/);
    expect(previa).toBeTruthy();
    const area = document.getElementById('atualizar-previa') as HTMLElement;
    expect(area.textContent).toContain('Seções alteradas');
    expect(area.textContent).toContain('Mecanismo');
    expect(area.textContent).toContain('Seções novas');
    expect(area.textContent).toContain('Efeitos adversos');
    expect(area.textContent).toContain('Seções removidas');
    expect(area.textContent).toContain('Uso clínico');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));
    await screen.findByText(/Enviado para revisão/);
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
    expect((screen.getByRole('button', { name: 'Enviar para revisão' }) as HTMLButtonElement).disabled).toBe(true);
    expect(repo.submitUpdate).not.toHaveBeenCalled();
  });

  it('o banco recusou o pedido: a tela diz em palavras leigas e nada some', async () => {
    repo.submitUpdate.mockRejectedValue({ code: 'P0001', message: 'o material a atualizar precisa estar publicado' });
    const original = exportarMaterialParaMarkdown(material(), [disciplina], [tema]).texto;
    renderizar();
    await abrirEEscolher(original.replace('Alça: potente', 'Alça: potente e rápida'));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar para revisão' }));
    expect(await screen.findByText(/não está mais publicado/)).toBeTruthy();
    expect(screen.queryByText(/Enviado para revisão/)).toBeNull();
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
