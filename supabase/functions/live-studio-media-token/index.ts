// @ts-nocheck -- checked by the function-local Deno configuration.
import { StreamClient } from '@stream-io/node-sdk';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_KINDS = [
  'studio_host', 'host_camera', 'host_microphone', 'screen_share', 'dj_audio',
] as const;
const TOKEN_TTL_SECONDS = 5 * 60;

type SourceKind = (typeof SOURCE_KINDS)[number];
type Admission = {
  schemaVersion: 1;
  sessionId: string;
  userId: string;
  providerUserId: string;
  provider: 'stream';
  providerCallType: string;
  providerCallId: string;
  maximumParticipants: number;
  sourceKind: SourceKind;
  canSendAudio: boolean;
  canSendVideo: boolean;
  canScreenShare: boolean;
  canScreenShareAudio: boolean;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
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

const safeAdmissionError = (message: unknown): string => {
  const normalized = typeof message === 'string' ? message.toLowerCase() : '';
  if (normalized.includes('live_studio_screen_share_forbidden')) {
    return 'live_studio_screen_share_forbidden';
  }
  if (normalized.includes('live_studio_external_audio_forbidden')) {
    return 'live_studio_external_audio_forbidden';
  }
  if (normalized.includes('live_studio_media_session_unavailable')) {
    return 'live_studio_media_session_unavailable';
  }
  return 'live_studio_media_forbidden';
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let step = 'request_validation';
  try {
    const authorization = request.headers.get('Authorization')?.trim() ?? '';
    if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const controllerInstanceId = typeof body.controllerInstanceId === 'string'
      ? body.controllerInstanceId.trim()
      : '';
    const sourceKind = typeof body.sourceKind === 'string' ? body.sourceKind.trim() : '';
    if (!UUID_PATTERN.test(sessionId) || !UUID_PATTERN.test(controllerInstanceId)
      || !SOURCE_KINDS.includes(sourceKind as SourceKind)) {
      return json({ error: 'live_studio_media_invalid' }, 400);
    }

    const caller = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    const userId = authData.user?.id;
    if (authError || !userId) return json({ error: 'unauthorized' }, 401);

    const { data: rateRows, error: rateError } = await caller.rpc(
      'rpc_bump_live_rtc_token_rate_limit',
      { p_session_id: sessionId },
    );
    if (rateError) return json({ error: 'live_token_temporarily_unavailable' }, 503);
    if (!Array.isArray(rateRows) || rateRows[0]?.allowed !== true) {
      return json({ error: 'rate_limited' }, 429);
    }

    const { data, error } = await caller.rpc('rpc_get_live_studio_media_admission_v1', {
      p_session_id: sessionId,
      p_controller_instance_id: controllerInstanceId,
      p_source_kind: sourceKind,
    });
    if (error) {
      const denialCode = safeAdmissionError(error.message);
      console.info('[live-studio-media-token] admission-denied', {
        sessionId, userId, sourceKind, code: error.code ?? null, denialCode,
      });
      return json({ error: denialCode }, 403);
    }
    const admission = data as Admission | null;
    if (!admission || admission.schemaVersion !== 1 || admission.sessionId !== sessionId
      || admission.userId !== userId || admission.provider !== 'stream'
      || admission.sourceKind !== sourceKind
      || typeof admission.providerUserId !== 'string'
      || !admission.providerUserId.startsWith('studio-')
      || typeof admission.providerCallType !== 'string'
      || typeof admission.providerCallId !== 'string'
      || !Number.isInteger(admission.maximumParticipants)
      || admission.maximumParticipants < 2 || admission.maximumParticipants > 100) {
      return json({ error: 'live_studio_media_contract_invalid' }, 403);
    }

    step = 'provider_initialization';
    const streamApiKey = requiredEnv('STREAM_VIDEO_API_KEY');
    const stream = new StreamClient(streamApiKey, requiredEnv('STREAM_VIDEO_API_SECRET'));
    const call = stream.video.call(admission.providerCallType, admission.providerCallId);
    const callCid = `${admission.providerCallType}:${admission.providerCallId}`;
    await stream.upsertUsers([
      { id: 'betweener-live-system', name: 'Betweener Live', role: 'admin' },
      { id: admission.providerUserId, name: 'Betweener Studio', role: 'user' },
    ]);
    step = 'call_get_or_create';
    await call.getOrCreate({
      notify: false,
      ring: false,
      data: {
        created_by_id: 'betweener-live-system',
        members: [{ user_id: admission.providerUserId, role: 'call_member' }],
        settings_override: { limits: { max_participants: admission.maximumParticipants } },
        custom: {
          betweener_session_id: sessionId,
          betweener_studio_source: true,
          recording_allowed: false,
        },
      },
    });
    await call.updateCallMembers({
      update_members: [{ user_id: admission.providerUserId, role: 'call_member' }],
    });

    const grants = [
      ...(admission.canSendAudio ? ['send-audio'] : []),
      ...(admission.canSendVideo ? ['send-video'] : []),
      ...(admission.canScreenShare ? ['screenshare'] : []),
    ];
    await call.updateUserPermissions({
      user_id: admission.providerUserId,
      grant_permissions: grants,
      revoke_permissions: ['send-audio', 'send-video', 'screenshare']
        .filter((permission) => !grants.includes(permission)),
    });

    const token = stream.generateCallToken({
      user_id: admission.providerUserId,
      call_cids: [callCid],
      validity_in_seconds: TOKEN_TTL_SECONDS,
    });
    const sourceKey = `studio:${controllerInstanceId.replaceAll('-', '')}:${sourceKind}`;
    return json({
      schemaVersion: 1,
      apiKey: streamApiKey,
      token,
      expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
      sessionId,
      sourceKind,
      sourceKey,
      user: { id: admission.providerUserId, name: 'Betweener Studio' },
      call: {
        provider: 'stream',
        type: admission.providerCallType,
        id: admission.providerCallId,
        cid: callCid,
      },
      capabilities: {
        sendAudio: admission.canSendAudio,
        sendVideo: admission.canSendVideo,
        screenShare: admission.canScreenShare,
        screenShareAudio: admission.canScreenShareAudio,
      },
    });
  } catch (error) {
    console.info('[live-studio-media-token] unavailable', {
      step,
      name: error instanceof Error ? error.name : 'unknown',
    });
    return json({ error: 'live_token_temporarily_unavailable' }, 500);
  }
});
