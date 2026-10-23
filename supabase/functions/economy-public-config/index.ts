// @ts-nocheck
// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { getEconomyEnvironment } from '../_shared/economy-config.ts';
import { getSupabaseAdminKey } from '../_shared/supabase-admin-key.ts';
import { getSupabasePublicApiKey } from '../_shared/supabase-public-key.ts';

const PUBLIC_FLAGS = [
  'spark_wallet_enabled',
  'spark_store_enabled',
  'member_spark_grants_enabled',
] as const;

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
    const anonKey = getSupabasePublicApiKey();
    const serviceRoleKey = getSupabaseAdminKey();
    const authorization = request.headers.get('Authorization') || '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const environment = getEconomyEnvironment();
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from('economy_feature_flags')
      .select('flag_key,enabled')
      .eq('environment', environment)
      .in('flag_key', [...PUBLIC_FLAGS]);
    if (error) throw error;

    return new Response(JSON.stringify({
      environment,
      flags: data ?? [],
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30',
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'economy.public_config.failed' }));
    return new Response(JSON.stringify({ error: 'Configuration unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
