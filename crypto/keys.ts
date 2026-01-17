import { supabase } from '@/lib/supabase';
import * as Random from 'expo-random';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

const PRIVATE_KEY_KEY = 'e2ee_identity_private_v1';
const PUBLIC_KEY_KEY = 'e2ee_identity_public_v1';

let randomReady = false;

function ensureRandomSource() {
  if (randomReady) return;
  // tweetnacl expects a secure RNG; expo-random provides native entropy.
  nacl.randomBytes = (length: number) => Random.getRandomBytes(length);
  randomReady = true;
}

function base64ToUint8(base64: string): Uint8Array {
  return decodeBase64(base64);
}

function uint8ToBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes);
}

async function storeString(key: string, value: string) {
  await SecureStore.setItemAsync(key, value, {
    keychainService: key,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export type IdentityKeys = {
  publicKey: string; // Base64
  privateKey: Uint8Array;
};

export async function ensureIdentityKeypair(): Promise<IdentityKeys> {
  ensureRandomSource();
  const existingPrivate = await SecureStore.getItemAsync(PRIVATE_KEY_KEY);
  const existingPublic = await SecureStore.getItemAsync(PUBLIC_KEY_KEY);

  if (existingPrivate && existingPublic) {
    return {
      privateKey: base64ToUint8(existingPrivate),
      publicKey: existingPublic,
    };
  }

  if (existingPrivate && !existingPublic) {
    const secret = base64ToUint8(existingPrivate);
    const derived = nacl.box.keyPair.fromSecretKey(secret);
    const pubB64 = uint8ToBase64(derived.publicKey);
    await storeString(PUBLIC_KEY_KEY, pubB64);
    return { privateKey: secret, publicKey: pubB64 };
  }

  const keypair = nacl.box.keyPair();
  const privateB64 = uint8ToBase64(keypair.secretKey);
  const publicB64 = uint8ToBase64(keypair.publicKey);
  await storeString(PRIVATE_KEY_KEY, privateB64);
  await storeString(PUBLIC_KEY_KEY, publicB64);
  return { privateKey: keypair.secretKey, publicKey: publicB64 };
}

export async function getMyPrivateKey(): Promise<Uint8Array | null> {
  const value = await SecureStore.getItemAsync(PRIVATE_KEY_KEY);
  if (!value) return null;
  return base64ToUint8(value);
}

export async function getMyPublicKey(): Promise<string | null> {
  const value = await SecureStore.getItemAsync(PUBLIC_KEY_KEY);
  if (value) return value;
  const priv = await getMyPrivateKey();
  if (!priv) return null;
  const derived = nacl.box.keyPair.fromSecretKey(priv).publicKey;
  const pubB64 = uint8ToBase64(derived);
  await storeString(PUBLIC_KEY_KEY, pubB64);
  return pubB64;
}

export async function fetchUserPublicKey(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('public_key')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.log('[e2ee] fetchUserPublicKey error', error);
    return null;
  }
  return (data as { public_key?: string | null })?.public_key ?? null;
}

export async function syncPublicKeyIfMissing(userId: string) {
  if (!userId) return;
  const keys = await ensureIdentityKeypair();
  const { data, error } = await supabase
    .from('profiles')
    .select('public_key')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.log('[e2ee] sync public key fetch error', error);
    return;
  }

  const current = (data as { public_key?: string | null })?.public_key ?? null;
  if (current === keys.publicKey) return;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ public_key: keys.publicKey })
    .eq('user_id', userId);

  if (updateError) {
    console.log('[e2ee] sync public key update error', updateError);
  }
}
