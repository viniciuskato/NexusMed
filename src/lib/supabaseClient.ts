import { createClient } from '@supabase/supabase-js';

// Cliente Supabase (backend ativo em produção).
//
// Lê as credenciais do ambiente Vite. Em desenvolvimento local, aponte
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (em .env.local, não versionado)
// para a instância local do Supabase CLI (`supabase status` mostra os valores).

// Sob Vite (app real), as variáveis vêm de import.meta.env. Sob execução
// direta via tsx/node (ex.: scripts/validate-supabase-repos.ts, fora do
// bundle Vite), import.meta.env não existe — cai para process.env, que o
// script de validação popula a partir do mesmo .env.local via dotenv.
const env: Record<string, string | undefined> = (import.meta as unknown as { env?: Record<string, string> }).env ?? (
  typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {}
);

function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  if (!key.startsWith('eyJ')) return false;
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).role === 'service_role';
  } catch {
    return false;
  }
}

interface ResolvedConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
}

function resolveConfig(): ResolvedConfig {
  let rawUrl = env.VITE_SUPABASE_URL?.trim();
  let rawKey = env.VITE_SUPABASE_ANON_KEY?.trim();

  // Caso o usuário tenha colado a chave pública/publishable no campo de URL
  if (rawUrl && (rawUrl.startsWith('sb_publishable_') || rawUrl.startsWith('sb_secret_') || rawUrl.startsWith('eyJ'))) {
    const keyFromUrl = rawUrl;
    rawUrl = 'https://jfvhwwvixwvgjfqzlkkb.supabase.co';
    if (!rawKey || isSecretKey(rawKey)) {
      rawKey = keyFromUrl;
    }
  }

  // Uma chave secreta/service_role ignora toda a RLS e, aqui, iria para o
  // bundle público. Nunca usar — o app fica sem Supabase e o erro aparece.
  if (rawKey && isSecretKey(rawKey)) {
    console.error('[supabaseClient] VITE_SUPABASE_ANON_KEY contém uma chave secreta (service_role). Use a chave anon/publishable.');
    rawKey = undefined;
  }

  // Caso o usuário tenha informado apenas a referência do projeto
  if (rawUrl && !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    if (rawUrl.includes('.supabase.co')) {
      rawUrl = `https://${rawUrl}`;
    } else if (/^[a-z0-9_-]{10,40}$/i.test(rawUrl)) {
      rawUrl = `https://${rawUrl}.supabase.co`;
    }
  }

  // Validação de formato de URL HTTP/HTTPS
  let isValid = false;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      isValid = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      isValid = false;
    }
  }

  const isConfigured = Boolean(isValid && rawKey);
  return {
    url: isValid ? rawUrl! : 'https://placeholder.supabase.co',
    anonKey: rawKey || 'placeholder-anon-key',
    isConfigured,
  };
}

const resolved = resolveConfig();

export const isSupabaseConfigured = resolved.isConfigured;

if (!isSupabaseConfigured) {
  console.warn(
    '[supabaseClient] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas ou inválidas. ' +
      'Operando em modo local resiliente com dados simulados.'
  );
}

function initSupabase() {
  try {
    return createClient(resolved.url, resolved.anonKey);
  } catch (err) {
    console.error('[supabaseClient] Falha ao inicializar createClient, usando fallback seguro:', err);
    return createClient('https://placeholder.supabase.co', 'placeholder-anon-key');
  }
}

export const supabase = initSupabase();
