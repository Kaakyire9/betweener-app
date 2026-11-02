import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { reviewConnectClosureEvidence, reviewConnectVideoEvidence } from '../scripts/lib/connect-stream-closure-verdict.ts';

const evidence = () => JSON.parse(readFileSync(new URL('../docs/betweener-connect/stream-staging-connect-m2a-closure-evidence.json', import.meta.url), 'utf8'));
test('actual outage bypass reproduction blocks readiness despite proven media restrictions', () => {
  const result = reviewConnectClosureEvidence(evidence());
  assert.equal(result.CONNECT_VOICE_MEDIA_ISOLATION, 'PASS');
  assert.equal(result.CONNECT_SCREENSHARE_DENIAL, 'PASS');
  assert.equal(result.CONNECT_CONSENT_REVOCATION, 'FAIL');
  assert.equal(result.CONNECT_PROVIDER_BYPASS_TESTS, 'FAIL');
  assert.equal(result.CONNECT_M2A_SECURITY_GATE, 'BLOCKED');
});
test('generic SFU validation errors cannot count as a media permission denial', () => {
  const source = evidence();
  source.integrated.activeMediaA.results.find((item: { track: string }) => item.track === 'video').code = 'ERROR_CODE_REQUEST_VALIDATION_FAILED';
  assert.equal(reviewConnectClosureEvidence(source).CONNECT_VOICE_MEDIA_ISOLATION, 'BLOCKED');
});
test('a successful permission-request event is not permission to publish', () => {
  const source = evidence();
  assert.equal(source.coordinator.cases.find((item: { name: string }) => item.name === 'F_request_video').status, 201);
  assert.equal(reviewConnectClosureEvidence(source).CONNECT_PERMISSION_ESCALATION_RESISTANCE, 'PASS');
  source.coordinator.cases.find((item: { name: string }) => item.name === 'F_capabilities_after_request').capabilities.push('send-video');
  assert.equal(reviewConnectClosureEvidence(source).CONNECT_PERMISSION_ESCALATION_RESISTANCE, 'BLOCKED');
});
test('healthy cleanup alone cannot certify outage revocation or authorized VIDEO publication', () => {
  const source = evidence(); delete source.integrated.outageMedia; delete source.video;
  const result = reviewConnectClosureEvidence(source);
  assert.equal(result.CONNECT_CONSENT_REVOCATION, 'BLOCKED');
  assert.equal(result.CONNECT_VIDEO_PERMISSION_ENFORCEMENT, 'BLOCKED');
  assert.equal(result.CONNECT_M2B_REAL_VOICE_TEST_READY, 'BLOCKED');
});
test('a failed media probe cannot certify VIDEO from consent, joining or cleanup alone', () => {
  const attempts = JSON.parse(readFileSync(new URL('../docs/betweener-connect/stream-staging-connect-video-security-evidence.json', import.meta.url), 'utf8'));
  assert.equal(attempts.firstAttempt.cleanup.cleaned, true);
  assert.equal(attempts.firstAttempt.joins[0].status, 201);
  assert.equal(reviewConnectVideoEvidence(attempts.firstAttempt), 'BLOCKED');
  attempts.firstAttempt.result = 'PASS';
  assert.equal(reviewConnectVideoEvidence(attempts.firstAttempt), 'BLOCKED');
});
test('real VIDEO RTP from one participant cannot certify the incomplete VIDEO matrix', () => {
  const attempts = JSON.parse(readFileSync(new URL('../docs/betweener-connect/stream-staging-connect-video-security-evidence.json', import.meta.url), 'utf8'));
  const retry = attempts.diagnosticRetry;
  const partial = retry.attempts[0].media;
  assert.equal(partial.videoStats.connectionState, 'connected');
  assert.ok(partial.videoStats.bytesSent > 0 && partial.videoStats.framesEncoded > 0);
  assert.equal(partial.results.find((row: { track: string }) => row.track === 'screenshare').code, 'ERROR_CODE_PERMISSION_DENIED');
  assert.equal(partial.failedStage, 'audio_remote_answer');
  assert.equal(retry.cleanup.cleaned, true);
  assert.equal(reviewConnectVideoEvidence(retry), 'BLOCKED');
  retry.result = 'PASS'; retry.sessions = [partial, partial];
  assert.equal(reviewConnectVideoEvidence(retry), 'BLOCKED');
});
test('a changed Live policy cannot receive an isolation pass', () => {
  const source = evidence(); source.integrated.cleanup.unchangedCallTypes = false;
  assert.equal(reviewConnectClosureEvidence(source).CONNECT_LIVE_ISOLATION, 'BLOCKED');
});
test('approved real two-person VIDEO evidence passes media policy without waiving revocation', () => {
  const source = evidence();
  assert.equal(source.video.reconciledState, 'ACTIVE');
  assert.equal(reviewConnectVideoEvidence(source.video), 'PASS');
  const result = reviewConnectClosureEvidence(source);
  assert.equal(result.CONNECT_VIDEO_PERMISSION_ENFORCEMENT, 'PASS');
  assert.equal(result.CONNECT_CONSENT_REVOCATION, 'FAIL');
  assert.equal(result.CONNECT_M2A_SECURITY_GATE, 'BLOCKED');
  assert.equal(result.CONNECT_M2B_REAL_VOICE_TEST_READY, 'BLOCKED');
});
test('VIDEO signaling without transport or trusted ACTIVE reconciliation cannot pass', () => {
  for (const missing of ['video', 'audio', 'frames', 'reconcile']) {
    const { video } = evidence();
    if (missing === 'video') video.sessions[0].videoStats.bytesSent = 0;
    if (missing === 'audio') video.sessions[0].audioStats.bytesSent = 0;
    if (missing === 'frames') video.sessions[0].videoStats.framesEncoded = 0;
    if (missing === 'reconcile') video.reconciledState = 'CONNECTING';
    assert.equal(reviewConnectVideoEvidence(video), 'BLOCKED', missing);
  }
});
test('VIDEO screen-share denial requires an explicit provider permission rejection', () => {
  const { video } = evidence();
  video.sessions[1].results.find((row: { track: string }) => row.track === 'screenshare').code = 'ERROR_CODE_REQUEST_VALIDATION_FAILED';
  assert.equal(reviewConnectVideoEvidence(video), 'BLOCKED');
});
test('VIDEO capabilities cannot gain screenshare after privileged-action attempts', () => {
  const { video } = evidence();
  video.privileges.find((row: { name: string }) => row.name === 'capabilities_after_attempts').capabilities.push('screenshare');
  assert.equal(reviewConnectVideoEvidence(video), 'BLOCKED');
});
test('VIDEO policy digest mismatch blocks both media certification and Live isolation', () => {
  const source = evidence(); source.video.cleanup.callTypesAfter = 'f'.repeat(64);
  assert.equal(reviewConnectVideoEvidence(source.video), 'BLOCKED');
  assert.equal(reviewConnectClosureEvidence(source).CONNECT_LIVE_ISOLATION, 'BLOCKED');
});
