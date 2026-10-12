// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FakePostgrestState } from './helpers/fakePostgrest';

// PAINEL-2 — SupabaseAnswersRepository.getAttempts: o histórico inteiro de tentativas (a evolução
// semanal do Início), só do usuário logado, em páginas (o PostgREST corta em 1000), com a falha subindo
// para a tela (nunca uma lista vazia no lugar de um erro).

const state = vi.hoisted(() => ({ tables: {}, requests: [] }) as FakePostgrestState);
const falha = vi.hoisted(() => ({ erro: null as Error | null }));

vi.mock('../../src/lib/supabaseClient', async () => {
  const { makeFakeSupabase } = await import('./helpers/fakePostgrest');
  const fake = makeFakeSupabase(state);
  return {
    isSupabaseConfigured: () => true,
    supabase: {
      from(tabela: string) {
        if (falha.erro) {
          const quebrado = {
            select: () => quebrado,
            eq: () => quebrado,
            order: () => quebrado,
            range: () => Promise.resolve({ data: null, error: falha.erro }),
          };
          return quebrado;
        }
        return fake.from(tabela);
      },
    },
  };
});

import { SupabaseAnswersRepository } from '../../src/repositories/SupabaseAnswersRepository';
import { StorageService } from '../../src/services/storage';

const pad = (n: number) => String(n).padStart(5, '0');
const at = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString();

beforeEach(() => {
  state.tables = {};
  state.requests = [];
  falha.erro = null;
  StorageService.setActiveUser('u1');
});
afterEach(() => StorageService.setActiveUser(null));

describe('SupabaseAnswersRepository.getAttempts', () => {
  it('devolve todas as tentativas do usuário (mais de 1000, em páginas), repetidas da mesma questão incluídas, e nenhuma de outro usuário', async () => {
    const minhas = Array.from({ length: 1150 }, (_, i) => ({
      id: `a-${pad(i)}`,
      user_id: 'u1',
      question_id: `q-${pad(i % 10)}`, // 10 questões, cada uma tentada muitas vezes
      is_correct: i % 2 === 0,
      answered_at: at(i),
    }));
    const dosOutros = Array.from({ length: 30 }, (_, i) => ({
      id: `b-${pad(i)}`,
      user_id: 'u2',
      question_id: 'q-outro',
      is_correct: true,
      answered_at: at(5000 + i),
    }));
    state.tables.question_attempts = [...minhas, ...dosOutros];

    const tentativas = await new SupabaseAnswersRepository().getAttempts();

    expect(tentativas).toHaveLength(1150);
    expect(tentativas.some((t) => t.questionId === 'q-outro')).toBe(false);
    // Mais novas primeiro, e a mais velha (além da linha 1000) está lá.
    expect(tentativas[0]).toEqual({ questionId: 'q-00009', isCorrect: false, timestamp: at(1149) });
    expect(tentativas[1149]).toEqual({ questionId: 'q-00000', isCorrect: true, timestamp: at(0) });
    expect(state.requests.filter((r) => r.table === 'question_attempts').map((r) => r.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('sem tentativa nenhuma, lista vazia', async () => {
    state.tables.question_attempts = [];
    expect(await new SupabaseAnswersRepository().getAttempts()).toEqual([]);
  });

  it('a falha do servidor sobe (a tela mostra "sem conexão"), nunca vira lista vazia', async () => {
    falha.erro = new TypeError('Failed to fetch');
    await expect(new SupabaseAnswersRepository().getAttempts()).rejects.toThrow('Failed to fetch');
  });
});
