// @ts-nocheck -- Supabase Edge runtime supplies Deno and remote imports.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';
import { getSupabaseAdminKey } from './supabase-admin-key.ts';

export const createPhoneAdmin = () => createClient(
  Deno.env.get('SUPABASE_URL')!, getSupabaseAdminKey(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const phoneJson = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

export const phonePreflight = () => new Response('ok', { headers: corsHeaders });
