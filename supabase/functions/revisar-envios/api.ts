// Adaptador da API de lotes da Anthropic para o ciclo (44-F). Fica separado do
// index.ts (que só existe no Deno) para o teste conferir as opções de cada
// chamada com um cliente simulado.
import type { ApiDeLotes, LoteNaApi, ResultadoDoLote } from './ciclo.ts';
import type { PedidoDeLote } from './montagem.ts';

/**
 * Prazo de cada chamada à API, bem abaixo do limite de tempo da Edge Function
 * (150 s no plano gratuito). A função não pode ficar presa numa chamada.
 */
export const TIMEOUT_DA_API_MS = 45_000;

/** O pedaço do SDK que o adaptador usa (o cliente real cabe aqui). */
export interface ClienteDaAnthropic {
  messages: {
    batches: {
      create(body: { requests: PedidoDeLote[] }, options?: { maxRetries?: number; timeout?: number }): PromiseLike<{ id: string }>;
      retrieve(id: string): PromiseLike<{ processing_status: 'in_progress' | 'canceling' | 'ended' }>;
      results(id: string): PromiseLike<AsyncIterable<{ custom_id: string; result: unknown }>>;
      list(params?: { limit?: number }): PromiseLike<{
        data: Array<{
          id: string;
          created_at: string;
          request_counts: { canceled: number; errored: number; expired: number; processing: number; succeeded: number };
        }>;
      }>;
      cancel(id: string): PromiseLike<unknown>;
    };
  };
}

export function apiDeLotesDaAnthropic(anthropic: ClienteDaAnthropic): ApiDeLotes {
  return {
    async criar(pedidos) {
      // Sem repetição automática, de propósito: a API não tem chave de
      // idempotência, então cada repetição do SDK após um timeout podia criar (e
      // cobrar) mais um lote com os mesmos envios. Quem decide o que fazer com uma
      // resposta perdida é a conciliação do ciclo.
      const lote = await anthropic.messages.batches.create({ requests: pedidos }, { maxRetries: 0, timeout: TIMEOUT_DA_API_MS });
      return { id: lote.id };
    },
    async consultar(id) {
      const lote = await anthropic.messages.batches.retrieve(id);
      return { status: lote.processing_status };
    },
    async *resultados(id) {
      for await (const item of await anthropic.messages.batches.results(id)) {
        yield { custom_id: item.custom_id, result: item.result as ResultadoDoLote };
      }
    },
    async listar(desde) {
      // Só a primeira página (os 20 mais novos): a conciliação procura lotes
      // criados há minutos.
      const pagina = await anthropic.messages.batches.list({ limit: 20 });
      const limite = new Date(desde).getTime();
      const lotes: LoteNaApi[] = [];
      for (const l of pagina.data) {
        if (new Date(l.created_at).getTime() < limite) continue;
        const c = l.request_counts;
        lotes.push({ id: l.id, criadoEm: l.created_at, total: c.canceled + c.errored + c.expired + c.processing + c.succeeded });
      }
      return lotes;
    },
    async cancelar(id) {
      await anthropic.messages.batches.cancel(id);
    },
  };
}
