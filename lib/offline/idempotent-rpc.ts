export const isMissingIdempotentRpc = (error: unknown) => {
  const code = String((error as { code?: unknown } | null)?.code || '').toUpperCase();
  const message = String(
    (error as { message?: unknown } | null)?.message || error || '',
  ).toLowerCase();
  return (
    code === 'PGRST202' ||
    message.includes('schema cache') ||
    message.includes('could not find the function')
  );
};
