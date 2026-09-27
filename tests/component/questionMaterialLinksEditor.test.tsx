import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Compendium, QuestionMaterialLink } from '../../src/types';
import { QuestionMaterialLinksEditor } from '../../src/components/admin/QuestionMaterialLinksEditor';

// 43-B: a questão cobra um ou vários materiais, escolhidos por busca e clique
// (nunca por título digitado), com seção opcional por material.

const material = (id: string, title: string, sections: Array<[string, string]> = []): Compendium => ({
  id, disciplineId: 'd', themeId: 't', title, subtitle: '', estimatedReadTimeMinutes: 10,
  lastUpdated: '', author: '', references: [], publicationStatus: 'published',
  sections: sections.map(([sid, stitle]) => ({ id: sid, title: stitle, content: 'C', keyTakeaways: [] })),
});
const materiais = [
  material('mat-ceftri', 'Ceftriaxona', [['sec-espectro', 'Espectro'], ['sec-dose', 'Dose']]),
  material('mat-ceftaz', 'Ceftazidima'),
];

function Harness({ initial, onChange }: { initial: QuestionMaterialLink[]; onChange: (l: QuestionMaterialLink[]) => void }) {
  const [links, setLinks] = useState(initial);
  return (
    <QuestionMaterialLinksEditor
      htmlId="q1"
      compendiums={materiais}
      value={links}
      onChange={(l) => {
        setLinks(l);
        onChange(l);
      }}
    />
  );
}

afterEach(() => cleanup());

describe('QuestionMaterialLinksEditor (43-B)', () => {
  it('escolhe dois materiais por busca e clique, com seção só no primeiro', () => {
    const onChange = vi.fn();
    render(<Harness initial={[]} onChange={onChange} />);

    const busca = screen.getByLabelText(/Materiais cobrados/i);
    fireEvent.change(busca, { target: { value: 'ceftri' } });
    fireEvent.click(screen.getByRole('button', { name: /^Ceftriaxona/ }));
    fireEvent.change(busca, { target: { value: 'ceftaz' } });
    fireEvent.click(screen.getByRole('button', { name: /^Ceftazidima/ }));

    fireEvent.change(screen.getByLabelText('Seção de Ceftriaxona (opcional)'), { target: { value: 'sec-dose' } });

    expect(onChange).toHaveBeenLastCalledWith([
      { materialId: 'mat-ceftri', sectionId: 'sec-dose' },
      { materialId: 'mat-ceftaz' },
    ]);
  });

  it('mostra os vínculos existentes e remove um sem mexer no outro', () => {
    const onChange = vi.fn();
    render(<Harness initial={[{ materialId: 'mat-ceftri', sectionId: 'sec-espectro' }, { materialId: 'mat-ceftaz' }]} onChange={onChange} />);

    expect((screen.getByLabelText('Seção de Ceftriaxona (opcional)') as HTMLSelectElement).value).toBe('sec-espectro');
    fireEvent.click(screen.getByRole('button', { name: /Ceftazidima.*Remover|Remover.*Ceftazidima/ }));

    expect(onChange).toHaveBeenLastCalledWith([{ materialId: 'mat-ceftri', sectionId: 'sec-espectro' }]);
  });

  it('não oferece campo de título digitado', () => {
    render(<Harness initial={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole('textbox', { name: /título do material/i })).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(1); // só a busca
  });
});
