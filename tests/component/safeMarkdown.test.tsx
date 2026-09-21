import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { SafeMarkdown, parseInline } from '../../src/components/common/SafeMarkdown';

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

describe('SafeMarkdown — legenda de fonte em tabela', () => {
  // PADRAO-NEXUSMED-CONTEUDOS.md pede citação na frase que introduz a
  // tabela, não em cada célula — mas isso deixa a citação fisicamente longe
  // da tabela. Achado real: compêndio de Espirometria, 3 tabelas já citadas
  // na frase de abertura, mas sem nenhuma citação grudada na própria
  // tabela — lido como "tabela sem referência" por quem estuda. A legenda
  // "Fonte: [N]" é derivada automaticamente do parágrafo anterior, sem
  // exigir reescrever conteúdo já correto.
  it('deriva a legenda "Fonte: [N]" das citações do parágrafo que introduz a tabela', () => {
    const content = [
      'Substituindo o antigo conceito binário, o sistema atual gradua o exame em letras [1](#ref-1)[2](#ref-2)[8](#ref-8):',
      '',
      '| Grau | Aplicação |',
      '| :--- | :--- |',
      '| A | Plena confiança |',
    ].join('\n');

    render(<SafeMarkdown content={content} />);

    expect(screen.getByText('Fonte:')).toBeTruthy();
    const table = screen.getByRole('table');
    const caption = table.parentElement?.parentElement?.querySelector('a[href="#ref-8"]');
    expect(caption?.textContent).toBe('[8]');
  });

  it('não duplica número de referência citado mais de uma vez no mesmo parágrafo', () => {
    const content = [
      'Dado consagrado pela diretriz [1](#ref-1)[1](#ref-1):',
      '',
      '| Grau | Aplicação |',
      '| :--- | :--- |',
      '| A | Plena confiança |',
    ].join('\n');

    render(<SafeMarkdown content={content} />);

    expect(screen.getAllByText('[1]')).toHaveLength(1);
  });

  it('não mostra legenda quando o parágrafo anterior não tem nenhuma citação', () => {
    const content = [
      'Segue a tabela de referência rápida:',
      '',
      '| Grau | Aplicação |',
      '| :--- | :--- |',
      '| A | Plena confiança |',
    ].join('\n');

    render(<SafeMarkdown content={content} />);

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByText('Fonte:')).toBeNull();
  });

  it('não mostra legenda quando a tabela é o primeiro bloco (sem parágrafo anterior)', () => {
    const content = ['| Grau | Aplicação |', '| :--- | :--- |', '| A | Plena confiança |'].join('\n');

    render(<SafeMarkdown content={content} />);

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByText('Fonte:')).toBeNull();
  });
});

describe('SafeMarkdown — negrito com itálico aninhado', () => {
  it('renderiza "**negrito (*itálico*)**" sem deixar asteriscos soltos como texto literal', () => {
    const content = 'no chamado **Ponto de Igual Pressão (*Equal Pressure Point*)** simples.';

    const { container } = render(<SafeMarkdown content={content} />);

    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('Ponto de Igual Pressão (Equal Pressure Point)');
    expect(strong?.querySelector('em')?.textContent).toBe('Equal Pressure Point');
    expect(container.textContent).toBe('no chamado Ponto de Igual Pressão (Equal Pressure Point) simples.');
    expect(container.textContent).not.toContain('*');
  });
});

describe('SafeMarkdown — fórmula em destaque e decodificação de expoente "^"', () => {
  // Achado revisando visualmente o compêndio de TFGe publicado: a fórmula
  // CKD-EPI 2021 (notação em texto puro, já sem LaTeX — ver
  // fix-tfge-compendio-latex.sql) mostrava "^α"/"^(-1,200)"/"^Idade" cru na
  // tela, e ficava achatada na mesma frase corrida do texto ao redor. A
  // linha isolada por `\n` simples (sem linha em branco) dentro do mesmo
  // bloco vira um `FormulaDisplay` (`.eq-box`) separado, com o "^"
  // decodificado em `<sup>`.
  it('separa uma fórmula isolada por linha (sem linha em branco) em um bloco .eq-box, decodificando "^" em <sup>', () => {
    const content = [
      'Quando baseada unicamente na creatinina, ela é expressa matematicamente por:',
      'eGFRcr = 142 × min(SCr/κ, 1)^α × max(SCr/κ, 1)^(-1,200) × 0,9938^Idade × [1,012 se mulher]',
      'onde SCr representa a creatinina sérica (mg/dL), κ é 0,7 para mulheres.',
    ].join('\n');

    const { container } = render(<SafeMarkdown content={content} />);

    const box = container.querySelector('.eq-box');
    expect(box).toBeTruthy();
    expect(box?.textContent).toContain('eGFRcr');
    // "^" cru nunca deve sobrar em texto — deve virar <sup>.
    expect(container.textContent).not.toContain('^');
    const sups = box?.querySelectorAll('sup') ?? [];
    expect(sups.length).toBe(3); // α, (-1,200), Idade
    expect(Array.from(sups).map((s) => s.textContent)).toEqual(['α', '-1,200', 'Idade']);

    // Prosa antes/depois da fórmula continua em parágrafo normal, fora do box.
    expect(screen.getByText(/expressa matematicamente por:/)).toBeTruthy();
    expect(screen.getByText(/onde SCr representa/)).toBeTruthy();
    expect(container.querySelector('.eq-box p')).toBeNull();
  });

  it('decodifica "^" em <sup> mesmo em texto corrido comum (fora de bloco .eq-box), via parseInline', () => {
    const takeaway = 'A identidade [H+] (nmol/L) = 10^(9−pH) mostra a relação exponencial.';

    const { container } = render(<span>{parseInline(takeaway)}</span>);

    expect(container.querySelector('sup')?.textContent).toBe('9−pH');
    expect(container.textContent).not.toContain('^');
  });

  it('NÃO promove a bloco de fórmula uma frase comum que só contém "=" como mnemônico e termina em pontuação', () => {
    // Padrão real e frequente no acervo: "Tumor = instalação gradual; AVC =
    // súbita." — tem "=" mas é prosa (mnemônico), não uma equação de
    // exibição. Termina em pontuação de frase, então o parser deve manter
    // como parágrafo comum, sem criar `.eq-box`.
    const content = 'Regra prática: tumor = instalação gradual, ao longo de semanas.';

    const { container } = render(<SafeMarkdown content={content} />);

    expect(container.querySelector('.eq-box')).toBeNull();
    expect(screen.getByText(content)).toBeTruthy();
  });

  it('trata uma fórmula que ocupa o bloco inteiro (sem prosa ao redor) como .eq-box único', () => {
    const content = 'TFG absoluta (mL/min) = TFGe indexada (mL/min/1,73 m²) × [ASC real (m²) ÷ 1,73]';

    const { container } = render(<SafeMarkdown content={content} />);

    const boxes = container.querySelectorAll('.eq-box');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].textContent).toContain('TFG absoluta');
  });

  // Achado revisando o compêndio de Espirometria: a fórmula do Escore Z
  // vem como blockquote ("> Escore Z = ..."), não como linha isolada de
  // parágrafo — antes desta correção caía no `<blockquote>` genérico
  // (itálico, sem destaque de fórmula). A citação `[N](#ref-N)` grudada no
  // fim da própria linha (não numa frase separada) precisa virar link de
  // "Fonte:", não texto cru dentro do card.
  it('trata uma fórmula em blockquote ("> Fórmula = ... [N](#ref-N)") como .eq-box, com a citação à parte como "Fonte:"', () => {
    const content = '> Escore Z = (Valor Medido − Valor Previsto) ÷ Desvio Padrão da População de Referência [1](#ref-1)[3](#ref-3)';

    const { container } = render(<SafeMarkdown content={content} />);

    const box = container.querySelector('.eq-box');
    expect(box).toBeTruthy();
    expect(box?.textContent).toContain('Escore Z');
    expect(box?.textContent).not.toContain('[1]');
    expect(container.querySelector('blockquote')).toBeNull();

    expect(screen.getByText('Fonte:')).toBeTruthy();
    const links = container.querySelectorAll('a[href^="#ref-"]');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('#ref-1');
    expect(links[0].textContent).toBe('[1]');
  });

  it('mantém o blockquote comum (sem "=") no <blockquote> de sempre, não vira fórmula', () => {
    const content = '> 💡 **Pérola Clínica:** verifique a CVF e a CI.';

    const { container } = render(<SafeMarkdown content={content} />);

    expect(container.querySelector('.eq-box')).toBeNull();
    expect(screen.getByText(/Pérola Clínica/)).toBeTruthy();
  });
});

describe('parseInline — usado fora do SafeMarkdown (Pontos-Chave, Pérola Clínica, flashcards)', () => {
  // Campos curtos como keyTakeaways/clinicalPearl/warningAlert e os
  // flashcards derivados deles (CompendiumReader, FlashcardsView,
  // FlashcardReviewSession, GlobalSearchModal, AdminCMSView) carregam
  // citação `[N](#ref-N)` igual ao corpo do texto, mas são renderizados
  // fora do SafeMarkdown (numa <li>/<span>/<p> já existente). Achado real:
  // o corpo do compêndio de Espirometria já citava certo via SafeMarkdown,
  // mas o box "Pontos-Chave & Mecanismos" mostrava "[1](#ref-1)[3](#ref-3)"
  // como texto literal — porque esses componentes nunca chamavam nenhum
  // parser, só interpolavam a string crua. Este teste trava que
  // `parseInline` (agora exportado) resolve exatamente esse texto real.
  it('converte "[N](#ref-N)" em link de citação, não em texto literal', () => {
    const takeaway =
      'A relação VEF1/CVF reduzida (abaixo do Limite Inferior da Normalidade) é o divisor de águas para o diagnóstico de Distúrbio Ventilatório Obstrutivo (DVO) [1](#ref-1)[3](#ref-3).';

    const { container } = render(<ul><li>{parseInline(takeaway)}</li></ul>);

    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toBe('1');
    expect(links[0].getAttribute('href')).toBe('#ref-1');
    expect(links[1].textContent).toBe('3');
    expect(container.textContent).not.toContain('(#ref-1)');
    expect(container.textContent).not.toContain('[1]');
  });
});
