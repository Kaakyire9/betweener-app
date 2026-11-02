// @ts-nocheck -- Offline review only; never imports a provider SDK or secrets.
import { assertConnectSessionSettings } from '../../supabase/functions/_shared/connect-stream-adapter.ts';

const videoFixtureCleaned = (video) => video?.cleanup?.cleaned === true && video.cleanup.usersRemaining === 0
  && video.cleanup.calls?.length === 1 && video.cleanup.calls.every((row) => row.status === 404 && row.code === 16)
  && video.cleanup.unchangedCallTypes === true && /^[0-9a-f]{64}$/.test(video.cleanup.callTypesBefore)
  && video.cleanup.callTypesBefore === video.cleanup.callTypesAfter;

export function reviewConnectVideoEvidence(video) {
  const allowed = 'join-call,read-call,send-audio,send-video';
  const permissions = new Map((video?.privileges ?? []).map((row) => [row.name, row]));
  const forbidden = ['add_third_member', 'self_admin_role', 'grant_screenshare', 'enable_screenshare',
    'start_recording', 'start_transcription', 'start_broadcasting', 'end_call'];
  let safeSettings = false;
  try { assertConnectSessionSettings(video?.acceptedPolicy?.settings, 'video'); safeSettings = true; } catch { /* incomplete or unsafe receipt */ }
  const videoProven = video?.sessions?.length === 2 && video.sessions.every((session) => session.joinAcknowledged === true
    && session.videoStats?.connectionState === 'connected' && session.videoStats.bytesSent > 0
    && session.videoStats.packetsSent > 0 && session.videoStats.framesEncoded > 0
    && session.audioStats?.connectionState === 'connected' && session.audioStats.bytesSent > 0
    && ['video', 'audio'].every((track) => session.results?.some((row) => row.track === track && row.answerReceived && row.code === null))
    && session.results?.some((row) => row.track === 'screenshare' && row.code === 'ERROR_CODE_PERMISSION_DENIED' && !row.answerReceived));
  const exactCapabilities = (value) => value?.slice().sort().join(',') === allowed;
  return video?.result === 'PASS' && videoProven && safeSettings && video?.consent?.independentRecipientVideo === true
    && video.consent.voiceGrantDenied === true && video.consent.state === 'ACCEPTED' && video.reconciledState === 'ACTIVE'
    && video.joins?.length === 2 && video.joins.every((row) => row.status === 201 && exactCapabilities(row.capabilities))
    && forbidden.every((name) => permissions.get(name)?.status === 403 && permissions.get(name)?.code === 17)
    && exactCapabilities(permissions.get('capabilities_after_attempts')?.capabilities)
    && video.invitedPolicy?.members?.length === 2 && video.invitedPolicy.members.every((row) => row.role === 'connect_invited')
    && video.acceptedPolicy?.members?.length === 2 && video.acceptedPolicy.members.every((row) => row.role === 'connect_video')
    && video.acceptedPolicy.userRoles?.length === 3 && video.acceptedPolicy.userRoles.every((row) => row.role === 'user')
    && video.providerPolicyWrites === 0 && video.sharedDatabaseModified === false
    && videoFixtureCleaned(video) ? 'PASS' : 'BLOCKED';
}

export function reviewConnectClosureEvidence(evidence) {
  const integration = evidence.integrated;
  const sessions = [integration?.activeMediaA, integration?.activeMediaB];
  const mediaProven = sessions.every((session) => session?.joinAcknowledged && session.audioStats?.connectionState === 'connected'
    && session.audioStats.bytesSent > 0 && ['video', 'screenshare'].every((track) => session.results?.some((item) =>
      item.track === track && item.code === 'ERROR_CODE_PERMISSION_DENIED' && item.answerReceived === false)));
  const rows = new Map((evidence.coordinator?.cases ?? []).map((item) => [item.name, item]));
  const forbidden = ['C_add_third_member', 'F_override_video_setting', 'F_grant_self_video', 'I_self_role_escalation',
    'I_update_settings', 'I_end_call', 'I_start_recording', 'I_start_transcription', 'I_start_broadcasting'];
  const protectedPermissions = forbidden.every((name) => rows.get(name)?.status === 403 && rows.get(name)?.code === 17)
    && rows.get('F_capabilities_after_request')?.capabilities?.slice().sort().join(',') === 'join-call,read-call,send-audio';
  const bypassObserved = integration?.outageJoin?.status === 201 && integration?.outageMedia?.joinAcknowledged === true
    && integration.outageMedia.audioStats?.connectionState === 'connected' && integration.outageMedia.audioStats.bytesSent > 0
    && integration.outageMedia.results?.some((item) => item.track === 'audio' && item.answerReceived && item.code === null);
  const cleanup = integration?.cleanup?.cleaned === true && evidence.coordinator?.remainingFixtureUsers === 0
    && evidence.coordinator?.remainingFixtureCalls?.every((item) => item.status === 404 && item.code === 16);
  return {
    CONNECT_VOICE_MEDIA_ISOLATION: mediaProven ? 'PASS' : 'BLOCKED',
    CONNECT_VIDEO_PERMISSION_ENFORCEMENT: mediaProven ? reviewConnectVideoEvidence(evidence.video) : 'BLOCKED',
    CONNECT_SCREENSHARE_DENIAL: mediaProven ? 'PASS' : 'BLOCKED',
    CONNECT_PERMISSION_ESCALATION_RESISTANCE: protectedPermissions ? 'PASS' : 'BLOCKED',
    CONNECT_CONSENT_REVOCATION: bypassObserved ? 'FAIL' : 'BLOCKED',
    CONNECT_PROVIDER_BYPASS_TESTS: bypassObserved ? 'FAIL' : 'BLOCKED',
    CONNECT_LIVE_ISOLATION: cleanup && integration.cleanup.unchangedCallTypes === true
      && evidence.coordinator.existingTypesUnchanged === true && evidence.liveBaselineUnchanged === true
      && (!evidence.video || videoFixtureCleaned(evidence.video)) ? 'PASS' : 'BLOCKED',
    CONNECT_M2A_SECURITY_GATE: 'BLOCKED', CONNECT_M2B_REAL_VOICE_TEST_READY: 'BLOCKED',
  };
}
