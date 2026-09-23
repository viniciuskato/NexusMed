import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { Compendium } from '../../src/types';
import {
  MaterialBreadcrumb,
  MaterialChildrenCards,
  MaterialLinkBoxes,
} from '../../src/components/compendium/MaterialNavigation';

function mat(id: string, overrides: Partial<Compendium> = {}): Compendium {
  return {
    id,
    disciplineId: 'farmaco',
    themeId: 'atb',
    title: id,
    subtitle: '',
    estimatedReadTimeMinutes: 10,
    lastUpdated: '',
    author: '',
    publicationStatus: 'published',
    sections: [],
    references: [],
    ...overrides,
  };
}

// Caminho do piloto: Antibióticos → Parede celular → β-lactâmicos →
// Cefalosporinas → Terceira geração → Ceftriaxona (seis níveis, o caso que
// motivou nav_short_title: os títulos completos não caberiam na trilha).
const raiz = mat('raiz', { title: 'Antibióticos — visão geral', navShortTitle: 'Antibióticos' });
const parede = mat('parede', {
  title: 'Inibidores da síntese da parede celular',
  navShortTitle: 'Parede celular',
  parentMaterialId: 'raiz',
});
const beta = mat('beta', { title: 'β-lactâmicos', parentMaterialId: 'parede' });
const cef3 = mat('cef3', {
  title: 'Cefalosporinas de terceira geração',
  navShortTitle: 'Terceira geração',
  parentMaterialId: 'beta',
});
const ceftriaxona = mat('ceftriaxona', { title: 'Ceftriaxona', parentMaterialId: 'cef3' });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MaterialBreadcrumb', () => {
  const acervo = [raiz, parede, beta, cef3, ceftriaxona];

  it('não renderiza nada para material raiz (não há trilha a mostrar)', () => {
    const { container } = render(
      <MaterialBreadcrumb compendium={raiz} compendiums={acervo} onOpenCompendium={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('colapsa a trilha longa e mostra o caminho completo ao expandir', () => {
    render(<MaterialBreadcrumb compendium={ceftriaxona} compendiums={acervo} onOpenCompendium={vi.fn()} />);

    // Colapsado: só o pai imediato aparece como link.
    expect(screen.getByRole('button', { name: 'Terceira geração' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Antibióticos' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Mostrar os 4 níveis anteriores/ }));

    // Expandido: todos os ancestrais viram link, na ordem raiz → pai.
    for (const label of ['Antibióticos', 'Parede celular', 'β-lactâmicos', 'Terceira geração']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('usa nav_short_title quando existe e o título completo quando não existe', () => {
    render(<MaterialBreadcrumb compendium={ceftriaxona} compendiums={acervo} onOpenCompendium={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Mostrar os 4 níveis anteriores/ }));

    // 'Parede celular' é o rótulo curto; o título completo não aparece na trilha.
    expect(screen.getByRole('button', { name: 'Parede celular' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Inibidores da síntese da parede celular' })).toBeNull();
    // 'β-lactâmicos' não tem rótulo curto: cai no título.
    expect(screen.getByRole('button', { name: 'β-lactâmicos' })).toBeTruthy();
  });

  it('clicar num ancestral abre aquele material', () => {
    const onOpen = vi.fn();
    render(<MaterialBreadcrumb compendium={ceftriaxona} compendiums={acervo} onOpenCompendium={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Terceira geração' }));
    expect(onOpen).toHaveBeenCalledWith('cef3');
  });

  it('material atual não é link (é o nível corrente da trilha)', () => {
    render(<MaterialBreadcrumb compendium={ceftriaxona} compendiums={acervo} onOpenCompendium={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Ceftriaxona' })).toBeNull();
    expect(screen.getByText('Ceftriaxona')).toBeTruthy();
  });

  it('ancestral fora do acervo carregado não quebra a trilha', () => {
    // Só o filho está na lista: o pai foi filtrado fora ou não é visível.
    const { container } = render(
      <MaterialBreadcrumb compendium={ceftriaxona} compendiums={[ceftriaxona]} onOpenCompendium={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('MaterialChildrenCards ("Aprofunde-se")', () => {
  it('lista os materiais-filhos, ordenados, com tempo de leitura', () => {
    const a = mat('a', { title: 'Ceftazidima', parentMaterialId: 'cef3', treeSortOrder: 20, estimatedReadTimeMinutes: 9 });
    const b = mat('b', { title: 'Ceftriaxona', parentMaterialId: 'cef3', treeSortOrder: 10, estimatedReadTimeMinutes: 12 });
    render(
      <MaterialChildrenCards compendium={cef3} compendiums={[cef3, a, b]} onOpenCompendium={vi.fn()} />
    );

    const section = screen.getByRole('region', { name: 'Aprofunde-se' });
    const items = within(section).getAllByRole('button');
    expect(items.map((i) => i.textContent)).toEqual(['Ceftriaxona12 min', 'Ceftazidima9 min']);
  });

  it('não renderiza a seção quando o material não tem filhos', () => {
    const { container } = render(
      <MaterialChildrenCards compendium={ceftriaxona} compendiums={[ceftriaxona]} onOpenCompendium={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('clicar num filho abre aquele material', () => {
    const onOpen = vi.fn();
    const filho = mat('filho', { title: 'Ceftriaxona', parentMaterialId: 'cef3' });
    render(<MaterialChildrenCards compendium={cef3} compendiums={[cef3, filho]} onOpenCompendium={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: /Ceftriaxona/ }));
    expect(onOpen).toHaveBeenCalledWith('filho');
  });
});

describe('MaterialLinkBoxes ("Estude antes" / "Veja também")', () => {
  const alvoPrereq = mat('prereq', { title: 'β-lactamases e seus inibidores' });
  const alvoRelated = mat('related', { title: 'Meningite bacteriana' });

  const comLinks = mat('atual', {
    title: 'Ceftriaxona',
    navigationLinks: [
      { materialId: 'prereq', linkType: 'prerequisite', sortOrder: 0 },
      { materialId: 'related', linkType: 'related', sortOrder: 0 },
    ],
  });

  it('separa os dois tipos em caixas distintas e nomeadas', () => {
    render(
      <MaterialLinkBoxes
        compendium={comLinks}
        compendiums={[comLinks, alvoPrereq, alvoRelated]}
        onOpenCompendium={vi.fn()}
      />
    );

    const antes = screen.getByRole('region', { name: 'Estude antes' });
    const tambem = screen.getByRole('region', { name: 'Veja também' });
    expect(within(antes).getByRole('button', { name: 'β-lactamases e seus inibidores' })).toBeTruthy();
    expect(within(tambem).getByRole('button', { name: 'Meningite bacteriana' })).toBeTruthy();
  });

  // Regra do piloto: nenhum link publicado pode levar a material inexistente
  // ou em rascunho. Se o destino não está no acervo visível, some.
  it('omite o link cujo destino não está no acervo visível, em vez de renderizar link quebrado', () => {
    render(
      <MaterialLinkBoxes compendium={comLinks} compendiums={[comLinks, alvoPrereq]} onOpenCompendium={vi.fn()} />
    );

    expect(screen.getByRole('region', { name: 'Estude antes' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Veja também' })).toBeNull();
    expect(screen.queryByText('Meningite bacteriana')).toBeNull();
  });

  it('não renderiza nada quando o material não tem ligação nenhuma', () => {
    const { container } = render(
      <MaterialLinkBoxes compendium={ceftriaxona} compendiums={[ceftriaxona]} onOpenCompendium={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('respeita sortOrder dentro de cada caixa', () => {
    const p1 = mat('p1', { title: 'Primeiro' });
    const p2 = mat('p2', { title: 'Segundo' });
    const atual = mat('atual2', {
      navigationLinks: [
        { materialId: 'p2', linkType: 'prerequisite', sortOrder: 10 },
        { materialId: 'p1', linkType: 'prerequisite', sortOrder: 0 },
      ],
    });
    render(<MaterialLinkBoxes compendium={atual} compendiums={[atual, p1, p2]} onOpenCompendium={vi.fn()} />);

    const antes = screen.getByRole('region', { name: 'Estude antes' });
    expect(within(antes).getAllByRole('button').map((b) => b.textContent)).toEqual(['Primeiro', 'Segundo']);
  });
});
