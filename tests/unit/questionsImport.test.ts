import { describe, it, expect } from 'vitest';
import { parseQuestionsMarkdownText, buildQuestionFromImportRow } from '../../src/utils/questionsImport';
import type { Discipline, Theme } from '../../src/types';

// Missão pós-42-C — Entrada assistida de QUESTÕES (equivalente ao import de
// conteúdo, antes inexistente — ver docs/editorial/PADRAO-NEXUSMED-QUESTOES.md).
//
// Prova a lógica pura de parse/validação/resolução do formato Markdown de
// lote de questões, sem DOM nem Supabase — o componente (ImportQuestionsModal)
// só orquestra I/O em cima disto.

const discipline: Discipline = {
  id: 'disc-pneumo',
  name: 'Pneumologia',
  code: 'PNEUMO',
  icon: 'lungs',
  description: '',
  cycle: 'clinico',
  color: '#000',
};

const theme: Theme = {
  id: 'tema-espirometria',
  disciplineId: 'disc-pneumo',
  name: 'Espirometria',
  description: '',
  highYield: false,
  order: 1,
};

const validBatch = `
## Questão 1

**Disciplina:** Pneumologia
**Tema:** Espirometria
**Instituição / Banca:** ENARE
**Ano:** 2025

**Enunciado Clínico (Caso / Vinheta):**
Paciente com DPOC grave em acompanhamento ambulatorial.

**Comando da Questão (Pergunta):**
Qual o padrão espirométrico esperado?

**A)** Padrão restritivo
**Explicação A:** Incorreto, CPT não está reduzida.
**B)** Padrão obstrutivo [GABARITO]
**Explicação B:** Correto, VEF1/CVF reduzido com CPT aumentada.
**C)** Padrão misto
**Explicação C:** Incorreto, não há componente restritivo.
**D)** Espirometria normal
**Explicação D:** Incorreto, há limitação ao fluxo aéreo.

**Comentário Geral:** A CPT é o parâmetro definitivo para distinguir padrão obstrutivo de restritivo.
**Pérola High-Yield:** CPT aumentada confirma padrão obstrutivo puro.

### Tags
\`espirometria\` \`dpoc\`

## Questão 2

**Disciplina:** Pneumologia
**Instituição / Banca:** USP-SP
**Ano:** 2024

**Comando da Questão (Pergunta):**
Segunda pergunta de teste.

**A)** Alternativa A
**B)** Alternativa B [GABARITO]
`;

describe('parseQuestionsMarkdownText', () => {
  it('interpreta um lote válido, resolvendo disciplina/tema pelo nome', () => {
    const result = parseQuestionsMarkdownText(validBatch, [discipline], [theme]);
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('esperado sucesso');
    expect(result.rows).toHaveLength(2);

    const q1 = result.rows[0];
    expect(q1.disciplineId).toBe('disc-pneumo');
    expect(q1.themeId).toBe('tema-espirometria');
    expect(q1.institution).toBe('ENARE');
    expect(q1.year).toBe(2025);
    expect(q1.questionStem).toBe('Qual o padrão espirométrico esperado?');
    expect(q1.options).toHaveLength(4);
    expect(q1.options.find((o) => o.letter === 'B')?.isCorrect).toBe(true);
    expect(q1.options.filter((o) => o.isCorrect)).toHaveLength(1);
    // Regressão: "Explicação" com cedilha/til (a forma correta em
    // português, e a que o próprio guia usa como exemplo) precisa ser
    // capturada — um regex que só aceitasse a grafia sem acento deixaria
    // toda explicação vazia silenciosamente.
    expect(q1.options.find((o) => o.letter === 'A')?.explanation).toBe('Incorreto, CPT não está reduzida.');
    expect(q1.options.find((o) => o.letter === 'B')?.explanation).toBe(
      'Correto, VEF1/CVF reduzido com CPT aumentada.'
    );
    expect(q1.missingFields.some((m) => /Explicação vazia/.test(m))).toBe(false);
    expect(q1.tags).toEqual(['espirometria', 'dpoc']);
    expect(q1.blockingErrors).toEqual([]);
    // Comentário Geral e Pérola foram preenchidos no arquivo — sem aviso de "usando padrão".
    expect(q1.missingFields.some((m) => m.includes('Comentário Geral'))).toBe(false);
  });

  it('segunda questão do lote: sem Tema informado, exige seleção manual (sem palpite automático)', () => {
    const result = parseQuestionsMarkdownText(validBatch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso');
    const q2 = result.rows[1];
    expect(q2.disciplineId).toBe('disc-pneumo');
    expect(q2.themeId).toBeNull();
    expect(q2.missingFields.some((m) => /tema/i.test(m))).toBe(true);
    expect(q2.blockingErrors).toEqual([]);
    // Sem Comentário Geral/Pérola no arquivo -> avisado, mas com fallback aplicado.
    expect(q2.generalCommentary).not.toBe('');
    expect(q2.highYieldSummary).not.toBe('');
  });

  it('rejeita arquivo sem nenhum bloco "## Questão"', () => {
    const result = parseQuestionsMarkdownText('Só um texto solto, sem heading nenhum.', [discipline], [theme]);
    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error('esperado falha');
    expect(result.errors[0]).toMatch(/## Questão/);
  });

  it('marca disciplina não encontrada como bloqueante e ausente ao mesmo tempo', () => {
    const batch = `
## Questão 1

**Disciplina:** Disciplina Inexistente
**Comando da Questão (Pergunta):** Pergunta qualquer
**A)** X
**B)** Y [GABARITO]
`;
    const result = parseQuestionsMarkdownText(batch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso (erro é por linha, não por arquivo)');
    const row = result.rows[0];
    expect(row.disciplineId).toBeNull();
    expect(row.missingFields.some((m) => m.includes('Disciplina Inexistente'))).toBe(true);
    expect(row.blockingErrors).toEqual([]); // disciplina não encontrada não bloqueia — só exige seleção manual
  });

  it('reconhece "Explicação" tanto acentuado quanto sem acento', () => {
    const batch = `
## Questão 1

**Disciplina:** Pneumologia
**Comando da Questão (Pergunta):** Pergunta
**A)** X
**Explicação A:** Texto com acento correto.
**B)** Y [GABARITO]
**Explicacao B:** Texto sem acento (tolerado).
`;
    const result = parseQuestionsMarkdownText(batch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso');
    const row = result.rows[0];
    expect(row.options.find((o) => o.letter === 'A')?.explanation).toBe('Texto com acento correto.');
    expect(row.options.find((o) => o.letter === 'B')?.explanation).toBe('Texto sem acento (tolerado).');
  });

  it('bloqueia questão sem Comando da Questão, sem Disciplina e sem alternativas suficientes', () => {
    const batch = `
## Questão 1

**A)** Única alternativa
`;
    const result = parseQuestionsMarkdownText(batch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso');
    const row = result.rows[0];
    expect(row.blockingErrors.some((e) => /Disciplina/.test(e))).toBe(true);
    expect(row.blockingErrors.some((e) => /Comando da Questão/.test(e))).toBe(true);
    expect(row.blockingErrors.some((e) => /alternativas/.test(e))).toBe(true);
  });

  it('bloqueia quando nenhuma alternativa está marcada [GABARITO]', () => {
    const batch = `
## Questão 1

**Disciplina:** Pneumologia
**Comando da Questão (Pergunta):** Pergunta
**A)** X
**B)** Y
`;
    const result = parseQuestionsMarkdownText(batch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso');
    expect(result.rows[0].blockingErrors.some((e) => /GABARITO/.test(e))).toBe(true);
  });

  it('bloqueia quando mais de uma alternativa está marcada [GABARITO]', () => {
    const batch = `
## Questão 1

**Disciplina:** Pneumologia
**Comando da Questão (Pergunta):** Pergunta
**A)** X [GABARITO]
**B)** Y [GABARITO]
`;
    const result = parseQuestionsMarkdownText(batch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso');
    expect(result.rows[0].blockingErrors.some((e) => /Mais de uma/.test(e))).toBe(true);
  });

  it('aceita a 5ª alternativa (E) opcional, ausente no formulário rápido do Admin', () => {
    const batch = `
## Questão 1

**Disciplina:** Pneumologia
**Comando da Questão (Pergunta):** Pergunta
**A)** X
**B)** Y [GABARITO]
**C)** Z
**D)** W
**E)** V
`;
    const result = parseQuestionsMarkdownText(batch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso');
    expect(result.rows[0].options).toHaveLength(5);
    expect(result.rows[0].options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('ciclo/dificuldade inválidos caem no padrão e são avisados, sem bloquear', () => {
    const batch = `
## Questão 1

**Disciplina:** Pneumologia
**Ciclo:** ciclo-inventado
**Dificuldade:** nivel-inventado
**Comando da Questão (Pergunta):** Pergunta
**A)** X
**B)** Y [GABARITO]
`;
    const result = parseQuestionsMarkdownText(batch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso');
    const row = result.rows[0];
    expect(row.cycle).toBe('internato_residencia');
    expect(row.difficulty).toBe('medio');
    expect(row.blockingErrors).toEqual([]);
    expect(row.missingFields.some((m) => /Ciclo/.test(m))).toBe(true);
    expect(row.missingFields.some((m) => /Dificuldade/.test(m))).toBe(true);
  });
});

describe('buildQuestionFromImportRow', () => {
  it('monta a Question final só quando disciplina/tema já estão resolvidos', () => {
    const result = parseQuestionsMarkdownText(validBatch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso');
    const q1 = result.rows[0];
    const question = buildQuestionFromImportRow(q1, q1.disciplineId, q1.themeId);
    expect(question.disciplineId).toBe('disc-pneumo');
    expect(question.themeId).toBe('tema-espirometria');
    expect(question.compendiumRefId).toBe(''); // sem palpite automático de vínculo — corrige-se depois pelo botão "Vínculo"
    expect(question.options.filter((o) => o.isCorrect)).toHaveLength(1);
  });

  it('lança erro se disciplina ou tema não estiverem resolvidos', () => {
    const result = parseQuestionsMarkdownText(validBatch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso');
    const q2 = result.rows[1]; // sem tema resolvido
    expect(() => buildQuestionFromImportRow(q2, q2.disciplineId, q2.themeId)).toThrow();
  });

  it('lança erro se a linha tiver blockingErrors', () => {
    const batch = `
## Questão 1

**Comando da Questão (Pergunta):** Pergunta
**A)** X
`;
    const result = parseQuestionsMarkdownText(batch, [discipline], [theme]);
    if (result.ok === false) throw new Error('esperado sucesso');
    const row = result.rows[0];
    expect(() => buildQuestionFromImportRow(row, 'qualquer', 'qualquer')).toThrow();
  });
});
