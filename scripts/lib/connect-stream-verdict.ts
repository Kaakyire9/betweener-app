// @ts-nocheck -- Shared by the Deno probe and offline evidence review.
/** An executed HTTP request is not automatically a successful security test. */
export function reviewConnectStreamEvidence(report) {
  const expectedSuccess = new Map([
    ['control_invited_read', 200], ['control_voice_member_a', 200], ['control_voice_member_b', 200],
    ['control_voice_join_a', 201], ['control_voice_join_b', 201], ['F_join_with_video_flag', 201],
    ['F_sfu_probe_admission', 201], ['J_valid_live_call_token_control', 200], ['E_held_token_before_provider_cleanup', 201],
  ]);
  const required = ['A_arbitrary_create', 'B_unrelated_read', 'B_unrelated_join', 'D_unmatched_ring_create',
    'D_unrelated_existing_ring', 'control_invited_read', 'control_invited_cannot_join', 'control_voice_member_a',
    'control_voice_member_b', 'control_voice_join_a', 'control_voice_join_b', 'C_add_third_member',
    'F_override_video_setting', 'F_join_with_video_flag', 'F_grant_self_video', 'G_mismatched_query_identity',
    'G_tampered_signed_identity', 'I_self_role_escalation', 'I_update_settings', 'I_end_call', 'I_start_recording',
    'I_start_transcription', 'I_start_broadcasting', 'J_valid_live_call_token_control', 'J_live_call_token_connect_join',
    'J_live_call_token_connect_create', 'E_held_token_before_provider_cleanup', 'E_held_token_after_end_ack',
    'E_held_token_after_membership_removal', 'H_terminal_ringing_rejoin', 'H_terminal_rering'];
  const cases = new Map((report.cases ?? []).map((item) => [item.name, item]));
  const failures = required.filter((name) => {
    const item = cases.get(name); if (!item) return true;
    if (expectedSuccess.has(name)) return item.status !== expectedSuccess.get(name) || item.code !== null;
    if (name === 'G_tampered_signed_identity') return item.status !== 401 || item.code !== 5;
    return item.status !== 403 || item.code !== 17;
  });
  for (const name of ['control_voice_member_a', 'control_voice_member_b', 'F_join_with_video_flag']) {
    const item = cases.get(name);
    if (!item || item.videoEnabled !== false || [...(item.capabilities ?? [])].sort().join(',') !== 'join-call,read-call,send-audio') failures.push(`${name}_capabilities`);
  }
  const sfu = report.sfuProbe;
  const mediaProven = !!sfu?.joinAcknowledged && sfu.results?.some((item) => item.track === 'audio' && item.answerReceived && item.code === null)
    && ['video', 'screenshare'].every((track) => sfu.results?.some((item) => item.track === track && !item.answerReceived
      && ['ERROR_CODE_PERMISSION_DENIED', 403].includes(item.code)));
  const cleanupProven = report.remainingFixtureUsers === 0 && report.remainingFixtureCalls?.length === 4
    && report.remainingFixtureCalls.every((call) => call.exists === false && call.status === 404 && call.code === 16);
  return { coordinatorContract: failures.length ? 'FAIL' : 'PASS', unexpectedResponses: failures,
    mediaPermissionProof: mediaProven ? 'PASS' : 'BLOCKED', revocationEndAck: cases.get('E_held_token_after_end_ack')?.status === 403 ? 'PASS' : 'BLOCKED',
    // This harness does not impersonate a database revocation or attest worker latency.
    databaseRevocationToProviderCleanup: 'NOT_TESTED', cleanup: cleanupProven ? 'PASS' : 'BLOCKED',
    existingTypesUnchanged: report.existingTypesUnchanged === true, globalChecksEnabled: report.globalChecksEnabled === true,
    result: failures.length ? 'FAIL' : 'BLOCKED' };
}
