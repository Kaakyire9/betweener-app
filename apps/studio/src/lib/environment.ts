const required = (name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string => {
  const value = import.meta.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env.local.`);
  return value;
};

export const studioEnvironment = {
  supabaseUrl: required('VITE_SUPABASE_URL'),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY'),
} as const;
