type QueueMutationFailure = {
  kind?: string;
  lastError?: unknown;
  failureReason?: unknown;
};

export const isDatingNotEligibleError = (error: unknown) => {
  const code = String((error as { code?: unknown } | null)?.code || '').toLowerCase();
  const message = String(
    (error as { message?: unknown } | null)?.message || error || '',
  ).toLowerCase();

  return (
    message.includes('dating_not_eligible') &&
    (code === 'p0001' || message.includes('p0001'))
  );
};

export const isTerminalDatingEligibilityMutation = (
  mutation: QueueMutationFailure,
) => {
  if (mutation.kind !== 'swipe_sync' && mutation.kind !== 'intent_request_create') {
    return false;
  }

  return isDatingNotEligibleError(mutation.failureReason || mutation.lastError);
};
