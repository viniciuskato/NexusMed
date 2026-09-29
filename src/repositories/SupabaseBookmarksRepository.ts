import { supabase } from '../lib/supabaseClient';
import { BookmarksRepository } from './BookmarksRepository';

// ============================================================================
// Fase 4-5 wiring — Supabase-backed BookmarksRepository
// ============================================================================
//
// `BookmarksRepository` foi convertida para assíncrona e esta classe passou a
// declarar `implements BookmarksRepository` e a ser o singleton
// `bookmarksRepository` consumido pelo app.
//
// Mapeamento de campos (frontend <-> banco):
//
// { questions, compendiums, flashcards } <-> bookmarks
//   O frontend agrupa favoritos em 3 arrays por tipo; o schema usa 3 colunas
//   nullable mutuamente exclusivas na mesma linha (num_nonnulls(...) = 1):
//     'questions'   <-> question_id
//     'compendiums' <-> material_id  (nome de tabela "materials" no schema)
//     'flashcards'  <-> flashcard_id
//   Cada (user_id, <coluna>) tem índice único parcial — não é possível
//   favoritar o mesmo alvo duas vezes para o mesmo usuário.
//   user_id não tem default no schema: toggleBookmark busca o uid da sessão
//   atual via supabase.auth.getUser() antes de inserir.
// ============================================================================

type BookmarkType = 'questions' | 'compendiums' | 'flashcards';

const COLUMN_BY_TYPE: Record<BookmarkType, 'question_id' | 'material_id' | 'flashcard_id'> = {
  questions: 'question_id',
  compendiums: 'material_id',
  flashcards: 'flashcard_id',
};

interface BookmarkRow {
  question_id: string | null;
  material_id: string | null;
  flashcard_id: string | null;
}

export class SupabaseBookmarksRepository implements Pick<BookmarksRepository, 'getBookmarks'> {
  // O app só usa a leitura daqui: a gravação vai pela fila (handler em
  // syncHandlers.ts), com o estado desejado explícito (45-G, AUD-29). O toggle
  // abaixo lê o servidor e inverte; fica só para scripts/validate-personal-repos.ts.
  async getBookmarks(): Promise<{
    questions: string[];
    compendiums: string[];
    flashcards: string[];
  }> {
    const { data, error } = await supabase.from('bookmarks').select('question_id, material_id, flashcard_id');
    if (error) throw error;

    const result = { questions: [] as string[], compendiums: [] as string[], flashcards: [] as string[] };
    for (const row of (data ?? []) as BookmarkRow[]) {
      if (row.question_id) result.questions.push(row.question_id);
      if (row.material_id) result.compendiums.push(row.material_id);
      if (row.flashcard_id) result.flashcards.push(row.flashcard_id);
    }
    return result;
  }

  async toggleBookmark(type: BookmarkType, id: string): Promise<boolean> {
    const column = COLUMN_BY_TYPE[type];

    const { data: existing, error: selErr } = await supabase
      .from('bookmarks')
      .select('id')
      .eq(column, id)
      .maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
      const { error } = await supabase.from('bookmarks').delete().eq('id', existing.id);
      if (error) throw error;
      return false;
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const { error } = await supabase.from('bookmarks').insert({ user_id: userData.user?.id, [column]: id });
    if (error) throw error;
    return true;
  }
}

export const supabaseBookmarksRepository = new SupabaseBookmarksRepository();
