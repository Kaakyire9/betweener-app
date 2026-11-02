const assert = require('node:assert/strict');
const test = require('node:test');
const receipt = require('../docs/betweener-connect/stream-staging-connect-revocation-boundary-evidence.json');
const { reviewBoundaryEvidence } = require('../scripts/lib/connect-revocation-boundary-verdict.cjs');
const fixture = () => structuredClone(receipt.experiment.results);
const review = (evidence) => reviewBoundaryEvidence(evidence, receipt.readOnlyProvider);

test('actual received audio after provider ended prevents timer security approval', () => {
  const result = review(fixture());
  assert.equal(result.controlTimerMarkedEndedBeforeBackendRecovery, true);
  assert.deepEqual(result.forwardingAfterProviderEnded.deltaBytesReceived, [25956, 26208]);
  assert.equal(result.declarations.CONNECT_SERVER_SESSION_TIMER, 'FAIL');
  assert.equal(result.declarations.CONNECT_REVOKED_MEDIA_TERMINATION, 'FAIL');
  assert.equal(result.declarations.CONNECT_M2A_SECURITY_GATE, 'BLOCKED');
  assert.equal(result.declarations.CONNECT_M2B_READY, 'BLOCKED');
});

test('metadata and outbound RTP cannot substitute for received-media enforcement evidence', () => {
  const evidence = fixture(); evidence.result = 'PASS';
  for (const sample of evidence.calls[1].timerSamples) for (const stats of sample.stats) delete stats.receivedAudio;
  const result = review(evidence);
  assert.equal(result.controlTimerMarkedEndedBeforeBackendRecovery, true);
  assert.equal(result.forwardingAfterProviderEnded, null);
  assert.equal(result.declarations.CONNECT_SERVER_SESSION_TIMER, 'NOT_TESTED');
  assert.equal(result.declarations.CONNECT_REVOKED_MEDIA_TERMINATION, 'FAIL');
  assert.equal(result.declarations.CONNECT_M2A_SECURITY_GATE, 'BLOCKED');
});

test('failed SFU reconnect is inconclusive despite the historical false reset flag', () => {
  const evidence = fixture(); assert.equal(evidence.calls[2].timerResetObserved, false);
  assert.ok(evidence.calls[2].restartMedia.every((row) => !row.joinAcknowledged && row.failure));
  assert.equal(review(evidence).emptySessionRestart, 'INCONCLUSIVE');
  assert.equal(review(evidence).experimentCompleted, false);
});

test('ended-call checks need valid held/new JWT controls and a call that stays ended after get-or-create', () => {
  const evidence = fixture(); assert.equal(evidence.calls[0].recreateAttempt.status, 201);
  assert.equal(review(evidence).endedCallRejoinMatrix, 'PASS');
  evidence.calls[0].heldTokenValidity[0].status = 401;
  assert.equal(review(evidence).endedCallRejoinMatrix, 'BLOCKED');
  const fresh = fixture(); fresh.calls[1].newTokenValidity = [];
  assert.equal(review(fresh).endedCallRejoinMatrix, 'BLOCKED');
  const recreated = fixture(); recreated.calls[0].recreateAttempt.ended = false;
  assert.equal(review(recreated).endedCallRejoinMatrix, 'BLOCKED');
});

test('normal end observation proves receive counters stopped while raw publishers continued sending', () => {
  assert.equal(review(fixture()).normalEndReceivedAudioStoppedInObservedWindow, true);
  const evidence = fixture();
  for (const sample of evidence.calls[0].receiveAfterEnd) for (const stats of sample.stats) stats.receivedAudio.bytesReceived = 0;
  assert.equal(review(evidence).normalEndReceivedAudioStoppedInObservedWindow, false);
});
