export const LIVE_MEDIA_ADMISSION_RETRY_DELAYS_MS = [500, 1_200] as const;

const admissionErrorCode = (error: unknown): string => (
  error instanceof Error ? error.message : String(error ?? '')
).trim().toLowerCase();

export const requestWithLiveMediaAdmissionRetry = async <T>(
  request: () => Promise<T>,
  wait: (delayMs: number) => Promise<void> = (delayMs) => new Promise(
    (resolve) => setTimeout(resolve, delayMs),
  ),
): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      const delayMs = LIVE_MEDIA_ADMISSION_RETRY_DELAYS_MS[attempt];
      if (
        admissionErrorCode(error) !== 'live_token_temporarily_unavailable'
        || delayMs === undefined
      ) {
        throw error;
      }
      await wait(delayMs);
    }
  }
};
