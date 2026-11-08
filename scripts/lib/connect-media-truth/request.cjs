const fs = require('node:fs'); const { createHash } = require('node:crypto');
const { LEGACY, B2, B3, isVersionedProfile, profileForLedger } = require('./profiles.cjs');
const originalHash = '7ba4fb47c2a6008c30a19cd19e5edac35729e7165ba3b406b6d71ff86086f957';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function expectedB2Manifest() {
  // A pinned, immutable template preserves every prior safety/protocol value.
  const bytes = fs.readFileSync(LEGACY.manifestPath);
  if (createHash('sha256').update(bytes).digest('hex') !== originalHash) throw new Error('historical_manifest_changed');
  const value = JSON.parse(bytes);
  value.schemaVersion = 2; value.experimentId = B2.experimentId;
  value.perCall.settings_override.frame_recording.capture_interval_in_seconds = 2;
  value.approval.idPrefix = B2.approvalPrefix;
  value.ownership.callCustomMarker = B2.marker; value.ownership.userPrefix = B2.userPrefix;
  return value;
}
function expectedB3Manifest() {
  const bytes = fs.readFileSync(B2.manifestPath);
  if (createHash('sha256').update(bytes).digest('hex') !== '96f72e25ccff1e5aa9d630ec3cf597103479aceb5ec7d4e91a7afbb30a9da0f1') throw new Error('historical_b2_manifest_changed');
  const value = parseB2Manifest(JSON.parse(bytes));
  value.schemaVersion = 3; value.experimentId = B3.experimentId;
  value.perCall.settings_override.video.target_resolution = { width: 640, height: 480, bitrate: 600000 };
  value.approval.idPrefix = B3.approvalPrefix;
  value.ownership.callCustomMarker = B3.marker; value.ownership.userPrefix = B3.userPrefix;
  return value;
}
function exact(value, expected) {
  if (Array.isArray(expected)) return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => exact(entry, expected[index]));
  if (expected && typeof expected === 'object') return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === Object.keys(expected).length && Object.keys(expected).every((key) => Object.hasOwn(value, key) && exact(value[key], expected[key]));
  return value === expected;
}
function parseB2Manifest(value) {
  // Closed schema: reject unknown/missing keys and all unreviewed value changes, not just bad types.
  if (!exact(value, expectedB2Manifest())) throw new Error('b2_manifest_schema_or_value_invalid');
  return structuredClone(value);
}
function parseB3Manifest(value) {
  if (!exact(value, expectedB3Manifest())) throw new Error('b3_manifest_schema_or_value_invalid');
  return structuredClone(value);
}
const parseVersionedManifest = (value, profile) => profile === B3 ? parseB3Manifest(value) : parseB2Manifest(value);
function syntheticB2Ledger() {
  const marker = '00000000-0000-4000-8000-000000000002';
  return { experimentId: B2.experimentId, callId: '00000000-0000-4000-8000-000000000001', marker,
    users: [`${B2.userPrefix}${marker}_a`, `${B2.userPrefix}${marker}_b`] };
}
function syntheticB3Ledger() {
  const value = syntheticB2Ledger();
  return { ...value, experimentId: B3.experimentId, users: [`${B3.userPrefix}${value.marker}_a`, `${B3.userPrefix}${value.marker}_b`] };
}
function buildCreateRequest(manifest, ledger) {
  const profile = manifest?.experimentId === B3.experimentId || manifest?.schemaVersion === 3 ? B3
    : manifest?.experimentId === B2.experimentId || manifest?.schemaVersion === 2 ? B2 : LEGACY;
  if (profile === LEGACY && manifest?.experimentId !== LEGACY.experimentId) throw new Error('media_truth_request_profile_invalid');
  if (isVersionedProfile(profile)) {
    parseVersionedManifest(manifest, profile);
    if (profileForLedger(ledger) !== profile || !uuid.test(ledger.callId) || !uuid.test(ledger.marker)
      || !Array.isArray(ledger.users) || ledger.users.length !== 2
      || ledger.users.some((id, index) => id !== `${profile.userPrefix}${ledger.marker}_${index ? 'b' : 'a'}`)) throw new Error(`${profile === B3 ? 'b3' : 'b2'}_request_identifiers_invalid`);
  }
  const marker = profile.marker;
  return { ring: manifest.perCall.ring, notify: manifest.perCall.notify, data: {
    created_by_id: ledger.users[0], members: ledger.users.map((user_id) => ({ user_id, role: manifest.roles.memberRole })),
    custom: { [marker]: ledger.marker, media: 'voice' }, settings_override: structuredClone(manifest.perCall.settings_override),
  } };
}
function assertB2Request(request, manifest, ledger) {
  if (!exact(request, buildCreateRequest(parseB2Manifest(manifest), ledger))) throw new Error('b2_request_structure_invalid');
}
function assertB3Request(request, manifest, ledger) {
  if (!exact(request, buildCreateRequest(parseB3Manifest(manifest), ledger))) throw new Error('b3_request_structure_invalid');
}
// Documented numeric constraints supplement TypeScript's unrestricted number type.
// The closed manifest additionally pins the specific reviewed values.
function validateRequestNumbers(request) {
  const settings = request?.data?.settings_override;
  const integer = (value, minimum, maximum) => Number.isInteger(value) && Number.isFinite(value)
    && (minimum === null || value >= minimum) && value <= maximum;
  if (!integer(settings?.limits?.max_participants, 1, Number.MAX_SAFE_INTEGER)
    || !integer(settings?.limits?.max_duration_seconds, 0, Number.MAX_SAFE_INTEGER)
    || !integer(settings?.frame_recording?.capture_interval_in_seconds, 2, 60)
    || !integer(settings?.video?.target_resolution?.width, 240, 3840)
    || !integer(settings?.video?.target_resolution?.height, 240, 3840)
    || !integer(settings?.video?.target_resolution?.bitrate, null, 6000000)) throw new Error('request_numeric_constraint_invalid');
}
module.exports = { expectedB2Manifest, expectedB3Manifest, parseB2Manifest, parseB3Manifest, parseVersionedManifest,
  syntheticB2Ledger, syntheticB3Ledger, buildCreateRequest, assertB2Request, assertB3Request, validateRequestNumbers };
