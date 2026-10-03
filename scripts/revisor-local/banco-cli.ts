// Acesso ao banco do revisor local (D-12): tudo passa por `supabase db query`, que usa o login que
// o dono já tem (nada de chave em arquivo). O programa só chama as funções `revisao_*` que a Edge
// Function `revisar-envios` já usa (lista fechada abaixo) e só LÊ as tabelas do catálogo; nenhum SQL
// daqui grava direto em tabela.
//
// A lista fechada é também a barreira: nome de função fora dela, parâmetro desconhecido ou valor do
// tipo errado levantam erro ANTES de qualquer comando ser executado.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ClienteDoBanco } from '../../supabase/functions/revisar-envios/banco.ts';

export type Alvo = 'linked' | 'local';
export type Linha = Record<string, unknown>;
/** Executa UMA instrução SQL e devolve as linhas do resultado. */
export type ExecutorSql = (sql: string) => Promise<Linha[]>;

type TipoSql = 'uuid' | 'uuid[]' | 'text' | 'int' | 'boolean' | 'jsonb';
/** linhas: a função devolve uma tabela; valor: um valor só (inclusive jsonb); vazio: `void`. */
type Retorno = 'linhas' | 'valor' | 'vazio';

interface Contrato {
  retorno: Retorno;
  params: Record<string, TipoSql>;
}

const IDENTIFICACAO_DO_ENVIO = {
  p_submission_id: 'uuid',
  p_review_id: 'uuid',
  p_content_sha256: 'text',
} as const;

/** As funções que a Edge Function usa (supabase/functions/revisar-envios/banco.ts), menos `revisao_pausar`: sem lote da API não há `pause_turn`. */
export const RPCS_PERMITIDAS: Record<string, Contrato> = {
  revisao_tentar_travar: { retorno: 'valor', params: { p_seconds: 'int' } },
  revisao_destravar: { retorno: 'vazio', params: { p_token: 'uuid' } },
  revisao_liberar_reservas_velhas: { retorno: 'valor', params: { p_minutes: 'int' } },
  revisao_pendentes: { retorno: 'linhas', params: {} },
  revisao_reservar_envios: { retorno: 'linhas', params: { p_max: 'int' } },
  revisao_dados_do_envio: { retorno: 'linhas', params: { p_review_ids: 'uuid[]' } },
  revisao_marcar_incerta: { retorno: 'valor', params: { p_review_ids: 'uuid[]' } },
  revisao_anexar_lote: { retorno: 'valor', params: { p_review_ids: 'uuid[]', p_batch_id: 'text' } },
  revisao_liberar: { retorno: 'valor', params: { p_review_ids: 'uuid[]' } },
  revisao_registrar_resultado: {
    retorno: 'valor',
    params: {
      p_review_id: 'uuid',
      p_verdict: 'text',
      p_verdict_line: 'text',
      p_findings_text: 'text',
      p_correction_block: 'text',
      p_error_kind: 'text',
      p_model: 'text',
      p_prompt_sha256: 'text',
      p_input_tokens: 'int',
      p_output_tokens: 'int',
      p_cache_creation_tokens: 'int',
      p_cache_read_tokens: 'int',
      p_web_searches: 'int',
      p_web_fetches: 'int',
      p_stop_reason: 'text',
      p_billable: 'boolean',
    },
  },
  revisao_envios_para_publicar: { retorno: 'linhas', params: { p_max: 'int' } },
  revisao_publicar_envio: { retorno: 'valor', params: { ...IDENTIFICACAO_DO_ENVIO, p_material: 'jsonb' } },
  revisao_recusar_publicacao: { retorno: 'valor', params: { ...IDENTIFICACAO_DO_ENVIO, p_note: 'text' } },
  revisao_envios_de_atualizacao_para_aplicar: { retorno: 'linhas', params: { p_max: 'int' } },
  revisao_aplicar_atualizacao: { retorno: 'valor', params: { ...IDENTIFICACAO_DO_ENVIO, p_material: 'jsonb' } },
  revisao_envios_de_questoes_para_publicar: { retorno: 'linhas', params: { p_max: 'int' } },
  revisao_publicar_questoes: { retorno: 'valor', params: { ...IDENTIFICACAO_DO_ENVIO, p_questoes: 'jsonb' } },
  revisao_recusar_publicacao_de_questoes: { retorno: 'valor', params: { ...IDENTIFICACAO_DO_ENVIO, p_note: 'text' } },
};

/** As únicas tabelas lidas, e as colunas (o catálogo que a conferência do padrão precisa). */
const TABELAS_LIDAS: Record<string, readonly string[]> = {
  disciplines: ['id', 'name'],
  themes: ['id', 'name', 'discipline_id'],
  materials: ['id', 'title', 'status'],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function textoSql(s: string): string {
  // NUL não existe em texto do Postgres; a barra invertida vira E'' para valer com qualquer configuração.
  const limpo = s.replace(/\u0000/g, '');
  const aspas = limpo.replace(/'/g, "''");
  return limpo.includes('\\') ? `E'${aspas.replace(/\\/g, '\\\\')}'` : `'${aspas}'`;
}

/** Um valor do JS como literal SQL do tipo pedido. Valor de tipo errado levanta erro. */
export function literalSql(valor: unknown, tipo: TipoSql): string {
  if (valor === null || valor === undefined) return `null::${tipo}`;
  switch (tipo) {
    case 'int':
      if (typeof valor !== 'number' || !Number.isInteger(valor)) throw new Error(`valor não inteiro: ${String(valor)}`);
      return `${valor}::int`;
    case 'boolean':
      if (typeof valor !== 'boolean') throw new Error('valor não booleano');
      return valor ? 'true' : 'false';
    case 'text':
      if (typeof valor !== 'string') throw new Error('valor não é texto');
      return `${textoSql(valor)}::text`;
    case 'uuid':
      if (typeof valor !== 'string' || !UUID.test(valor)) throw new Error('valor não é um uuid');
      return `'${valor}'::uuid`;
    case 'uuid[]':
      if (!Array.isArray(valor) || valor.some((v) => typeof v !== 'string' || !UUID.test(v))) {
        throw new Error('valor não é uma lista de uuid');
      }
      return valor.length === 0 ? `'{}'::uuid[]` : `array[${valor.map((v) => `'${v}'`).join(', ')}]::uuid[]`;
    case 'jsonb':
      return `${textoSql(JSON.stringify(valor))}::jsonb`;
  }
}

/** O SQL de UMA chamada de função `revisao_*`, com os argumentos nomeados e tipados. */
export function sqlDaChamada(funcao: string, args: Record<string, unknown> = {}): string {
  const contrato = RPCS_PERMITIDAS[funcao];
  if (!contrato) throw new Error(`função fora da lista permitida: ${funcao}`);
  const partes: string[] = [];
  for (const [nome, valor] of Object.entries(args)) {
    if (valor === undefined) continue;
    const tipo = contrato.params[nome];
    if (!tipo) throw new Error(`parâmetro desconhecido em ${funcao}: ${nome}`);
    partes.push(`${nome} => ${literalSql(valor, tipo)}`);
  }
  const chamada = `public.${funcao}(${partes.join(', ')})`;
  if (contrato.retorno === 'linhas') return `select to_jsonb(t) as r from ${chamada} as t`;
  if (contrato.retorno === 'vazio') return `select ${chamada} is null as r`;
  return `select to_jsonb(${chamada}) as r`;
}

/** O que a função devolveria pelo PostgREST: lista de objetos, valor único ou nulo. */
export function dadosDaChamada(funcao: string, linhas: Linha[]): unknown {
  const contrato = RPCS_PERMITIDAS[funcao];
  if (contrato.retorno === 'linhas') return linhas.map((l) => l.r);
  if (contrato.retorno === 'vazio') return null;
  return linhas.length > 0 ? (linhas[0].r ?? null) : null;
}

export function sqlDaLeitura(tabela: string, colunas: string, coluna: string, de: number, ate: number): string {
  const permitidas = TABELAS_LIDAS[tabela];
  if (!permitidas) throw new Error(`tabela fora da lista de leitura: ${tabela}`);
  const pedidas = colunas.split(',').map((c) => c.trim());
  if (pedidas.some((c) => !permitidas.includes(c))) throw new Error(`coluna fora da lista de leitura em ${tabela}`);
  if (!permitidas.includes(coluna)) throw new Error(`ordenação fora da lista de leitura em ${tabela}`);
  if (!Number.isInteger(de) || !Number.isInteger(ate) || de < 0 || ate < de) throw new Error('faixa inválida');
  return `select to_jsonb(t) as r from (select ${pedidas.join(', ')} from public.${tabela} order by ${coluna} offset ${de} limit ${ate - de + 1}) as t`;
}

/** O cliente que `bancoDoSupabase` (a ponte da Edge Function com o banco) espera, sobre o executor de SQL. */
export function clienteDoBanco(exec: ExecutorSql): ClienteDoBanco {
  return {
    async rpc(funcao, args) {
      try {
        const linhas = await exec(sqlDaChamada(funcao, args));
        return { data: dadosDaChamada(funcao, linhas), error: null };
      } catch (e) {
        return { data: null, error: { message: primeiraLinha(e) } };
      }
    },
    from(tabela) {
      return {
        select(colunas) {
          return {
            order(coluna) {
              return {
                async range(de, ate) {
                  try {
                    const linhas = await exec(sqlDaLeitura(tabela, colunas, coluna, de, ate));
                    return { data: linhas.map((l) => l.r), error: null };
                  } catch (e) {
                    return { data: null, error: { message: primeiraLinha(e) } };
                  }
                },
              };
            },
          };
        },
      };
    },
  };
}

/**
 * A fila tem algum trabalho? Uma consulta só, de leitura: envio esperando, em revisão ou aprovado
 * (falta publicar), ou revisão em andamento. Fila vazia: a rodada termina sem chamar a IA.
 */
export const SQL_DA_FILA = `select (
    (select count(*) from public.material_submissions where status in ('aguardando_revisao', 'em_revisao', 'apto'))
  + (select count(*) from public.question_submissions where status in ('aguardando_revisao', 'em_revisao', 'apto'))
  + (select count(*) from public.material_reviews where status in ('reservada', 'incerta', 'submetida', 'pausada'))
)::int as n`;

export async function filaTemTrabalho(exec: ExecutorSql): Promise<boolean> {
  const linhas = await exec(SQL_DA_FILA);
  const n = Number(linhas[0]?.n ?? 0);
  return Number.isFinite(n) && n > 0;
}

/** Só a primeira linha e no máximo 200 caracteres: mensagem de erro nunca arrasta o texto de um envio. */
export function primeiraLinha(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e);
  const linha = texto.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  return linha.length > 200 ? `${linha.slice(0, 200)}…` : linha;
}

export function lerLinhas(saida: string): Linha[] {
  const dados: unknown = JSON.parse(saida);
  if (Array.isArray(dados)) return dados as Linha[];
  const rows = (dados as { rows?: unknown } | null)?.rows;
  if (Array.isArray(rows)) return rows as Linha[];
  throw new Error('saída inesperada do supabase db query');
}

export interface OpcoesDoExecutor {
  alvo: Alvo;
  /** Caminho do supabase.exe (ou `supabase`, se estiver no PATH). */
  supabase: string;
  /** Pasta do projeto: onde está a configuração do Supabase (e o vínculo com o projeto, no `--linked`). */
  projeto: string;
  timeoutMs?: number;
}

/** O executor real: `supabase db query` com o SQL num arquivo temporário (a linha de comando do Windows é curta). */
export function executorViaCli(o: OpcoesDoExecutor): ExecutorSql {
  return async (sql) => {
    const pasta = await mkdtemp(path.join(tmpdir(), 'revisor-sql-'));
    const arquivo = path.join(pasta, 'consulta.sql');
    try {
      await writeFile(arquivo, sql, 'utf8');
      const args = ['db', 'query', o.alvo === 'local' ? '--local' : '--linked', '--agent', 'no', '-o', 'json', '-f', arquivo];
      const saida = await new Promise<string>((resolve, reject) => {
        execFile(
          o.supabase,
          args,
          { cwd: o.projeto, timeout: o.timeoutMs ?? 180_000, maxBuffer: 256 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
          (erro, stdout, stderr) => {
            if (erro) {
              const linhas = String(stderr || erro.message).split(/\r?\n/).map((l) => l.trim());
              const causa = linhas.find((l) => /fail|error|erro/i.test(l)) ?? linhas.find((l) => l !== '') ?? 'falha sem mensagem';
              reject(new Error(`supabase db query: ${causa}`));
              return;
            }
            resolve(stdout);
          },
        );
      });
      return lerLinhas(saida);
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  };
}
