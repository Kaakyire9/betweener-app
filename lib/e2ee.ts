import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEYPAIR_STORAGE_KEY = 'e2ee_keypair_v1';
let prngReady = false;

const ensurePrng = () => {
  if (prngReady) return;
  nacl.setPRNG((x, n) => {
    const bytes = ExpoCrypto.getRandomBytes(n);
    x.set(bytes);
  });
  prngReady = true;
};

export type DeviceKeypair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyB64: string;
  secretKeyB64: string;
};

export type EncryptedMediaPayload = {
  cipherBytes: Uint8Array;
  mediaNonceB64: string;
  keyNonceB64: string;
  encryptedKeySenderB64: string;
  encryptedKeyReceiverB64: string;
};

export const getOrCreateDeviceKeypair = async (): Promise<DeviceKeypair> => {
  ensurePrng();
  const stored = await SecureStore.getItemAsync(KEYPAIR_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const publicKey = decodeBase64(parsed.publicKey);
      const secretKey = decodeBase64(parsed.secretKey);
      return {
        publicKey,
        secretKey,
        publicKeyB64: parsed.publicKey,
        secretKeyB64: parsed.secretKey,
      };
    } catch {
      // Fall through to create a new keypair.
    }
  }

  const keypair = nacl.box.keyPair();
  const publicKeyB64 = encodeBase64(keypair.publicKey);
  const secretKeyB64 = encodeBase64(keypair.secretKey);
  await SecureStore.setItemAsync(
    KEYPAIR_STORAGE_KEY,
    JSON.stringify({ publicKey: publicKeyB64, secretKey: secretKeyB64 })
  );

  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
    publicKeyB64,
    secretKeyB64,
  };
};

export const encryptMediaBytes = async ({
  plainBytes,
  senderKeypair,
  receiverPublicKeyB64,
}: {
  plainBytes: Uint8Array;
  senderKeypair: DeviceKeypair;
  receiverPublicKeyB64: string;
}): Promise<EncryptedMediaPayload> => {
  ensurePrng();
  const mediaKey = ExpoCrypto.getRandomBytes(nacl.secretbox.keyLength);
  const mediaNonce = ExpoCrypto.getRandomBytes(nacl.secretbox.nonceLength);
  const cipherBytes = nacl.secretbox(plainBytes, mediaNonce, mediaKey);

  const keyNonce = ExpoCrypto.getRandomBytes(nacl.box.nonceLength);
  const receiverPublicKey = decodeBase64(receiverPublicKeyB64);
  const encryptedKeyReceiver = nacl.box(
    mediaKey,
    keyNonce,
    receiverPublicKey,
    senderKeypair.secretKey
  );
  const encryptedKeySender = nacl.box(
    mediaKey,
    keyNonce,
    senderKeypair.publicKey,
    senderKeypair.secretKey
  );

  return {
    cipherBytes,
    mediaNonceB64: encodeBase64(mediaNonce),
    keyNonceB64: encodeBase64(keyNonce),
    encryptedKeySenderB64: encodeBase64(encryptedKeySender),
    encryptedKeyReceiverB64: encodeBase64(encryptedKeyReceiver),
  };
};

export const decryptMediaBytes = async ({
  cipherBytes,
  mediaNonceB64,
  keyNonceB64,
  encryptedKeyB64,
  senderPublicKeyB64,
  receiverSecretKeyB64,
}: {
  cipherBytes: Uint8Array;
  mediaNonceB64: string;
  keyNonceB64: string;
  encryptedKeyB64: string;
  senderPublicKeyB64: string;
  receiverSecretKeyB64: string;
}): Promise<Uint8Array | null> => {
  ensurePrng();
  const mediaNonce = decodeBase64(mediaNonceB64);
  const keyNonce = decodeBase64(keyNonceB64);
  const encryptedKey = decodeBase64(encryptedKeyB64);
  const senderPublicKey = decodeBase64(senderPublicKeyB64);
  const receiverSecretKey = decodeBase64(receiverSecretKeyB64);

  const mediaKey = nacl.box.open(encryptedKey, keyNonce, senderPublicKey, receiverSecretKey);
  if (!mediaKey) return null;

  const plainBytes = nacl.secretbox.open(cipherBytes, mediaNonce, mediaKey);
  if (!plainBytes) return null;

  return plainBytes;
};
