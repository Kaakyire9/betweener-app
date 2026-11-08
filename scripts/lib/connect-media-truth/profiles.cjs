const path = require('node:path');
/* global __dirname -- CommonJS module. */
const root = path.resolve(__dirname, '../../..');
const LEGACY = Object.freeze({ experimentId: 'connect-m2a-media-truth-21',
  manifestPath: path.join(root, 'docs/betweener-connect/stream-staging-connect-media-truth-proposal.json'),
  readinessPath: path.join(root, 'tmp/connect-media-truth-preparation/readiness.json'),
  executionDirectory: path.join(root, 'tmp/connect-media-truth-execution'),
  marker: 'connect_media_truth_21', userPrefix: 'mt21_' });
const B2 = Object.freeze({ experimentId: 'connect-m2a-media-truth-b2-24',
  manifestPath: path.join(root, 'docs/betweener-connect/stream-staging-connect-media-truth-b2-proposal.json'),
  readinessPath: path.join(root, 'docs/betweener-connect/stream-staging-connect-media-truth-b2-preparation.json'),
  executionDirectory: path.join(root, 'tmp/connect-media-truth-b2-execution'),
  marker: 'connect_media_truth_b2_24', userPrefix: 'mtb2_24_', approvalPrefix: 'media-truth-b2-24-' });
const B3 = Object.freeze({ experimentId: 'connect-m2a-media-truth-b3-28',
  manifestPath: path.join(root, 'docs/betweener-connect/stream-staging-connect-media-truth-b3-proposal.json'),
  readinessPath: path.join(root, 'docs/betweener-connect/stream-staging-connect-media-truth-b3-preparation.json'),
  executionDirectory: path.join(root, 'tmp/connect-media-truth-b3-execution'),
  marker: 'connect_media_truth_b3_28', userPrefix: 'mtb3_28_', approvalPrefix: 'media-truth-b3-28-' });
const profiles = [LEGACY, B2, B3];
const isVersionedProfile = (profile) => profile === B2 || profile === B3;
function profileForManifest(file = LEGACY.manifestPath) {
  const absolute = path.resolve(file);
  const result = profiles.find((profile) => profile.manifestPath === absolute);
  if (!result) throw new Error('media_truth_manifest_path_rejected');
  return result;
}
const profileForLedger = (ledger) => profiles.find((profile) => profile.experimentId === ledger?.experimentId);
module.exports = { LEGACY, B2, B3, isVersionedProfile, profileForManifest, profileForLedger };
