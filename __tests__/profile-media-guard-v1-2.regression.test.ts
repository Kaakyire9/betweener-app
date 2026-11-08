import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const appConfig = JSON.parse(read('app.json'));
const client = read('lib/profile/profile-media-guard-v1-2.ts');
const queue = read('lib/offline/mutation-queue.ts');
const modal = read('components/ProfileEditModal.tsx');
const edge = read('supabase/functions/profile-media-guard-v1-2/index.ts');
const policy = read('supabase/functions/_shared/profile-media-policy-v1-2.ts');
const migration = read('supabase/migrations/20260915120000_profile_media_guard_v1_2.sql');

test('the 1.2 media contract cannot be delivered to the 1.1.1 runtime', () => {
  assert.deepEqual(appConfig.expo.runtimeVersion, { policy: 'appVersion' });
  assert.equal(appConfig.expo.version, '1.2.0');
  assert.match(client, /major === 1 && minor >= 2/);
  assert.match(client, /PROFILE_MEDIA_CONTRACT_VERSION_MISMATCH/);
  assert.match(edge, /body\.contractVersion !== CONTRACT_VERSION/);
});

test('the migration is additive and leaves the 1.1.1 write contract untouched', () => {
  assert.doesNotMatch(migration, /create or replace function public\.profile_guard_prevent_direct_public_text_write/i);
  assert.doesNotMatch(migration, /create or replace function public\.rpc_service_update_profile_with_guard/i);
  assert.doesNotMatch(migration, /profile-photos/i);
  assert.match(migration, /No authenticated UPDATE policy/);
  assert.match(migration, /revoke all on function public\.rpc_service_apply_profile_media_v1_2[\s\S]*authenticated/i);
});

test('new avatar and gallery bytes use private immutable staging and service publication', () => {
  assert.match(client, /profile-media-staging-v1-2/);
  assert.match(client, /upsert: false/);
  assert.match(edge, /sniffMime\(bytes\)/);
  assert.match(edge, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(edge, /moderation-quarantine/);
  assert.match(edge, /moderated-profile-media/);
  assert.match(edge, /rpc_service_apply_profile_media_v1_2/);
  assert.match(queue, /guardAndPublishProfileMediaV1_2/);
});

test('v1.2 normalizes every local profile image before moderation upload', () => {
  assert.match(client, /PROFILE_MEDIA_MAX_EDGE = 1280/);
  assert.match(client, /PROFILE_MEDIA_JPEG_QUALITY = 0\.82/);
  assert.match(client, /await prepareLocalProfileMedia\(item\)/);
  assert.match(client, /longestEdge > PROFILE_MEDIA_MAX_EDGE/);
  assert.match(client, /format: SaveFormat\.JPEG/);
  assert.match(client, /localUri: preparedItem\.localUri/);
  assert.match(client, /contentType: preparedItem\.contentType/);
});

test('provider scan derivatives are bounded without changing hash or publication bytes', () => {
  assert.match(edge, /POLICY_SCAN_MAX_EDGE = 1024/);
  assert.match(edge, /createSignedUrl\(media\.quarantinePath, 300/);
  assert.match(edge, /transform:/);
  assert.match(edge, /const sha256 = await sha256Hex\(bytes\)/);
  assert.match(edge, /capturedBytes: media\.bytes/);
});

test('avatar and gallery policies reject immediately without creating an admin queue', () => {
  assert.match(policy, /exactly one clearly visible human face/);
  assert.match(policy, /gallery image does not need to show a face/);
  assert.match(policy, /explicit nudity/);
  assert.match(policy, /Ordinary incidental writing and clothing logos/);
  assert.match(policy, /visible_contact_information/);
  assert.match(policy, /qr_present only reports that a QR exists/);
  assert.match(policy, /combineProfileMediaEvidence/);
  assert.match(edge, /PROFILE_MEDIA_REPLACE_REQUIRED/);
  assert.match(edge, /provider_veto_suppressed/);
  assert.match(edge, /profile_policy_and_ocr/);
  assert.doesNotMatch(edge, /PENDING_REVIEW|admin_queue_item/);
  assert.match(modal, /profileMediaGuardMessageV1_2/);
  assert.match(modal, /publishedMedia = await syncProfileMediaNow/);
});

test('provider failures preserve the existing profile and are retryable', () => {
  assert.match(edge, /PROFILE_MEDIA_SCAN_UNAVAILABLE/);
  assert.match(edge, /await cleanup\(true\)/);
  assert.match(edge, /RETRY_LATER/);
  const applyIndex = edge.indexOf("rpc_service_apply_profile_media_v1_2");
  const scanIndex = edge.indexOf('classifyProfileMediaV1_2');
  assert.ok(applyIndex > scanIndex, 'publication must happen only after scanning');
  assert.match(client, /Your existing photos are unchanged/);
});

test('known malicious QR payloads skip policy inference but retain mandatory harm scanning', () => {
  const qrPolicyIndex = edge.indexOf("const qrTextPolicy = assessMediaExtractedText");
  const providerIndex = edge.indexOf('const providerStartedAt = Date.now()');
  assert.ok(qrPolicyIndex > 0);
  assert.ok(providerIndex > qrPolicyIndex);
  assert.match(edge, /provider_model: 'qr-contact-v1'/);
  assert.match(edge, /profile_policy_skipped: true/);
  assert.match(edge, /profilePolicySkipped: true/);
  assert.match(edge, /const harm = await moderateWithOpenAI/);
});
