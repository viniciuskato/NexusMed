import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { ComoEscreverQuestoesView } from '../../src/components/material/ComoEscreverQuestoesView';
import {
  PADRAO_DE_QUESTOES,
  PROMPT_CRIAR_QUESTOES,
  PROMPT_REVISAR_QUESTOES,
  TEXTO_COPIAR_CRIAR_QUESTOES,
  TEXTO_COPIAR_REVISAR_QUESTOES,
} from '../../src/content/padraoQuestoes';
import type { Compendium, Discipline, Theme } from '../../src/types';

// 44-H1 — a página "Como escrever questões": mostra o padrão para quem escreve
// (lido do arquivo), o catálogo, os títulos exatos dos materiais publicados e
// dois botões que copiam prompt + padrão.

function disciplina(id: string, name: string): Discipline {
  return { id, name, code: id.toUpperCase(), icon: 'book', description: '', cycle: 'basico', color: '#000' };
}
function tema(id: string, disciplineId: string, name: string, order = 1): Theme {
  return { id, disciplineId, name, description: '', highYield: false, order };
}
function material(id: string, disciplineId: string, title: string, publicationStatus: 'published' | 'draft'): Compendium {
  return { id, disciplineId, themeId: 't-1', title, publicationStatus, sections: [], references: [], tags: [] } as unknown as Compendium;
}

const disciplinas = [disciplina('d-farma', 'Farmacologia'), disciplina('d-cardio', 'Cardiologia'), disciplina('d-vazia', 'Sem materiais')];
const temas = [tema('t-1', 'd-farma', 'Antimicrobianos'), tema('t-3', 'd-cardio', 'Insuficiência cardíaca')];
const materiais = [
  material('m1', 'd-farma', 'Penicilinas', 'published'),
  material('m2', 'd-farma', 'Cefalosporinas', 'published'),
  material('m3', 'd-farma', 'Rascunho secreto', 'draft'),
  material('m4', 'd-cardio', 'Insuficiência cardíaca aguda', 'published'),
];

let escrever: ReturnType<typeof vi.fn>;

beforeEach(() => {
  escrever = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
});
afterEach(() => cleanup());

const renderPagina = (props: { onAbrirEnvio?: () => void } = {}) =>
  render(<ComoEscreverQuestoesView disciplines={disciplinas} themes={temas} compendiums={materiais} {...props} />);

describe('44-H1 — página "Como escrever questões"', () => {
  it('mostra o padrão de questões lido do arquivo, com o formato e o checklist, e nada de quem opera a plataforma', () => {
    const { container } = renderPagina();
    const texto = container.querySelector('#como-escrever-questoes-padrao-texto')?.textContent ?? '';
    expect(screen.getByRole('heading', { level: 1, name: 'Como escrever questões' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '4. Formato do arquivo' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '5. Checklist antes de entregar' })).toBeTruthy();
    expect(texto).toContain('Dois tipos de questão');
    expect(texto).toContain('NexusMed (questão autoral)');
    for (const operar of ['Passo 1', 'Área Editorial', 'PGRST202', 'Importar questões', 'Publicar rascunhos']) {
      expect(container.textContent, operar).not.toContain(operar);
    }
    expect(PADRAO_DE_QUESTOES).toContain('## 4. Formato do arquivo');
  });

  it('mostra os dois modelos de arquivo como código literal, sem virar título nem lista', () => {
    const { container } = renderPagina();
    const codigos = Array.from(container.querySelectorAll('#como-escrever-questoes-padrao-texto pre')).map((p) => p.textContent ?? '');
    expect(codigos).toHaveLength(2);
    expect(codigos[0].startsWith('## Questão 1')).toBe(true);
    expect(codigos[0]).toContain('**Instituição / Banca:** Nome real da banca ou instituição');
    expect(codigos[1]).toContain('**Instituição / Banca:** NexusMed (questão autoral)');
    // Se o modelo tivesse sido interpretado, "Questão 2" seria um título.
    expect(screen.queryByRole('heading', { name: 'Questão 2' })).toBeNull();
  });

  it('o checklist aparece com caixa (☐), sem o "[ ]" literal', () => {
    const { container } = renderPagina();
    const padrao = container.querySelector('#como-escrever-questoes-padrao-texto')?.textContent ?? '';
    expect(padrao).not.toContain('[ ]');
    expect(padrao).toContain('☐');
    expect(PADRAO_DE_QUESTOES).toContain('- [ ] ');
  });

  it('lista as Disciplinas e os Temas do catálogo com os nomes exatos', () => {
    renderPagina();
    const lista = document.querySelector('#como-escrever-catalogo-lista') as HTMLElement;
    const farma = within(lista).getByRole('list', { name: 'Temas de Farmacologia' });
    expect(within(farma).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Antimicrobianos']);
    expect(within(lista).getByText('Sem materiais')).toBeTruthy();
  });

  it('lista os títulos exatos dos materiais PUBLICADOS por Disciplina (rascunho não aparece; disciplina sem material some)', () => {
    const { container } = renderPagina();
    const lista = container.querySelector('#como-escrever-questoes-materiais-lista') as HTMLElement;
    const grupos = Array.from(lista.querySelectorAll('details')).map((d) => d.querySelector('summary')?.textContent);
    expect(grupos).toEqual(['Cardiologia (1)', 'Farmacologia (2)']);
    const farma = lista.querySelectorAll('details')[1];
    expect(Array.from(farma.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Cefalosporinas', 'Penicilinas']);
    expect(container.textContent).not.toContain('Rascunho secreto');
  });

  it('sem material publicado, diz isso', () => {
    render(<ComoEscreverQuestoesView disciplines={disciplinas} themes={temas} compendiums={[]} />);
    expect(screen.getByText('Nenhum material publicado ainda.')).toBeTruthy();
  });

  it('explica o fluxo: criar, conferir (opcional), enviar, revisão automática e publicação; sem falar em atestação', () => {
    renderPagina();
    const fluxo = document.querySelector('#como-escrever-questoes-fluxo')?.textContent ?? '';
    expect(fluxo).toMatch(/crie as questões com o primeiro prompt/i);
    expect(fluxo).toMatch(/prompt\s+revisor/i);
    expect(fluxo).toMatch(/opcional/i);
    expect(fluxo).toMatch(/depois envie o arquivo pelo site/i);
    expect(fluxo).toMatch(/sem pendência/i);
    expect(fluxo).toMatch(/revisão automática/i);
    expect(fluxo).toMatch(/com o “apto”, as questões são publicadas ligadas aos materiais/i);
    expect(fluxo).toMatch(/Revisado por IA — ainda não lido por uma pessoa/);
    expect(fluxo).not.toMatch(/atesta/i);
  });

  it('o fluxo tem o link para "Enviar material, na aba Questões" só quando a tela de envio existe, e ele a abre', () => {
    const abrir = vi.fn();
    const { rerender } = renderPagina();
    expect(screen.queryByRole('button', { name: 'Enviar material, na aba Questões' })).toBeNull();
    rerender(<ComoEscreverQuestoesView disciplines={disciplinas} themes={temas} compendiums={materiais} onAbrirEnvio={abrir} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar material, na aba Questões' }));
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('os cartões dizem o que o prompt faz, e o do revisor diz que termina com o veredito e o bloco de correção', () => {
    const { container } = renderPagina();
    expect(container.querySelector('#como-escrever-questoes-cartao-criar')?.textContent).toMatch(/quantas questões e os materiais que elas cobrem/);
    const revisar = container.querySelector('#como-escrever-questoes-cartao-revisar')?.textContent ?? '';
    expect(revisar).toMatch(/termina com o veredito/);
    expect(revisar).toMatch(/bloco de correção/);
    expect(revisar).toMatch(/gabarito, fontes, banca e formato/);
    // O texto do cartão fala do padrão de questões, não do de conteúdos.
    expect(container.querySelector('#como-escrever-questoes-cartao-criar')?.textContent).toContain('padrão de questões');
    expect(container.querySelector('#como-escrever-questoes-cartao-criar')?.textContent).not.toContain('padrão de conteúdos');
  });

  it('"Copiar prompt para criar questões" copia um único texto: prompt de criação + padrão de questões', async () => {
    renderPagina();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar prompt para criar questões' }));
    await waitFor(() => expect(escrever).toHaveBeenCalledTimes(1));
    const copiado = escrever.mock.calls[0][0] as string;
    expect(copiado).toBe(TEXTO_COPIAR_CRIAR_QUESTOES);
    expect(copiado.startsWith(PROMPT_CRIAR_QUESTOES)).toBe(true);
    expect(copiado).toContain(PADRAO_DE_QUESTOES);
    expect(copiado).not.toContain(PROMPT_REVISAR_QUESTOES.slice(0, 80));
    await screen.findByText(/Copiado\./);
  });

  it('"Copiar prompt revisor de questões" copia um único texto: prompt de revisão + padrão de questões', async () => {
    renderPagina();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar prompt revisor de questões' }));
    await waitFor(() => expect(escrever).toHaveBeenCalledTimes(1));
    const copiado = escrever.mock.calls[0][0] as string;
    expect(copiado).toBe(TEXTO_COPIAR_REVISAR_QUESTOES);
    expect(copiado.startsWith(PROMPT_REVISAR_QUESTOES)).toBe(true);
    expect(copiado).toContain(PADRAO_DE_QUESTOES);
    expect(copiado).toContain('"APTO PARA ENVIAR"');
    expect(copiado).not.toContain(PROMPT_CRIAR_QUESTOES.slice(0, 80));
  });

  it('se a área de transferência falhar, mostra o texto selecionável em vez de fingir que copiou', async () => {
    escrever.mockRejectedValue(new Error('negado'));
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    renderPagina();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar prompt revisor de questões' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/Não foi possível copiar automaticamente/);
    const area = screen.getByLabelText(/Texto completo: 2\. Revisar questões/) as HTMLTextAreaElement;
    expect(area.value).toBe(TEXTO_COPIAR_REVISAR_QUESTOES);
    expect(screen.queryByText(/Copiado\./)).toBeNull();
  });
});
