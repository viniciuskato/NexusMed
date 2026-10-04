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
// Mas o programa que está rodando JÁ carregou o código antigo (rodada, textos do revisor, validação). Se o pull moveu o
// HEAD, esta rodada NÃO segue: registra a atualização e encerra sem tocar o banco nem o claude; a rodada seguinte (15
// minutos depois) já carrega o código novo. Se o `package-lock.json` mudou no pull, roda `npm ci` antes de encerrar; se
// o `npm ci` falhar, deixa um marcador dentro de `.git` e nenhuma rodada roda até ele passar.
//
// `GIT_OPTIONAL_LOCKS=0` em todo comando git: o `git status` tenta regravar o índice só para "adiantar" a próxima
// leitura, e com o VS Code aberto na mesma pasta esse bloqueio opcional pode disputar o índice com o git dele. Sem
// ele, a leitura não escreve nada nem disputa o bloqueio (o `pull` continua pegando os bloqueios de que precisa).
import { execFile } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface ResultadoDoGit {
  codigo: number;
  saida: string;
}

/** Roda `git <args>` na pasta e devolve o código de saída e a saída padrão (nunca lança). */
export type RodarGit = (pasta: string, args: string[]) => Promise<ResultadoDoGit>;

/**
 * `normal`: a rodada não segue, mas não é falha (a main acabou de ser atualizada e a próxima rodada já usa o código novo):
 * o agendador não deve mostrar erro.
 */
export type ResultadoDaGuarda = { ok: true; commit: string } | { ok: false; motivo: string; normal?: boolean };

/** Instala as dependências pelo lockfile (`npm ci`) na pasta; devolve se deu certo. Nunca lança. */
export type InstalarDependencias = (pasta: string) => Promise<boolean>;

export const TEMPO_DO_NPM_CI_MS = 10 * 60_000;

export const instalarDependencias: InstalarDependencias = (pasta) =>
  new Promise((resolve) => {
    // `shell: true` porque no Windows o npm é um `.cmd`; os argumentos são fixos.
    execFile(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['ci'],
      { cwd: pasta, timeout: TEMPO_DO_NPM_CI_MS, windowsHide: true, shell: true, encoding: 'utf8' },
      (erro) => resolve(!erro),
    );
  });

const MARCADOR_DO_NPM_CI = 'revisor-npm-ci-pendente';

/** Onde fica o marcador de "npm ci pendente": dentro de `.git` (o `npm ci` apaga `node_modules`), ou nulo se não der para saber. */
async function caminhoDoMarcador(pasta: string, git: RodarGit): Promise<string | null> {
  const r = await git(pasta, ['rev-parse', '--git-dir']);
  if (r.codigo !== 0 || !r.saida) return null;
  return path.resolve(pasta, r.saida, MARCADOR_DO_NPM_CI);
}

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

/** O que a rodada faz quando o pull moveu o HEAD: confere o lockfile, instala se mudou e encerra sem tocar o banco. */
async function aposAtualizar(
  pasta: string,
  git: RodarGit,
  instalar: InstalarDependencias,
  marcador: string | null,
  antes: string,
  depois: string,
): Promise<ResultadoDaGuarda> {
  const lock = await git(pasta, ['diff', '--name-only', antes, depois, '--', 'package-lock.json']);
  const lockMudou = lock.codigo === 0 && lock.saida !== '';
  const base = `a main foi atualizada pelo GitHub (${antes.slice(0, 8)} → ${depois.slice(0, 8)}) e esta rodada já tinha carregado o código antigo: encerrada sem tocar o banco nem o claude, a próxima rodada usa o código novo`;
  if (!lockMudou) return { ok: false, normal: true, motivo: base };

  if (marcador) writeFileSync(marcador, `${depois}\n`, 'utf8');
  const feito = await instalar(pasta);
  if (feito) {
    if (marcador) rmSync(marcador, { force: true });
    return { ok: false, normal: true, motivo: `${base}. O package-lock.json mudou e o \`npm ci\` foi feito` };
  }
  return {
    ok: false,
    motivo: `${base}. O package-lock.json mudou e o \`npm ci\` FALHOU: nenhuma rodada roda até ele passar (rode \`npm.cmd ci\` na pasta do repositório)`,
  };
}

export async function conferirCheckout(
  pasta: string,
  git: RodarGit = gitReal,
  instalar: InstalarDependencias = instalarDependencias,
): Promise<ResultadoDaGuarda> {
  // `npm ci` que ficou pendente numa rodada anterior: tenta de novo antes de qualquer coisa.
  const marcador = await caminhoDoMarcador(pasta, git);
  if (marcador && existsSync(marcador)) {
    if (!(await instalar(pasta))) {
      return { ok: false, motivo: 'as dependências não estão em dia (um `npm ci` ficou pendente depois de uma atualização) e o `npm ci` falhou de novo: rode `npm.cmd ci` na pasta do repositório' };
    }
    rmSync(marcador, { force: true });
  }

  const antes = await git(pasta, ['rev-parse', 'HEAD']);
  await atualizarCheckout(pasta, git);
  const depois = await git(pasta, ['rev-parse', 'HEAD']);
  if (antes.codigo === 0 && depois.codigo === 0 && antes.saida && depois.saida && antes.saida !== depois.saida) {
    return aposAtualizar(pasta, git, instalar, marcador, antes.saida, depois.saida);
  }

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
