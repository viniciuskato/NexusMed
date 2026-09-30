import { describe, it, expect } from 'vitest';
import {
  executarCiclo,
  type ApiDeLotes,
  type Banco,
  type DepsDoCiclo,
  type LoteNaApi,
  type MensagemDaApi,
  type Pendente,
  type Reservado,
  type ResultadoDoLote,
  type ResultadoRegistrado,
  type Uso,
} from '../../supabase/functions/revisar-envios/ciclo.ts';
import { TIMEOUT_DA_API_MS, apiDeLotesDaAnthropic, type ClienteDaAnthropic } from '../../supabase/functions/revisar-envios/api.ts';
import type { PedidoDeLote } from '../../supabase/functions/revisar-envios/montagem.ts';
import { materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';

// 44-F, rodada 2 — dinheiro, concorrência e histórico da continuação, com um
// "mundo" simulado que se comporta como o banco e como a API de lotes:
//  * a API não tem chave de idempotência: pedir o lote duas vezes cria dois lotes;
//  * uma resposta perdida (timeout, conexão cortada) não diz se o lote existe.
// Nenhuma chamada real.

const RELOGIO_INICIAL = Date.parse('2026-09-30T12:00:00.000Z');
const MINUTO = 60_000;

type Estado = 'reservada' | 'incerta' | 'submetida' | 'pausada' | 'concluida' | 'erro';
interface Revisao {
  id: string;
  envio: Reservado;
  estado: Estado;
  batchId: string | null;
  tentativaEm: string | null;
  continuacao: unknown[][] | null;
  cobravel: boolean;
  uso: Uso;
  veredito: string | null;
  tentativas: number;
}
interface LoteSimulado {
  id: string;
  criadoEm: string;
  pedidos: PedidoDeLote[];
  cancelado: boolean;
  /** O que a API devolve por custom_id quando o lote termina. */
  resultado: (customId: string, pedido: PedidoDeLote) => ResultadoDoLote;
  terminado: boolean;
}

const USO_ZERO: Uso = { entrada: 0, saida: 0, cacheCriado: 0, cacheLido: 0, buscas: 0, leituras: 0 };
const somar = (a: Uso, b: Uso): Uso => ({
  entrada: a.entrada + b.entrada,
  saida: a.saida + b.saida,
  cacheCriado: a.cacheCriado + b.cacheCriado,
  cacheLido: a.cacheLido + b.cacheLido,
  buscas: a.buscas + b.buscas,
  leituras: a.leituras + b.leituras,
});

function envio(n: number): Reservado {
  return {
    reviewId: `rev-${n}`,
    submissionId: `sub-${n}`,
    titulo: `Material ${n}`,
    texto: materialParaEnvio({ titulo: `Material ${n}` }),
    sha256: `sha-${n}`,
    disciplineId: 'd1',
    themeId: 't1',
    disciplina: 'Farmacologia',
    tema: 'Clínica',
    pai: null,
  };
}

const CATALOGO = {
  disciplines: [{ id: 'd1', name: 'Farmacologia' }],
  themes: [{ id: 't1', name: 'Clínica', disciplineId: 'd1' }],
};

function msg(texto: string, stop = 'end_turn', extra: Partial<MensagemDaApi['usage']> = {}, conteudoExtra: MensagemDaApi['content'] = []): MensagemDaApi {
  return {
    stop_reason: stop,
    model: 'claude-opus-5-5',
    content: [...conteudoExtra, { type: 'text', text: texto }],
    usage: { input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 }, ...extra },
  };
}

const ACHADOS = '1. Fato — tudo confere.';
const APTO = `${ACHADOS}\n\nAPTO PARA ENVIAR`;

class Mundo {
  agora = RELOGIO_INICIAL;
  fila: Reservado[] = [];
  revisoes = new Map<string, Revisao>();
  lotes: LoteSimulado[] = [];
  travaToken: string | null = null;
  travaAte = 0;
  proximoLote = 1;
  /** Como a API responde ao pedido de lote. */
  modoDeCriar: 'ok' | 'perde_resposta' | 'recusa_4xx' = 'ok';
  /** Quantos pedidos de criação chegaram à API (com ou sem resposta). */
  pedidosDeCriacao = 0;
  falhasAoAnexar = 0;
  resultadoPadrao: LoteSimulado['resultado'] = () => ({ type: 'succeeded', message: msg(APTO) });
  atrasoAoCriar: Promise<void> | null = null;
  /** A API de listar lotes fora do ar (a conciliação não consegue olhar). */
  listaFalha = false;
  registrados: ResultadoRegistrado[] = [];

  iso(ms = this.agora) {
    return new Date(ms).toISOString();
  }
  avanca(min: number) {
    this.agora += min * MINUTO;
  }

  /** Revisões que contam no limite diário/mensal (não foram apagadas e são cobráveis). */
  contadas() {
    return [...this.revisoes.values()].filter((r) => r.cobravel);
  }

  banco: Banco = {
    travar: async () => {
      if (this.travaToken && this.travaAte > this.agora) return null;
      this.travaToken = `tok-${this.agora}-${Math.random()}`;
      this.travaAte = this.agora + 240_000;
      return this.travaToken;
    },
    destravar: async (t) => {
      if (this.travaToken === t) this.travaAte = 0;
    },
    liberarReservasVelhas: async () => 0,
    pendentes: async (): Promise<Pendente[]> =>
      [...this.revisoes.values()]
        .filter((r) => r.estado === 'submetida' || r.estado === 'pausada' || r.estado === 'incerta')
        .map((r) => ({ reviewId: r.id, status: r.estado as Pendente['status'], batchId: r.batchId, tentativaEm: r.tentativaEm })),
    reservar: async (max) => {
      const pegos = this.fila.splice(0, max);
      for (const e of pegos) {
        this.revisoes.set(e.reviewId, {
          id: e.reviewId, envio: e, estado: 'reservada', batchId: null, tentativaEm: null, continuacao: null,
          cobravel: true, uso: USO_ZERO, veredito: null, tentativas: 1,
        });
      }
      return pegos;
    },
    dadosDoEnvio: async (ids) => ids.map((id) => ({ ...this.revisoes.get(id)!.envio, continuacao: this.revisoes.get(id)!.continuacao })),
    catalogo: async () => CATALOGO,
    marcarIncerta: async (ids) => {
      const t = this.iso();
      let n = 0;
      for (const id of ids) {
        const r = this.revisoes.get(id);
        if (r && (r.estado === 'reservada' || r.estado === 'pausada')) {
          r.estado = 'incerta';
          r.tentativaEm = t;
          n += 1;
        }
      }
      return n > 0 ? t : null;
    },
    anexarLote: async (ids, batchId) => {
      if (this.falhasAoAnexar > 0) {
        this.falhasAoAnexar -= 1;
        throw new Error('banco fora do ar');
      }
      let n = 0;
      for (const id of ids) {
        const r = this.revisoes.get(id);
        if (r && ['reservada', 'pausada', 'incerta'].includes(r.estado)) {
          r.estado = 'submetida';
          r.batchId = batchId;
          n += 1;
        }
      }
      return n;
    },
    liberar: async (ids) => {
      let n = 0;
      for (const id of ids) {
        const r = this.revisoes.get(id);
        if (!r || !['reservada', 'incerta'].includes(r.estado)) continue;
        if (r.continuacao) {
          r.estado = 'pausada';
          r.tentativaEm = null;
        } else {
          this.revisoes.delete(id);
          this.fila.unshift(r.envio);
        }
        n += 1;
      }
      return n;
    },
    pausar: async (id, conteudo, uso) => {
      const r = this.revisoes.get(id);
      if (!r || r.estado !== 'submetida' || r.tentativas >= 3) return false;
      r.estado = 'pausada';
      r.continuacao = [...(r.continuacao ?? []), conteudo];
      r.tentativas += 1;
      r.uso = somar(r.uso, uso);
      r.tentativaEm = null;
      return true;
    },
    registrar: async (res) => {
      const r = this.revisoes.get(res.reviewId);
      if (!r || !['submetida', 'reservada'].includes(r.estado)) return false;
      r.estado = res.veredito === 'erro' ? 'erro' : 'concluida';
      r.veredito = res.veredito;
      r.uso = somar(r.uso, res.uso);
      r.cobravel = res.cobravel || r.tentativas > 1 || r.uso.entrada > 0;
      this.registrados.push(res);
      return true;
    },
    paraPublicar: async () => [],
    publicar: async () => ({ desfecho: 'publicado' as const, materialId: 'material-1' }),
    paraPublicarQuestoes: async () => [],
    publicarQuestoes: async () => ({ desfecho: 'fora_de_estado' as const, questionIds: [] }),
    recusarPublicacaoDeQuestoes: async () => false,
    recusarPublicacao: async () => true,
  };

  api: ApiDeLotes = {
    criar: async (pedidos) => {
      this.pedidosDeCriacao += 1;
      if (this.atrasoAoCriar) await this.atrasoAoCriar;
      if (this.modoDeCriar === 'recusa_4xx') throw Object.assign(new Error('400 invalid_request_error'), { status: 400 });
      const lote: LoteSimulado = {
        id: `msgbatch_${this.proximoLote++}`, criadoEm: this.iso(), pedidos, cancelado: false, terminado: false,
        resultado: this.resultadoPadrao,
      };
      this.lotes.push(lote);
      if (this.modoDeCriar === 'perde_resposta') throw new Error('fetch failed: conexão cortada antes da resposta');
      return { id: lote.id };
    },
    consultar: async (id) => ({ status: this.lotes.find((l) => l.id === id)?.terminado ? 'ended' : 'in_progress' }),
    resultados: (id) => {
      const lote = this.lotes.find((l) => l.id === id)!;
      return (async function* () {
        for (const p of lote.pedidos) yield { custom_id: p.custom_id, result: lote.resultado(p.custom_id, p) };
      })();
    },
    listar: async (desde): Promise<LoteNaApi[]> => {
      if (this.listaFalha) throw new Error('API fora do ar ao listar os lotes');
      return this.lotes
        .filter((l) => Date.parse(l.criadoEm) >= Date.parse(desde))
        .map((l) => ({ id: l.id, criadoEm: l.criadoEm, total: l.pedidos.length }))
        .reverse();
    },
    cancelar: async (id) => {
      const l = this.lotes.find((x) => x.id === id);
      if (l) l.cancelado = true;
    },
  };

  deps(extra: Partial<DepsDoCiclo> = {}): DepsDoCiclo {
    let n = 0;
    return {
      banco: this.banco,
      api: this.api,
      conferir: () => ({ aceito: true, motivos: [] }),
      lerMaterial: () => ({ ok: false, motivos: ['fora do escopo destes testes'] }),
      baseDoRevisor: 'BASE',
      baseSha256: 'sha-do-sistema',
      novoCodigo: () => `codigo-${++n}`,
      agora: () => this.agora,
      ...extra,
    };
  }

  /** Lotes ativos (não cancelados) que carregam o envio. */
  lotesDoEnvio(reviewId: string) {
    return this.lotes.filter((l) => !l.cancelado && l.pedidos.some((p) => p.custom_id === reviewId));
  }
  terminaTodos() {
    for (const l of this.lotes) l.terminado = true;
  }
}

describe('44-F r2 — falha incerta ao criar o lote: nada é devolvido de graça nem criado em dobro', () => {
  /** Um cliente do SDK que se comporta como o SDK real: repete até `maxRetries` vezes e, aqui, perde a resposta. */
  function sdkQuePerdeAResposta() {
    const criados: PedidoDeLote[][] = [];
    const cliente: ClienteDaAnthropic = {
      messages: {
        batches: {
          create: async (body, options) => {
            const tentativas = 1 + (options?.maxRetries ?? 2); // o SDK repete 2 vezes por padrão
            for (let i = 0; i < tentativas; i += 1) {
              criados.push(body.requests); // a API cria o lote...
              // ...mas a resposta se perde (timeout): o SDK vê um erro de conexão e repete.
            }
            throw new Error('Connection error.');
          },
          retrieve: async () => ({ processing_status: 'in_progress' as const }),
          results: async () => (async function* () {})(),
          list: async () => ({ data: [] }),
          cancel: async () => ({}),
        },
      },
    };
    return { cliente, criados };
  }

  it('o defeito, reproduzido: o SDK com as repetições padrão cria 3 lotes para o mesmo envio e nenhuma revisão fica contada', async () => {
    const { cliente, criados } = sdkQuePerdeAResposta();
    await expect(cliente.messages.batches.create({ requests: [{ custom_id: 'rev-1' } as PedidoDeLote] })).rejects.toThrow();
    expect(criados).toHaveLength(3); // "lotes criados na API para o mesmo envio: 3"
  });

  it('com o adaptador do servidor (maxRetries 0), a mesma falha cria 1 lote só', async () => {
    const { cliente, criados } = sdkQuePerdeAResposta();
    const api = apiDeLotesDaAnthropic(cliente);
    await expect(api.criar([{ custom_id: 'rev-1' } as PedidoDeLote])).rejects.toThrow();
    expect(criados).toHaveLength(1);
  });

  it('o pedido de criação leva maxRetries 0 e prazo bem abaixo do limite da função', async () => {
    let opcoes: { maxRetries?: number; timeout?: number } | undefined;
    const cliente = sdkQuePerdeAResposta().cliente;
    cliente.messages.batches.create = async (_b, o) => {
      opcoes = o;
      return { id: 'msgbatch_x' };
    };
    await apiDeLotesDaAnthropic(cliente).criar([]);
    expect(opcoes).toEqual({ maxRetries: 0, timeout: TIMEOUT_DA_API_MS });
    expect(TIMEOUT_DA_API_MS).toBeLessThan(150_000);
  });

  it('CICLO COMPLETO: API que cria o lote e perde a resposta → 1 lote na API e 1 revisão contada; depois o lote é adotado, coletado e o envio termina apto', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1)];
    mundo.modoDeCriar = 'perde_resposta';

    // Ciclo 1: pede o lote, a resposta se perde.
    const r1 = await executarCiclo(mundo.deps());
    expect(r1.loteIncerto).toBe(true);
    expect(mundo.lotes).toHaveLength(1); // lotes criados na API para o mesmo envio: 1
    expect(mundo.contadas()).toHaveLength(1); // revisões que contam no limite: 1
    expect(mundo.revisoes.get('rev-1')?.estado).toBe('incerta');
    expect(mundo.fila).toHaveLength(0); // não voltou para a fila

    // Ciclo 2, 6 min depois: NÃO reenvia; acha o lote pela lista da API e o adota.
    mundo.avanca(6);
    mundo.modoDeCriar = 'ok';
    const r2 = await executarCiclo(mundo.deps());
    expect(r2.lotesConciliados).toBe(1);
    expect(r2.enviadosAoLote).toBe(0);
    expect(mundo.lotes).toHaveLength(1);
    expect(mundo.revisoes.get('rev-1')).toMatchObject({ estado: 'submetida', batchId: 'msgbatch_1' });
    expect(mundo.contadas()).toHaveLength(1);

    // Ciclo 3: o lote terminou; o resultado é lido e registrado uma vez.
    mundo.terminaTodos();
    await executarCiclo(mundo.deps());
    expect(mundo.revisoes.get('rev-1')).toMatchObject({ estado: 'concluida', veredito: 'apto' });
    expect(mundo.lotes).toHaveLength(1);
    expect(mundo.contadas()).toHaveLength(1);
    expect(mundo.pedidosDeCriacao).toBe(1);
  });

  it('a API recusa o pedido de vez (4xx): o envio volta para a fila, sem contar, e é pedido de novo depois', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1)];
    mundo.modoDeCriar = 'recusa_4xx';
    await executarCiclo(mundo.deps());
    expect(mundo.lotes).toHaveLength(0);
    expect(mundo.contadas()).toHaveLength(0);
    expect(mundo.fila.map((e) => e.reviewId)).toEqual(['rev-1']);

    mundo.modoDeCriar = 'ok';
    await executarCiclo(mundo.deps());
    expect(mundo.lotes).toHaveLength(1);
    expect(mundo.contadas()).toHaveLength(1);
  });

  it('a morte do servidor entre criar e anexar: o lote existe, a revisão está contada e o próximo ciclo o adota sem criar outro', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1), envio(2)];
    mundo.falhasAoAnexar = 3; // as 3 tentativas de anexar falham (servidor caiu)
    const r1 = await executarCiclo(mundo.deps());
    expect(r1.erros.filter((e) => e.startsWith('anexar lote')).length).toBe(3);
    expect(mundo.lotes).toHaveLength(1);
    expect(mundo.contadas()).toHaveLength(2);
    expect([...mundo.revisoes.values()].every((r) => r.estado === 'incerta')).toBe(true);

    mundo.avanca(6);
    const r2 = await executarCiclo(mundo.deps());
    expect(r2.lotesConciliados).toBe(1);
    expect([...mundo.revisoes.values()].every((r) => r.estado === 'submetida' && r.batchId === 'msgbatch_1')).toBe(true);
    expect(mundo.lotes).toHaveLength(1);
  });

  it('queda antes de a API ser tocada: a conciliação não acha lote, espera o prazo e só então devolve o envio à fila', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1)];
    // O servidor grava a tentativa e morre antes de chamar a API.
    await mundo.banco.reservar(5);
    await mundo.banco.marcarIncerta(['rev-1']);

    mundo.avanca(6);
    const cedo = await executarCiclo(mundo.deps());
    expect(cedo.lotesConciliados).toBe(0);
    expect(mundo.revisoes.get('rev-1')?.estado).toBe('incerta'); // ainda no prazo: espera
    expect(mundo.contadas()).toHaveLength(1);

    mundo.avanca(10); // passou dos 15 min
    const tarde = await executarCiclo(mundo.deps());
    // Sem lote nenhum na API, é certo que nada foi gasto: a tentativa velha é apagada
    // (não conta) e o mesmo ciclo reserva o envio de novo e pede o lote: 1 lote no total.
    expect(tarde.reservasLiberadas).toBe(1);
    expect(mundo.lotes).toHaveLength(1);
    expect(mundo.revisoes.get('rev-1')).toMatchObject({ estado: 'submetida', batchId: 'msgbatch_1', tentativas: 1 });
    expect(mundo.contadas()).toHaveLength(1);
    expect(mundo.pedidosDeCriacao).toBe(1);
  });

  it('se a tentativa se repetiu e a API tem dois lotes iguais, adota o mais antigo e NÃO cancela o outro (pode ser o lote legítimo de outra tentativa)', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1)];
    mundo.modoDeCriar = 'perde_resposta';
    await executarCiclo(mundo.deps());
    // Algo repetiu o pedido por fora: um segundo lote igual, criado minutos depois.
    mundo.avanca(1);
    mundo.lotes.push({ ...mundo.lotes[0], id: 'msgbatch_repetido', criadoEm: mundo.iso() });
    mundo.avanca(5);
    mundo.modoDeCriar = 'ok';
    await executarCiclo(mundo.deps());
    expect(mundo.revisoes.get('rev-1')?.batchId).toBe('msgbatch_1');
    expect(mundo.lotes.find((l) => l.id === 'msgbatch_repetido')?.cancelado).toBe(false);
    expect(mundo.lotes.filter((l) => l.cancelado)).toHaveLength(0);
  });

  it('A/B: duas tentativas incertas seguidas, com a lista de lotes falhando no meio → cada uma adota o lote certo e nenhum lote é cancelado', async () => {
    const mundo = new Mundo();
    const lote = (id: string, reviewId: string): LoteSimulado => ({
      id, criadoEm: mundo.iso(), pedidos: [{ custom_id: reviewId } as PedidoDeLote], cancelado: false, terminado: false, resultado: mundo.resultadoPadrao,
    });
    // A: tentativa às 12:00, o lote msgbatch_1 existe, a resposta se perdeu.
    mundo.fila = [envio(1)];
    await mundo.banco.reservar(1);
    await mundo.banco.marcarIncerta(['rev-1']);
    mundo.avanca(1);
    mundo.lotes.push(lote('msgbatch_1', 'rev-1'));
    // B: tentativa às 12:02, o lote msgbatch_2 existe, a resposta também se perdeu.
    mundo.avanca(1);
    mundo.fila = [envio(2)];
    await mundo.banco.reservar(1);
    await mundo.banco.marcarIncerta(['rev-2']);
    mundo.avanca(1);
    mundo.lotes.push(lote('msgbatch_2', 'rev-2'));

    // A API de listar fica fora do ar: a conciliação não resolve nenhuma das duas.
    mundo.listaFalha = true;
    mundo.avanca(5);
    const r1 = await executarCiclo(mundo.deps());
    expect(r1.erros.join(' ')).toContain('conciliação');
    expect(mundo.revisoes.get('rev-1')?.estado).toBe('incerta');
    expect(mundo.revisoes.get('rev-2')?.estado).toBe('incerta');
    expect(mundo.lotes.filter((l) => l.cancelado)).toHaveLength(0);

    // A API volta: A adota o lote mais antigo, B adota o outro, ninguém cancela nada.
    mundo.listaFalha = false;
    mundo.avanca(5);
    const r2 = await executarCiclo(mundo.deps());
    expect(r2.lotesConciliados).toBe(2);
    expect(mundo.revisoes.get('rev-1')).toMatchObject({ estado: 'submetida', batchId: 'msgbatch_1' });
    expect(mundo.revisoes.get('rev-2')).toMatchObject({ estado: 'submetida', batchId: 'msgbatch_2' });
    expect(mundo.lotes.filter((l) => l.cancelado)).toHaveLength(0);

    // Os dois lotes terminam: cada pessoa recebe o resultado do seu envio.
    mundo.terminaTodos();
    await executarCiclo(mundo.deps());
    expect(mundo.revisoes.get('rev-1')).toMatchObject({ estado: 'concluida', veredito: 'apto' });
    expect(mundo.revisoes.get('rev-2')).toMatchObject({ estado: 'concluida', veredito: 'apto' });
    expect(mundo.registrados.map((r) => r.reviewId).sort()).toEqual(['rev-1', 'rev-2']);
  });

  it('com uma tentativa incerta sem solução, o ciclo NÃO cria lote novo nem reserva envios (nem continua revisão pausada)', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1)];
    mundo.modoDeCriar = 'perde_resposta';
    await executarCiclo(mundo.deps()); // A: msgbatch_1 criado, resposta perdida → incerta
    expect(mundo.lotes).toHaveLength(1);

    // Chega o envio B e a lista de lotes está fora do ar: A continua sem solução.
    mundo.fila.push(envio(2));
    mundo.modoDeCriar = 'ok';
    mundo.listaFalha = true;
    mundo.avanca(6);
    const r2 = await executarCiclo(mundo.deps());
    expect(r2.semLoteNovoPorIncerta).toBe(true);
    expect(r2.enviadosAoLote).toBe(0);
    expect(mundo.lotes).toHaveLength(1); // nenhum lote novo
    expect(mundo.pedidosDeCriacao).toBe(1);
    expect(mundo.fila.map((e) => e.reviewId)).toEqual(['rev-2']); // B nem foi reservado

    // A lista volta: A adota o seu lote e, no mesmo ciclo, B já pode ir num lote novo.
    mundo.listaFalha = false;
    mundo.avanca(6);
    const r3 = await executarCiclo(mundo.deps());
    expect(r3.lotesConciliados).toBe(1);
    expect(r3.semLoteNovoPorIncerta).toBe(false);
    expect(mundo.revisoes.get('rev-1')).toMatchObject({ estado: 'submetida', batchId: 'msgbatch_1' });
    expect(mundo.revisoes.get('rev-2')).toMatchObject({ estado: 'submetida', batchId: 'msgbatch_2' });
    expect(mundo.lotes.map((l) => l.pedidos.map((p) => p.custom_id))).toEqual([['rev-1'], ['rev-2']]);
  });

  it('um lote que já tem dono nunca é adotado por outra tentativa incerta', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1)];
    await executarCiclo(mundo.deps()); // cria msgbatch_1 com rev-1, normalmente
    mundo.fila = [envio(2)];
    mundo.modoDeCriar = 'perde_resposta';
    mundo.avanca(1);
    await executarCiclo(mundo.deps()); // msgbatch_2 com rev-2, resposta perdida
    mundo.avanca(6);
    mundo.modoDeCriar = 'ok';
    await executarCiclo(mundo.deps());
    expect(mundo.revisoes.get('rev-1')?.batchId).toBe('msgbatch_1');
    expect(mundo.revisoes.get('rev-2')?.batchId).toBe('msgbatch_2');
  });
});

describe('44-F r2 — um ciclo por vez', () => {
  it('dois disparos sobrepostos: o segundo sai sem trabalho e o lote de continuação é criado uma vez só', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1)];
    // Uma revisão pausada esperando continuar.
    await mundo.banco.reservar(5);
    const rev = mundo.revisoes.get('rev-1')!;
    rev.estado = 'pausada';
    rev.continuacao = [[{ type: 'text', text: 'parcial' }]];
    let libera!: () => void;
    mundo.atrasoAoCriar = new Promise<void>((r) => (libera = r));

    const primeiro = executarCiclo(mundo.deps());
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const segundo = await executarCiclo(mundo.deps()); // enquanto o primeiro espera a API
    expect(segundo.pulado).toBe(true);
    expect(segundo.enviadosAoLote).toBe(0);

    libera();
    const r1 = await primeiro;
    expect(r1.pulado).toBe(false);
    expect(mundo.pedidosDeCriacao).toBe(1);
    expect(mundo.lotes).toHaveLength(1);
    expect(mundo.lotesDoEnvio('rev-1')).toHaveLength(1);
  });

  it('a trava é devolvida ao terminar (o disparo seguinte trabalha) e também quando o ciclo quebra', async () => {
    const mundo = new Mundo();
    const um = await executarCiclo(mundo.deps());
    expect(um.pulado).toBe(false);
    const dois = await executarCiclo(mundo.deps());
    expect(dois.pulado).toBe(false);

    const quebrado = mundo.deps({ banco: { ...mundo.banco, pendentes: async () => { throw new Error('banco caiu'); } } });
    await expect(executarCiclo(quebrado)).rejects.toThrow('banco caiu');
    const tres = await executarCiclo(mundo.deps());
    expect(tres.pulado).toBe(false);
  });

  it('a trava vence sozinha: se o servidor morrer com ela pega, o disparo seguinte, passado o prazo, trabalha', async () => {
    const mundo = new Mundo();
    await mundo.banco.travar(); // ficou pega
    expect((await executarCiclo(mundo.deps())).pulado).toBe(true);
    mundo.avanca(5); // a validade é 4 min
    expect((await executarCiclo(mundo.deps())).pulado).toBe(false);
  });
});

describe('44-F r2 — a continuação acumula o histórico (pause_turn)', () => {
  const CONTEUDO_1 = [
    { type: 'thinking', thinking: '', signature: 'assinatura-1' },
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'bula' } },
    { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] },
    { type: 'text', text: 'Vou conferir a bula.' },
  ];
  const CONTEUDO_2 = [
    { type: 'server_tool_use', id: 'srvtoolu_2', name: 'web_fetch', input: { url: 'https://exemplo.org/bula' } },
    { type: 'web_fetch_tool_result', tool_use_id: 'srvtoolu_2', content: {} },
  ];

  it('duas pausas seguidas: o 3º pedido leva o pedido e as duas respostas pausadas, na ordem; o gasto se soma', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1)];
    let rodada = 0;
    mundo.resultadoPadrao = () => {
      rodada += 1;
      if (rodada === 1) return { type: 'succeeded', message: { ...msg('', 'pause_turn', { input_tokens: 10, output_tokens: 20 }), content: CONTEUDO_1 } };
      if (rodada === 2) return { type: 'succeeded', message: { ...msg('', 'pause_turn', { input_tokens: 30, output_tokens: 40 }), content: CONTEUDO_2 } };
      return { type: 'succeeded', message: msg(APTO, 'end_turn', { input_tokens: 5, output_tokens: 6 }) };
    };

    await executarCiclo(mundo.deps()); // pede o lote 1
    mundo.terminaTodos();
    await executarCiclo(mundo.deps()); // coleta a pausa 1 e já pede o lote 2 (continuação)
    expect(mundo.lotes).toHaveLength(2);
    const segundoPedido = mundo.lotes[1].pedidos[0].params.messages;
    expect(segundoPedido.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(segundoPedido[1].content).toEqual(CONTEUDO_1);

    mundo.terminaTodos();
    await executarCiclo(mundo.deps()); // coleta a pausa 2 e pede o lote 3
    expect(mundo.lotes).toHaveLength(3);
    const terceiroPedido = mundo.lotes[2].pedidos[0].params.messages;
    expect(terceiroPedido.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant']);
    expect(terceiroPedido[1].content).toEqual(CONTEUDO_1); // a 2ª continuação NÃO perde as buscas da 1ª
    expect(terceiroPedido[2].content).toEqual(CONTEUDO_2);
    // O bloco de raciocínio volta intacto, com a assinatura.
    expect(JSON.stringify(terceiroPedido[1].content)).toContain('assinatura-1');

    mundo.terminaTodos();
    await executarCiclo(mundo.deps()); // coleta o resultado final
    const r = mundo.revisoes.get('rev-1')!;
    expect(r).toMatchObject({ estado: 'concluida', veredito: 'apto' });
    expect(r.continuacao).toEqual([CONTEUDO_1, CONTEUDO_2]);
    // 10+30+5 de entrada, 20+40+6 de saída: cada pausa soma, nenhuma sobrescreve.
    expect(r.uso.entrada).toBe(45);
    expect(r.uso.saida).toBe(66);
    expect(r.cobravel).toBe(true);
    expect(mundo.contadas()).toHaveLength(1);
  });

  it('cada continuação usa o mesmo sistema e as mesmas ferramentas (a API exige as ferramentas)', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1)];
    let rodada = 0;
    mundo.resultadoPadrao = () => ({ type: 'succeeded', message: rodada++ === 0 ? { ...msg('', 'pause_turn'), content: CONTEUDO_1 } : msg(APTO) });
    await executarCiclo(mundo.deps());
    mundo.terminaTodos();
    await executarCiclo(mundo.deps());
    const [a, b] = [mundo.lotes[0].pedidos[0].params, mundo.lotes[1].pedidos[0].params];
    expect(b.tools).toEqual(a.tools);
    expect(b.system).toEqual(a.system);
    expect(b.model).toBe(a.model);
  });
});

describe('44-F r2 — prazo do ciclo', () => {
  it('passado o prazo, o ciclo não começa lote novo nem coleta o que falta (deixa para o próximo disparo)', async () => {
    const mundo = new Mundo();
    mundo.fila = [envio(1)];
    // Um lote antigo esperando coleta.
    mundo.revisoes.set('rev-9', {
      id: 'rev-9', envio: envio(9), estado: 'submetida', batchId: 'msgbatch_9', tentativaEm: null, continuacao: null,
      cobravel: true, uso: USO_ZERO, veredito: null, tentativas: 1,
    });
    mundo.lotes.push({ id: 'msgbatch_9', criadoEm: mundo.iso(), pedidos: [], cancelado: false, terminado: true, resultado: mundo.resultadoPadrao });
    let chamadas = 0;
    const relogio = () => {
      chamadas += 1;
      return mundo.agora + (chamadas > 2 ? 200_000 : 0); // depois de 2 leituras do relógio, já estourou
    };
    const resumo = await executarCiclo(mundo.deps({ agora: relogio, prazoMs: 100_000 }));
    expect(resumo.erros.join(' ')).toContain('prazo do ciclo esgotado');
    expect(mundo.lotes).toHaveLength(1); // nenhum lote novo
    expect(mundo.fila).toHaveLength(1); // nada reservado
  });
});
