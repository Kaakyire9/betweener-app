// @ts-nocheck -- checked by the function-local Deno configuration.
import { StreamClient } from '@stream-io/node-sdk';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_TOKEN_TTL_SECONDS = 10 * 60;

type RtcAdmission = {
  session_id: string;
  user_id: string;
  profile_id: string;
  primary_role: string;
  roles: string[];
  participant_state: string;
  session_status: string;
  provider: string;
  provider_call_type: string;
  provider_call_id: string;
  capabilities: string[];
};

type RequestBody = {
  sessionId?: unknown;
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

const parseSessionId = (body: RequestBody): string | null => {
  const value = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  return UUID_PATTERN.test(value) ? value : null;
};

const safeLog = (event: string, details: Record<string, unknown> = {}) => {
  console.info('[live-rtc-token]', event, details);
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = request.headers.get('Authorization')?.trim() ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const body = await request.json().catch(() => ({})) as RequestBody;
    const sessionId = parseSessionId(body);
    if (!sessionId) return json({ error: 'invalid_session_id' }, 400);

    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const streamApiKey = requiredEnv('STREAM_VIDEO_API_KEY');
    const streamSecret = requiredEnv('STREAM_VIDEO_API_SECRET');
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser();
    const userId = authData.user?.id;
    if (authError || !userId) return json({ error: 'unauthorized' }, 401);

    const { data: rateRows, error: rateError } = await authClient.rpc('rpc_bump_live_rtc_token_rate_limit', {
      p_session_id: sessionId,
    });
    if (rateError) {
      safeLog('rate-limit-check-failed', { sessionId, code: rateError.code ?? null });
      return json({ error: 'live_token_temporarily_unavailable' }, 503);
    }
    if (!Array.isArray(rateRows) || rateRows[0]?.allowed !== true) {
      return json({ error: 'rate_limited' }, 429);
    }

    const { data, error } = await authClient.rpc('rpc_get_live_rtc_admission', {
      p_session_id: sessionId,
    });
    if (error) {
      safeLog('admission-denied', { sessionId, code: error.code ?? null });
      return json({ error: 'live_admission_denied' }, 403);
    }

    const admission = (Array.isArray(data) ? data[0] : null) as RtcAdmission | null;
    if (
      !admission
      || admission.session_id !== sessionId
      || admission.user_id !== userId
      || admission.provider !== 'stream'
      || !UUID_PATTERN.test(admission.profile_id)
      || !Array.isArray(admission.roles)
      || admission.roles.length === 0
      || !Array.isArray(admission.capabilities)
      || !['backstage', 'live', 'ending'].includes(admission.session_status)
      || !admission.capabilities.includes('live.join')
      || admission.participant_state === 'private_spark'
    ) {
      safeLog('admission-invalid', { sessionId });
      return json({ error: 'live_admission_denied' }, 403);
    }

    const callCid = `${admission.provider_call_type}:${admission.provider_call_id}`;
    const stream = new StreamClient(streamApiKey, streamSecret);
    const call = stream.video.call(admission.provider_call_type, admission.provider_call_id);

    // Membership is authoritative at issuance time and idempotent in Stream.
    await stream.upsertUsers([{
      id: 'betweener-live-system',
      name: 'Betweener Live',
      role: 'admin',
    }]);
    await call.getOrCreate({
      notify: false,
      ring: false,
      data: {
        created_by: {
          id: 'betweener-live-system',
          name: 'Betweener Live',
        },
        members: [{ user_id: userId, role: 'user' }],
        custom: {
          betweener_session_id: sessionId,
          recording_allowed: false,
        },
      },
    });
    await call.updateCallMembers({
      update_members: [{ user_id: userId, role: 'user' }],
    });

    // Publisher permissions are call-scoped and derived from Betweener capability.
    const publishPermissions = ['send-audio', 'send-video'];
    await call.updateUserPermissions({
      user_id: userId,
      grant_permissions: admission.capabilities.includes('live.publish')
        ? publishPermissions
        : [],
      revoke_permissions: admission.capabilities.includes('live.publish')
        ? []
        : publishPermissions,
    });

    const token = stream.generateCallToken({
      user_id: userId,
      call_cids: [callCid],
      validity_in_seconds: PUBLIC_TOKEN_TTL_SECONDS,
    });
    const expiresAt = new Date(Date.now() + PUBLIC_TOKEN_TTL_SECONDS * 1000).toISOString();

    safeLog('issued', {
      sessionId,
      participantState: admission.participant_state,
      sessionStatus: admission.session_status,
      ttlSeconds: PUBLIC_TOKEN_TTL_SECONDS,
    });

    return json({
      apiKey: streamApiKey,
      token,
      expiresAt,
      sessionId,
      user: { id: userId },
      call: {
        provider: 'stream',
        type: admission.provider_call_type,
        id: admission.provider_call_id,
        cid: callCid,
      },
      primaryRole: admission.primary_role,
      roles: admission.roles,
      capabilities: admission.capabilities,
      participantState: admission.participant_state,
      sessionStatus: admission.session_status,
    });
  } catch (error) {
    safeLog('unexpected-error', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return json({ error: 'live_token_temporarily_unavailable' }, 500);
  }
});
