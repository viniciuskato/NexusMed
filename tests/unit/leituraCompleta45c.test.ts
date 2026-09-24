import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FakePostgrestState, Row } from './helpers/fakePostgrest';

// ============================================================================
// Unidade 45-C (AUD-21): leituras completas, sem corte em 1000 linhas.
//
// O PostgREST devolve no máximo 1000 linhas por resposta, em silêncio. Cada
// teste monta uma tabela com mais de 1000 linhas num PostgREST de mentira que
// aplica esse mesmo teto (./helpers/fakePostgrest) e chama o método real do
// repositório: o que estava além da linha 1000 tem de aparecer. Os filtros
// `.in(ids)` também têm de ir em lotes, nunca com milhares de ids de uma vez.
// ============================================================================

const state = vi.hoisted(() => ({ tables: {}, requests: [] }) as FakePostgrestState);

vi.mock('../../src/lib/supabaseClient', async () => {
  const { makeFakeSupabase } = await import('./helpers/fakePostgrest');
  return { supabase: makeFakeSupabase(state), isSupabaseConfigured: () => true };
});

import { SupabaseAnswersRepository } from '../../src/repositories/SupabaseAnswersRepository';
import { SupabaseFlashcardsRepository } from '../../src/repositories/SupabaseFlashcardsRepository';
import { SupabaseErrorNotebookRepository } from '../../src/repositories/SupabaseErrorNotebookRepository';
import { SupabaseSimuladosRepository } from '../../src/repositories/SupabaseSimuladosRepository';
import { SupabaseMaterialsRepository } from '../../src/repositories/SupabaseMaterialsRepository';
import { fetchAllRows, fetchAllRowsByIds, IN_FILTER_CHUNK_SIZE } from '../../src/repositories/supabasePaging';

const pad = (n: number) => String(n).padStart(5, '0');
/** Instante n minutos depois de uma base fixa — ordena como texto e como data. */
const at = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString();

function maxInValues(table: string): number {
  return Math.max(0, ...state.requests.filter((r) => r.table === table).map((r) => r.inValues ?? 0));
}

beforeEach(() => {
  state.tables = {};
  state.requests = [];
});

describe('supabasePaging', () => {
  it('fetchAllRows junta todas as páginas até uma vir incompleta', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ i }));
    const ranges: [number, number][] = [];
    const rows = await fetchAllRows<{ i: number }>(async (from, to) => {
      ranges.push([from, to]);
      return { data: all.slice(from, to + 1).slice(0, 1000), error: null };
    });
    expect(rows).toHaveLength(2500);
    expect(rows[2499]).toEqual({ i: 2499 });
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('fetchAllRows para numa página vazia quando o total é múltiplo exato da página', async () => {
    const all = Array.from({ length: 2000 }, (_, i) => i);
    let calls = 0;
    const rows = await fetchAllRows<number>(async (from, to) => {
      calls++;
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(rows).toHaveLength(2000);
    expect(calls).toBe(3);
  });

  it('fetchAllRows propaga o erro da consulta', async () => {
    await expect(fetchAllRows(async () => ({ data: null, error: new Error('rede') }))).rejects.toThrow('rede');
  });

  it('fetchAllRowsByIds manda os ids em lotes e lê cada lote por inteiro', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const chunks: number[] = [];
    const rows = await fetchAllRowsByIds<string>(ids, async (chunk, from, to) => {
      if (from === 0) chunks.push(chunk.length);
      return { data: chunk.slice(from, to + 1), error: null };
    });
    expect(rows).toEqual(ids);
    expect(chunks).toEqual([IN_FILTER_CHUNK_SIZE, IN_FILTER_CHUNK_SIZE, 50]);
  });
});

describe('45-C — com mais de 1000 linhas, tudo aparece', () => {
  it('tentativas: uma questão respondida só antes das 1000 mais recentes continua respondida', async () => {
    const attempts: Row[] = [
      // A mais antiga de todas, numa questão que não se repete.
      { id: 'att-antiga', question_id: 'q-antiga', is_correct: true, answered_at: at(0), time_spent_seconds: 30, question_options: { letter: 'C' } },
    ];
    for (let i = 1; i <= 1100; i++) {
      attempts.push({ id: `att-${pad(i)}`, question_id: `q-${pad(i)}`, is_correct: false, answered_at: at(i), time_spent_seconds: 10, question_options: { letter: 'A' } });
    }
    state.tables.question_attempts = attempts;

    const answers = await new SupabaseAnswersRepository().getAnswers();

    expect(Object.keys(answers)).toHaveLength(1101);
    expect(answers['q-antiga']).toMatchObject({ isCorrect: true, selectedOption: 'C' });
  });

  it('flashcards: mais de 1000 cards, e o histórico de revisão chega até a revisão mais recente', async () => {
    state.tables.flashcards = Array.from({ length: 1100 }, (_, i) => ({
      id: `card-${pad(i)}`,
      discipline_id: 'd',
      theme_id: 't',
      material_id: null,
      question_origin_id: `q-${pad(i)}`,
      front: `frente ${i}`,
      back: 'verso',
      mechanism_highlight: null,
      tags: [],
      difficulty: 'medium',
      is_custom: false,
    }));
    state.tables.flashcard_srs_state = state.tables.flashcards.map((c) => ({
      flashcard_id: c.id,
      interval_days: 1,
      repetition_count: 1,
      ease_factor: 2.5,
      next_due_date: '2026-09-24',
      last_reviewed_date: null,
      state: 'review',
    }));
    // 1200 revisões do primeiro card: em ordem crescente, o corte levava as mais novas.
    state.tables.flashcard_reviews = Array.from({ length: 1200 }, (_, i) => ({
      id: `rev-${pad(i)}`,
      flashcard_id: 'card-00000',
      reviewed_at: at(i),
      rating: 3,
    }));
    state.tables.question_references = [
      { question_id: 'q-01099', source_id: 'src-1', sort_order: 0, sources: { citation_text: 'Fonte do último card', identificadores: null, verificacao: 'verificada' } },
    ];

    const cards = await new SupabaseFlashcardsRepository().getFlashcards();

    expect(cards).toHaveLength(1100);
    const first = cards.find((c) => c.id === 'card-00000');
    expect(first?.srs.reviewHistory).toHaveLength(1200);
    expect(first?.srs.reviewHistory?.at(-1)?.date).toBe(at(1199));
    // A fonte da questão de origem do ÚLTIMO card também chega — lida em lotes.
    const last = cards.find((c) => c.id === 'card-01099') as unknown as { bibliographicSources?: { citationText: string }[] };
    expect(JSON.stringify(last)).toContain('Fonte do último card');
    expect(maxInValues('question_references')).toBeLessThanOrEqual(IN_FILTER_CHUNK_SIZE);
  });

  it('caderno de erros: mais de 1000 erros, todos com as letras certas', async () => {
    state.tables.error_notebook = Array.from({ length: 1100 }, (_, i) => ({
      id: `err-${pad(i)}`,
      question_id: `q-${pad(i)}`,
      created_at: at(i),
      error_reason: null,
      user_notes: null,
      resolved: false,
      selected_option_id: `opt-sel-${pad(i)}`,
      correct_option_id: `opt-cor-${pad(i)}`,
    }));
    state.tables.question_options = state.tables.error_notebook.flatMap((e) => [
      { id: e.selected_option_id, letter: 'B' },
      { id: e.correct_option_id, letter: 'D' },
    ]);

    const logs = await new SupabaseErrorNotebookRepository().getErrorLogs();

    expect(logs).toHaveLength(1100);
    const oldest = logs.find((l) => l.id === 'err-00000');
    expect(oldest).toMatchObject({ selectedOption: 'B', correctOption: 'D' });
    expect(logs.every((l) => l.selectedOption === 'B' && l.correctOption === 'D')).toBe(true);
    expect(maxInValues('question_options')).toBeLessThanOrEqual(IN_FILTER_CHUNK_SIZE);
  });

  it('simulados: 25 simulados de 50 questões voltam completos, com as respostas', async () => {
    const sims: Row[] = [];
    const sqs: Row[] = [];
    const answers: Row[] = [];
    const options: Row[] = [];
    for (let s = 0; s < 25; s++) {
      sims.push({ id: `sim-${pad(s)}`, config: {}, started_at: at(s * 100), completed_at: at(s * 100 + 60), score: 50, total_time_seconds: 3600 });
      for (let p = 0; p < 50; p++) {
        const sqId = `sq-${pad(s)}-${pad(p)}`;
        sqs.push({ id: sqId, simulation_id: `sim-${pad(s)}`, question_id: `q-${pad(s * 50 + p)}`, position: p });
        answers.push({ id: `ans-${pad(s)}-${pad(p)}`, simulation_question_id: sqId, selected_option_id: `opt-${pad(s * 50 + p)}`, time_spent_seconds: 60 });
        options.push({ id: `opt-${pad(s * 50 + p)}`, letter: 'E' });
      }
    }
    state.tables.simulations = sims;
    state.tables.simulation_questions = sqs;
    state.tables.simulation_answers = answers;
    state.tables.question_options = options;

    const sessions = await new SupabaseSimuladosRepository().getSimulados();

    expect(sessions).toHaveLength(25);
    for (const s of sessions) {
      expect(s.questionIds).toHaveLength(50);
      expect(Object.keys(s.answers)).toHaveLength(50);
    }
    const oldest = sessions.find((s) => s.id === 'sim-00000');
    expect(Object.values(oldest?.answers ?? {}).every((a) => a.selectedOption === 'E')).toBe(true);
    expect(maxInValues('question_options')).toBeLessThanOrEqual(IN_FILTER_CHUNK_SIZE);
  });

  it('materiais: um acervo com mais de 1000 seções volta com todas elas', async () => {
    state.tables.materials = [
      { id: 'mat-1', discipline_id: 'd', theme_id: 't', title: 'Material longo', subtitle: null, mode: null, study_lens: null, module_number: null, estimated_read_time_minutes: 20, author: null, tags: [], created_at: at(0), updated_at: at(0), status: 'published', parent_material_id: null, tree_sort_order: 0, nav_short_title: null, taxonomy_kind: null },
      { id: 'mat-2', discipline_id: 'd', theme_id: 't', title: 'Material curto', subtitle: null, mode: null, study_lens: null, module_number: null, estimated_read_time_minutes: 10, author: null, tags: [], created_at: at(1), updated_at: at(1), status: 'published', parent_material_id: null, tree_sort_order: 1, nav_short_title: null, taxonomy_kind: null },
    ];
    state.tables.material_sections = [
      ...Array.from({ length: 1050 }, (_, i) => ({ id: `sec-1-${pad(i)}`, material_id: 'mat-1', sort_order: i, title: `Seção ${i}`, mechanism_tag: null, content: 'texto', key_takeaways: [], clinical_pearl: null, warning_alert: null })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `sec-2-${pad(i)}`, material_id: 'mat-2', sort_order: i, title: `Seção ${i}`, mechanism_tag: null, content: 'texto', key_takeaways: [], clinical_pearl: null, warning_alert: null })),
    ];
    state.tables.material_references = [];
    state.tables.material_links = [];

    const materials = await new SupabaseMaterialsRepository().getCompendiums();

    expect(materials.map((m) => m.title)).toEqual(['Material longo', 'Material curto']);
    expect(materials[0].sections).toHaveLength(1050);
    expect(materials[0].sections.at(-1)?.title).toBe('Seção 1049');
    // As seções de posição baixa do outro material (que caíam depois da linha 1000) também chegam.
    expect(materials[1].sections).toHaveLength(3);
  });
});
