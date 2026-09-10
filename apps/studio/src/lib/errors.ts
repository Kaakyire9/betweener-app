export const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

export const friendlyReason = (reason: string): string => reason
  .replace(/^live_/, '')
  .replaceAll('_', ' ')
  .replace(/^./, (character) => character.toUpperCase());
