// Ciclo do revisor de IA (44-F). Roda a cada disparo do agendador, um por vez
// (trava no banco), e faz, nesta ordem:
//   0. CONCILIAÇÃO: tentativas de criar lote que terminaram sem resposta (falha
//      incerta) são resolvidas olhando a lista de lotes da API, nunca reenviando
//      às cegas;
//   1. COLETA: lotes já enviados que a API terminou viram resultado no banco
//      (veredito lido por `lerVeredito`, tokens e buscas guardados);
//   2. ENVIO: envios "aguardando revisão" são reservados no banco (com os
//      limites de custo), conferidos pelo servidor (arquivo fora do padrão nem
//      chega à IA: custo zero) e enviados num lote novo.
// A API de lotes custa metade e não prende uma requisição até a revisão acabar
// (uma revisão com busca na web leva minutos). Nada aqui chama a IA de forma
// síncrona. Tudo que depende do mundo de fora entra por `Banco` e `ApiDeLotes`,
// para o teste rodar com a API simulada: nenhuma chamada real em teste nem em CI.
//
// Regra de ouro do dinheiro: a API não tem chave de idempotência. Por isso a
// tentativa é gravada (revisões "incertas", que já contam no limite) ANTES de
// pedir o lote, e só uma recusa definitiva (4xx) devolve o envio à fila sem
// contar. Timeout, queda de conexão, 5xx ou morte do servidor no meio deixam a
// revisão contada e a conciliação decide, com a lista de lotes, se o lote
// existe (adota) ou não (libera depois do prazo).
import { lerVeredito, textoFinalDaResposta, type Veredito } from './veredito.ts';
import { MODELO, montarPedidoDeLote, montarSistema, type PedidoDeLote } from './montagem.ts';

// --- Portas ---------------------------------------------------------------

export interface Reservado {
  reviewId: string;
  submissionId: string;
  titulo: string;
  texto: string;
  sha256: string;
  disciplineId: string;
  themeId: string;
  disciplina: string;
  tema: string;
  pai: string | null;
  /**
   * Só nas revisões pausadas: o conteúdo de cada resposta pausada da IA, na ordem
   * (uma lista de listas de blocos). Volta à API sem edição, um turno do
   * assistente por resposta.
   */
  continuacao?: unknown[][] | null;
  tentativa?: number;
}

export interface Pendente {
  reviewId: string;
  status: 'submetida' | 'pausada' | 'incerta';
  batchId: string | null;
  /** Instante da tentativa de criar o lote (revisões "incertas"). */
  tentativaEm: string | null;
}

export interface ResultadoRegistrado {
  reviewId: string;
  veredito: Veredito;
  linhaDoVeredito: string | null;
  achados: string | null;
  blocoDeCorrecao: string | null;
  tipoDeErro: string | null;
  modelo: string | null;
  sistemaSha256: string;
  uso: Uso;
  stopReason: string | null;
  cobravel: boolean;
}

export interface Uso {
  entrada: number;
  saida: number;
  cacheCriado: number;
  cacheLido: number;
  buscas: number;
  leituras: number;
}

export interface Banco {
  /** Um ciclo por vez: devolve o token da trava, ou nulo se outro ciclo está em andamento. */
  travar(): Promise<string | null>;
  destravar(token: string): Promise<void>;
  liberarReservasVelhas(): Promise<number>;
  pendentes(): Promise<Pendente[]>;
  reservar(max: number): Promise<Reservado[]>;
  dadosDoEnvio(reviewIds: string[]): Promise<Reservado[]>;
  catalogo(): Promise<Catalogo>;
  /** Grava a tentativa ANTES de pedir o lote: as revisões viram "incertas" e devolve o instante. */
  marcarIncerta(reviewIds: string[]): Promise<string | null>;
  anexarLote(reviewIds: string[], batchId: string): Promise<number>;
  /** Só com certeza de que não há lote: devolve os envios à fila, sem contar no limite. */
  liberar(reviewIds: string[]): Promise<number>;
  /** Acrescenta o conteúdo da resposta pausada à continuação e soma o gasto. */
  pausar(reviewId: string, continuacao: unknown[], uso: Uso): Promise<boolean>;
  registrar(r: ResultadoRegistrado): Promise<boolean>;
}

export interface Catalogo {
  disciplines: Array<{ id: string; name: string }>;
  themes: Array<{ id: string; name: string; disciplineId: string }>;
}

export interface MensagemDaApi {
  stop_reason: string | null;
  model?: string;
  content: Array<{ type: string; text?: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number } | null;
  };
}

export type ResultadoDoLote =
  | { type: 'succeeded'; message: MensagemDaApi }
  | { type: 'errored' | 'canceled' | 'expired'; error?: unknown };

export interface LoteNaApi {
  id: string;
  criadoEm: string;
  /** Total de pedidos do lote (todos os estados somados). */
  total: number;
}

export interface ApiDeLotes {
  criar(pedidos: PedidoDeLote[]): Promise<{ id: string }>;
  consultar(batchId: string): Promise<{ status: 'in_progress' | 'canceling' | 'ended' }>;
  resultados(batchId: string): AsyncIterable<{ custom_id: string; result: ResultadoDoLote }>;
  /** Lotes criados desde o instante dado (só metadados), do mais novo para o mais antigo. */
  listar(desde: string): Promise<LoteNaApi[]>;
  cancelar(batchId: string): Promise<void>;
}

/** A conferência que o servidor faz antes de gastar com a IA (a mesma da tela). */
export type Conferencia = (
  envio: Reservado,
  catalogo: Catalogo,
) => { aceito: boolean; motivos: string[] };

export interface DepsDoCiclo {
  banco: Banco;
  api: ApiDeLotes;
  conferir: Conferencia;
  /** Prompt revisor + Parte 1 do padrão (o mesmo texto que a pessoa copia). */
  baseDoRevisor: string;
  baseSha256: string;
  novoCodigo: () => string;
  /** Envios novos por ciclo (limita o gasto e a CPU da conferência). */
  maxPorLote?: number;
  /** Relógio (ms), para o prazo do ciclo e da conciliação. */
  agora?: () => number;
  /** O ciclo não começa trabalho novo depois disto (a função tem limite de tempo). */
  prazoMs?: number;
  /** Quanto esperar por um lote que a conciliação não acha antes de liberar o envio. */
  graceMs?: number;
}

export interface ResumoDoCiclo {
  /** Outro ciclo estava em andamento: este saiu sem fazer nada. */
  pulado: boolean;
  reservasLiberadas: number;
  lotesConciliados: number;
  lotesColetados: number;
  resultadosRegistrados: number;
  pausasContinuadas: number;
  reprovadosAntesDaIa: number;
  enviadosAoLote: number;
  loteCriado: string | null;
  /** Tentativa de criar lote que ficou sem resposta: a revisão fica contada e a conciliação resolve. */
  loteIncerto: boolean;
  erros: string[];
}

export const MAX_ENVIOS_NOVOS_POR_CICLO = 5;
const PRAZO_DO_CICLO_MS = 100_000;
const GRACE_DA_CONCILIACAO_MS = 15 * 60_000;
/** Tolerância entre o relógio do banco e o da API ao procurar o lote de uma tentativa. */
const TOLERANCIA_DE_RELOGIO_MS = 60_000;

// --- Helpers ---------------------------------------------------------------

const USO_ZERO: Uso = { entrada: 0, saida: 0, cacheCriado: 0, cacheLido: 0, buscas: 0, leituras: 0 };

export function usoDaMensagem(m: MensagemDaApi): Uso {
  return {
    entrada: m.usage.input_tokens ?? 0,
    saida: m.usage.output_tokens ?? 0,
    cacheCriado: m.usage.cache_creation_input_tokens ?? 0,
    cacheLido: m.usage.cache_read_input_tokens ?? 0,
    buscas: m.usage.server_tool_use?.web_search_requests ?? 0,
    leituras: m.usage.server_tool_use?.web_fetch_requests ?? 0,
  };
}

/** Quando o texto do envio já traz uma linha de veredito, ele tenta ditar a resposta: não vai à IA. */
const LINHA_DE_VEREDITO_NO_TEXTO = /^\s*[*_>`"'“”-]*\s*(APTO PARA ENVIAR|N[ÃA]O APTO\s*[—-])/im;

export function textoTemLinhaDeVeredito(texto: string): boolean {
  return LINHA_DE_VEREDITO_NO_TEXTO.test(texto);
}

/**
 * A API recusou o pedido de vez (o lote com certeza não foi criado)? Só 4xx
 * definitivo: 400, 401, 403, 404, 413, 422, 429. Não valem 408 (timeout) nem 409
 * (conflito), nem 5xx, nem erro sem status (rede, timeout do cliente, conexão
 * cortada): nesses o lote PODE ter sido criado.
 */
export function recusaDefinitiva(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 409;
}

function mensagemDoErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function textoDaReprovacao(motivos: string[]): string {
  return [
    'Antes de pedir a revisão de IA, o NexusMed conferiu o arquivo e ele ainda não está no padrão. Corrija os pontos abaixo e envie de novo. Esta conferência não gastou revisão de IA.',
    '',
    ...motivos.map((m) => `- ${m}`),
  ].join('\n');
}

function registroDeErro(reviewId: string, base: string, tipo: string, uso: Uso, cobravel: boolean, stop: string | null = null): ResultadoRegistrado {
  return {
    reviewId,
    veredito: 'erro',
    linhaDoVeredito: null,
    achados: null,
    blocoDeCorrecao: null,
    tipoDeErro: tipo,
    modelo: MODELO,
    sistemaSha256: base,
    uso,
    stopReason: stop,
    cobravel,
  };
}

// --- Conciliação de tentativas incertas ----------------------------------------

async function conciliar(deps: DepsDoCiclo, pendentes: Pendente[], resumo: ResumoDoCiclo): Promise<void> {
  const agora = (deps.agora ?? Date.now)();
  const grace = deps.graceMs ?? GRACE_DA_CONCILIACAO_MS;
  const porTentativa = new Map<string, string[]>();
  for (const p of pendentes) {
    if (p.status !== 'incerta' || !p.tentativaEm) continue;
    porTentativa.set(p.tentativaEm, [...(porTentativa.get(p.tentativaEm) ?? []), p.reviewId]);
  }
  if (porTentativa.size === 0) return;

  // Lotes que já têm dono: nunca são adotados por uma tentativa incerta.
  const conhecidos = new Set(pendentes.map((p) => p.batchId).filter((b): b is string => Boolean(b)));

  for (const [tentativaEm, reviewIds] of [...porTentativa].sort(([a], [b]) => a.localeCompare(b))) {
    try {
      const desde = new Date(new Date(tentativaEm).getTime() - TOLERANCIA_DE_RELOGIO_MS).toISOString();
      const lotes = await deps.api.listar(desde);
      const candidatos = lotes
        .filter((l) => l.total === reviewIds.length && !conhecidos.has(l.id))
        .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));

      if (candidatos.length > 0) {
        // O lote existe: adota o primeiro. Se a tentativa se repetiu (mais de um
        // lote igual), cancela os outros para não pagar duas vezes a mesma revisão.
        const [adotado, ...repetidos] = candidatos;
        await deps.banco.anexarLote(reviewIds, adotado.id);
        conhecidos.add(adotado.id);
        resumo.lotesConciliados += 1;
        for (const extra of repetidos) {
          conhecidos.add(extra.id);
          try {
            await deps.api.cancelar(extra.id);
          } catch (e) {
            resumo.erros.push(`cancelar lote repetido ${extra.id}: ${mensagemDoErro(e)}`);
          }
        }
        continue;
      }

      // Nenhum lote com esse tamanho desde a tentativa. Só depois do prazo é
      // certo que ele não existe (a API pode demorar a listar): aí o envio volta
      // para a fila sem contar, porque nada foi gasto.
      if (agora - new Date(tentativaEm).getTime() >= grace) {
        await deps.banco.liberar(reviewIds);
        resumo.reservasLiberadas += reviewIds.length;
      }
    } catch (e) {
      resumo.erros.push(`conciliação ${tentativaEm}: ${mensagemDoErro(e)}`);
    }
  }
}

// --- Coleta ------------------------------------------------------------------

async function coletarLote(deps: DepsDoCiclo, batchId: string, reviewIds: string[], resumo: ResumoDoCiclo): Promise<void> {
  const vistos = new Set<string>();
  const pendentes = new Set(reviewIds);
  for await (const item of deps.api.resultados(batchId)) {
    const reviewId = item.custom_id;
    if (!pendentes.has(reviewId)) continue;
    vistos.add(reviewId);
    const r = item.result;
    if (r.type !== 'succeeded') {
      // Erro, cancelamento ou expiração: a API não cobra.
      const ok = await deps.banco.registrar(registroDeErro(reviewId, deps.baseSha256, `lote_${r.type}`, USO_ZERO, false));
      if (ok) resumo.resultadosRegistrados += 1;
      continue;
    }
    const msg = r.message;
    const uso = usoDaMensagem(msg);
    if (msg.stop_reason === 'pause_turn') {
      // O banco acrescenta este conteúdo ao que já estava guardado.
      const pausou = await deps.banco.pausar(reviewId, msg.content, uso);
      if (pausou) {
        resumo.pausasContinuadas += 1;
      } else {
        const ok = await deps.banco.registrar(registroDeErro(reviewId, deps.baseSha256, 'pausas_demais', uso, true, msg.stop_reason));
        if (ok) resumo.resultadosRegistrados += 1;
      }
      continue;
    }
    const leitura = lerVeredito({ stopReason: msg.stop_reason, texto: textoFinalDaResposta(msg.content) });
    const ok = await deps.banco.registrar({
      reviewId,
      veredito: leitura.veredito,
      linhaDoVeredito: leitura.linhaDoVeredito,
      achados: leitura.achados || null,
      blocoDeCorrecao: leitura.blocoDeCorrecao,
      tipoDeErro: leitura.veredito === 'erro' ? leitura.motivo : null,
      modelo: msg.model ?? MODELO,
      sistemaSha256: deps.baseSha256,
      uso,
      stopReason: msg.stop_reason,
      cobravel: true,
    });
    if (ok) resumo.resultadosRegistrados += 1;
  }
  // Lote terminado e revisão sem resultado: não há o que esperar.
  for (const reviewId of pendentes) {
    if (vistos.has(reviewId)) continue;
    const ok = await deps.banco.registrar(registroDeErro(reviewId, deps.baseSha256, 'lote_sem_resultado', USO_ZERO, false));
    if (ok) resumo.resultadosRegistrados += 1;
  }
}

async function coletar(deps: DepsDoCiclo, pendentes: Pendente[], resumo: ResumoDoCiclo, dentroDoPrazo: () => boolean): Promise<void> {
  const porLote = new Map<string, string[]>();
  for (const p of pendentes) {
    if (p.status !== 'submetida' || !p.batchId) continue;
    porLote.set(p.batchId, [...(porLote.get(p.batchId) ?? []), p.reviewId]);
  }
  for (const [batchId, reviewIds] of porLote) {
    if (!dentroDoPrazo()) {
      resumo.erros.push('prazo do ciclo esgotado: os lotes que faltam ficam para o próximo disparo');
      return;
    }
    try {
      const lote = await deps.api.consultar(batchId);
      if (lote.status !== 'ended') continue;
      await coletarLote(deps, batchId, reviewIds, resumo);
      resumo.lotesColetados += 1;
    } catch (e) {
      if ((e as { status?: number } | null)?.status === 404) {
        // O lote não existe mais (expirou além do prazo de 29 dias, ou o id está
        // errado): não há o que esperar, e insistir seria uma chamada à API por
        // disparo, para sempre. Vira erro, sem custo.
        for (const reviewId of reviewIds) {
          const ok = await deps.banco.registrar(registroDeErro(reviewId, deps.baseSha256, 'lote_nao_encontrado', USO_ZERO, false));
          if (ok) resumo.resultadosRegistrados += 1;
        }
        continue;
      }
      // Qualquer outra falha (rede, API fora): tenta de novo no próximo disparo.
      // Nada é dado como apto por falha.
      resumo.erros.push(`coleta ${batchId}: ${mensagemDoErro(e)}`);
    }
  }
}

// --- Ciclo ---------------------------------------------------------------------

export async function executarCiclo(deps: DepsDoCiclo): Promise<ResumoDoCiclo> {
  const resumo: ResumoDoCiclo = {
    pulado: false,
    reservasLiberadas: 0,
    lotesConciliados: 0,
    lotesColetados: 0,
    resultadosRegistrados: 0,
    pausasContinuadas: 0,
    reprovadosAntesDaIa: 0,
    enviadosAoLote: 0,
    loteCriado: null,
    loteIncerto: false,
    erros: [],
  };

  // Um ciclo por vez. Sem a trava, dois disparos sobrepostos criariam o mesmo
  // lote de continuação duas vezes.
  const token = await deps.banco.travar();
  if (!token) {
    resumo.pulado = true;
    return resumo;
  }
  try {
    await trabalhar(deps, resumo);
  } finally {
    try {
      await deps.banco.destravar(token);
    } catch (e) {
      // A trava tem validade e expira sozinha.
      resumo.erros.push(`destravar: ${mensagemDoErro(e)}`);
    }
  }
  return resumo;
}

async function trabalhar(deps: DepsDoCiclo, resumo: ResumoDoCiclo): Promise<void> {
  const relogio = deps.agora ?? Date.now;
  const limite = relogio() + (deps.prazoMs ?? PRAZO_DO_CICLO_MS);
  const dentroDoPrazo = () => relogio() < limite;

  // Só reservas que nunca chegaram a pedir lote (o servidor caiu antes de gravar
  // a tentativa): essas voltam à fila sem contar.
  resumo.reservasLiberadas = await deps.banco.liberarReservasVelhas();

  const pendentes = await deps.banco.pendentes();
  await conciliar(deps, pendentes, resumo);
  await coletar(deps, await deps.banco.pendentes(), resumo, dentroDoPrazo);
  if (!dentroDoPrazo()) return;

  // Continuações (pause_turn) ainda pausadas depois da coleta.
  const aindaPausadas = (await deps.banco.pendentes()).filter((p) => p.status === 'pausada').map((p) => p.reviewId);
  const continuacoes = aindaPausadas.length > 0 ? await deps.banco.dadosDoEnvio(aindaPausadas) : [];

  const novas = await deps.banco.reservar(deps.maxPorLote ?? MAX_ENVIOS_NOVOS_POR_CICLO);
  const sistema = montarSistema(deps.baseDoRevisor);
  const catalogo = novas.length > 0 ? await deps.banco.catalogo() : { disciplines: [], themes: [] };

  const pedidos: PedidoDeLote[] = [];
  const idsNovos: string[] = [];
  const idsContinuados: string[] = [];

  for (const envio of novas) {
    let motivos: string[];
    if (textoTemLinhaDeVeredito(envio.texto)) {
      motivos = ['O texto do material contém uma linha de veredito ("APTO PARA ENVIAR" ou "NÃO APTO"). Tire essa linha do texto: quem dá o veredito é a revisão.'];
    } else {
      const c = deps.conferir(envio, catalogo);
      motivos = c.aceito ? [] : c.motivos;
    }
    if (motivos.length > 0) {
      // Custo zero: o arquivo nem chega à IA. Vai a "não apto" com a lista.
      const ok = await deps.banco.registrar({
        reviewId: envio.reviewId,
        veredito: 'nao_apto',
        linhaDoVeredito: null,
        achados: textoDaReprovacao(motivos),
        blocoDeCorrecao: null,
        tipoDeErro: 'pre_checagem',
        modelo: null,
        sistemaSha256: deps.baseSha256,
        uso: USO_ZERO,
        stopReason: null,
        cobravel: false,
      });
      if (ok) resumo.reprovadosAntesDaIa += 1;
      continue;
    }
    pedidos.push(
      montarPedidoDeLote({
        reviewId: envio.reviewId,
        sistema,
        material: { titulo: envio.titulo, disciplina: envio.disciplina, tema: envio.tema, pai: envio.pai, texto: envio.texto },
        codigo: deps.novoCodigo(),
      }),
    );
    idsNovos.push(envio.reviewId);
  }

  for (const envio of continuacoes) {
    pedidos.push(
      montarPedidoDeLote({
        reviewId: envio.reviewId,
        sistema,
        material: { titulo: envio.titulo, disciplina: envio.disciplina, tema: envio.tema, pai: envio.pai, texto: envio.texto },
        codigo: deps.novoCodigo(),
        continuacao: envio.continuacao ?? null,
      }),
    );
    idsContinuados.push(envio.reviewId);
  }

  if (pedidos.length === 0) return;
  const ids = [...idsNovos, ...idsContinuados];

  // Grava a tentativa ANTES de pedir o lote: daqui em diante essas revisões
  // contam no limite e não voltam sozinhas para a fila. Se isto falhar, a API
  // ainda não foi tocada e as reservas voltam à fila pelo tempo.
  await deps.banco.marcarIncerta(ids);

  let lote: { id: string };
  try {
    lote = await deps.api.criar(pedidos);
  } catch (e) {
    if (recusaDefinitiva(e)) {
      // 4xx: o lote com certeza não existe. Só aqui a reserva é devolvida de graça.
      await deps.banco.liberar(ids);
      resumo.erros.push(`criar lote (recusado pela API): ${mensagemDoErro(e)}`);
    } else {
      // Timeout, conexão, 5xx: o lote pode existir. A revisão fica contada e a
      // conciliação do próximo disparo resolve, sem reenviar.
      resumo.loteIncerto = true;
      resumo.erros.push(`criar lote (resposta incerta; será conciliado): ${mensagemDoErro(e)}`);
    }
    return;
  }

  // O lote já existe e vai gastar: se anexar falhar, tenta de novo antes de
  // desistir (e, se desistir, a conciliação o acha pela lista de lotes).
  let anexado = false;
  for (let tentativa = 1; tentativa <= 3 && !anexado; tentativa += 1) {
    try {
      await deps.banco.anexarLote(ids, lote.id);
      anexado = true;
    } catch (e) {
      resumo.erros.push(`anexar lote ${lote.id} (tentativa ${tentativa}): ${mensagemDoErro(e)}`);
    }
  }
  resumo.loteCriado = lote.id;
  resumo.enviadosAoLote = ids.length;
}
