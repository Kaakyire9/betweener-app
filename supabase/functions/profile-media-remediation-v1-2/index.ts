// @ts-nocheck -- checked by the Supabase Edge Function bundler.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

import { corsHeaders } from '../_shared/cors.ts';
import { moderateWithOpenAI } from '../_shared/content-safety.ts';
import { assessMediaExtractedText } from '../_shared/media-extracted-text-policy.ts';
import {
  classifyProfileMediaV1_2,
  combineProfileMediaEvidence,
  reasonFromHarmAssessment,
} from '../_shared/profile-media-policy-v1-2.ts';
import { decodeQrPayloads } from '../_shared/qr-decoder.ts';

const QUARANTINE_BUCKET = 'moderation-quarantine';
const SOURCE_BUCKETS = new Set(['profiles', 'profile-photos']);
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_BATCH = 4;

const json = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
);

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
};

const sniffImage = (bytes: Uint8Array) => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) =>
    value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) {
    return { mime: 'image/png', extension: 'png' };
  }
  const text = new TextDecoder().decode(bytes.slice(0, 12));
  if (text.startsWith('GIF8')) return { mime: 'image/gif', extension: 'gif' };
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') {
    return { mime: 'image/webp', extension: 'webp' };
  }
  return null;
};

const parseOwnedSource = (rawUrl: string, userId: string, supabaseUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || parsed.origin !== new URL(supabaseUrl).origin) return null;
    const marker = '/storage/v1/object/public/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const [bucket, ...parts] = parsed.pathname.slice(markerIndex + marker.length).split('/');
    const path = decodeURIComponent(parts.join('/'));
    if (!SOURCE_BUCKETS.has(bucket) || !path.startsWith(`${userId}/`) || path.includes('..')) return null;
    return { bucket, path };
  } catch {
    return null;
  }
};

const resolveJob = async (admin, job, outcome: string, details: Record<string, unknown> = {}) => {
  const { data, error } = await admin.rpc('rpc_service_resolve_profile_media_remediation', {
    p_job_id: job.id,
    p_claim_token: job.claim_token,
    p_outcome: outcome,
    p_sha256: details.sha256 ?? null,
    p_categories: details.categories ?? [],
    p_error: details.error ?? null,
  });
  if (error) throw error;
  return data;
};

const processJob = async (admin, job, supabaseUrl: string) => {
  const source = parseOwnedSource(job.source_url, job.user_id, supabaseUrl);
  if (!source) {
    await resolveJob(admin, job, 'RETRY', { error: 'LEGACY_SOURCE_URL_INVALID' });
    return 'retry';
  }

  if (job.needs_source_cleanup === true) {
    const { error } = await admin.storage.from(source.bucket).remove([source.path]);
    if (error) {
      await resolveJob(admin, job, 'RETRY', { error: 'LEGACY_SOURCE_CLEANUP_FAILED' });
      return 'retry';
    }
    await resolveJob(admin, job, 'CLEANUP_DONE');
    return 'removed';
  }

  let quarantinePath: string | null = null;
  let evidenceRecorded = false;
  try {
    const { data: blob, error: downloadError } = await admin.storage
      .from(source.bucket)
      .download(source.path);
    if (downloadError || !blob) throw new Error('LEGACY_SOURCE_DOWNLOAD_FAILED');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error('LEGACY_SOURCE_SIZE_INVALID');
    const media = sniffImage(bytes);
    if (!media) throw new Error('LEGACY_SOURCE_MIME_INVALID');
    const sha256 = await sha256Hex(bytes);

    const { data: hashMatch, error: hashError } = await admin.rpc(
      'rpc_service_match_unsafe_media_hash',
      { p_sha256: sha256 },
    );
    if (hashError || hashMatch?.authorized !== true) throw new Error('HASH_MATCH_UNAVAILABLE');

    quarantinePath = `legacy-profile-remediation/${job.user_id}/${job.id}-${sha256}.${media.extension}`;
    const { error: uploadError } = await admin.storage.from(QUARANTINE_BUCKET)
      .upload(quarantinePath, bytes, { contentType: media.mime, upsert: true });
    if (uploadError) throw new Error('REMEDIATION_QUARANTINE_FAILED');
    const { data: signed, error: signedError } = await admin.storage.from(QUARANTINE_BUCKET)
      .createSignedUrl(quarantinePath, 300);
    if (signedError || !signed?.signedUrl) throw new Error('REMEDIATION_SIGNING_FAILED');

    let decision = hashMatch.matched === true ? 'BLOCK' : 'ALLOW';
    let categories = hashMatch.matched === true ? ['known_illegal_media'] : [];
    let riskScore = hashMatch.matched === true ? 1 : 0;
    let provider = hashMatch.matched === true ? 'hash_blocklist' : 'openai';
    let providerModel = hashMatch.matched === true ? 'sha256-v1' : 'profile-media-v1.2';
    let providerRequestId: string | null = null;
    let extractedText: string | null = null;
    let scores: Record<string, number> = {};

    if (decision !== 'BLOCK') {
      const qr = await decodeQrPayloads(bytes, media.mime);
      if (qr.failureReason) throw new Error(qr.failureReason);
      const [harm, profile] = await Promise.all([
        moderateWithOpenAI([{ type: 'image_url', image_url: { url: signed.signedUrl } }]),
        // Retrospective remediation enforces harm/contact safety, not the new-avatar face rule.
        classifyProfileMediaV1_2(signed.signedUrl, 'gallery'),
      ]);
      if (harm.failureReason || profile.failureReason) {
        throw new Error(harm.failureReason || profile.failureReason || 'MEDIA_PROVIDER_UNAVAILABLE');
      }
      const qrPolicy = assessMediaExtractedText(qr.payloads.join(' '), 'public_profile_media');
      const extractedPolicy = assessMediaExtractedText(profile.extractedText, 'public_profile_media');
      const deterministic = {
        decision: qrPolicy.decision === 'BLOCK' || extractedPolicy.decision === 'BLOCK'
          ? 'BLOCK' as const
          : 'ALLOW' as const,
        categories: [...new Set([...qrPolicy.categories, ...extractedPolicy.categories])],
      };
      const combined = combineProfileMediaEvidence(profile, deterministic, qr.payloads.length > 0);
      if (harm.decision === 'BLOCK') {
        decision = 'BLOCK';
        categories = [...new Set([...harm.categories, ...combined.categories])];
        riskScore = Math.max(harm.riskScore, combined.riskScore);
        provider = harm.provider;
        providerModel = harm.model;
        providerRequestId = harm.providerRequestId;
        scores = { ...combined.scores, ...harm.scores };
        categories.push(reasonFromHarmAssessment(harm));
      } else {
        decision = combined.decision;
        categories = combined.categories;
        riskScore = combined.riskScore;
        provider = combined.provider;
        providerModel = combined.model;
        providerRequestId = combined.providerRequestId;
        extractedText = combined.extractedText;
        scores = combined.scores;
      }
    }

    if (decision === 'ALLOW') {
      await admin.storage.from(QUARANTINE_BUCKET).remove([quarantinePath]);
      quarantinePath = null;
      await resolveJob(admin, job, 'SAFE', { sha256, categories });
      return 'safe';
    }

    const { error: recordError } = await admin.rpc('rpc_service_record_content_moderation_event', {
      p_actor_user_id: job.user_id,
      p_target_user_id: null,
      p_content_type: 'profile_image',
      p_content_id: null,
      p_client_content_id: `legacy-profile-remediation:${job.id}`,
      p_storage_bucket: QUARANTINE_BUCKET,
      p_storage_path: quarantinePath,
      p_decision: 'BLOCK',
      p_categories: [...new Set(categories)],
      p_risk_score: riskScore,
      p_extracted_text: extractedText,
      p_evidence_snapshot: {
        remediation_job_id: job.id,
        source_bucket: source.bucket,
        source_path: source.path,
        source_field: job.field_name,
        source_index: job.item_index,
        sha256,
        mime: media.mime,
        scores,
      },
      p_provider: provider,
      p_provider_model: providerModel,
      p_provider_request_id: providerRequestId,
      p_failure_reason: null,
    });
    if (recordError) throw new Error('REMEDIATION_EVIDENCE_RECORD_FAILED');
    evidenceRecorded = true;
    await resolveJob(admin, job, 'REMOVE', { sha256, categories: [...new Set(categories)] });
    return 'cleanup_pending';
  } catch (error) {
    if (quarantinePath && !evidenceRecorded) {
      await admin.storage.from(QUARANTINE_BUCKET).remove([quarantinePath]).catch(() => undefined);
    }
    await resolveJob(admin, job, 'RETRY', {
      error: String(error?.message || error || 'REMEDIATION_FAILED').slice(0, 500),
    });
    return 'retry';
  }
};

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
  const secret = Deno.env.get('PROFILE_MEDIA_REMEDIATION_SECRET') || '';
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return json(401, { ok: false, code: 'UNAUTHENTICATED' });
  }
  const input = await request.json().catch(() => null);
  if (input?.execute !== true) return json(400, { ok: false, code: 'EXECUTE_REQUIRED' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) return json(503, { ok: false, code: 'CONFIGURATION_INCOMPLETE' });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: jobs, error } = await admin.rpc(
    'rpc_service_claim_profile_media_remediation',
    { p_limit: MAX_BATCH },
  );
  if (error) return json(503, { ok: false, code: 'REMEDIATION_CLAIM_FAILED' });

  const outcomes = { safe: 0, removed: 0, cleanup_pending: 0, retry: 0 };
  for (const job of jobs ?? []) {
    const outcome = await processJob(admin, job, supabaseUrl);
    outcomes[outcome] += 1;
  }
  return json(200, { ok: true, claimed: jobs?.length ?? 0, outcomes });
});
