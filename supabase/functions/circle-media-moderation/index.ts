// @ts-nocheck
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { getSupabasePublicApiKey } from '../_shared/supabase-public-key.ts';
import { getSupabaseAdminKey } from '../_shared/supabase-admin-key.ts';
import { moderateWithOpenAI } from '../_shared/content-safety.ts';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

type RequestBody = { assetId?: string };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const authorization = request.headers.get('Authorization');
  if (!url || !authorization) return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
  let publicKey: string;
  let serviceKey: string;
  try {
    publicKey = getSupabasePublicApiKey();
    serviceKey = getSupabaseAdminKey();
  } catch {
    return jsonResponse({ error: 'SERVER_CONFIGURATION_INCOMPLETE' }, 503);
  }

  const caller = createClient(url, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: 'UNAUTHORIZED' }, 401);

  let body: RequestBody;
  try { body = await request.json() as RequestBody; } catch { return jsonResponse({ error: 'INVALID_BODY' }, 400); }
  const assetId = typeof body.assetId === 'string' ? body.assetId : '';
  if (!assetId) return jsonResponse({ error: 'ASSET_ID_REQUIRED' }, 400);

  const { data: asset, error: assetError } = await admin
    .from('circle_media_assets')
    .select('id,uploader_user_id,bucket_id,object_path,poster_object_path,media_type,status,moderation_status')
    .eq('id', assetId)
    .maybeSingle();
  if (assetError || !asset) return jsonResponse({ error: 'ASSET_NOT_FOUND' }, 404);
  if (asset.uploader_user_id !== userData.user.id) return jsonResponse({ error: 'FORBIDDEN' }, 403);
  if (asset.status !== 'quarantined' || asset.moderation_status !== 'pending') {
    return jsonResponse({ error: 'ASSET_NOT_PENDING_MODERATION' }, 409);
  }

  const scannedObjectPath = asset.media_type === 'video' ? asset.poster_object_path : asset.object_path;
  if (!scannedObjectPath) return jsonResponse({ error: 'SCAN_OBJECT_MISSING' }, 409);
  const { data: signed, error: signedError } = await admin.storage
    .from(asset.bucket_id)
    .createSignedUrl(scannedObjectPath, 120);
  if (signedError || !signed?.signedUrl) return jsonResponse({ error: 'SCAN_OBJECT_UNAVAILABLE' }, 503);

  const moderation = await moderateWithOpenAI([
    { type: 'image_url', image_url: { url: signed.signedUrl } },
  ]);
  const { data: completed, error: completeError } = await admin.rpc('rpc_service_complete_circle_media_moderation', {
    p_asset_id: asset.id,
    p_decision: moderation.decision,
    p_provider: moderation.provider,
    p_model: moderation.model,
    p_categories: moderation.categories,
    p_scores: moderation.scores,
    p_failure_reason: moderation.failureReason,
    p_scanned_object_path: scannedObjectPath,
  });
  if (completeError) return jsonResponse({ error: 'MODERATION_STATE_UPDATE_FAILED' }, 500);

  const row = Array.isArray(completed) ? completed[0] : completed;
  return jsonResponse({
    assetId: asset.id,
    decision: moderation.decision,
    status: row?.status ?? 'quarantined',
    moderationStatus: row?.moderation_status ?? 'review',
    scanCoverage: asset.media_type === 'video' ? 'generated_poster' : 'full_image',
  });
});
