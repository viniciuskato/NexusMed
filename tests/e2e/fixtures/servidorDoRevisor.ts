import {
  executarCiclo,
  type ApiDeLotes,
  type Conferencia,
  type LeitorDeMaterial,
  type MensagemDaApi,
  type ResumoDoCiclo,
} from '../../../supabase/functions/revisar-envios/ciclo.ts';
import { bancoDoSupabase, type ClienteDoBanco } from '../../../supabase/functions/revisar-envios/banco.ts';
import { BASE_DO_REVISOR } from '../../../supabase/functions/revisar-envios/gerado/textos.ts';
import * as validacaoGerada from '../../../supabase/functions/revisar-envios/gerado/validacao.js';
import type { ModuloDeValidacao } from '../../../supabase/functions/revisar-envios/tipos.ts';
import { getAdminClient } from './localSupabase';

// O servidor do revisor de IA (44-F/44-G) rodando de verdade nos testes de
// navegador, com UMA diferença: a API paga é simulada. O ciclo, a ponte com o
// banco (as funções `revisao_*` e `revisao_publicar_envio`), a conferência do
// padrão e a leitura do texto são os do servidor real, contra o Supabase LOCAL
// (`getAdminClient` recusa qualquer URL que não seja local). Nenhuma chamada à
// Anthropic é feita.

const TEXTO_APTO = '1. Fato — seção Primeira seção: confere com as fontes.\n\nAPTO PARA ENVIAR';
const TEXTO_NAO_APTO =
  '1. **Fato** — seção Primeira seção: o dado não confere com a fonte.\n\nNÃO APTO — 1 achado grave\n\n```\nCorrija o material conforme os achados abaixo, mude só o que eles pedem e entregue os dois blocos de novo (o .md inteiro e O QUE MUDEI):\n1. Dado: corrigir conforme a fonte.\n```';

function resposta(veredito: 'apto' | 'nao_apto'): MensagemDaApi {
  return {
    stop_reason: 'end_turn',
    model: 'simulado-no-teste',
    content: [{ type: 'text', text: veredito === 'apto' ? TEXTO_APTO : TEXTO_NAO_APTO }],
    usage: { input_tokens: 1000, output_tokens: 500 },
  };
}

/** Uma API de lotes de mentira que guarda os lotes criados e responde o veredito pedido. */
export function apiSimulada(veredito: 'apto' | 'nao_apto' = 'apto'): ApiDeLotes & { lotesCriados: string[][] } {
  const lotes = new Map<string, string[]>();
  return {
    get lotesCriados() {
      return [...lotes.values()];
    },
    async criar(pedidos) {
      const id = `msgbatch_e2e_${lotes.size + 1}_${Date.now()}`;
      lotes.set(id, pedidos.map((p) => p.custom_id));
      return { id };
    },
    async consultar() {
      return { status: 'ended' as const };
    },
    async *resultados(id) {
      for (const customId of lotes.get(id) ?? []) {
        yield { custom_id: customId, result: { type: 'succeeded' as const, message: resposta(veredito) } };
      }
    },
    async listar() {
      return [];
    },
    async cancelar() {
      return undefined;
    },
  };
}

/**
 * Roda `ciclos` disparos do servidor (o 1º envia o lote, o 2º coleta o resultado e
 * publica). Devolve o resumo de cada um.
 */
export async function rodarServidorDoRevisor(
  opcoes: { veredito?: 'apto' | 'nao_apto'; ciclos?: number } = {},
): Promise<ResumoDoCiclo[]> {
  const { veredito = 'apto', ciclos = 2 } = opcoes;
  const modulo = validacaoGerada as unknown as ModuloDeValidacao;
  const conferir: Conferencia = (envio, catalogo) => {
    const leitura = modulo.lerArquivoParaEnvio(envio.texto, catalogo.disciplines, catalogo.themes);
    const avaliacao = modulo.avaliarEnvio(
      leitura,
      { disciplineId: envio.disciplineId, themeId: envio.themeId },
      catalogo.disciplines,
      catalogo.themes,
    );
    return { aceito: avaliacao.aceito, motivos: modulo.motivosDaReprovacao(avaliacao) };
  };
  const lerMaterial: LeitorDeMaterial = (envio, catalogo) =>
    modulo.lerMaterialParaPublicar(envio.texto, catalogo.disciplines, catalogo.themes);
  const banco = bancoDoSupabase(getAdminClient() as unknown as ClienteDoBanco);
  const api = apiSimulada(veredito);
  const resumos: ResumoDoCiclo[] = [];
  for (let i = 0; i < ciclos; i += 1) {
    resumos.push(
      await executarCiclo({
        banco,
        api,
        conferir,
        lerMaterial,
        baseDoRevisor: BASE_DO_REVISOR,
        baseSha256: 'e2e-simulado',
        novoCodigo: () => crypto.randomUUID(),
      }),
    );
  }
  return resumos;
}
