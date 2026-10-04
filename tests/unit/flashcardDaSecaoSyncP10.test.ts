import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Flashcard } from '../../src/types';

// P10: o card leva a seção do material até o servidor.
// - SupabaseFlashcardsRepository: as duas RPCs recebem `p_material_section_id`; o upsert comum grava
//   `material_section_id`; a linha lida volta como `compendiumSectionId`.
// - Handler da fila `flashcard_create_from_section`: manda o card pela RPC atômica e, se o servidor devolver
//   OUTRO card (o do mesmo usuário e seção, criado em outro aparelho), o rascunho local sai e o canônico fica.

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
      upsert: (linha: unknown) => {
        upsert(tabela, linha);
        return Promise.resolve({ error: null });
      },
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
  },
}));

const linhaDoServidor = (id: string, secao: string | null) => ({
  id,
  discipline_id: 'd-1',
  theme_id: 't-1',
  material_id: 'mat-1',
  material_section_id: secao,
  question_origin_id: null,
  front: 'F',
  back: 'V',
  mechanism_highlight: null,
  tags: [],
  difficulty: 'medio',
  is_custom: true,
});

function card(id: string, extra: Partial<Flashcard> = {}): Flashcard {
  return {
    id,
    disciplineId: 'd-1',
    themeId: 't-1',
    compendiumRefId: 'mat-1',
    compendiumSectionId: 'sec-1',
    front: 'F',
    back: 'V',
    mechanismHighlight: '',
    tags: [],
    difficulty: 'medio',
    isCustom: true,
    srs: { intervalDays: 0, repetitionCount: 0, easeFactor: 2.5, nextDueDate: '2026-10-04', state: 'new', reviewHistory: [] },
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

describe('SupabaseFlashcardsRepository — seção (P10)', () => {
  it('createFlashcardFromQuestionAtomic manda a seção na RPC do card do erro', async () => {
    rpc.mockResolvedValue({ data: { ...linhaDoServidor('c-1', 'sec-1'), question_origin_id: 'q-1' }, error: null });
    const { supabaseFlashcardsRepository } = await import('../../src/repositories/SupabaseFlashcardsRepository');

    const criado = await supabaseFlashcardsRepository.createFlashcardFromQuestionAtomic(card('c-1', { questionOriginId: 'q-1' }));

    expect(rpc).toHaveBeenCalledWith('create_flashcard_from_question', expect.objectContaining({
      p_material_id: 'mat-1',
      p_material_section_id: 'sec-1',
      p_question_origin_id: 'q-1',
    }));
    expect(criado).toMatchObject({ compendiumSectionId: 'sec-1', questionOriginId: 'q-1' });
  });

  it('card sem seção manda null (a RPC aceita)', async () => {
    rpc.mockResolvedValue({ data: { ...linhaDoServidor('c-1', null), question_origin_id: 'q-1' }, error: null });
    const { supabaseFlashcardsRepository } = await import('../../src/repositories/SupabaseFlashcardsRepository');

    const criado = await supabaseFlashcardsRepository.createFlashcardFromQuestionAtomic(
      card('c-1', { questionOriginId: 'q-1', compendiumSectionId: undefined }),
    );

    expect(rpc).toHaveBeenCalledWith('create_flashcard_from_question', expect.objectContaining({ p_material_section_id: null }));
    expect(criado.compendiumSectionId).toBeUndefined();
  });

  it('createFlashcardFromSectionAtomic usa a RPC do card de seção e devolve o canônico', async () => {
    rpc.mockResolvedValue({ data: linhaDoServidor('canonico', 'sec-1'), error: null });
    const { supabaseFlashcardsRepository } = await import('../../src/repositories/SupabaseFlashcardsRepository');

    const criado = await supabaseFlashcardsRepository.createFlashcardFromSectionAtomic(card('rascunho'));

    expect(rpc).toHaveBeenCalledWith('create_flashcard_from_section', expect.objectContaining({
      p_id: 'rascunho',
      p_material_id: 'mat-1',
      p_material_section_id: 'sec-1',
    }));
    expect(criado.id).toBe('canonico');
    expect(criado.compendiumSectionId).toBe('sec-1');
  });

  it('o upsert comum grava material_section_id', async () => {
    const { supabaseFlashcardsRepository } = await import('../../src/repositories/SupabaseFlashcardsRepository');
    await supabaseFlashcardsRepository.saveFlashcard(card('c-9'));
    const gravacao = upsert.mock.calls.find(([tabela]) => tabela === 'flashcards');
    expect(gravacao?.[1]).toMatchObject({ id: 'c-9', material_id: 'mat-1', material_section_id: 'sec-1' });
  });
});

describe('fila — flashcard_create_from_section (P10)', () => {
  async function registrar() {
    const { registerSyncHandlers } = await import('../../src/services/syncHandlers');
    registerSyncHandlers();
    return handlers.get('flashcard_create_from_section')!;
  }

  it('manda o card pela RPC atômica e guarda o card canônico no aparelho', async () => {
    const handler = await registrar();
    rpc.mockResolvedValue({ data: linhaDoServidor('c-1', 'sec-1'), error: null });

    const res = (await handler({ flashcard: card('c-1') })) as Flashcard;

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(res.id).toBe('c-1');
  });

  it('o servidor devolve outro card (mesma seção, outro aparelho): o rascunho local sai e o canônico fica', async () => {
    const handler = await registrar();
    const { StorageService } = await import('../../src/services/storage');
    const saveFlashcard = vi.spyOn(StorageService, 'saveFlashcard').mockImplementation((c: Flashcard) => c);
    const deleteFlashcard = vi.spyOn(StorageService, 'deleteFlashcard').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: linhaDoServidor('do-outro-aparelho', 'sec-1'), error: null });

    const res = (await handler({ flashcard: card('rascunho-local') })) as Flashcard;

    expect(res.id).toBe('do-outro-aparelho');
    expect(deleteFlashcard).toHaveBeenCalledWith('rascunho-local');
    expect(saveFlashcard).toHaveBeenCalledWith(expect.objectContaining({ id: 'do-outro-aparelho', compendiumSectionId: 'sec-1' }));
  });

  it('o mesmo envio repetido (replay da fila) não troca nada: o servidor devolve o mesmo id', async () => {
    const handler = await registrar();
    const { StorageService } = await import('../../src/services/storage');
    const deleteFlashcard = vi.spyOn(StorageService, 'deleteFlashcard').mockImplementation(() => {});
    vi.spyOn(StorageService, 'saveFlashcard').mockImplementation((c: Flashcard) => c);
    rpc.mockResolvedValue({ data: linhaDoServidor('c-1', 'sec-1'), error: null });

    await handler({ flashcard: card('c-1') });
    await handler({ flashcard: card('c-1') });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(deleteFlashcard).not.toHaveBeenCalled();
  });
});
