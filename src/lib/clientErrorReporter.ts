import { createErrorReporter } from '../services/errorReporting';
import { isSupabaseConfigured, supabase } from './supabaseClient';

// NOVO-02 — instância do app: envia para a RPC `log_client_error`
// (migration 20260918150000_client_errors.sql) só com sessão ativa; sem
// sessão ou sem Supabase configurado, descarta. O supabase-js devolve
// `{ error }` em vez de rejeitar, e o reporter engole qualquer falha.
export const clientErrorReporter = createErrorReporter({
  send: async (p) => {
    if (!isSupabaseConfigured) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.rpc('log_client_error', {
      p_kind: p.kind,
      p_message: p.message,
      p_stack: p.stack,
      p_url: p.url,
      p_release: p.release,
      p_user_agent: p.userAgent,
    });
  },
  release: __APP_RELEASE__,
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  currentUrl: () => window.location.href,
});
