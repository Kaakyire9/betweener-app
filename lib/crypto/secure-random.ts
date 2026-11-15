export type SecureRandomFill = (bytes: Uint8Array) => Uint8Array;

/** Fill through an explicitly supplied native CSPRNG; never synthesize entropy. */
export function createSecureRandomBytes(fill: SecureRandomFill) {
  if (typeof fill !== 'function') throw Error('secure_random_unavailable');
  return (size: number): Uint8Array => {
    if (!Number.isSafeInteger(size) || size < 1 || size > 1024) throw Error('secure_random_unavailable');
    const bytes = new Uint8Array(size);
    try {
      if (fill(bytes) !== bytes) throw Error('secure_random_unavailable');
      return bytes;
    } catch {
      bytes.fill(0);
      throw Error('secure_random_unavailable');
    }
  };
}
