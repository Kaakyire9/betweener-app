// @ts-nocheck -- checked by the function-local Deno configuration.
import { StreamClient } from '@stream-io/node-sdk';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_TTL_SECONDS = 5 * 60;
const SAFE_ADMISSION_DENIAL_CODES = [
  'live_private_spark_admission_forbidden',
  'live_private_spark_consent_incomplete',
  'live_private_spark_account_ineligible',
  'live_private_spark_blocked',
] as const;

const safeAdmissionDenialCode = (message: unknown): string => {
  const normalized = typeof message === 'string' ? message.toLowerCase() : '';
  return SAFE_ADMISSION_DENIAL_CODES.find((code) => normalized.includes(code))
    ?? 'live_private_spark_admission_denied';
};

type Admission = {
  private_spark_id: string;
  source_session_id: string;
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
  maximum_participants: number;
  participant_user_ids: string[];
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

const env = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let step = 'request_validation';
  try {
    const authorization = request.headers.get('Authorization')?.trim() ?? '';
    if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const privateSparkId = typeof body.privateSparkId === 'string'
      ? body.privateSparkId.trim()
      : '';
    if (!UUID_PATTERN.test(privateSparkId)) return json({ error: 'invalid_private_spark_id' }, 400);

    const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    const userId = authData.user?.id;
    if (authError || !userId) return json({ error: 'unauthorized' }, 401);

    const { data: rateRows, error: rateError } = await caller.rpc(
      'rpc_bump_live_rtc_token_rate_limit',
      { p_session_id: privateSparkId },
    );
    if (rateError) return json({ error: 'live_token_temporarily_unavailable' }, 503);
    if (!Array.isArray(rateRows) || rateRows[0]?.allowed !== true) {
      return json({ error: 'rate_limited' }, 429);
    }

    const { data, error } = await caller.rpc('rpc_get_live_private_spark_rtc_admission', {
      p_private_spark_id: privateSparkId,
    });
    if (error) {
      const denialCode = safeAdmissionDenialCode(error.message);
      console.info('[live-private-spark-token] admission-denied', {
        privateSparkId,
        userId,
        code: error.code ?? null,
        denialCode,
        databaseReason: error.message ?? null,
      });
      return json({ error: denialCode }, 403);
    }
    const admission = (Array.isArray(data) ? data[0] : null) as Admission | null;
    if (
      !admission
      || admission.private_spark_id !== privateSparkId
      || admission.user_id !== userId
      || admission.provider !== 'stream'
      || admission.participant_state !== 'private_spark'
      || admission.session_status !== 'live'
      || admission.maximum_participants !== 2
      || !admission.capabilities?.includes('live.join')
      || !admission.capabilities?.includes('live.publish')
      || admission.participant_user_ids?.length !== 2
      || !admission.participant_user_ids.every((id) => UUID_PATTERN.test(id))
      || !admission.participant_user_ids.includes(userId)
    ) {
      console.info('[live-private-spark-token] admission-contract-invalid', {
        privateSparkId,
        userId,
        hasAdmission: admission !== null,
        participantState: admission?.participant_state ?? null,
        sessionStatus: admission?.session_status ?? null,
      });
      return json({ error: 'live_private_spark_admission_contract_invalid' }, 403);
    }

    step = 'provider_initialization';
    const stream = new StreamClient(env('STREAM_VIDEO_API_KEY'), env('STREAM_VIDEO_API_SECRET'));
    const call = stream.video.call(admission.provider_call_type, admission.provider_call_id);
    const callCid = `${admission.provider_call_type}:${admission.provider_call_id}`;
    step = 'participant_upsert';
    await stream.upsertUsers([
      { id: 'betweener-live-system', name: 'Betweener Live', role: 'admin' },
      ...admission.participant_user_ids.map((id) => ({ id, role: 'user' })),
    ]);
    step = 'call_get_or_create';
    await call.getOrCreate({
      notify: false,
      ring: false,
      data: {
        created_by_id: 'betweener-live-system',
        members: admission.participant_user_ids.map((id) => ({
          user_id: id,
          role: 'call_member',
        })),
        settings_override: { limits: { max_participants: 2 } },
        custom: {
          betweener_private_spark_id: privateSparkId,
          betweener_source_session_id: admission.source_session_id,
          recording_allowed: false,
        },
      },
    });
    step = 'participant_permissions';
    await call.updateUserPermissions({
      user_id: userId,
      grant_permissions: ['send-audio', 'send-video'],
      revoke_permissions: [],
    });

    step = 'token_generation';
    const token = stream.generateCallToken({
      user_id: userId,
      call_cids: [callCid],
      validity_in_seconds: TOKEN_TTL_SECONDS,
    });
    return json({
      apiKey: env('STREAM_VIDEO_API_KEY'),
      token,
      expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
      sessionId: privateSparkId,
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
    console.info('[live-private-spark-token] unavailable', {
      step,
      name: error instanceof Error ? error.name : 'unknown',
    });
    return json({ error: 'live_token_temporarily_unavailable' }, 500);
  }
});
