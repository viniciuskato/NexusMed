// ============================================================================
// syncQueue — fila persistente de operações pendentes de sincronização
// ============================================================================
//
// Substitui o padrão anterior "grava local, tenta espelhar no Supabase,
// engole erro em catch{}" (ver AGENTS.md, armadilha sobre Resilient*Repository)
// por uma fila com estado visível, retentativa com backoff e classificação de
// erro. Cada operação carrega um `clientOpId` (uuid) que o servidor usa como
// chave de idempotência — reenviar a mesma operação (retry, reload com fila
// pendente, reconciliação) nunca duplica o efeito no banco.
//
// Escopo desta entrega (Prompt 07-A): infraestrutura compartilhada + uso
// completo nas categorias de maior risco (tentativas de questão/XP,
// flashcards/SRS). Outras categorias (notas, favoritos, progresso de leitura,
// simulados, reações, feedback) ainda usam o padrão antigo — ver
// docs/SINCRONIZACAO-CONFIAVEL.md para o plano de migração.
//
// Isolamento por usuário: a fila é uma chave de localStorage por UID
// (`synapse_<uid>_sync_queue_v1`), no mesmo padrão de isolamento já usado por
// StorageService. Isso já impede um item da fila de A ser confundido com um
// item da fila de B (chaves de localStorage diferentes). O risco real
// corrigido em 07-B é outro: o cliente Supabase é um único objeto global
// autenticado com UMA sessão por vez — mesmo que a fila de A esteja
// corretamente isolada em localStorage, `flush(A)` chamando os handlers
// enquanto a sessão ativa no navegador é a de B enviaria a operação de A
// autenticada COMO B (RLS grava sob `auth.uid()` = B). Por isso `runFlush`
// verifica a sessão ativa do Supabase antes de cada operação (ver
// `getActiveSupabaseUserId`) — só processa a fila de um usuário quando ele é
// também o usuário autenticado no momento, e eventos periódicos
// (`flushAllKnown`) só tocam a fila do usuário ativo, nunca varrem todos os
// UIDs conhecidos indiscriminadamente.
// ============================================================================

import { supabase } from '../lib/supabaseClient';

export type SyncOpState = 'pending' | 'syncing' | 'synced' | 'failed';

export type SyncErrorKind = 'network' | 'auth' | 'permission' | 'validation' | 'schema' | 'crypto_unavailable' | 'conflict' | 'unknown';

export interface SyncOp<TPayload = unknown> {
  // Identidade da entrada local. Em geral nasce igual a `clientOpId`, mas
  // precisa ser diferente quando a mesma operação idempotente é enfileirada
  // outra vez enquanto a anterior ainda está retida no histórico local.
  id: string;
  // Chave de idempotência enviada ao servidor. Fica `undefined` quando
  // nenhuma fonte criptográfica estava disponível no momento do enqueue —
  // nesse caso `id` é um identificador local (nunca enviado ao servidor) e
  // `runFlush` tenta gerar `clientOpId` de novo a cada flush, antes de
  // chamar o handler (Problema 4 do Prompt 07-C: falha de geração de UUID
  // nunca impede a operação de existir na fila nem de ser retentada).
  clientOpId?: string;
  userId: string;
  category: string;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
  state: SyncOpState;
  attempts: number;
  nextRetryAt?: string;
  lastError?: { kind: SyncErrorKind; message: string };
  result?: unknown; // último resultado bem-sucedido do servidor (para UI otimista convergir)
}

export interface SyncQueueSummary {
  pending: number;
  syncing: number;
  failed: number;
  failedNeedsLogin: boolean;
  failedNeedsSupport: number;
  synced: number;
  status: 'synced' | 'pending' | 'syncing' | 'error';
}

// O payload vem da fila persistida (JSON), sem tipo em tempo de execução;
// cada handler declara o próprio formato via `registerHandler<P>`.
type Handler = (payload: unknown, clientOpId: string, ctx: SyncHandlerContext) => Promise<unknown>;

/**
 * O que o handler pode fazer na fila além de enviar a própria operação.
 * `updateNewer` aplica `fn` ao payload das operações MAIS NOVAS do mesmo alvo
 * que ainda não saíram e devolve o payload da mais nova (ou `null` se não há
 * nenhuma). Usado pela nota: quando o envio funde o texto de outro
 * dispositivo, a edição que o estudante fez depois (já na fila, sem esse
 * texto) recebe a mesma fusão — senão ela sairia em seguida e o apagaria
 * (45-E, revisão do f3bbf3e).
 */
export interface SyncHandlerContext {
  updateNewer<P>(fn: (payload: P) => P): P | null;
}

const MAX_RETRYABLE_ATTEMPTS_DEFAULT = 8;
const SYNCED_RETENTION = 30; // mantém só as últimas N ops sincronizadas, para não crescer sem limite
const BASE_BACKOFF_MS_DEFAULT = 15_000;
const MAX_BACKOFF_MS = 10 * 60_000;

// ----------------------------------------------------------------------------
// Override de backoff SÓ PARA TESTE (Prompt 07-C2, cenário "máximo de
// tentativas esgotado"). Sem instrumentação, provar esse cenário exigiria
// esperar ~30min reais de backoff exponencial real. `import.meta.env.DEV`
// garante que isto nunca tem efeito em produção (build de produção usa
// import.meta.env.DEV = false, morto por tree-shaking — confirmado com
// `npm run build`, ver docs/SINCRONIZACAO-CONFIAVEL.md). Nunca chamado fora
// de teste: nenhum código de produção importa esta função.
// ----------------------------------------------------------------------------
let testBackoffOverrideMs: number | null = null;
let testMaxAttemptsOverride: number | null = null;
export function __setTestBackoffOverride(baseMs: number | null, maxAttempts: number | null = null): void {
  if (!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) return;
  testBackoffOverrideMs = baseMs;
  testMaxAttemptsOverride = maxAttempts;
}
function currentBaseBackoffMs(): number {
  return testBackoffOverrideMs ?? BASE_BACKOFF_MS_DEFAULT;
}
function currentMaxRetryableAttempts(): number {
  return testMaxAttemptsOverride ?? MAX_RETRYABLE_ATTEMPTS_DEFAULT;
}

const handlers = new Map<string, Handler>();
const flushPromises = new Map<string, Promise<void>>();
const listeners = new Map<string, Set<() => void>>();
const knownUserIds = new Set<string>();
const enqueueVersions = new Map<string, number>();
let periodicTimerStarted = false;

// ----------------------------------------------------------------------------
// Alvo das operações (45-E, AUD-19). Operação de um alvo nunca chega ao
// servidor antes de uma mais antiga do mesmo alvo: no envio, alvo com operação
// retida (backoff, sem handler) segura as seguintes do mesmo alvo.
//
// `supersedes`: a operação carrega o estado final inteiro do alvo (texto da
// nota, favoritado ou não, sessão de simulado inteira...), então só a mais
// nova importa — ao enfileirar, ela substitui as antigas do mesmo alvo que
// ainda não saíram (`pending`/`failed`; a que está em voo fica).
//
// Flashcard é só serializado, nunca substituído: criar, editar, apagar e
// gravar SRS do mesmo card são operações diferentes (um SRS não pode tomar o
// lugar da criação do card), mas precisam chegar na ordem. Simulado também é
// só serializado: `SimuladoSession` acompanha a gravação pelo id da operação
// (`enqueueAndTryTracked`/`subscribeToResult`), e substituí-la deixaria a nota
// "pendente" para sempre.
//
// Falha permanente (validação, permissão...) de categoria só serializada
// também segura o alvo: um delete de card não pode sair antes da criação que
// falhou, senão o reenvio manual da criação traz o card de volta.
//
// Categorias fora deste mapa (tentativa de questão, revisão de flashcard,
// feedback) são eventos que se somam, sem alvo.
// ----------------------------------------------------------------------------
type Payload = Record<string, unknown>;
const TARGETS: Record<string, { group: string; supersedes: boolean; key: (p: Payload) => unknown[] }> = {
  note_upsert: { group: 'note', supersedes: true, key: (p) => [p.targetId] },
  bookmark_set: { group: 'bookmark', supersedes: true, key: (p) => [p.type, p.id] },
  reading_progress_set: { group: 'reading', supersedes: true, key: (p) => [p.compendiumId, p.sectionId] },
  reaction_set: { group: 'reaction', supersedes: true, key: (p) => [p.questionId] },
  error_notebook_update: { group: 'error_notebook', supersedes: true, key: (p) => [(p.errorItem as Payload | undefined)?.id] },
  simulado_save: { group: 'simulado', supersedes: false, key: (p) => [(p.session as Payload | undefined)?.id] },
  flashcard_upsert: { group: 'flashcard', supersedes: false, key: (p) => [(p.flashcard as Payload | undefined)?.id] },
  flashcard_create_from_question: { group: 'flashcard', supersedes: false, key: (p) => [(p.flashcard as Payload | undefined)?.id] },
  flashcard_delete: { group: 'flashcard', supersedes: false, key: (p) => [p.id] },
  flashcard_srs_upsert: { group: 'flashcard', supersedes: false, key: (p) => [p.flashcardId] },
};

/** Alvo da operação, ou `null` quando não tem — inclusive quando falta parte da chave (nunca "undefined" como alvo comum). */
function targetOf(op: Pick<SyncOp, 'category' | 'payload'>): string | null {
  const spec = TARGETS[op.category];
  if (!spec || !op.payload || typeof op.payload !== 'object') return null;
  const parts = spec.key(op.payload as Payload);
  if (parts.some((part) => (typeof part !== 'string' && typeof part !== 'number') || part === '')) return null;
  return `${spec.group}|${parts.join(':')}`;
}

/** `newer` substitui `older`: mesma categoria de estado final e mesmo alvo. */
function supersedes(newer: Pick<SyncOp, 'category' | 'payload'>, older: SyncOp): boolean {
  if (!TARGETS[newer.category]?.supersedes || newer.category !== older.category) return false;
  const target = targetOf(newer);
  return target !== null && targetOf(older) === target;
}

function queueKey(userId: string): string {
  return `synapse_${userId}_sync_queue_v1`;
}

function loadQueue(userId: string): SyncOp[] {
  try {
    const raw = localStorage.getItem(queueKey(userId));
    return raw ? (JSON.parse(raw) as SyncOp[]) : [];
  } catch (e) {
    console.error('sync-queue: falha ao ler fila local', e);
    return [];
  }
}

function saveQueue(userId: string, ops: SyncOp[]): void {
  try {
    localStorage.setItem(queueKey(userId), JSON.stringify(ops));
  } catch (e) {
    console.error('sync-queue: falha ao gravar fila local', e);
  }
  notify(userId);
}

function notify(userId: string): void {
  listeners.get(userId)?.forEach((fn) => fn());
}

export function registerHandler<P>(
  category: string,
  handler: (payload: P, clientOpId: string, ctx: SyncHandlerContext) => Promise<unknown>
): void {
  handlers.set(category, handler as Handler);
}

/**
 * Fallback RFC 4122 v4 válido usando `crypto.getRandomValues` (disponível em
 * todo navegador com `crypto`, mesmo quando `crypto.randomUUID` não existe —
 * contextos não seguros/HTTPS antigos). Nunca usar `Math.random()` sozinho
 * aqui: as RPCs recebem `client_op_id` como coluna `uuid` do Postgres — um
 * identificador fora do formato (`op-<timestamp>-<random>`, como era antes)
 * é rejeitado pelo driver antes mesmo de chegar à validação do servidor.
 */
function uuidV4FromRandomValues(): string | null {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') return null;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Lança se nenhuma fonte criptográfica de aleatoriedade estiver disponível — nunca gera um id incompatível com a coluna `uuid`. */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const fallback = uuidV4FromRandomValues();
  if (fallback) return fallback;
  throw new Error(
    'Não foi possível gerar um identificador de sincronização seguro (crypto indisponível neste navegador).'
  );
}

/** Gera um `client_op_id` válido para quem precisa de um id ESTÁVEL antes de chamar `enqueue` (ex.: recuperação legada ambígua, que precisa guardar o id antes de o usuário decidir). Lança nas mesmas condições que `uuid()`. */
export function generateClientOpId(): string {
  return uuid();
}

let placeholderSeq = 0;
/** Id local (nunca enviado ao servidor) para uma operação cujo `client_op_id` real ainda não pôde ser gerado. */
function placeholderId(): string {
  placeholderSeq += 1;
  return `local-pending-uuid-${Date.now()}-${placeholderSeq}`;
}

const CRYPTO_UNAVAILABLE_MESSAGE =
  'Não foi possível gerar um identificador de sincronização seguro neste navegador.';

/**
 * Classifica o erro para decidir a política de retentativa. Não usar a
 * mensagem bruta na interface — só a categoria.
 */
export function classifySyncError(err: unknown): SyncErrorKind {
  if (!err) return 'unknown';
  const fields = err as { message?: unknown; code?: unknown; status?: unknown; name?: unknown };
  const msg = String(fields.message || err);
  const code = fields.code || fields.status;

  // Conflito de mesclagem esgotado (Prompt 07-E3, bloqueio 3): o cliente
  // tentou fundir edições concorrentes até o limite explícito de tentativas
  // (ver `note_upsert` em syncHandlers.ts) e o servidor continuou rejeitando
  // — nunca é tratado como sucesso silencioso, nem retentado automaticamente
  // em loop (não é 'network'/'unknown', então `isRetryable` abaixo o mantém
  // como falha permanente e visível; o usuário pode reenviar manualmente
  // pelo botão "Tentar novamente", que dispara uma tentativa nova e limitada
  // de novo, nunca um laço infinito).
  if (code === 'SYNC_CONFLICT') return 'conflict';
  if (
    fields.name === 'AuthApiError' ||
    code === 401 ||
    code === 'PGRST301' ||
    /jwt|token expirado|not authenticated|refresh_token|invalid_grant/i.test(msg)
  ) {
    return 'auth';
  }
  if (code === '42501' || code === 403 || /permission denied|row-level security|RLS/i.test(msg)) {
    return 'permission';
  }
  if (
    code === 'PGRST204' ||
    code === 'PGRST202' ||
    /column .* does not exist|function .* does not exist|schema cache|relation .* does not exist/i.test(msg)
  ) {
    return 'schema';
  }
  if (
    code === 'P0001' ||
    code === '22P02' ||
    code === '23514' ||
    /apenas estudantes ativos|não pertence|inválid|excede o tamanho|fora do intervalo|não encontrada|não está publicada|invalid input syntax/i.test(
      msg
    )
  ) {
    return 'validation';
  }
  if (
    (typeof navigator !== 'undefined' && !navigator.onLine) ||
    /failed to fetch|network|timeout|econnreset|load failed/i.test(msg)
  ) {
    return 'network';
  }
  return 'unknown';
}

function isRetryable(kind: SyncErrorKind): boolean {
  return kind === 'network' || kind === 'unknown' || kind === 'crypto_unavailable';
}

export function needsLogin(op: SyncOp): boolean {
  return op.state === 'failed' && op.lastError?.kind === 'auth';
}

export function needsSupport(op: SyncOp): boolean {
  return op.state === 'failed' && (op.lastError?.kind === 'permission' || op.lastError?.kind === 'schema' || op.lastError?.kind === 'conflict');
}

/**
 * Enfileira uma operação e dispara uma tentativa de sincronização em segundo
 * plano (best-effort, não bloqueia quem chamou). Quem precisa do resultado
 * real do servidor (ou de esperar a conclusão) deve usar `enqueueAndTry`.
 *
 * Se não houver fonte de aleatoriedade criptográfica disponível para gerar um
 * `client_op_id` válido (ver `uuid()`) NO MOMENTO do enqueue, a operação é
 * persistida mesmo assim, com um id local (nunca enviado ao servidor) e
 * `clientOpId` ausente — nunca enviamos um id incompatível com a coluna
 * `uuid` do Postgres, mas também nunca deixamos o dado desaparecer
 * silenciosamente. `runFlush` tenta gerar o `client_op_id` real de novo a
 * cada flush (evento `online`, troca de aba, heartbeat de 60s, ou o próximo
 * carregamento da página) antes de despachar a operação — o dado local
 * (gravado antes desta chamada, nos repositórios) permanece intacto em
 * qualquer caso, e a falha é visível na fila (nunca só no console).
 */
export function enqueue<TPayload>(userId: string, category: string, payload: TPayload, clientOpId?: string): SyncOp<TPayload> {
  return insertOp(userId, category, payload, clientOpId);
}

/**
 * Enfileira uma operação da qual outras já na fila dependem, ANTES da
 * primeira delas (`dependsOnIt`), e devolve a `pending` as que falharam de vez
 * — falharam porque faltava justamente o que esta operação cria. Uso: a
 * recuperação legada envia um card que só existia no aparelho quando a fila já
 * tem revisão ou SRS dele (45-E, revisão do 1af8cf3); no fim da fila, a
 * criação sairia depois deles (o SRS em backoff segura o card) e a revisão
 * falharia em todo reenvio.
 */
export function enqueueBefore<TPayload>(
  userId: string,
  category: string,
  payload: TPayload,
  dependsOnIt: (op: SyncOp) => boolean
): SyncOp<TPayload> {
  return insertOp(userId, category, payload, undefined, dependsOnIt);
}

function insertOp<TPayload>(
  userId: string,
  category: string,
  payload: TPayload,
  clientOpId?: string,
  dependsOnIt?: (op: SyncOp) => boolean
): SyncOp<TPayload> {
  knownUserIds.add(userId);
  const now = new Date().toISOString();

  let id: string;
  let resolvedClientOpId: string | undefined;
  try {
    resolvedClientOpId = clientOpId ?? uuid();
    id = resolvedClientOpId;
  } catch (e) {
    id = placeholderId();
    resolvedClientOpId = undefined;
    console.error(
      'sync-queue: client_op_id não pôde ser gerado agora — operação enfileirada como pendente para nova tentativa automática',
      e
    );
  }

  const ops = loadQueue(userId).filter(
    (o) => o.state === 'synced' || o.state === 'syncing' || !supersedes({ category, payload }, o)
  );
  // `clientOpId` identifica o efeito remoto e pode ser reutilizado de forma
  // legítima (replay). `id` identifica a entrada local e nunca pode colidir:
  // runFlush/subscribers localizam a entrada por ele. Sem esta separação,
  // [X synced, X pending] fazia todo flush atualizar sempre o primeiro X e
  // deixava o segundo pendente para sempre.
  if (ops.some((candidate) => candidate.id === id)) {
    try {
      id = uuid();
    } catch {
      id = placeholderId();
    }
    while (ops.some((candidate) => candidate.id === id)) id = placeholderId();
  }

  const op: SyncOp<TPayload> = {
    id,
    clientOpId: resolvedClientOpId,
    userId,
    category,
    payload,
    createdAt: now,
    updatedAt: now,
    state: 'pending',
    attempts: 0,
    ...(resolvedClientOpId ? {} : { lastError: { kind: 'crypto_unavailable' as SyncErrorKind, message: CRYPTO_UNAVAILABLE_MESSAGE } }),
  };
  const firstDependent = dependsOnIt ? ops.findIndex((o) => o.state !== 'synced' && o.state !== 'syncing' && dependsOnIt(o)) : -1;
  if (firstDependent < 0) {
    ops.push(op);
  } else {
    ops.splice(firstDependent, 0, op);
    for (let i = firstDependent + 1; i < ops.length; i++) {
      if (ops[i].state === 'failed' && dependsOnIt!(ops[i])) {
        ops[i] = { ...ops[i], state: 'pending', nextRetryAt: undefined, attempts: 0, updatedAt: now };
      }
    }
  }
  saveQueue(userId, ops);
  enqueueVersions.set(userId, (enqueueVersions.get(userId) ?? 0) + 1);
  void flush(userId);
  return op;
}

/**
 * Tenta uma operação imediatamente e devolve o resultado do servidor quando
 * bem-sucedido — usado por quem quer o resultado "de verdade" (ex.: gabarito
 * completo com bibliografia) em vez de só o otimista local.
 *
 * Espera especificamente pela CONCLUSÃO desta operação (não só por "um
 * flush terminar") — inclusive quando outra chamada já colocou um flush deste
 * usuário em andamento (`flush` deduplica por usuário e devolve a mesma
 * Promise para todo chamador concorrente; ver `flush`). Duas chamadas
 * concorrentes a `enqueueAndTry` para o mesmo usuário portanto sempre
 * recebem o resultado da SUA PRÓPRIA operação, nunca `null` só porque a
 * outra já estava em voo.
 *
 * Se a operação falhar de forma definitiva (validação/permissão/schema),
 * ficar retentável mas sem rede/sessão disponível, ou não concluir dentro do
 * prazo de espera, devolve `null` — quem chamou usa o resultado local
 * otimista já gravado; a fila continua tentando em segundo plano quando
 * aplicável.
 */
export async function enqueueAndTry<TPayload>(
  userId: string,
  category: string,
  payload: TPayload,
  clientOpId?: string,
  timeoutMs = 20_000
): Promise<unknown | null> {
  const tracked = await enqueueAndTryTracked(userId, category, payload, clientOpId, timeoutMs);
  return tracked.result;
}

/**
 * Variante rastreável de `enqueueAndTry`: além do resultado imediato, devolve
 * a identidade estável da operação que ficou na fila. Telas que dependem de
 * confirmação autoritativa (gabarito e nota de simulado) usam esse id para
 * continuar observando a MESMA ação depois de timeout/offline, sem criar uma
 * segunda tentativa ao voltar a rede.
 */
export async function enqueueAndTryTracked<TPayload>(
  userId: string,
  category: string,
  payload: TPayload,
  clientOpId?: string,
  timeoutMs = 20_000
): Promise<{ op: SyncOp<TPayload>; result: unknown | null }> {
  const op = enqueue(userId, category, payload, clientOpId);
  if (!op.id || op.state === 'failed') return { op, result: null };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await flush(userId);
    const settled = loadQueue(userId).find((o) => o.id === op.id);
    if (!settled) return { op, result: null }; // defensivo: prune preserva synced recentes
    if (settled.state === 'synced') return { op: settled as SyncOp<TPayload>, result: settled.result ?? null };
    if (settled.state === 'failed') return { op: settled as SyncOp<TPayload>, result: null };
    // 'pending'/'syncing' aqui significa: offline, aguardando backoff, ou um
    // flush concorrente ainda processando outra operação antes da nossa —
    // continuar tentando até o prazo, sem busy-loop apertado.
    if (settled.nextRetryAt && new Date(settled.nextRetryAt).getTime() > Date.now()) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break; // offline: não adianta insistir agora
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  const current = loadQueue(userId).find((o) => o.id === op.id) as SyncOp<TPayload> | undefined;
  return { op: current ?? op, result: null }; // timeout/offline — fila preserva a operação
}

/** UID autenticado no Supabase agora, ou `null` (sem sessão, sessão expirada, ou erro ao consultar). */
async function getActiveSupabaseUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return data.session.user.id;
  } catch {
    return null;
  }
}

/**
 * Reprocessa a fila pendente/retentável de um usuário. Deduplica por
 * usuário: se já existe um flush em andamento para este `userId`, devolve a
 * MESMA Promise em vez de retornar imediatamente sem esperar — isso é o que
 * corrige `enqueueAndTry` retornando cedo quando um flush concorrente já
 * estava em voo (bloqueio 1). A dedupe é feita de forma síncrona (função não
 * `async`, `Promise` registrada no Map antes de qualquer `await`) para que
 * duas chamadas a `flush(userId)` no mesmo tick (ex.: `enqueue` disparando
 * `void flush(userId)` e, em seguida, `enqueueAndTry` chamando `flush`
 * de novo) sempre observem a mesma entrada no Map.
 */
// `force`: ignora `nextRetryAt` (o agendamento de backoff) para operações
// retentáveis pendentes. Usado só por sinais fortes e explícitos de que a
// causa provável do erro mudou — o evento `online` real e a aba voltando a
// ficar visível (`visibilitychange`) — nunca pelo heartbeat periódico (esse
// continua respeitando o backoff normalmente, para não virar um retry
// agressivo a cada 60s). Sem isso, uma operação que falhou uma vez por
// `network` pouco antes de a rede cair de vez ficava presa até 15s+ (base do
// backoff) mesmo depois do navegador avisar que a rede voltou — achado real
// do Prompt 07-E2 (teste de navegador: nota editada offline, reload, rede
// restaurada — a operação não convergia dentro do tempo razoável de espera
// de um evento `online` real).
export function flush(userId: string, force = false): Promise<void> {
  if (!userId) return Promise.resolve();
  const existing = flushPromises.get(userId);
  if (existing) return existing;
  const enqueueVersionAtStart = enqueueVersions.get(userId) ?? 0;
  const p = runFlush(userId, force).finally(() => {
    flushPromises.delete(userId);
    // Uma operação pode nascer em um listener acionado pelo `saveQueue` que
    // conclui a operação anterior (ex.: tentativa confirmada gera o flashcard
    // do erro). Nesse instante o flush antigo ainda está registrado e o
    // `enqueue()` recebe a Promise já em encerramento, cuja lista inicial não
    // contém a nova operação. Uma passagem subsequente garante envio imediato
    // sem depender de heartbeat, reload ou outro evento `online`.
    if ((enqueueVersions.get(userId) ?? 0) > enqueueVersionAtStart) {
      return flush(userId, force);
    }
  });
  flushPromises.set(userId, p);
  return p;
}

async function runFlush(userId: string, force = false): Promise<void> {
  // Isolamento entre usuários (bloqueio 2): a fila de `userId` só pode ser
  // enviada enquanto ele for também o usuário autenticado no Supabase AGORA.
  // Isso é reavaliado a cada operação da fila (não só uma vez no início),
  // porque um logout pode acontecer no meio do processamento — uma operação
  // já em voo no momento do logout não é cancelada (o token já foi anexado à
  // requisição no envio; ver docs/SINCRONIZACAO-CONFIAVEL.md), mas nenhuma
  // operação SEGUINTE da fila é enviada depois que a sessão muda. A fila de
  // `userId` nunca é tocada/apagada/reatribuída quando a checagem falha — só
  // fica pendente para quando ele voltar a ser o usuário ativo.
  let ops = loadQueue(userId);
  let changed = false;
  const now = Date.now();

  // Qualquer operação encontrada em 'syncing' no INÍCIO de um flush é
  // resíduo de uma sessão anterior que recarregou/fechou a aba no meio do
  // envio (o estado 'syncing' só existe durante o `await handler(...)` logo
  // abaixo, nunca persiste entre execuções deste módulo) — nunca fica presa
  // indefinidamente. Reenviar é seguro mesmo se a primeira tentativa tiver
  // sido aplicada no servidor: as RPCs são idempotentes por `client_op_id`.
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].state === 'syncing') {
      ops[i] = { ...ops[i], state: 'pending', updatedAt: new Date().toISOString() };
      changed = true;
    }
  }
  if (changed) saveQueue(userId, ops);

  // Alvos com operação retida nesta passagem (45-E): as seguintes do mesmo
  // alvo esperam, para nunca chegar ao servidor antes da mais antiga.
  const heldTargets = new Set<string>();
  const hold = (candidate: SyncOp): void => {
    const target = targetOf(candidate);
    if (target) heldTargets.add(target);
  };

  // Percorre por id, não por índice: a fila é relida depois de cada envio e
  // pode ter perdido entradas no meio (operação substituída, acima e em
  // `enqueue`). Operações que nascem durante o flush ficam para a passagem
  // seguinte (ver `flush`).
  for (const opId of ops.map((o) => o.id)) {
    // Relida a cada volta: o `saveQueue` da volta anterior avisa os listeners,
    // e um deles pode ter enfileirado uma operação nova (ex.: tentativa
    // confirmada gera o card do erro). Gravar aqui o array velho a apagaria.
    ops = loadQueue(userId);
    const i = ops.findIndex((o) => o.id === opId);
    if (i < 0) continue;
    let op = ops[i];
    if (op.state === 'synced') continue;
    const target = targetOf(op);
    if (target && heldTargets.has(target)) continue;
    if (op.state === 'failed' && !isRetryable(op.lastError?.kind ?? 'unknown')) {
      // Falha permanente só sai por reenvio manual. Se já existe uma mais nova
      // que a substitui (fila gravada antes da 45-E), ela sai, para o reenvio
      // manual nunca mandá-la depois da nova. Em categoria só serializada
      // (flashcard, simulado) ela segura o alvo até o reenvio.
      if (ops.some((o, j) => j > i && o.state !== 'synced' && supersedes(o, op))) {
        ops.splice(i, 1);
        changed = true;
        saveQueue(userId, ops);
      } else if (!TARGETS[op.category]?.supersedes) {
        hold(op);
      }
      continue;
    }
    if (!force && op.nextRetryAt && new Date(op.nextRetryAt).getTime() > now) {
      hold(op);
      continue;
    }

    const handler = handlers.get(op.category);
    if (!handler) {
      hold(op);
      continue; // categoria sem handler registrado nesta sessão (ex.: código antigo) — não trava a fila
    }

    // Operação enfileirada sem `clientOpId` (crypto indisponível no momento
    // do enqueue, ver Problema 4) — tenta gerar agora, antes de qualquer
    // envio. Nunca despacha o handler sem um client_op_id válido.
    let clientOpId = op.clientOpId;
    if (!clientOpId) {
      try {
        clientOpId = uuid();
      } catch {
        const attempts = op.attempts + 1;
        const retryable = attempts < currentMaxRetryableAttempts();
        const backoff = Math.min(currentBaseBackoffMs() * 2 ** (attempts - 1), MAX_BACKOFF_MS);
        ops[i] = {
          ...op,
          state: retryable ? 'pending' : 'failed',
          attempts,
          nextRetryAt: retryable ? new Date(Date.now() + backoff).toISOString() : undefined,
          lastError: { kind: 'crypto_unavailable', message: CRYPTO_UNAVAILABLE_MESSAGE },
          updatedAt: new Date().toISOString(),
        };
        changed = true;
        saveQueue(userId, ops);
        hold(op);
        continue; // próxima operação — esta é retentada num flush futuro
      }
      // Atualiza a referência local de `op` também — os `spread`s abaixo
      // (estado 'syncing', depois 'synced'/'failed') partem desta versão
      // com `clientOpId` preenchido, nunca da capturada no topo do laço
      // (senão o clientOpId recém-gerado seria sobrescrito de volta a
      // `undefined` no próximo spread).
      op = { ...op, clientOpId, updatedAt: new Date().toISOString() };
      ops[i] = op;
      changed = true;
      saveQueue(userId, ops);
    }

    const activeUserId = await getActiveSupabaseUserId();
    if (activeUserId !== userId) {
      // Sessão ativa não é mais (ou ainda não é) a dona desta fila — para de
      // processar esta fila agora, sem tocar em nenhuma operação. Nunca
      // reatribui `op.userId`, nunca marca como falha (não é um erro da
      // operação, é uma troca de sessão).
      return;
    }

    // BUG REAL encontrado no Prompt 07-E2 (teste de navegador — favoritos
    // com duas operações enfileiradas em sequência rápida, ex.: desmarcar
    // seguido de marcar de novo antes do primeiro flush concluir): `ops`
    // foi carregado no TOPO desta função, antes do `await
    // getActiveSupabaseUserId()` acima — um ponto de suspensão real
    // (chamada assíncrona do Supabase). Se OUTRO `enqueue()` for chamado
    // durante essa suspensão, ele grava um array mais novo no
    // `localStorage` de forma síncrona. Escrever de volta aqui o `ops`
    // ANTIGO (capturado antes do `await`) apagaria silenciosamente essa
    // operação recém-enfileirada — perda de dado real, não só teórica
    // (reproduzida com Playwright: a segunda de duas operações enfileiradas
    // em sequência desaparecia da fila). Corrigido recarregando a fila REAL
    // agora e localizando a operação pelo `id` (nunca pelo índice `i`, que
    // pode não corresponder mais à mesma operação depois do reload) antes
    // de marcar 'syncing'.
    ops = loadQueue(userId);
    const syncingIdx = ops.findIndex((o) => o.id === op.id);
    if (syncingIdx < 0) continue; // operação sumiu da fila entre o enqueue e aqui (não deveria acontecer) — defensivo, não trava
    ops[syncingIdx] = { ...ops[syncingIdx], state: 'syncing', updatedAt: new Date().toISOString() };
    changed = true;
    saveQueue(userId, ops);

    try {
      const sent = op;
      const ctx: SyncHandlerContext = {
        updateNewer<P>(fn: (payload: P) => P): P | null {
          const current = loadQueue(userId);
          const self = current.findIndex((o) => o.id === sent.id);
          let latest: P | null = null;
          for (let j = self + 1; self >= 0 && j < current.length; j++) {
            const candidate = current[j];
            if ((candidate.state === 'pending' || candidate.state === 'failed') && supersedes(candidate, sent)) {
              latest = fn(candidate.payload as P);
              current[j] = { ...candidate, payload: latest, updatedAt: new Date().toISOString() };
            }
          }
          if (latest !== null) saveQueue(userId, current);
          return latest;
        },
      };
      const result = await handler(op.payload, clientOpId, ctx);
      ops = loadQueue(userId);
      const idx = ops.findIndex((o) => o.id === op.id);
      if (idx >= 0) {
        ops[idx] = { ...ops[idx], state: 'synced', result, updatedAt: new Date().toISOString(), lastError: undefined };
      }
    } catch (err) {
      const kind = classifySyncError(err);
      ops = loadQueue(userId);
      const idx = ops.findIndex((o) => o.id === op.id);
      if (idx >= 0) {
        const attempts = ops[idx].attempts + 1;
        const retryable = isRetryable(kind) && attempts < currentMaxRetryableAttempts();
        const backoff = Math.min(currentBaseBackoffMs() * 2 ** (attempts - 1), MAX_BACKOFF_MS);
        ops[idx] = {
          ...ops[idx],
          state: retryable ? 'pending' : 'failed',
          attempts,
          nextRetryAt: retryable ? new Date(Date.now() + backoff).toISOString() : undefined,
          lastError: { kind, message: String((err as { message?: unknown } | null | undefined)?.message || err) },
          updatedAt: new Date().toISOString(),
        };
        // Enquanto esta estava em voo, o estudante mudou o mesmo alvo de novo
        // (45-E): a mais nova já carrega o estado final, então esta sai da
        // fila em vez de ser reenviada depois dela ou prendê-la numa falha.
        const failedOp = ops[idx];
        if (ops.some((o, j) => j > idx && o.state !== 'synced' && supersedes(o, failedOp))) ops.splice(idx, 1);
        else if (failedOp.state === 'pending' || !TARGETS[failedOp.category]?.supersedes) hold(failedOp);
      }
      // Erro de auth: não adianta continuar tentando as próximas operações agora.
      if (kind === 'auth') {
        saveQueue(userId, pruneSynced(ops));
        return;
      }
    }
    saveQueue(userId, ops);
  }

  if (changed) saveQueue(userId, pruneSynced(loadQueue(userId)));
}

function pruneSynced(ops: SyncOp[]): SyncOp[] {
  const synced = ops.filter((o) => o.state === 'synced').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  if (synced.length <= SYNCED_RETENTION) return ops;
  const toDrop = new Set(synced.slice(0, synced.length - SYNCED_RETENTION).map((o) => o.id));
  return ops.filter((o) => !toDrop.has(o.id));
}

/**
 * Volta a `pending` as falhas que `shouldReset` escolher e dispara o envio.
 * Conta como enfileiramento (`enqueueVersions`): se um flush já está em
 * andamento, ele faz mais uma passagem ao terminar, em vez de o reenvio
 * esperar o próximo heartbeat.
 */
function resetFailed(userId: string, shouldReset: (op: SyncOp) => boolean): void {
  const ops = loadQueue(userId);
  let changed = false;
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].state === 'failed' && shouldReset(ops[i])) {
      ops[i] = { ...ops[i], state: 'pending', nextRetryAt: undefined, attempts: 0, updatedAt: new Date().toISOString() };
      changed = true;
    }
  }
  if (changed) {
    saveQueue(userId, ops);
    enqueueVersions.set(userId, (enqueueVersions.get(userId) ?? 0) + 1);
  }
  void flush(userId);
}

/** Marca uma operação com falha permanente para nova tentativa manual (botão "Tentar novamente"). */
export function retryFailedOp(userId: string, opId: string): void {
  resetFailed(userId, (op) => op.id === opId);
}

/**
 * Botão "Tentar novamente". Falha de sessão só volta a pendente se há sessão
 * ativa deste usuário agora — sem ela, o flush não envia nada, a falha
 * sumiria da tela e o aviso "faça login novamente" junto (45-E).
 */
export async function retryAllFailed(userId: string): Promise<{ needsLogin: boolean }> {
  const signedIn = (await getActiveSupabaseUserId()) === userId;
  resetFailed(userId, (op) => signedIn || !needsLogin(op));
  return { needsLogin: !signedIn && loadQueue(userId).some(needsLogin) };
}

export function getSummary(userId: string | null): SyncQueueSummary {
  if (!userId) return { pending: 0, syncing: 0, failed: 0, failedNeedsLogin: false, failedNeedsSupport: 0, synced: 0, status: 'synced' };
  const ops = loadQueue(userId);
  const pending = ops.filter((o) => o.state === 'pending').length;
  const syncing = ops.filter((o) => o.state === 'syncing').length;
  const failed = ops.filter((o) => o.state === 'failed').length;
  const failedNeedsLogin = ops.some(needsLogin);
  const failedNeedsSupport = ops.filter(needsSupport).length;
  const synced = ops.filter((o) => o.state === 'synced').length;
  let status: SyncQueueSummary['status'] = 'synced';
  if (syncing > 0) status = 'syncing';
  else if (failed > 0) status = 'error';
  else if (pending > 0) status = 'pending';
  return { pending, syncing, failed, failedNeedsLogin, failedNeedsSupport, synced, status };
}

export function getOps(userId: string): SyncOp[] {
  return loadQueue(userId);
}

export function subscribe(userId: string, listener: () => void): () => void {
  knownUserIds.add(userId);
  if (!listeners.has(userId)) listeners.set(userId, new Set());
  listeners.get(userId)!.add(listener);
  void flush(userId);
  return () => listeners.get(userId)?.delete(listener);
}

/**
 * Chamado pelo StorageService a cada troca de usuário ativo (login, logout,
 * troca de conta). Nunca envia a fila de um usuário sob a sessão de outro —
 * só dispara reconciliação para o UID que acabou de ficar ativo.
 */
export function onActiveUserChanged(userId: string | null): void {
  if (userId) {
    knownUserIds.add(userId);
    // Falha de sessão (`auth`) não é da operação: é o token que venceu. Ao
    // entrar de novo, volta a pendente e sobe sozinha (45-E, AUD-25).
    resetFailed(userId, needsLogin);
  }
}

/**
 * Chamada por eventos periódicos/globais (`online`, `visibilitychange`,
 * heartbeat) — nunca deve varrer todos os UIDs conhecidos no navegador
 * (bloqueio 2): consulta a sessão ativa do Supabase UMA vez e só dispara
 * `flush` para esse usuário, e só se ele tiver fila conhecida nesta sessão
 * de navegador. Usuários conhecidos que não são o ativo simplesmente não são
 * tocados por estes eventos — a fila deles só é reprocessada quando eles
 * voltarem a fazer login (`onActiveUserChanged`).
 */
async function flushAllKnown(force = false): Promise<void> {
  const activeUserId = await getActiveSupabaseUserId();
  if (!activeUserId || !knownUserIds.has(activeUserId)) return;
  void flush(activeUserId, force);
}

function startPeriodicReconciliation(): void {
  if (periodicTimerStarted || typeof window === 'undefined') return;
  periodicTimerStarted = true;

  // `online` e a aba voltando a ficar visível são sinais fortes e
  // explícitos de reconexão — ignoram o backoff (force=true) para que uma
  // operação que falhou por rede pouco antes não fique presa até o timer de
  // backoff expirar mesmo depois do navegador confirmar que a rede voltou.
  // O heartbeat (só tempo passando, nenhum sinal novo) continua respeitando
  // o backoff normalmente.
  window.addEventListener('online', () => void flushAllKnown(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushAllKnown(true);
  });
  window.setInterval(() => void flushAllKnown(false), 60_000);
}

startPeriodicReconciliation();
