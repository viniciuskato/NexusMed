import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { atualizarCheckout, conferirCheckout, gitReal, type RodarGit } from '../../scripts/revisor-local/checkout.ts';
import { executarCli } from '../../scripts/revisor-local/cli.ts';

// P8 — o revisor local só roda se o checkout é a main do GitHub (git de verdade, repositórios temporários; nada de rede).

// O git de verdade, no Windows, passa fácil de 5 s quando a máquina está ocupada (os outros testes rodam juntos).
vi.setConfig({ testTimeout: 60_000 });

let pasta: string;
beforeAll(() => {
  pasta = mkdtempSync(path.join(tmpdir(), 'revisor-checkout-'));
});
afterAll(() => {
  rmSync(pasta, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=teste', '-c', 'user.email=teste@exemplo.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

let n = 0;
/** Um "GitHub" (repositório vazio de verdade), um checkout e um segundo clone para empurrar commits à origem. */
function cenario() {
  n += 1;
  const origem = path.join(pasta, `origem-${n}.git`);
  git(pasta, 'init', '--bare', '-b', 'main', origem);
  const checkout = path.join(pasta, `checkout-${n}`);
  const outro = path.join(pasta, `outro-${n}`);
  git(pasta, 'clone', '--quiet', origem, checkout);
  writeFileSync(path.join(checkout, 'a.txt'), 'um\n');
  git(checkout, 'add', 'a.txt');
  git(checkout, 'commit', '--quiet', '-m', 'um');
  git(checkout, 'push', '--quiet', 'origin', 'HEAD:main');
  git(pasta, 'clone', '--quiet', origem, outro);
  return { origem, checkout, outro };
}

describe('conferirCheckout', () => {
  it('na main, igual à origin/main e sem mudança: roda', async () => {
    const { checkout } = cenario();
    const r = await conferirCheckout(checkout);
    expect(r).toEqual({ ok: true, commit: git(checkout, 'rev-parse', 'HEAD') });
  });

  it('arquivo novo (não rastreado) não impede; arquivo rastreado editado impede', async () => {
    const { checkout } = cenario();
    writeFileSync(path.join(checkout, 'novo.txt'), 'x');
    expect((await conferirCheckout(checkout)).ok).toBe(true);
    writeFileSync(path.join(checkout, 'a.txt'), 'editado à mão\n');
    const r = await conferirCheckout(checkout);
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/1 arquivo\(s\) rastreado\(s\) com mudança/) });
  });

  it('em outra branch (de trabalho): não roda, mesmo igual à main', async () => {
    const { checkout } = cenario();
    git(checkout, 'switch', '--quiet', '-c', 'feat/qualquer');
    expect(await conferirCheckout(checkout)).toMatchObject({ ok: false, motivo: expect.stringMatching(/não está na branch main \(está em "feat\/qualquer"\)/) });
  });

  it('atrasado em relação ao GitHub e sem poder atualizar (arquivo rastreado editado): o fetch revela e não roda, e a edição fica como está', async () => {
    const { checkout, outro } = cenario();
    const antes = git(checkout, 'rev-parse', 'HEAD');
    writeFileSync(path.join(outro, 'b.txt'), 'dois\n');
    git(outro, 'add', 'b.txt');
    git(outro, 'commit', '--quiet', '-m', 'dois');
    git(outro, 'push', '--quiet', 'origin', 'HEAD:main');
    writeFileSync(path.join(checkout, 'a.txt'), 'editado à mão\n');
    // Sem o fetch da guarda, origin/main local ainda seria o commit velho.
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(git(checkout, 'rev-parse', 'refs/remotes/origin/main'));
    expect(await conferirCheckout(checkout)).toMatchObject({ ok: false, motivo: expect.stringMatching(/não é a origin\/main/) });
    // P9: com a edição no caminho, o pull não aconteceu: o HEAD e o arquivo continuam como estavam.
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(antes);
    expect(readFileSync(path.join(checkout, 'a.txt'), 'utf8')).toBe('editado à mão\n');
  });

  it('com commit local que não está no GitHub: não roda', async () => {
    const { checkout } = cenario();
    writeFileSync(path.join(checkout, 'a.txt'), 'local\n');
    git(checkout, 'commit', '--quiet', '-am', 'só aqui');
    expect(await conferirCheckout(checkout)).toMatchObject({ ok: false, motivo: expect.stringMatching(/não é a origin\/main/) });
  });

  it('fetch que falha (origem sumiu) ou pasta que não é repositório: não roda', async () => {
    const { checkout, origem } = cenario();
    rmSync(origem, { recursive: true, force: true });
    expect(await conferirCheckout(checkout)).toMatchObject({ ok: false, motivo: expect.stringMatching(/git fetch. falhou/) });
    // Uma pasta que não é repositório também falha no fetch.
    expect((await conferirCheckout(pasta)).ok).toBe(false);
  });

  it('só escreve no checkout com `pull --ff-only`, e só depois de ver a main limpa; o resto é leitura', async () => {
    const chamadas: string[][] = [];
    const falso: RodarGit = async (_pasta, args) => {
      chamadas.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { codigo: 0, saida: 'main' };
      if (args[0] === 'rev-parse') return { codigo: 0, saida: 'a'.repeat(40) };
      return { codigo: 0, saida: '' };
    };
    expect((await conferirCheckout('x', falso)).ok).toBe(true);
    // Primeiro olha a branch e o estado, depois atualiza, e só então roda a guarda de sempre.
    expect(chamadas.map((c) => c[0])).toEqual([
      'rev-parse', // onde fica .git (marcador de npm ci pendente)
      'rev-parse', // HEAD antes
      'rev-parse', // branch
      'status',
      'pull',
      'rev-parse', // HEAD depois
      'fetch',
      'rev-parse',
      'rev-parse',
      'rev-parse',
      'status',
    ]);
    expect(chamadas.find((c) => c[0] === 'pull')).toEqual(['pull', '--ff-only', '--quiet', 'origin', 'main']);
    // Nenhum outro comando que escreva (nada de checkout, reset, merge, rebase, stash, clean).
    const escrevem = chamadas.map((c) => c[0]).filter((c) => ['checkout', 'switch', 'reset', 'merge', 'rebase', 'stash', 'clean', 'restore', 'commit', 'push'].includes(c));
    expect(escrevem).toEqual([]);
  });
});

// P9 — antes da guarda, `git pull --ff-only` na main (git de verdade, repositórios temporários; nada de rede).
describe('atualizarCheckout (P9)', () => {
  function empurrarCommitNovo(outro: string, arquivo = 'b.txt') {
    writeFileSync(path.join(outro, arquivo), 'dois\n');
    git(outro, 'add', arquivo);
    git(outro, 'commit', '--quiet', '-m', 'dois');
    git(outro, 'push', '--quiet', 'origin', 'HEAD:main');
    return git(outro, 'rev-parse', 'HEAD');
  }

  const semInstalar = async () => {
    throw new Error('o npm ci não devia rodar');
  };

  it('main atrasada e limpa: o pull a atualiza e ESTA rodada encerra (o código antigo já está carregado); a seguinte roda com o commit novo', async () => {
    const { checkout, outro } = cenario();
    const antes = git(checkout, 'rev-parse', 'HEAD');
    const novo = empurrarCommitNovo(outro);
    expect(antes).not.toBe(novo);
    const primeira = await conferirCheckout(checkout, gitReal, semInstalar);
    expect(primeira).toMatchObject({ ok: false, normal: true, motivo: expect.stringContaining(`${antes.slice(0, 8)} → ${novo.slice(0, 8)}`) });
    expect((primeira as { motivo: string }).motivo).toMatch(/encerrada sem tocar o banco nem o claude/);
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(novo);
    expect(git(checkout, 'status', '--porcelain')).toBe('');
    expect(await conferirCheckout(checkout, gitReal, semInstalar)).toEqual({ ok: true, commit: novo });
  });

  it('arquivo novo (não rastreado) não impede o pull, e continua lá', async () => {
    const { checkout, outro } = cenario();
    writeFileSync(path.join(checkout, 'rascunho.txt'), 'meu rascunho\n');
    const novo = empurrarCommitNovo(outro);
    expect(await conferirCheckout(checkout, gitReal, semInstalar)).toMatchObject({ ok: false, normal: true });
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(novo);
    expect(existsSync(path.join(checkout, 'rascunho.txt'))).toBe(true);
    expect(await conferirCheckout(checkout, gitReal, semInstalar)).toEqual({ ok: true, commit: novo });
  });

  it('o pull que avança o HEAD mexendo no package-lock.json: roda `npm ci` na pasta antes de encerrar, e a rodada seguinte roda', async () => {
    const { checkout, outro } = cenario();
    const novo = empurrarCommitNovo(outro, 'package-lock.json');
    const chamadas: string[] = [];
    const instalar = async (pasta: string) => {
      chamadas.push(pasta);
      return true;
    };
    const r = await conferirCheckout(checkout, gitReal, instalar);
    expect(r).toMatchObject({ ok: false, normal: true, motivo: expect.stringMatching(/package-lock\.json mudou e o `npm ci` foi feito/) });
    expect(chamadas).toEqual([checkout]);
    expect(await conferirCheckout(checkout, gitReal, instalar)).toEqual({ ok: true, commit: novo });
    expect(chamadas).toHaveLength(1);
  });

  it('`npm ci` que falha: a rodada encerra com erro e NENHUMA rodada roda até o `npm ci` passar (marcador dentro de .git)', async () => {
    const { checkout, outro } = cenario();
    const novo = empurrarCommitNovo(outro, 'package-lock.json');
    let funciona = false;
    const chamadas: string[] = [];
    const instalar = async (pasta: string) => {
      chamadas.push(pasta);
      return funciona;
    };
    const primeira = await conferirCheckout(checkout, gitReal, instalar);
    expect(primeira).toMatchObject({ ok: false, motivo: expect.stringMatching(/`npm ci` FALHOU/) });
    expect((primeira as { normal?: boolean }).normal).toBeUndefined();
    expect(existsSync(path.join(checkout, '.git', 'revisor-npm-ci-pendente'))).toBe(true);
    // Main já em dia, mas o npm ci pendente barra a rodada (e tenta de novo).
    const segunda = await conferirCheckout(checkout, gitReal, instalar);
    expect(segunda).toMatchObject({ ok: false, motivo: expect.stringMatching(/`npm ci` falhou de novo/) });
    expect(chamadas).toHaveLength(2);
    // Passou: o marcador some e a rodada roda.
    funciona = true;
    expect(await conferirCheckout(checkout, gitReal, instalar)).toEqual({ ok: true, commit: novo });
    expect(existsSync(path.join(checkout, '.git', 'revisor-npm-ci-pendente'))).toBe(false);
    expect(chamadas).toHaveLength(3);
  });

  it('pull que avança o HEAD sem mexer no lockfile não roda `npm ci`', async () => {
    const { checkout, outro } = cenario();
    empurrarCommitNovo(outro, 'outro-arquivo.txt');
    await expect(conferirCheckout(checkout, gitReal, semInstalar)).resolves.toMatchObject({ ok: false, normal: true });
  });

  it('em branch de trabalho: não puxa nada, nem na main nem na branch', async () => {
    const { checkout, outro } = cenario();
    git(checkout, 'switch', '--quiet', '-c', 'feat/qualquer');
    const antes = git(checkout, 'rev-parse', 'HEAD');
    empurrarCommitNovo(outro);
    await atualizarCheckout(checkout);
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(antes);
    expect(git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feat/qualquer');
    expect(git(checkout, 'rev-parse', 'main')).toBe(antes);
    expect(await conferirCheckout(checkout)).toMatchObject({ ok: false, motivo: expect.stringMatching(/não está na branch main/) });
  });

  it('pull que falha (a main local tem commit que o GitHub não tem, e o GitHub avançou): nada é mesclado nem reescrito, a guarda se comporta como hoje', async () => {
    const { checkout, outro } = cenario();
    writeFileSync(path.join(checkout, 'a.txt'), 'local\n');
    git(checkout, 'commit', '--quiet', '-am', 'só aqui');
    const local = git(checkout, 'rev-parse', 'HEAD');
    empurrarCommitNovo(outro);
    const r = await conferirCheckout(checkout);
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/não é a origin\/main/) });
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(local);
    expect(git(checkout, 'log', '--merges', '--oneline')).toBe('');
  });

  it('origem que sumiu: o pull falha em silêncio e a guarda recusa pelo fetch, como hoje', async () => {
    const { checkout, origem } = cenario();
    rmSync(origem, { recursive: true, force: true });
    await expect(atualizarCheckout(checkout)).resolves.toBeUndefined();
    expect(await conferirCheckout(checkout)).toMatchObject({ ok: false, motivo: expect.stringMatching(/git fetch. falhou/) });
  });

  it('todo comando git do programa roda com GIT_OPTIONAL_LOCKS=0 (e sem pedir senha)', async () => {
    const { checkout } = cenario();
    // Um alias de shell mostra o ambiente que o git de verdade recebeu.
    const r = await gitReal(checkout, ['-c', 'alias.ambiente=!printf "%s|%s" "$GIT_OPTIONAL_LOCKS" "$GIT_TERMINAL_PROMPT"', 'ambiente']);
    expect(r).toEqual({ codigo: 0, saida: '0|0' });
  });
});

describe('o programa inteiro com a guarda', () => {
  it('checkout fora da main: registra o motivo, sai com 1 e não chega a tocar o banco nem o claude', async () => {
    const { checkout } = cenario();
    git(checkout, 'switch', '--quiet', '-c', 'feat/p8');
    const dados = path.join(pasta, `dados-${n}`);
    const logs: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(l));
    try {
      // `--supabase` e `--claude` não existem: se a rodada passasse da guarda, o registro teria "rodada iniciada".
      const codigo = await executarCli(
        ['--local', '--dados', dados, '--supabase', path.join(pasta, 'nao-existe.exe'), '--claude', path.join(pasta, 'nao-existe-claude.exe')],
        {},
        { raiz: checkout },
      );
      expect(codigo).toBe(1);
      const saida = logs.join('\n');
      expect(saida).toMatch(/rodada não feita, o banco não foi tocado: o checkout não está na branch main/);
      expect(saida).not.toMatch(/rodada iniciada|fila vazia|falha/);
    } finally {
      log.mockRestore();
    }
  });

  it('main que o pull acabou de atualizar: a rodada em curso encerra com código 0, registra a atualização e não toca o banco nem o claude', async () => {
    const { checkout, outro } = cenario();
    writeFileSync(path.join(outro, 'b.txt'), 'dois\n');
    git(outro, 'add', 'b.txt');
    git(outro, 'commit', '--quiet', '-m', 'dois');
    git(outro, 'push', '--quiet', 'origin', 'HEAD:main');
    const novo = git(outro, 'rev-parse', 'HEAD');
    const dados = path.join(pasta, `dados-${n}`);
    const logs: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(l));
    try {
      // Se a rodada passasse da guarda, o registro teria "rodada iniciada" (o supabase.exe abaixo não existe).
      const codigo = await executarCli(
        ['--local', '--dados', dados, '--supabase', path.join(pasta, 'nao-existe.exe'), '--claude', path.join(pasta, 'nao-existe-claude.exe')],
        {},
        { raiz: checkout },
      );
      expect(codigo).toBe(0);
      const saida = logs.join('\n');
      expect(saida).toMatch(/rodada não feita, o banco não foi tocado: a main foi atualizada pelo GitHub/);
      expect(saida).not.toMatch(/rodada iniciada|fila vazia|falha/);
      expect(git(checkout, 'rev-parse', 'HEAD')).toBe(novo);
      // A rodada seguinte, já com o código novo, passa da guarda.
      logs.length = 0;
      await executarCli(['--local', '--dados', dados, '--supabase', path.join(pasta, 'nao-existe.exe')], {}, { raiz: checkout });
      expect(logs.join('\n')).toMatch(/rodada iniciada/);
    } finally {
      log.mockRestore();
    }
  });

  it('checkout na main em dia: a guarda deixa passar (a rodada começa)', async () => {
    const { checkout } = cenario();
    const dados = path.join(pasta, `dados-${n}`);
    const logs: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(l));
    try {
      await executarCli(['--local', '--dados', dados, '--supabase', path.join(pasta, 'nao-existe.exe')], {}, { raiz: checkout });
      expect(logs.join('\n')).toMatch(/rodada iniciada/);
    } finally {
      log.mockRestore();
    }
  });
});
