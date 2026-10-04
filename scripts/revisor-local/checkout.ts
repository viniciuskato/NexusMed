// Guarda do checkout (P8): o revisor local roda o código que está na pasta do repositório, com acesso de escrita
// ao banco de produção. Por isso só roda se essa pasta é EXATAMENTE o que a `main` do GitHub tem: na branch
// `main`, com o mesmo commit de `origin/main` (depois de um `git fetch`) e sem mudança em arquivo rastreado.
// Branch de trabalho, commit local que não está no GitHub, atraso em relação ao GitHub ou arquivo editado à mão
// não rodam: a rodada registra o motivo e sai sem tocar o banco nem o claude. Arquivo novo (não rastreado) não conta.
//
// P9: antes da guarda, o programa traz a `main` para o que o GitHub tem (`git pull --ff-only`), mas só se a pasta
// está na `main` e sem mudança em arquivo rastreado (nada do que alguém estava fazendo é tocado) e só em avanço
// rápido (nunca cria merge nem reescreve). Se o pull falhar, tudo continua como antes: a guarda decide pelo estado
// que ficou. Assim o dono não precisa lembrar de atualizar a pasta depois de cada merge.
//
// `GIT_OPTIONAL_LOCKS=0` em todo comando git: o `git status` tenta regravar o índice só para "adiantar" a próxima
// leitura, e com o VS Code aberto na mesma pasta esse bloqueio opcional pode disputar o índice com o git dele. Sem
// ele, a leitura não escreve nada nem disputa o bloqueio (o `pull` continua pegando os bloqueios de que precisa).
import { execFile } from 'node:child_process';

export interface ResultadoDoGit {
  codigo: number;
  saida: string;
}

/** Roda `git <args>` na pasta e devolve o código de saída e a saída padrão (nunca lança). */
export type RodarGit = (pasta: string, args: string[]) => Promise<ResultadoDoGit>;

export type ResultadoDaGuarda = { ok: true; commit: string } | { ok: false; motivo: string };

export const TEMPO_DO_GIT_MS = 60_000;

export const gitReal: RodarGit = (pasta, args) =>
  new Promise((resolve) => {
    execFile(
      'git',
      ['-C', pasta, ...args],
      {
        timeout: TEMPO_DO_GIT_MS,
        windowsHide: true,
        encoding: 'utf8',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
      },
      (erro, stdout) => {
        const codigo = erro ? (typeof (erro as { code?: unknown }).code === 'number' ? (erro as { code: number }).code : 1) : 0;
        resolve({ codigo, saida: String(stdout ?? '').trim() });
      },
    );
  });

/**
 * P9: traz a `main` do checkout para a do GitHub, se a pasta está na `main` e sem mudança em arquivo rastreado.
 * Só avanço rápido (`--ff-only`). Nunca lança e não devolve nada: pull que falha deixa a pasta como estava, e a guarda
 * que vem depois decide com o estado real.
 */
export async function atualizarCheckout(pasta: string, git: RodarGit = gitReal): Promise<void> {
  const branch = await git(pasta, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch.codigo !== 0 || branch.saida !== 'main') return;
  const status = await git(pasta, ['status', '--porcelain', '--untracked-files=no']);
  if (status.codigo !== 0 || status.saida !== '') return;
  await git(pasta, ['pull', '--ff-only', '--quiet', 'origin', 'main']);
}

export async function conferirCheckout(pasta: string, git: RodarGit = gitReal): Promise<ResultadoDaGuarda> {
  await atualizarCheckout(pasta, git);
  const fetch = await git(pasta, ['fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  if (fetch.codigo !== 0) return { ok: false, motivo: 'checkout fora do GitHub: `git fetch` falhou (sem rede, sem acesso ou não é um repositório git)' };

  const branch = await git(pasta, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch.codigo !== 0 || branch.saida !== 'main') {
    return { ok: false, motivo: `o checkout não está na branch main (está em "${branch.saida.slice(0, 80) || '?'}")` };
  }

  const local = await git(pasta, ['rev-parse', 'HEAD']);
  const remoto = await git(pasta, ['rev-parse', 'refs/remotes/origin/main']);
  if (local.codigo !== 0 || remoto.codigo !== 0 || !local.saida || !remoto.saida) {
    return { ok: false, motivo: 'não foi possível ler o commit de HEAD e de origin/main' };
  }
  if (local.saida !== remoto.saida) {
    return {
      ok: false,
      motivo: `a main deste checkout (${local.saida.slice(0, 8)}) não é a origin/main (${remoto.saida.slice(0, 8)}): rode git pull --ff-only (ou há commit local fora do GitHub)`,
    };
  }

  const status = await git(pasta, ['status', '--porcelain', '--untracked-files=no']);
  if (status.codigo !== 0) return { ok: false, motivo: 'não foi possível ler o estado do checkout (git status falhou)' };
  if (status.saida !== '') {
    const n = status.saida.split(/\r?\n/).filter(Boolean).length;
    return { ok: false, motivo: `o checkout tem ${n} arquivo(s) rastreado(s) com mudança que não está na main` };
  }
  return { ok: true, commit: local.saida };
}
