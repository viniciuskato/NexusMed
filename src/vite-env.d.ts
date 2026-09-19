/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

/** Commit do build (vite.config.ts `define`), ou 'local'. */
declare const __APP_RELEASE__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
