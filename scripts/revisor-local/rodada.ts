// Uma rodada do revisor local (D-12): o que o agendador dispara a cada 15 minutos.
//
// Fila vazia: termina sem chamar o claude (e sem chamar nenhuma função de escrita). Com trabalho: roda o
// MESMO ciclo da Edge Function `revisar-envios` (`executarCiclo`, com a mesma ponte `bancoDoSupabase`, as
// mesmas conferências, os mesmos textos de instrução e a mesma leitura do veredito), trocando só a API de
// lotes pelo `claude -p` (`apiViaClaude`). Como o claude responde na hora, a rodada repete o ciclo: o
// primeiro pede o veredito de UM envio, o seguinte o coleta, registra e publica, e assim até a fila secar.
import {
  executarCiclo,
  type Banco,
  type DepsDoCiclo,
  type ResumoDoCiclo,
} from '../../supabase/functions/revisar-envios/ciclo.ts';
import { bancoDoSupabase } from '../../supabase/functions/revisar-envios/banco.ts';
import { montarConferencias } from '../../supabase/functions/revisar-envios/conferencias.ts';
import { BASE_DO_REVISOR, BASE_DO_REVISOR_DE_QUESTOES } from '../../supabase/functions/revisar-envios/gerado/textos.ts';
import * as validacaoGerada from '../../supabase/functions/revisar-envios/gerado/validacao.js';
import { montarSistema, montarSistemaDeQuestoes } from '../../supabase/functions/revisar-envios/montagem.ts';
import { sha256Hex } from '../../supabase/functions/revisar-envios/seguranca.ts';
import type { ModuloDeValidacao } from '../../supabase/functions/revisar-envios/tipos.ts';
import { clienteDoBanco, filaTemTrabalho, primeiraLinha, type ExecutorSql } from './banco-cli.ts';
import { apiViaClaude, type ContadorDeFalhas, type Perguntar } from './claude.ts';
import { idCurto, type Registrar } from './log.ts';

export interface DepsDaRodada {
  exec: ExecutorSql;
  perguntar: Perguntar;
  /** Falso quando o claude.exe não foi achado: com trabalho na fila, a rodada para antes de tocar no banco. */
  claudeDisponivel: boolean;
  falhas: ContadorDeFalhas;
  registrar: Registrar;
  /** De onde vem o banco, só para o registro ("remoto" ou "local"). */
  rotuloDoAlvo: string;
  agora?: () => number;
  /** Depois disto, a rodada não começa envio novo. */
  orcamentoMs?: number;
  /** O ciclo não começa trabalho novo depois disto (cobre o tempo máximo do claude). */
  prazoDoCicloMs?: number;
  maxCiclos?: number;
}

export interface TotaisDaRodada {
  enviados: number;
  resultados: number;
  publicados: number;
  atualizados: number;
  reprovadosAntesDaIa: number;
  publicacoesRecusadas: number;
  conciliados: number;
  liberadas: number;
}

export interface ResumoDaRodada {
  fila: 'vazia' | 'com trabalho';
  ciclos: number;
  chamadasAoClaude: number;
  totais: TotaisDaRodada;
  /** A rodada parou por falha técnica (claude, banco): o agendador mostra resultado de erro. */
  falha: string | null;
  /** O banco (ou outro revisor) segurava a trava: nada foi feito. */
  puladaPelaTravaDoBanco: boolean;
}

export const ORCAMENTO_DA_RODADA_MS = 45 * 60_000;
export const PRAZO_DO_CICLO_MS = 40 * 60_000;
export const MAX_CICLOS_POR_RODADA = 60;

/** O erro do ciclo como pode ir ao registro: sem trecho de texto de envio (os motivos de leitura citam o arquivo). */
export function erroSeguro(erro: string): string {
  const corte = erro.indexOf(' (');
  const base = /texto não lido/.test(erro) && corte > 0 ? `${erro.slice(0, corte)} (detalhe omitido)` : erro;
  return primeiraLinha(base).slice(0, 160);
}

function somar(t: TotaisDaRodada, r: ResumoDoCiclo): void {
  t.enviados += r.enviadosAoLote;
  t.resultados += r.resultadosRegistrados;
  t.publicados += r.publicados;
  t.atualizados += r.atualizados;
  t.reprovadosAntesDaIa += r.reprovadosAntesDaIa;
  t.publicacoesRecusadas += r.publicacoesRecusadas;
  t.conciliados += r.lotesConciliados;
  t.liberadas += r.reservasLiberadas;
}

function houveProgresso(r: ResumoDoCiclo): boolean {
  return (
    r.enviadosAoLote + r.resultadosRegistrados + r.publicados + r.atualizados + r.reprovadosAntesDaIa +
      r.publicacoesRecusadas + r.lotesConciliados + r.reservasLiberadas + r.pausasContinuadas >
    0
  );
}

export async function executarRodada(deps: DepsDaRodada): Promise<ResumoDaRodada> {
  const agora = deps.agora ?? Date.now;
  const inicio = agora();
  const resumo: ResumoDaRodada = {
    fila: 'vazia',
    ciclos: 0,
    chamadasAoClaude: 0,
    totais: { enviados: 0, resultados: 0, publicados: 0, atualizados: 0, reprovadosAntesDaIa: 0, publicacoesRecusadas: 0, conciliados: 0, liberadas: 0 },
    falha: null,
    puladaPelaTravaDoBanco: false,
  };

  deps.registrar(`rodada iniciada (banco ${deps.rotuloDoAlvo})`);
  try {
    if (!(await filaTemTrabalho(deps.exec))) {
      deps.registrar('fila vazia: nada a fazer, o claude não foi chamado');
      return resumo;
    }
  } catch (e) {
    resumo.falha = `consulta da fila: ${primeiraLinha(e)}`;
    deps.registrar(`falha: ${resumo.falha}`);
    return resumo;
  }
  resumo.fila = 'com trabalho';

  if (!deps.claudeDisponivel) {
    resumo.falha = 'claude.exe não encontrado (extensão do VS Code, REVISOR_CLAUDE ou PATH): nenhum envio foi tocado';
    deps.registrar(`falha: ${resumo.falha}`);
    return resumo;
  }

  const perguntar: Perguntar = async (p) => {
    resumo.chamadasAoClaude += 1;
    return deps.perguntar(p);
  };
  const api = apiViaClaude({ perguntar, falhas: deps.falhas });

  const banco0 = bancoDoSupabase(clienteDoBanco(deps.exec));
  const banco: Banco = {
    ...banco0,
    async registrar(r) {
      const ok = await banco0.registrar(r);
      deps.registrar(
        `veredito rev=${idCurto(r.reviewId)} ${r.veredito}${r.tipoDeErro ? ` (${r.tipoDeErro})` : ''}${r.cobravel ? '' : ' sem custo'} gravado=${ok}`,
      );
      return ok;
    },
  };

  const { conferir, lerMaterial, lerQuestoes } = montarConferencias(validacaoGerada as unknown as ModuloDeValidacao);
  const depsDoCiclo: DepsDoCiclo = {
    banco,
    api,
    conferir,
    lerMaterial,
    lerQuestoes,
    baseDoRevisor: BASE_DO_REVISOR,
    baseSha256: await sha256Hex(montarSistema(BASE_DO_REVISOR)),
    baseDoRevisorDeQuestoes: BASE_DO_REVISOR_DE_QUESTOES,
    baseSha256DeQuestoes: await sha256Hex(montarSistemaDeQuestoes(BASE_DO_REVISOR_DE_QUESTOES)),
    novoCodigo: () => crypto.randomUUID(),
    // Um envio por ciclo: se o claude falhar, só esse volta à fila e nada que já foi julgado se perde.
    maxPorLote: 1,
    prazoMs: deps.prazoDoCicloMs ?? PRAZO_DO_CICLO_MS,
  };

  const orcamento = deps.orcamentoMs ?? ORCAMENTO_DA_RODADA_MS;
  const maxCiclos = deps.maxCiclos ?? MAX_CICLOS_POR_RODADA;
  // O veredito de um envio só existe na memória deste processo até o ciclo seguinte o coletar: um ciclo que
  // enviou um envio ao claude SEMPRE é seguido de outro (que coleta, registra e publica), mesmo sem tempo.
  let aColetar = false;
  try {
    for (let n = 1; n <= maxCiclos || aColetar; n += 1) {
      const semTempo = agora() - inicio > orcamento;
      if (n > 1 && !aColetar) {
        if (semTempo) {
          deps.registrar('orçamento de tempo da rodada esgotado: o resto fica para a próxima');
          break;
        }
        if (!(await filaTemTrabalho(deps.exec))) break;
      }
      // Sem tempo, o ciclo só coleta e publica: não reserva envio novo.
      depsDoCiclo.maxPorLote = semTempo ? 0 : 1;
      const r = await executarCiclo(depsDoCiclo);
      resumo.ciclos = n;
      aColetar = r.enviadosAoLote > 0;
      somar(resumo.totais, r);
      deps.registrar(
        `ciclo ${n}: enviados=${r.enviadosAoLote} registrados=${r.resultadosRegistrados} publicados=${r.publicados} atualizados=${r.atualizados} reprovados_antes_da_ia=${r.reprovadosAntesDaIa} recusadas=${r.publicacoesRecusadas} liberadas=${r.reservasLiberadas} erros=${r.erros.length}`,
      );
      for (const e of r.erros) deps.registrar(`erro: ${erroSeguro(e)}`);
      if (r.pulado) {
        resumo.puladaPelaTravaDoBanco = true;
        deps.registrar('a trava do banco está com outro revisor: nada foi feito');
        break;
      }
      const falha = api.falhaTecnica();
      if (falha) {
        resumo.falha = falha.message;
        deps.registrar(`falha: ${erroSeguro(falha.message)} (o envio voltou à fila; tenta de novo na próxima rodada)`);
        break;
      }
      if (!houveProgresso(r)) break;
    }
  } catch (e) {
    resumo.falha = primeiraLinha(e);
    deps.registrar(`falha: ${resumo.falha}`);
  }

  const t = resumo.totais;
  deps.registrar(
    `rodada concluída em ${Math.round((agora() - inicio) / 1000)}s: ciclos=${resumo.ciclos} claude=${resumo.chamadasAoClaude} registrados=${t.resultados} publicados=${t.publicados} atualizados=${t.atualizados} reprovados_antes_da_ia=${t.reprovadosAntesDaIa}`,
  );
  return resumo;
}
