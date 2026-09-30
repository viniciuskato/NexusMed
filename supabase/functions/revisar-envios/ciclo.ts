// Ciclo do revisor de IA (44-F). Roda a cada disparo do agendador e faz duas
// coisas, nesta ordem:
//   1. COLETA: lotes já enviados que a API terminou viram resultado no banco
//      (veredito lido por `lerVeredito`, tokens e buscas guardados);
//   2. ENVIO: envios "aguardando revisão" são reservados no banco (com os
//      limites de custo), conferidos pelo servidor (arquivo fora do padrão nem
//      chega à IA: custo zero) e enviados num lote novo.
// A API de lotes custa metade e não prende uma requisição até a revisão acabar
// (uma revisão com busca na web leva minutos). Nada aqui chama a IA de forma
// síncrona. Tudo que depende do mundo de fora entra por `Banco` e `ApiDeLotes`,
// para o teste rodar com a API simulada: nenhuma chamada real em teste nem em CI.
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
  /** Só nas revisões pausadas: o que a IA já produziu. */
  continuacao?: unknown[] | null;
  tentativa?: number;
}

export interface Pendente {
  reviewId: string;
  status: 'submetida' | 'pausada';
  batchId: string | null;
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
  liberarReservasVelhas(): Promise<number>;
  pendentes(): Promise<Pendente[]>;
  reservar(max: number): Promise<Reservado[]>;
  dadosDoEnvio(reviewIds: string[]): Promise<Reservado[]>;
  catalogo(): Promise<Catalogo>;
  anexarLote(reviewIds: string[], batchId: string): Promise<number>;
  liberar(reviewIds: string[]): Promise<number>;
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

export interface ApiDeLotes {
  criar(pedidos: PedidoDeLote[]): Promise<{ id: string }>;
  consultar(batchId: string): Promise<{ status: 'in_progress' | 'canceling' | 'ended' }>;
  resultados(batchId: string): AsyncIterable<{ custom_id: string; result: ResultadoDoLote }>;
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
  maxPorLote?: number;
  log?: (msg: string, dados?: Record<string, unknown>) => void;
}

export interface ResumoDoCiclo {
  reservasLiberadas: number;
  lotesColetados: number;
  resultadosRegistrados: number;
  pausasContinuadas: number;
  reprovadosAntesDaIa: number;
  enviadosAoLote: number;
  loteCriado: string | null;
  erros: string[];
}

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

async function coletar(deps: DepsDoCiclo, pendentes: Pendente[], resumo: ResumoDoCiclo): Promise<void> {
  const porLote = new Map<string, string[]>();
  for (const p of pendentes) {
    if (p.status !== 'submetida' || !p.batchId) continue;
    porLote.set(p.batchId, [...(porLote.get(p.batchId) ?? []), p.reviewId]);
  }
  for (const [batchId, reviewIds] of porLote) {
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
      resumo.erros.push(`coleta ${batchId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// --- Envio -------------------------------------------------------------------

export async function executarCiclo(deps: DepsDoCiclo): Promise<ResumoDoCiclo> {
  const resumo: ResumoDoCiclo = {
    reservasLiberadas: 0,
    lotesColetados: 0,
    resultadosRegistrados: 0,
    pausasContinuadas: 0,
    reprovadosAntesDaIa: 0,
    enviadosAoLote: 0,
    loteCriado: null,
    erros: [],
  };

  resumo.reservasLiberadas = await deps.banco.liberarReservasVelhas();

  const pendentes = await deps.banco.pendentes();
  await coletar(deps, pendentes, resumo);

  // Continuações (pause_turn) ainda pausadas depois da coleta.
  const aindaPausadas = (await deps.banco.pendentes()).filter((p) => p.status === 'pausada').map((p) => p.reviewId);
  const continuacoes = aindaPausadas.length > 0 ? await deps.banco.dadosDoEnvio(aindaPausadas) : [];

  const novas = await deps.banco.reservar(deps.maxPorLote ?? 20);
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

  if (pedidos.length === 0) return resumo;

  let lote: { id: string };
  try {
    lote = await deps.api.criar(pedidos);
  } catch (e) {
    // O lote não existe: as reservas novas voltam para a fila (sem gasto).
    if (idsNovos.length > 0) await deps.banco.liberar(idsNovos);
    resumo.erros.push(`criar lote: ${e instanceof Error ? e.message : String(e)}`);
    return resumo;
  }

  const ids = [...idsNovos, ...idsContinuados];
  // O lote já existe e vai gastar: se anexar falhar, tenta de novo antes de desistir.
  let anexado = false;
  for (let tentativa = 1; tentativa <= 3 && !anexado; tentativa += 1) {
    try {
      await deps.banco.anexarLote(ids, lote.id);
      anexado = true;
    } catch (e) {
      resumo.erros.push(`anexar lote ${lote.id} (tentativa ${tentativa}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  resumo.loteCriado = lote.id;
  resumo.enviadosAoLote = ids.length;
  return resumo;
}
