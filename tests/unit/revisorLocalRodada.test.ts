import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executarCiclo, type ApiDeLotes, type MensagemDaApi } from '../../supabase/functions/revisar-envios/ciclo.ts';
import { bancoDoSupabase, type ClienteDoBanco } from '../../supabase/functions/revisar-envios/banco.ts';
import { montarConferencias } from '../../supabase/functions/revisar-envios/conferencias.ts';
import { BASE_DO_REVISOR, BASE_DO_REVISOR_DE_QUESTOES } from '../../supabase/functions/revisar-envios/gerado/textos.ts';
import * as validacaoGerada from '../../supabase/functions/revisar-envios/gerado/validacao.js';
import { montarSistema } from '../../supabase/functions/revisar-envios/montagem.ts';
import type { ModuloDeValidacao } from '../../supabase/functions/revisar-envios/tipos.ts';
import { SQL_DA_FILA, sqlDaLeitura, type ExecutorSql } from '../../scripts/revisor-local/banco-cli.ts';
import { contadorEmArquivo, type Perguntar } from '../../scripts/revisor-local/claude.ts';
import { executarCli, lerOpcoes } from '../../scripts/revisor-local/cli.ts';
import { ORCAMENTO_DA_RODADA_MS, erroSeguro, executarRodada, type DepsDaRodada } from '../../scripts/revisor-local/rodada.ts';
import { IDADE_MAXIMA_DA_TRAVA_MS, tentarTravar } from '../../scripts/revisor-local/trava.ts';
import { materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';

// D-12/P7 — a rodada do revisor local (que só ACONSELHA) com o banco e o `claude` SIMULADOS. O banco de verdade (local) é
// exercitado em tests/revisor-local/ (npm run test:revisor-local).

let pasta: string;
beforeAll(() => {
  pasta = mkdtempSync(path.join(tmpdir(), 'revisor-rodada-'));
});
afterAll(() => {
  rmSync(pasta, { recursive: true, force: true });
});

const U = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

// --- Um banco de mentira que responde às funções `revisao_*` (uma máquina de estados mínima) --------------

type Estado = 'aguardando' | 'reservada' | 'incerta' | 'submetida' | 'apto' | 'nao_apto' | 'publicado';

class BancoDeMentira {
  readonly chamadas: string[] = [];
  readonly sqls: string[] = [];
  readonly envios: Array<{ n: number; titulo: string; texto: string; estado: Estado; batch: string | null }> = [];
  readonly disc = U(900);
  readonly tema = U(901);

  adicionar(titulo: string, texto: string, estado: Estado = 'aguardando'): number {
    const n = this.envios.length + 1;
    this.envios.push({ n, titulo, texto, estado, batch: null });
    return n;
  }

  private pelaRevisao(sql: string) {
    const m = /p_review_ids => array\['([^']+)'/.exec(sql) ?? /p_review_id => '([^']+)'/.exec(sql);
    const n = m ? Number(m[1].slice(0, 8)) : NaN;
    return this.envios.find((e) => e.n === n);
  }

  readonly exec: ExecutorSql = async (sql) => {
    this.sqls.push(sql);
    if (sql === SQL_DA_FILA) return [{ n: this.envios.filter((e) => e.estado !== 'publicado' && e.estado !== 'nao_apto' && e.estado !== 'apto').length }];
    const fn = /public\.(revisao_[a-z_]+)\(/.exec(sql)?.[1];
    if (!fn) {
      if (sql.includes('public.disciplines')) return [{ r: { id: this.disc, name: 'Farmacologia' } }];
      if (sql.includes('public.themes')) return [{ r: { id: this.tema, name: 'Clínica', discipline_id: this.disc } }];
      return [];
    }
    this.chamadas.push(fn);
    switch (fn) {
      case 'revisao_tentar_travar':
        return [{ r: U(777) }];
      case 'revisao_destravar':
        return [{ r: true }];
      case 'revisao_liberar_reservas_velhas':
        return [{ r: 0 }];
      case 'revisao_pendentes':
        return this.envios
          .filter((e) => e.estado === 'submetida' || e.estado === 'incerta')
          .map((e) => ({ r: { review_id: U(e.n), tipo: 'material', status: e.estado, batch_id: e.batch, tentativa_em: '2026-10-03T12:00:00+00:00' } }));
      case 'revisao_reservar_envios': {
        const e = Number(/p_max => (\d+)/.exec(sql)?.[1] ?? 0) > 0 ? this.envios.find((x) => x.estado === 'aguardando') : undefined;
        if (!e) return [];
        e.estado = 'reservada';
        return [
          { r: { review_id: U(e.n), submission_id: U(e.n + 100), tipo: 'material', title: e.titulo, content_md: e.texto, content_sha256: 'sha', discipline_id: this.disc, theme_id: this.tema, discipline_name: 'Farmacologia', theme_name: 'Clínica', parent_title: null, material_titles: null } },
        ];
      }
      case 'revisao_marcar_incerta': {
        const e = this.pelaRevisao(sql);
        if (e) e.estado = 'incerta';
        return [{ r: '2026-10-03T12:00:00+00:00' }];
      }
      case 'revisao_anexar_lote': {
        const e = this.pelaRevisao(sql);
        if (e) {
          e.estado = 'submetida';
          e.batch = /p_batch_id => '([^']+)'/.exec(sql)?.[1] ?? null;
        }
        return [{ r: 1 }];
      }
      case 'revisao_liberar': {
        const e = this.pelaRevisao(sql);
        if (e) e.estado = 'aguardando';
        return [{ r: 1 }];
      }
      case 'revisao_registrar_resultado': {
        const e = this.pelaRevisao(sql);
        if (e) e.estado = /p_verdict => 'apto'/.test(sql) ? 'apto' : 'nao_apto';
        return [{ r: true }];
      }
      case 'revisao_envios_para_publicar':
        return this.envios
          .filter((e) => e.estado === 'apto')
          .map((e) => ({ r: { submission_id: U(e.n + 100), review_id: U(e.n), content_md: e.texto, content_sha256: 'sha', discipline_id: this.disc, theme_id: this.tema } }));
      case 'revisao_publicar_envio': {
        const e = this.pelaRevisao(sql.replace('p_submission_id', 'x'));
        if (e) e.estado = 'publicado';
        return [{ r: { resultado: 'publicado', material_id: U(555) } }];
      }
      case 'revisao_envios_de_atualizacao_para_aplicar':
      case 'revisao_envios_de_questoes_para_publicar':
        return [];
      default:
        throw new Error(`função não simulada: ${fn}`);
    }
  };
}

/**
 * O cliente da Edge Function (que PUBLICA): sem a lista fechada do revisor local, falando com o mesmo banco de mentira.
 * Só serve para o teste mostrar a sequência que a Edge Function faria.
 */
function clienteDaEdgeFunction(banco: BancoDeMentira): ClienteDoBanco {
  const LINHAS = /^revisao_(pendentes|reservar_envios|dados_do_envio|envios_.*)$/;
  const literal = (v: unknown): string => (Array.isArray(v) ? `array[${v.map((x) => `'${String(x)}'`).join(', ')}]` : typeof v === 'number' ? String(v) : typeof v === 'string' ? `'${v}'` : 'null');
  return {
    async rpc(fn, args) {
      const lista = Object.entries(args ?? {})
        .filter(([, v]) => v === null || ['string', 'number'].includes(typeof v) || (Array.isArray(v) && v.every((x) => typeof x === 'string')))
        .map(([k, v]) => `${k} => ${literal(v)}`)
        .join(', ');
      const linhas = await banco.exec(`select to_jsonb(public.${fn}(${lista})) as r`);
      return { data: LINHAS.test(fn) ? linhas.map((l) => l.r) : (linhas[0]?.r ?? null), error: null };
    },
    from: (tabela) => ({
      select: (colunas) => ({
        order: (coluna) => ({
          range: async (de, ate) => ({ data: (await banco.exec(sqlDaLeitura(tabela, colunas, coluna, de, ate))).map((l) => l.r), error: null }),
        }),
      }),
    }),
  };
}

const RESPOSTA_APTO: MensagemDaApi = {
  stop_reason: 'end_turn',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: '1. Fato — confere.\n\nAPTO PARA ENVIAR' }],
  usage: { input_tokens: 10, output_tokens: 20 },
};

function depsBase(banco: BancoDeMentira, perguntar: Perguntar, extra: Partial<DepsDaRodada> = {}): DepsDaRodada & { linhas: string[] } {
  const linhas: string[] = [];
  return {
    exec: banco.exec,
    perguntar,
    claudeDisponivel: true,
    falhas: contadorEmArquivo(path.join(pasta, `falhas-${Math.random()}.json`)),
    registrar: (l) => linhas.push(l),
    rotuloDoAlvo: 'LOCAL',
    linhas,
    ...extra,
  };
}

describe('fila vazia', () => {
  it('termina sem chamar o claude e sem tocar em nenhuma função do banco (só a consulta da fila)', async () => {
    const banco = new BancoDeMentira();
    const perguntar = vi.fn<Perguntar>();
    const deps = depsBase(banco, perguntar);
    const resumo = await executarRodada(deps);
    expect(resumo).toMatchObject({ fila: 'vazia', ciclos: 0, chamadasAoClaude: 0, falha: null });
    expect(perguntar).not.toHaveBeenCalled();
    expect(banco.sqls).toEqual([SQL_DA_FILA]);
    expect(banco.chamadas).toEqual([]);
    expect(deps.linhas.join('\n')).toContain('fila vazia');
  });

  it('envio já publicado ou recusado também não deixa a fila "com trabalho"', async () => {
    const banco = new BancoDeMentira();
    banco.adicionar('Pronto', materialParaEnvio(), 'publicado');
    banco.adicionar('Recusado', materialParaEnvio(), 'nao_apto');
    const perguntar = vi.fn<Perguntar>();
    expect((await executarRodada(depsBase(banco, perguntar))).fila).toBe('vazia');
    expect(perguntar).not.toHaveBeenCalled();
  });
});

describe('claude indisponível ou banco fora', () => {
  it('com trabalho na fila e sem claude.exe, para ANTES de tocar em qualquer envio', async () => {
    const banco = new BancoDeMentira();
    banco.adicionar('Material', materialParaEnvio());
    const perguntar = vi.fn<Perguntar>();
    const deps = depsBase(banco, perguntar, { claudeDisponivel: false });
    const resumo = await executarRodada(deps);
    expect(resumo.falha).toMatch(/claude\.exe não encontrado/);
    expect(banco.sqls).toEqual([SQL_DA_FILA]);
    expect(banco.envios[0].estado).toBe('aguardando');
    expect(perguntar).not.toHaveBeenCalled();
  });

  it('banco fora do ar na consulta da fila: falha registrada, sem exceção e sem chamar o claude', async () => {
    const perguntar = vi.fn<Perguntar>();
    const linhas: string[] = [];
    const resumo = await executarRodada({
      exec: async () => {
        throw new Error('supabase db query: sem rede\nlinha 2');
      },
      perguntar,
      claudeDisponivel: true,
      falhas: contadorEmArquivo(path.join(pasta, 'f-banco.json')),
      registrar: (l) => linhas.push(l),
      rotuloDoAlvo: 'remoto',
    });
    expect(resumo.falha).toBe('consulta da fila: supabase db query: sem rede');
    expect(perguntar).not.toHaveBeenCalled();
  });
});

describe('com envio esperando', () => {
  it('chama o claude UMA vez, grava o veredito "apto" e NÃO publica: o envio fica "apto" e a fila seca', async () => {
    const banco = new BancoDeMentira();
    banco.adicionar('Material de teste', materialParaEnvio({ titulo: 'Material de teste' }));
    const perguntas: Array<{ sistema: string; mensagem: string }> = [];
    const perguntar: Perguntar = async (p) => {
      perguntas.push(p);
      return { ok: true, mensagem: RESPOSTA_APTO };
    };
    const deps = depsBase(banco, perguntar);
    const resumo = await executarRodada(deps);

    expect(resumo).toMatchObject({ fila: 'com trabalho', ciclos: 2, chamadasAoClaude: 1, falha: null });
    expect(resumo.totais).toMatchObject({ enviados: 1, resultados: 1 });
    expect(banco.envios[0].estado).toBe('apto');
    expect(banco.chamadas.filter((f) => /publica|aplicar|recusar|para_publicar/.test(f))).toEqual([]);
    // O claude recebeu o texto de instruções de sempre e o material dentro das fronteiras.
    expect(perguntas[0].sistema).toBe(montarSistema(BASE_DO_REVISOR));
    expect(perguntas[0].mensagem).toMatch(/=== INÍCIO DO MATERIAL [0-9a-f-]{36} ===/);
    // O registro não leva o texto do envio.
    expect(deps.linhas.join('\n')).not.toContain('Texto de exemplo');
    expect(deps.linhas.join('\n')).toMatch(/veredito rev=00000001 apto/);
  });

  it('arquivo fora do padrão nem chega ao claude (custo zero): vai a "não apto" e a rodada segue', async () => {
    const banco = new BancoDeMentira();
    banco.adicionar('Fora do padrão', '# Só um título, sem nada do padrão');
    const perguntar = vi.fn<Perguntar>();
    const resumo = await executarRodada(depsBase(banco, perguntar));
    expect(perguntar).not.toHaveBeenCalled();
    expect(resumo.totais.reprovadosAntesDaIa).toBe(1);
    expect(banco.envios[0].estado).toBe('nao_apto');
  });

  it('falha do claude (cota): o envio volta à fila, a rodada para e o resultado é falha', async () => {
    const banco = new BancoDeMentira();
    banco.adicionar('A', materialParaEnvio({ titulo: 'A' }));
    banco.adicionar('B', materialParaEnvio({ titulo: 'B' }));
    const perguntar = vi.fn<Perguntar>(async () => ({ ok: false, tipo: 'cota', detalhe: 'limite' }));
    const deps = depsBase(banco, perguntar);
    const resumo = await executarRodada(deps);
    expect(perguntar).toHaveBeenCalledTimes(1);
    expect(resumo.falha).toMatch(/cota/);
    expect(banco.envios.map((e) => e.estado)).toEqual(['aguardando', 'aguardando']);
    expect(banco.chamadas).toContain('revisao_liberar');
    expect(deps.linhas.join('\n')).toMatch(/falha: claude: cota/);
  });

  it('o orçamento de tempo da rodada vale: sem tempo, não começa envio novo', async () => {
    const banco = new BancoDeMentira();
    banco.adicionar('A', materialParaEnvio({ titulo: 'A' }));
    banco.adicionar('B', materialParaEnvio({ titulo: 'B' }));
    let relogio = 0;
    const perguntar: Perguntar = async () => {
      relogio += ORCAMENTO_DA_RODADA_MS + 1;
      return { ok: true, mensagem: RESPOSTA_APTO };
    };
    const deps = depsBase(banco, perguntar, { agora: () => relogio });
    await executarRodada(deps);
    // O envio A já estava com o claude: é coletado e o veredito gravado (senão o veredito se perderia); o B espera a próxima rodada.
    expect(banco.envios.map((e) => e.estado)).toEqual(['apto', 'aguardando']);
    expect(deps.linhas.join('\n')).toMatch(/orçamento de tempo/);
  });

  it('MAX_CICLOS_POR_RODADA é um teto de verdade: passado o teto, o ciclo só coleta o que já foi enviado e não reserva envio novo', async () => {
    const banco = new BancoDeMentira();
    for (const t of ['A', 'B', 'C']) banco.adicionar(t, materialParaEnvio({ titulo: t }));
    const perguntar = vi.fn<Perguntar>(async () => ({ ok: true, mensagem: RESPOSTA_APTO }));
    const deps = depsBase(banco, perguntar, { maxCiclos: 2 });
    const resumo = await executarRodada(deps);
    // Ciclo 1 envia A; ciclo 2 coleta A e envia B; o ciclo 3 (além do teto, só para coletar B) não reserva o C.
    expect(perguntar).toHaveBeenCalledTimes(2);
    expect(resumo.ciclos).toBe(3);
    expect(banco.envios.map((e) => e.estado)).toEqual(['apto', 'apto', 'aguardando']);
    expect(resumo.falha).toBeNull();
  });

  it('a mesma sequência de funções da Edge Function, na mesma ordem (disparo que envia + disparo que coleta e publica)', async () => {
    // Edge Function: o ciclo com a API de lotes simulada, em dois disparos.
    const bancoEdge = new BancoDeMentira();
    bancoEdge.adicionar('Material', materialParaEnvio({ titulo: 'Material' }));
    const lotes = new Map<string, string[]>();
    const api: ApiDeLotes = {
      criar: async (pedidos) => {
        const id = `msgbatch_${lotes.size + 1}`;
        lotes.set(id, pedidos.map((p) => p.custom_id));
        return { id };
      },
      consultar: async () => ({ status: 'ended' }),
      async *resultados(id) {
        for (const c of lotes.get(id) ?? []) yield { custom_id: c, result: { type: 'succeeded' as const, message: RESPOSTA_APTO } };
      },
      listar: async () => [],
      cancelar: async () => undefined,
    };
    const { conferir, lerMaterial, lerQuestoes } = montarConferencias(validacaoGerada as unknown as ModuloDeValidacao);
    const depsEdge = {
      banco: bancoDoSupabase(clienteDaEdgeFunction(bancoEdge)),
      api,
      conferir,
      lerMaterial,
      lerQuestoes,
      baseDoRevisor: BASE_DO_REVISOR,
      baseSha256: 'x',
      baseDoRevisorDeQuestoes: BASE_DO_REVISOR_DE_QUESTOES,
      baseSha256DeQuestoes: 'y',
      novoCodigo: () => crypto.randomUUID(),
    };
    await executarCiclo(depsEdge);
    await executarCiclo(depsEdge);

    // Revisor local: a rodada.
    const bancoLocal = new BancoDeMentira();
    bancoLocal.adicionar('Material', materialParaEnvio({ titulo: 'Material' }));
    await executarRodada(depsBase(bancoLocal, async () => ({ ok: true, mensagem: RESPOSTA_APTO })));

    expect(bancoEdge.envios[0].estado).toBe('publicado');
    expect(bancoLocal.envios[0].estado).toBe('apto');
    // A sequência do revisor local é a da Edge Function, na mesma ordem, SEM as funções de publicar/aplicar (P7: só aconselha).
    const PUBLICACAO = /publicar|aplicar|para_publicar/;
    expect(bancoEdge.chamadas.some((f) => PUBLICACAO.test(f))).toBe(true);
    expect(bancoLocal.chamadas).toEqual(bancoEdge.chamadas.filter((f) => !PUBLICACAO.test(f)));
    expect(bancoLocal.chamadas).toEqual([
      // ciclo 1: trava, reservas velhas, conciliação/coleta (nada pendente), reserva, tentativa, lote
      'revisao_tentar_travar', 'revisao_liberar_reservas_velhas', 'revisao_pendentes', 'revisao_pendentes',
      'revisao_pendentes', 'revisao_reservar_envios', 'revisao_marcar_incerta', 'revisao_anexar_lote', 'revisao_destravar',
      // ciclo 2: coleta o resultado e registra o veredito; a reserva seguinte não acha nada
      'revisao_tentar_travar', 'revisao_liberar_reservas_velhas', 'revisao_pendentes', 'revisao_pendentes', 'revisao_registrar_resultado',
      'revisao_pendentes', 'revisao_reservar_envios', 'revisao_destravar',
    ]);
  });
});

describe('uma rodada por vez (trava local)', () => {
  const arquivo = () => path.join(pasta, `trava-${Math.random()}.lock`);

  it('só um processo consegue a trava; a rodada seguinte sai sem fazer nada', () => {
    const f = arquivo();
    const a = tentarTravar(f, { pid: 1111, vivo: () => true });
    expect(a.ok).toBe(true);
    const b = tentarTravar(f, { pid: 2222, vivo: () => true });
    expect(b).toMatchObject({ ok: false });
    if (a.ok) a.liberar();
    expect(tentarTravar(f, { pid: 2222, vivo: () => true }).ok).toBe(true);
  });

  it('trava de processo que morreu é tomada; a de processo vivo mas preso há horas também', () => {
    const f = arquivo();
    let agora = 1_000_000;
    expect(tentarTravar(f, { pid: 1, agora: () => agora, vivo: () => true }).ok).toBe(true);
    expect(tentarTravar(f, { pid: 2, agora: () => agora + 1000, vivo: () => false }).ok).toBe(true);
    agora += 5000;
    expect(tentarTravar(f, { pid: 3, agora: () => agora + 60_000, vivo: () => true }).ok).toBe(false);
    expect(tentarTravar(f, { pid: 4, agora: () => agora + IDADE_MAXIMA_DA_TRAVA_MS + 1, vivo: () => true }).ok).toBe(true);
  });

  it('trava ilegível é trava velha', () => {
    const f = arquivo();
    writeFileSync(f, '{ lixo');
    expect(tentarTravar(f, { pid: 9, vivo: () => true }).ok).toBe(true);
  });

  it('o programa inteiro: com a trava de um processo vivo, a rodada é pulada e nada é consultado', async () => {
    const dados = path.join(pasta, 'dados-travados');
    const trava = tentarTravar(path.join(dados, 'trava.lock'));
    expect(trava.ok).toBe(true);
    const logs: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(l));
    try {
      // `--supabase` aponta para um executável que não existe: se a rodada tentasse consultar o banco, falharia (código 1).
      const codigo = await executarCli(['--local', '--dados', dados, '--supabase', path.join(pasta, 'nao-existe.exe')], {});
      expect(codigo).toBe(0);
      expect(logs.join('\n')).toMatch(/rodada pulada: outra rodada em andamento/);
    } finally {
      log.mockRestore();
      if (trava.ok) trava.liberar();
    }
  });
});

describe('opções', () => {
  it('a busca e a leitura de página da web vêm ligadas; --sem-web ou REVISOR_WEB=0 desligam', () => {
    expect(lerOpcoes(['--local'], {}).web).toBe(true);
    expect(lerOpcoes(['--sem-web'], {}).web).toBe(false);
    expect(lerOpcoes([], { REVISOR_WEB: '0' }).web).toBe(false);
    expect(lerOpcoes([], { REVISOR_WEB: '1' }).web).toBe(true);
    expect(lerOpcoes(['--local'], {}).alvo).toBe('local');
    expect(lerOpcoes([], {}).alvo).toBe('linked');
  });
});

describe('erros no registro', () => {
  it('nunca levam trecho do texto do envio', () => {
    expect(erroSeguro('publicação sub-1: texto não lido (A seção "Mecanismo do fármaco X" está vazia; outra linha)')).toBe(
      'publicação sub-1: texto não lido (detalhe omitido)',
    );
    expect(erroSeguro('revisao_registrar_resultado: falha\nDETAIL: Failing row contains (texto do envio)')).toBe('revisao_registrar_resultado: falha');
    expect(erroSeguro('x'.repeat(400)).length).toBeLessThanOrEqual(160);
  });
});
