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
