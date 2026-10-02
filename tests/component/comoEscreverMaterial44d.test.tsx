import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { ComoEscreverMaterialView } from '../../src/components/material/ComoEscreverMaterialView';
import {
  PARTE_1_DO_PADRAO,
  PROMPT_CRIAR_MATERIAL,
  PROMPT_REVISAR_MATERIAL,
} from '../../src/content/padraoMaterial';
import type { Discipline, Theme } from '../../src/types';

// 44-D — a página "Como escrever um material": mostra a Parte 1 do padrão
// (lida do arquivo), o catálogo com nomes exatos e dois botões que copiam
// prompt + Parte 1.

function disciplina(id: string, name: string): Discipline {
  return { id, name, code: id.toUpperCase(), icon: 'book', description: '', cycle: 'basico', color: '#000' };
}
function tema(id: string, disciplineId: string, name: string, order = 1): Theme {
  return { id, disciplineId, name, description: '', highYield: false, order };
}

const disciplinas = [
  disciplina('d-farma', 'Farmacologia'),
  disciplina('d-cardio', 'Cardiologia'),
  disciplina('d-vazia', 'Disciplina sem temas'),
];
const temas = [
  tema('t-1', 'd-farma', 'Antimicrobianos', 1),
  tema('t-2', 'd-farma', 'Farmacocinética básica', 2),
  tema('t-3', 'd-cardio', 'Insuficiência cardíaca', 1),
];

let escrever: ReturnType<typeof vi.fn>;

beforeEach(() => {
  escrever = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
});
afterEach(() => {
  cleanup();
});

describe('44-D — página "Como escrever um material"', () => {
  it('mostra a Parte 1 do padrão: contém "1.7 Formato do arquivo" e não contém a Parte 2', () => {
    const { container } = render(<ComoEscreverMaterialView disciplines={disciplinas} themes={temas} />);
    const texto = container.querySelector('#como-escrever-padrao-texto')?.textContent ?? '';

    expect(texto).toContain('1.7 Formato do arquivo');
    expect(texto).toContain('1.9 Checklist antes de entregar');
    expect(container.textContent).not.toContain('Parte 2 — Para quem opera');
    expect(container.textContent).not.toContain('2.1 Fluxo completo');
    // Título da página e título de seção do padrão, como cabeçalhos legíveis.
    expect(screen.getByRole('heading', { level: 1, name: 'Como escrever um material' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^1\.7 Formato do arquivo/ })).toBeTruthy();
  });

  it('mostra o modelo do arquivo .md como código literal, sem virar título nem tabela', () => {
    const { container } = render(<ComoEscreverMaterialView disciplines={disciplinas} themes={temas} />);
    const codigos = Array.from(container.querySelectorAll('#como-escrever-padrao-texto pre')).map(
      (p) => p.textContent ?? '',
    );

    expect(
      codigos.some((c) => c.startsWith('# Título completo do material') && c.includes('| Coluna A | Coluna B |')),
    ).toBe(true);
    // Se o modelo tivesse sido interpretado, "Título da primeira seção" seria um título.
    expect(screen.queryByRole('heading', { name: 'Título da primeira seção' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lista as Disciplinas e os Temas do catálogo com os nomes exatos', () => {
    render(<ComoEscreverMaterialView disciplines={disciplinas} themes={temas} />);
    const lista = document.querySelector('#como-escrever-catalogo-lista') as HTMLElement;

    const farma = within(lista).getByRole('list', { name: 'Temas de Farmacologia' });
    expect(within(farma).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Tema: Antimicrobianos',
      'Tema: Farmacocinética básica',
    ]);
    const cardio = within(lista).getByRole('list', { name: 'Temas de Cardiologia' });
    expect(within(cardio).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Tema: Insuficiência cardíaca',
    ]);
    expect(within(lista).getByText('Disciplina sem temas')).toBeTruthy();
    expect(within(lista).getByText('Nenhum Tema cadastrado.')).toBeTruthy();
  });

  it('sem catálogo carregado, avisa em vez de mostrar lista vazia', () => {
    render(<ComoEscreverMaterialView disciplines={[]} themes={[]} />);
    expect(screen.getByText('O catálogo ainda não foi carregado.')).toBeTruthy();
  });

  it('explica o fluxo em poucas linhas: criar, conferir (opcional), enviar (em breve), revisor de IA, selo e reporte de erro', () => {
    render(<ComoEscreverMaterialView disciplines={disciplinas} themes={temas} />);
    const fluxo = document.querySelector('#como-escrever-fluxo')?.textContent ?? '';
    expect(fluxo).toMatch(/crie o material com o primeiro prompt/i);
    expect(fluxo).toMatch(/prompt\s+revisor/i);
    expect(fluxo).toMatch(/opcional/i);
    expect(fluxo).toMatch(/envie pelo site \(em breve\)/i);
    expect(fluxo).toMatch(/revisor de IA do próprio NexusMed confere/i);
    expect(fluxo).toContain('“APTO PARA ENVIAR”');
    expect(fluxo).toMatch(/selo “revisado\s+por IA”/);
    expect(fluxo).toMatch(/qualquer leitor pode reportar um erro/i);
    // Decisão do dono: a página não fala em atestação.
    expect(fluxo).not.toMatch(/atesta/i);
    expect(document.body.textContent ?? '').not.toMatch(/revisa e atesta/i);
  });

  it('"Copiar prompt para criar material" copia um único texto: prompt de criação + Parte 1, sem a Parte 2', async () => {
    render(<ComoEscreverMaterialView disciplines={disciplinas} themes={temas} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copiar prompt para criar material' }));

    await waitFor(() => expect(escrever).toHaveBeenCalledTimes(1));
    const copiado = escrever.mock.calls[0][0] as string;
    expect(copiado.startsWith(PROMPT_CRIAR_MATERIAL)).toBe(true);
    expect(copiado).toContain(PARTE_1_DO_PADRAO);
    expect(copiado).not.toContain('Parte 2 — Para quem opera');
    expect(copiado).not.toContain(PROMPT_REVISAR_MATERIAL.slice(0, 80));
    await screen.findByText(/Copiado\./);
  });

  it('"Copiar prompt revisor" copia um único texto: prompt de revisão + Parte 1, sem a Parte 2', async () => {
    render(<ComoEscreverMaterialView disciplines={disciplinas} themes={temas} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copiar prompt revisor' }));

    await waitFor(() => expect(escrever).toHaveBeenCalledTimes(1));
    const copiado = escrever.mock.calls[0][0] as string;
    expect(copiado.startsWith(PROMPT_REVISAR_MATERIAL)).toBe(true);
    expect(copiado).toContain(PARTE_1_DO_PADRAO);
    expect(copiado).not.toContain('Parte 2 — Para quem opera');
    expect(copiado).not.toContain(PROMPT_CRIAR_MATERIAL.slice(0, 80));
    expect(copiado).toContain('"APTO PARA ENVIAR"');
  });

  it('se a área de transferência falhar, mostra o texto selecionável em vez de fingir que copiou', async () => {
    escrever.mockRejectedValue(new Error('negado'));
    // Sem plano B do navegador no jsdom: execCommand devolve falso.
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    render(<ComoEscreverMaterialView disciplines={disciplinas} themes={temas} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copiar prompt revisor' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/Não foi possível copiar automaticamente/);
    const area = screen.getByLabelText(/Texto completo: 2\. Revisar o material/) as HTMLTextAreaElement;
    expect(area.value.startsWith(PROMPT_REVISAR_MATERIAL)).toBe(true);
    expect(area.value).toContain(PARTE_1_DO_PADRAO);
    expect(screen.queryByText(/Copiado\./)).toBeNull();
  });
});
