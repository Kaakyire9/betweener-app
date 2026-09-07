// @ts-nocheck -- checked by the function-local Deno configuration.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import {
  ODO_CONSTITUTION_VERSION,
  OdoModelRouter,
  OpenAIOdoProvider,
  ServerOdoContentGate,
  runOdoShadowProvider,
} from '../_shared/odo/index.ts';
import { parseOdoDirectorSnapshot } from '../../../features/live/odo/domain/index.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 1_024;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
});

const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

const optionalEnv = (name: string) => Deno.env.get(name)?.trim() || undefined;

const parseBody = (raw: string): { sessionId: string } | null => {
  if (!raw || raw.length > MAX_BODY_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.keys(value).length !== 1 || !UUID_PATTERN.test(value.sessionId)) return null;
    return { sessionId: value.sessionId };
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
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const caller = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: actor, error: authError } = await caller.auth.getUser();
  if (authError || !actor.user?.id) return json({ error: 'unauthorized' }, 401);

  // Model routing is server-owned. The request schema contains no model,
  // complexity, provider, prompt, profile, or action fields.
  const router = new OdoModelRouter({
    ODO_LUNA_MODEL: optionalEnv('ODO_LUNA_MODEL'),
    ODO_TERRA_MODEL: optionalEnv('ODO_TERRA_MODEL'),
    ODO_SOL_MODEL: optionalEnv('ODO_SOL_MODEL'),
  });
  const route = router.route('director_action', 'routine');
  if (!route.synchronousProviderAllowed) {
    return json({ error: 'odo_provider_unavailable' }, 503);
  }

  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const actionId = crypto.randomUUID();
  const leaseOwner = crypto.randomUUID();

  // RPC 1 is a short transaction. It releases all locks before AI network I/O.
  const { data: acquired, error: acquireError } = await service.rpc('rpc_service_begin_live_odo_call_v1', {
    p_session_id: body.sessionId,
    p_requested_by_user_id: actor.user.id,
    p_lease_owner: leaseOwner,
    p_action_id: actionId,
    p_task: 'director_action',
    p_provider: 'openai',
    p_model_class: route.modelClass,
    p_model: route.model,
    p_routing_reason_code: route.reasonCode,
  });
  if (acquireError) {
    console.error('[live-odo-director] acquire_failed', { code: acquireError.code ?? 'unknown' });
    return json({ error: 'odo_unavailable' }, 503);
  }
  if (!acquired?.allowed) {
    const throttled = ['minimum_interval', 'minute_call_budget_exhausted', 'lease_held']
      .includes(String(acquired?.reasonCode));
    return json({ ok: false, shadow: true, reasonCode: acquired?.reasonCode ?? 'not_started' }, throttled ? 429 : 409);
  }

  const snapshotResult = parseOdoDirectorSnapshot(acquired.snapshot);
  if (!snapshotResult.ok) {
    await service.rpc('rpc_service_fail_live_odo_call_v1', {
      p_call_id: acquired.callId,
      p_lease_owner: leaseOwner,
      p_failure_reason_code: 'invalid_server_snapshot',
      p_timed_out: false,
    });
    return json({ error: 'odo_snapshot_unavailable' }, 503);
  }

  const now = new Date();
  const leaseExpiry = Date.parse(acquired.leaseExpiresAt);
  const expiresAt = new Date(Math.min(leaseExpiry - 250, now.getTime() + 10_000)).toISOString();
  const providerRequest = {
    model: route.model,
    constitutionVersion: ODO_CONSTITUTION_VERSION,
    snapshot: snapshotResult.value,
    // Phase 10A sends no raw biography or arbitrary profile text. Future
    // profile context must pass through curateOdoProfile's fixed allowlist.
    profiles: [],
    actionIdentity: {
      actionId,
      sessionId: body.sessionId,
      snapshotVersion: acquired.snapshot.currentStateVersion,
      leaseGeneration: acquired.leaseGeneration,
      expiresAt,
    },
  };

  let run;
  try {
    const provider = new OpenAIOdoProvider({
      apiKey: env('OPENAI_API_KEY'),
      timeoutMs: acquired.providerTimeoutMs,
    });
    run = await runOdoShadowProvider({
      provider,
      contentGate: new ServerOdoContentGate(),
      request: providerRequest,
      now,
    });
  } catch {
    // Constructor/configuration failures use the same deterministic, single-
    // pass fallback path and never cause a provider retry or escalation.
    const { DeterministicOdoProvider } = await import('../_shared/odo/index.ts');
    run = await runOdoShadowProvider({
      provider: new DeterministicOdoProvider('odo-config-fallback-v1'),
      contentGate: new ServerOdoContentGate(),
      request: providerRequest,
      now,
    });
    run.fallbackUsed = true;
    run.providerFailureReasonCode = 'provider_unavailable';
  }

  // RPC 2 opens a new short transaction and rechecks every authoritative
  // condition against fresh state before persisting only a shadow outcome.
  const { data: policy, error: policyError } = await service.rpc('rpc_service_evaluate_live_odo_action_v1', {
    p_call_id: acquired.callId,
    p_lease_owner: leaseOwner,
    p_action: run.action,
    p_content_gate_accepted: run.contentGateAccepted,
    p_content_gate_reason_code: run.contentGateReasonCode,
    p_provider_request_id: run.metadata.providerRequestId,
    p_input_tokens: run.metadata.inputTokens,
    p_cached_input_tokens: run.metadata.cachedInputTokens,
    p_output_tokens: run.metadata.outputTokens,
    p_latency_ms: run.metadata.latencyMs,
    p_fallback_used: run.fallbackUsed,
    p_provider_failure_reason_code: run.providerFailureReasonCode,
  });
  if (policyError) {
    console.error('[live-odo-director] policy_failed', { code: policyError.code ?? 'unknown' });
    await service.rpc('rpc_service_fail_live_odo_call_v1', {
      p_call_id: acquired.callId,
      p_lease_owner: leaseOwner,
      p_failure_reason_code: 'policy_evaluation_failed',
      p_timed_out: false,
    });
    return json({ error: 'odo_policy_unavailable' }, 503);
  }

  // Generated copy and payloads are intentionally absent from the response.
  return json({
    ok: true,
    shadow: true,
    actionType: policy.actionType ?? run.action.type,
    policyOutcome: policy.policyOutcome,
    reasonCode: policy.reasonCode,
    fallbackUsed: run.fallbackUsed,
  });
});

