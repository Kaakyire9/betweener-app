import { createSecureRandomBytes, type SecureRandomFill } from '../../../lib/crypto/secure-random.ts';

/** Never use Expo's development random-bytes fallback for key material. */
export function createSecureCallRandom(fill: SecureRandomFill) {
  try {
    const random = createSecureRandomBytes(fill);
    return (size: number) => {
      try { return random(size); }
      catch { throw Error('connect_random_unavailable'); }
    };
  } catch { throw Error('connect_random_unavailable'); }
}
