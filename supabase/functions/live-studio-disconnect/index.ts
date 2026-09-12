// @ts-nocheck -- checked by the function-local Deno configuration.
import { StreamClient } from '@stream-io/node-sdk';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DisconnectResult = {
  schemaVersion: 1;
  disconnected: boolean;
  sessionId: string;
  provider: string;
  providerCallType: string;
  providerCallId: string;
  providerUserIds: string[];
  reasonCode: string;
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

const isDisconnectResult = (value: unknown): value is DisconnectResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === 1
    && typeof candidate.disconnected === 'boolean'
    && typeof candidate.sessionId === 'string'
    && typeof candidate.provider === 'string'
    && typeof candidate.providerCallType === 'string'
    && typeof candidate.providerCallId === 'string'
    && typeof candidate.reasonCode === 'string'
    && Array.isArray(candidate.providerUserIds)
    && candidate.providerUserIds.every((userId) => (
      typeof userId === 'string' && userId.startsWith('studio-')
    ));
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authorization = request.headers.get('Authorization')?.trim() ?? '';
    if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const commandId = typeof body.commandId === 'string' ? body.commandId.trim() : '';
    if (!UUID_PATTERN.test(sessionId) || !UUID_PATTERN.test(commandId)) {
      return json({ error: 'live_studio_disconnect_invalid' }, 400);
    }

    const caller = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_ANON_KEY'),
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authorization } },
      },
    );
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user?.id) return json({ error: 'unauthorized' }, 401);

    const disconnect = () => caller.rpc('rpc_host_disconnect_live_studio_v1', {
      p_session_id: sessionId,
      p_command_id: commandId,
    });
    const { data, error } = await disconnect();
    if (error) {
      const forbidden = error.code === '42501';
      return json({ error: forbidden
        ? 'live_studio_disconnect_forbidden'
        : 'live_studio_disconnect_failed' }, forbidden ? 403 : 409);
    }
    if (!isDisconnectResult(data) || data.sessionId !== sessionId) {
      return json({ error: 'live_studio_disconnect_contract_invalid' }, 500);
    }

    const providerFailures: string[] = [];
    if (data.provider === 'stream' && data.providerUserIds.length > 0) {
      const stream = new StreamClient(
        requiredEnv('STREAM_VIDEO_API_KEY'),
        requiredEnv('STREAM_VIDEO_API_SECRET'),
      );
      const call = stream.video.call(data.providerCallType, data.providerCallId);
      for (const providerUserId of data.providerUserIds) {
        let providerSyncFailed = false;
        try {
          await call.updateUserPermissions({
            user_id: providerUserId,
            grant_permissions: [],
            revoke_permissions: ['send-audio', 'send-video', 'screenshare'],
          });
        } catch {
          providerSyncFailed = true;
        }
        try {
          await call.kickUser({ user_id: providerUserId });
        } catch {
          providerSyncFailed = true;
        }
        if (providerSyncFailed) providerFailures.push(providerUserId);
      }
    }

    // Re-run the idempotent cleanup after provider eviction so a final browser
    // heartbeat cannot restore a Studio source between the transaction and kick.
    const { error: finalCleanupError } = await disconnect();
    if (finalCleanupError) providerFailures.push('database_cleanup');

    return json({
      ok: true,
      disconnected: data.disconnected,
      reasonCode: data.reasonCode,
      providerSyncPending: providerFailures.length > 0,
    }, providerFailures.length > 0 ? 202 : 200);
  } catch (error) {
    console.info('[live-studio-disconnect] unavailable', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return json({ error: 'live_studio_disconnect_unavailable' }, 500);
  }
});
