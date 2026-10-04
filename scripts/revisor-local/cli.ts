// Revisor local dos envios (D-12): `npm.cmd run revisor:local` (o agendador chama `rodar-revisor.cmd`).
//
// Olha a fila de envios (materiais, questões e atualizações) no Supabase, e só chama o `claude -p` da
// assinatura do dono quando há envio esperando. Detalhes e operação: docs/operacao/RUNBOOK.md, seção 3.3.
//
// Opções:
//   --local               usa o Supabase LOCAL (padrão: o projeto vinculado, ou seja, produção)
//   --sem-web             desliga a busca e a leitura de página da web (padrão: ligadas, só elas; ou REVISOR_WEB=0)
//   --projeto <pasta>     onde está o Supabase (padrão: a pasta deste repositório)
//   --supabase <exe>      caminho do supabase.exe (ou variável REVISOR_SUPABASE)
//   --claude <exe>        caminho do claude.exe (ou variável REVISOR_CLAUDE; senão, acha sozinho)
//   --dados <pasta>       onde ficam o registro, a trava e o contador (padrão: %LOCALAPPDATA%\NexusMedRevisor)
//   --timeout-min <n>     tempo máximo de cada revisão do claude (padrão 12)
//
// Só roda se o checkout estiver na `main` e igual à `origin/main` do GitHub (P8, `checkout.ts`): código que não
// está na main nunca escreve no banco. Fora disso a rodada registra o motivo e sai com código 1, sem tocar o banco.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executorViaCli, type Alvo } from './banco-cli.ts';
import { conferirCheckout, type ResultadoDaGuarda } from './checkout.ts';
import { contadorEmArquivo, localizarClaude, perguntarAoClaude } from './claude.ts';
import { registroEmArquivo } from './log.ts';
import { executarRodada, type ResumoDaRodada } from './rodada.ts';
import { tentarTravar } from './trava.ts';

export interface Opcoes {
  alvo: Alvo;
  web: boolean;
  projeto: string;
  supabase: string;
  claude: string | null;
  dados: string;
  timeoutMin: number;
}

const RAIZ_DO_REPOSITORIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function lerOpcoes(argv: string[], env: NodeJS.ProcessEnv = process.env): Opcoes {
  const valor = (nome: string): string | undefined => {
    const i = argv.indexOf(nome);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const supabasePadrao = path.join(homedir(), 'bin', 'supabase.exe');
  const timeoutMin = Number(valor('--timeout-min') ?? env.REVISOR_TIMEOUT_MIN ?? 12);
  const claudeInformado = valor('--claude') ?? env.REVISOR_CLAUDE;
  return {
    alvo: argv.includes('--local') ? 'local' : 'linked',
    web: !argv.includes('--sem-web') && env.REVISOR_WEB !== '0',
    projeto: valor('--projeto') ?? env.REVISOR_PROJETO ?? RAIZ_DO_REPOSITORIO,
    supabase: valor('--supabase') ?? env.REVISOR_SUPABASE ?? (existsSync(supabasePadrao) ? supabasePadrao : 'supabase'),
    claude: claudeInformado ?? localizarClaude(env),
    dados: valor('--dados') ?? env.REVISOR_DADOS ?? path.join(env.LOCALAPPDATA ?? homedir(), 'NexusMedRevisor'),
    timeoutMin: Number.isFinite(timeoutMin) && timeoutMin > 0 ? timeoutMin : 12,
  };
}

/** Só os testes trocam: a pasta do repositório que a guarda confere e a própria guarda. */
export interface DepsDaCli {
  raiz?: string;
  conferirCheckout?: (pasta: string) => Promise<ResultadoDaGuarda>;
}

export async function executarCli(argv: string[], env: NodeJS.ProcessEnv = process.env, deps: DepsDaCli = {}): Promise<number> {
  const o = lerOpcoes(argv, env);
  const registrar = registroEmArquivo(path.join(o.dados, 'revisor.log'));

  const trava = tentarTravar(path.join(o.dados, 'trava.lock'));
  if (!trava.ok) {
    registrar(`rodada pulada: ${trava.motivo}`);
    return 0;
  }
  try {
    const guarda = await (deps.conferirCheckout ?? conferirCheckout)(deps.raiz ?? RAIZ_DO_REPOSITORIO);
    if (!guarda.ok) {
      registrar(`rodada não feita, o banco não foi tocado: ${guarda.motivo}`);
      return 1;
    }
    const resumo: ResumoDaRodada = await executarRodada({
      exec: executorViaCli({ alvo: o.alvo, supabase: o.supabase, projeto: o.projeto }),
      perguntar: perguntarAoClaude(
        { exe: o.claude ?? '', pastaNeutra: path.join(o.dados, 'claude-cwd'), timeoutMs: o.timeoutMin * 60_000, web: o.web },
        env,
      ),
      claudeDisponivel: o.claude !== null && existsSync(o.claude),
      falhas: contadorEmArquivo(path.join(o.dados, 'falhas.json')),
      registrar,
      rotuloDoAlvo: o.alvo === 'local' ? 'LOCAL' : 'remoto',
      prazoDoCicloMs: (o.timeoutMin + 5) * 60_000,
    });
    return resumo.falha ? 1 : 0;
  } catch (e) {
    registrar(`falha inesperada: ${(e instanceof Error ? e.message : String(e)).split(/\r?\n/)[0].slice(0, 160)}`);
    return 1;
  } finally {
    trava.liberar();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executarCli(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    () => process.exit(1),
  );
}
