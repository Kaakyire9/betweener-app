import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { hasLocalStorageCapacity } from '../lib/offline/storage-capacity-policy.ts';

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

test('finalized attachment objects are immutable to authenticated clients', () => {
  assert.match(migration, /is_chat_attachment_object_mutable/);
  assert.match(migration, /lifecycle_status in \('ready', 'quarantined', 'expired'\)/);
  assert.match(migration, /drop policy if exists "Chat senders can delete media"/);
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
  assert.match(finalizeFunction, /await assessChatImage\(inspectionUrl\.signedUrl\)/);
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
