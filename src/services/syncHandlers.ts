// ============================================================================
// syncHandlers — registra, por categoria, como uma operação da fila
// (src/services/syncQueue.ts) é efetivamente enviada ao Supabase.
//
// Cada handler é responsável só pelo envio; classificação de erro e
// retentativa são genéricas (ver syncQueue.classifySyncError). Importado uma
// única vez (side-effect de registro) a partir de src/App.tsx.
// ============================================================================

import { supabase } from '../lib/supabaseClient';
import { registerHandler } from './syncQueue';
import { supabaseFlashcardsRepository } from '../repositories/SupabaseFlashcardsRepository';
import { StorageService } from './storage';
import { QuestionAnswerRecord, ErrorLogItem, SimuladoSessionData, QuestionReactionValue, UserFeedback, Flashcard } from '../types';

export interface QuestionAttemptOpPayload {
  questionId: string;
  selectedOption: QuestionAnswerRecord['selectedOption'];
  timeSpentSeconds: number;
  errorReason?: QuestionAnswerRecord['errorReason'];
  userNotes?: string;
  answerMode?: QuestionAnswerRecord['answerMode'];
  answerStrategy?: QuestionAnswerRecord['answerStrategy'];
  timestamp: string;
}

export interface FlashcardReviewOpPayload {
  flashcardId: string;
  rating: 1 | 2 | 3 | 4;
}

export interface FlashcardUpsertOpPayload {
  flashcard: Parameters<typeof supabaseFlashcardsRepository.saveFlashcard>[0];
}

export interface FlashcardCreateFromQuestionOpPayload {
  flashcard: Parameters<typeof supabaseFlashcardsRepository.createFlashcardFromQuestionAtomic>[0];
}

export interface FlashcardDeleteOpPayload {
  id: string;
}

export interface FlashcardSrsUpsertOpPayload {
  flashcardId: string;
  srs: Parameters<typeof supabaseFlashcardsRepository.updateFlashcardSRS>[1];
}

export type BookmarkType = 'questions' | 'compendiums' | 'flashcards';
export interface BookmarkSetOpPayload {
  type: BookmarkType;
  id: string;
  desired: boolean;
}

export interface ReadingProgressSetOpPayload {
  compendiumId: string;
  sectionId: string;
  isRead: boolean;
  totalSections: number;
}

export interface NoteUpsertOpPayload {
  targetId: string;
  noteText: string;
}

export interface ErrorNotebookUpdateOpPayload {
  errorItem: ErrorLogItem;
}

export interface SimuladoSaveOpPayload {
  session: SimuladoSessionData;
}

// Reações (categoria 8): estado DESEJADO explícito ('up'/'down'/null para
// remover), nunca um toggle — ver registerHandler('reaction_set', ...)
// abaixo e docs/SINCRONIZACAO-CONFIAVEL.md, seção "Prompt 07-F".
export interface ReactionSetOpPayload {
  questionId: string;
  reaction: QuestionReactionValue | null;
}

// Feedback (categoria 9): `feedback.id` é gerado no cliente (crypto.randomUUID())
// no momento da criação, antes de qualquer tentativa de rede, e nunca
// regenerado entre retries do MESMO envio — já cumpre o papel de
// `client_op_id` (é a chave primária da tabela `feedback`). Ver comentário
// completo na migration 20260910120000_sync_reliability_categorias_8_9.sql.
export interface FeedbackSubmitOpPayload {
  feedback: UserFeedback;
}

const BOOKMARK_COLUMN: Record<BookmarkType, 'question_id' | 'material_id' | 'flashcard_id'> = {
  questions: 'question_id',
  compendiums: 'material_id',
  flashcards: 'flashcard_id',
};

const NOTE_TARGET_TABLES: Array<{ table: string; column: 'material_id' | 'material_section_id' | 'question_id' | 'flashcard_id' }> = [
  { table: 'materials', column: 'material_id' },
  { table: 'material_sections', column: 'material_section_id' },
  { table: 'questions', column: 'question_id' },
  { table: 'flashcards', column: 'flashcard_id' },
];

async function resolveNoteColumn(targetId: string) {
  for (const { table, column } of NOTE_TARGET_TABLES) {
    const { data, error } = await supabase.from(table).select('id').eq('id', targetId).maybeSingle();
    if (error) throw error;
    if (data) return column;
  }
  throw new Error(`nota: não foi possível determinar o tipo de destino para targetId=${targetId}`);
}

type NoteColumn = 'material_id' | 'material_section_id' | 'question_id' | 'flashcard_id';

function noteRpcArgs(column: NoteColumn, targetId: string) {
  return {
    p_material_id: column === 'material_id' ? targetId : null,
    p_material_section_id: column === 'material_section_id' ? targetId : null,
    p_question_id: column === 'question_id' ? targetId : null,
    p_flashcard_id: column === 'flashcard_id' ? targetId : null,
  };
}

// Nunca escolhe sozinho qual das duas edições vale quando um conflito real é
// detectado (Prompt 07-E2 — a diretoria não aceita LWW silencioso apagando
// texto válido). Preserva as duas versões com uma marcação visível para o
// usuário revisar/editar manualmente — não é um editor colaborativo, só a
// proteção mínima contra perda silenciosa.
function mergeConflictingNoteText(localText: string, serverText: string): string {
  if (localText === serverText) return localText;
  const stamp = new Date().toLocaleString('pt-BR');
  return (
    `${localText}\n\n---\n` +
    `[Conflito de sincronização em ${stamp}: outro dispositivo também editou esta nota enquanto ` +
    `este dispositivo estava com uma edição pendente. Nada foi apagado — a versão do outro ` +
    `dispositivo foi preservada abaixo; revise e edite como preferir.]\n\n${serverText}`
  );
}

let registered = false;

export function registerSyncHandlers(): void {
  if (registered) return;
  registered = true;

  registerHandler('question_attempt', async (payload: QuestionAttemptOpPayload, clientOpId) => {
    const { data: option, error: optErr } = await supabase
      .from('question_options')
      .select('id')
      .eq('question_id', payload.questionId)
      .eq('letter', payload.selectedOption)
      .single();
    if (optErr) throw optErr;

    const { data, error } = await supabase.rpc('submit_question_attempt', {
      p_question_id: payload.questionId,
      p_selected_option_id: option.id,
      p_time_spent_seconds: payload.timeSpentSeconds,
      p_error_reason: payload.errorReason ?? null,
      p_user_notes: payload.userNotes ?? null,
      p_answer_mode: payload.answerMode ?? null,
      p_answer_strategy: payload.answerStrategy ?? null,
      p_client_op_id: clientOpId,
    });
    if (error) throw error;
    // Só agora existe uma correção autoritativa. O cache local e o caderno de
    // erros nunca recebem o antigo `false` provisório enquanto a rede está
    // lenta/offline. Replays são seguros: answers sobrescreve por questionId
    // e o error log local atualiza a entrada já existente da mesma questão.
    const confirmed = data as { is_correct: boolean };
    StorageService.recordAnswer({
      questionId: payload.questionId,
      selectedOption: payload.selectedOption,
      isCorrect: confirmed.is_correct,
      timestamp: payload.timestamp,
      timeSpentSeconds: payload.timeSpentSeconds,
      errorReason: confirmed.is_correct ? undefined : payload.errorReason,
      userNotes: payload.userNotes,
      answerMode: payload.answerMode,
      answerStrategy: payload.answerStrategy,
    });
    return data;
  });

  registerHandler('flashcard_review', async (payload: FlashcardReviewOpPayload, clientOpId) => {
    const { data, error } = await supabase.rpc('submit_flashcard_review', {
      p_flashcard_id: payload.flashcardId,
      p_rating: payload.rating,
      p_client_op_id: clientOpId,
    });
    if (error) throw error;
    const confirmed = data as {
      flashcard_id?: string;
      interval_days: number;
      repetition_count: number;
      ease_factor: number;
      next_due_date: string;
      last_reviewed_date: string | null;
      state: Flashcard['srs']['state'];
    };
    const canonicalId = confirmed.flashcard_id ?? payload.flashcardId;
    const localCards = StorageService.getFlashcards();
    const localCard = localCards.find((card) => card.id === canonicalId)
      ?? localCards.find((card) => card.id === payload.flashcardId);
    if (localCard) {
      if (canonicalId !== payload.flashcardId) StorageService.deleteFlashcard(payload.flashcardId);
      StorageService.saveFlashcard({
        ...localCard,
        id: canonicalId,
        srs: {
          ...localCard.srs,
          intervalDays: confirmed.interval_days,
          repetitionCount: confirmed.repetition_count,
          easeFactor: Number(confirmed.ease_factor),
          nextDueDate: confirmed.next_due_date,
          lastReviewedDate: confirmed.last_reviewed_date ?? undefined,
          state: confirmed.state,
        },
      });
    }
    return confirmed;
  });

  registerHandler('flashcard_upsert', async (payload: FlashcardUpsertOpPayload) => {
    return supabaseFlashcardsRepository.saveFlashcard(payload.flashcard);
  });

  registerHandler('flashcard_create_from_question', async (payload: FlashcardCreateFromQuestionOpPayload) => {
    const canonical = await supabaseFlashcardsRepository.createFlashcardFromQuestionAtomic(payload.flashcard);
    if (canonical.id !== payload.flashcard.id) StorageService.deleteFlashcard(payload.flashcard.id);
    StorageService.saveFlashcard(canonical);
    return canonical;
  });

  registerHandler('flashcard_delete', async (payload: FlashcardDeleteOpPayload) => {
    await supabaseFlashcardsRepository.deleteFlashcard(payload.id);
    return null;
  });

  registerHandler('flashcard_srs_upsert', async (payload: FlashcardSrsUpsertOpPayload) => {
    await supabaseFlashcardsRepository.updateFlashcardSRS(payload.flashcardId, payload.srs);
    return null;
  });

  // Favoritos (categoria 5): contrato mudou de "toggle" (não seguro para
  // retry — reenviar depois de uma falha de rede podia inverter o estado
  // errado, ver AGENTS.md armadilha #14) para "set" explícito. O estado
  // desejado já foi decidido no cliente no momento do clique (antes de
  // qualquer chamada de rede); reenviar o MESMO `desired` é sempre um no-op
  // seguro, nunca um segundo toggle.
  registerHandler('bookmark_set', async (payload: BookmarkSetOpPayload) => {
    const column = BOOKMARK_COLUMN[payload.type];
    if (payload.desired) {
      // `bookmarks` usa índices únicos PARCIAIS (`where <coluna> is not
      // null`) — o upsert do PostgREST não consegue inferir um índice
      // parcial como alvo de ON CONFLICT (ver nota na migration de notas),
      // então garantimos idempotência checando existência antes de inserir,
      // em vez de upsert. Reenviar `desired: true` quando já existe é um
      // no-op seguro (nunca duplica: RLS + índice único barram, e o SELECT
      // prévio já evita a maioria das tentativas de duplicar).
      const { data: existing, error: selErr } = await supabase
        .from('bookmarks')
        .select('id')
        .eq(column, payload.id)
        .maybeSingle();
      if (selErr) throw selErr;
      if (existing) return null;

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const { error } = await supabase.from('bookmarks').insert({ user_id: userData.user?.id, [column]: payload.id });
      // Corrida real entre duas chamadas concorrentes: a segunda pode
      // colidir com o índice único mesmo depois do SELECT não encontrar
      // nada — tratado como sucesso (o estado desejado, "favoritado", já
      // está satisfeito), nunca propagado como erro de retry.
      if (error && error.code !== '23505') throw error;
    } else {
      const { error } = await supabase.from('bookmarks').delete().eq(column, payload.id);
      if (error) throw error;
    }
    return null;
  });

  // Progresso de leitura (categoria 6): mesma mudança de contrato de toggle
  // -> set explícito, mas o merge do array em si acontece no SERVIDOR
  // (RPC set_section_read, migration sync_reliability_categorias_3_a_7) —
  // nunca um array calculado no cliente a partir de um estado que pode já
  // estar desatualizado (dois dispositivos marcando seções diferentes não
  // podem se sobrescrever, ver docs/SINCRONIZACAO-CONFIAVEL.md).
  registerHandler('reading_progress_set', async (payload: ReadingProgressSetOpPayload) => {
    const { data, error } = await supabase.rpc('set_section_read', {
      p_material_id: payload.compendiumId,
      p_section_id: payload.sectionId,
      p_is_read: payload.isRead,
      p_total_sections: payload.totalSections,
    });
    if (error) throw error;
    return data;
  });

  // Notas (categoria 4): upsert real (single round-trip, atômico) via RPC
  // `upsert_note` (migration sync_reliability_conflict_guards, 07-E2;
  // serialização por advisory lock, conflict_serialization_07e3) em vez do
  // delete+insert original E em vez de um upsert cego "última gravação
  // vence" puro (07-E) — a revisão do 07-E2 confirmou que duas edições
  // concorrentes da MESMA nota em dois dispositivos apagariam uma das duas
  // silenciosamente sem NENHUMA detecção. A RPC recebe o `updated_at` que
  // este dispositivo conhecia como base (StorageService.getNoteBaseVersion)
  // e só aplica um "última gravação vence" quando não há conflito real
  // (o servidor não mudou desde a base conhecida e o texto já é igual).
  // Quando há conflito, a RPC NÃO escreve — devolve a versão do servidor, e
  // as duas versões são fundidas (nunca uma escolhida às cegas) antes de
  // regravar.
  //
  // Bloqueio 07-E3 #3: o código anterior só verificava `conflict` na
  // PRIMEIRA chamada — se a chamada de RETRY (depois do merge) TAMBÉM
  // voltasse com `conflict: true` (ex.: um terceiro dispositivo grava entre
  // a detecção do primeiro conflito e o envio do merge — reproduzido em
  // scripts/_tmp-07e3-client-bug-repro.ts antes desta correção), o código
  // tratava a resposta como sucesso incondicionalmente: salvava o texto
  // fundido localmente e devolvia `retryData` como se o servidor tivesse
  // aceitado, quando na verdade o servidor tinha REJEITADO e ainda guardava
  // o texto do terceiro dispositivo. Corrigido com um laço de até
  // `MAX_NOTE_MERGE_ATTEMPTS` tentativas: cada resposta é verificada da
  // mesma forma (nunca um "só a primeira conta"); o texto fundido é salvo
  // localmente a cada rodada (nunca descarta a edição do usuário, mesmo que
  // a rodada seguinte também conflite); se o limite for atingido sem o
  // servidor aceitar, a operação é rejeitada com um erro `conflict`
  // (permanente, nunca retentado num loop apertado — ver
  // `classifySyncError`/`isRetryable` em syncQueue.ts) em vez de fingir
  // sucesso. O texto mesclado mais recente permanece salvo localmente e
  // visível ao usuário; nada é perdido, mas a operação fica marcada como
  // pendente/conflituosa na fila até o usuário revisar/reenviar.
  registerHandler('note_upsert', async (payload: NoteUpsertOpPayload) => {
    const MAX_NOTE_MERGE_ATTEMPTS = 3;
    const column = await resolveNoteColumn(payload.targetId);

    let textToSend = payload.noteText;
    let baseUpdatedAt = StorageService.getNoteBaseVersion(payload.targetId);

    for (let attempt = 1; attempt <= MAX_NOTE_MERGE_ATTEMPTS; attempt++) {
      const { data, error } = await supabase.rpc('upsert_note', {
        ...noteRpcArgs(column, payload.targetId),
        p_note_text: textToSend,
        p_base_updated_at: baseUpdatedAt,
      });
      if (error) throw error;

      if (!data?.conflict) {
        // Aceito pelo servidor — grava exatamente o texto que foi aceito
        // (pode já incluir fusões de rodadas anteriores deste mesmo laço).
        StorageService.saveNote(payload.targetId, textToSend);
        if (data?.updated_at) StorageService.setNoteBaseVersion(payload.targetId, data.updated_at as string);
        return data;
      }

      // Conflito (nesta rodada, seja a primeira ou uma de retry): funde e
      // tenta de novo com a base atualizada — nunca descarta o texto local
      // nem o do servidor, e já grava o resultado fundido localmente antes
      // de saber se a PRÓXIMA rodada vai ser aceita (o usuário nunca vê um
      // texto mais "antigo" que o que já foi fundido nesta chamada).
      textToSend = mergeConflictingNoteText(textToSend, data.server_text as string);
      baseUpdatedAt = data.server_updated_at as string;
      StorageService.saveNote(payload.targetId, textToSend);
      // A base guardada só avança quando o servidor ACEITA (acima). Avançá-la
      // aqui, com o texto do outro dispositivo ainda fora do servidor, fazia a
      // próxima edição deste dispositivo — enfileirada antes desta fusão, sem
      // o texto do outro — passar sem conflito e apagá-lo (45-E, revisão do
      // #86). Com a base antiga, ela conflita e é fundida também.
    }

    // Limite de tentativas de merge esgotado: a concorrência persistiu além
    // do orçamento de retry. Nunca marcar sucesso — a edição do usuário
    // (já fundida com todas as versões vistas) permanece salva localmente
    // (linhas acima), mas a operação fica visivelmente pendente/conflituosa
    // na fila (estado 'failed', kind 'conflict', não retentada
    // automaticamente em loop) até o usuário revisar e reenviar.
    const err: Error & { code?: string } = new Error(
      `nota: conflito de sincronização persistente após ${MAX_NOTE_MERGE_ATTEMPTS} tentativas de fusão`
    );
    err.code = 'SYNC_CONFLICT';
    throw err;
  });

  // Caderno de erros (categoria 3): só atualiza resolved/user_notes por id
  // (a linha em si é sempre derivada de submit_question_attempt — nunca
  // criada pelo cliente). Update por id é idempotente por natureza (reenviar
  // os mesmos valores tem o mesmo efeito) — só precisava de retry/visibilidade,
  // não de um `client_op_id` novo.
  registerHandler('error_notebook_update', async (payload: ErrorNotebookUpdateOpPayload) => {
    const { error } = await supabase
      .from('error_notebook')
      .update({ resolved: payload.errorItem.resolved, user_notes: payload.errorItem.userNotes })
      .eq('id', payload.errorItem.id);
    if (error) throw error;
    return null;
  });

  // Simulados (categoria 7): RPC transacional (save_simulado_session) — tudo
  // ou nada, idempotente por construção (substituição total do mesmo
  // payload sempre chega ao mesmo estado final), ver migration
  // sync_reliability_categorias_3_a_7.
  registerHandler('simulado_save', async (payload: SimuladoSaveOpPayload) => {
    const session = payload.session;
    const answerEntries = Object.entries(session.answers);

    // O estado local guarda a letra (A-E), a RPC espera o uuid real da
    // alternativa — resolvido aqui (mesma consulta que
    // SupabaseSimuladosRepository já fazia antes desta entrega).
    let optionIdByQuestionAndLetter = new Map<string, string>();
    if (answerEntries.length > 0) {
      const questionIds = answerEntries.map(([qid]) => qid);
      const { data: options, error: optErr } = await supabase
        .from('question_options')
        .select('id, question_id, letter')
        .in('question_id', questionIds);
      if (optErr) throw optErr;
      optionIdByQuestionAndLetter = new Map(
        (options ?? []).map((o) => [`${o.question_id}:${o.letter}`, o.id])
      );
    }

    const answers = answerEntries
      .map(([questionId, ans]) => ({
        question_id: questionId,
        selected_option_id: optionIdByQuestionAndLetter.get(`${questionId}:${ans.selectedOption}`),
        time_spent_seconds: ans.timeSpent,
        client_op_id: ans.clientOpId ?? null,
      }))
      .filter((a) => !!a.selected_option_id);

    const { error } = await supabase.rpc('save_simulado_session', {
      p_session: {
        id: session.id,
        name: session.config?.name,
        config: session.config,
        started_at: session.startedAt,
        completed_at: session.completedAt ?? null,
        total_time_seconds: session.totalTimeSeconds,
        questions: session.questionIds.map((qid, i) => ({ question_id: qid, position: i })),
        answers,
      },
    });
    if (error) throw error;
    const { data: saved, error: readError } = await supabase
      .from('simulations')
      .select('score')
      .eq('id', session.id)
      .single();
    if (readError) throw readError;
    const totalCount = session.questionIds.length;
    const score = Number(saved.score ?? 0);
    const result = {
      score,
      correctCount: Math.round((score / 100) * totalCount),
      totalCount,
    };
    StorageService.saveSimuladoSession({ ...session, score });
    return result;
  });

  // Reações (categoria 8): estado desejado explícito, sempre um "set" —
  // `reaction: null` remove. Idempotente por construção: reenviar 'up'/'down'
  // é sempre um upsert por `unique (user_id, question_id)` (índice ÚNICO
  // COMUM, não parcial — ver AGENTS.md armadilha #14, por isso o
  // `onConflict` do PostgREST funciona aqui sem precisar de RPC); reenviar
  // `null` é sempre um DELETE, que não é erro mesmo quando já não há linha
  // para remover. Troca determinística (up->down/down->up) e concorrência:
  // não há mesclagem de texto envolvida (é um único enum por usuário/
  // questão, não dado colaborativo), então a regra de desempate é a mesma
  // de um "set" comum — a última escrita a ser efetivamente aplicada no
  // servidor vence; como cada dispositivo só enfileira o PRÓPRIO clique (o
  // valor já decidido antes de qualquer chamada de rede, nunca um toggle
  // calculado a partir de uma leitura desatualizada), isso é seguro mesmo
  // sob retry/reordenação: nenhum clique é "perdido" silenciosamente, o pior
  // caso é o valor final refletir o último clique a chegar ao servidor, que
  // é o comportamento esperado de "última ação vence" para um botão
  // like/dislike (bem diferente do risco de perda de texto livre em notas).
  registerHandler('reaction_set', async (payload: ReactionSetOpPayload) => {
    if (payload.reaction === null) {
      const { error } = await supabase.from('question_reactions').delete().eq('question_id', payload.questionId);
      if (error) throw error;
      return null;
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    const { error } = await supabase
      .from('question_reactions')
      .upsert(
        { user_id: userData.user?.id, question_id: payload.questionId, reaction: payload.reaction },
        { onConflict: 'user_id,question_id' }
      );
    if (error) throw error;
    return null;
  });

  // Feedback (categoria 9, envio): RPC transacional `submit_feedback`
  // (migration 20260910120000_sync_reliability_categorias_8_9.sql, Prompt
  // 07-F2). Reenviar o MESMO `client_op_id` (= o mesmo `feedback.id`, gerado
  // uma única vez no componente antes do primeiro envio) após perda de
  // resposta (servidor aplicou, cliente não recebeu confirmação) é aceito
  // como replay SÓ quando a linha existente pertence ao mesmo usuário e tem
  // o mesmo conteúdo — a RPC verifica isso no servidor (nunca no cliente,
  // que não pode ser confiável para essa decisão) e levanta uma exceção
  // permanente (SQLSTATE P0001, classificada como 'validation' por
  // classifySyncError em syncQueue.ts — nunca retentada em loop) se a
  // colisão de id for de dono ou conteúdo diferente. Dois relatos
  // DELIBERADAMENTE distintos (mesmo com texto igual) sempre têm `id`s
  // diferentes, então nunca são deduplicados por engano: a deduplicação é
  // só por `id`, nunca por conteúdo. Nunca loga `description`/`title`
  // (texto livre do usuário) — só o resultado da chamada, como todo outro
  // handler deste arquivo.
  registerHandler('feedback_submit', async (payload: FeedbackSubmitOpPayload) => {
    const { error } = await supabase.rpc('submit_feedback', {
      p_id: payload.feedback.id,
      p_type: payload.feedback.type,
      p_title: payload.feedback.title,
      p_description: payload.feedback.description,
      p_question_id: payload.feedback.questionId ?? null,
      p_material_id: payload.feedback.materialId ?? null,
    });
    if (error) throw error;
    return null;
  });
}
