import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { segredoConfere, sha256Hex, verificarChamada } from '../../supabase/functions/revisar-envios/seguranca.ts';

// 44-F — a função `revisar-envios` só aceita o agendador (segredo próprio), e
// nenhum segredo da API mora no repositório nem no que vai para o navegador.

const RAIZ = process.cwd();
const SEGREDO = 'segredo-de-teste-do-agendador';
const AMBIENTE = {
  REVISOR_SEGREDO: SEGREDO,
  ANTHROPIC_API_KEY: 'chave-de-teste',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'servico-de-teste',
};

describe('44-F — quem pode chamar a função', () => {
  const ok = { metodo: 'POST', authorization: `Bearer ${SEGREDO}` };

  it('o agendador, com o segredo certo, entra', () => {
    expect(verificarChamada(ok, AMBIENTE)).toEqual({ ok: true });
  });

  it.each([
    ['sem cabeçalho', { metodo: 'POST', authorization: null }],
    ['cabeçalho vazio', { metodo: 'POST', authorization: '' }],
    ['segredo errado', { metodo: 'POST', authorization: 'Bearer outro-segredo' }],
    ['sem "Bearer"', { metodo: 'POST', authorization: SEGREDO }],
    ['segredo com um caractere a mais', { metodo: 'POST', authorization: `Bearer ${SEGREDO}x` }],
    ['segredo com um caractere a menos', { metodo: 'POST', authorization: `Bearer ${SEGREDO.slice(0, -1)}` }],
    ['a chave de serviço do Supabase', { metodo: 'POST', authorization: 'Bearer servico-de-teste' }],
    ['a chave anônima ou um JWT de usuário', { metodo: 'POST', authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.assinatura' }],
  ])('%s: 401, e nada roda', (_nome, chamada) => {
    expect(verificarChamada(chamada, AMBIENTE)).toEqual({ ok: false, status: 401, erro: 'não autorizado' });
  });

  it.each(['GET', 'PUT', 'DELETE', 'OPTIONS'])('método %s: 405', (metodo) => {
    expect(verificarChamada({ metodo, authorization: `Bearer ${SEGREDO}` }, AMBIENTE)).toMatchObject({ ok: false, status: 405 });
  });

  it('sem REVISOR_SEGREDO configurado ninguém entra (nem com cabeçalho vazio ou "Bearer undefined")', () => {
    const sem = { ...AMBIENTE, REVISOR_SEGREDO: undefined };
    for (const authorization of [null, '', 'Bearer ', 'Bearer undefined', `Bearer ${SEGREDO}`]) {
      expect(verificarChamada({ metodo: 'POST', authorization }, sem)).toMatchObject({ ok: false, status: 500 });
    }
    expect(verificarChamada(ok, { ...AMBIENTE, REVISOR_SEGREDO: '' })).toMatchObject({ ok: false, status: 500 });
  });

  it('sem a chave da API ou sem acesso ao Supabase, a função recusa antes de fazer qualquer coisa', () => {
    expect(verificarChamada(ok, { ...AMBIENTE, ANTHROPIC_API_KEY: undefined })).toMatchObject({ ok: false, status: 500 });
    expect(verificarChamada(ok, { ...AMBIENTE, SUPABASE_SERVICE_ROLE_KEY: undefined })).toMatchObject({ ok: false, status: 500 });
    expect(verificarChamada(ok, { ...AMBIENTE, SUPABASE_URL: undefined })).toMatchObject({ ok: false, status: 500 });
  });

  it('a mensagem de erro nunca repete o segredo nem a chave', () => {
    for (const authorization of [null, 'Bearer errado']) {
      const r = verificarChamada({ metodo: 'POST', authorization }, AMBIENTE);
      expect(JSON.stringify(r)).not.toContain(SEGREDO);
      expect(JSON.stringify(r)).not.toContain('chave-de-teste');
    }
  });

  it('segredoConfere compara igual, diferente e de tamanhos diferentes', () => {
    expect(segredoConfere(`Bearer ${SEGREDO}`, SEGREDO)).toBe(true);
    expect(segredoConfere(`Bearer ${SEGREDO}`, 'outro')).toBe(false);
    expect(segredoConfere(null, SEGREDO)).toBe(false);
  });

  it('o hash do sistema é SHA-256 em hexadecimal', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('a função confere a portaria antes de criar qualquer cliente (Supabase ou API)', () => {
    const fonte = readFileSync(path.join(RAIZ, 'supabase/functions/revisar-envios/index.ts'), 'utf8');
    const portaria = fonte.indexOf('verificarChamada(');
    expect(portaria).toBeGreaterThan(-1);
    expect(portaria).toBeLessThan(fonte.indexOf('createClient('));
    expect(portaria).toBeLessThan(fonte.indexOf('new Anthropic('));
  });

  it('a função não usa JWT de usuário (o segredo próprio é a porta) e está declarada no config do Supabase', () => {
    const config = readFileSync(path.join(RAIZ, 'supabase/config.toml'), 'utf8');
    expect(config).toMatch(/\[functions\.revisar-envios\]\s*[\r\n]+verify_jwt = false/);
  });

  it('o erro devolvido pela função nunca carrega detalhe interno', () => {
    const fonte = readFileSync(path.join(RAIZ, 'supabase/functions/revisar-envios/index.ts'), 'utf8');
    expect(fonte).toContain("json({ erro: 'falha interna' }, 500)");
  });
});

// --- Sem segredo no repositório nem no que vai ao navegador -----------------

function arquivosDeTexto(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) arquivosDeTexto(p, saida);
    else if (/\.(ts|tsx|js|mjs|json|html|css|md|toml|sql|yml|yaml)$/.test(nome)) saida.push(p);
  }
  return saida;
}

const PADRAO_DE_CHAVE = /sk-ant-[A-Za-z0-9_-]{16,}/;

describe('44-F — sem segredo no repositório nem no cliente', () => {
  it('nenhum arquivo versionado tem uma chave da Anthropic (sk-ant-...)', () => {
    const versionados = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(ts|tsx|js|mjs|json|html|css|md|toml|sql|yml|yaml|txt|env)$/.test(f) || f.includes('.env'));
    const achados = versionados.filter((f) => {
      const p = path.join(RAIZ, f);
      return existsSync(p) && PADRAO_DE_CHAVE.test(readFileSync(p, 'utf8'));
    });
    expect(achados).toEqual([]);
  });

  it('o código do navegador (src/) não menciona a chave da API, o segredo do agendador nem a chave de serviço', () => {
    const proibidos = /ANTHROPIC_API_KEY|REVISOR_SEGREDO|SUPABASE_SERVICE_ROLE_KEY|sk-ant-/;
    const achados = arquivosDeTexto(path.join(RAIZ, 'src')).filter((f) => proibidos.test(readFileSync(f, 'utf8')));
    expect(achados.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });

  it('o pacote do navegador (dist/, quando já foi gerado) não tem nenhum desses segredos nem a função do servidor', () => {
    const dist = path.join(RAIZ, 'dist');
    if (!existsSync(dist)) return; // o gate de build roda `npm run check:no-debug-bundle`
    const proibidos = /ANTHROPIC_API_KEY|REVISOR_SEGREDO|sk-ant-|SERVICE_ROLE|revisao_reservar_envios|revisao_registrar_resultado/;
    const achados = arquivosDeTexto(dist).filter((f) => proibidos.test(readFileSync(f, 'utf8')));
    expect(achados.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });

  it('o repositório do cliente só chama as funções públicas do usuário, nunca as do servidor', () => {
    const repo = readFileSync(path.join(RAIZ, 'src/repositories/MaterialSubmissionsRepository.ts'), 'utf8');
    expect(repo).not.toMatch(/revisao_(reservar|anexar|liberar|pausar|registrar|pendentes|dados)/);
    expect(repo).toContain("rpc('situacao_da_revisao')");
  });

  it('os segredos da função são lidos do ambiente, nunca escritos no código', () => {
    const fonte = readFileSync(path.join(RAIZ, 'supabase/functions/revisar-envios/index.ts'), 'utf8');
    for (const nome of ['REVISOR_SEGREDO', 'ANTHROPIC_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
      expect(fonte).toContain(`Deno.env.get('${nome}')`);
    }
  });
});
