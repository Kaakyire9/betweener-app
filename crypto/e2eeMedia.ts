import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import { ensureRandomSource, getRandomBytes } from './random';

export type EncMetadata = {
  scheme: 'nacl.box';
  sender_ephemeral_pub: string; // Base64
  nonce: string; // Base64 box nonce
  wrapped_key: string; // Base64 ciphertext of file key
  file_key_alg: 'secretbox';
  file_key_nonce: string; // Base64 secretbox nonce
};

export type EncryptResult = {
  ciphertext: Uint8Array;
  metadata: EncMetadata;
};

function toBase64(u8: Uint8Array): string {
  return encodeBase64(u8);
}

function fromBase64(b64: string): Uint8Array {
  return decodeBase64(b64);
}

export function encryptViewOnceMedia(params: {
  plaintext: Uint8Array;
  recipientPublicKey: string; // Base64
}): EncryptResult {
  ensureRandomSource();

  const fileKey = getRandomBytes(nacl.secretbox.keyLength);
  const fileNonce = getRandomBytes(nacl.secretbox.nonceLength);
  const boxNonce = getRandomBytes(nacl.box.nonceLength);

  const recipientKey = fromBase64(params.recipientPublicKey);
  const eph = nacl.box.keyPair();

  const wrappedKey = nacl.box(fileKey, boxNonce, recipientKey, eph.secretKey);
  if (!wrappedKey) {
    throw new Error('wrap_failed');
  }

  const ciphertext = nacl.secretbox(params.plaintext, fileNonce, fileKey);
  fileKey.fill(0); // best-effort wipe

  return {
    ciphertext,
    metadata: {
      scheme: 'nacl.box',
      sender_ephemeral_pub: toBase64(eph.publicKey),
      nonce: toBase64(boxNonce),
      wrapped_key: toBase64(wrappedKey),
      file_key_alg: 'secretbox',
      file_key_nonce: toBase64(fileNonce),
    },
  };
}

export function decryptViewOnceMedia(params: {
  ciphertext: Uint8Array;
  metadata: EncMetadata;
  myPrivateKey: Uint8Array; // raw secret key
}): Uint8Array | null {
  ensureRandomSource();
  const { metadata } = params;
  const ephPub = fromBase64(metadata.sender_ephemeral_pub);
  const boxNonce = fromBase64(metadata.nonce);
  const wrappedKey = fromBase64(metadata.wrapped_key);
  const fileNonce = fromBase64(metadata.file_key_nonce);

  const fileKey = nacl.box.open(wrappedKey, boxNonce, ephPub, params.myPrivateKey);
  if (!fileKey) return null;

  const plaintext = nacl.secretbox.open(params.ciphertext, fileNonce, fileKey);
  fileKey.fill(0);
  return plaintext ?? null;
}
