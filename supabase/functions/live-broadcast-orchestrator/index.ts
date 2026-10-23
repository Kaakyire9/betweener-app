// @ts-nocheck -- checked by the function-local Deno configuration.
import { StreamClient } from '@stream-io/node-sdk';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminKey } from '../_shared/supabase-admin-key.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_PATTERN = /^[a-z][a-z0-9_]{0,119}$/;
const COMPOSITOR_STATUSES = new Set([
  'starting', 'ready', 'live', 'degraded', 'stopping', 'failed',
]);
const HLS_STATUSES = new Set(['disabled', 'starting', 'live', 'stopping', 'failed']);
const RECORDING_STATUSES = new Set([
  'disabled', 'pending_consent', 'starting', 'recording', 'processing', 'ready', 'failed',
]);
const CAPTION_STATUSES = new Set(['disabled', 'starting', 'live', 'stopping', 'failed']);
const ADAPTIVE_STAGE_DIAGNOSTIC_EVENTS = new Set([
  'adaptive_stage_v2_shadow_plan_generated',
  'adaptive_stage_v2_shadow_match',
  'adaptive_stage_v2_shadow_divergence',
  'adaptive_stage_v2_invalid_assignment_rejected',
  'adaptive_stage_v2_manifest_mismatch',
  'adaptive_stage_v2_source_identity_missing',
  'adaptive_stage_v2_arbitrary_fallback_prevented',
  'adaptive_stage_v2_plan_generation_error',
]);
const MAX_BODY_BYTES = 4_096;
const STREAM_TOKEN_SECONDS = 60 * 60;
const STREAM_SYSTEM_USER_ID = 'betweener-live-system';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json',
    Pragma: 'no-cache',
  },
});
const requiredEnv = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

const constantTimeEqual = async (left: string, right: string): Promise<boolean> => {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index % a.length] ?? 0) ^ (b[index % b.length] ?? 0);
  }
  return difference === 0;
};

const validUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

const validPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const validOptionalReason = (value: unknown): value is string | null | undefined =>
  value === null || value === undefined
  || (typeof value === 'string' && REASON_PATTERN.test(value));

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let step = 'authentication';
  try {
    const suppliedToken = request.headers.get('x-broadcast-worker-token')?.trim() ?? '';
    const expectedToken = requiredEnv('BROADCAST_COMPOSITOR_WORKER_TOKEN');
    if (expectedToken.length < 32 || !suppliedToken
      || !await constantTimeEqual(suppliedToken, expectedToken)) {
      return json({ error: 'unauthorized' }, 401);
    }

    const raw = await request.text();
    if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'invalid_request' }, 400);
    }
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || !validUuid(body.workerInstanceId)) {
      return json({ error: 'invalid_request' }, 400);
    }

    const service = createClient(requiredEnv('SUPABASE_URL'), getSupabaseAdminKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'discover') {
      const limit = body.limit === undefined ? 25 : Number(body.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return json({ error: 'invalid_request' }, 400);
      }
      step = 'discover';
      const { data, error } = await service.rpc('rpc_service_list_live_broadcast_work_v1', {
        p_worker_instance_id: body.workerInstanceId,
        p_limit: limit,
      });
      if (error) throw error;
      return json({ ok: true, work: Array.isArray(data) ? data : [] });
    }

    if (!validUuid(body.sessionId)) return json({ error: 'invalid_request' }, 400);

    if (action === 'snapshot' || action === 'credentials') {
      if (!validPositiveInteger(body.leaseGeneration)) {
        return json({ error: 'invalid_request' }, 400);
      }
      step = 'snapshot';
      const { data: snapshot, error: snapshotError } = await service.rpc(
        'rpc_service_get_live_broadcast_snapshot_v1',
        {
          p_session_id: body.sessionId,
          p_worker_instance_id: body.workerInstanceId,
          p_lease_generation: body.leaseGeneration,
        },
      );
      if (snapshotError) throw snapshotError;
      if (action === 'snapshot' || snapshot?.available !== true) {
        return json({ ok: true, snapshot });
      }

      const provider = snapshot.provider && typeof snapshot.provider === 'object'
        ? snapshot.provider
        : null;
      const providerUserId = String(provider?.userId ?? '');
      const callType = String(provider?.callType ?? '');
      const callId = String(provider?.callId ?? '');
      if (!providerUserId.startsWith('studio-program-') || !callType || !callId) {
        throw new Error('broadcast_snapshot_provider_invalid');
      }
      step = 'stream_credentials';
      const streamApiKey = requiredEnv('STREAM_VIDEO_API_KEY');
      const stream = new StreamClient(streamApiKey, requiredEnv('STREAM_VIDEO_API_SECRET'));
      const callToken = stream.generateCallToken({
        user_id: providerUserId,
        call_cids: [`${callType}:${callId}`],
        validity_in_seconds: STREAM_TOKEN_SECONDS,
      });
      return json({
        ok: true,
        credentials: {
          apiKey: streamApiKey,
          callToken,
          call: { type: callType, id: callId, cid: `${callType}:${callId}` },
          user: { id: providerUserId, name: 'Betweener Program' },
          expiresAt: new Date(Date.now() + STREAM_TOKEN_SECONDS * 1_000).toISOString(),
        },
      });
    }

    if (action === 'claim') {
      step = 'claim';
      const { data: claim, error: claimError } = await service.rpc(
        'rpc_service_claim_live_broadcast_v1',
        { p_session_id: body.sessionId, p_worker_instance_id: body.workerInstanceId },
      );
      if (claimError) throw claimError;
      if (claim?.claimed !== true) return json({ ok: true, claim });

      const providerUserId = String(claim.providerUserId ?? '');
      const callType = String(claim.providerCallType ?? '');
      const callId = String(claim.providerCallId ?? '');
      if (!providerUserId.startsWith('studio-program-') || !callType || !callId
        || !validPositiveInteger(Number(claim.leaseGeneration))
        || !validPositiveInteger(Number(claim.program?.version))) {
        throw new Error('broadcast_claim_contract_invalid');
      }

      step = 'stream_admission';
      const streamApiKey = requiredEnv('STREAM_VIDEO_API_KEY');
      const stream = new StreamClient(streamApiKey, requiredEnv('STREAM_VIDEO_API_SECRET'));
      const call = stream.video.call(callType, callId);
      step = 'stream_user_upsert';
      await stream.upsertUsers([
        { id: STREAM_SYSTEM_USER_ID, name: 'Betweener Live', role: 'admin' },
        { id: providerUserId, name: 'Betweener Program', role: 'user' },
      ]);
      step = 'stream_call_get_or_create';
      await call.getOrCreate({
        notify: false,
        ring: false,
        data: {
          created_by_id: STREAM_SYSTEM_USER_ID,
          members: [{ user_id: providerUserId, role: 'call_member' }],
          custom: {
            betweener_session_id: body.sessionId,
            betweener_program_compositor: true,
            recording_allowed: false,
          },
        },
      });
      step = 'stream_call_get';
      const response = await call.get();
      step = 'stream_member_update';
      await call.updateCallMembers({
        update_members: [{ user_id: providerUserId, role: 'call_member' }],
      });
      step = 'stream_permission_update';
      await call.updateUserPermissions({
        user_id: providerUserId,
        grant_permissions: ['send-audio', 'send-video'],
        revoke_permissions: ['screenshare'],
      });
      const rtmpAddress = String(response?.call?.ingress?.rtmp?.address ?? '');
      if (!/^rtmps?:\/\//i.test(rtmpAddress)) {
        throw new Error('broadcast_ingress_unavailable');
      }
      const streamKey = stream.generateUserToken({
        user_id: providerUserId,
        validity_in_seconds: STREAM_TOKEN_SECONDS,
      });
      const callToken = stream.generateCallToken({
        user_id: providerUserId,
        call_cids: [`${callType}:${callId}`],
        validity_in_seconds: STREAM_TOKEN_SECONDS,
      });
      return json({
        ok: true,
        claim: {
          ...claim,
          apiKey: streamApiKey,
          callToken,
          call: { type: callType, id: callId, cid: `${callType}:${callId}` },
          output: { rtmpAddress, streamKey },
          expiresAt: new Date(Date.now() + STREAM_TOKEN_SECONDS * 1_000).toISOString(),
        },
      });
    }

    if (!validPositiveInteger(body.leaseGeneration)) {
      return json({ error: 'invalid_request' }, 400);
    }

    if (action === 'diagnostic') {
      const safeDetails = body.safeDetails;
      if (!ADAPTIVE_STAGE_DIAGNOSTIC_EVENTS.has(body.eventName)
        || !safeDetails || typeof safeDetails !== 'object' || Array.isArray(safeDetails)
        || new TextEncoder().encode(JSON.stringify(safeDetails)).byteLength > 4_096) {
        return json({ error: 'invalid_request' }, 400);
      }
      step = 'adaptive_stage_diagnostic';
      const { data, error } = await service.rpc(
        'rpc_service_record_adaptive_stage_v2_diagnostic_v1',
        {
          p_session_id: body.sessionId,
          p_worker_instance_id: body.workerInstanceId,
          p_lease_generation: body.leaseGeneration,
          p_event_name: body.eventName,
          p_safe_details: safeDetails,
        },
      );
      if (error) throw error;
      return json({ ok: true, recorded: data === true });
    }

    if (action === 'heartbeat') {
      const hlsUrl = body.hlsPlaylistUrl ?? null;
      if (!validPositiveInteger(body.programVersion)
        || !COMPOSITOR_STATUSES.has(body.compositorStatus)
        || !HLS_STATUSES.has(body.hlsStatus)
        || !RECORDING_STATUSES.has(body.recordingStatus)
        || !CAPTION_STATUSES.has(body.captionsStatus)
        || !validOptionalReason(body.failureReasonCode)
        || (body.hlsStatus === 'live'
          && (typeof hlsUrl !== 'string' || !/^https:\/\//i.test(hlsUrl)))
        || (body.hlsStatus !== 'live' && hlsUrl !== null)) {
        return json({ error: 'invalid_request' }, 400);
      }
      step = 'heartbeat';
      const { data, error } = await service.rpc('rpc_service_heartbeat_live_broadcast_v1', {
        p_session_id: body.sessionId,
        p_worker_instance_id: body.workerInstanceId,
        p_lease_generation: body.leaseGeneration,
        p_program_version: body.programVersion,
        p_compositor_status: body.compositorStatus,
        p_hls_status: body.hlsStatus,
        p_hls_playlist_url: hlsUrl,
        p_recording_status: body.recordingStatus,
        p_captions_status: body.captionsStatus,
        p_failure_reason_code: body.failureReasonCode ?? null,
      });
      if (error) throw error;
      return json({ ok: true, heartbeat: data });
    }

    if (action === 'release') {
      const reasonCode = body.reasonCode ?? 'broadcast_released';
      if (typeof reasonCode !== 'string' || !REASON_PATTERN.test(reasonCode)) {
        return json({ error: 'invalid_request' }, 400);
      }
      step = 'release';
      const { data, error } = await service.rpc('rpc_service_release_live_broadcast_v1', {
        p_session_id: body.sessionId,
        p_worker_instance_id: body.workerInstanceId,
        p_lease_generation: body.leaseGeneration,
        p_reason_code: reasonCode,
      });
      if (error) throw error;
      return json({ ok: true, release: data });
    }

    return json({ error: 'invalid_action' }, 400);
  } catch (error) {
    console.error('[live-broadcast-orchestrator] request_failed', {
      step,
      name: error instanceof Error ? error.name : 'unknown',
      code: typeof error === 'object' && error && 'code' in error ? error.code : null,
    });
    return json({ error: 'broadcast_service_unavailable' }, 503);
  }
});
