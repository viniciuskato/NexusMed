import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FakePostgrestState } from './helpers/fakePostgrest';
import type { Compendium, Discipline, Question, Theme } from '../../src/types';

// ============================================================================
// Unidade 43-B — questão cobre um ou vários materiais.
// - Leitura: os vínculos vêm de `question_materials` (todas as páginas), na
//   ordem escolhida; `compendiumRefId` é o primeiro, para quem só abre "o"
//   material da questão (cartão, caderno de erros, flashcard).
// - Gravação: a coluna antiga não é mais escrita; vínculo pela RPC; a
//   importação leva os materiais do lote.
// - Estudante: o recorte por material e os pacotes do Estudo Temático
//   consideram todos os vínculos.
// ============================================================================

const state = vi.hoisted(() => ({ tables: {}, requests: [] }) as FakePostgrestState);
const writes = vi.hoisted(() => ({ upserts: [] as Array<{ table: string; row: unknown }>, rpcs: [] as Array<{ fn: string; args: unknown }> }));

vi.mock('../../src/lib/supabaseClient', async () => {
  const { makeFakeSupabase } = await import('./helpers/fakePostgrest');
  const read = makeFakeSupabase(state) as unknown as { from: (t: string) => Record<string, unknown> };
  const ok = { data: null, error: null };
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ['eq', 'select', 'order', 'in']) c[m] = () => c;
    c.then = (res: (v: typeof ok) => unknown) => Promise.resolve(ok).then(res);
    return c;
  };
  return {
    isSupabaseConfigured: () => true,
    supabase: {
      from: (table: string) => {
        const r = read.from(table);
        return {
          ...r,
          upsert: (row: unknown) => {
            writes.upserts.push({ table, row });
            return chain();
          },
          insert: (row: unknown) => {
            writes.upserts.push({ table, row });
            return chain();
          },
          delete: () => chain(),
        };
      },
      rpc: (fn: string, args: unknown) => {
        writes.rpcs.push({ fn, args });
        const data = fn === 'import_question_draft' ? { id: 'q-nova', status: 'draft' } : null;
        return Promise.resolve({ data, error: null });
      },
    },
  };
});

import { SupabaseQuestionsRepository } from '../../src/repositories/SupabaseQuestionsRepository';
import { buildThematicStudyData, packIdForCompendium, SCOPE_UNLINKED } from '../../src/services/thematicPacks';
import { questionMatchesMaterialScope } from '../../src/utils/questionMaterials';

const pad = (n: number) => String(n).padStart(5, '0');

beforeEach(() => {
  state.tables = {};
  state.requests = [];
  writes.upserts = [];
  writes.rpcs = [];
});

const baseQuestion: Question = {
  id: 'q-1',
  disciplineId: 'd',
  themeId: 't',
  compendiumRefId: '',
  cycle: 'clinico',
  difficulty: 'medio',
  institution: '',
  year: 2026,
  clinicalVignette: '',
  questionStem: 'Pergunta',
  options: [
    { letter: 'A', text: 'a', isCorrect: true, explanation: '' },
    { letter: 'B', text: 'b', isCorrect: false, explanation: '' },
  ],
  generalCommentary: '',
  highYieldSummary: '',
  tags: [],
};

describe('SupabaseQuestionsRepository — vínculos com materiais', () => {
  it('lê os vínculos de question_materials, de todas as páginas, na ordem escolhida', async () => {
    state.tables.questions = Array.from({ length: 1100 }, (_, i) => ({
      id: `q-${pad(i)}`, discipline_id: 'd', theme_id: 't', material_id: i === 0 ? 'legado' : null,
      material_section_id: null, cycle: 'clinico', difficulty: 'medio', institution: null, year: null,
      clinical_vignette: '', question_stem: 'P', tags: [], status: 'published',
    }));
    state.tables.question_options = [];
    state.tables.question_option_keys = [];
    state.tables.question_answer_keys = [];
    state.tables.question_materials = [
      ...Array.from({ length: 1100 }, (_, i) => ({ question_id: `q-${pad(i)}`, material_id: 'mat-a', material_section_id: null, sort_order: 1 })),
      { question_id: 'q-00000', material_id: 'mat-b', material_section_id: 'sec-b', sort_order: 0 },
    ];

    const questions = await new SupabaseQuestionsRepository().getQuestions();
    const q0 = questions.find((q) => q.id === 'q-00000')!;
    expect(q0.materialLinks).toEqual([
      { materialId: 'mat-b', sectionId: 'sec-b' },
      { materialId: 'mat-a' },
    ]);
    // O primeiro vínculo é "o" material da questão; a coluna antiga não é lida.
    expect(q0.compendiumRefId).toBe('mat-b');
    expect(q0.compendiumSectionId).toBe('sec-b');
    expect(questions.find((q) => q.id === 'q-01099')!.materialLinks).toEqual([{ materialId: 'mat-a' }]);
  });

  it('saveQuestion não grava mais a coluna antiga do vínculo', async () => {
    await new SupabaseQuestionsRepository().saveQuestion({ ...baseQuestion, compendiumRefId: 'mat-a', materialLinks: [{ materialId: 'mat-a' }] });
    const row = writes.upserts.find((u) => u.table === 'questions')!.row as Record<string, unknown>;
    expect(row).not.toHaveProperty('material_id');
    expect(row).not.toHaveProperty('material_section_id');
  });

  it('importQuestionDraft leva os materiais do lote', async () => {
    await new SupabaseQuestionsRepository().importQuestionDraft({
      ...baseQuestion,
      materialLinks: [{ materialId: 'mat-a' }, { materialId: 'mat-b', sectionId: 'sec-b' }],
    });
    const call = writes.rpcs.find((r) => r.fn === 'import_question_draft')!;
    expect((call.args as Record<string, unknown>).p_material_links).toEqual([
      { material_id: 'mat-a', material_section_id: null },
      { material_id: 'mat-b', material_section_id: 'sec-b' },
    ]);
  });

  it('setQuestionMaterialLinks troca os vínculos pela RPC', async () => {
    await new SupabaseQuestionsRepository().setQuestionMaterialLinks('q-1', [{ materialId: 'mat-a', sectionId: 'sec-a' }]);
    expect(writes.rpcs).toContainEqual({
      fn: 'set_question_materials',
      args: { p_question_id: 'q-1', p_links: [{ material_id: 'mat-a', material_section_id: 'sec-a' }] },
    });
  });
});

describe('recorte por material (questões a partir de um material)', () => {
  const coversTwo: Question = { ...baseQuestion, materialLinks: [{ materialId: 'mat-a' }, { materialId: 'mat-b' }] };
  const unlinked: Question = { ...baseQuestion, id: 'q-2', materialLinks: [] };
  const legacyOnly: Question = { ...baseQuestion, id: 'q-3', compendiumRefId: 'mat-a' };

  it('questão que cobra dois materiais aparece a partir de qualquer um deles', () => {
    expect(questionMatchesMaterialScope(coversTwo, 'mat-a')).toBe(true);
    expect(questionMatchesMaterialScope(coversTwo, 'mat-b')).toBe(true);
    expect(questionMatchesMaterialScope(coversTwo, 'mat-c')).toBe(false);
  });

  it('"sem material" é a questão sem nenhum vínculo', () => {
    expect(questionMatchesMaterialScope(unlinked, SCOPE_UNLINKED)).toBe(true);
    expect(questionMatchesMaterialScope(coversTwo, SCOPE_UNLINKED)).toBe(false);
  });

  it('sem a lista de vínculos (modo local), vale o compendiumRefId', () => {
    expect(questionMatchesMaterialScope(legacyOnly, 'mat-a')).toBe(true);
    expect(questionMatchesMaterialScope(legacyOnly, SCOPE_UNLINKED)).toBe(false);
  });
});

describe('Estudo Temático — questão em cada pacote que ela cobra', () => {
  const discipline: Discipline = { id: 'd', name: 'Farmacologia', code: 'F', icon: 'pill', description: '', cycle: 'clinico', color: '#000' };
  const theme: Theme = { id: 't', disciplineId: 'd', name: 'Antimicrobianos', description: '', highYield: false, order: 1 };
  const comp = (id: string): Compendium => ({
    id, disciplineId: 'd', themeId: 't', title: id, subtitle: '', estimatedReadTimeMinutes: 10,
    lastUpdated: '', author: '', sections: [], references: [],
  });

  it('aparece no pacote de cada material vinculado, e só link desconhecido vira referência inválida', () => {
    const data = buildThematicStudyData({
      disciplines: [discipline],
      themes: [theme],
      compendiums: [comp('mat-a'), comp('mat-b')],
      questions: [
        { ...baseQuestion, id: 'q-dois', materialLinks: [{ materialId: 'mat-a' }, { materialId: 'mat-b' }] },
        { ...baseQuestion, id: 'q-meio', materialLinks: [{ materialId: 'mat-a' }, { materialId: 'sumiu' }] },
        { ...baseQuestion, id: 'q-orfa', materialLinks: [{ materialId: 'sumiu' }] },
      ],
      flashcards: [],
      answers: {},
    });
    const pack = (id: string) => data.groups.flatMap((g) => g.packs).find((p) => p.id === packIdForCompendium(id))!;
    expect(pack('mat-a').questions.map((q) => q.id).sort()).toEqual(['q-dois', 'q-meio']);
    expect(pack('mat-b').questions.map((q) => q.id)).toEqual(['q-dois']);
    expect(data.invalidRefQuestions.map((q) => q.id)).toEqual(['q-orfa']);
    expect(data.totals.linkedQuestions).toBe(2); // q-dois conta uma vez só
  });
});
