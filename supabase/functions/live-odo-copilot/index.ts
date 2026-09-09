// @ts-nocheck -- checked by the function-local Deno configuration.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import {
  ODO_COPILOT_CONSTITUTION_VERSION,
  OdoModelRouter,
  OpenAIOdoProvider,
  OdoProviderError,
  ServerOdoCopilotContentGate,
  isValidOdoCopilotDraft,
  runOdoCopilotProvider,
  type OdoCopilotProviderDraft,
  type OdoCopilotTask,
} from '../_shared/odo/index.ts';
import { parseOdoDirectorSnapshot } from '../../../features/live/odo/domain/index.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASKS = [
  'conversation_spark', 'audience_pulse', 'pair_narration', 'scene_suggestion',
  'transition_copy', 'session_welcome', 'session_closing',
] as const satisfies readonly OdoCopilotTask[];
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
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseBody = (raw: string): {
  sessionId: string;
  task: OdoCopilotTask;
  roundId: string | null;
} | null => {
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    if (!isRecord(value)) return null;
    const keys = Object.keys(value);
    if (!keys.every((key) => ['sessionId', 'task', 'roundId'].includes(key))
      || !['sessionId', 'task'].every((key) => keys.includes(key))
      || !UUID_PATTERN.test(String(value.sessionId))
      || !TASKS.includes(value.task as OdoCopilotTask)
      || (value.roundId !== undefined && value.roundId !== null
        && !UUID_PATTERN.test(String(value.roundId)))) return null;
    const roundId = value.roundId === undefined ? null : value.roundId as string | null;
    if (['conversation_spark', 'pair_narration'].includes(String(value.task)) && !roundId) return null;
    return { sessionId: String(value.sessionId), task: value.task as OdoCopilotTask, roundId };
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

  const router = new OdoModelRouter({
    ODO_LUNA_MODEL: optionalEnv('ODO_LUNA_MODEL'),
    ODO_TERRA_MODEL: optionalEnv('ODO_TERRA_MODEL'),
    ODO_SOL_MODEL: optionalEnv('ODO_SOL_MODEL'),
  });
  // Phase 10B always takes the routine Luna route. It never escalates synchronously.
  const route = router.route(body.task, 'routine');
  const service = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const actionId = crypto.randomUUID();
  const leaseOwner = crypto.randomUUID();
  const { data: acquired, error: acquireError } = await service.rpc(
    'rpc_service_begin_live_odo_copilot_call_v1',
    {
      p_session_id: body.sessionId,
      p_requested_by_user_id: actor.user.id,
      p_lease_owner: leaseOwner,
      p_action_id: actionId,
      p_task: body.task,
      p_round_id: body.roundId,
      p_provider: 'openai',
      p_model_class: route.modelClass,
      p_model: route.model,
      p_routing_reason_code: route.reasonCode,
    },
  );
  if (acquireError) {
    console.error('[live-odo-copilot] acquire_failed', { code: acquireError.code ?? 'unknown' });
    return json({ error: 'odo_copilot_unavailable' }, 503);
  }
  if (!acquired?.allowed) {
    const throttled = ['lease_held'].includes(String(acquired?.reasonCode));
    return json({ ok: false, reasonCode: acquired?.reasonCode ?? 'not_started' }, throttled ? 429 : 409);
  }

  const snapshot = parseOdoDirectorSnapshot(acquired.snapshot);
  const safeContext = isRecord(acquired.safeContext) ? acquired.safeContext : null;
  const fallback = safeContext?.deterministicFallback;
  const profiles = Array.isArray(safeContext?.profiles) ? safeContext.profiles : null;
  const taskContext = isRecord(safeContext?.taskContext) ? safeContext.taskContext : null;
  const allowedSignalCodes = Array.isArray(safeContext?.allowedSignalCodes)
    && safeContext.allowedSignalCodes.every((code) => typeof code === 'string')
    ? safeContext.allowedSignalCodes as string[]
    : null;
  if (!snapshot.ok || !profiles || !taskContext || !allowedSignalCodes
    || !isValidOdoCopilotDraft(fallback, body.task)) {
    await service.rpc('rpc_service_fail_live_odo_call_v1', {
      p_call_id: acquired.callId,
      p_lease_owner: leaseOwner,
      p_failure_reason_code: 'invalid_copilot_context',
      p_timed_out: false,
    });
    return json({ error: 'odo_copilot_context_unavailable' }, 503);
  }

  const leaseExpiry = Date.parse(acquired.leaseExpiresAt);
  const providerRequest = {
    model: route.model,
    constitutionVersion: ODO_COPILOT_CONSTITUTION_VERSION,
    task: body.task,
    snapshot: snapshot.value,
    profiles,
    taskContext,
    actionIdentity: {
      actionId,
      sessionId: body.sessionId,
      snapshotVersion: acquired.snapshot.currentStateVersion,
      leaseGeneration: acquired.leaseGeneration,
      expiresAt: new Date(Math.min(leaseExpiry - 250, Date.now() + 10_000)).toISOString(),
    },
  };

  const fallbackProvider = {
    generateCopilotSuggestion: () => Promise.reject(new OdoProviderError(
      'provider_unavailable', acquired.fallbackReasonCode ?? 'deterministic_fallback', null,
    )),
  };
  let provider = fallbackProvider;
  if (acquired.providerAllowed) {
    try {
      provider = new OpenAIOdoProvider({
        apiKey: env('OPENAI_API_KEY'),
        timeoutMs: acquired.providerTimeoutMs,
      });
    } catch {
      provider = fallbackProvider;
    }
  }
  const run = await runOdoCopilotProvider({
    provider,
    contentGate: new ServerOdoCopilotContentGate(),
    request: providerRequest,
    task: body.task,
    deterministicFallback: fallback as OdoCopilotProviderDraft,
    allowedSignalCodes,
  });
  if (!acquired.providerAllowed && acquired.fallbackReasonCode) {
    run.providerFailureReasonCode = String(acquired.fallbackReasonCode);
    run.fallbackUsed = true;
  }

  const { data: completed, error: completionError } = await service.rpc(
    'rpc_service_complete_live_odo_copilot_call_v1',
    {
      p_call_id: acquired.callId,
      p_lease_owner: leaseOwner,
      p_draft: run.draft,
      p_content_gate_accepted: true,
      p_content_gate_reason_code: run.contentGateReasonCode,
      p_provider_request_id: run.metadata.providerRequestId,
      p_input_tokens: run.metadata.inputTokens,
      p_cached_input_tokens: run.metadata.cachedInputTokens,
      p_output_tokens: run.metadata.outputTokens,
      p_latency_ms: run.metadata.latencyMs,
      p_fallback_used: run.fallbackUsed,
      p_provider_failure_reason_code: run.providerFailureReasonCode,
    },
  );
  if (completionError) {
    console.error('[live-odo-copilot] completion_failed', { code: completionError.code ?? 'unknown' });
    await service.rpc('rpc_service_fail_live_odo_call_v1', {
      p_call_id: acquired.callId,
      p_lease_owner: leaseOwner,
      p_failure_reason_code: 'copilot_completion_failed',
      p_timed_out: false,
    });
    return json({ error: 'odo_copilot_policy_unavailable' }, 503);
  }
  if (!completed?.accepted) {
    return json({ ok: false, reasonCode: completed?.reasonCode ?? 'suggestion_rejected' }, 409);
  }
  return json({
    ok: true,
    suggestion: completed.suggestion,
    fallbackUsed: run.fallbackUsed,
  });
});
