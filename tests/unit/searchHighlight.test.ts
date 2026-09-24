import { describe, it, expect } from 'vitest';
import { HIGHLIGHT_END, HIGHLIGHT_START, splitHighlight } from '../../src/utils/searchHighlight';

// 43-D — o trecho da busca chega do banco com os termos entre marcadores
// próprios (U+E000 … U+E001), nunca como HTML. Aqui, só a separação em
// pedaços; a renderização como texto está no teste de componente.

const S = HIGHLIGHT_START;
const E = HIGHLIGHT_END;

describe('splitHighlight', () => {
  it('separa os trechos marcados dos demais', () => {
    expect(splitHighlight(`a barreira ${S}hematoencefálica${E}.`)).toEqual([
      { text: 'a barreira ', highlighted: false },
      { text: 'hematoencefálica', highlighted: true },
      { text: '.', highlighted: false },
    ]);
  });

  it('texto sem marcador vira um pedaço só', () => {
    expect(splitHighlight('Da primeira à quinta geração')).toEqual([
      { text: 'Da primeira à quinta geração', highlighted: false },
    ]);
  });

  it('vários destaques e destaque no começo', () => {
    expect(splitHighlight(`${S}Cefalosporinas${E} de ${S}terceira${E}`)).toEqual([
      { text: 'Cefalosporinas', highlighted: true },
      { text: ' de ', highlighted: false },
      { text: 'terceira', highlighted: true },
    ]);
  });

  it('marcador solto não aparece nem quebra o texto', () => {
    expect(splitHighlight(`fim${E} sem início`)).toEqual([{ text: 'fim sem início', highlighted: false }]);
    expect(splitHighlight(`sem ${S}fim`)).toEqual([
      { text: 'sem ', highlighted: false },
      { text: 'fim', highlighted: true },
    ]);
  });

  it('vazio e nulo não geram pedaços', () => {
    expect(splitHighlight('')).toEqual([]);
    expect(splitHighlight(null)).toEqual([]);
  });
});
