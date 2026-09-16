// @ts-nocheck -- checked by the Supabase Edge Function bundler.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';
import { corsHeaders } from '../_shared/cors.ts';
import { moderateWithOpenAI } from '../_shared/content-safety.ts';
import {
  classifyProfileMediaV1_2,
  combineProfileMediaEvidence,
  reasonFromHarmAssessment,
} from '../_shared/profile-media-policy-v1-2.ts';
import { assessMediaExtractedText } from '../_shared/media-extracted-text-policy.ts';
import { decodeQrPayloads } from '../_shared/qr-decoder.ts';
import {
  publishCapturedBytes,
  type ImmutableMediaStore,
} from '../_shared/immutable-media-publication.ts';

const CONTRACT_VERSION = '1.2.0';
const STAGING_BUCKET = 'profile-media-staging-v1-2';
const QUARANTINE_BUCKET = 'moderation-quarantine';
const APPROVED_BUCKET = 'moderated-profile-media';
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_GALLERY = 6;
const POLICY_SCAN_MAX_EDGE = 1024;
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

type StagedRef = { kind: 'staged'; path: string };
type ExistingRef = { kind: 'existing'; url: string };
type MediaRef = StagedRef | ExistingRef;
type Slot = 'avatar' | 'gallery';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isRef = (value: unknown): value is MediaRef => isRecord(value)
  && ((value.kind === 'staged' && typeof value.path === 'string')
    || (value.kind === 'existing' && typeof value.url === 'string'));
const safePath = (path: string, userId: string) => path.startsWith(`${userId}/`)
  && path.length <= 500
  && !path.includes('..')
  && /^[a-zA-Z0-9/_ .-]+$/.test(path);

const sniffMime = (bytes: Uint8Array) => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) =>
    value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (bytes.length >= 12
    && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') {
    return { mime: 'image/webp', extension: 'webp' };
  }
  return null;
};

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
};

const getPublicUrl = (admin, path: string) =>
  admin.storage.from(APPROVED_BUCKET).getPublicUrl(path).data.publicUrl;

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  const requestStartedAt = Date.now();
  const timingsMs = {
    image_download: 0,
    db_hash_lookup: 0,
    quarantine_prepare: 0,
    qr_decode: 0,
    provider_and_ocr: 0,
    harm_provider: 0,
    profile_policy_and_ocr: 0,
    immutable_publication: 0,
    db_apply: 0,
  };
  const providerDiagnostics: Array<Record<string, unknown>> = [];
  const withTimings = (body: Record<string, unknown>) => ({
    ...body,
    timingsMs: { ...timingsMs, total: Date.now() - requestStartedAt },
    providerDiagnostics,
  });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(503, { ok: false, code: 'PROFILE_MEDIA_SCAN_UNAVAILABLE', retryable: true });
  }

  const authorization = request.headers.get('Authorization') || '';
  const auth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await auth.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json(401, { ok: false, code: 'UNAUTHENTICATED' });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, code: 'PROFILE_MEDIA_REQUEST_INVALID' });
  }
  const clientRequestId = String(body.clientRequestId || '').trim();
  const photos = Array.isArray(body.photos) ? body.photos : null;
  if (body.contractVersion !== CONTRACT_VERSION
    || !/^[a-zA-Z0-9_-]{8,160}$/.test(clientRequestId)
    || (body.avatar !== null && !isRef(body.avatar))
    || (body.hero !== null && !isRef(body.hero))
    || !photos
    || photos.length > MAX_GALLERY
    || !photos.every(isRef)) {
    return json(400, { ok: false, code: 'PROFILE_MEDIA_REQUEST_INVALID' });
  }

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id,avatar_url,hero_image_url,photos,deleted_at')
    .eq('user_id', user.id).is('deleted_at', null).maybeSingle();
  if (profileError || !profile) return json(404, { ok: false, code: 'PROFILE_NOT_FOUND' });
  const existingUrls = new Set([
    profile.avatar_url,
    profile.hero_image_url,
    ...(Array.isArray(profile.photos) ? profile.photos : []),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0));

  const allRefs: Array<{ ref: MediaRef; slot: Slot; index: number }> = [
    ...(body.avatar ? [{ ref: body.avatar as MediaRef, slot: 'avatar' as Slot, index: 0 }] : []),
    ...(body.hero ? [{ ref: body.hero as MediaRef, slot: 'gallery' as Slot, index: 1000 }] : []),
    ...photos.map((ref, index) => ({ ref, slot: 'gallery' as Slot, index })),
  ];
  for (const item of allRefs) {
    if (item.ref.kind === 'existing' && !existingUrls.has(item.ref.url)) {
      return json(422, { ok: false, code: 'PROFILE_MEDIA_URL_NOT_APPROVED' });
    }
    if (item.ref.kind === 'staged' && !safePath(item.ref.path, user.id)) {
      return json(422, { ok: false, code: 'PROFILE_MEDIA_STAGING_PATH_INVALID' });
    }
  }

  const stagedPaths = [...new Set(allRefs
    .filter((item) => item.ref.kind === 'staged')
    .map((item) => (item.ref as StagedRef).path))];
  const quarantinePaths: string[] = [];
  const publishedPathsToRollback: string[] = [];
  const provenancePathsToRollback: string[] = [];
  let profileMediaApplied = false;
  const prepared = new Map<string, {
    bytes: Uint8Array; mime: string; extension: string; sha256: string;
    quarantinePath: string; signedUrl: string;
  }>();

  const cleanup = async (removeStaging: boolean) => {
    await Promise.all([
      quarantinePaths.length ? admin.storage.from(QUARANTINE_BUCKET).remove(quarantinePaths) : null,
      removeStaging && stagedPaths.length
        ? admin.storage.from(STAGING_BUCKET).remove(stagedPaths)
        : null,
    ]);
  };

  try {
    for (const path of stagedPaths) {
      const downloadStartedAt = Date.now();
      const { data, error } = await admin.storage.from(STAGING_BUCKET).download(path);
      if (error || !data) throw new Error('PROFILE_MEDIA_STAGING_DOWNLOAD_FAILED');
      const bytes = new Uint8Array(await data.arrayBuffer());
      timingsMs.image_download += Date.now() - downloadStartedAt;
      if (bytes.length === 0 || bytes.length > MAX_BYTES) {
        await cleanup(true);
        return json(422, { ok: false, code: 'PROFILE_MEDIA_REPLACE_REQUIRED', reason: 'INVALID_FILE' });
      }
      const media = sniffMime(bytes);
      if (!media) {
        await cleanup(true);
        return json(422, { ok: false, code: 'PROFILE_MEDIA_REPLACE_REQUIRED', reason: 'INVALID_FILE' });
      }
      const hashStartedAt = Date.now();
      const sha256 = await sha256Hex(bytes);
      const { data: hashMatch, error: hashError } = await admin.rpc(
        'rpc_service_match_unsafe_media_hash', { p_sha256: sha256 },
      );
      timingsMs.db_hash_lookup += Date.now() - hashStartedAt;
      if (hashError || hashMatch?.authorized !== true) {
        await cleanup(true);
        return json(503, { ok: false, code: 'PROFILE_MEDIA_SCAN_UNAVAILABLE', retryable: true });
      }
      if (hashMatch.matched === true) {
        const evidencePath = `child-safety-hold/${user.id}/${clientRequestId}-${sha256}.${media.extension}`;
        const { error: evidenceUploadError } = await admin.storage.from(QUARANTINE_BUCKET)
          .upload(evidencePath, bytes, { contentType: media.mime, upsert: false });
        if (evidenceUploadError) {
          await cleanup(true);
          return json(503, { ok: false, code: 'PROFILE_MEDIA_SCAN_UNAVAILABLE', retryable: true });
        }
        const { error: evidenceRecordError } = await admin.rpc(
          'rpc_service_record_content_moderation_event',
          {
            p_actor_user_id: user.id,
            p_target_user_id: null,
            p_content_type: 'profile_image',
            p_content_id: null,
            p_client_content_id: clientRequestId,
            p_storage_bucket: QUARANTINE_BUCKET,
            p_storage_path: evidencePath,
            p_decision: 'BLOCK',
            p_categories: ['known_illegal_media'],
            p_risk_score: 1,
            p_extracted_text: null,
            p_evidence_snapshot: {
              sha256,
              mime: media.mime,
              byte_size: bytes.length,
              contract_version: CONTRACT_VERSION,
            },
            p_provider: 'hash_blocklist',
            p_provider_model: 'sha256-v1',
            p_provider_request_id: null,
            p_failure_reason: null,
          },
        );
        if (evidenceRecordError) {
          await admin.storage.from(QUARANTINE_BUCKET).remove([evidencePath]);
          await cleanup(true);
          return json(503, { ok: false, code: 'PROFILE_MEDIA_SCAN_UNAVAILABLE', retryable: true });
        }
        for (const item of allRefs.filter((candidate) =>
          candidate.ref.kind === 'staged' && candidate.ref.path === path)) {
          await admin.from('profile_media_guard_events_v1_2').upsert({
            user_id: user.id,
            client_request_id: clientRequestId,
            slot: item.slot,
            item_index: item.index,
            decision: 'REPLACE',
            reason_code: 'ILLEGAL_CONTENT',
            categories: ['known_illegal_media'],
            risk_score: 1,
            sha256,
            mime_type: media.mime,
            byte_size: bytes.length,
            provider: 'hash_blocklist',
            provider_model: 'sha256-v1',
            provider_request_id: null,
            failure_reason: null,
            metadata: { contract_version: CONTRACT_VERSION },
          }, { onConflict: 'user_id,client_request_id,slot,item_index' });
        }
        if (stagedPaths.length) await admin.storage.from(STAGING_BUCKET).remove(stagedPaths);
        return json(422, withTimings({
          ok: false,
          code: 'PROFILE_MEDIA_REPLACE_REQUIRED',
          reason: 'ILLEGAL_CONTENT',
        }));
      }
      const quarantineStartedAt = Date.now();
      const quarantinePath = `${user.id}/${clientRequestId}-${sha256}.${media.extension}`;
      const { error: uploadError } = await admin.storage.from(QUARANTINE_BUCKET)
        .upload(quarantinePath, bytes, { contentType: media.mime, upsert: true });
      if (uploadError) throw new Error('PROFILE_MEDIA_QUARANTINE_FAILED');
      quarantinePaths.push(quarantinePath);
      const { data: signed, error: signedError } = await admin.storage.from(QUARANTINE_BUCKET)
        .createSignedUrl(quarantinePath, 300);
      if (signedError || !signed?.signedUrl) throw new Error('PROFILE_MEDIA_QUARANTINE_FAILED');
      prepared.set(path, {
        bytes, ...media, sha256, quarantinePath, signedUrl: signed.signedUrl,
      });
      timingsMs.quarantine_prepare += Date.now() - quarantineStartedAt;
    }

    const assessments = new Map<string, Awaited<ReturnType<typeof classifyProfileMediaV1_2>>>();
    for (const item of allRefs) {
      if (item.ref.kind !== 'staged') continue;
      const cacheKey = `${item.ref.path}:${item.slot}`;
      if (assessments.has(cacheKey)) continue;
      const { data: rateLimit, error: rateError } = await admin.rpc(
        'rpc_service_consume_content_guard_rate_limit',
        { p_user_id: user.id, p_scope: 'profile_image' },
      );
      if (rateError || !rateLimit?.allowed) {
        await cleanup(true);
        return json(rateError ? 503 : 429, {
          ok: false,
          code: 'PROFILE_MEDIA_SCAN_UNAVAILABLE',
          retryable: true,
          retryAfterSeconds: Number(rateLimit?.retry_after_seconds || 30),
        });
      }
      const media = prepared.get(item.ref.path)!;
      const qrStartedAt = Date.now();
      const qr = await decodeQrPayloads(media.bytes, media.mime);
      timingsMs.qr_decode += Date.now() - qrStartedAt;
      if (qr.failureReason) {
        await cleanup(true);
        return json(503, withTimings({
          ok: false,
          code: 'PROFILE_MEDIA_SCAN_UNAVAILABLE',
          reason: qr.failureReason,
          retryable: true,
        }));
      }
      const originalWidth = Number(qr.width || 0);
      const originalHeight = Number(qr.height || 0);
      const originalMaxEdge = Math.max(originalWidth, originalHeight);
      let scanUrl = media.signedUrl;
      let scanWidth = originalWidth;
      let scanHeight = originalHeight;
      if (originalMaxEdge > POLICY_SCAN_MAX_EDGE) {
        const scale = POLICY_SCAN_MAX_EDGE / originalMaxEdge;
        scanWidth = Math.max(1, Math.round(originalWidth * scale));
        scanHeight = Math.max(1, Math.round(originalHeight * scale));
        const derivativeStartedAt = Date.now();
        const { data: derivative, error: derivativeError } = await admin.storage
          .from(QUARANTINE_BUCKET)
          .createSignedUrl(media.quarantinePath, 300, {
            transform: {
              width: scanWidth,
              height: scanHeight,
              resize: 'contain',
              quality: 85,
              format: 'origin',
            },
          });
        timingsMs.quarantine_prepare += Date.now() - derivativeStartedAt;
        if (derivativeError || !derivative?.signedUrl) {
          await cleanup(true);
          return json(503, withTimings({
            ok: false,
            code: 'PROFILE_MEDIA_SCAN_UNAVAILABLE',
            retryable: true,
          }));
        }
        scanUrl = derivative.signedUrl;
      }
      const qrTextPolicy = assessMediaExtractedText(
        qr.payloads.join(' '),
        'public_profile_media',
      );
      if (qrTextPolicy.decision === 'BLOCK') {
        const harmStartedAt = Date.now();
        const harm = await moderateWithOpenAI([
          { type: 'image_url', image_url: { url: scanUrl } },
        ]);
        const harmElapsed = Date.now() - harmStartedAt;
        timingsMs.harm_provider += harmElapsed;
        timingsMs.provider_and_ocr += harmElapsed;
        providerDiagnostics.push({
          slot: item.slot,
          itemIndex: item.index,
          model: harm.model,
          originalWidth,
          originalHeight,
          scanWidth,
          scanHeight,
          profilePolicySkipped: true,
          harmFailureReason: harm.failureReason,
        });
        const categories = [...new Set([
          ...qrTextPolicy.categories,
          ...(harm.failureReason ? [] : harm.categories),
        ])];
        await admin.from('profile_media_guard_events_v1_2').upsert({
          user_id: user.id,
          client_request_id: clientRequestId,
          slot: item.slot,
          item_index: item.index,
          decision: 'REPLACE',
          reason_code: 'QR_CODE',
          categories,
          risk_score: 1,
          sha256: media.sha256,
          mime_type: media.mime,
          byte_size: media.bytes.length,
          provider: 'deterministic',
          provider_model: 'qr-contact-v1',
          provider_request_id: null,
          failure_reason: null,
          metadata: {
            contract_version: CONTRACT_VERSION,
            qr_present: true,
            deterministic_text_decision: 'BLOCK',
            deterministic_text_categories: qrTextPolicy.categories,
            profile_policy_skipped: true,
            harm_provider: harm.provider,
            harm_provider_model: harm.model,
            harm_provider_request_id: harm.providerRequestId,
            harm_failure_reason: harm.failureReason,
          },
        }, { onConflict: 'user_id,client_request_id,slot,item_index' });
        await cleanup(true);
        return json(422, withTimings({
          ok: false,
          code: 'PROFILE_MEDIA_REPLACE_REQUIRED',
          reason: 'QR_CODE',
          slot: item.slot,
          itemIndex: item.index,
        }));
      }
      const providerStartedAt = Date.now();
      const [harm, policy] = await Promise.all([
        (async () => {
          const startedAt = Date.now();
          try {
            return await moderateWithOpenAI([
              { type: 'image_url', image_url: { url: scanUrl } },
            ]);
          } finally {
            timingsMs.harm_provider += Date.now() - startedAt;
          }
        })(),
        (async () => {
          const startedAt = Date.now();
          try {
            return await classifyProfileMediaV1_2(scanUrl, item.slot);
          } finally {
            timingsMs.profile_policy_and_ocr += Date.now() - startedAt;
          }
        })(),
      ]);
      timingsMs.provider_and_ocr += Date.now() - providerStartedAt;
      providerDiagnostics.push({
        slot: item.slot,
        itemIndex: item.index,
        model: policy.model,
        originalWidth,
        originalHeight,
        scanWidth,
        scanHeight,
        ...policy.diagnostics,
      });
      if (harm.failureReason || policy.failureReason) {
        await admin.from('profile_media_guard_events_v1_2').upsert({
          user_id: user.id,
          client_request_id: clientRequestId,
          slot: item.slot,
          item_index: item.index,
          decision: 'RETRY_LATER',
          reason_code: 'PROVIDER_UNAVAILABLE',
          categories: ['provider_unavailable'],
          risk_score: 0,
          sha256: media.sha256,
          mime_type: media.mime,
          byte_size: media.bytes.length,
          provider: policy.failureReason ? policy.provider : harm.provider,
          provider_model: policy.failureReason ? policy.model : harm.model,
          provider_request_id: policy.failureReason ? policy.providerRequestId : harm.providerRequestId,
          failure_reason: policy.failureReason || harm.failureReason,
          metadata: { contract_version: CONTRACT_VERSION },
        }, { onConflict: 'user_id,client_request_id,slot,item_index' });
        await cleanup(true);
        return json(503, withTimings({
          ok: false, code: 'PROFILE_MEDIA_SCAN_UNAVAILABLE', retryable: true,
        }));
      }
      const providerAssessment = harm.decision === 'BLOCK'
        ? { ...policy, decision: 'BLOCK' as const, reason: reasonFromHarmAssessment(harm),
            categories: [...new Set([...harm.categories, ...policy.categories])],
            riskScore: Math.max(harm.riskScore, policy.riskScore) }
        : policy;
      const extractedText = [policy.extractedText, ...qr.payloads].filter(Boolean).join(' ');
      const textPolicy = assessMediaExtractedText(extractedText, 'public_profile_media');
      const combinedAssessment = combineProfileMediaEvidence(
        providerAssessment,
        textPolicy,
        qr.payloads.length > 0,
      );
      const assessment = {
        ...combinedAssessment,
        extractedText: policy.extractedText || qr.payloads.join(' ') || null,
      };
      assessments.set(cacheKey, assessment);
      if (assessment.decision !== 'ALLOW') {
        await admin.from('profile_media_guard_events_v1_2').upsert({
          user_id: user.id,
          client_request_id: clientRequestId,
          slot: item.slot,
          item_index: item.index,
          decision: 'REPLACE',
          reason_code: assessment.reason,
          categories: assessment.categories,
          risk_score: assessment.riskScore,
          sha256: media.sha256,
          mime_type: media.mime,
          byte_size: media.bytes.length,
          provider: assessment.provider,
          provider_model: assessment.model,
          provider_request_id: assessment.providerRequestId,
          failure_reason: null,
          metadata: {
            contract_version: CONTRACT_VERSION,
            face_count: assessment.faceCount,
            primary_face_clear: assessment.primaryFaceClear,
            extracted_text_present: Boolean(assessment.extractedText),
            qr_present: qr.payloads.length > 0,
            deterministic_text_decision: textPolicy.decision,
            deterministic_text_categories: textPolicy.categories,
            provider_reason: policy.reason,
            provider_visual_signals: policy.visualSignals,
            provider_diagnostics: policy.diagnostics,
            provider_veto_suppressed: assessment.providerVetoSuppressed,
          },
        }, { onConflict: 'user_id,client_request_id,slot,item_index' });
        await cleanup(true);
        return json(422, withTimings({
          ok: false,
          code: 'PROFILE_MEDIA_REPLACE_REQUIRED',
          reason: assessment.reason,
          slot: item.slot,
          itemIndex: item.index,
        }));
      }
    }

    const published = new Map<string, string>();
    const publicationStore: ImmutableMediaStore = {
      read: async (bucket, path) => {
        const { data, error } = await admin.storage.from(bucket).download(path);
        if (error || !data) throw error ?? new Error('PROFILE_MEDIA_PUBLISH_VERIFY_FAILED');
        return new Uint8Array(await data.arrayBuffer());
      },
      write: async (bucket, path, bytes, mime) => {
        const { error } = await admin.storage.from(bucket)
          .upload(path, bytes, { contentType: mime, upsert: false });
        if (error) throw error;
      },
      remove: async (bucket, paths) => {
        const { error } = await admin.storage.from(bucket).remove(paths);
        if (error) throw error;
      },
    };
    for (const [path, media] of prepared) {
      const publicationStartedAt = Date.now();
      const approvedPath = `${user.id}/${media.sha256}.${media.extension}`;
      const approvedUrl = getPublicUrl(admin, approvedPath);
      const { data: existingProvenance, error: provenanceReadError } = await admin
        .from('approved_profile_media_objects')
        .select('object_path')
        .eq('object_path', approvedPath)
        .maybeSingle();
      if (provenanceReadError) throw new Error('PROFILE_MEDIA_PROVENANCE_READ_FAILED');
      await publishCapturedBytes({
        store: publicationStore,
        capturedBytes: media.bytes,
        finalBucket: APPROVED_BUCKET,
        finalPath: approvedPath,
        mime: media.mime,
        allowExistingExact: true,
      });
      const { data: registered, error: registrationError } = await admin.rpc(
        'rpc_service_register_approved_profile_media',
        {
          p_user_id: user.id,
          p_object_path: approvedPath,
          p_public_url: approvedUrl,
          p_sha256: media.sha256,
          p_byte_size: media.bytes.length,
          p_mime_type: media.mime,
        },
      );
      if (registrationError || registered !== true) {
        throw new Error('PROFILE_MEDIA_PROVENANCE_REGISTRATION_FAILED');
      }
      if (!existingProvenance) provenancePathsToRollback.push(approvedPath);
      if (!existingUrls.has(approvedUrl)) publishedPathsToRollback.push(approvedPath);
      published.set(path, approvedUrl);
      timingsMs.immutable_publication += Date.now() - publicationStartedAt;
    }
    const resolve = (ref: MediaRef | null) => !ref ? null
      : ref.kind === 'existing' ? ref.url : published.get(ref.path)!;
    const avatarUrl = resolve(body.avatar as MediaRef | null);
    const heroUrl = resolve(body.hero as MediaRef | null);
    const photoUrls = photos.map((ref) => resolve(ref)!).filter(Boolean);
    const applyStartedAt = Date.now();
    const { data: result, error: applyError } = await admin.rpc('rpc_service_apply_profile_media_v1_2', {
      p_user_id: user.id,
      p_avatar_url: avatarUrl,
      p_hero_image_url: heroUrl,
      p_photos: photoUrls,
      p_client_request_id: clientRequestId,
    });
    timingsMs.db_apply += Date.now() - applyStartedAt;
    if (applyError) throw new Error(applyError.message || 'PROFILE_MEDIA_APPLY_FAILED');
    profileMediaApplied = true;

    for (const item of allRefs) {
      if (item.ref.kind !== 'staged') continue;
      const media = prepared.get(item.ref.path)!;
      const assessment = assessments.get(`${item.ref.path}:${item.slot}`)!;
      await admin.from('profile_media_guard_events_v1_2').upsert({
        user_id: user.id,
        client_request_id: clientRequestId,
        slot: item.slot,
        item_index: item.index,
        decision: 'ALLOW',
        reason_code: 'NONE',
        categories: assessment.categories,
        risk_score: assessment.riskScore,
        sha256: media.sha256,
        mime_type: media.mime,
        byte_size: media.bytes.length,
        provider: assessment.provider,
        provider_model: assessment.model,
        provider_request_id: assessment.providerRequestId,
        failure_reason: null,
        metadata: {
          contract_version: CONTRACT_VERSION,
          provider_diagnostics: assessment.diagnostics,
          provider_veto_suppressed: assessment.providerVetoSuppressed,
        },
      }, { onConflict: 'user_id,client_request_id,slot,item_index' });
    }
    await cleanup(true);
    return json(200, withTimings({ ...result, contractVersion: CONTRACT_VERSION }));
  } catch (error) {
    if (!profileMediaApplied && provenancePathsToRollback.length) {
      await admin.from('approved_profile_media_objects')
        .delete().in('object_path', [...new Set(provenancePathsToRollback)]);
    }
    if (!profileMediaApplied && publishedPathsToRollback.length) {
      await admin.storage.from(APPROVED_BUCKET).remove([...new Set(publishedPathsToRollback)]);
    }
    await cleanup(true);
    console.error('[profile-media-guard-v1-2]', error);
    return json(503, withTimings({
      ok: false, code: 'PROFILE_MEDIA_SCAN_UNAVAILABLE', retryable: true,
    }));
  }
});
