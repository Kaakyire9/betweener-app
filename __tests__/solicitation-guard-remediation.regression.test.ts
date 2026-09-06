import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const profile = read('supabase/functions/_shared/profile-guard-handler.ts');
const attachment = read('supabase/functions/chat-attachment-finalize/index.ts');
const message = read('supabase/functions/private-message-guard-send/index.ts');
const retention = read('supabase/functions/moderation-evidence-retention/index.ts');
const mediaMigration = read('supabase/migrations/20260906100000_immutable_approved_profile_media.sql');
const reviewMigration = read('supabase/migrations/20260906101000_guard_review_cohorts_and_media_captions.sql');
const rateMigration = read('supabase/migrations/20260906102000_content_guard_rate_limits.sql');
const editMigration = read('supabase/migrations/20260906103000_private_message_edit_restrictions.sql');
const mediaPolicyMigration = read('supabase/migrations/20260906104000_chat_media_inspection_policy.sql');
const retentionMigration = read('supabase/migrations/20260906105000_moderation_evidence_retention_markers.sql');
const health = read('supabase/verification/v1.1.1_production_health.sql');

test('profile images are scanned from immutable held bytes and published server-only', () => {
  assert.match(profile, /parsed\.origin !== expectedOrigin/);
  assert.match(profile, /prepareProfileMediaInspection/);
  assert.match(profile, /moderation-quarantine/);
  assert.match(profile, /publishApprovedProfileMedia/);
  assert.match(profile, /moderated-profile-media/);
  assert.match(profile, /priorReview\?\.status === 'APPROVED'/);
  assert.match(profile, /PROFILE_VIDEO_MODERATION_UNAVAILABLE/);
  assert.match(mediaMigration, /no authenticated INSERT\/UPDATE\/DELETE policies/i);
});

test('ordinary chat image reviews bind approval to held bytes', () => {
  assert.match(attachment, /holdChatImage/);
  assert.match(attachment, /restoreApprovedChatImage/);
  assert.match(attachment, /priorReview\?\.status === 'PENDING_REVIEW'/);
  assert.match(attachment, /bucket: hold\.bucket, path: hold\.path/);
  assert.match(attachment, /imageSafety\.decision !== 'ALLOW' \|\| imageSafety\.failureReason/);
});

test('captions and provider calls cannot bypass moderation boundaries', () => {
  assert.match(attachment, /enforceChatCaption/);
  assert.match(reviewMigration, /'chat_caption'/);
  assert.match(reviewMigration, /'text', 'image', 'video', 'document', 'voice', 'audio'/);
  assert.match(message, /rpc_service_consume_content_guard_rate_limit/);
  assert.match(attachment, /rpc_service_consume_content_guard_rate_limit/);
  assert.match(profile, /rpc_service_consume_content_guard_rate_limit/);
  assert.match(rateMigration, /primary key \(user_id, scope\)/);
});

test('review outcomes are cohort-based and message edits re-check restrictions', () => {
  assert.match(reviewMigration, /review_cohort/);
  assert.match(reviewMigration, /review_outcome = 'SUSPENDED'/);
  assert.match(reviewMigration, /review_outcome = 'RESTRICTED'/);
  assert.match(editMigration, /content_safety_actor_state/);
  assert.match(editMigration, /from public\.blocks/);
});

test('moderation evidence retention and final health blockers are explicit', () => {
  assert.match(retention, /MODERATION_RETENTION_SECRET/);
  assert.match(retention, /input\?\.execute === true/);
  assert.match(retention, /dry_run: true/);
  assert.match(retention, /neq\('status', 'PENDING_REVIEW'\)/);
  assert.match(retentionMigration, /evidence_redacted_at/);
  for (const blocker of [
    'migration_release_blockers', 'configuration_release_blockers',
    'moderation_sla_release_blockers', 'receipt_release_blockers',
    'storage_boundary_release_blockers',
  ]) assert.match(health, new RegExp(blocker));
});

test('incomplete video, audio, and document inspection is explicit and server controlled', () => {
  for (const kind of ['video', 'audio', 'document']) assert.match(mediaPolicyMigration, new RegExp(`'${kind}'`));
  assert.match(mediaPolicyMigration, /'REPORT_ONLY'/);
  assert.match(attachment, /resolveLimitedMediaPolicy/);
  assert.match(attachment, /ALLOW_LIMITED_INSPECTION/);
  assert.match(attachment, /attachment_inspection_not_available/);
  assert.match(health, /media_policy_release_blockers/);
});
