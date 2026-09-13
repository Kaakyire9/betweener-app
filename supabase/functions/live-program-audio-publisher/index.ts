// @ts-nocheck -- checked by the function-local Deno configuration.
import { StreamClient } from '@stream-io/node-sdk';
import { createClient } from '@supabase/supabase-js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_PATTERN = /^[a-z][a-z0-9_]{0,119}$/;
const STATUS_VALUES = new Set(['starting', 'live', 'degraded']);
const MAX_BODY_BYTES = 2_048;
const TRACK_URL_SECONDS = 15 * 60;
const STREAM_TOKEN_SECONDS = 6 * 60 * 60;

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

const validUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);
const validPositiveInteger = (value: unknown): value is number => (
  Number.isSafeInteger(value) && Number(value) > 0
);
const validVolume = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 0.5
);

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let step = 'authentication';
  try {
    const suppliedToken = request.headers.get('x-program-audio-worker-token')?.trim() ?? '';
    const expectedToken = requiredEnv('PROGRAM_AUDIO_WORKER_TOKEN');
    if (expectedToken.length < 32 || !suppliedToken
      || !await constantTimeEqual(suppliedToken, expectedToken)) {
      return json({ error: 'unauthorized' }, 401);
    }

    const raw = await request.text();
    if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'invalid_request' }, 400);
    }
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'invalid_request' }, 400);
    }
    const action = typeof body.action === 'string' ? body.action : '';
    const workerInstanceId = body.workerInstanceId;
    if (!validUuid(workerInstanceId)) return json({ error: 'invalid_request' }, 400);

    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const service = createClient(supabaseUrl, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (action === 'discover') {
      const limit = body.limit === undefined ? 25 : Number(body.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return json({ error: 'invalid_request' }, 400);
      }
      step = 'discover';
      const { data, error } = await service.rpc(
        'rpc_service_list_live_program_audio_work_v1',
        { p_worker_instance_id: workerInstanceId, p_limit: limit },
      );
      if (error) throw error;
      return json({ ok: true, work: Array.isArray(data) ? data : [] });
    }

    const sessionId = body.sessionId;
    if (!validUuid(sessionId)) return json({ error: 'invalid_request' }, 400);

    if (action === 'claim') {
      step = 'claim';
      const { data: claim, error: claimError } = await service.rpc(
        'rpc_service_claim_live_program_audio_v1',
        { p_session_id: sessionId, p_worker_instance_id: workerInstanceId },
      );
      if (claimError) throw claimError;
      if (claim?.claimed !== true) return json({ ok: true, claim });

      const providerUserId = String(claim.providerUserId ?? '');
      const callType = String(claim.providerCallType ?? '');
      const callId = String(claim.providerCallId ?? '');
      if (!providerUserId.startsWith('studio-program-audio-')
        || !callType || !callId || !validUuid(String(claim.trackId ?? ''))) {
        throw new Error('program_audio_claim_contract_invalid');
      }

      step = 'track_signing';
      const { data: signed, error: signingError } = await service.storage
        .from(String(claim.storageBucket))
        .createSignedUrl(String(claim.storagePath), TRACK_URL_SECONDS);
      if (signingError || !signed?.signedUrl) throw new Error('program_audio_track_signing_failed');

      step = 'stream_ingress';
      const streamApiKey = requiredEnv('STREAM_VIDEO_API_KEY');
      const stream = new StreamClient(streamApiKey, requiredEnv('STREAM_VIDEO_API_SECRET'));
      const call = stream.video.call(callType, callId);
      await stream.upsertUsers([{
        id: providerUserId,
        name: 'Betweener Programme Audio',
        role: 'user',
      }]);
      const response = await call.get();
      await call.updateCallMembers({
        update_members: [{ user_id: providerUserId, role: 'call_member' }],
      });
      await call.updateUserPermissions({
        user_id: providerUserId,
        grant_permissions: ['send-audio'],
        revoke_permissions: ['send-video', 'screenshare'],
      });
      const rtmpAddress = String(response?.call?.ingress?.rtmp?.address ?? '');
      if (!/^rtmps?:\/\//i.test(rtmpAddress)) {
        throw new Error('program_audio_ingress_unavailable');
      }
      const streamKey = stream.generateUserToken({
        user_id: providerUserId,
        validity_in_seconds: STREAM_TOKEN_SECONDS,
      });
      return json({
        ok: true,
        claim: {
          ...claim,
          trackUri: signed.signedUrl,
          trackUriExpiresAt: new Date(Date.now() + TRACK_URL_SECONDS * 1_000).toISOString(),
          rtmpAddress,
          streamKey,
        },
      });
    }

    const leaseGeneration = body.leaseGeneration;
    if (!validPositiveInteger(leaseGeneration)) {
      return json({ error: 'invalid_request' }, 400);
    }

    if (action === 'heartbeat') {
      if (!validPositiveInteger(body.musicVersion) || !validUuid(body.trackId)
        || !validVolume(body.volume) || !STATUS_VALUES.has(body.status)
        || (body.failureReasonCode !== null && body.failureReasonCode !== undefined
          && (typeof body.failureReasonCode !== 'string'
            || !REASON_PATTERN.test(body.failureReasonCode)))) {
        return json({ error: 'invalid_request' }, 400);
      }
      step = 'heartbeat';
      const { data, error } = await service.rpc(
        'rpc_service_heartbeat_live_program_audio_v1',
        {
          p_session_id: sessionId,
          p_worker_instance_id: workerInstanceId,
          p_lease_generation: leaseGeneration,
          p_music_version: body.musicVersion,
          p_track_id: body.trackId,
          p_volume: body.volume,
          p_status: body.status,
          p_failure_reason_code: body.failureReasonCode ?? null,
        },
      );
      if (error) throw error;
      return json({ ok: true, heartbeat: data });
    }

    if (action === 'complete') {
      if (!validPositiveInteger(body.musicVersion)) {
        return json({ error: 'invalid_request' }, 400);
      }
      step = 'complete';
      const { data, error } = await service.rpc(
        'rpc_service_complete_live_program_audio_v1',
        {
          p_session_id: sessionId,
          p_worker_instance_id: workerInstanceId,
          p_lease_generation: leaseGeneration,
          p_expected_music_version: body.musicVersion,
        },
      );
      if (error) throw error;
      return json({ ok: true, completion: data });
    }

    if (action === 'release') {
      const reasonCode = body.reasonCode ?? 'program_audio_released';
      if (typeof reasonCode !== 'string' || !REASON_PATTERN.test(reasonCode)) {
        return json({ error: 'invalid_request' }, 400);
      }
      step = 'release';
      const { data, error } = await service.rpc(
        'rpc_service_release_live_program_audio_v1',
        {
          p_session_id: sessionId,
          p_worker_instance_id: workerInstanceId,
          p_lease_generation: leaseGeneration,
          p_reason_code: reasonCode,
        },
      );
      if (error) throw error;
      return json({ ok: true, release: data });
    }

    return json({ error: 'invalid_action' }, 400);
  } catch (error) {
    console.error('[live-program-audio-publisher] request_failed', {
      step,
      name: error instanceof Error ? error.name : 'unknown',
      code: typeof error === 'object' && error && 'code' in error ? error.code : null,
    });
    return json({ error: 'program_audio_service_unavailable' }, 503);
  }
});
