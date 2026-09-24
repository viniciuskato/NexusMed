import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Compendium, Discipline } from '../../src/types';
import { MaterialNavigationFields } from '../../src/components/admin/MaterialNavigationFields';
import { MaterialNavigationValue, navigationValueFromCompendium, emptyNavigationValue } from '../../src/utils/materialNavigation';

// 43-A — o bloco "Posição na árvore", usado igual no formulário de edição e no
// modal "Importar material": sem os três campos congelados, pai de qualquer
// disciplina, e "para o fim dos irmãos" quando a ordem não foi tocada.

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

const disciplines: Discipline[] = [
  { id: 'farmaco', name: 'Farmacologia', code: 'FARMACO', icon: 'pill', description: '', cycle: 'basico', color: '#000' },
  { id: 'infecto', name: 'Infectologia', code: 'INFECTO', icon: 'bug', description: '', cycle: 'clinico', color: '#000' },
];

const betaLactamicos = mat('beta', { title: 'β-lactâmicos' });
const penicilinas = mat('pen', { title: 'Penicilinas', parentMaterialId: 'beta', treeSortOrder: 10 });
const cefalosporinas = mat('cef', { title: 'Cefalosporinas', parentMaterialId: 'beta', treeSortOrder: 20 });
const meningite = mat('men', { title: 'Meningite bacteriana', disciplineId: 'infecto', themeId: 'snc' });
const meningococo = mat('mng', { title: 'Meningococo', disciplineId: 'infecto', themeId: 'snc', parentMaterialId: 'men', treeSortOrder: 40 });
const acervo = [betaLactamicos, penicilinas, cefalosporinas, meningite, meningococo];

function Host({
  initial,
  selfId = null,
  disciplineId = 'infecto',
  onParentChange = vi.fn(),
  onValue = vi.fn(),
}: {
  initial: MaterialNavigationValue;
  selfId?: string | null;
  disciplineId?: string;
  onParentChange?: (p: Compendium | null) => void;
  onValue?: (v: MaterialNavigationValue) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <MaterialNavigationFields
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
      onParentChange={onParentChange}
      compendiums={acervo}
      disciplines={disciplines}
      disciplineId={disciplineId}
      selfId={selfId}
      currentTitle="Material em edição"
      idPrefix="t"
    />
  );
}

const parentSelect = () => screen.getByLabelText('Material-pai') as HTMLSelectElement;
const orderInput = () => screen.getByLabelText('Ordem entre os irmãos') as HTMLInputElement;

afterEach(() => cleanup());

describe('MaterialNavigationFields (43-A)', () => {
  it('não mostra mais "Tipo do nó", "Estude antes" nem "Veja também"', () => {
    render(<Host initial={emptyNavigationValue()} />);
    expect(screen.queryByText(/tipo do nó/i)).toBeNull();
    expect(screen.queryByText(/estude antes/i)).toBeNull();
    expect(screen.queryByText(/veja também/i)).toBeNull();
    // Os campos que ficam continuam lá.
    expect(parentSelect()).toBeTruthy();
    expect(orderInput()).toBeTruthy();
    expect(screen.getByLabelText(/rótulo curto/i)).toBeTruthy();
  });

  it('a lista de pais traz materiais de qualquer disciplina, agrupados por disciplina', () => {
    render(<Host initial={emptyNavigationValue()} disciplineId="infecto" />);
    const groups = Array.from(parentSelect().querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).toEqual(['Farmacologia', 'Infectologia']);
    const farmaco = parentSelect().querySelector('optgroup[label="Farmacologia"]') as HTMLElement;
    expect(within(farmaco).getByRole('option', { name: 'Penicilinas' })).toBeTruthy();
  });

  it('escolher um pai avisa o host com o material escolhido (disciplina e tema vêm dele)', () => {
    const onParentChange = vi.fn();
    render(<Host initial={emptyNavigationValue()} onParentChange={onParentChange} />);
    fireEvent.change(parentSelect(), { target: { value: 'beta' } });
    expect(onParentChange).toHaveBeenLastCalledWith(betaLactamicos);
    fireEvent.change(parentSelect(), { target: { value: '' } });
    expect(onParentChange).toHaveBeenLastCalledWith(null);
  });

  it('sem mexer na ordem, o material vai para o fim dos irmãos', () => {
    const onValue = vi.fn();
    render(<Host initial={emptyNavigationValue()} onValue={onValue} />);
    fireEvent.change(parentSelect(), { target: { value: 'beta' } });
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ parentId: 'beta', treeSortOrder: 30 }));
    expect(orderInput().value).toBe('30');
  });

  it('ordem digitada pela pessoa não é sobrescrita ao escolher o pai', () => {
    const onValue = vi.fn();
    render(<Host initial={emptyNavigationValue()} onValue={onValue} />);
    fireEvent.change(orderInput(), { target: { value: '15' } });
    fireEvent.change(parentSelect(), { target: { value: 'beta' } });
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ parentId: 'beta', treeSortOrder: 15 }));
  });

  it('na edição, voltar ao pai original devolve a ordem original', () => {
    const onValue = vi.fn();
    render(
      <Host initial={navigationValueFromCompendium(penicilinas)} selfId="pen" disciplineId="farmaco" onValue={onValue} />
    );
    fireEvent.change(parentSelect(), { target: { value: 'men' } });
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ parentId: 'men', treeSortOrder: 50 }));
    // Sem a regra, voltaria para o fim (30) — e "Salvar" gravaria uma ordem nova.
    fireEvent.change(parentSelect(), { target: { value: 'beta' } });
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ parentId: 'beta', treeSortOrder: 10 }));
  });
});
