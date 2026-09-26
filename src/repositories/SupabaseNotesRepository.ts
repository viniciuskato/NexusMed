import { supabase } from '../lib/supabaseClient';
import type { NotesRepository, RemovedSectionNote } from './NotesRepository';
import { StorageService } from '../services/storage';

// ============================================================================
// Fase 4-5 wiring — Supabase-backed NotesRepository
// ============================================================================
//
// `NotesRepository` foi convertida para assíncrona e esta classe passou a
// declarar `implements NotesRepository` e a ser o singleton `notesRepository`
// consumido pelo app.
//
// Mapeamento de campos (frontend <-> banco):
//
// Record<targetId, noteText> <-> notes
//   note_text <-> noteText
//   O frontend trata `targetId` como uma chave genérica opaca (uma nota pode
//   ser sobre um compêndio, uma seção, uma questão ou um flashcard), mas o
//   schema usa 4 colunas nullable mutuamente exclusivas
//   (num_nonnulls(material_id, material_section_id, question_id,
//   flashcard_id) = 1) em vez de um alvo polimórfico solto. Não há
//   discriminador de tipo no parâmetro `targetId` da interface original —
//   LACUNA DE SCHEMA CONHECIDA. Para preservar a assinatura exata da
//   interface (targetId: string, sem um segundo parâmetro de tipo),
//   `saveNote`/`getNotes` resolvem a qual coluna um targetId pertence
//   verificando, em ordem, se ele existe como id em materials,
//   material_sections, questions ou flashcards. Isso é seguro na prática
//   porque os 4 domínios usam uuids gerados independentemente (colisão
//   cross-tabela é praticamente impossível), mas é uma consulta extra por
//   `saveNote` que não existe no LocalStorageNotesRepository.
//   `getNotes` não precisa resolver nada: lê as 4 colunas de volta e usa a
//   que estiver preenchida como chave do Record.
// ============================================================================

type NoteTargetColumn = 'material_id' | 'material_section_id' | 'question_id' | 'flashcard_id';

const NOTE_TARGET_TABLES: Array<{ table: string; column: NoteTargetColumn }> = [
  { table: 'materials', column: 'material_id' },
  { table: 'material_sections', column: 'material_section_id' },
  { table: 'questions', column: 'question_id' },
  { table: 'flashcards', column: 'flashcard_id' },
];

interface NoteRow {
  material_id: string | null;
  material_section_id: string | null;
  question_id: string | null;
  flashcard_id: string | null;
  note_text: string;
  updated_at: string;
  /** 45-D: preenchido quando a seção da anotação saiu do material. */
  removed_section_title: string | null;
}

async function resolveNoteColumn(targetId: string): Promise<NoteTargetColumn> {
  for (const { table, column } of NOTE_TARGET_TABLES) {
    const { data, error } = await supabase.from(table).select('id').eq('id', targetId).maybeSingle();
    if (error) throw error;
    if (data) return column;
  }
  throw new Error(
    `saveNote: não foi possível determinar o tipo de destino para targetId=${targetId} ` +
      '(não encontrado em materials/material_sections/questions/flashcards)'
  );
}

export class SupabaseNotesRepository implements NotesRepository {
  async getNotes(): Promise<Record<string, string>> {
    const { data, error } = await supabase
      .from('notes')
      .select('material_id, material_section_id, question_id, flashcard_id, note_text, updated_at, removed_section_title');
    if (error) throw error;

    const result: Record<string, string> = {};
    for (const row of (data ?? []) as NoteRow[]) {
      // Anotação de seção removida aponta para o material, mas não é a
      // anotação do material: é lida à parte (getRemovedSectionNotes).
      if (row.removed_section_title) continue;
      const targetId = row.material_id ?? row.material_section_id ?? row.question_id ?? row.flashcard_id;
      if (targetId) {
        result[targetId] = row.note_text;
        // Guarda o `updated_at` conhecido como "base" para a próxima escrita
        // (ver upsert_note na migration sync_reliability_conflict_guards) —
        // é assim que o dispositivo sabe se o servidor mudou desde a última
        // vez que ele viu esta nota, sem precisar de um editor colaborativo.
        StorageService.setNoteBaseVersion(targetId, row.updated_at);
      }
    }
    return result;
  }

  async getRemovedSectionNotes(materialId: string): Promise<RemovedSectionNote[]> {
    const { data, error } = await supabase
      .from('notes')
      .select('note_text, removed_section_title, created_at')
      .eq('material_id', materialId)
      .not('removed_section_title', 'is', null);
    if (error) throw error;
    return ((data ?? []) as Array<{ note_text: string; removed_section_title: string }>).map((r) => ({
      sectionTitle: r.removed_section_title,
      noteText: r.note_text,
    }));
  }

  // NOTA: este método não é chamado no fluxo real do app — `saveNote`
  // passa pela fila de sincronização (`note_upsert`,
  // src/services/syncHandlers.ts), que já usa a RPC `upsert_note` com
  // detecção de conflito. Mantido por conformidade com a interface
  // `NotesRepository` e atualizado para não reintroduzir o upsert cego que
  // a revisão do 07-E2 removeu do caminho real.
  async saveNote(targetId: string, noteText: string): Promise<void> {
    const column = await resolveNoteColumn(targetId);
    const { data, error } = await supabase.rpc('upsert_note', {
      p_material_id: column === 'material_id' ? targetId : null,
      p_material_section_id: column === 'material_section_id' ? targetId : null,
      p_question_id: column === 'question_id' ? targetId : null,
      p_flashcard_id: column === 'flashcard_id' ? targetId : null,
      p_note_text: noteText,
      p_base_updated_at: StorageService.getNoteBaseVersion(targetId),
    });
    if (error) throw error;
    if (data?.conflict) {
      // Caminho não exercitado pelo app real (ver nota acima) — não
      // duplica a lógica de merge do handler da fila; só evita a
      // sobrescrita silenciosa, propagando um erro explícito.
      throw new Error('conflito de sincronização detectado ao salvar nota (ver upsert_note)');
    }
  }
}

export const supabaseNotesRepository = new SupabaseNotesRepository();
