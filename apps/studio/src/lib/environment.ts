import { resolveStudioEnvironment } from './studio-environment-resolver.ts';

export const studioEnvironment = resolveStudioEnvironment({
  environment: import.meta.env.VITE_APP_ENVIRONMENT,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabasePublicKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  publicAppOrigin: import.meta.env.VITE_PUBLIC_APP_ORIGIN,
  studioOrigin: import.meta.env.VITE_STUDIO_ORIGIN,
});
