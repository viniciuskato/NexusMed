// Regras de segurança do build, separadas de vite.config.ts para serem
// testadas (tests/unit/buildSeguranca45h.test.ts). 45-H: AUD-07 e AUD-32.2.

type Env = Record<string, string | undefined>;

/**
 * Origem (https://ref.supabase.co ou http://127.0.0.1:54321) do projeto
 * Supabase em VITE_SUPABASE_URL, com as mesmas formas que src/lib/
 * supabaseClient.ts aceita: URL completa, host sem protocolo e só a
 * referência do projeto. Devolve null se não der para saber o projeto.
 */
export function supabaseOrigin(rawUrl: string | undefined): string | null {
  let url = rawUrl?.trim();
  if (!url) return null;
  // Chave colada no campo de URL: o cliente a trata à parte; aqui não é projeto.
  if (url.startsWith('sb_') || url.startsWith('eyJ')) return null;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.includes('.supabase.co')) url = `https://${url}`;
    else if (/^[a-z0-9_-]{10,40}$/i.test(url)) url = `https://${url}.supabase.co`;
    else return null;
  }
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Diz por que a chave não pode ir ao bundle público, ou null se pode: chave
 * secreta (sb_secret_...) ou JWT cujo role não é "anon" (ex.: service_role).
 * Chave publishable (sb_publishable_...) e demais valores seguem aceitos.
 */
export function chaveNaoPublica(chave: string): string | null {
  if (chave.startsWith('sb_secret_')) return 'é uma chave secreta (sb_secret_)';
  if (!chave.startsWith('eyJ')) return null;
  try {
    const payload = chave.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const role = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role;
    return role === 'anon' ? null : `é um JWT com role "${String(role)}", não "anon"`;
  } catch {
    return 'é um JWT ilegível (não dá para conferir o role)';
  }
}

/**
 * AUD-07: um build sem as variáveis do Supabase abriria o app em modo local,
 * com o botão de demonstração que cria um perfil admin. Falha o build.
 */
export function assertSupabaseEnv(env: Env): void {
  const faltando = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((nome) => !env[nome]?.trim());
  if (faltando.length > 0) {
    throw new Error(
      `Build recusado: faltam ${faltando.join(' e ')}. Sem elas o app abriria em modo demonstração ` +
        '(perfil admin local). Defina as variáveis do Supabase antes do build (Vercel: Environment Variables; ' +
        'local: .env.local; e2e: .env.test.local).',
    );
  }
  const motivoChave = chaveNaoPublica(env.VITE_SUPABASE_ANON_KEY!.trim());
  if (motivoChave) {
    throw new Error(
      `Build recusado: VITE_SUPABASE_ANON_KEY ${motivoChave}. A chave vai para o bundle público e ignoraria toda a RLS; ` +
        'use a chave anon/publishable.',
    );
  }
  if (!supabaseOrigin(env.VITE_SUPABASE_URL)) {
    throw new Error(
      'Build recusado: VITE_SUPABASE_URL não é uma URL do Supabase (https://<projeto>.supabase.co), ' +
        'um host *.supabase.co ou a referência do projeto; a CSP não saberia qual projeto liberar.',
    );
  }
}

/**
 * AUD-32.2: connect-src libera só o projeto do app (e a Crossref, usada pelo
 * Admin), nunca `*.supabase.co`.
 */
export function connectSrc(supabaseUrl: string | undefined): string[] {
  const connect = ["'self'", 'https://api.crossref.org'];
  const origin = supabaseOrigin(supabaseUrl);
  if (origin) connect.push(origin, origin.replace(/^http/, 'ws'));
  return connect;
}

/**
 * P9: img-src. As figuras dos materiais vêm do Storage do projeto Supabase por URL assinada; no Supabase local
 * (http://127.0.0.1) o `https:` não cobre, então a origem do projeto entra por extenso. Nunca `*.supabase.co`.
 */
export function imgSrc(supabaseUrl: string | undefined): string[] {
  const img = ["'self'", 'data:', 'blob:', 'https:'];
  const origin = supabaseOrigin(supabaseUrl);
  if (origin) img.push(origin);
  return img;
}
