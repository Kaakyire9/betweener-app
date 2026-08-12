// @ts-nocheck -- checked by the function-local Deno configuration.
import { StreamClient } from '@stream-io/node-sdk';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['mute', 'unmute', 'remove', 'suspend']);

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
  try {
    const authorization = request.headers.get('Authorization')?.trim() ?? '';
    if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const clientActionId = typeof body.clientActionId === 'string' ? body.clientActionId : '';
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;
    if (![sessionId, targetUserId, clientActionId].every((value) => UUID_PATTERN.test(value)) || !ACTIONS.has(action)) {
      return json({ error: 'invalid_request' }, 400);
    }

    const url = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const caller = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: actor, error: authError } = await caller.auth.getUser();
    if (authError || !actor.user?.id) return json({ error: 'unauthorized' }, 401);

    const { error: authorityError } = await caller.rpc('rpc_moderate_live_participant', {
      p_session_id: sessionId,
      p_target_user_id: targetUserId,
      p_action: action,
      p_client_action_id: clientActionId,
      p_reason: reason,
    });
    if (authorityError) return json({ error: 'live_moderation_denied' }, 403);

    const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: session } = await service.from('live_sessions')
      .select('provider_call_type,provider_call_id')
      .eq('id', sessionId)
      .single();
    const { data: moderation } = await service.from('live_moderation_actions')
      .select('id')
      .eq('session_id', sessionId)
      .eq('actor_user_id', actor.user.id)
      .eq('client_action_id', clientActionId)
      .single();
    if (!session || !moderation) return json({ error: 'live_control_state_missing' }, 500);

    const { data: job } = await service.from('live_provider_control_jobs')
      .update({ status: 'processing', attempt_count: 1, last_error: null })
      .eq('moderation_action_id', moderation.id)
      .in('status', ['pending', 'retryable_failed'])
      .select('id,status')
      .maybeSingle();
    if (!job) return json({ ok: true, idempotent: true });

    try {
      const stream = new StreamClient(env('STREAM_VIDEO_API_KEY'), env('STREAM_VIDEO_API_SECRET'));
      const call = stream.video.call(session.provider_call_type, session.provider_call_id);
      if (action === 'mute') await call.muteUser(targetUserId, 'audio');
      // Provider APIs intentionally cannot force another user to unmute.
      // The authoritative flag is cleared and the participant may unmute locally.
      if (action === 'remove' || action === 'suspend') {
        await call.updateUserPermissions({
          user_id: targetUserId,
          grant_permissions: [],
          revoke_permissions: ['send-audio', 'send-video'],
        });
        await call.kickUser({ user_id: targetUserId, block: action === 'suspend' });
      }
      await service.from('live_provider_control_jobs').update({
        status: 'processed', processed_at: new Date().toISOString(), last_error: null,
      }).eq('id', job.id);
      return json({ ok: true, idempotent: false });
    } catch (providerError) {
      await service.from('live_provider_control_jobs').update({
        status: 'retryable_failed',
        last_error: providerError instanceof Error ? providerError.message.slice(0, 500) : 'provider_error',
      }).eq('id', job.id);
      return json({ ok: true, providerSyncPending: true }, 202);
    }
  } catch (error) {
    console.error('[live-control] unexpected', { name: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'live_control_unavailable' }, 500);
  }
});
