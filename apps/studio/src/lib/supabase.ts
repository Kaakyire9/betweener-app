import { createClient } from '@supabase/supabase-js';

import { studioEnvironment } from './environment.ts';

export const supabase = createClient(
  studioEnvironment.supabaseUrl,
  studioEnvironment.supabaseAnonKey,
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'betweener-studio-auth',
    },
  },
);
