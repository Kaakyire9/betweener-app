export const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.includes('policy_clearance_required')) {
    return 'Odo is paused by the safety policy. Studio control remains available, but Odo cannot resume until the policy pause is cleared.';
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

export const friendlyReason = (reason: string): string => reason
  .replace(/^live_/, '')
  .replaceAll('_', ' ')
  .replace(/^./, (character) => character.toUpperCase());
