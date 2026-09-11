export const LIVE_MEDIA_ADMISSION_RETRY_DELAYS_MS = [500, 1_200] as const;

type LiveMediaAdmissionRetryOptions = {
  wait?: (delayMs: number) => Promise<void>;
  recoverAuthentication?: () => Promise<boolean>;
};

const admissionErrorCode = (error: unknown): string => (
  error instanceof Error ? error.message : String(error ?? '')
).trim().toLowerCase();

export const requestWithLiveMediaAdmissionRetry = async <T>(
  request: () => Promise<T>,
  options: LiveMediaAdmissionRetryOptions = {},
): Promise<T> => {
  const wait = options.wait ?? ((delayMs: number) => new Promise(
    (resolve) => setTimeout(resolve, delayMs),
  ));
  let temporaryRetry = 0;
  let authenticationRecoveryAttempted = false;

  for (;;) {
    try {
      return await request();
    } catch (error) {
      const code = admissionErrorCode(error);
      if (
        (code === 'unauthorized' || code === 'unauthenticated')
        && options.recoverAuthentication
        && !authenticationRecoveryAttempted
      ) {
        authenticationRecoveryAttempted = true;
        if (await options.recoverAuthentication()) continue;
      }

      const delayMs = LIVE_MEDIA_ADMISSION_RETRY_DELAYS_MS[temporaryRetry];
      if (
        code !== 'live_token_temporarily_unavailable'
        || delayMs === undefined
      ) {
        throw error;
      }
      temporaryRetry += 1;
      await wait(delayMs);
    }
  }
};
