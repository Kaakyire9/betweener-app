// @ts-nocheck -- checked by the function-local Deno configuration.
import { StreamClient } from '@stream-io/node-sdk';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json',
    Pragma: 'no-cache',
  },
});

const env = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let step = 'request_validation';
  try {
    const authorization = request.headers.get('Authorization')?.trim() ?? '';
    if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const body = await request.json().catch(() => ({}));
    const privateSparkId = typeof body.privateSparkId === 'string'
      ? body.privateSparkId.trim()
      : '';
    const reason = typeof body.reason === 'string'
      ? body.reason.trim().slice(0, 80)
      : 'left';
    if (!UUID_PATTERN.test(privateSparkId)) return json({ error: 'invalid_private_spark_id' }, 400);

    const url = env('SUPABASE_URL');
    const caller = createClient(url, env('SUPABASE_ANON_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user?.id) return json({ error: 'unauthorized' }, 401);

    step = 'database_transition';
    const { data: spark, error: transitionError } = await caller.rpc(
      'rpc_end_live_private_spark',
      { p_private_spark_id: privateSparkId, p_reason: reason || 'left' },
    );
    if (transitionError) return json({ error: 'live_private_spark_end_denied' }, 403);

    step = 'provider_identity';
    const service = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: providerState, error: providerStateError } = await service
      .from('live_private_sparks')
      .select('provider,provider_call_type,provider_call_id,state')
      .eq('id', privateSparkId)
      .single();
    if (providerStateError || !providerState) {
      return json({ error: 'live_private_spark_control_state_missing' }, 500);
    }

    // The database transition is authoritative and immediately revokes new
    // tokens. Ending Stream as a second idempotent step also disconnects any
    // clients that were already admitted before the transition.
    if (providerState.provider === 'stream') {
      step = 'provider_termination';
      try {
        const stream = new StreamClient(
          env('STREAM_VIDEO_API_KEY'),
          env('STREAM_VIDEO_API_SECRET'),
        );
        await stream.video
          .call(providerState.provider_call_type, providerState.provider_call_id)
          .end();
      } catch (providerError) {
        console.info('[live-private-spark-control] provider-sync-pending', {
          privateSparkId,
          name: providerError instanceof Error ? providerError.name : 'unknown',
        });
        return json({ spark, providerSyncPending: true }, 202);
      }
    }

    return json({ spark, providerSyncPending: false });
  } catch (error) {
    console.info('[live-private-spark-control] unavailable', {
      step,
      name: error instanceof Error ? error.name : 'unknown',
    });
    return json({ error: 'live_private_spark_control_unavailable' }, 500);
  }
});
