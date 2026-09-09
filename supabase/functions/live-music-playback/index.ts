// @ts-nocheck -- checked by the function-local Deno configuration.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 256;
const SIGNED_URL_SECONDS = 120;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
});
const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authorization = request.headers.get('Authorization')?.trim() ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'invalid_request' }, 400);
  }
  let sessionId = '';
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 1 || !UUID_PATTERN.test(String(value.sessionId))) {
      return json({ error: 'invalid_request' }, 400);
    }
    sessionId = String(value.sessionId);
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }

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
  const { data: descriptor, error: descriptorError } = await service.rpc(
    'rpc_service_get_live_music_playback_v1',
    { p_session_id: sessionId, p_user_id: actor.user.id },
  );
  if (descriptorError || descriptor?.allowed !== true) {
    return json({
      error: String(descriptor?.reasonCode ?? 'music_playback_unavailable'),
    }, descriptor?.reasonCode === 'private_experience_music_forbidden' ? 409 : 404);
  }
  const { data: signed, error: signingError } = await service.storage
    .from(String(descriptor.bucket))
    .createSignedUrl(String(descriptor.path), SIGNED_URL_SECONDS);
  if (signingError || !signed?.signedUrl) {
    console.error('[live-music-playback] signing_failed', { code: signingError?.name ?? 'unknown' });
    return json({ error: 'music_playback_unavailable' }, 503);
  }
  const expiresAt = new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString();
  return json({
    ok: true,
    playback: {
      trackId: String(descriptor.trackId),
      uri: signed.signedUrl,
      expiresAt,
      programStartedAt: String(descriptor.programStartedAt),
      playbackOffsetSeconds: Number(descriptor.playbackOffsetSeconds ?? 0),
      volume: Number(descriptor.volume ?? 0),
      stateVersion: Number(descriptor.stateVersion ?? 0),
    },
  });
});
