import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Flashcard } from '../../src/types';

// CARD-1: o cartão escrito chega ao servidor pela RPC `create_written_flashcard` (atômica e idempotente pelo id).
// - SupabaseFlashcardsRepository.createWrittenFlashcardAtomic: manda os campos certos (inclusive a questão de
//   origem e a seção) e devolve o cartão que o servidor devolveu, marcado como escrito;
// - handler da fila `flashcard_create_written`: manda pela RPC e guarda o cartão canônico no aparelho; o mesmo
//   envio repetido (replay da fila) manda o MESMO id e não apaga nada.

const rpc = vi.fn();
const upsert = vi.fn();
const handlers = new Map<string, (payload: unknown, clientOpId?: string) => Promise<unknown>>();

vi.mock('../../src/services/syncQueue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/syncQueue')>()),
  registerHandler: (categoria: string, fn: (payload: unknown, clientOpId?: string) => Promise<unknown>) => handlers.set(categoria, fn),
}));
vi.mock('../../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
    from: (tabela: string) => ({
      upsert: (l: unknown) => {
        upsert(tabela, l);
        return Promise.resolve({ error: null });
      },
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
}));

const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  discipline_id: 'd-1',
  theme_id: 't-1',
  material_id: 'mat-1',
  material_section_id: 'sec-1',
  question_origin_id: null,
  front: 'Minha frente',
  back: 'Meu verso',
  mechanism_highlight: null,
  tags: [],
  difficulty: 'medio',
  is_custom: true,
  is_written: true,
  ...extra,
});

function cartao(id: string, extra: Partial<Flashcard> = {}): Flashcard {
  return {
    id,
    disciplineId: 'd-1',
    themeId: 't-1',
    compendiumRefId: 'mat-1',
    compendiumSectionId: 'sec-1',
    front: 'Minha frente',
    back: 'Meu verso',
    mechanismHighlight: '',
    tags: ['Nefrologia'],
    difficulty: 'medio',
    isCustom: true,
    isWritten: true,
    srs: { intervalDays: 0, repetitionCount: 0, easeFactor: 2.5, nextDueDate: '2026-10-05', state: 'new', reviewHistory: [] },
    ...extra,
  } as Flashcard;
}

function memoria(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoria());
  vi.resetModules();
  vi.restoreAllMocks();
  rpc.mockReset();
  upsert.mockReset();
  handlers.clear();
});

describe('SupabaseFlashcardsRepository.createWrittenFlashcardAtomic (CARD-1)', () => {
  it('cartão de seção: manda material e seção, sem questão, com o texto como foi escrito', async () => {
    rpc.mockResolvedValue({ data: linha('c-1'), error: null });
    const { supabaseFlashcardsRepository } = await import('../../src/repositories/SupabaseFlashcardsRepository');

    const criado = await supabaseFlashcardsRepository.createWrittenFlashcardAtomic(cartao('c-1'));

    expect(rpc).toHaveBeenCalledWith('create_written_flashcard', {
      p_id: 'c-1',
      p_discipline_id: 'd-1',
      p_theme_id: 't-1',
      p_material_id: 'mat-1',
      p_material_section_id: 'sec-1',
      p_question_origin_id: null,
      p_front: 'Minha frente',
      p_back: 'Meu verso',
      p_tags: ['Nefrologia'],
      p_difficulty: 'medio',
    });
    expect(criado).toMatchObject({ id: 'c-1', front: 'Minha frente', back: 'Meu verso', isWritten: true, compendiumSectionId: 'sec-1' });
  });

  it('cartão de questão: manda a questão de origem', async () => {
    rpc.mockResolvedValue({ data: linha('c-2', { question_origin_id: 'q-1' }), error: null });
    const { supabaseFlashcardsRepository } = await import('../../src/repositories/SupabaseFlashcardsRepository');

    const criado = await supabaseFlashcardsRepository.createWrittenFlashcardAtomic(
      cartao('c-2', { questionOriginId: 'q-1', compendiumSectionId: undefined }),
    );

    expect(rpc).toHaveBeenCalledWith('create_written_flashcard', expect.objectContaining({
      p_question_origin_id: 'q-1',
      p_material_section_id: null,
    }));
    expect(criado.questionOriginId).toBe('q-1');
  });

  it('erro da RPC sobe (a fila trata como falha e tenta de novo)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'frente e verso são obrigatórios' } });
    const { supabaseFlashcardsRepository } = await import('../../src/repositories/SupabaseFlashcardsRepository');
    await expect(supabaseFlashcardsRepository.createWrittenFlashcardAtomic(cartao('c-3'))).rejects.toMatchObject({
      message: 'frente e verso são obrigatórios',
    });
  });

  it('cartão que não é escrito (os de antes) não ganha a marca ao ser lido', async () => {
    rpc.mockResolvedValue({ data: linha('c-4', { is_written: false }), error: null });
    const { supabaseFlashcardsRepository } = await import('../../src/repositories/SupabaseFlashcardsRepository');
    const lido = await supabaseFlashcardsRepository.createWrittenFlashcardAtomic(cartao('c-4'));
    expect('isWritten' in lido).toBe(false);
  });
});

describe('SupabaseFlashcardsRepository.saveFlashcard — upsert comum (CARD-1)', () => {
  it('o cartão escrito mantém a marca no upsert (nunca vira automático por esse caminho)', async () => {
    const { supabaseFlashcardsRepository } = await import('../../src/repositories/SupabaseFlashcardsRepository');
    await supabaseFlashcardsRepository.saveFlashcard(cartao('c-9', { questionOriginId: 'q-1' }));
    const linhaGravada = upsert.mock.calls.find(([tabela]) => tabela === 'flashcards')?.[1];
    expect(linhaGravada).toMatchObject({ id: 'c-9', is_written: true, question_origin_id: 'q-1' });
  });

  it('o cartão comum não manda a coluna (nunca desmarca um escrito)', async () => {
    const { supabaseFlashcardsRepository } = await import('../../src/repositories/SupabaseFlashcardsRepository');
    await supabaseFlashcardsRepository.saveFlashcard(cartao('c-10', { isWritten: undefined }));
    const linhaGravada = upsert.mock.calls.find(([tabela]) => tabela === 'flashcards')?.[1] as Record<string, unknown>;
    expect('is_written' in linhaGravada).toBe(false);
  });
});

describe('fila — flashcard_create_written (CARD-1)', () => {
  async function registrar() {
    const { registerSyncHandlers } = await import('../../src/services/syncHandlers');
    registerSyncHandlers();
    return handlers.get('flashcard_create_written')!;
  }

  it('manda o cartão pela RPC e guarda o cartão canônico no aparelho', async () => {
    const handler = await registrar();
    const { StorageService } = await import('../../src/services/storage');
    const salvar = vi.spyOn(StorageService, 'saveFlashcard').mockImplementation((c: Flashcard) => c);
    rpc.mockResolvedValue({ data: linha('c-1'), error: null });

    const res = (await handler({ flashcard: cartao('c-1') })) as Flashcard;

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(res.id).toBe('c-1');
    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-1', isWritten: true }));
  });

  it('o mesmo envio repetido (replay da fila) manda o MESMO id e não apaga cartão nenhum', async () => {
    const handler = await registrar();
    const { StorageService } = await import('../../src/services/storage');
    const apagar = vi.spyOn(StorageService, 'deleteFlashcard').mockImplementation(() => {});
    vi.spyOn(StorageService, 'saveFlashcard').mockImplementation((c: Flashcard) => c);
    rpc.mockResolvedValue({ data: linha('c-1'), error: null });

    await handler({ flashcard: cartao('c-1') });
    await handler({ flashcard: cartao('c-1') });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([, args]) => (args as { p_id: string }).p_id)).toEqual(['c-1', 'c-1']);
    expect(apagar).not.toHaveBeenCalled();
  });
});
