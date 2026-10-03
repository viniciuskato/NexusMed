// Edge Function `revisar-envios` (44-F): o revisor de IA do NexusMed.
//
// Quem a chama é o agendador do banco (pg_cron + pg_net, a cada poucos minutos),
// com o segredo REVISOR_SEGREDO no cabeçalho Authorization. Cada disparo:
//   1. coleta os lotes que a API da Anthropic já terminou (Message Batches API:
//      metade do preço, sem prender requisição até a revisão acabar);
//   2. publica os envios que a revisão aprovou ("apto"): o banco cria o material,
//      publica e grava a proveniência "revisado por IA" numa transação só (44-G);
//   3. reserva envios "aguardando revisão" (com os limites de custo do banco),
//      confere o arquivo no servidor e cria um lote novo.
// Segredos (nunca no repositório nem no cliente): ANTHROPIC_API_KEY e
// REVISOR_SEGREDO, criados pelo dono no painel do Supabase. SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY o Supabase já injeta.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { bancoDoSupabase, type ClienteDoBanco } from './banco.ts';
import { apiDeLotesDaAnthropic, TIMEOUT_DA_API_MS, type ClienteDaAnthropic } from './api.ts';
import { executarCiclo } from './ciclo.ts';
import { montarConferencias } from './conferencias.ts';
import { montarSistema, montarSistemaDeQuestoes } from './montagem.ts';
import { BASE_DO_REVISOR, BASE_DO_REVISOR_DE_QUESTOES } from './gerado/textos.ts';
import * as validacao from './gerado/validacao.js';
import { sha256Hex, verificarChamada } from './seguranca.ts';
import type { ModuloDeValidacao } from './tipos.ts';

declare const Deno: {
  env: { get(nome: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

async function tratar(req: Request): Promise<Response> {
  const ambiente = {
    REVISOR_SEGREDO: Deno.env.get('REVISOR_SEGREDO'),
    ANTHROPIC_API_KEY: Deno.env.get('ANTHROPIC_API_KEY'),
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  };
  const portaria = verificarChamada({ metodo: req.method, authorization: req.headers.get('authorization') }, ambiente);
  if (!portaria.ok) return json({ erro: portaria.erro }, portaria.status);

  const cliente = createClient(ambiente.SUPABASE_URL as string, ambiente.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
  // Prazo por chamada abaixo do limite de tempo da função. As leituras podem
  // repetir uma vez; a criação de lote NUNCA repete (ver api.ts).
  const anthropic = new Anthropic({
    apiKey: ambiente.ANTHROPIC_API_KEY as string,
    timeout: TIMEOUT_DA_API_MS,
    maxRetries: 1,
  });
  const api = apiDeLotesDaAnthropic(anthropic as unknown as ClienteDaAnthropic);

  // As mesmas conferências do revisor local (D-12): ver conferencias.ts.
  const { conferir, lerMaterial, lerQuestoes } = montarConferencias(validacao as unknown as ModuloDeValidacao);

  const sistemaCompleto = montarSistema(BASE_DO_REVISOR);
  const sistemaDeQuestoes = montarSistemaDeQuestoes(BASE_DO_REVISOR_DE_QUESTOES);
  const resumo = await executarCiclo({
    banco: bancoDoSupabase(cliente as unknown as ClienteDoBanco),
    api,
    conferir,
    lerMaterial,
    lerQuestoes,
    baseDoRevisorDeQuestoes: BASE_DO_REVISOR_DE_QUESTOES,
    baseSha256DeQuestoes: await sha256Hex(sistemaDeQuestoes),
    baseDoRevisor: BASE_DO_REVISOR,
    baseSha256: await sha256Hex(sistemaCompleto),
    novoCodigo: () => crypto.randomUUID(),
  });
  return json(resumo);
}

Deno.serve(async (req) => {
  try {
    return await tratar(req);
  } catch (e) {
    // Nunca devolve detalhe interno nem o texto de nenhum envio.
    console.error('revisar-envios:', e instanceof Error ? e.message : String(e));
    return json({ erro: 'falha interna' }, 500);
  }
});
