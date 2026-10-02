export type ContentSafetyRetryResult = {
  failureReason?: string | null;
};

type ContentSafetyRetryOptions = {
  maxRetries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (event: {
    attempt: number;
    delayMs: number;
    failureReason: string;
  }) => void;
};

const TRANSIENT_FAILURE_SUFFIX = /_(?:TIMEOUT|INVALID_RESPONSE)$/;
const OPENAI_HTTP_FAILURE = /^OPENAI_(?:MODERATION|VISION|TEXT_SAFETY)_HTTP_(\d{3})$/;

export const isTransientContentSafetyFailure = (
  failureReason: string | null | undefined,
): boolean => {
  if (!failureReason) return false;
  if (TRANSIENT_FAILURE_SUFFIX.test(failureReason)) return true;

  const match = OPENAI_HTTP_FAILURE.exec(failureReason);
  if (!match) return false;

  const status = Number(match[1]);
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
};

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export const runWithTransientContentSafetyRetry = async <T extends ContentSafetyRetryResult>(
  operation: (attempt: number) => Promise<T>,
  options: ContentSafetyRetryOptions = {},
): Promise<T> => {
  const maxRetries = Math.max(0, Math.min(2, Math.floor(options.maxRetries ?? 1)));
  const minDelayMs = Math.max(0, Math.floor(options.minDelayMs ?? 250));
  const maxDelayMs = Math.max(minDelayMs, Math.floor(options.maxDelayMs ?? 750));
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  let result = await operation(0);
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    if (!isTransientContentSafetyFailure(result.failureReason)) return result;

    const randomValue = Math.max(0, Math.min(1, random()));
    const delayMs = minDelayMs + Math.floor(randomValue * (maxDelayMs - minDelayMs));
    options.onRetry?.({
      attempt,
      delayMs,
      failureReason: String(result.failureReason),
    });
    await sleep(delayMs);
    result = await operation(attempt);
  }

  return result;
};
