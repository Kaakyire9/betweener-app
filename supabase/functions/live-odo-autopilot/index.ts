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
const GENERATION_TASKS = ['pair_narration', 'conversation_spark'] as const;
const MAX_BODY_BYTES = 256;
const MAX_EVENTS_PER_WAKE = 8;

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
  const caller = createClient(url, env('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: actor, error: authError } = await caller.auth.getUser();
  if (authError || !actor.user?.id) return json({ error: 'unauthorized' }, 401);

  const service = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const router = new OdoModelRouter({
    ODO_LUNA_MODEL: optionalEnv('ODO_LUNA_MODEL'),
    ODO_TERRA_MODEL: optionalEnv('ODO_TERRA_MODEL'),
    ODO_SOL_MODEL: optionalEnv('ODO_SOL_MODEL'),
  });
  const route = router.route('pair_narration', 'routine');
  let processed = 0;
  let visibleActions = 0;
  let lastReasonCode = 'queue_drained';

  for (let index = 0; index < MAX_EVENTS_PER_WAKE; index += 1) {
    const leaseOwner = crypto.randomUUID();
    const { data: claim, error: claimError } = await service.rpc(
      'rpc_service_claim_live_odo_guarded_event_v1',
      {
        p_session_id: body.sessionId,
        p_requested_by_user_id: actor.user.id,
        p_lease_owner: leaseOwner,
        p_model: route.model,
        p_routing_reason_code: 'guarded_autopilot_luna',
      },
    );
    if (claimError) {
      console.error('[live-odo-autopilot] claim_failed', { code: claimError.code ?? 'unknown' });
      return json({ error: 'odo_guarded_autopilot_unavailable' }, 503);
    }
    if (!claim?.allowed) {
      lastReasonCode = String(claim?.reasonCode ?? 'queue_drained');
      break;
    }

    const actionId = String(claim.action?.actionId ?? '');
    const generationTask = GENERATION_TASKS.includes(claim.generationTask)
      ? claim.generationTask as OdoCopilotTask
      : null;
    let draft: OdoCopilotProviderDraft | null = null;
    let contentGateReasonCode = 'deterministic_template_approved';
    let providerRequestId: string | null = null;
    let inputTokens = 0;
    let cachedInputTokens = 0;
    let outputTokens = 0;
    let latencyMs = 0;
    let fallbackUsed = false;
    let providerFailureReasonCode: string | null = null;

    if (generationTask) {
      const snapshot = parseOdoDirectorSnapshot(claim.snapshot);
      const safeContext = isRecord(claim.safeContext) ? claim.safeContext : null;
      const fallback = safeContext?.deterministicFallback;
      const profiles = Array.isArray(safeContext?.profiles) ? safeContext.profiles : null;
      const taskContext = isRecord(safeContext?.taskContext) ? safeContext.taskContext : null;
      const allowedSignalCodes = Array.isArray(safeContext?.allowedSignalCodes)
        && safeContext.allowedSignalCodes.every((code) => typeof code === 'string')
        ? safeContext.allowedSignalCodes as string[]
        : null;
      if (!snapshot.ok || !profiles || !taskContext || !allowedSignalCodes
        || !isValidOdoCopilotDraft(fallback, generationTask)) {
        await service.rpc('rpc_service_fail_live_odo_guarded_action_v1', {
          p_action_id: actionId,
          p_lease_owner: leaseOwner,
          p_failure_reason_code: 'invalid_guarded_context',
          p_timed_out: false,
        });
        lastReasonCode = 'invalid_guarded_context';
        continue;
      }

      const leaseExpiry = Date.parse(claim.leaseExpiresAt);
      const fallbackProvider = {
        generateCopilotSuggestion: () => Promise.reject(new OdoProviderError(
          'provider_unavailable', claim.fallbackReasonCode ?? 'deterministic_fallback', null,
        )),
      };
      let provider = fallbackProvider;
      if (claim.providerAllowed) {
        try {
          provider = new OpenAIOdoProvider({
            apiKey: env('OPENAI_API_KEY'),
            timeoutMs: claim.providerTimeoutMs,
          });
        } catch {
          provider = fallbackProvider;
        }
      }
      const run = await runOdoCopilotProvider({
        provider,
        contentGate: new ServerOdoCopilotContentGate(),
        task: generationTask,
        deterministicFallback: fallback as OdoCopilotProviderDraft,
        allowedSignalCodes,
        request: {
          model: route.model,
          constitutionVersion: ODO_COPILOT_CONSTITUTION_VERSION,
          task: generationTask,
          snapshot: snapshot.value,
          profiles,
          taskContext,
          actionIdentity: {
            actionId,
            sessionId: body.sessionId,
            snapshotVersion: Number(claim.action.snapshotVersion),
            leaseGeneration: Number(claim.action.leaseGeneration),
            expiresAt: new Date(Math.min(
              leaseExpiry - 250,
              Date.parse(String(claim.action.expiresAt)),
            )).toISOString(),
          },
        },
      });
      if (!claim.providerAllowed && claim.fallbackReasonCode) {
        run.providerFailureReasonCode = String(claim.fallbackReasonCode);
        run.fallbackUsed = true;
      }
      draft = run.draft;
      contentGateReasonCode = run.contentGateReasonCode;
      providerRequestId = run.metadata.providerRequestId;
      inputTokens = run.metadata.inputTokens;
      cachedInputTokens = run.metadata.cachedInputTokens;
      outputTokens = run.metadata.outputTokens;
      latencyMs = run.metadata.latencyMs;
      fallbackUsed = run.fallbackUsed;
      providerFailureReasonCode = run.providerFailureReasonCode;
    }

    const { data: completed, error: completionError } = await service.rpc(
      'rpc_service_complete_live_odo_guarded_action_v1',
      {
        p_action_id: actionId,
        p_lease_owner: leaseOwner,
        p_draft: draft,
        p_content_gate_accepted: true,
        p_content_gate_reason_code: contentGateReasonCode,
        p_provider_request_id: providerRequestId,
        p_input_tokens: inputTokens,
        p_cached_input_tokens: cachedInputTokens,
        p_output_tokens: outputTokens,
        p_latency_ms: latencyMs,
        p_fallback_used: fallbackUsed,
        p_provider_failure_reason_code: providerFailureReasonCode,
      },
    );
    if (completionError) {
      console.error('[live-odo-autopilot] completion_failed', {
        code: completionError.code ?? 'unknown',
      });
      await service.rpc('rpc_service_fail_live_odo_guarded_action_v1', {
        p_action_id: actionId,
        p_lease_owner: leaseOwner,
        p_failure_reason_code: 'guarded_completion_failed',
        p_timed_out: false,
      });
      lastReasonCode = 'guarded_completion_failed';
      continue;
    }
    processed += 1;
    if (completed?.accepted && !['NO_ACTION', 'WAIT'].includes(String(completed.actionType))) {
      visibleActions += 1;
    }
    lastReasonCode = String(completed?.reasonCode ?? 'processed');
  }

  return json({ ok: true, processed, visibleActions, reasonCode: lastReasonCode });
});
