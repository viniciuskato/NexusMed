import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

// Content-Security-Policy injetada só no build (o dev server do Vite usa
// script inline para o HMR). Como meta tag, vale também no `vite preview`
// usado pela suíte e2e — a política real é exercitada antes de publicar.
// frame-ancestors e os demais headers que não funcionam via meta ficam em
// vercel.json.
function contentSecurityPolicy(supabaseUrl: string | undefined): Plugin {
  // *.supabase.co sempre: supabaseClient.ts aceita VITE_SUPABASE_URL em
  // formatos não-URL (só o ref do projeto etc.) e os normaliza para esse
  // domínio. A origem exata entra quando é uma URL válida (ex.: Supabase
  // local em 127.0.0.1 na suíte e2e).
  const connect = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'];
  try {
    const origin = new URL(supabaseUrl ?? '').origin;
    if (!origin.endsWith('.supabase.co')) {
      connect.push(origin, origin.replace(/^http/, 'ws'));
    }
  } catch {
    // Não é URL: coberto pelo curinga acima.
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_SUPABASE_URL)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Só na própria máquina por padrão (AUD-10). Para testar no celular/rede
      // local: `npm run dev:lan` (passa --host=0.0.0.0 na linha de comando).
      // IPv4 explícito, não 'localhost': o `vite preview` herda este host, e
      // 'localhost' resolve para ::1 no runner do CI — o Playwright espera em
      // 127.0.0.1:4183 e dava timeout.
      host: '127.0.0.1',
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
