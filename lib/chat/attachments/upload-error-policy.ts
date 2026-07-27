const errorDetails = (error: unknown) => {
  const candidate = error as { message?: unknown; status?: unknown; statusCode?: unknown } | null;
  return {
    message: String(candidate?.message || error || ''),
    status: Number(candidate?.status || candidate?.statusCode || 0),
  };
};

/** Whether a failed upload can safely return to the durable outbox. */
export const isRetryableUploadError = (error: unknown) => {
  const { message: rawMessage, status } = errorDetails(error);
  const message = rawMessage.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('abort') ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
};

/** User-facing attachment failure copy, without exposing provider internals. */
export const getAttachmentUploadErrorMessage = (error: unknown) => {
  const { message: rawMessage } = errorDetails(error);
  const message = rawMessage.toLowerCase();
  if (message.includes('could not be reduced enough') || message.includes('2 minutes or shorter')) {
    return rawMessage;
  }
  if (message.includes('payload too large') || message.includes('entity too large') || message.includes('maximum allowed size')) {
    return 'This file is still too large to send. Try trimming the video or choosing a smaller document.';
  }
  if (message.includes('timeout') || message.includes('network')) {
    return 'The upload timed out. Try again on a stronger connection or send a smaller video.';
  }
  return 'This file could not be sent. Please try again.';
};
