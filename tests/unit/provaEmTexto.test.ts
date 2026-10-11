import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  chaveDeRepeticao,
  completarBancaEAno,
  conferirLeitura,
  lerProvaEmTexto,
  previewsDaProva,
  textoEhMarkdownDeQuestoes,
  validarLoteDaProva,
  type LeituraDaQuestao,
  type QuestaoDaProva,
} from '../../src/utils/provaEmTexto';
import { parseQuestionsMarkdownText } from '../../src/utils/questionsImport';

// IMPORT-2 (D-14) — "Colar o texto da prova". Lógica pura: lê o texto como sai
// de um PDF de prova e separa questão por questão. As provas abaixo são
// inventadas (nenhuma é de banca real), uma por formato aceito.

function ler(texto: string): { questoes: QuestaoDaProva[]; avisos: string[] } {
  const r = lerProvaEmTexto(texto);
  if (r.ok === false) throw new Error(`leitura falhou: ${r.errors.join(' | ')}`);
  return r;
}

const DUVIDOSA = 'Leitura duvidosa — confira o texto: ';

const resumo = (qs: QuestaoDaProva[]) =>
  qs.map((q) => ({ n: q.numero, alts: q.alternativas.length, gab: q.gabarito, anulada: q.anulada, erros: q.erros }));

// Prova A: "1.", alternativas "A)", quebras de linha do PDF, gabarito em bloco com "1-B".
const provaA = `PROVA DE RESIDÊNCIA MÉDICA 2024 - CLÍNICA MÉDICA
Leia com atenção as instruções.

1. Homem de 58 anos, tabagista, procura atendimento
com tosse crônica e dispneia aos esforços.

Espirometria mostra VEF1/CVF de 0,62. Qual o diagnóstico
mais provável?
A) Asma
B) DPOC
C) Fibrose pulmonar
D) Sarcoidose
2. Qual o antibiótico de escolha para pneumonia
adquirida na comunidade leve em adulto previamente hígido?
A) Amoxicilina
B) Gentamicina
C) Vancomicina
D) Meropenem
E) Linezolida
3. Mulher de 30 anos com hipotireoidismo em uso de levotiroxina 37.5 mcg. Qual a conduta?
A) Dobrar a dose
B) Manter a dose
C) Suspender
D) Associar T3

GABARITO
1-B
2-A
3 - C
`;

// Prova B: "Questão 1" / "QUESTÃO 02", alternativas "(A)", "Resposta:"/"Gabarito:" por questão, "Comentário:".
const provaB = `Questão 1
Lactente de 8 meses com febre há 5 dias, exantema e conjuntivite.
Qual a conduta inicial?
(A) Observar
(B) Imunoglobulina e AAS
(C) Alta com sintomáticos
Resposta: B
Comentário: Quadro típico de Kawasaki.
O tratamento precoce reduz aneurisma coronariano.

QUESTÃO 02
Paciente de 70 anos com fibrilação atrial. Qual escore estratifica o risco de AVC?
(A) CHA2DS2-VASc
(B) Child-Pugh
(C) MELD
(D) Glasgow
(E) Apgar
(F) Wells
Gabarito: A
`;

// Prova C: "01 -", alternativas "a)" e "A -", gabarito numa linha só, com anulada.
const provaC = `01 - Em relação à hipertensão arterial sistêmica, é correto afirmar:
a) A meta é sempre abaixo de 100x60
b) O IECA é contraindicado na gestação
c) Tiazídicos podem causar hipocalemia
d) Betabloqueador é primeira linha em todos
02 - Qual vacina é contraindicada em imunossuprimidos graves?
A - Tétano
B - Febre amarela
C - Hepatite B
03 - Pergunta que a banca anulou?
a) Um
b) Dois
c) Três
04 - Quanto ao diabetes tipo 2:
a) Metformina é primeira linha
b) Insulina é a única opção
c) Dieta não importa

Gabarito oficial
01. C, 02. B, 03. ANULADA, 04. A
`;

// Prova D: "1)" e gabarito em pares "1) B", "2 C" misturando separadores, com X e *.
const provaD = `1) Pergunta um?
A) Sim
B) Não
2) Pergunta dois?
A) Sim
B) Não
3) Pergunta três?
A) Sim
B) Não
4) Pergunta quatro?
A) Sim
B) Não
Gabarito
1) A  2 B; 3 - X
4: *
`;

describe('lerProvaEmTexto — prova A ("1.", "A)", gabarito em bloco "1-B")', () => {
  const { questoes, avisos } = ler(provaA);

  it('acha 3 questões, com 4, 5 e 4 alternativas e o gabarito de cada uma', () => {
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 4, gab: 'B', anulada: false, erros: [] },
      { n: 2, alts: 5, gab: 'A', anulada: false, erros: [] },
      { n: 3, alts: 4, gab: 'C', anulada: false, erros: [] },
    ]);
    expect(avisos).toEqual([]);
  });

  it('o enunciado junta as quebras de linha do PDF e preserva os parágrafos', () => {
    expect(questoes[0].enunciado).toBe(
      'Homem de 58 anos, tabagista, procura atendimento com tosse crônica e dispneia aos esforços.\n\n' +
        'Espirometria mostra VEF1/CVF de 0,62. Qual o diagnóstico mais provável?'
    );
    expect(questoes[1].enunciado).toBe(
      'Qual o antibiótico de escolha para pneumonia adquirida na comunidade leve em adulto previamente hígido?'
    );
  });

  it('as alternativas ficam na ordem da prova, com o texto', () => {
    expect(questoes[0].alternativas.map((a) => `${a.letter}:${a.text}`)).toEqual([
      'A:Asma',
      'B:DPOC',
      'C:Fibrose pulmonar',
      'D:Sarcoidose',
    ]);
  });

  it('"37.5 mcg" no meio da linha não vira questão, e o preâmbulo antes da questão 1 é ignorado', () => {
    expect(questoes[2].enunciado).toBe('Mulher de 30 anos com hipotireoidismo em uso de levotiroxina 37.5 mcg. Qual a conduta?');
    expect(questoes).toHaveLength(3);
  });
});

describe('lerProvaEmTexto — prova B ("Questão 1", "(A)", "Resposta:"/"Gabarito:", "Comentário:")', () => {
  const { questoes, avisos } = ler(provaB);

  it('acha 2 questões, com 3 e 6 alternativas e o gabarito de cada uma', () => {
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 3, gab: 'B', anulada: false, erros: [] },
      { n: 2, alts: 6, gab: 'A', anulada: false, erros: [] },
    ]);
    expect(avisos).toEqual([]);
  });

  it('o "Resposta:" não entra no texto da alternativa, e o comentário vai até a próxima questão', () => {
    expect(questoes[0].alternativas[2].text).toBe('Alta com sintomáticos');
    expect(questoes[0].comentario).toBe('Quadro típico de Kawasaki. O tratamento precoce reduz aneurisma coronariano.');
    expect(questoes[1].comentario).toBe('');
  });

  it('sem teto de alternativas: a sexta (F) é lida', () => {
    expect(questoes[1].alternativas.map((a) => a.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});

describe('lerProvaEmTexto — prova C ("01 -", "a)" e "A -", gabarito numa linha, anulada)', () => {
  const { questoes, avisos } = ler(provaC);

  it('acha 4 questões e o gabarito de cada uma, com a 3 anulada e bloqueada', () => {
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 4, gab: 'C', anulada: false, erros: [] },
      { n: 2, alts: 3, gab: 'B', anulada: false, erros: [] },
      { n: 3, alts: 3, gab: null, anulada: true, erros: ['Anulada no gabarito — não é importada.'] },
      { n: 4, alts: 3, gab: 'A', anulada: false, erros: [] },
    ]);
    expect(avisos).toEqual([]);
  });

  it('alternativas em minúscula viram maiúsculas', () => {
    expect(questoes[0].alternativas.map((a) => a.letter)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('lerProvaEmTexto — prova D (pares "1) A", "2 B", "X" e "*")', () => {
  it('lê os pares com separadores diferentes, e X e * marcam anulada', () => {
    const { questoes, avisos } = ler(provaD);
    expect(resumo(questoes).map((q) => [q.n, q.gab, q.anulada])).toEqual([
      [1, 'A', false],
      [2, 'B', false],
      [3, null, true],
      [4, null, true],
    ]);
    expect(avisos).toEqual([]);
  });

  it('pares "1 B", "01. B", "1) B" em linhas separadas também valem', () => {
    const { questoes } = ler(
      `1. Um?\nA) x\nB) y\n2. Dois?\nA) x\nB) y\n3. Três?\nA) x\nB) y\n\nGabarito\n1 B\n02. A\n3) B\n`
    );
    expect(questoes.map((q) => q.gabarito)).toEqual(['B', 'A', 'B']);
  });
});

describe('lerProvaEmTexto — erros e avisos', () => {
  it('questão sem gabarito: erro "Sem gabarito" nela; a anterior, aberta por número, também fica bloqueada (IMPORT-2b, regra e)', () => {
    const { questoes } = ler(`1. Um?\nA) x\nB) y\nResposta: A\n2. Dois?\nA) x\nB) y\n3. Três?\nA) x\nB) y\nResposta: B\n`);
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 2, gab: 'A', anulada: false, erros: [`${DUVIDOSA}a questão seguinte (2) ficou bloqueada e pode ter cortado esta.`] },
      { n: 2, alts: 2, gab: null, anulada: false, erros: ['Sem gabarito.'] },
      { n: 3, alts: 2, gab: 'B', anulada: false, erros: [] },
    ]);
  });

  it('numeração pulada gera aviso, sem bloquear a questão', () => {
    const { questoes, avisos } = ler(
      `1. Um?\nA) x\nB) y\nResposta: A\n2. Dois?\nA) x\nB) y\nResposta: A\n5. Cinco?\nA) x\nB) y\nResposta: A\n`
    );
    expect(avisos).toEqual(['Numeração pulada: depois da questão 2 vem a 5 (faltam 3, 4).']);
    expect(questoes.every((q) => q.erros.length === 0)).toBe(true);
  });

  it('numeração repetida gera aviso', () => {
    const { questoes, avisos } = ler(
      `1. Um?\nA) x\nB) y\nResposta: A\n2. Dois?\nA) x\nB) y\nResposta: A\n2. Dois de novo?\nA) x\nB) y\nResposta: A\n`
    );
    expect(questoes).toHaveLength(3);
    expect(avisos).toEqual(['Numeração repetida: a questão 2 aparece mais de uma vez.']);
  });

  it('gabarito que não é uma das alternativas bloqueia a questão', () => {
    const { questoes } = ler(`1. Um?\nA) x\nB) y\nResposta: E\n`);
    expect(questoes[0].erros).toEqual(['Gabarito "E" não é uma das alternativas desta questão.']);
  });

  it('menos de 2 alternativas bloqueia a questão', () => {
    const { questoes } = ler(`1. Um?\nA) x\nResposta: A\n`);
    expect(questoes[0].erros).toEqual(['Menos de 2 alternativas (encontradas: 1).']);
  });

  it('gabarito de bloco que cita questão inexistente vira aviso do lote', () => {
    const { avisos } = ler(`1. Um?\nA) x\nB) y\n\nGabarito\n1-A\n9-C\n`);
    expect(avisos).toEqual(['O gabarito cita a questão 9, que não está na prova (ou já tem gabarito).']);
  });

  it('linha do gabarito que não se entende vira aviso', () => {
    const { avisos } = ler(`1. Um?\nA) x\nB) y\n\nGabarito\n1-A\nconforme edital\n`);
    expect(avisos).toEqual(['Linha do gabarito não entendida (nenhum gabarito foi tirado dela): "conforme edital".']);
  });

  it('texto sem nenhuma questão devolve erro, não lista vazia', () => {
    const r = lerProvaEmTexto('Só um texto solto, sem número nenhum.');
    expect(r.ok).toBe(false);
  });
});

describe('lerProvaEmTexto — armadilhas de PDF', () => {
  it('"E. coli" no enunciado não vira alternativa fora da sequência', () => {
    const { questoes } = ler(`1. Paciente com infecção.\nE. coli é o agente mais comum. Qual o tratamento?\nA) x\nB) y\nResposta: A\n`);
    expect(questoes[0].alternativas).toHaveLength(2);
    expect(questoes[0].enunciado).toBe('Paciente com infecção. E. coli é o agente mais comum. Qual o tratamento?');
  });

  it('lista numerada dentro do enunciado, fora da sequência da prova, fica no enunciado', () => {
    const { questoes } = ler(
      `12. Fatores de risco:
1. Fumo
2. Álcool
Qual a associação correta?
A) 1 e 2
B) só 1
Resposta: A
13. Próxima?
A) x
B) y
Resposta: B
`
    );
    expect(resumo(questoes)).toEqual([
      { n: 12, alts: 2, gab: 'A', anulada: false, erros: [] },
      { n: 13, alts: 2, gab: 'B', anulada: false, erros: [] },
    ]);
    expect(questoes[0].enunciado).toBe('Fatores de risco: 1. Fumo 2. Álcool Qual a associação correta?');
  });

  it('alternativa em duas linhas junta por espaço', () => {
    const { questoes } = ler(`1. Um?\nA) texto que\ncontinua na outra linha\nB) y\nResposta: A\n`);
    expect(questoes[0].alternativas[0].text).toBe('texto que continua na outra linha');
  });

  it('aceita CRLF e espaço não separável', () => {
    const { questoes } = ler('1. Um?\r\nA) x\r\nB) y\r\nResposta: B\r\n');
    expect(resumo(questoes)).toEqual([{ n: 1, alts: 2, gab: 'B', anulada: false, erros: [] }]);
  });
});

// Rodada 2 da IMPORT-2 (revisor): leitura ambígua nunca fica "Pronta". Ou lê certo, ou a questão
// fica bloqueada com o motivo escrito; gravar gabarito errado em silêncio é o pior resultado.
describe('lerProvaEmTexto — leitura ambígua nunca vira questão gravável', () => {
  /** Questões sem erro: as que a prévia deixaria "Prontas" (com disciplina e tema escolhidos). */
  const gravaveis = (qs: QuestaoDaProva[]) => qs.filter((q) => q.erros.length === 0);

  it('lista numerada no enunciado da questão 1 ("1. Tabagismo / 2. Obesidade") fica no enunciado: as 3 questões reais saem certas', () => {
    const { questoes, avisos } = ler(`1. Sobre os fatores de risco, considere:
1. Tabagismo
2. Obesidade
3. Sedentarismo
Quais estão corretos?
A) Apenas 1
B) Apenas 2
C) Apenas 1 e 2
D) Todos
2. Segunda questão real.
A) a
B) b
3. Terceira questão real.
A) x
B) y

Gabarito
1-D 2-A 3-B`);
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 4, gab: 'D', anulada: false, erros: [] },
      { n: 2, alts: 2, gab: 'A', anulada: false, erros: [] },
      { n: 3, alts: 2, gab: 'B', anulada: false, erros: [] },
    ]);
    expect(questoes[0].enunciado).toBe('Sobre os fatores de risco, considere: 1. Tabagismo 2. Obesidade 3. Sedentarismo Quais estão corretos?');
    expect(avisos).toEqual([]);
  });

  it('item de lista seguido direto da alternativa A, com número já usado antes: nunca grava errado (lê certo ou bloqueia)', () => {
    const { questoes } = ler(
      `1. Um?\nA) x\nB) y\nResposta: A\n2. Dois?\nA) x\nB) y\nResposta: B\n3. Considere:\n1. fumo\n2. álcool\nA) só 1\nB) só 2\nResposta: A\n`
    );
    // "2. álcool" seguido de "A)" parece o início da questão 2 de novo: a numeração ambígua bloqueia as envolvidas.
    expect(questoes.filter((q) => q.erros.length === 0)).toEqual([]);
  });

  it('lista "1) 2)" no enunciado da questão 1, com alternativas "a)": fica no enunciado, as 2 questões saem certas', () => {
    const { questoes } = ler(
      `1) Considere as afirmativas:\n1) A febre é comum.\n2) A tosse é rara.\nEstá correto:\na) só 1\nb) só 2\nc) ambas\nd) nenhuma\n2) Outra questão.\na) x\nb) y\nc) z\nd) w\n\nGabarito\n1) C\n2) A`
    );
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 4, gab: 'C', anulada: false, erros: [] },
      { n: 2, alts: 4, gab: 'A', anulada: false, erros: [] },
    ]);
    expect(questoes[0].enunciado).toBe('Considere as afirmativas: 1) A febre é comum. 2) A tosse é rara. Está correto:');
  });

  it('número com hífen numa quebra de linha da alternativa ("2 - 3 tomadas") fica no texto dela, e a questão fica bloqueada (IMPORT-2b, regra c)', () => {
    const { questoes } = ler(
      `1. Dose de amoxicilina?\nA) 50 mg/kg/dia dividida em\n2 - 3 tomadas\nB) 100 mg/kg/dia\n2. Outra pergunta.\nA) sim\nB) não\n\nGabarito\n1-A 2-B`
    );
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 2, gab: 'A', anulada: false, erros: [`${DUVIDOSA}a linha "2 - 3 tomadas" começa com número e foi juntada à alternativa A.`] },
      { n: 2, alts: 2, gab: 'B', anulada: false, erros: [] },
    ]);
    expect(questoes[0].alternativas[0].text).toBe('50 mg/kg/dia dividida em 2 - 3 tomadas');
  });

  it('o mesmo "2 - 3 tomadas" depois de a questão já ter 2 alternativas abre uma questão falsa: a numeração repetida bloqueia tudo que ela tocou', () => {
    const { questoes, avisos } = ler(
      `1. Dose de amoxicilina?\nA) 50 mg/kg/dia\nB) 100 mg/kg/dia dividida em\n2 - 3 tomadas\n2. Outra pergunta.\nA) sim\nB) não\n\nGabarito\n1-A 2-B`
    );
    expect(gravaveis(questoes)).toEqual([]);
    expect(avisos).toContain('Numeração repetida: a questão 2 aparece mais de uma vez.');
    expect(questoes.every((q) => q.erros.includes('Numeração ambígua — confira o texto.'))).toBe(true);
  });

  it('"10 - 15 anos" quebrado no enunciado da questão 9 fica no enunciado', () => {
    const { questoes } = ler(
      `9. Faixa etária de maior incidência:\nentre\n10 - 15 anos de idade, qual o diagnóstico?\nA) a\nB) b\n10. Outra.\nA) c\nB) d\n\nGabarito\n9-A 10-B`
    );
    expect(resumo(questoes)).toEqual([
      { n: 9, alts: 2, gab: 'A', anulada: false, erros: [] },
      { n: 10, alts: 2, gab: 'B', anulada: false, erros: [] },
    ]);
    expect(questoes[0].enunciado).toBe('Faixa etária de maior incidência: entre 10 - 15 anos de idade, qual o diagnóstico?');
  });

  it('número fora da sequência no comentário é continuação, não questão nova; a questão fica bloqueada (IMPORT-2b, regra c)', () => {
    const { questoes, avisos } = ler(
      `Questão 5\nPaciente com febre.\nA) Dengue\nB) Zika\nResposta: A\nComentário: Os critérios são:\n1. febre\n2. mialgia\nQuestão 6\nOutra.\nA) um\nB) dois\nResposta: B`
    );
    expect(resumo(questoes)).toEqual([
      { n: 5, alts: 2, gab: 'A', anulada: false, erros: [`${DUVIDOSA}a linha "1. febre" começa com número e foi juntada ao comentário.`] },
      { n: 6, alts: 2, gab: 'B', anulada: false, erros: [] },
    ]);
    expect(questoes[0].comentario).toBe('Os critérios são: 1. febre 2. mialgia');
    expect(avisos).toEqual([]);
  });

  it('questão realmente pulada (a próxima tem alternativa A logo abaixo) continua sendo lida, só com aviso', () => {
    const { questoes, avisos } = ler(`1. Um?\nA) x\nB) y\nResposta: A\n2. Dois?\nA) x\nB) y\nResposta: B\n5. Cinco?\nA) x\nB) y\nResposta: A\nComentário: texto\n`);
    expect(questoes.map((q) => q.numero)).toEqual([1, 2, 5]);
    expect(gravaveis(questoes)).toHaveLength(3);
    expect(avisos).toEqual(['Numeração pulada: depois da questão 2 vem a 5 (faltam 3, 4).']);
  });

  it('numeração fora de ordem e repetida bloqueia as questões envolvidas, com o motivo', () => {
    const rep = ler(`1. Um?\nA) x\nB) y\nResposta: A\n2. Dois?\nA) x\nB) y\nResposta: A\n2. Dois de novo?\nA) x\nB) y\nResposta: A\n`);
    // As duas com o número repetido e a que vem antes da primeira (pode ter sido cortada) ficam bloqueadas;
    // IMPORT-2b (regra e): a que vem antes de uma bloqueada aberta por número também ganha o motivo.
    const ambigua = 'Numeração ambígua — confira o texto.';
    const seguinte = (n: number) => `${DUVIDOSA}a questão seguinte (${n}) ficou bloqueada e pode ter cortado esta.`;
    expect(rep.questoes.map((q) => q.erros)).toEqual([[ambigua, seguinte(2)], [ambigua, seguinte(2)], [ambigua]]);
    const fora = ler(`1. Um?\nA) x\nB) y\nResposta: A\n3. Três?\nA) x\nB) y\nResposta: A\n2. Dois?\nA) x\nB) y\nResposta: A\n`);
    expect(fora.avisos).toContain('Numeração fora de ordem: a questão 2 vem depois da 3.');
    expect(fora.questoes.map((q) => q.erros.length)).toEqual([1, 2, 1]);
  });

  it('questão com menos de 2 alternativas continua bloqueada', () => {
    const { questoes } = ler(`1. Um?\nA) x\nResposta: A\n`);
    expect(gravaveis(questoes)).toEqual([]);
  });
});

describe('lerProvaEmTexto — bloco de gabarito só aplica o que entende', () => {
  const alts = 'A) a\nB) b\nC) c\nD) d\nE) e';

  it('frase comum com números ("Questões 1 e 2 anuladas após recursos") marca essas questões como anuladas, sem inventar letra', () => {
    const { questoes, avisos } = ler(`1. P1\n${alts}\n2. P2\n${alts}\n3. P3\n${alts}\nGABARITO\n3-C\nQuestões 1 e 2 anuladas após recursos`);
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 5, gab: null, anulada: true, erros: ['Anulada no gabarito — não é importada.'] },
      { n: 2, alts: 5, gab: null, anulada: true, erros: ['Anulada no gabarito — não é importada.'] },
      { n: 3, alts: 5, gab: 'C', anulada: false, erros: [] },
    ]);
    expect(avisos).toEqual([]);
  });

  it('observação com datas ("Recursos de 10 a 15 de março") não vira par: a questão 10 segue com a letra do gabarito', () => {
    const { questoes, avisos } = ler(
      `10. P10\n${alts}\n11. P11\n${alts}\nGABARITO DEFINITIVO\n10-C 11-D\nRecursos de 10 a 15 de março; 11 e 12 com nova redação`
    );
    expect(questoes.map((q) => q.gabarito)).toEqual(['C', 'D']);
    expect(avisos).toEqual([
      'Linha do gabarito não entendida (nenhum gabarito foi tirado dela): "Recursos de 10 a 15 de março; 11 e 12 com nova redação".',
    ]);
  });

  it('linha com pares e sobra não entendida não aplica nenhum par: as questões ficam sem gabarito e bloqueadas', () => {
    const { questoes, avisos } = ler(`1. P1\n${alts}\n2. P2\n${alts}\nGabarito\n1-B 2-C conforme edital`);
    expect(questoes.map((q) => q.erros)).toEqual([
      ['Sem gabarito.', `${DUVIDOSA}a questão seguinte (2) ficou bloqueada e pode ter cortado esta.`],
      ['Sem gabarito.'],
    ]);
    expect(avisos).toHaveLength(1);
  });

  it('letra minúscula no bloco não vale como resposta', () => {
    const { questoes } = ler(`1. P1\n${alts}\nGabarito\n1-b`);
    expect(questoes[0].erros).toEqual(['Sem gabarito.']);
  });

  it('"Gabarito:" no meio do enunciado, com texto depois, não engole a questão: só a linha-título abre o bloco', () => {
    const { questoes } = ler(`1. Sobre inflamação,\nRespostas agudas aparecem em 2 a 3 dias.\nA) certo\nB) errado\nResposta: A\n2. Outra.\nA) um\nB) dois\nResposta: B`);
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 2, gab: 'A', anulada: false, erros: [] },
      { n: 2, alts: 2, gab: 'B', anulada: false, erros: [] },
    ]);
    expect(questoes[0].enunciado).toBe('Sobre inflamação, Respostas agudas aparecem em 2 a 3 dias.');
  });

  it('linha-título "Gabarito:" no meio da questão, com a resposta na linha de baixo: nada gravável e o motivo na questão', () => {
    const { questoes } = ler(`1. Pergunta um.\nA) um\nB) dois\nGabarito:\nB\n2. Pergunta dois.\nA) um\nB) dois\nGabarito:\nA`);
    expect(questoes.filter((q) => q.erros.length === 0)).toEqual([]);
    expect(questoes[0].erros[0]).toMatch(/foi tratado como gabarito e ignorado/);
  });

  it('nova questão numerada depois do título encerra o bloco', () => {
    const { questoes } = ler(`1. P1\nA) a\nB) b\nResposta: A\nRespostas\n2. P2\nA) a\nB) b\nResposta: B`);
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 2, gab: 'A', anulada: false, erros: [] },
      { n: 2, alts: 2, gab: 'B', anulada: false, erros: [] },
    ]);
  });
});

describe('lerProvaEmTexto — linha que começa com "Letra." dentro de uma alternativa', () => {
  it('"B. pertussis" quebrado no meio da alternativa A não abre a alternativa B: fica no texto, com aviso na questão', () => {
    const { questoes } = ler(`1. Agente da coqueluche?\nA) Bactéria gram-negativa\nB. pertussis, cocobacilo\nB) Vírus\nC) Fungo\nResposta: A`);
    expect(questoes[0].alternativas.map((a) => a.letter)).toEqual(['A', 'B', 'C']);
    expect(questoes[0].alternativas[0].text).toBe('Bactéria gram-negativa B. pertussis, cocobacilo');
    expect(questoes[0].avisos).toHaveLength(1);
    expect(questoes[0].avisos[0]).toMatch(/B\. pertussis/);
    expect(questoes[0].erros).toEqual([]);
  });

  it('lista inteira no estilo "A." com frases terminadas em ponto continua lida; "A -" também', () => {
    const ponto = ler(`1. Um?\nA. Sim.\nB. Não.\nC. Talvez.\nResposta: B`);
    expect(ponto.questoes[0].alternativas).toHaveLength(3);
    const hifen = ler(`1. Um?\nA - Sim\nB - Não\nResposta: B`);
    expect(hifen.questoes[0].alternativas).toHaveLength(2);
  });
});

describe('validarLoteDaProva — banca e ano obrigatórios', () => {
  it('banca e ano válidos', () => {
    expect(validarLoteDaProva('  ENARE ', '2025', 2026)).toEqual({ ok: true, institution: 'ENARE', year: 2025 });
  });

  it('sem banca, sem ano ou ano fora do intervalo: o motivo vem escrito', () => {
    expect(validarLoteDaProva('', '', 2026)).toEqual({
      ok: false,
      motivos: ['Informe a banca / instituição da prova.', 'Informe o ano da prova com 4 dígitos (de 1950 a 2026).'],
    });
    expect(validarLoteDaProva('USP', '1949', 2026).ok).toBe(false);
    expect(validarLoteDaProva('USP', '2027', 2026).ok).toBe(false);
    expect(validarLoteDaProva('USP', '20x5', 2026).ok).toBe(false);
  });

  it('banca que começa com "NexusMed" é recusada (autoral não é residência)', () => {
    const r = validarLoteDaProva('NexusMed (questão autoral)', '2025', 2026);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivos[0]).toMatch(/NexusMed/);
    expect(validarLoteDaProva('nexusmed', '2025', 2026).ok).toBe(false);
  });
});

describe('previewsDaProva — mesma forma do import por arquivo', () => {
  const { questoes } = ler(provaC);
  const rows = previewsDaProva(questoes, 'UNIFESP', 2023);

  it('leva banca e ano do lote, a alternativa correta marcada e o número da prova', () => {
    expect(rows.map((r) => r.index)).toEqual([1, 2, 3, 4]);
    expect(rows.every((r) => r.institution === 'UNIFESP' && r.year === 2023)).toBe(true);
    expect(rows[0].options.map((o) => o.isCorrect)).toEqual([false, false, true, false]);
    expect(rows[0].questionStem).toMatch(/hipertensão arterial/);
  });

  it('a anulada vem marcada e com erro que bloqueia; as outras não têm erro', () => {
    expect(rows[2].anulada).toBe(true);
    expect(rows[2].blockingErrors).toHaveLength(1);
    expect(rows[0].blockingErrors).toEqual([]);
  });

  it('o comentário da prova vira o comentário geral', () => {
    const comentario = previewsDaProva(ler(provaB).questoes, 'ENARE', 2024);
    expect(comentario[0].generalCommentary).toMatch(/Kawasaki/);
  });
});

describe('texto colado no formato .md', () => {
  const md = `## Questão 1\n\n**Disciplina:** Pneumologia\n**Comando da Questão (Pergunta):** Qual?\n**A)** X\n**B)** Y [GABARITO]\n`;

  it('detecta o formato .md e a prova em texto livre', () => {
    expect(textoEhMarkdownDeQuestoes(md)).toBe(true);
    expect(textoEhMarkdownDeQuestoes(provaA)).toBe(false);
  });

  it('banca e ano do lote entram só onde a questão não traz os seus', () => {
    const lido = parseQuestionsMarkdownText(md, [], []);
    if (lido.ok === false) throw new Error('md não lido');
    expect(lido.rows[0].institution).toBe('');
    const [row] = completarBancaEAno(lido.rows, 'ENARE', 2025);
    expect(row.institution).toBe('ENARE');
    expect(row.year).toBe(2025);
    expect(row.missingFields).not.toContain('Instituição / Banca vazia.');
    expect(row.missingFields).not.toContain('Ano vazio.');

    const comBanca = md.replace('**Comando', '**Instituição / Banca:** USP\n**Ano:** 2020\n**Comando');
    const lido2 = parseQuestionsMarkdownText(comBanca, [], []);
    if (lido2.ok === false) throw new Error('md não lido');
    const [row2] = completarBancaEAno(lido2.rows, 'ENARE', 2025);
    expect(row2.institution).toBe('USP');
    expect(row2.year).toBe(2020);
  });
});

describe('chaveDeRepeticao', () => {
  it('enunciado em minúsculas e sem espaços repetidos, mais banca e ano', () => {
    const a = chaveDeRepeticao({ clinicalVignette: '', questionStem: 'Qual   o  DIAGNÓSTICO?\n', institution: 'ENARE', year: 2025 });
    const b = chaveDeRepeticao({ clinicalVignette: 'Qual o', questionStem: 'diagnóstico?', institution: ' enare ', year: 2025 });
    expect(a).toBe(b);
    expect(chaveDeRepeticao({ questionStem: 'Qual o diagnóstico?', institution: 'ENARE', year: 2024 })).not.toBe(a);
    expect(chaveDeRepeticao({ questionStem: 'Qual o diagnóstico?', institution: 'USP', year: 2025 })).not.toBe(a);
  });
});

describe('docs/editorial/PADRAO-NEXUSMED-QUESTOES.md — "Colar o texto da prova"', () => {
  const doc = readFileSync(path.resolve(process.cwd(), 'docs/editorial/PADRAO-NEXUSMED-QUESTOES.md'), 'utf8').replace(/\r\n/g, '\n');
  const secao = doc.slice(doc.indexOf('### Colar o texto da prova'));
  const exemplo = secao.match(/```text\n([\s\S]*?)\n```/)?.[1] ?? '';

  it('a seção existe e traz um exemplo', () => {
    expect(secao.length).toBeGreaterThan(0);
    expect(exemplo.length).toBeGreaterThan(0);
  });

  it('o exemplo da seção dá o resultado que a seção descreve: 3 questões, 4/5/4 alternativas, gabaritos B, A e anulada', () => {
    const { questoes, avisos } = ler(exemplo);
    expect(resumo(questoes)).toEqual([
      { n: 1, alts: 4, gab: 'B', anulada: false, erros: [] },
      { n: 2, alts: 5, gab: 'A', anulada: false, erros: [] },
      { n: 3, alts: 4, gab: null, anulada: true, erros: ['Anulada no gabarito — não é importada.'] },
    ]);
    expect(avisos).toEqual([]);
    expect(secao).toMatch(/3 questões/);
  });
});

// ============================================================================
// IMPORT-2b — conferência final (`conferirLeitura`): depois da leitura, invariantes simples sobre o
// resultado; o que não passa fica bloqueado com "Leitura duvidosa — confira o texto: <motivo>".
// Bloquear demais é aceitável; gravar errado em silêncio, não.
// ============================================================================

/** Questão "Pronta" (sem erro) com o conteúdo exato, ou "BLOQ" (qualquer erro). */
type Esperado = 'BLOQ' | { enunciado: string; alts: string[]; gab: string };
const estado = (q: QuestaoDaProva): Esperado =>
  q.erros.length > 0
    ? 'BLOQ'
    : { enunciado: q.enunciado, alts: q.alternativas.map((a) => `${a.letter}=${a.text}`), gab: q.gabarito ?? '' };
const estados = (texto: string) => ler(texto).questoes.map((q) => [q.numero, estado(q)]);
const duvidas = (q: QuestaoDaProva) => q.erros.filter((e) => e.startsWith(DUVIDOSA));

const leituraLimpa = (marcadores: string[]): LeituraDaQuestao => ({
  marcadores,
  juntadasComNumero: [],
  gabaritosDaQuestao: [],
  gabaritoDoBloco: null,
  abertaPorNumero: true,
});

describe('conferirLeitura — uma regra por teste', () => {
  const questao = (letras: string[]): QuestaoDaProva => ({
    numero: 1,
    enunciado: 'Pergunta?',
    alternativas: letras.map((letter) => ({ letter, text: `texto ${letter}` })),
    gabarito: 'A',
    anulada: false,
    comentario: '',
    erros: [],
    avisos: [],
  });

  it('questão limpa passa sem erro novo', () => {
    const [q] = conferirLeitura([{ questao: questao(['A', 'B']), leitura: leituraLimpa(['A)', 'B)']) }]);
    expect(q.erros).toEqual([]);
  });

  it('(a) letras que não seguem de A em diante bloqueiam', () => {
    const [q] = conferirLeitura([{ questao: questao(['A', 'C']), leitura: leituraLimpa(['A)', 'C)']) }]);
    expect(q.erros).toEqual([`${DUVIDOSA}as letras das alternativas não seguem de A em diante (A, C).`]);
  });

  it('(a) estilos de marcador misturados na mesma questão ("a)" e "(C)") bloqueiam', () => {
    const { questoes } = ler(`1. Pergunta.\na) um\nb) dois\n(C) três\nResposta: A`);
    expect(questoes[0].alternativas).toHaveLength(3);
    expect(questoes[0].erros).toEqual([`${DUVIDOSA}marcadores de alternativa misturados ("a)" e "(C)").`]);
  });

  it('(b) resíduo de marcador forte "(C)" no meio de uma alternativa bloqueia', () => {
    const { questoes } = ler(`1. Pergunta.\nA) um\nB) dois (C) três\nResposta: A`);
    expect(questoes[0].erros).toEqual([`${DUVIDOSA}sobrou "(C)" no meio da alternativa B.`]);
  });

  it('(b) resíduo "a)" no enunciado bloqueia', () => {
    const { questoes } = ler(`1. Considere: a) febre b) tosse\nA) só a\nB) só b\nResposta: A`);
    expect(questoes[0].erros).toEqual([`${DUVIDOSA}sobrou "a)" no meio do enunciado.`]);
  });

  it('(b) "QUESTÃO32" (sem espaço) no meio de uma alternativa bloqueia', () => {
    const { questoes } = ler(`QUESTÃO 31\nPaciente.\n(A) IAM\n(B) TEP\nQUESTÃO32\nCriança.\nResposta: A`);
    expect(questoes[0].erros).toEqual([`${DUVIDOSA}sobrou "QUESTÃO32" no meio da alternativa B.`]);
  });

  it('(b) "Resposta:" no meio do texto bloqueia; "assinale a alternativa correta:" no enunciado não', () => {
    const { questoes } = ler(
      `Questão 1\nPergunta.\nA) um\nB) dois Resposta: B\nQuestão 2\nAssinale a alternativa correta:\nA) um\nB) dois\nResposta: A`
    );
    expect(duvidas(questoes[0])).toEqual([`${DUVIDOSA}sobrou "Resposta:" no meio da alternativa B.`]);
    expect(questoes[1].erros).toEqual([]);
  });

  it('(c) linha começada por número juntada a uma alternativa bloqueia', () => {
    const { questoes } = ler(`Questão 1\nDose?\nA) 50 mg/kg/dia dividida em\n2 - 3 tomadas\nB) 100 mg/kg/dia\nResposta: A`);
    expect(questoes[0].alternativas[0].text).toBe('50 mg/kg/dia dividida em 2 - 3 tomadas');
    expect(questoes[0].erros).toEqual([`${DUVIDOSA}a linha "2 - 3 tomadas" começa com número e foi juntada à alternativa A.`]);
  });

  it('(c) linha começada por número juntada ao comentário bloqueia ("3) " também)', () => {
    const { questoes } = ler(`Questão 1\nP.\nA) x\nB) y\nResposta: A\nComentário: critérios\n3) febre`);
    expect(questoes[0].erros).toEqual([`${DUVIDOSA}a linha "3) febre" começa com número e foi juntada ao comentário.`]);
  });

  it('(d) duas linhas de resposta diferentes na mesma questão bloqueiam', () => {
    const { questoes } = ler(`Questão 1\nPergunta.\nA) um\nB) dois\nResposta: B\nResposta: A`);
    expect(questoes[0].erros).toEqual([`${DUVIDOSA}gabaritos diferentes (B e A).`]);
  });

  it('(d) resposta da questão diferente da do bloco do fim bloqueia (antes valia a da questão, com aviso)', () => {
    const { questoes, avisos } = ler(`Questão 1\nPergunta.\nA) um\nB) dois\nResposta: A\n\nGabarito\n1-B`);
    expect(questoes[0].erros).toEqual([`${DUVIDOSA}gabaritos diferentes (A e B).`]);
    expect(avisos).toEqual([]);
  });

  it('(d) a mesma resposta na questão e no bloco não bloqueia', () => {
    const { questoes } = ler(`Questão 1\nPergunta.\nA) um\nB) dois\nResposta: B\n\nGabarito\n1-B`);
    expect(questoes[0].erros).toEqual([]);
  });

  it('(e) a seguinte, aberta por número, ficou bloqueada: bloqueia também esta', () => {
    const { questoes } = ler(`1. Um?\nA) x\nB) y\nResposta: A\n2. Dois?\nA) x\nResposta: A`);
    expect(questoes[0].erros).toEqual([`${DUVIDOSA}a questão seguinte (2) ficou bloqueada e pode ter cortado esta.`]);
  });

  it('(e) não vale quando a seguinte foi aberta por "Questão N", nem quando ela só está anulada', () => {
    const porPalavra = ler(`Questão 1\nUm?\nA) x\nB) y\nResposta: A\nQuestão 2\nDois?\nA) x\nResposta: A`);
    expect(porPalavra.questoes[0].erros).toEqual([]);
    const anulada = ler(`1. Um?\nA) x\nB) y\n2. Dois?\nA) x\nB) y\n\nGabarito\n1-A\n2-ANULADA`);
    expect(anulada.questoes[0].erros).toEqual([]);
  });

  it('(e) não se propaga em cadeia: só a imediatamente anterior à bloqueada', () => {
    const { questoes } = ler(`1. Um?\nA) x\nB) y\nResposta: A\n2. Dois?\nA) x\nB) y\nResposta: A\n3. Três?\nA) x\nResposta: A`);
    expect(questoes.map((q) => q.erros.length)).toEqual([0, 1, 1]);
  });
});

describe('IMPORT-2b — todos os casos dos probes do revisor: Pronta e exata, ou bloqueada', () => {
  const alts5 = 'A) a\nB) b\nC) c\nD) d\nE) e';
  const cincoAlts = ['A=a', 'B=b', 'C=c', 'D=d', 'E=e'];

  it('probe 1 — lista "1. 2. 3." no enunciado da questão 1', () => {
    expect(
      estados(
        `1. Sobre os fatores de risco, considere:\n1. Tabagismo\n2. Obesidade\n3. Sedentarismo\nQuais estão corretos?\nA) Apenas 1\nB) Apenas 2\nC) Apenas 1 e 2\nD) Todos\n2. Segunda questão real.\nA) a\nB) b\n3. Terceira questão real.\nA) x\nB) y\n\nGabarito\n1-D 2-A 3-B`
      )
    ).toEqual([
      [
        1,
        {
          enunciado: 'Sobre os fatores de risco, considere: 1. Tabagismo 2. Obesidade 3. Sedentarismo Quais estão corretos?',
          alts: ['A=Apenas 1', 'B=Apenas 2', 'C=Apenas 1 e 2', 'D=Todos'],
          gab: 'D',
        },
      ],
      [2, { enunciado: 'Segunda questão real.', alts: ['A=a', 'B=b'], gab: 'A' }],
      [3, { enunciado: 'Terceira questão real.', alts: ['A=x', 'B=y'], gab: 'B' }],
    ]);
  });

  it('probe 2 — lista numerada no comentário', () => {
    expect(
      estados(
        `Questão 5\nPaciente com febre.\nA) Dengue\nB) Zika\nResposta: A\nComentário: Os critérios são:\n1. febre\n2. mialgia\nQuestão 6\nOutra.\nA) um\nB) dois\nResposta: B`
      )
    ).toEqual([
      [5, 'BLOQ'],
      [6, { enunciado: 'Outra.', alts: ['A=um', 'B=dois'], gab: 'B' }],
    ]);
  });

  it('probe 3 — "2 - 3 tomadas" quebrado numa alternativa', () => {
    expect(
      estados(`1. Dose de amoxicilina?\nA) 50 mg/kg/dia dividida em\n2 - 3 tomadas\nB) 100 mg/kg/dia\n2. Outra pergunta.\nA) sim\nB) não\n\nGabarito\n1-A 2-B`)
    ).toEqual([
      [1, 'BLOQ'],
      [2, { enunciado: 'Outra pergunta.', alts: ['A=sim', 'B=não'], gab: 'B' }],
    ]);
  });

  it('probe 4 — "B. pertussis" quebrado na alternativa A', () => {
    expect(estados(`1. Agente da coqueluche?\nA) Bactéria gram-negativa\nB. pertussis, cocobacilo\nB) Vírus\nC) Fungo\nResposta: A`)).toEqual([
      [1, { enunciado: 'Agente da coqueluche?', alts: ['A=Bactéria gram-negativa B. pertussis, cocobacilo', 'B=Vírus', 'C=Fungo'], gab: 'A' }],
    ]);
  });

  it('probe 5 — "Respostas" no enunciado', () => {
    expect(
      estados(`1. Sobre inflamação,\nRespostas agudas aparecem em 2 a 3 dias.\nA) certo\nB) errado\nResposta: A\n2. Outra.\nA) um\nB) dois\nResposta: B`)
    ).toEqual([
      [1, { enunciado: 'Sobre inflamação, Respostas agudas aparecem em 2 a 3 dias.', alts: ['A=certo', 'B=errado'], gab: 'A' }],
      [2, { enunciado: 'Outra.', alts: ['A=um', 'B=dois'], gab: 'B' }],
    ]);
  });

  it('probe 6 — "Gabarito:" com a resposta na linha de baixo', () => {
    expect(estados(`1. Pergunta um.\nA) um\nB) dois\nGabarito:\nB\n2. Pergunta dois.\nA) um\nB) dois\nGabarito:\nA`)).toEqual([
      [1, 'BLOQ'],
      [2, 'BLOQ'],
    ]);
  });

  it('probe 7 — bloco "Questões 1 e 2 anuladas"', () => {
    expect(estados(`1. P1\nA) a\nB) b\n2. P2\nA) a\nB) b\nGABARITO\nQuestões 1 e 2 anuladas`)).toEqual([
      [1, 'BLOQ'],
      [2, 'BLOQ'],
    ]);
  });

  it('probe 8 — "10 - 15 anos" quebrado no enunciado da questão 9', () => {
    expect(
      estados(`9. Faixa etária de maior incidência:\nentre\n10 - 15 anos de idade, qual o diagnóstico?\nA) a\nB) b\n10. Outra.\nA) c\nB) d\n\nGabarito\n9-A 10-B`)
    ).toEqual([
      [9, { enunciado: 'Faixa etária de maior incidência: entre 10 - 15 anos de idade, qual o diagnóstico?', alts: ['A=a', 'B=b'], gab: 'A' }],
      [10, { enunciado: 'Outra.', alts: ['A=c', 'B=d'], gab: 'B' }],
    ]);
  });

  it('probe2 1 — "Questões 1 e 2 anuladas após recursos" com 5 alternativas', () => {
    expect(estados(`1. P1\n${alts5}\n2. P2\n${alts5}\n3. P3\n${alts5}\nGABARITO\n3-C\nQuestões 1 e 2 anuladas após recursos`)).toEqual([
      [1, 'BLOQ'],
      [2, 'BLOQ'],
      [3, { enunciado: 'P3', alts: cincoAlts, gab: 'C' }],
    ]);
  });

  it('probe2 2 — observação com datas no bloco', () => {
    expect(
      estados(`10. P10\n${alts5}\n11. P11\n${alts5}\nGABARITO DEFINITIVO\n10-C 11-D\nRecursos de 10 a 15 de março; 11 e 12 com nova redação`)
    ).toEqual([
      [10, { enunciado: 'P10', alts: cincoAlts, gab: 'C' }],
      [11, { enunciado: 'P11', alts: cincoAlts, gab: 'D' }],
    ]);
  });

  it('probe2 3 — lista "1) 2)" no enunciado, alternativas "a)"', () => {
    expect(
      estados(
        `1) Considere as afirmativas:\n1) A febre é comum.\n2) A tosse é rara.\nEstá correto:\na) só 1\nb) só 2\nc) ambas\nd) nenhuma\n2) Outra questão.\na) x\nb) y\nc) z\nd) w\n\nGabarito\n1) C\n2) A`
      )
    ).toEqual([
      [
        1,
        {
          enunciado: 'Considere as afirmativas: 1) A febre é comum. 2) A tosse é rara. Está correto:',
          alts: ['A=só 1', 'B=só 2', 'C=ambas', 'D=nenhuma'],
          gab: 'C',
        },
      ],
      [2, { enunciado: 'Outra questão.', alts: ['A=x', 'B=y', 'C=z', 'D=w'], gab: 'A' }],
    ]);
  });

  it('probe3 P1 — "11 - 15 anos" quebrado na alternativa C da questão 10 (antes: Q10 Pronta sem D e E)', () => {
    expect(
      estados(
        `9. Pergunta nove.\nA) um\nB) dois\n10. Faixa etária mais comum?\nA) 0 a 5 anos\nB) 5 a 10 anos\nC) entre 10 e\n11 - 15 anos\nD) 16 a 20 anos\nE) acima de 20\n\nGABARITO\n9-A\n10-B`
      )
    ).toEqual([
      [9, { enunciado: 'Pergunta nove.', alts: ['A=um', 'B=dois'], gab: 'A' }],
      [10, 'BLOQ'],
      [11, 'BLOQ'],
    ]);
  });

  it('probe3 P2 — afirmativas "a) b) c)" no enunciado e alternativas "(A)" (antes: Pronta com as afirmativas como alternativas)', () => {
    expect(
      estados(
        `1. Analise as afirmativas:\na) A febre é comum.\nb) A tosse é rara.\nc) A dispneia é tardia.\nQuais estão corretas?\n(A) a e b\n(B) b e c\n(C) todas\n(D) nenhuma\n\nGABARITO\n1-B`
      )
    ).toEqual([[1, 'BLOQ']]);
  });

  it('probe3 P3 — número sozinho na linha ("31") não é lido, e a mensagem diz como numerar', () => {
    const r = lerProvaEmTexto(
      `31\nPaciente com dor torácica.\nA) IAM\nB) TEP\nC) Pneumotórax\n32\nCriança com febre.\nA) Otite\nB) Faringite\nC) Pneumonia\n\nGABARITO\n31-A\n32-B`
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors.join(' ')).toContain(`Numere as questões como '31.' ou 'Questão 31'`);
  });

  it('probe3 P4 — "QUESTÃO32" sem espaço (antes: Q31 Pronta engolindo a 32)', () => {
    const { questoes, avisos } = ler(
      `QUESTÃO 31\nPaciente com dor.\n(A) IAM\n(B) TEP\nQUESTÃO32\nCriança com febre.\n(A) Otite\n(B) Faringite\nGABARITO\n31 - A   32 - B`
    );
    expect(questoes.map((q) => [q.numero, estado(q)])).toEqual([[31, 'BLOQ']]);
    expect(avisos).toEqual(['O gabarito cita a questão 32, que não está na prova (ou já tem gabarito).']);
  });

  it('probe3 P5 — "Resposta:" repetido no comentário (antes: Pronta com o gabarito trocado para C)', () => {
    expect(
      estados(
        `Questão 1\nPergunta.\nA) um\nB) dois\nC) três\nResposta: B\nComentário: A banca considerou inicialmente\nResposta: C, mas alterou após recurso.`
      )
    ).toEqual([[1, 'BLOQ']]);
  });

  it('probe3 P6 — lista inteira "A." com frases terminadas e "B. pertussis" como alternativa B', () => {
    expect(
      estados(
        `1. Agente da coqueluche?\nA. Haemophilus influenzae.\nB. pertussis, cocobacilo gram-negativo.\nC. Vírus sincicial respiratório.\nD. Adenovírus.\nE. Mycoplasma.\n\nGABARITO\n1-B`
      )
    ).toEqual([
      [
        1,
        {
          enunciado: 'Agente da coqueluche?',
          alts: [
            'A=Haemophilus influenzae.',
            'B=pertussis, cocobacilo gram-negativo.',
            'C=Vírus sincicial respiratório.',
            'D=Adenovírus.',
            'E=Mycoplasma.',
          ],
          gab: 'B',
        },
      ],
    ]);
  });

  it('probe4 P7 — questão 6 ausente e vinheta da 7 com 13 linhas (antes: Q5 Pronta engolindo a 7)', () => {
    const longa = Array.from({ length: 13 }, (_, i) => `linha ${i + 1} da vinheta clínica longa do PDF`).join('\n');
    expect(
      estados(`5. Pergunta cinco.\nA) um\nB) dois\nC) três\n7. Mulher de 45 anos\n${longa}\nQual a conduta?\nA) Observar\nB) Internar\nC) Operar\n\nGABARITO\n5-A\n7-C`)
    ).toEqual([[5, 'BLOQ']]);
  });
});

describe('IMPORT-2b — "Gabarito: 1-B 2-C" na mesma linha', () => {
  const alts = 'A) a\nB) b\nC) c';

  it('título e pares na mesma linha, sem sobra: os pares valem', () => {
    const { questoes, avisos } = ler(`1. P1\n${alts}\n2. P2\n${alts}\n\nGabarito: 1-B 2-C`);
    expect(questoes.map((q) => [q.gabarito, q.erros])).toEqual([
      ['B', []],
      ['C', []],
    ]);
    expect(avisos).toEqual([]);
    expect(ler(`1. P1\n${alts}\n2. P2\n${alts}\nGABARITO OFICIAL: 1-A, 2-B`).questoes.map((q) => q.gabarito)).toEqual(['A', 'B']);
  });

  it('título e pares com sobra: nenhum par vale, e o aviso do lote aponta a linha como causa do "Sem gabarito"', () => {
    const { questoes, avisos } = ler(`1. P1\n${alts}\n2. P2\n${alts}\n\nGabarito: 1-B 2-C conforme edital`);
    expect(questoes.every((q) => q.erros.includes('Sem gabarito.'))).toBe(true);
    expect(questoes.every((q) => q.alternativas.every((a) => !a.text.includes('Gabarito')))).toBe(true);
    expect(avisos).toEqual([
      'A linha "Gabarito: 1-B 2-C conforme edital" tem algo além do título e dos pares e não foi lida: as questões "Sem gabarito" podem depender dela.',
    ]);
  });
});

describe('IMPORT-2b — trecho realista ("QUESTÃO 31", "(A)", gabarito "31 - A   32 - B")', () => {
  const prova = `QUESTÃO 31
Homem de 62 anos, tabagista (40 maços-ano), procura o pronto-socorro com dispneia
progressiva há 3 dias e aumento do volume do escarro. SatO2 86% em ar ambiente.
Qual a conduta inicial mais adequada?
(A) Oxigênio por máscara de Venturi com alvo de SatO2 entre 88 e 92%.
(B) Oxigênio por máscara não reinalante com alvo de 100%.
(C) Intubação orotraqueal imediata.
(D) Ventilação não invasiva sem oxigênio suplementar.
QUESTÃO 32
Sobre a asma, assinale a alternativa correta:
(A) O SABA isolado é a terapia preferida no GINA atual.
(B) Formoterol-budesonida pode ser usado como resgate.
(C) Corticoide inalatório é contraindicado em gestantes.
(D) Espirometria normal exclui o diagnóstico.

GABARITO
31 - A   32 - B
`;

  it('sai com 2 questões Prontas: 31-A e 32-B, com o texto exato', () => {
    const { questoes, avisos } = ler(prova);
    expect(questoes.map((q) => [q.numero, estado(q)])).toEqual([
      [
        31,
        {
          enunciado:
            'Homem de 62 anos, tabagista (40 maços-ano), procura o pronto-socorro com dispneia progressiva há 3 dias e aumento do volume do escarro. SatO2 86% em ar ambiente. Qual a conduta inicial mais adequada?',
          alts: [
            'A=Oxigênio por máscara de Venturi com alvo de SatO2 entre 88 e 92%.',
            'B=Oxigênio por máscara não reinalante com alvo de 100%.',
            'C=Intubação orotraqueal imediata.',
            'D=Ventilação não invasiva sem oxigênio suplementar.',
          ],
          gab: 'A',
        },
      ],
      [
        32,
        {
          enunciado: 'Sobre a asma, assinale a alternativa correta:',
          alts: [
            'A=O SABA isolado é a terapia preferida no GINA atual.',
            'B=Formoterol-budesonida pode ser usado como resgate.',
            'C=Corticoide inalatório é contraindicado em gestantes.',
            'D=Espirometria normal exclui o diagnóstico.',
          ],
          gab: 'B',
        },
      ],
    ]);
    expect(avisos).toEqual([]);
  });
});
