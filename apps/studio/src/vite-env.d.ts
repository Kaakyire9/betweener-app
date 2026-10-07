/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENVIRONMENT: 'staging' | 'production';
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_PUBLIC_APP_ORIGIN: string;
  readonly VITE_STUDIO_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
