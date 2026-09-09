// @ts-nocheck -- checked by the function-local Deno configuration.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 256;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
});
const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};
const parseBody = (raw: string): { sessionId: string } | null => {
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 1 || !UUID_PATTERN.test(String(value.sessionId))) {
      return null;
    }
    return { sessionId: String(value.sessionId) };
  } catch {
    return null;
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authorization = request.headers.get('Authorization')?.trim() ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const body = parseBody(await request.text());
  if (!body) return json({ error: 'invalid_request' }, 400);

  const url = env('SUPABASE_URL');
  const caller = createClient(url, env('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: actor, error: authError } = await caller.auth.getUser();
  if (authError || !actor.user?.id) return json({ error: 'unauthorized' }, 401);

  const service = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await service.rpc('rpc_service_reconcile_live_odo_show_v1', {
    p_session_id: body.sessionId,
    p_requested_by_user_id: actor.user.id,
    p_lease_owner: crypto.randomUUID(),
  });
  if (error) {
    console.error('[live-odo-show-director] reconcile_failed', { code: error.code ?? 'unknown' });
    return json({ error: 'odo_show_director_unavailable' }, 503);
  }
  return json({
    ok: true,
    didWork: data?.didWork === true,
    actionType: String(data?.actionType ?? 'WAIT'),
    reasonCode: String(data?.reasonCode ?? 'authoritative_state_current'),
    nextWakeAt: typeof data?.nextWakeAt === 'string' ? data.nextWakeAt : null,
  });
});
