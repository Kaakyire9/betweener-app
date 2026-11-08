const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { LEGACY, B2, isVersionedProfile, profileForManifest, profileForLedger } = require('./profiles.cjs');
const { parseVersionedManifest } = require('./request.cjs');
const manifestPath = LEGACY.manifestPath;
function readManifest(file = manifestPath) {
  const profile = profileForManifest(file); const bytes = fs.readFileSync(profile.manifestPath);
  const value = JSON.parse(bytes); const manifest = isVersionedProfile(profile) ? parseVersionedManifest(value, profile) : value;
  return { manifest, hash: createHash('sha256').update(bytes).digest('hex') };
}
function authorize({ execute, approval, manifest, hash, now = Date.now() }) {
  if (!Number.isFinite(now)) throw new Error('execution_approval_clock_invalid');
  if (execute !== true || approval?.explicitExecutionApproval !== true || approval?.experimentId !== manifest.experimentId
    || approval?.manifestSha256 !== hash || !/^[a-zA-Z0-9_-]{8,100}$/.test(approval?.approvalId ?? '') || !approval?.approvedBy) throw new Error('separate_execution_approval_required');
  const profile = profileForLedger(manifest);
  if (isVersionedProfile(profile)) {
    parseVersionedManifest(manifest, profile);
    if (!approval.approvalId.startsWith(profile.approvalPrefix) || approval.executionCount !== 1 || approval.replacementExperiments !== 0) throw new Error(`${profile === B2 ? 'b2' : 'b3'}_execution_approval_scope_invalid`);
  }
  const start = Date.parse(approval.approvedAt); const end = Date.parse(approval.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > now || end <= now || end - start > manifest.approval.maximumValidityMs) throw new Error('execution_approval_expired_or_invalid');
  return approval;
}
function reserve(directory, approval, manifest, hash) {
  const profile = profileForLedger(manifest);
  if (isVersionedProfile(profile)) {
    parseVersionedManifest(manifest, profile);
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(approval.approvalId) || !approval.approvalId.startsWith(profile.approvalPrefix)) throw new Error(`${profile === B2 ? 'b2' : 'b3'}_execution_approval_scope_invalid`);
  }
  fs.mkdirSync(directory, { recursive: true });
  if (isVersionedProfile(profile)) {
    // A different approval ID cannot allocate a replacement under the same one-call experiment.
    fs.writeFileSync(path.join(directory, 'experiment-once.json'), JSON.stringify({ experimentId: manifest.experimentId,
      manifestSha256: hash, approvalId: approval.approvalId }), { flag: 'wx' });
  }
  const file = path.join(directory, `approval-${approval.approvalId}.json`);
  const identifier = randomUUID(); const now = Date.now();
  const ledger = { version: 1, experimentId: manifest.experimentId, manifestSha256: hash, approvalId: approval.approvalId,
    reservedAt: new Date(now).toISOString(), hardDeadlineUtc: new Date(now + manifest.windowsMs.totalBeforeCleanup).toISOString(),
    callId: randomUUID(), users: [`${manifest.ownership.userPrefix}${identifier}_a`, `${manifest.ownership.userPrefix}${identifier}_b`], marker: identifier,
    preflightAbsent: false, usersAttempted: false, callAttempted: false, cleanup: { errors: [] } };
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2), { flag: 'wx' });
  return { file, ledger, persist: () => {
    fs.writeFileSync(`${file}.next`, JSON.stringify(ledger, null, 2)); fs.renameSync(`${file}.next`, file);
  } };
}
// The factory is not imported or called until authorization succeeds.
async function approvedFactory(options, factory) {
  authorize(options); return factory();
}
module.exports = { readManifest, manifestPath, authorize, reserve, approvedFactory };
