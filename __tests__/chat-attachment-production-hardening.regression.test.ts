import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { hasLocalStorageCapacity } from '../lib/offline/storage-capacity-policy.ts';
import {
  isTransientContentSafetyFailure,
  runWithTransientContentSafetyRetry,
} from '../supabase/functions/_shared/content-safety-retry.ts';
import { shouldTrackNetworkQualityRequest } from '../lib/network-quality-monitor.ts';

const migration = readFileSync(
  'supabase/migrations/20260731160000_production_harden_chat_attachments.sql',
  'utf8',
);
const atomicMigration = readFileSync(
  'supabase/migrations/20260803120000_atomic_chat_attachment_finalization.sql',
  'utf8',
);
const legacyIdentityRepairMigration = readFileSync(
  'supabase/migrations/20260803143000_repair_legacy_chat_attachment_identity.sql',
  'utf8',
);
const finalizeFunction = readFileSync(
  'supabase/functions/chat-attachment-finalize/index.ts',
  'utf8',
);
const contentSafety = readFileSync(
  'supabase/functions/_shared/content-safety.ts',
  'utf8',
);
const consumeFunction = readFileSync(
  'supabase/functions/chat-attachment-consume/index.ts',
  'utf8',
);
const retentionFunction = readFileSync(
  'supabase/functions/chat-attachment-retention/index.ts',
  'utf8',
);
const viewOnceModerationMigration = readFileSync(
  'supabase/migrations/20260904130000_view_once_pre_encryption_moderation.sql',
  'utf8',
);
const viewOnceModerationClient = readFileSync(
  'lib/chat/attachments/view-once-pre-encryption-service.ts',
  'utf8',
);
const chatScreen = readFileSync('components/chat/ChatScreen.tsx', 'utf8');
const babelConfig = readFileSync('babel.config.js', 'utf8');
const chatMediaProvenanceMigration = readFileSync(
  'supabase/migrations/20260921123000_chat_media_publication_provenance.sql',
  'utf8',
);
const chatImageAlbumRateLimitMigration = readFileSync(
  'supabase/migrations/20260922100000_chat_image_album_rate_limit.sql',
  'utf8',
);
const chatExpressionPresentationMigration = readFileSync(
  'supabase/migrations/20260923220000_chat_expression_media_presentation.sql',
  'utf8',
);

test('finalized attachment objects are immutable to authenticated clients', () => {
  assert.match(migration, /is_chat_attachment_object_mutable/);
  assert.match(migration, /lifecycle_status in \('ready', 'quarantined', 'expired'\)/);
  assert.match(migration, /drop policy if exists "Chat senders can delete media"/);
});

test('production bundles remove diagnostic console output and raw identifiers', () => {
  assert.match(babelConfig, /process\.env\.NODE_ENV === ["']production["']/);
  assert.match(babelConfig, /transform-remove-console/);
});

test('server finalization claims one exact payload per client message', () => {
  assert.match(migration, /primary key \(sender_id, client_message_id\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_existing is distinct from p_request_payload/);
  assert.match(migration, /attachment_idempotency_conflict/);
});

test('view-once access is an atomic server claim and split completion is revoked', () => {
  assert.match(consumeFunction, /rpc_claim_view_once_attachment/);
  assert.doesNotMatch(consumeFunction, /rpc_prepare_view_once_attachment/);
  assert.match(migration, /revoke all on function public\.rpc_prepare_view_once_attachment/);
  assert.match(migration, /revoke all on function public\.rpc_complete_view_once_attachment/);
});

test('retention has scheduling, dead-lettering, and durable run outcomes', () => {
  assert.match(migration, /chat_attachment_retention_runs/);
  assert.match(migration, /dead_letter/);
  assert.match(migration, /configure_chat_attachment_retention_worker/);
  assert.match(retentionFunction, /status: 'succeeded'/);
  assert.match(retentionFunction, /status: 'failed'/);
});

test('local staging protects a reserve instead of filling the device', () => {
  assert.equal(
    hasLocalStorageCapacity({ freeBytes: 600, requiredBytes: 100, reserveBytes: 500 }),
    true,
  );
  assert.equal(
    hasLocalStorageCapacity({ freeBytes: 599, requiredBytes: 100, reserveBytes: 500 }),
    false,
  );
});

test('finalisation claim and canonical publication share one database transaction', () => {
  assert.match(atomicMigration, /rpc_finalize_chat_attachment_batch_v3/);
  assert.match(atomicMigration, /perform public\.rpc_claim_chat_attachment_finalization/);
  assert.match(atomicMigration, /from public\.rpc_finalize_chat_attachment_batch/);
  assert.match(atomicMigration, /canonical_message_id = v_message\.id/);
  assert.match(atomicMigration, /attachment_canonical_result_conflict/);
  assert.match(finalizeFunction, /rpc_finalize_chat_attachment_batch_v3/);
  assert.match(finalizeFunction, /rpc_finalize_chat_attachment_v3/);
  assert.match(finalizeFunction, /CHAT_ATTACHMENT_ATOMIC_FINALIZATION_ENABLED/);
});

test('animated-expression presentation is allowlisted and committed atomically', () => {
  assert.match(chatExpressionPresentationMigration, /rpc_finalize_chat_attachment_batch_v4/);
  assert.match(chatExpressionPresentationMigration, /giphy_sticker/);
  assert.match(chatExpressionPresentationMigration, /set media_kind = p_media_kind/);
  assert.match(finalizeFunction, /chat_expression_presentation_unavailable/);
  assert.match(finalizeFunction, /p_media_kind: mediaKind/);
});

test('duplicate and response-loss retries resolve to one canonical identity', () => {
  assert.match(migration, /primary key \(sender_id, client_message_id\)/);
  assert.match(atomicMigration, /chat_attachment_finalization_message_unique/);
  assert.match(atomicMigration, /request_payload is distinct from p_request_payload/);
  assert.match(atomicMigration, /replay_count = replay_count \+ 1/);
  assert.match(atomicMigration, /return case when v_existing\.canonical_message_id is null then 'replay' else 'completed'/);
});

test('attachments are bound to the canonical message, owner, object and album position', () => {
  assert.match(atomicMigration, /message_attachments_canonical_identity_fkey/);
  assert.match(atomicMigration, /message_attachments_album_index_v3_valid/);
  assert.match(atomicMigration, /attachment_message_identity_mismatch/);
  assert.match(atomicMigration, /attachment_storage_owner_invalid/);
  assert.match(atomicMigration, /attachment_authoritative_size_mismatch/);
  assert.match(atomicMigration, /attachment_authoritative_mime_mismatch/);
  assert.match(atomicMigration, /attachment_preview_size_mismatch/);
});

test('server evidence distinguishes verified bytes from provisional presentation metadata', () => {
  assert.match(finalizeFunction, /authoritativeResponseSize/);
  assert.doesNotMatch(finalizeFunction, /raw\.byteSize \|\| 0/);
  assert.match(finalizeFunction, /byte_size_verified: true/);
  assert.match(finalizeFunction, /signature_verified: args\.encrypted !== true/);
  assert.match(finalizeFunction, /ciphertext_verified: args\.encrypted === true/);
  assert.match(finalizeFunction, /dimensions_source: args\.hasDimensions \? 'client_provisional' : 'absent'/);
  assert.match(finalizeFunction, /duration_source: args\.hasDuration \? 'client_provisional' : 'absent'/);
  assert.match(finalizeFunction, /signatureMatchesDeclaredMime/);
  assert.match(atomicMigration, /message_attachments_validation_evidence_v3_valid/);
});

test('stale unfinalised requests become abandoned for orphan cleanup', () => {
  assert.match(atomicMigration, /rpc_abandon_stale_chat_attachment_finalizations/);
  assert.match(atomicMigration, /interval '24 hours'/);
  assert.match(atomicMigration, /for update skip locked/);
  assert.match(atomicMigration, /status = 'abandoned'/);
  assert.match(atomicMigration, /chat_attachment_cleanup_queue/);
  assert.match(retentionFunction, /rpc_abandon_stale_chat_attachment_finalizations/);
  assert.match(retentionFunction, /abandoned_finalization_count/);
});

test('legacy attachment identities are repaired only when the mismatch is deterministic', () => {
  assert.match(legacyIdentityRepairMigration, /unsafe_legacy_attachment_identity_mismatch/);
  assert.match(legacyIdentityRepairMigration, /legacy-.*message_row\.id::text/);
  assert.match(legacyIdentityRepairMigration, /count\(distinct attachment_row\.client_message_id\) <> 1/);
  assert.match(legacyIdentityRepairMigration, /legacy_attachment_identity_conflicts_with_canonical_message/);
  assert.match(legacyIdentityRepairMigration, /set client_message_id = repairable\.client_message_id/);
  assert.match(
    legacyIdentityRepairMigration,
    /validate constraint message_attachments_canonical_identity_fkey/,
  );
});

test('view-once photos are moderated before server-owned encryption', () => {
  assert.match(viewOnceModerationClient, /bucket: MODERATION_BUCKET/);
  assert.match(viewOnceModerationClient, /mode: 'finalize_view_once_plaintext'/);
  assert.match(finalizeFunction, /await assessChatImage\(inspectionUrl\.signedUrl, plainBytes, mime\)/);
  assert.match(finalizeFunction, /exact downloaded bytes into a service-only, immutable object/);
  assert.match(finalizeFunction, /encryptApprovedViewOnceImage/);
  assert.match(finalizeFunction, /nacl\.secretbox\(plainBytes, mediaNonce, mediaKey\)/);
  assert.match(chatScreen, /kind === 'image' && !networkReady/);
  assert.match(chatScreen, /moderateEncryptAndSendViewOnceImage/);
});

test('a client cannot self-assert that encrypted image moderation passed', () => {
  assert.match(finalizeFunction, /let preModeratedImageSafety = null/);
  assert.match(finalizeFunction, /imageSafety = preModeratedImageSafety \|\|/);
  assert.match(finalizeFunction, /ENCRYPTED_IMAGE_UNINSPECTABLE/);
  assert.match(viewOnceModerationMigration, /revoke all on table public\.view_once_moderation_receipts from public, anon, authenticated/);
  assert.match(viewOnceModerationMigration, /unique \(sender_user_id, client_message_id, attachment_id\)/);
});

test('view-once plaintext has bounded storage and crash cleanup', () => {
  assert.match(viewOnceModerationMigration, /'view-once-moderation'[\s\S]*false,[\s\S]*15728624/);
  assert.match(finalizeFunction, /plainBytes\?\.fill\(0\)/);
  assert.match(finalizeFunction, /storage\.from\(stagingBucket\)\.remove\(\[stagingPath\]\)/);
  assert.match(retentionFunction, /rpc_service_list_stale_view_once_moderation_objects/);
  assert.match(retentionFunction, /moderationStagingDeleted/);
});

test('v1.2 attachment calls carry an explicit safety contract without changing legacy callers', () => {
  const lifecycle = readFileSync('lib/chat/attachment-lifecycle.ts', 'utf8');
  assert.match(lifecycle, /CHAT_ATTACHMENT_GUARD_CONTRACT_V1_2 = '1\.2\.0'/);
  assert.match(lifecycle, /body: \{ contractVersion: CHAT_ATTACHMENT_GUARD_CONTRACT_V1_2, \.\.\.input \}/);
  assert.match(finalizeFunction, /hardenedContract/);
  assert.match(finalizeFunction, /hardenedContract && \['video', 'document'\]\.includes/);
});

test('album moderation is receipt-backed, resumable, and cleans partial publication', () => {
  const lifecycle = readFileSync('lib/chat/attachment-lifecycle.ts', 'utf8');
  const receiptMigration = readFileSync(
    'supabase/migrations/20260921120000_chat_image_moderation_receipts.sql',
    'utf8',
  );
  assert.match(finalizeFunction, /preflightChatImageModeration/);
  assert.match(finalizeFunction, /readImageModerationReceipt/);
  assert.match(finalizeFunction, /storeImageModerationReceipt/);
  assert.match(finalizeFunction, /const receiptStored = await storeImageModerationReceipt/);
  assert.match(finalizeFunction, /image_moderation_receipt_unavailable/);
  assert.match(finalizeFunction, /image_moderation_receipt_required/);
  assert.match(
    finalizeFunction,
    /onConflict: 'sender_user_id,client_message_id,attachment_id,sha256,mime_type,policy_version'/,
  );
  assert.doesNotMatch(finalizeFunction, /mapBounded\(moderationTasks, 3/);
  assert.match(finalizeFunction, /allowExistingExact: true/);
  assert.match(finalizeFunction, /const failBatch = async/);
  assert.match(finalizeFunction, /removeApprovedChatImages\(service, publishedObjects\)/);
  assert.match(receiptMigration, /primary key \(sender_user_id, client_message_id, attachment_id, sha256, mime_type, policy_version\)/);
  assert.match(receiptMigration, /revoke all on table public\.chat_image_moderation_receipts/);
  assert.match(finalizeFunction, /mode === 'moderate_image_item'/);
  assert.match(finalizeFunction, /mode === 'moderate_image_batch'/);
  assert.match(finalizeFunction, /CHAT_IMAGE_PREPARATION_CONCURRENCY = 4/);
  assert.match(finalizeFunction, /CHAT_IMAGE_PROVIDER_CONCURRENCY = 4/);
  assert.match(finalizeFunction, /runWithTransientContentSafetyRetry/);
  assert.match(finalizeFunction, /image-assessment-retry/);
  assert.match(finalizeFunction, /deferFreshAssessment: true/);
  assert.match(finalizeFunction, /completeDeferredChatImagePairModeration/);
  assert.match(finalizeFunction, /holds\[missingIndexes\[0\]\]\.bytes = new Uint8Array/);
  assert.match(finalizeFunction, /albumRateLimitPromise/);
  assert.match(finalizeFunction, /rateLimitGate: consumeAlbumRateLimit/);
  assert.match(finalizeFunction, /consumeContentGuardRateLimit\(service, user\.id, 'chat_image_album'\)/);
  assert.match(chatImageAlbumRateLimitMigration, /when p_scope = 'chat_image_album' then 6/);
  assert.match(chatImageAlbumRateLimitMigration, /auth\.role\(\) <> 'service_role'/);
  assert.match(finalizeFunction, /preflightChatImagePairModeration/);
  assert.match(finalizeFunction, /await assessChatImagesWithRetry\(missingIndexes\.map/);
  assert.match(finalizeFunction, /const priorReviews = await Promise\.all/);
  assert.match(finalizeFunction, /const hashResults = await Promise\.all/);
  assert.match(finalizeFunction, /readReceiptBackedApprovedImage/);
  assert.match(finalizeFunction, /const \[originalResult, previewResult\] = await Promise\.all/);
  assert.match(finalizeFunction, /const cleanupByBucket = new Map/);
  assert.match(finalizeFunction, /const hardenedImagePreparations = new Map/);
  assert.match(finalizeFunction, /const preparationResults = await mapBounded\(imageCandidates, 4/);
  assert.match(finalizeFunction, /url: harmAsset\.imageUrl/);
  assert.match(finalizeFunction, /classifyImageSolicitation\(\s*solicitationAsset\.imageUrl/);
  assert.match(finalizeFunction, /decodeQrPayloads\(solicitationAsset\.bytes/);
  assert.match(finalizeFunction, /harm\.decision === 'BLOCK'[\s\S]*solicitationController\.abort\(\)/);
  assert.match(contentSafety, /CONTENT_SAFETY_VISION_MODEL'\) \|\| 'gpt-5\.6-terra'/);
  assert.match(contentSafety, /reasoning: \{ effort: 'none' \}/);
  assert.match(contentSafety, /detail: 'high'/);
  assert.match(finalizeFunction, /const results = await mapBounded\(tasks, 1/);
  assert.match(lifecycle, /assetRole: 'pair'/);
  assert.doesNotMatch(lifecycle, /for \(const assetRole of \['original', 'preview'\] as const\)/);
  assert.match(finalizeFunction, /const captured = await readChatImageBytes/);
  assert.match(finalizeFunction, /p_sender_user_id: user\.id/);
  assert.match(finalizeFunction, /consumeRateLimit: false/);
});

test('album moderation retries only transient provider failures with bounded jitter', async () => {
  assert.equal(isTransientContentSafetyFailure('OPENAI_MODERATION_TIMEOUT'), true);
  assert.equal(isTransientContentSafetyFailure('OPENAI_VISION_INVALID_RESPONSE'), true);
  assert.equal(isTransientContentSafetyFailure('OPENAI_MODERATION_HTTP_429'), true);
  assert.equal(isTransientContentSafetyFailure('OPENAI_VISION_HTTP_503'), true);
  assert.equal(isTransientContentSafetyFailure('OPENAI_API_KEY_MISSING'), false);
  assert.equal(isTransientContentSafetyFailure('OPENAI_VISION_HTTP_401'), false);
  assert.equal(isTransientContentSafetyFailure('OPENAI_MODERATION_CANCELLED'), false);

  let attempts = 0;
  const delays: number[] = [];
  const result = await runWithTransientContentSafetyRetry(
    async () => {
      attempts += 1;
      return attempts === 1
        ? { decision: 'REVIEW', failureReason: 'OPENAI_MODERATION_HTTP_429' }
        : { decision: 'ALLOW', failureReason: null };
    },
    {
      maxRetries: 1,
      minDelayMs: 250,
      maxDelayMs: 750,
      random: () => 0.5,
      sleep: async (delayMs) => { delays.push(delayMs); },
    },
  );

  assert.equal(attempts, 2);
  assert.deepEqual(delays, [500]);
  assert.equal(result.failureReason, null);
});

test('album moderation does not retry permanent provider configuration failures', async () => {
  let attempts = 0;
  const result = await runWithTransientContentSafetyRetry(
    async () => {
      attempts += 1;
      return { decision: 'REVIEW', failureReason: 'OPENAI_API_KEY_MISSING' };
    },
    { sleep: async () => assert.fail('permanent failures must not sleep or retry') },
  );

  assert.equal(attempts, 1);
  assert.equal(result.failureReason, 'OPENAI_API_KEY_MISSING');
});

test('expected media work does not masquerade as a slow connection', () => {
  assert.equal(shouldTrackNetworkQualityRequest(
    'https://project.supabase.co/functions/v1/chat-attachment-finalize',
  ), false);
  assert.equal(shouldTrackNetworkQualityRequest(
    'https://project.supabase.co/storage/v1/object/chat-attachment-staging-v1-2/path.jpg',
  ), false);
  assert.equal(shouldTrackNetworkQualityRequest(
    'https://project.storage.supabase.co/storage/v1/upload/resumable',
  ), false);
  assert.equal(shouldTrackNetworkQualityRequest(
    'https://project.supabase.co/rest/v1/messages?select=*',
  ), true);
});

test('album failures preserve exact item identity and caption recovery is durable', () => {
  const lifecycle = readFileSync('lib/chat/attachment-lifecycle.ts', 'utf8');
  const outbox = readFileSync('lib/chat/outbox/chat-outbox-service.ts', 'utf8');
  const repository = readFileSync('lib/chat/local/chat-repository.ts', 'utf8');
  const screen = readFileSync('components/chat/ChatScreen.tsx', 'utf8');
  assert.match(lifecycle, /readonly attachmentId: string \| null/);
  assert.match(lifecycle, /readonly attachmentIndex: number \| null/);
  assert.match(outbox, /serverItemFailure\.attachmentId/);
  assert.match(outbox, /updateAlbumCaption/);
  assert.match(repository, /updateQueuedAlbumCaption/);
  assert.match(screen, /ChatAlbumCaptionEditor/);
  assert.match(finalizeFunction, /caption_too_long/);
});

test('immutable staging retries reuse completed deterministic uploads without requesting overwrite access', () => {
  const queue = readFileSync('lib/chat/attachments/chat-attachment-queue.ts', 'utf8');
  const outbox = readFileSync('lib/chat/outbox/chat-outbox-service.ts', 'utf8');
  const transport = readFileSync('lib/chat/transfer/chat-upload-transport.ts', 'utf8');

  assert.match(queue, /const durableMediaItems = albumItems\?\.length/);
  assert.match(outbox, /payload\.albumItems && payload\.albumItems\.length > 0/);
  assert.match(transport, /const upsert = request\.upsert \?\? false/);
  assert.match(transport, /isImmutableObjectAlreadyPresentError/);
  assert.match(transport, /server still downloads and validates the authoritative bytes/);
  assert.match(outbox, /file\.uploadCompleted === true/);
  assert.match(outbox, /canonicalAfterFailure/);
  assert.match(outbox, /media-send-reconciled/);
});

test('service-published moderated chat images require exact private provenance', () => {
  assert.match(chatMediaProvenanceMigration, /approved_chat_media_objects/);
  assert.match(chatMediaProvenanceMigration, /rpc_service_register_approved_chat_media/);
  assert.match(chatMediaProvenanceMigration, /p_object_path is distinct from v_expected_path/);
  assert.match(chatMediaProvenanceMigration, /object_row\.bucket_id = 'chat-media'/);
  assert.match(chatMediaProvenanceMigration, /v_object\.owner_id::text is distinct from new\.sender_id::text[\s\S]*and not v_object_approved/);
  assert.match(chatMediaProvenanceMigration, /v_preview\.owner_id::text is distinct from new\.sender_id::text[\s\S]*and not v_preview_approved/);
  assert.match(chatMediaProvenanceMigration, /revoke all on table public\.approved_chat_media_objects[\s\S]*authenticated/);
  assert.match(finalizeFunction, /rpc_service_register_approved_chat_media/);
  assert.match(finalizeFunction, /approved_chat_media_provenance_registration_failed/);
  assert.match(finalizeFunction, /removeApprovedChatImages/);
  assert.match(finalizeFunction, /const encryptedSha256 = await sha256Hex\(encrypted\.cipherBytes\)/);
  assert.match(finalizeFunction, /const encryptedPath = approvedChatImagePath/);
  assert.match(
    finalizeFunction,
    /p_object_path: encryptedPath,[\s\S]*p_sha256: encryptedSha256,[\s\S]*p_byte_size: encrypted\.cipherBytes\.length/,
  );
  assert.match(finalizeFunction, /await removeApprovedChatImages\(service, \[encryptedPath\]\)/);
});

test('v1.2 photo sends expose Standard and HD preparation plus stage timings', () => {
  const imagePreparation = readFileSync('lib/chat/media/chat-image-preparation.ts', 'utf8');
  const attachmentPreview = readFileSync('lib/chat/attachments/chat-attachment-preview.ts', 'utf8');
  const qualityPolicy = readFileSync('lib/chat/media/chat-image-quality-policy.ts', 'utf8');
  const outbox = readFileSync('lib/chat/outbox/chat-outbox-service.ts', 'utf8');
  const screen = readFileSync('components/chat/ChatScreen.tsx', 'utf8');
  assert.match(qualityPolicy, /standard:[\s\S]*maxEdge: 1920[\s\S]*targetBytes: 2 \* 1024 \* 1024/);
  assert.match(qualityPolicy, /hd:[\s\S]*maxEdge: 4096/);
  assert.match(imagePreparation, /prepareChatImageForSend/);
  assert.match(imagePreparation, /preservedAnimation/);
  assert.match(screen, /accessibilityLabel="Send photos in HD"/);
  assert.match(screen, /styles\.imagePickerOptionMotion/);
  assert.doesNotMatch(screen, /styles\.imagePickerSubLabel/);
  assert.match(screen, /mapChatAlbumItemsBounded\(selectedAssets/);
  assert.match(outbox, /media-upload-completed/);
  assert.match(outbox, /media-send-ready/);
  assert.match(outbox, /media-moderation-preflight-completed/);
  assert.match(outbox, /preflightChatImageAttachmentBatch/);
  assert.match(finalizeFunction, /image-assessment-timing/);
  assert.match(finalizeFunction, /approved-publication-timing/);
  assert.match(finalizeFunction, /totalDurationMs/);
  assert.match(attachmentPreview, /CHAT_ATTACHMENT_PREVIEW_TARGET_BYTES = 160 \* 1024/);
  assert.match(attachmentPreview, /CHAT_ATTACHMENT_PREVIEW_MAX_BYTES = 256 \* 1024/);
  assert.match(attachmentPreview, /for \(const profile of PREVIEW_PROFILES\)/);
  assert.match(attachmentPreview, /Math\.floor\(sourceByteSize \* 0\.75\)/);
  assert.match(attachmentPreview, /byteSize <= effectiveTargetBytes/);
  assert.match(attachmentPreview, /softMaxExceeded/);
  assert.doesNotMatch(attachmentPreview, /chat_preview_size_budget_exceeded/);
  assert.match(attachmentPreview, /manipulateAsync/);
  assert.match(finalizeFunction, /if \(itemKind !== 'image'\)/);
  assert.match(finalizeFunction, /const publicationResults = await Promise\.allSettled/);
  assert.match(finalizeFunction, /approved_image_publication_failed/);
});
