// Offline evidence review only. Never imports provider credentials or performs IO.
const received = (sample) => sample?.stats?.map((row) => row.receivedAudio?.bytesReceived);
const pair = (rows, predicate) => rows?.length === 2 && rows.every(predicate);
const denied = (row) => row?.status === 403 && row.code === 17;
const valid = (row) => row?.status === 200;
const remainsEnded = (row) => denied(row) || [200, 201].includes(row?.status) && row.ended === true;

function reviewBoundaryEvidence(results, audit) {
  const normal = results?.calls?.find((row) => row.name === 'normal_end');
  const timer = results?.calls?.find((row) => row.name === 'active_timer_with_end_failure');
  const restart = results?.calls?.find((row) => row.name === 'delayed_join_empty_session_restart');
  const endedSamples = (timer?.timerSamples ?? []).filter((row) => row.provider?.ended && pair(received(row), Number.isFinite));
  const first = endedSamples[0];
  const later = endedSamples.find((row) => Date.parse(row.sampledAt) > Date.parse(first.sampledAt)
    && received(row).some((value, index) => value > received(first)[index]));
  const forwarding = later ? {
    firstSampleAt: first.sampledAt, laterSampleAt: later.sampledAt,
    providerEndedAt: first.provider.endedAt, deadline: timer.afterMedia?.session?.timerEndsAt,
    firstBytesReceived: received(first), laterBytesReceived: received(later),
    deltaBytesReceived: received(later).map((value, index) => value - received(first)[index]),
  } : null;
  const normalSamples = normal?.receiveAfterEnd ?? [];
  const base = received(normalSamples[0]); const last = normalSamples.at(-1);
  const normalMediaStopped = normalSamples.length >= 3 && pair(base, (value) => Number.isFinite(value) && value > 0)
    && normalSamples.every((row) => pair(row.stats, (stats) => stats.callEndedObserved)
      && received(row).every((value, index) => value === base[index]))
    && last.stats.every((row, index) => row.bytesSent > normalSamples[0].stats[index].bytesSent);
  const rejoinMatrix = [normal, timer].every((row) => row?.cleanupJobAcknowledged
    && pair(row.heldTokenValidity, valid) && pair(row.newTokenValidity, valid)
    && pair(row.heldRejoins, denied) && pair(row.newTokenRejoins, denied)
    && pair(row.activeExtensionAttempts, denied) && pair(row.extensionAttempts, denied)
    && remainsEnded(row.recreateAttempt) && row.providerAfterAttempts?.ended);
  const restartEstablished = pair(restart?.restartMedia, (row) => row.joinAcknowledged && row.audioStats?.bytesSent > 0)
    && Number.isFinite(Date.parse(restart?.afterRestartMedia?.session?.timerEndsAt));
  const restartStatus = !restartEstablished ? 'INCONCLUSIVE' : Date.parse(restart.afterRestartMedia.session.timerEndsAt)
    > Date.parse(restart.afterMedia.session.timerEndsAt) + 1000 ? 'RESET_OBSERVED' : 'NO_RESET_OBSERVED';
  return {
    controlTimerMarkedEndedBeforeBackendRecovery: timer?.timerEndedBeforeRecovery === true,
    forwardingAfterProviderEnded: forwarding,
    normalEndReceivedAudioStoppedInObservedWindow: !!normalMediaStopped,
    endedCallRejoinMatrix: rejoinMatrix ? 'PASS' : 'BLOCKED',
    emptySessionRestart: restartStatus,
    experimentCompleted: results?.result === 'OBSERVATIONS_RECORDED_POLICY_NOT_APPROVED',
    declarations: {
      CONNECT_CONTROL_PLANE_FAILURE_CLASSIFIED: results?.fault === 'LOCAL_END_PORT_THROW_BEFORE_HTTP' ? 'PASS' : 'BLOCKED',
      // An ended timestamp is insufficient evidence of an enforced media limit.
      CONNECT_SERVER_SESSION_TIMER: forwarding ? 'FAIL' : 'NOT_TESTED',
      CONNECT_ENDED_CALL_REJOIN_DENIAL: rejoinMatrix ? 'PASS' : 'BLOCKED',
      // Missing new observations cannot erase the independently confirmed canonical bypass.
      CONNECT_REVOKED_MEDIA_TERMINATION: 'FAIL',
      CONNECT_POST_REVOCATION_EXPOSURE_BOUND: audit?.durationLimitEnabled === false ? 'UNBOUNDED' : 'UNVERIFIED',
      CONNECT_M2A_SECURITY_GATE: 'BLOCKED', CONNECT_M2B_READY: 'BLOCKED',
    },
  };
}
module.exports = { reviewBoundaryEvidence };
