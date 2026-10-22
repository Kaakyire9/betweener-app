export const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.includes('policy_clearance_required')) {
    return 'Odo is paused by the safety policy. Studio control remains available, but Odo cannot resume until the policy pause is cleared.';
  }
  if (error instanceof Error && error.message.includes('live_studio_step_up_required')) {
    return 'Verify this operator session with your authenticator, then reconnect the Program monitor.';
  }
  if (error instanceof Error && error.message.includes('live_studio_monitor_forbidden')) {
    return 'This account is not assigned read-only Program monitor access for this Live.';
  }
  if (error instanceof Error && error.message.includes('live_studio_media_session_unavailable')) {
    return 'The Program monitor becomes available when this Live enters backstage.';
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

export const friendlyReason = (reason: string): string => reason
  .replace(/^live_/, '')
  .replaceAll('_', ' ')
  .replace(/^./, (character) => character.toUpperCase());
