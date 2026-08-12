/**
 * Lets UI proceed when best-effort local persistence is slow, while retaining
 * the operation promise for callers that need observability.
 */
export const withLocalOperationTimeout = async <T,>(
  task: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<{ value: T; timedOut: boolean }> => {
  let timedOut = false;
  const timeoutTask = new Promise<T>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve(fallback);
    }, timeoutMs);
  });
  const value = await Promise.race([task, timeoutTask]);
  return { value, timedOut };
};
