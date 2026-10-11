import { describe, expect, it } from 'vitest';
import { campoDoAnki, montarArquivoAnki } from '../../src/utils/exportarCartoesAnki';
import type { Flashcard } from '../../src/types';

// CORTE-1 (D-14): o arquivo de importação do Anki com os cartões que o usuário já tem.

const cartao = (front: string, back: string, extra: Partial<Flashcard> = {}): Flashcard =>
  ({
    id: `id-${front}`,
    disciplineId: 'd',
    themeId: 't',
    front,
    back,
    mechanismHighlight: '',
    tags: [],
    difficulty: 'medio',
    srs: { intervalDays: 1, repetitionCount: 0, easeFactor: 2.5, nextDueDate: '2020-01-01', state: 'new', reviewHistory: [] },
    ...extra,
  }) as Flashcard;

describe('montarArquivoAnki', () => {
  it('cabeçalho do Anki (#separator:tab e #html:false) e uma linha frente<TAB>verso por cartão', () => {
    const r = montarArquivoAnki([cartao('Qual o corte da TFG?', '60 mL/min'), cartao('Segunda', 'Resposta')]);
    expect(r.texto).toBe('#separator:tab\n#html:false\nQual o corte da TFG?\t60 mL/min\nSegunda\tResposta\n');
    expect(r.total).toBe(2);
    const linhas = r.texto.split('\n').filter((l) => l !== '');
    expect(linhas.slice(0, 2)).toEqual(['#separator:tab', '#html:false']);
    // Uma linha por cartão, cada uma com exatamente uma tabulação (dois campos).
    for (const linha of linhas.slice(2)) expect(linha.split('\t')).toHaveLength(2);
  });

  it('tabulação e quebra de linha dentro do texto viram espaço: nunca criam campo nem linha a mais', () => {
    const r = montarArquivoAnki([
      cartao('Frente\ncom\r\nquebras e\ttabulação', 'Verso:\n\n1. um\n2.\tdois\r3. três'),
      cartao('Outro', 'cartão'),
    ]);
    const linhas = r.texto.split('\n').filter((l) => l !== '').slice(2);
    expect(linhas).toEqual(['Frente com quebras e tabulação\tVerso: 1. um 2. dois 3. três', 'Outro\tcartão']);
    expect(r.total).toBe(2);
  });

  it('o texto do cartão não é alterado além disso (acentos, aspas, Markdown e HTML ficam como estão)', () => {
    const r = montarArquivoAnki([cartao('"Pérola" — **negrito** <b>x</b>', "d'água & CO₂ ≥ 60")]);
    expect(r.texto.split('\n')[2]).toBe('"Pérola" — **negrito** <b>x</b>\td\'água & CO₂ ≥ 60');
  });

  it('o destaque do mecanismo entra no verso, a menos que o verso já o traga', () => {
    const r = montarArquivoAnki([
      cartao('A', 'Verso A', { mechanismHighlight: 'Mecanismo A' }),
      cartao('B', 'Verso B com o Mecanismo B dentro', { mechanismHighlight: 'Mecanismo B' }),
      cartao('C', '', { mechanismHighlight: 'Só o destaque' }),
    ]);
    expect(r.texto.split('\n').slice(2, 5)).toEqual([
      'A\tVerso A — Mecanismo A',
      'B\tVerso B com o Mecanismo B dentro',
      'C\tSó o destaque',
    ]);
  });

  it('cartão sem frente não entra; sem nenhum cartão o total é 0', () => {
    const r = montarArquivoAnki([cartao('  ', 'verso sem frente'), cartao('Com frente', 'verso')]);
    expect(r.total).toBe(1);
    expect(r.texto).toBe('#separator:tab\n#html:false\nCom frente\tverso\n');
    expect(montarArquivoAnki([]).total).toBe(0);
    expect(montarArquivoAnki([cartao('', 'x')]).total).toBe(0);
  });

  it('o nome do arquivo leva a data local e termina em .txt', () => {
    expect(montarArquivoAnki([], new Date(2026, 9, 11, 23, 30)).nomeDoArquivo).toBe('cartoes-nexusmed-2026-10-11.txt');
  });
});

describe('campoDoAnki', () => {
  it('apara as pontas, junta espaços e aceita vazio/nulo', () => {
    expect(campoDoAnki('  a \t b\n\nc  ')).toBe('a b c');
    expect(campoDoAnki('')).toBe('');
    expect(campoDoAnki(undefined)).toBe('');
    expect(campoDoAnki(null)).toBe('');
  });
});
