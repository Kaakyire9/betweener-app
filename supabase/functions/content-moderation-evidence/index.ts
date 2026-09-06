// @ts-nocheck -- checked by the function-local Deno configuration.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const isUuid = (value: unknown): value is string =>
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);

  const authorization = request.headers.get('Authorization') ?? '';
  const bearer = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!bearer) return json({ code: 'AUTH_REQUIRED' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ code: 'EVIDENCE_UNAVAILABLE' }, 503);

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
  if (authError || !authData.user) return json({ code: 'AUTH_REQUIRED' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: adminRow } = await admin
    .from('internal_admins')
    .select('user_id')
    .eq('user_id', authData.user.id)
    .maybeSingle();
  if (!adminRow) return json({ code: 'ADMIN_REQUIRED' }, 403);

  const body = await request.json().catch(() => null) as { event_id?: unknown } | null;
  if (!isUuid(body?.event_id)) return json({ code: 'INVALID_EVENT_ID' }, 400);

  const { data: event, error } = await admin
    .from('content_moderation_events')
    .select('id,content_type,status,storage_bucket,storage_path')
    .eq('id', body.event_id)
    .maybeSingle();
  if (error || !event) return json({ code: 'EVIDENCE_NOT_FOUND' }, 404);
  if (!event.storage_bucket || !event.storage_path) {
    return json({ code: 'EVIDENCE_NOT_AVAILABLE' }, 404);
  }
  if (!['chat-media', 'moderation-quarantine'].includes(event.storage_bucket)) {
    return json({ code: 'EVIDENCE_NOT_AVAILABLE' }, 404);
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(event.storage_bucket)
    .createSignedUrl(event.storage_path, 300);
  if (signedError || !signed?.signedUrl) return json({ code: 'EVIDENCE_NOT_AVAILABLE' }, 404);

  return json({
    ok: true,
    event_id: event.id,
    content_type: event.content_type,
    status: event.status,
    expires_in: 300,
    signed_url: signed.signedUrl,
  });
});
