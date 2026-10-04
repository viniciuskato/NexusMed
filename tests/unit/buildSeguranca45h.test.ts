// 45-H — AUD-07 (build sem variáveis do Supabase falha) e AUD-32 (CSP só do
// projeto do app; script antigo com service_role fora do repositório).
import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { assertSupabaseEnv, connectSrc, imgSrc, supabaseOrigin } from '../../vite.seguranca';

const envMock = vi.hoisted(() => ({ valor: {} as Record<string, string> }));
vi.mock('vite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vite')>()),
  loadEnv: () => envMock.valor,
}));

const PROJETO = 'https://abcdefghijklmnop.supabase.co';

describe('AUD-07: build sem as variáveis do Supabase', () => {
  it('sem as duas variáveis, recusa e diz quais faltam', () => {
    expect(() => assertSupabaseEnv({})).toThrow(/VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY/);
  });
  it('só a chave faltando, recusa', () => {
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_URL: PROJETO })).toThrow(/VITE_SUPABASE_ANON_KEY/);
  });
  it('variável só com espaços conta como ausente', () => {
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: 'k' })).toThrow(/VITE_SUPABASE_URL/);
  });
  it('URL que não identifica um projeto Supabase, recusa', () => {
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_URL: 'sb_publishable_xyz', VITE_SUPABASE_ANON_KEY: 'k' })).toThrow(/não é uma URL do Supabase/);
  });
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.assinatura`;
  it('chave service_role (JWT) no lugar da anon, recusa', () => {
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_URL: PROJETO, VITE_SUPABASE_ANON_KEY: jwt('service_role') })).toThrow(/role "service_role"/);
  });
  it('chave secreta nova (sb_secret_), recusa', () => {
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_URL: PROJETO, VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' })).toThrow(/secreta/);
  });
  it('JWT ilegível, recusa', () => {
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_URL: PROJETO, VITE_SUPABASE_ANON_KEY: 'eyJxxx' })).toThrow(/ilegível/);
  });
  it('JWT anon e chave publishable passam', () => {
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_URL: PROJETO, VITE_SUPABASE_ANON_KEY: jwt('anon') })).not.toThrow();
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_URL: PROJETO, VITE_SUPABASE_ANON_KEY: 'sb_publishable_abc' })).not.toThrow();
  });
  it('com as duas variáveis, passa', () => {
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_URL: PROJETO, VITE_SUPABASE_ANON_KEY: 'k' })).not.toThrow();
  });

  it('o vite.config.ts aplica a regra no build e não no servidor de desenvolvimento', async () => {
    const { default: config } = await import('../../vite.config');
    envMock.valor = {};
    expect(() => (config as (e: object) => unknown)({ mode: 'production', command: 'build' })).toThrow(/Build recusado/);
    expect(() => (config as (e: object) => unknown)({ mode: 'development', command: 'serve' })).not.toThrow();
  });
});

describe('AUD-32.2: CSP só libera o projeto Supabase do app', () => {
  it('reconhece URL completa, host sem protocolo e só a referência', () => {
    expect(supabaseOrigin(PROJETO)).toBe(PROJETO);
    expect(supabaseOrigin('abcdefghijklmnop.supabase.co')).toBe(PROJETO);
    expect(supabaseOrigin('abcdefghijklmnop')).toBe(PROJETO);
    expect(supabaseOrigin('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
    expect(supabaseOrigin(undefined)).toBeNull();
    expect(supabaseOrigin('eyJhbGciOi')).toBeNull();
  });

  it('connect-src leva a origem exata e nenhum curinga *.supabase.co', () => {
    const connect = connectSrc(PROJETO);
    expect(connect).toContain(PROJETO);
    expect(connect).toContain('wss://abcdefghijklmnop.supabase.co');
    expect(connect.join(' ')).not.toContain('*');
  });

  it('Supabase local entra com http e ws', () => {
    expect(connectSrc('http://127.0.0.1:54321')).toEqual(expect.arrayContaining(['http://127.0.0.1:54321', 'ws://127.0.0.1:54321']));
  });

  it('a meta de CSP do build sai sem curinga e com o projeto', async () => {
    const { default: config } = await import('../../vite.config');
    envMock.valor = { VITE_SUPABASE_URL: PROJETO, VITE_SUPABASE_ANON_KEY: 'k' };
    const cfg = (config as (e: object) => { plugins: { name?: string; transformIndexHtml?: (h: string) => string }[] })({ mode: 'production', command: 'build' });
    const csp = cfg.plugins.find((p) => p?.name === 'content-security-policy');
    const html = csp!.transformIndexHtml!('<meta charset="UTF-8" />');
    expect(html).toContain(`connect-src 'self' https://api.crossref.org ${PROJETO} wss://abcdefghijklmnop.supabase.co;`);
    expect(html).not.toContain('*.supabase.co');
  });
});

describe('P9: img-src leva a origem do Supabase para as figuras dos materiais', () => {
  it('Supabase local (http) entra por extenso; o remoto também, sem curinga', () => {
    expect(imgSrc('http://127.0.0.1:54321')).toEqual(["'self'", 'data:', 'blob:', 'https:', 'http://127.0.0.1:54321']);
    expect(imgSrc(PROJETO)).toContain(PROJETO);
    expect(imgSrc(PROJETO).join(' ')).not.toContain('*');
  });

  it('sem URL do projeto, só as fontes de sempre', () => {
    expect(imgSrc(undefined)).toEqual(["'self'", 'data:', 'blob:', 'https:']);
  });

  it('a meta de CSP do build libera a imagem do Supabase local e continua sem curinga', async () => {
    const { default: config } = await import('../../vite.config');
    envMock.valor = { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'k' };
    const cfg = (config as (e: object) => { plugins: { name?: string; transformIndexHtml?: (h: string) => string }[] })({ mode: 'production', command: 'build' });
    const html = cfg.plugins.find((p) => p?.name === 'content-security-policy')!.transformIndexHtml!('<meta charset="UTF-8" />');
    expect(html).toContain("img-src 'self' data: blob: https: http://127.0.0.1:54321;");
    expect(html).not.toContain('*.supabase.co');
  });
});

describe('AUD-32.5: script antigo com service_role', () => {
  it('não está mais no repositório', () => {
    expect(existsSync('docs/archive/management-legado/audits/2026-09-14/auditar-materiais-nexusmed.mjs')).toBe(false);
  });
});
