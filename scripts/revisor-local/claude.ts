// O `claude -p` da assinatura do dono no lugar da API de lotes (D-12).
//
// O `claude` só JULGA: recebe, pela entrada padrão, o texto que o programa montou (o mesmo da Edge
// Function: `montagem.ts`) e devolve o veredito, que o código de sempre (`veredito.ts`) lê. Roda sem
// ferramentas (`--tools ""`), sem pular permissões, sem mexer em nenhum settings.json e sem sessão
// gravada em disco. Todo acesso ao banco é do programa, nunca do modelo.
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import type { ApiDeLotes, MensagemDaApi, ResultadoDoLote } from '../../supabase/functions/revisar-envios/ciclo.ts';
import { ESFORCO, type PedidoDeLote } from '../../supabase/functions/revisar-envios/montagem.ts';

// --- Onde está o claude -------------------------------------------------------------------------

/** Versão numérica de `anthropic.claude-code-2.1.288-win32-x64` (para achar a mais nova). */
function versaoDaPasta(nome: string): number[] {
  const m = /^anthropic\.claude-code-(\d+(?:\.\d+)*)-win32-x64$/.exec(nome);
  return m ? m[1].split('.').map(Number) : [];
}

function compararVersoes(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** O `claude.exe` da versão mais nova da extensão do VS Code, ou nulo. O caminho muda a cada atualização da extensão. */
export function claudeDaExtensao(pastaDeExtensoes: string): string | null {
  if (!existsSync(pastaDeExtensoes)) return null;
  const candidatas = readdirSync(pastaDeExtensoes)
    .filter((n) => versaoDaPasta(n).length > 0)
    .map((n) => ({ n, v: versaoDaPasta(n), exe: path.join(pastaDeExtensoes, n, 'resources', 'native-binary', 'claude.exe') }))
    .filter((c) => existsSync(c.exe))
    .sort((a, b) => compararVersoes(b.v, a.v));
  return candidatas[0]?.exe ?? null;
}

function claudeDoPath(env: NodeJS.ProcessEnv): string | null {
  const pastas = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean);
  const nomes = process.platform === 'win32' ? ['claude.exe'] : ['claude'];
  for (const pasta of pastas) {
    for (const nome of nomes) {
      const candidato = path.join(pasta, nome);
      if (existsSync(candidato)) return candidato;
    }
  }
  return null;
}

/** Ordem: REVISOR_CLAUDE (se definida) → extensão do VS Code (a mais nova) → `claude` do PATH. */
export function localizarClaude(env: NodeJS.ProcessEnv = process.env, casa: string = homedir()): string | null {
  if (env.REVISOR_CLAUDE) return existsSync(env.REVISOR_CLAUDE) ? env.REVISOR_CLAUDE : null;
  return claudeDaExtensao(path.join(casa, '.vscode', 'extensions')) ?? claudeDoPath(env);
}

// --- A chamada -----------------------------------------------------------------------------------

export interface OpcoesDoClaude {
  exe: string;
  /** Pasta neutra (vazia) onde o claude roda: nenhum CLAUDE.md nem configuração de projeto por perto. */
  pastaNeutra: string;
  timeoutMs: number;
  /** Liga as ferramentas de busca e leitura de página da web (só elas). Desligado por padrão. */
  web?: boolean;
  /** Argumentos que vêm antes dos demais (só os testes usam: rodar um script no lugar do exe). */
  argsIniciais?: string[];
  /** Só os testes trocam (a regra do limite da linha de comando é do Windows). */
  plataforma?: string;
  /** Onde gravar, por um instante, o prompt de sistema que não cabe na linha de comando (padrão: a pasta temporária do sistema). */
  pastaTemporaria?: string;
}

export interface Pergunta {
  sistema: string;
  mensagem: string;
}

export type RespostaDoClaude =
  | { ok: true; mensagem: MensagemDaApi }
  | { ok: false; tipo: 'tempo' | 'cota' | 'processo'; detalhe: string };

/** O limite de CreateProcess no Windows é de 32.767 caracteres para a linha de comando inteira. */
export const LIMITE_DA_LINHA_DE_COMANDO = 30_000;

/** Tamanho aproximado da linha de comando que o Node monta no Windows (aspas e barras contam a mais). */
export function tamanhoDaLinhaDeComando(exe: string, args: string[]): number {
  const quota = (a: string) => a.length + 2 + (a.match(/["\\]/g)?.length ?? 0) + 1;
  return quota(exe) + args.reduce((soma, a) => soma + quota(a), 0);
}

export type PreparoDaChamada =
  | {
      ok: true;
      args: string[];
      /** O que vai à entrada padrão: só a mensagem do pedido (o material). As instruções nunca vão aqui. */
      entrada: string;
      /** Prompt de sistema grande demais para a linha de comando: quem chama o grava em `caminho` antes de rodar e o apaga depois. */
      sistemaEmArquivo: { caminho: string; conteudo: string } | null;
    }
  | { ok: false; motivo: string };

/**
 * Prompt de sistema pelo argumento `--system-prompt` quando cabe na linha de comando; senão, por `--system-prompt-file`
 * (a `claude` 2.1.288 o aceita: o `--help` o cita, "--system-prompt[-file]", e ele recusa arquivo que não existe). Nunca
 * junta as instruções ao texto da mensagem, que traz o material do envio: se não houver como passar o arquivo
 * (`arquivoDoSistema` ausente), a chamada FALHA FECHADA e o claude não é executado.
 */
export function prepararChamada(
  p: Pergunta,
  o: Pick<OpcoesDoClaude, 'exe' | 'web' | 'argsIniciais' | 'plataforma'> & { arquivoDoSistema?: string },
): PreparoDaChamada {
  const base = [
    ...(o.argsIniciais ?? []),
    '-p',
    '--model',
    'opus',
    '--effort',
    ESFORCO,
    '--output-format',
    'json',
    '--no-session-persistence',
    // Sem CLAUDE.md, hooks, agentes, skills e MCP do dono: o claude só julga (e isto não altera nenhum settings.json).
    '--safe-mode',
  ];
  const ferramentas = o.web ? ['--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch'] : ['--tools', ''];
  const comSistema = [...base, ...ferramentas, '--system-prompt', p.sistema];
  if ((o.plataforma ?? process.platform) !== 'win32' || tamanhoDaLinhaDeComando(o.exe, comSistema) <= LIMITE_DA_LINHA_DE_COMANDO) {
    return { ok: true, args: comSistema, entrada: p.mensagem, sistemaEmArquivo: null };
  }
  if (!o.arquivoDoSistema) {
    return { ok: false, motivo: 'o prompt de sistema não cabe na linha de comando e não há arquivo para ele' };
  }
  return {
    ok: true,
    args: [...base, ...ferramentas, '--system-prompt-file', o.arquivoDoSistema],
    entrada: p.mensagem,
    sistemaEmArquivo: { caminho: o.arquivoDoSistema, conteudo: p.sistema },
  };
}

/** Variáveis que fariam o claude cobrar de uma API paga em vez de usar a assinatura: nunca vão ao claude. */
const VARIAVEIS_QUE_TROCAM_A_COBRANCA = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
];

export function ambienteDoClaude(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const limpo: NodeJS.ProcessEnv = { ...env };
  for (const nome of VARIAVEIS_QUE_TROCAM_A_COBRANCA) delete limpo[nome];
  return limpo;
}

const PADRAO_DE_COTA = /usage limit|limit reached|rate limit|overloaded|quota|too many requests|\b429\b|\b529\b/i;

interface ResultadoJsonDoClaude {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
  };
  modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number }>;
}

function primeiraLinhaCurta(texto: string): string {
  const linha = texto.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  return linha.length > 160 ? `${linha.slice(0, 160)}…` : linha;
}

/** O modelo que mais trabalhou na resposta (o `modelUsage` também lista modelos de apoio, como o título da sessão). */
function modeloPrincipal(m: ResultadoJsonDoClaude['modelUsage']): string | undefined {
  const itens = Object.entries(m ?? {});
  if (itens.length === 0) return undefined;
  const peso = (u: NonNullable<ResultadoJsonDoClaude['modelUsage']>[string]) =>
    (u.inputTokens ?? 0) + (u.outputTokens ?? 0) + (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0);
  return itens.sort((a, b) => peso(b[1]) - peso(a[1]))[0][0];
}

/** A saída JSON do `claude -p --output-format json` convertida na mensagem que `coletarLote` já sabe ler. */
export function lerSaidaDoClaude(stdout: string, codigoDeSaida: number | null): RespostaDoClaude {
  let d: ResultadoJsonDoClaude;
  try {
    d = JSON.parse(stdout) as ResultadoJsonDoClaude;
  } catch {
    return { ok: false, tipo: 'processo', detalhe: `saída que não é JSON (código ${codigoDeSaida ?? 'nenhum'})` };
  }
  const texto = typeof d.result === 'string' ? d.result : '';
  if (d.is_error || d.subtype !== 'success' || codigoDeSaida !== 0) {
    const detalhe = primeiraLinhaCurta(texto) || `subtype ${d.subtype ?? '?'}, código ${codigoDeSaida ?? 'nenhum'}`;
    return { ok: false, tipo: PADRAO_DE_COTA.test(texto) ? 'cota' : 'processo', detalhe };
  }
  const u = d.usage ?? {};
  return {
    ok: true,
    mensagem: {
      stop_reason: d.stop_reason ?? null,
      model: modeloPrincipal(d.modelUsage),
      content: [{ type: 'text', text: texto }],
      usage: {
        input_tokens: u.input_tokens ?? 0,
        output_tokens: u.output_tokens ?? 0,
        cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
        server_tool_use: {
          web_search_requests: u.server_tool_use?.web_search_requests ?? 0,
          web_fetch_requests: u.server_tool_use?.web_fetch_requests ?? 0,
        },
      },
    },
  };
}

/** Encerra o claude e os filhos dele, só pelo PID que ESTE programa iniciou. */
function encerrarArvore(pid: number | undefined, filho: { kill: () => boolean }): void {
  filho.kill();
  if (pid && process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => undefined);
  }
}

export type Perguntar = (p: Pergunta) => Promise<RespostaDoClaude>;

/**
 * Lembrete que o revisor local acrescenta DEPOIS da mensagem do pedido (fora das fronteiras do material). Na
 * primeira rodada de verdade, o claude pôs títulos "## (c) Veredito" e "## (d) Bloco..." em volta da linha do
 * veredito e do bloco (copiando as letras do prompt revisor), e a leitura do veredito, que falha fechada, deu
 * "erro". O texto de instruções (o do prompt revisor) não muda; o lembrete só repete a ordem de fechamento.
 */
export const LEMBRETE_DE_FECHAMENTO =
  'Lembrete do formato de fechamento (a resposta é lida por um programa): não escreva títulos, rótulos nem letras como "(c)" ou "(d)" em volta do veredito e do bloco de correção. A linha do veredito vem sozinha; depois dela vem direto o bloco de código (ou nada, ou a frase "Nenhum achado muda o material."), sem nenhuma linha de texto no meio.';

export function perguntarAoClaude(o: OpcoesDoClaude, env: NodeJS.ProcessEnv = process.env): Perguntar {
  return (p) =>
    new Promise<RespostaDoClaude>((resolve) => {
      mkdirSync(o.pastaNeutra, { recursive: true });
      // Pasta própria e temporária para o prompt de sistema, só se ele não couber na linha de comando (fora da pasta neutra).
      let pastaDoSistema: string | null = null;
      const limparSistema = () => {
        if (pastaDoSistema) rmSync(pastaDoSistema, { recursive: true, force: true });
      };
      let preparo = prepararChamada(p, o);
      if (!preparo.ok) {
        try {
          pastaDoSistema = mkdtempSync(path.join(o.pastaTemporaria ?? tmpdir(), 'revisor-sistema-'));
          preparo = prepararChamada(p, { ...o, arquivoDoSistema: path.join(pastaDoSistema, 'sistema.txt') });
          if (preparo.ok && preparo.sistemaEmArquivo) {
            writeFileSync(preparo.sistemaEmArquivo.caminho, preparo.sistemaEmArquivo.conteudo, { encoding: 'utf8', mode: 0o600 });
          }
        } catch (e) {
          limparSistema();
          resolve({ ok: false, tipo: 'processo', detalhe: `prompt de sistema sem arquivo: ${primeiraLinhaCurta(e instanceof Error ? e.message : String(e))}` });
          return;
        }
      }
      if (!preparo.ok) {
        limparSistema();
        resolve({ ok: false, tipo: 'processo', detalhe: preparo.motivo });
        return;
      }
      const chamada = preparo;
      let saida = '';
      let pronto = false;
      const prazo: { id?: NodeJS.Timeout } = {};
      const terminar = (r: RespostaDoClaude) => {
        if (pronto) return;
        pronto = true;
        clearTimeout(prazo.id);
        limparSistema();
        resolve(r);
      };
      let filho: ReturnType<typeof spawn>;
      try {
        filho = spawn(o.exe, chamada.args, {
          cwd: o.pastaNeutra,
          env: ambienteDoClaude(env),
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (e) {
        limparSistema();
        resolve({ ok: false, tipo: 'processo', detalhe: `não iniciou: ${primeiraLinhaCurta(e instanceof Error ? e.message : String(e))}` });
        return;
      }
      prazo.id = setTimeout(() => {
        encerrarArvore(filho.pid, filho);
        terminar({ ok: false, tipo: 'tempo', detalhe: `sem resposta em ${Math.round(o.timeoutMs / 60_000)} min` });
      }, o.timeoutMs);
      filho.stdout?.setEncoding('utf8');
      filho.stdout?.on('data', (parte: string) => {
        saida += parte;
      });
      // O erro do claude (stderr) não é guardado: pode trazer trechos da conversa.
      filho.stderr?.resume();
      filho.on('error', (e) => terminar({ ok: false, tipo: 'processo', detalhe: `não iniciou: ${primeiraLinhaCurta(e.message)}` }));
      filho.on('close', (codigo) => terminar(lerSaidaDoClaude(saida, codigo)));
      filho.stdin?.on('error', () => undefined);
      filho.stdin?.end(chamada.entrada, 'utf8');
    });
}

// --- Contador de tempos esgotados (por conteúdo, em arquivo local) -----------------------------------

/** Depois de tantos tempos esgotados com o MESMO conteúdo, o envio vai a "erro" em vez de gastar a cota de novo. */
export const LIMITE_DE_TEMPOS_ESGOTADOS = 2;

export interface ContadorDeFalhas {
  tempos(chave: string): number;
  registrarTempo(chave: string): number;
  limpar(chave: string): void;
}

const VALIDADE_DO_CONTADOR_MS = 7 * 24 * 60 * 60 * 1000;

/** Guarda só hashes e contagens, nunca o texto do envio. Falha de leitura ou de escrita é ignorada (começa do zero). */
export function contadorEmArquivo(arquivo: string, agora: () => number = Date.now): ContadorDeFalhas {
  type Estado = Record<string, { n: number; em: number }>;
  const ler = (): Estado => {
    try {
      const dados = JSON.parse(readFileSync(arquivo, 'utf8')) as Estado;
      const vivo: Estado = {};
      for (const [k, v] of Object.entries(dados)) if (agora() - v.em < VALIDADE_DO_CONTADOR_MS) vivo[k] = v;
      return vivo;
    } catch {
      return {};
    }
  };
  const gravar = (e: Estado) => {
    try {
      mkdirSync(path.dirname(arquivo), { recursive: true });
      writeFileSync(arquivo, JSON.stringify(e), 'utf8');
    } catch {
      /* sem o contador, só se perde a proteção contra repetição */
    }
  };
  return {
    tempos: (chave) => ler()[chave]?.n ?? 0,
    registrarTempo(chave) {
      const e = ler();
      const n = (e[chave]?.n ?? 0) + 1;
      e[chave] = { n, em: agora() };
      gravar(e);
      return n;
    },
    limpar(chave) {
      const e = ler();
      if (chave in e) {
        delete e[chave];
        gravar(e);
      }
    },
  };
}

// --- O adaptador: o claude no lugar da API de lotes ----------------------------------------------------

/**
 * A falha do claude (cota, tempo, processo) vira um erro com `status` 400, que o ciclo trata como "o lote
 * com certeza NÃO existe" (`recusaDefinitiva`): as reservas voltam à fila de graça, sem contar no limite.
 */
export class FalhaDoClaude extends Error {
  readonly status = 400;
  constructor(
    readonly tipo: 'tempo' | 'cota' | 'processo',
    detalhe: string,
  ) {
    super(`claude: ${tipo} — ${detalhe}`);
  }
}

/** O lote que não existe mais (rodada anterior morreu, ou lote da API antiga): o ciclo registra erro sem custo. */
class LoteDesconhecido extends Error {
  readonly status = 404;
  constructor() {
    super('lote local desconhecido');
  }
}

export interface ApiViaClaude extends ApiDeLotes {
  /** A última falha técnica do claude nesta rodada, se houve (a rodada para de começar envios novos). */
  falhaTecnica(): FalhaDoClaude | null;
}

function textoDoSistema(sistema: unknown): string {
  if (typeof sistema === 'string') return sistema;
  if (Array.isArray(sistema)) return sistema.map((b) => (b as { text?: string }).text ?? '').join('\n\n');
  return '';
}

/** O mesmo pedido sem o código de fronteira (um uuid novo a cada pedido): a chave de repetição do mesmo conteúdo. */
export function chaveDoPedido(sistema: string, mensagem: string): string {
  const semCodigo = mensagem.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '');
  return createHash('sha256').update(sistema).update('|').update(semCodigo).digest('hex').slice(0, 24);
}

export function apiViaClaude(deps: {
  perguntar: Perguntar;
  falhas: ContadorDeFalhas;
  novoId?: () => string;
}): ApiViaClaude {
  const lotes = new Map<string, Map<string, ResultadoDoLote>>();
  let ultimaFalha: FalhaDoClaude | null = null;
  const novoId = deps.novoId ?? (() => `local-${createHash('sha256').update(String(Math.random()) + Date.now()).digest('hex').slice(0, 16)}`);

  return {
    falhaTecnica: () => ultimaFalha,
    async criar(pedidos: PedidoDeLote[]) {
      const id = novoId();
      const resultados = new Map<string, ResultadoDoLote>();
      for (const pedido of pedidos) {
        const sistema = textoDoSistema(pedido.params.system);
        const primeira = pedido.params.messages[0];
        // A continuação de uma pausa (pause_turn) só existe nas revisões da API antiga: aqui o claude julga de novo, do começo.
        const mensagem = typeof primeira?.content === 'string' ? primeira.content : JSON.stringify(primeira?.content ?? '');
        const chave = chaveDoPedido(sistema, mensagem);
        if (deps.falhas.tempos(chave) >= LIMITE_DE_TEMPOS_ESGOTADOS) {
          // Já estourou o tempo com este mesmo conteúdo: não gasta a cota de novo; o envio vai a "erro" (sem custo).
          resultados.set(pedido.custom_id, { type: 'errored', error: 'tempo esgotado repetidas vezes' });
          continue;
        }
        const r = await deps.perguntar({ sistema, mensagem: `${mensagem}\n\n${LEMBRETE_DE_FECHAMENTO}` });
        if (!r.ok) {
          if (r.tipo === 'tempo') deps.falhas.registrarTempo(chave);
          ultimaFalha = new FalhaDoClaude(r.tipo, r.detalhe);
          throw ultimaFalha;
        }
        deps.falhas.limpar(chave);
        resultados.set(pedido.custom_id, { type: 'succeeded', message: r.mensagem });
      }
      lotes.set(id, resultados);
      return { id };
    },
    async consultar(batchId) {
      if (!lotes.has(batchId)) throw new LoteDesconhecido();
      return { status: 'ended' as const };
    },
    async *resultados(batchId) {
      const lote = lotes.get(batchId);
      lotes.delete(batchId);
      for (const [custom_id, result] of lote ?? []) yield { custom_id, result };
    },
    // Sem lote em serviço nenhum, a conciliação não acha candidato: depois do prazo ela devolve o envio à fila.
    async listar() {
      return [];
    },
    async cancelar() {
      return undefined;
    },
  };
}
