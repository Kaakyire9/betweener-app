import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { reviewConnectStreamEvidence } from '../scripts/lib/connect-stream-verdict.ts';

function evidence() {
  const saved = JSON.parse(readFileSync(new URL('../docs/betweener-connect/stream-staging-connect-validation.json', import.meta.url), 'utf8'));
  return { ...saved, cases: saved.requests, existingTypesUnchanged: saved.existingTypesUnchangedAfterTests,
    globalChecksEnabled: saved.globalChecksEnabledAfterTests };
}
test('real coordinator evidence passes while ambiguous SFU validation stays blocked', () => {
  const verdict = reviewConnectStreamEvidence(evidence());
  assert.equal(verdict.coordinatorContract, 'PASS');
  assert.equal(verdict.mediaPermissionProof, 'BLOCKED');
  assert.equal(verdict.databaseRevocationToProviderCleanup, 'NOT_TESTED');
  assert.equal(verdict.result, 'BLOCKED');
});
test('invalid-token responses cannot substitute for a real authorization denial', () => {
  const report = evidence();
  Object.assign(report.cases.find((item: { name: string }) => item.name === 'A_arbitrary_create'), { status: 401, code: 42 });
  const verdict = reviewConnectStreamEvidence(report);
  assert.equal(verdict.coordinatorContract, 'FAIL'); assert.equal(verdict.result, 'FAIL');
});
test('an unexpected video capability fails the coordinator contract', () => {
  const report = evidence();
  report.cases.find((item: { name: string }) => item.name === 'control_voice_member_a').capabilities.push('send-video');
  assert.equal(reviewConnectStreamEvidence(report).coordinatorContract, 'FAIL');
});
test('cleanup network errors cannot count as confirmed fixture deletion', () => {
  const report = evidence();
  Object.assign(report.remainingFixtureCalls[0], { exists: null, status: null, code: null });
  assert.equal(reviewConnectStreamEvidence(report).cleanup, 'BLOCKED');
});
