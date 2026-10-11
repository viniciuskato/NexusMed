import { describe, expect, it } from 'vitest';
import { campoDoAnki, campoEntreAspas, montarArquivoAnki } from '../../src/utils/exportarCartoesAnki';
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

/** Leitor de texto separado por tabulação com aspas (RFC 4180), como o importador de texto do Anki lê o arquivo. */
function lerComoAnki(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let entreAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreAspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') entreAspas = false;
      else campo += c;
    } else if (c === '"' && campo === '') entreAspas = true;
    else if (c === '\t') {
      linha.push(campo);
      campo = '';
    } else if (c === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

const corpo = (texto: string) => texto.split('\n').slice(2).join('\n');

describe('montarArquivoAnki', () => {
  it('cabeçalho do Anki (#separator:tab e #html:false) e uma linha frente<TAB>verso por cartão, cada campo entre aspas', () => {
    const r = montarArquivoAnki([cartao('Qual o corte da TFG?', '60 mL/min'), cartao('Segunda', 'Resposta')]);
    expect(r.texto).toBe('#separator:tab\n#html:false\n"Qual o corte da TFG?"\t"60 mL/min"\n"Segunda"\t"Resposta"\n');
    expect(r.total).toBe(2);
    const linhas = r.texto.split('\n').filter((l) => l !== '');
    expect(linhas.slice(0, 2)).toEqual(['#separator:tab', '#html:false']);
    // Uma linha por cartão, cada uma com exatamente uma tabulação (dois campos).
    for (const linha of linhas.slice(2)) expect(linha.split('\t')).toHaveLength(2);
    expect(lerComoAnki(corpo(r.texto))).toEqual([
      ['Qual o corte da TFG?', '60 mL/min'],
      ['Segunda', 'Resposta'],
    ]);
  });

  it('tabulação e quebra de linha dentro do texto viram espaço: nunca criam campo nem linha a mais', () => {
    const r = montarArquivoAnki([
      cartao('Frente\ncom\r\nquebras e\ttabulação', 'Verso:\n\n1. um\n2.\tdois\r3. três'),
      cartao('Outro', 'cartão'),
    ]);
    const linhas = r.texto.split('\n').filter((l) => l !== '').slice(2);
    expect(linhas).toEqual(['"Frente com quebras e tabulação"\t"Verso: 1. um 2. dois 3. três"', '"Outro"\t"cartão"']);
    expect(r.total).toBe(2);
  });

  it('aspas no texto: as internas são dobradas, e a leitura devolve o texto e a contagem certos (não junta cartões)', () => {
    const cards = [
      cartao('"Pérola" — **negrito** <b>x</b>', "d'água & CO₂ ≥ 60"),
      cartao('Termina com aspa"', 'Aspa " no meio'),
      cartao('Cartão seguinte', 'Verso seguinte'),
    ];
    const r = montarArquivoAnki(cards);
    expect(r.texto.split('\n')[2]).toBe('"""Pérola"" — **negrito** <b>x</b>"\t"d\'água & CO₂ ≥ 60"');
    const lidos = lerComoAnki(corpo(r.texto));
    expect(lidos).toEqual([
      ['"Pérola" — **negrito** <b>x</b>', "d'água & CO₂ ≥ 60"],
      ['Termina com aspa"', 'Aspa " no meio'],
      ['Cartão seguinte', 'Verso seguinte'],
    ]);
    expect(lidos).toHaveLength(r.total);
  });

  it('o destaque do mecanismo entra no verso, a menos que o verso já o traga', () => {
    const r = montarArquivoAnki([
      cartao('A', 'Verso A', { mechanismHighlight: 'Mecanismo A' }),
      cartao('B', 'Verso B com o Mecanismo B dentro', { mechanismHighlight: 'Mecanismo B' }),
      cartao('C', '', { mechanismHighlight: 'Só o destaque' }),
    ]);
    expect(r.texto.split('\n').slice(2, 5)).toEqual([
      '"A"\t"Verso A — Mecanismo A"',
      '"B"\t"Verso B com o Mecanismo B dentro"',
      '"C"\t"Só o destaque"',
    ]);
  });

  it('cartão sem frente não entra; sem nenhum cartão o total é 0', () => {
    const r = montarArquivoAnki([cartao('  ', 'verso sem frente'), cartao('Com frente', 'verso')]);
    expect(r.total).toBe(1);
    expect(r.texto).toBe('#separator:tab\n#html:false\n"Com frente"\t"verso"\n');
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

describe('campoEntreAspas', () => {
  it('envolve em aspas e dobra as aspas internas', () => {
    expect(campoEntreAspas('a')).toBe('"a"');
    expect(campoEntreAspas('"')).toBe('""""');
    expect(campoEntreAspas('')).toBe('""');
  });
});
