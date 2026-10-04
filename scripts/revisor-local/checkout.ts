// Guarda do checkout (P8): o revisor local roda o código que está na pasta do repositório, com acesso de escrita
// ao banco de produção. Por isso só roda se essa pasta é EXATAMENTE o que a `main` do GitHub tem: na branch
// `main`, com o mesmo commit de `origin/main` (depois de um `git fetch`) e sem mudança em arquivo rastreado.
// Branch de trabalho, commit local que não está no GitHub, atraso em relação ao GitHub ou arquivo editado à mão
// não rodam: a rodada registra o motivo e sai sem tocar o banco nem o claude. Arquivo novo (não rastreado) não conta.
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
      { timeout: TEMPO_DO_GIT_MS, windowsHide: true, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (erro, stdout) => {
        const codigo = erro ? (typeof (erro as { code?: unknown }).code === 'number' ? (erro as { code: number }).code : 1) : 0;
        resolve({ codigo, saida: String(stdout ?? '').trim() });
      },
    );
  });

export async function conferirCheckout(pasta: string, git: RodarGit = gitReal): Promise<ResultadoDaGuarda> {
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
