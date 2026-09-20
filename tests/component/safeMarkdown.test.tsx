import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { SafeMarkdown } from '../../src/components/common/SafeMarkdown';

// Achado revisando visualmente um compêndio real na Área Editorial: um
// `#### Subtítulo` colado direto acima do parágrafo seguinte, uma tabela
// ou uma lista com marcadores começando na linha seguinte a uma frase (sem
// linha em branco separando), caíam no MESMO bloco de texto — o parser de
// blocos do SafeMarkdown só reconhece heading/tabela/lista quando o bloco
// inteiro começa com `#`/`|`/marcador. O `####`/`|`/`*` apareciam como
// texto literal pro estudante em vez de virar `<h4>`/`<table>`/`<ul>`. Ver
// normalizeBlockBoundaries em SafeMarkdown.tsx.

afterEach(() => {
  cleanup();
});

describe('SafeMarkdown — normalização de blocos sem linha em branco', () => {
  it('renderiza um heading "####" colado ao parágrafo seguinte como <h4>, não como texto literal', () => {
    const content = [
      '#### Tempo de Suspensão de Broncodilatadores',
      'Para exames diagnósticos iniciais, as medicações devem ser suspensas.',
    ].join('\n');

    render(<SafeMarkdown content={content} />);

    expect(screen.getByRole('heading', { level: 4, name: 'Tempo de Suspensão de Broncodilatadores' })).toBeTruthy();
    expect(screen.getByText('Para exames diagnósticos iniciais, as medicações devem ser suspensas.')).toBeTruthy();
    expect(screen.queryByText(/####/)).toBeNull();
  });

  it('renderiza uma tabela colada ao parágrafo anterior como <table>, não como texto literal', () => {
    const content = [
      'Meia-vida de ação de cada classe medicamentosa:',
      '| Classe | Tempo de Suspensão |',
      '| :--- | :--- |',
      '| SABA | 4 a 6 horas |',
      'Texto depois da tabela.',
    ].join('\n');

    render(<SafeMarkdown content={content} />);

    const table = screen.getByRole('table');
    expect(table).toBeTruthy();
    expect(screen.getByText('SABA')).toBeTruthy();
    expect(screen.getByText('4 a 6 horas')).toBeTruthy();
    expect(screen.getByText('Texto depois da tabela.')).toBeTruthy();
    // A linha de separador "| :--- | :--- |" não deve virar uma linha de dados.
    expect(screen.queryByText(':---')).toBeNull();
  });

  it('renderiza uma lista de marcadores colada ao parágrafo anterior como <ul>, não como texto literal', () => {
    const content = [
      'Os parâmetros espirométricos primários incluem:',
      '*   **VEF1:** Reflete o calibre das vias aéreas.',
      '*   **CVF:** Volume máximo de ar exalado.',
    ].join('\n');

    render(<SafeMarkdown content={content} />);

    expect(screen.getByText('Os parâmetros espirométricos primários incluem:')).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(screen.queryByText(/^\*\s+\*\*VEF1/)).toBeNull();
  });

  it('renderiza uma lista numerada colada ao parágrafo anterior como <ol>, não como texto literal', () => {
    const content = [
      'A execução do exame exige um ciclo de 4 fases:',
      '1.  Inspiração rápida e completa.',
      '2.  Pausa de hesitação no pico inspiratório.',
    ].join('\n');

    render(<SafeMarkdown content={content} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });

  it('preserva o reflow de um item de lista digitado em várias linhas (não insere linha em branco no meio do item)', () => {
    const content = [
      'Lista de exemplo:',
      '*   Primeiro item que continua',
      '    na linha seguinte sem marcador',
      '*   Segundo item',
    ].join('\n');

    render(<SafeMarkdown content={content} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('•Primeiro item que continua na linha seguinte sem marcador');
  });

  it('renderiza um blockquote colado ao parágrafo anterior como destaque, não como texto literal', () => {
    const content = [
      'Esse ganho de volume reflete a redução do aprisionamento aéreo.',
      '> 💡 **Pérola Clínica:** verifique a CVF e a CI.',
    ].join('\n');

    render(<SafeMarkdown content={content} />);

    expect(screen.getByText('Esse ganho de volume reflete a redução do aprisionamento aéreo.')).toBeTruthy();
    expect(screen.getByText(/Pérola Clínica/)).toBeTruthy();
    expect(screen.getByText(/verifique a CVF e a CI\./)).toBeTruthy();
    expect(screen.queryByText(/^>/)).toBeNull();
  });

  it('continua funcionando com heading/tabela já separados por linha em branco (comportamento pré-existente)', () => {
    const content = [
      '#### Contraindicações',
      '',
      'A manobra gera picos de pressão intratorácica.',
      '',
      '| Classe | Exemplo |',
      '| :--- | :--- |',
      '| A | B |',
    ].join('\n');

    render(<SafeMarkdown content={content} />);

    expect(screen.getByRole('heading', { level: 4, name: 'Contraindicações' })).toBeTruthy();
    expect(screen.getByText('A manobra gera picos de pressão intratorácica.')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });
});
