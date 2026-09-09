// @ts-nocheck -- checked by the function-local Deno configuration.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 256;
const MAX_STEPS_PER_WAKE = 8;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
});
const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseBody = (raw: string): { sessionId: string } | null => {
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    if (!isRecord(value) || Object.keys(value).length !== 1
      || !UUID_PATTERN.test(String(value.sessionId))) return null;
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
  const anonKey = env('SUPABASE_ANON_KEY');
  const caller = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: actor, error: authError } = await caller.auth.getUser();
  if (authError || !actor.user?.id) return json({ error: 'unauthorized' }, 401);

  const service = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let steps = 0;
  let lastActionType = 'WAIT';
  let lastReasonCode = 'authoritative_state_current';
  let nextWakeAt: string | null = null;
  let snapshot: unknown = null;

  for (let index = 0; index < MAX_STEPS_PER_WAKE; index += 1) {
    const { data: result, error } = await service.rpc(
      'rpc_service_reconcile_live_odo_full_quick_connect_v1',
      {
        p_session_id: body.sessionId,
        p_requested_by_user_id: actor.user.id,
        p_lease_owner: crypto.randomUUID(),
      },
    );
    if (error) {
      console.error('[live-odo-full-quick-connect] reconcile_failed', {
        code: error.code ?? 'unknown',
      });
      return json({ error: 'odo_full_quick_connect_unavailable' }, 503);
    }
    if (!result?.allowed) {
      lastReasonCode = String(result?.reasonCode ?? 'full_quick_connect_not_active');
      nextWakeAt = typeof result?.nextWakeAt === 'string' ? result.nextWakeAt : null;
      break;
    }
    steps += 1;
    lastActionType = String(result.actionType ?? 'WAIT');
    lastReasonCode = String(result.reasonCode ?? 'authoritative_state_current');
    nextWakeAt = typeof result.nextWakeAt === 'string' ? result.nextWakeAt : null;
    snapshot = result.snapshot ?? snapshot;
    if (result.didWork !== true) break;
  }

  // Presentation is deliberately best-effort. A model/provider/budget outage
  // cannot stop the deterministic Quick Connect lifecycle.
  let presentationWakeSucceeded = false;
  try {
    const response = await fetch(`${url}/functions/v1/live-odo-autopilot`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId: body.sessionId }),
    });
    presentationWakeSucceeded = response.ok;
  } catch {
    presentationWakeSucceeded = false;
  }

  return json({
    ok: true,
    steps,
    lastActionType,
    reasonCode: lastReasonCode,
    nextWakeAt,
    presentationWakeSucceeded,
    snapshot,
  });
});
