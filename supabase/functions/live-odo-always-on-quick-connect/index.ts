// @ts-nocheck -- checked by the function-local Deno configuration.
import { StreamClient } from '@stream-io/node-sdk';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 512;
const MAX_WORK_ITEMS = 4;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json',
  },
});

const requiredEnv = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseBody = (raw: string): { opportunityId: string | null } | null => {
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  if (!raw) return { opportunityId: null };
  try {
    const value = JSON.parse(raw);
    if (!isRecord(value) || Object.keys(value).some((key) => key !== 'opportunityId')) return null;
    if (value.opportunityId == null) return { opportunityId: null };
    return UUID_PATTERN.test(String(value.opportunityId))
      ? { opportunityId: String(value.opportunityId) }
      : null;
  } catch {
    return null;
  }
};

const safeProviderReason = (error: unknown): string => {
  if (!isRecord(error)) return 'stream_unavailable';
  const status = typeof error.status === 'number'
    ? error.status
    : typeof error.statusCode === 'number' ? error.statusCode : null;
  const code = typeof error.code === 'string' || typeof error.code === 'number'
    ? String(error.code)
    : null;
  return ['stream', status ?? 'unknown', code ?? 'unknown'].join('_')
    .toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 120);
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authorization = request.headers.get('Authorization')?.trim() ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const body = parseBody(await request.text());
  if (!body) return json({ error: 'invalid_request' }, 400);

  try {
    const url = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const bearer = authorization.slice('Bearer '.length);
    const serviceInvocation = bearer === serviceRoleKey;
    const caller = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    let actorUserId: string | null = null;
    let callerSnapshot: Record<string, unknown> | null = null;
    if (!serviceInvocation) {
      const { data: actor, error: authError } = await caller.auth.getUser();
      actorUserId = actor.user?.id ?? null;
      if (authError || !actorUserId) return json({ error: 'unauthorized' }, 401);
      const { data, error } = await caller.rpc('rpc_get_live_quick_connect_availability_v1');
      if (error || !isRecord(data)) return json({ error: 'always_on_unavailable' }, 403);
      callerSnapshot = data;
      if (body.opportunityId) {
        const ownOpportunity = isRecord(data.opportunity) ? data.opportunity : null;
        if (ownOpportunity?.id !== body.opportunityId) {
          return json({ error: 'opportunity_forbidden' }, 403);
        }
      }
    }

    const service = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await service.rpc('rpc_service_maintain_live_quick_connect_opportunities_v1');

    if (!body.opportunityId && callerSnapshot) {
      const availability = isRecord(callerSnapshot.availability)
        ? callerSnapshot.availability
        : null;
      const marketContext = typeof availability?.marketContext === 'string'
        ? availability.marketContext
        : null;
      if (marketContext) {
        await service.rpc('rpc_service_detect_live_quick_connect_opportunity_v1', {
          p_market_context: marketContext,
          p_worker_id: crypto.randomUUID(),
        });
      }
    }

    let workIds: string[] = body.opportunityId ? [body.opportunityId] : [];
    if (!workIds.length) {
      const { data: work, error } = await service.rpc(
        'rpc_service_get_live_quick_connect_opportunity_work_v1',
        { p_limit: MAX_WORK_ITEMS },
      );
      if (error) return json({ error: 'always_on_work_unavailable' }, 503);
      workIds = Array.isArray(work)
        ? work.map((item) => isRecord(item) ? String(item.opportunityId ?? '') : '')
          .filter((id) => UUID_PATTERN.test(id)).slice(0, MAX_WORK_ITEMS)
        : [];
    }

    const stream = new StreamClient(
      requiredEnv('STREAM_VIDEO_API_KEY'),
      requiredEnv('STREAM_VIDEO_API_SECRET'),
    );
    const results: Array<Record<string, unknown>> = [];
    for (const opportunityId of workIds) {
      const workerId = crypto.randomUUID();
      const { data: prepared, error: prepareError } = await service.rpc(
        'rpc_service_prepare_live_quick_connect_opportunity_session_v1',
        { p_opportunity_id: opportunityId, p_worker_id: workerId },
      );
      if (prepareError || !isRecord(prepared) || prepared.prepared !== true) {
        results.push({ opportunityId, started: false, reasonCode: 'not_ready' });
        continue;
      }
      const sessionId = String(prepared.sessionId ?? '');
      const callType = String(prepared.providerCallType ?? '');
      const callId = String(prepared.providerCallId ?? '');
      const acceptedUserIds = Array.isArray(prepared.acceptedUserIds)
        ? prepared.acceptedUserIds.map(String).filter((id) => UUID_PATTERN.test(id))
        : [];
      const maximumParticipants = Number(prepared.maximumParticipants);
      if (!UUID_PATTERN.test(sessionId) || !callType || !callId
        || acceptedUserIds.length < 2 || !Number.isInteger(maximumParticipants)) {
        await service.rpc('rpc_service_finalize_live_quick_connect_opportunity_session_v1', {
          p_opportunity_id: opportunityId,
          p_worker_id: workerId,
          p_stream_ready: false,
          p_failure_reason_code: 'prepared_contract_invalid',
        });
        results.push({ opportunityId, started: false, reasonCode: 'prepared_contract_invalid' });
        continue;
      }
      try {
        await stream.upsertUsers([
          { id: 'betweener-live-system', name: 'Betweener Live', role: 'admin' },
          ...acceptedUserIds.map((id) => ({ id, role: 'user' })),
        ]);
        const call = stream.video.call(callType, callId);
        await call.getOrCreate({
          notify: false,
          ring: false,
          data: {
            created_by_id: 'betweener-live-system',
            members: acceptedUserIds.map((id) => ({ user_id: id, role: 'call_member' })),
            settings_override: { limits: { max_participants: maximumParticipants } },
            custom: {
              betweener_session_id: sessionId,
              system_session_kind: 'odo_always_on_quick_connect',
              recording_allowed: false,
            },
          },
        });
        const { data: finalized, error: finalizeError } = await service.rpc(
          'rpc_service_finalize_live_quick_connect_opportunity_session_v1',
          {
            p_opportunity_id: opportunityId,
            p_worker_id: workerId,
            p_stream_ready: true,
            p_failure_reason_code: null,
          },
        );
        const started = !finalizeError && isRecord(finalized) && finalized.started === true;
        if (!started) {
          await call.end().catch(() => undefined);
        }
        results.push({ opportunityId, sessionId, started,
          reasonCode: started ? 'system_session_live' : 'finalize_failed' });
      } catch (error) {
        const reasonCode = safeProviderReason(error);
        await service.rpc('rpc_service_finalize_live_quick_connect_opportunity_session_v1', {
          p_opportunity_id: opportunityId,
          p_worker_id: workerId,
          p_stream_ready: false,
          p_failure_reason_code: reasonCode,
        });
        console.error('[live-odo-always-on-quick-connect] stream_start_failed', {
          opportunityId,
          reasonCode,
        });
        results.push({ opportunityId, started: false, reasonCode: 'stream_start_retryable' });
      }
    }
    const { data: cleanupWork } = await service.rpc(
      'rpc_service_get_live_odo_always_on_cleanup_work_v1',
      { p_limit: MAX_WORK_ITEMS },
    );
    const cleanupResults: Array<Record<string, unknown>> = [];
    for (const item of Array.isArray(cleanupWork) ? cleanupWork.slice(0, MAX_WORK_ITEMS) : []) {
      if (!isRecord(item)) continue;
      const sessionId = String(item.sessionId ?? '');
      const callType = String(item.providerCallType ?? '');
      const callId = String(item.providerCallId ?? '');
      if (!UUID_PATTERN.test(sessionId) || !callType || !callId) continue;
      try {
        await stream.video.call(callType, callId).end();
        await service.rpc('rpc_service_complete_live_odo_always_on_cleanup_v1', {
          p_session_id: sessionId,
          p_succeeded: true,
          p_reason_code: null,
        });
        cleanupResults.push({ sessionId, completed: true });
      } catch (error) {
        const reasonCode = safeProviderReason(error);
        await service.rpc('rpc_service_complete_live_odo_always_on_cleanup_v1', {
          p_session_id: sessionId,
          p_succeeded: false,
          p_reason_code: reasonCode,
        });
        cleanupResults.push({ sessionId, completed: false, reasonCode });
      }
    }
    return json({
      ok: true,
      actor: actorUserId ? 'member' : 'service',
      processed: results.length,
      results,
      cleanup: cleanupResults,
    });
  } catch (error) {
    console.error('[live-odo-always-on-quick-connect] worker_failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return json({ error: 'always_on_temporarily_unavailable' }, 503);
  }
});
