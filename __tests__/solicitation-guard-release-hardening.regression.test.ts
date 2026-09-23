import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('provider outages are operational errors rather than private-message review cases', () => {
  const edge = read('supabase/functions/private-message-guard-send/index.ts');
  assert.match(edge, /MESSAGE_GUARD_UNAVAILABLE/);
  assert.match(edge, /MESSAGE_REPHRASE_REQUIRED/);
  assert.match(edge, /return json\(200, \{\s*ok: false,\s*code: 'MESSAGE_REPHRASE_REQUIRED'/);
  assert.ok(edge.indexOf("assessment.decision === 'REVIEW'") < edge.indexOf('moderationArgs'));
});

test('v1.2 onboarding media uses the guarded staging contract', () => {
  const onboarding = read('components/onboarding/PremiumOnboardingFlow.tsx');
  assert.match(onboarding, /guardAndPublishProfileMediaV1_2/);
  assert.match(onboarding, /isProfileMediaGuardV1_2Runtime/);
  assert.match(onboarding, /profileMediaGuardMessageV1_2/);
  assert.match(onboarding, /currentStep\.key === "photo" && !await approveCurrentPhoto\(\)/);
  assert.match(onboarding, /approvedAvatar\?\.localUri === image/);
  const photoGate = onboarding.indexOf('await approveCurrentPhoto()');
  assert.ok(photoGate < onboarding.indexOf('setStepIndex((value) => Math.min(value + 1', photoGate));
});

test('public UGC reports snapshot server-owned evidence', () => {
  const migration = read('supabase/migrations/20260915122000_public_ugc_reporting_v1.sql');
  const moments = read('components/MomentViewer.tsx');
  const pulse = read('components/circles/CirclePulseBoard.tsx');
  assert.match(migration, /rpc_submit_ugc_content_report_v1/);
  assert.match(migration, /v_snapshot/);
  assert.ok(migration.indexOf('then p_client_evidence') < migration.indexOf("v_snapshot || jsonb_build_object('source', 'public_ugc_report')"));
  assert.match(moments, /Report this Moment/);
  assert.match(pulse, /Report \$\{itemLabel\}/);
});

test('unsupported v1.2 byte types are disabled until real inspection exists', () => {
  const capabilities = read('lib/safety/media-moderation-capabilities.ts');
  const chat = read('components/chat/ChatScreen.tsx');
  assert.match(capabilities, /chatVideoUploads: !hardenedRuntime/);
  assert.match(capabilities, /chatDocumentUploads: !hardenedRuntime/);
  assert.match(chat, /Video sharing is temporarily paused/);
  assert.match(chat, /File sharing is temporarily paused/);
});

test('known illegal media hashes are checked in chat and profile pipelines', () => {
  const migration = read('supabase/migrations/20260915123000_unsafe_media_hash_blocklist.sql');
  const chat = read('supabase/functions/chat-attachment-finalize/index.ts');
  const profile = read('supabase/functions/profile-media-guard-v1-2/index.ts');
  assert.match(migration, /unsafe_media_hash_blocklist/);
  assert.match(chat, /rpc_service_match_unsafe_media_hash/);
  assert.match(profile, /rpc_service_match_unsafe_media_hash/);
});

test('moderation evidence retention is scheduled, exclusive, and observable', () => {
  const migration = read('supabase/migrations/20260915125000_moderation_evidence_retention_worker.sql');
  const controls = read('supabase/migrations/20260915130000_moderation_evidence_retention_controls.sql');
  const worker = read('supabase/functions/moderation-evidence-retention/index.ts');
  const config = read('supabase/config.toml');
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /evidence_retention_attempts < 8/);
  assert.match(migration, /moderation_evidence_retention_runs/);
  assert.match(migration, /configure_moderation_evidence_retention_worker/);
  assert.match(controls, /disable_moderation_evidence_retention_worker/);
  assert.match(worker, /rpc_service_claim_moderation_evidence_retention/);
  assert.match(worker, /dead_letter/);
  assert.match(config, /\[functions\.moderation-evidence-retention\][\s\S]*verify_jwt = false/);
});

test('the Trust Center exposes published child-safety standards and contact', () => {
  const links = read('lib/trust-links.ts');
  const trustCenter = read('app/trust-center.tsx');
  const standards = read('docs/safety/public-child-safety-standards.md');
  assert.match(links, /childSafety:.*\/child-safety/);
  assert.match(trustCenter, /Child Safety Standards/);
  assert.match(trustCenter, /Urgent child-safety concern/);
  assert.match(standards, /zero tolerance for child sexual abuse and exploitation/);
});

test('v1.2 profile writes require semantic review without changing the legacy contract', () => {
  const handler = read('supabase/functions/_shared/profile-guard-handler.ts');
  const payload = read('lib/profile-guard/write-payload.ts');
  assert.match(payload, /PROFILE_GUARD_SAFETY_CONTRACT_V1_2 = '1\.2\.0'/);
  assert.match(payload, /safety_contract_version: PROFILE_GUARD_SAFETY_CONTRACT_V1_2/);
  assert.match(handler, /hardenedSafetyContract = body\?\.safety_contract_version === '1\.2\.0'/);
  assert.match(handler, /hardenedSafetyContract[\s\S]*semanticEnabled: true/);
  assert.match(handler, /semanticConfig\.semanticEnabled && !environmentSemanticEnabled/);
});

test('legacy profile media has a resumable service-only remediation worker', () => {
  const migration = read('supabase/migrations/20260921122000_legacy_profile_media_remediation.sql');
  const worker = read('supabase/functions/profile-media-remediation-v1-2/index.ts');
  const config = read('supabase/config.toml');
  assert.match(migration, /profile_media_remediation_jobs/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /needs_source_cleanup/);
  assert.match(migration, /rpc_service_claim_profile_media_remediation/);
  assert.match(migration, /rpc_service_resolve_profile_media_remediation/);
  assert.match(worker, /rpc_service_match_unsafe_media_hash/);
  assert.match(worker, /classifyProfileMediaV1_2/);
  assert.match(worker, /rpc_service_record_content_moderation_event/);
  assert.match(worker, /job\.needs_source_cleanup === true/);
  assert.match(config, /\[functions\.profile-media-remediation-v1-2\][\s\S]*verify_jwt = false/);
});

test('actor enforcement is weighted, rolling, and reversible after appeal', () => {
  const migration = read('supabase/migrations/20260921121000_content_safety_weighted_enforcement.sql');
  assert.match(migration, /enforcement_points_30d/);
  assert.match(migration, /interval '30 days'/);
  assert.match(migration, /known_illegal_media', 'csam'[\s\S]*then 10/);
  assert.match(migration, /p_status = 'APPROVED'.*then 0/);
  assert.match(migration, /rpc_admin_reverse_content_moderation_event/);
  assert.match(migration, /recalculate_content_safety_actor_state_on_event/);
});

test('moderated chat publication is provenance-bound instead of trusting service ownership', () => {
  const migration = read('supabase/migrations/20260921123000_chat_media_publication_provenance.sql');
  const finalize = read('supabase/functions/chat-attachment-finalize/index.ts');
  const health = read('supabase/verification/v1.2.0_solicitation_guard_health.sql');
  assert.match(migration, /approved_chat_media_objects/);
  assert.match(migration, /unique \(sender_id, client_message_id, attachment_id, variant\)/);
  assert.match(migration, /grant execute on function public\.rpc_service_register_approved_chat_media[\s\S]*to service_role/);
  assert.match(finalize, /p_variant: preview \? 'preview' : 'original'/);
  assert.match(health, /chat media publication provenance/);
  assert.match(health, /chat_media_provenance_registry_private/);
});
