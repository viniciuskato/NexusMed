// ============================================================================
// legacyRecovery — recuperação de progresso local anterior a esta entrega
// (Prompt 07-A, Etapa 5; reconciliação por conteúdo corrigida no 07-B;
// pendências do ledger, comparação por horário e experiência de ambiguidade
// corrigidas no 07-C — ver docs/SINCRONIZACAO-CONFIAVEL.md).
//
// Roda uma vez por usuário a cada login (chamado por StorageService.setActiveUser),
// e faz uma "simulação" antes de enviar: primeiro lê o que já existe no
// servidor, calcula o que é só local, e só então enfileira (nunca insere
// diretamente) — a fila (syncQueue) trata o resto: idempotência, retry,
// estado visível. Nunca apaga localStorage.
//
// --- Ledger apontando para operação que já saiu da fila (Problema 1) ------
// O ledger (`pendingAnswerOps`, question_id -> client_op_id) marca uma
// operação como "decidimos enfileirar, ainda não confirmamos" até vê-la
// `synced` na fila. Mas a fila poda operações sincronizadas antigas
// (`pruneSynced`, ver syncQueue.ts) para não crescer sem limite — se isso
// acontecer ANTES de um login confirmar o `synced` no ledger, a entrada em
// `pendingAnswerOps` passa a apontar para um id que não existe mais na fila
// local. Como `question_attempts.client_op_id` é uma coluna real (migration
// `sync_reliability`), o servidor ainda é uma fonte de verdade consultável
// por esse id: comparamos o estado do servidor, não assumimos nada.
//   1. Existe no servidor sob o mesmo client_op_id -> confirma recuperado.
//   2. Não existe (nem na fila, nem no servidor) -> recria a operação com o
//      MESMO client_op_id (nunca um novo) e o payload local preservado — a
//      idempotência do RPC por (user_id, client_op_id) garante que isso não
//      duplica se, por algum motivo, ela já tiver sido aplicada.
//   3. Não foi possível determinar (consulta falhou, ex.: rede indisponível
//      agora) -> preserva o dado e a pendência exatamente como está, tenta
//      de novo no próximo login. Nunca gera um client_op_id novo neste caso.
//
// --- Janela de horário como evidência auxiliar, não prova (Problema 3) ----
// `answered_at` remoto é o instante em que o SERVIDOR recebeu a operação — a
// resposta pode ter ficado offline por horas/dias antes disso. Uma diferença
// grande entre o horário local e o remoto NÃO prova que são tentativas
// distintas. `compareAttempt` só usa horário quando o restante da tentativa
// (alternativa + modo + estratégia) não é suficiente por si só para decidir:
//   - alternativa diferente -> nunca é a mesma tentativa (`no`).
//   - alternativa igual E modo/estratégia disponíveis nos dois lados E iguais
//     -> mesma tentativa (`match`), qualquer que seja a diferença de horário.
//   - alternativa igual mas modo/estratégia ausentes ou não comparáveis
//     (dado histórico anterior à captura desses campos) -> usa horário como
//     evidência auxiliar (janela de tolerância); fora da janela, ou sem
//     horário válido nos dois lados, o resultado é `uncertain`, nunca `no`.
// Limite desta comparação: sem alternativa+modo+estratégia coincidindo, a
// única forma de ter certeza é o próprio usuário confirmar — daí a
// experiência de ambiguidade abaixo, não uma heurística mais "inteligente".
//
// --- Ambiguidade visível ao usuário (Problema 2) ---------------------------
// Um caso `uncertain` (tentativas remotas existem para a questão, mas nenhuma
// bate com segurança) fica registrado em `ledger.ambiguous` (persistente,
// não só `console.warn`) até o usuário decidir. Três decisões possíveis,
// nenhuma apaga o registro local original:
//   - `resolveAmbiguousSubmitAsNew`: envia como nova tentativa usando um
//     `client_op_id` ESTÁVEL gerado no momento da detecção (guardado no
//     ledger) — reabrir o diálogo ou recarregar a página nunca gera outro id
//     para a mesma pendência, então reenviar não duplica.
//   - `resolveAmbiguousKeepLocalOnly`: marca esta resposta local específica
//     (por questionId + timestamp exato) como "não enfileirar" — nunca
//     apaga o dado, só para de sinalizar A MESMA resposta como pendência. Se
//     o usuário responder a questão de novo depois (timestamp novo), a
//     comparação roda de novo do zero.
//   - Adiar: não é uma função própria — não decidir é simplesmente não
//     chamar nenhuma das duas acima; a pendência continua em
//     `ledger.ambiguous` e volta a aparecer no próximo login/abertura do
//     painel, sem duplicar a entrada.
//
// Limitação conhecida: só cobre as categorias já implementadas nesta etapa
// (tentativas de questão e flashcards custom com id compatível). Demais
// categorias permanecem sem recuperação automática — ver
// docs/SINCRONIZACAO-CONFIAVEL.md, Etapa 5.
// ============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { StorageService } from './storage';
import { enqueue, enqueueBefore, getOps, generateClientOpId, type SyncOp } from './syncQueue';
import { QuestionAnswerRecord } from '../types';
import { fetchAllRows } from '../repositories/supabasePaging';

export interface AmbiguousRecoveryEntry {
  questionId: string;
  /** Estável assim que gerado — usado por `resolveAmbiguousSubmitAsNew`, nunca regenerado enquanto a pendência existir. */
  clientOpId?: string;
  detectedAt: string;
  /** Enunciado da questão, só para exibição amigável — nunca IDs técnicos na UI. */
  questionStem: string | null;
  local: QuestionAnswerRecord;
  remoteCount: number;
}

interface RecoveryLedger {
  answers: string[]; // question_id confirmado no servidor — nunca mais reexaminado
  flashcards: string[];
  pendingAnswerOps: Record<string, string>; // question_id -> client_op_id já enfileirado, ainda não confirmado
  ambiguous: Record<string, AmbiguousRecoveryEntry>; // question_id -> pendência aguardando decisão do usuário
  keptLocalOnly: Record<string, string>; // question_id -> timestamp local exato que o usuário escolheu manter só neste dispositivo
}

function ledgerKey(uid: string): string {
  return `synapse_${uid}_sync_legacy_recovered_v1`;
}

function loadLedger(uid: string): RecoveryLedger {
  try {
    const raw = localStorage.getItem(ledgerKey(uid));
    if (!raw) return { answers: [], flashcards: [], pendingAnswerOps: {}, ambiguous: {}, keptLocalOnly: {} };
    const parsed = JSON.parse(raw);
    return {
      answers: parsed.answers ?? [],
      flashcards: parsed.flashcards ?? [],
      pendingAnswerOps: parsed.pendingAnswerOps ?? {},
      ambiguous: parsed.ambiguous ?? {},
      keptLocalOnly: parsed.keptLocalOnly ?? {},
    };
  } catch {
    return { answers: [], flashcards: [], pendingAnswerOps: {}, ambiguous: {}, keptLocalOnly: {} };
  }
}

const listeners = new Map<string, Set<() => void>>();

function notify(uid: string): void {
  listeners.get(uid)?.forEach((fn) => fn());
}

function saveLedger(uid: string, ledger: RecoveryLedger): void {
  try {
    localStorage.setItem(ledgerKey(uid), JSON.stringify(ledger));
  } catch (e) {
    console.error('legacy-recovery: falha ao gravar ledger de recuperação', e);
  }
  notify(uid);
}

/** Assina mudanças nas pendências ambíguas deste usuário (nova detecção ou resolução) — usado pela UI. */
export function subscribeAmbiguousRecoveries(uid: string, listener: () => void): () => void {
  if (!listeners.has(uid)) listeners.set(uid, new Set());
  listeners.get(uid)!.add(listener);
  return () => listeners.get(uid)?.delete(listener);
}

/** Pendências ambíguas visíveis ao usuário agora, mais recentes primeiro. */
export function getAmbiguousRecoveries(uid: string): AmbiguousRecoveryEntry[] {
  return Object.values(loadLedger(uid).ambiguous).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

/** "Enviar como nova tentativa": entra no histórico normalmente, client_op_id estável evita duplicar em reenvios/reload. */
export function resolveAmbiguousSubmitAsNew(uid: string, questionId: string): void {
  const ledger = loadLedger(uid);
  const entry = ledger.ambiguous[questionId];
  if (!entry) return;

  const op = enqueue(
    uid,
    'question_attempt',
    {
      questionId,
      selectedOption: entry.local.selectedOption,
      timeSpentSeconds: entry.local.timeSpentSeconds ?? 0,
      errorReason: entry.local.errorReason,
      userNotes: entry.local.userNotes,
      answerMode: entry.local.answerMode,
      answerStrategy: entry.local.answerStrategy,
    },
    entry.clientOpId
  );

  delete ledger.ambiguous[questionId];
  if (op.id) {
    // Mesmo tratamento do fluxo normal (Problema 1): a fila cuida do resto,
    // login seguinte só consulta o estado real desta operação.
    ledger.pendingAnswerOps[questionId] = op.id;
  }
  saveLedger(uid, ledger);
}

/** "Manter somente neste dispositivo": nunca envia, nunca apaga o dado local — só para de sinalizar esta resposta específica como pendência. */
export function resolveAmbiguousKeepLocalOnly(uid: string, questionId: string): void {
  const ledger = loadLedger(uid);
  const entry = ledger.ambiguous[questionId];
  if (!entry) return;
  ledger.keptLocalOnly[questionId] = entry.local.timestamp;
  delete ledger.ambiguous[questionId];
  saveLedger(uid, ledger);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tolerância de horário: só usada como evidência AUXILIAR quando modo e
// estratégia de resposta não são suficientes por si só para decidir (ver
// cabeçalho do arquivo). Nunca é a única prova de que duas tentativas com a
// MESMA alternativa e MESMO modo/estratégia são distintas.
const ATTEMPT_MATCH_WINDOW_MS = 5 * 60_000;

interface RemoteAttemptRow {
  question_id: string;
  answered_at: string;
  answer_mode: QuestionAnswerRecord['answerMode'] | null;
  answer_strategy: QuestionAnswerRecord['answerStrategy'] | null;
  question_options: { letter: string } | { letter: string }[] | null;
}

function extractLetter(joined: RemoteAttemptRow['question_options']): string | null {
  if (!joined) return null;
  if (Array.isArray(joined)) return joined[0]?.letter ?? null;
  return joined.letter ?? null;
}

type AttemptComparison = 'match' | 'no' | 'uncertain';

function compareAttempt(local: QuestionAnswerRecord, remote: RemoteAttemptRow): AttemptComparison {
  const remoteLetter = extractLetter(remote.question_options);
  if (!remoteLetter || remoteLetter !== local.selectedOption) return 'no'; // alternativa diferente: nunca é a mesma tentativa

  const modeComparable = Boolean(local.answerMode && remote.answer_mode);
  const strategyComparable = Boolean(local.answerStrategy && remote.answer_strategy);

  if (modeComparable && local.answerMode !== remote.answer_mode) return 'no';
  if (strategyComparable && local.answerStrategy !== remote.answer_strategy) return 'no';

  if (modeComparable && strategyComparable) return 'match'; // conteúdo idêntico nos dois lados — horário é só evidência auxiliar, não decide nada aqui

  // Modo e/ou estratégia não comparáveis (dado histórico sem esses campos) —
  // horário entra como evidência auxiliar, nunca como prova isolada de
  // distinção: dentro da janela, aceitamos como a mesma tentativa; fora
  // dela (ou sem horário válido nos dois lados), a comparação é inconclusiva
  // e cabe ao usuário decidir, não a um limite de tempo arbitrário.
  const localTs = Date.parse(local.timestamp);
  const remoteTs = Date.parse(remote.answered_at);
  if (Number.isFinite(localTs) && Number.isFinite(remoteTs) && Math.abs(localTs - remoteTs) <= ATTEMPT_MATCH_WINDOW_MS) {
    return 'match';
  }
  return 'uncertain';
}

async function fetchQuestionStem(questionId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('questions').select('question_stem').eq('id', questionId).maybeSingle();
    return (data as { question_stem?: string } | null)?.question_stem ?? null;
  } catch {
    return null; // melhor exibir sem enunciado do que falhar a detecção da pendência por isso
  }
}

// Uma execução por UID de cada vez (45-E, AUD-28): o boot chama
// `setActiveUser` ao menos duas vezes (getSession e INITIAL_SESSION), e duas
// execuções concorrentes viam o servidor sem a linha e enfileiravam a mesma
// resposta duas vezes, com `client_op_id` diferentes.
const inFlight = new Map<string, Promise<void>>();

export function recoverLegacyLocalProgress(uid: string): Promise<void> {
  const running = inFlight.get(uid);
  if (running) return running;
  const run = runRecovery(uid).finally(() => inFlight.delete(uid));
  inFlight.set(uid, run);
  return run;
}

/** Questões com tentativa ainda não confirmada na fila (ex.: respondida offline). */
function questionsWithQueuedAttempt(ops: SyncOp[]): Set<string> {
  const ids = new Set<string>();
  for (const o of ops) {
    const questionId = (o.payload as { questionId?: unknown } | null)?.questionId;
    if (o.category === 'question_attempt' && o.state !== 'synced' && typeof questionId === 'string') ids.add(questionId);
  }
  return ids;
}

// Operações que criam, substituem ou apagam o card. Revisão e SRS não entram:
// levam só o id e dependem de o card já existir no servidor (45-E, revisão do
// 1af8cf3 — contá-las fazia um card que só existe no aparelho nunca subir).
const CARD_WRITES = new Set(['flashcard_upsert', 'flashcard_create_from_question', 'flashcard_delete']);
const CARD_DEPENDENTS = new Set(['flashcard_review', 'flashcard_srs_upsert']);

function cardIdOf(op: SyncOp): string | null {
  const p = op.payload as { flashcard?: { id?: unknown }; id?: unknown; flashcardId?: unknown } | null;
  const id = p?.flashcard?.id ?? p?.flashcardId ?? p?.id;
  return typeof id === 'string' ? id : null;
}

/** Cards com criação, edição ou exclusão ainda não confirmada na fila (ex.: criado offline). */
function flashcardsWithQueuedWrites(ops: SyncOp[]): Set<string> {
  const ids = new Set<string>();
  for (const o of ops) {
    if (o.state === 'synced' || !CARD_WRITES.has(o.category)) continue;
    const id = cardIdOf(o);
    if (id) ids.add(id);
  }
  return ids;
}

async function runRecovery(uid: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    const ledger = loadLedger(uid);
    let ledgerChanged = false;

    // --- Tentativas de questão respondidas offline/antes desta entrega ---
    const localAnswers = StorageService.getAnswers();
    const currentOps = getOps(uid);
    // Lida uma vez (não uma por resposta: com milhares, o login travava).
    // Antes de cada enfileiramento a fila é relida, porque entre os `await`
    // desta função o app pode ter enfileirado uma resposta nova.
    const queuedAttempts = questionsWithQueuedAttempt(currentOps);
    const queuedNow = (questionId: string) =>
      queuedAttempts.has(questionId) || questionsWithQueuedAttempt(getOps(uid)).has(questionId);

    for (const questionId of Object.keys(localAnswers)) {
      if (ledger.answers.includes(questionId)) continue; // já confirmado no servidor, nunca reexaminar
      const record = localAnswers[questionId];

      const pendingOpId = ledger.pendingAnswerOps[questionId];
      if (pendingOpId) {
        // Já decidimos enfileirar isto numa sessão anterior. Primeiro
        // tentamos achar a operação na fila local — é o caminho comum.
        const op = currentOps.find((o) => o.id === pendingOpId);
        if (op) {
          if (op.state === 'synced') {
            ledger.answers.push(questionId);
            delete ledger.pendingAnswerOps[questionId];
            ledgerChanged = true;
          }
          // 'pending'/'syncing'/'failed': nada a fazer — a fila já cuida de
          // retry (se retentável) ou já expõe a falha permanente na UI; não
          // reexaminamos nem reenfileiramos com id novo.
          continue;
        }

        // Problema 1: a operação não está mais na fila local (foi podada
        // depois de sincronizar, ou nunca chegou a persistir de fato) — o
        // client_op_id em si ainda é verificável no servidor
        // (question_attempts.client_op_id, coluna real desde a migration
        // sync_reliability). Nunca assumimos silenciosamente.
        const { data: existing, error: lookupError } = await supabase
          .from('question_attempts')
          .select('id')
          .eq('client_op_id', pendingOpId)
          .maybeSingle();

        if (lookupError) {
          // Não foi possível determinar agora (ex.: rede indisponível neste
          // login) — preserva o dado e a pendência exatamente como estão;
          // tenta de novo no próximo login. Nunca gera client_op_id novo.
          continue;
        }

        if (existing) {
          // Confirmado no servidor sob o mesmo client_op_id — recuperado.
          ledger.answers.push(questionId);
          delete ledger.pendingAnswerOps[questionId];
          ledgerChanged = true;
          continue;
        }

        // Não está na fila local nem no servidor: recria a operação com o
        // MESMO client_op_id (nunca um id novo) e o payload local
        // preservado. Se por algum motivo ela já tivesse sido aplicada sob
        // outra circunstância, a idempotência do RPC por
        // (user_id, client_op_id) garante que isto não duplica.
        enqueue(
          uid,
          'question_attempt',
          {
            questionId,
            selectedOption: record.selectedOption,
            timeSpentSeconds: record.timeSpentSeconds ?? 0,
            errorReason: record.errorReason,
            userNotes: record.userNotes,
            answerMode: record.answerMode,
            answerStrategy: record.answerStrategy,
          },
          pendingOpId
        );
        continue;
      }

      // Resposta que a própria fila ainda vai enviar não é "progresso legado":
      // o servidor ainda não tem a linha porque a operação não saiu, e
      // enfileirá-la de novo criaria uma segunda tentativa (AUD-28). A fila
      // cuida dela; o próximo login a encontra no servidor.
      if (queuedAttempts.has(questionId)) continue;

      const { data: remoteRows, error } = await supabase
        .from('question_attempts')
        .select('question_id, answered_at, answer_mode, answer_strategy, question_options(letter)')
        .eq('question_id', questionId);
      if (error) continue; // não decide nem marca ledger se a consulta falhar — tenta de novo no próximo login

      const remote = (remoteRows ?? []) as unknown as RemoteAttemptRow[];

      if (remote.length === 0) {
        // Nenhuma tentativa remota para esta questão — claramente não sincronizada.
        if (queuedNow(questionId)) continue;
        const op = enqueue(uid, 'question_attempt', {
          questionId,
          selectedOption: record.selectedOption,
          timeSpentSeconds: record.timeSpentSeconds ?? 0,
          errorReason: record.errorReason,
          userNotes: record.userNotes,
          answerMode: record.answerMode,
          answerStrategy: record.answerStrategy,
        });
        if (op.id) {
          // Registra a operação estável ANTES de qualquer outra iteração —
          // uma interrupção depois disto retoma pelo ramo `pendingOpId`
          // acima, sem gerar client_op_id novo.
          ledger.pendingAnswerOps[questionId] = op.id;
          ledgerChanged = true;
          saveLedger(uid, ledger);
        }
        continue;
      }

      const comparisons = remote.map((r) => compareAttempt(record, r));

      if (comparisons.includes('match')) {
        // Já existe no servidor uma tentativa equivalente — marca recuperada, não duplica.
        ledger.answers.push(questionId);
        delete ledger.ambiguous[questionId];
        ledgerChanged = true;
        continue;
      }

      if (!comparisons.includes('uncertain')) {
        // Todas as tentativas remotas divergem claramente (alternativa
        // diferente, ou modo/estratégia incompatíveis) — esta resposta local
        // é distinta e legítima, não é ambígua. Enfileira normalmente.
        if (queuedNow(questionId)) continue;
        const op = enqueue(uid, 'question_attempt', {
          questionId,
          selectedOption: record.selectedOption,
          timeSpentSeconds: record.timeSpentSeconds ?? 0,
          errorReason: record.errorReason,
          userNotes: record.userNotes,
          answerMode: record.answerMode,
          answerStrategy: record.answerStrategy,
        });
        if (op.id) {
          ledger.pendingAnswerOps[questionId] = op.id;
          ledgerChanged = true;
          saveLedger(uid, ledger);
        }
        continue;
      }

      // Ambíguo: pelo menos uma tentativa remota é inconclusiva e nenhuma é
      // um match seguro. Não decidimos por engano.
      if (ledger.keptLocalOnly[questionId] === record.timestamp) {
        continue; // usuário já escolheu manter só local para esta resposta exata
      }
      const existingEntry = ledger.ambiguous[questionId];
      if (existingEntry && existingEntry.local.timestamp === record.timestamp) {
        continue; // já sinalizada, aguardando decisão do usuário — não duplica a pendência nem gera outro client_op_id
      }

      let stableClientOpId: string | undefined;
      try {
        stableClientOpId = generateClientOpId();
      } catch {
        stableClientOpId = undefined; // caso raríssimo: `resolveAmbiguousSubmitAsNew` deixa o `enqueue` gerar o id na hora da decisão
      }
      const questionStem = await fetchQuestionStem(questionId);

      ledger.ambiguous[questionId] = {
        questionId,
        clientOpId: stableClientOpId,
        detectedAt: new Date().toISOString(),
        questionStem,
        local: record,
        remoteCount: remote.length,
      };
      ledgerChanged = true;
    }

    // --- Flashcards personalizados criados offline/antes desta entrega ---
    // Só cards com id em formato uuid (o schema exige); cards antigos criados
    // pelo LocalStorageFlashcardsRepository com id não-uuid não têm como ser
    // recuperados automaticamente sem duplicar sob um novo id — ficam
    // documentados como limitação, não descartados do localStorage.
    const localCustomCards = StorageService.getFlashcards().filter((f) => f.isCustom && UUID_RE.test(f.id));
    // Card com criação/edição/exclusão ainda na fila (criado offline) não é
    // "legado": a fila o envia, na ordem. Um upsert novo com a cópia local
    // entraria depois dos SRS pendentes e regravaria o card com valores
    // antigos (45-E, revisão do f3bbf3e). O próximo login o acha no servidor.
    const queuedCards = flashcardsWithQueuedWrites(getOps(uid));
    const pendingCards = localCustomCards.filter((f) => !ledger.flashcards.includes(f.id) && !queuedCards.has(f.id));

    if (pendingCards.length > 0) {
      // Todos os ids (45-C): com a lista cortada em 1000, um card que já está
      // no servidor parecia ausente e era reenviado por cima da versão remota.
      const remoteCards = await fetchAllRows<{ id: string }>((from, to) =>
        supabase.from('flashcards').select('id').order('id', { ascending: true }).range(from, to)
      );

      const remoteIds = new Set(remoteCards.map((r) => r.id));
      const queuedAfterFetch = flashcardsWithQueuedWrites(getOps(uid)); // o app pode ter enfileirado durante a consulta
      for (const card of pendingCards) {
        if (queuedAfterFetch.has(card.id)) continue;
        if (!remoteIds.has(card.id)) {
          // Antes da revisão/SRS deste card que já estejam na fila: eles só
          // passam com o card no servidor.
          enqueueBefore(uid, 'flashcard_upsert', { flashcard: card }, (o) => CARD_DEPENDENTS.has(o.category) && cardIdOf(o) === card.id);
        }
        ledger.flashcards.push(card.id);
        ledgerChanged = true;
      }
    }

    if (ledgerChanged) saveLedger(uid, ledger);
  } catch (err) {
    console.warn('legacy-recovery: falha ao verificar progresso local pendente (tentará no próximo login)', err);
  }
}
