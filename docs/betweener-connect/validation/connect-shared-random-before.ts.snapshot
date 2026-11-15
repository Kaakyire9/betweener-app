type SecureFill = (bytes: Uint8Array) => Uint8Array;

/** Never use Expo's development random-bytes fallback for key material. */
export function createSecureCallRandom(fill: SecureFill) {
  if (typeof fill !== 'function') throw Error('connect_random_unavailable');
  return (size: number): Uint8Array => {
    if (!Number.isSafeInteger(size) || size < 1 || size > 1024) throw Error('connect_random_unavailable');
    const bytes = new Uint8Array(size);
    try {
      if (fill(bytes) !== bytes) throw Error('connect_random_unavailable');
      return bytes;
    } catch {
      bytes.fill(0);
      throw Error('connect_random_unavailable');
    }
  };
}
