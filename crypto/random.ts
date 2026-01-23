import * as ExpoCrypto from 'expo-crypto';
import nacl from 'tweetnacl';

const getRandomBytes = (length: number) => {
  const cryptoObj = (globalThis as any)?.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  return ExpoCrypto.getRandomBytes(length);
};

export function ensureRandomSource() {
  nacl.randomBytes = getRandomBytes;
}

export { getRandomBytes };
