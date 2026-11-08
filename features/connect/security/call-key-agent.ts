import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import type { AuthenticatedCallKey, CallKeyAgent, EncryptionBinding } from '../experimental/call-encryption.ts';
import { connectUuid } from '../domain/call-navigation.ts';
import { createDeviceKeyStore, encode, fingerprint, fromHex, toHex } from './device-keys.ts';

export interface CallDevice { user_id: string; device_id: string; public_key: string }
export interface KeyEnvelope { user_id: string; device_id: string; nonce: string; ciphertext: string }
export interface CallKeyContext {
  call_id: string; generation: string; media: 'voice' | 'video'; caller_user_id: string; recipient_user_id: string;
  caller_device: string; expires_at: string; devices: CallDevice[]; envelopes: KeyEnvelope[];
}
export interface KeyExchangePort {
  context(callId: string, deviceId: string): Promise<CallKeyContext>;
  publish(callId: string, deviceId: string, generation: string, envelopes: KeyEnvelope[]): Promise<boolean>;
}
/** Server relays authenticated ciphertext only. First-use pins are explicitly
 * unverified identities until people compare the safety code out of band. */
export function createCallKeyAgent(input: {
  userId: string; deviceId: string; authEpoch: string; keys: ReturnType<typeof createDeviceKeyStore>; exchange: KeyExchangePort;
  current(): boolean; random(size: number): Uint8Array; now(): number;
  onSafetyCode?(value: { code: string; peerIdentity: 'unverified' }): void | Promise<void>;
}): CallKeyAgent {
  const inflight = new Map<string, Promise<AuthenticatedCallKey>>();
  const acquire = async (binding: EncryptionBinding): Promise<AuthenticatedCallKey> => {
    if (!input.current() || binding.userId !== input.userId || binding.authEpoch !== input.authEpoch || !binding.authEpoch || !binding.cid.startsWith('betweener_connect:')) throw Error('connect_key_owner_retired');
    const id = binding.cid.slice('betweener_connect:'.length);
    if (!connectUuid(id)) throw Error('connect_key_binding_invalid');
    const context = await input.exchange.context(id, input.deviceId);
    const members = [context.caller_user_id, context.recipient_user_id];
    const expiry = Date.parse(context.expires_at);
    if (!input.current() || context.call_id !== id || !binding.generation || context.generation !== binding.generation
      || new Set(members).size !== 2 || !members.every(connectUuid) || !members.includes(input.userId)
      || [...members].sort().join() !== [...binding.participants].sort().join() || !Number.isFinite(expiry) || expiry <= input.now()
      || !Array.isArray(context.devices) || context.devices.length > 8 || !Array.isArray(context.envelopes)) throw Error('connect_key_binding_invalid');
    const identity = await input.keys.identity(input.userId, input.deviceId);
    try {
      const devices = context.devices;
      if (new Set(devices.map(d => `${d.user_id}:${d.device_id}`)).size !== devices.length
        || devices.some(d => !members.includes(d.user_id) || !connectUuid(d.device_id) || !/^[0-9a-f]{64}$/.test(d.public_key))
        || !devices.some(d => d.user_id === input.userId && d.device_id === input.deviceId && d.public_key === identity.publicKey)) throw Error('connect_key_device_mismatch');
      for (const device of devices) {
        const shared = nacl.scalarMult(identity.secretKey, fromHex(device.public_key, 32));
        try { if (shared.every(byte => byte === 0)) throw Error('connect_key_device_invalid'); } finally { shared.fill(0); }
      }
      const peer = members.find(user => user !== input.userId)!;
      await input.keys.pin(input.userId, peer, devices.filter(d => d.user_id === peer));
      const caller = devices.find(d => d.user_id === context.caller_user_id && d.device_id === context.caller_device);
      if (!caller) throw Error('connect_key_sender_unavailable');
      let envelope = context.envelopes.find(e => e.user_id === input.userId && e.device_id === input.deviceId);
      if (!envelope && input.userId === context.caller_user_id && input.deviceId === context.caller_device) {
        const key = input.random(32);
        try {
          if (key.length !== 32) throw Error('connect_random_unavailable');
          const payload = encode({ version: 1, cid: binding.cid, generation: context.generation, members: [...members].sort(), expiresAt: expiry, key: toHex(key) });
          try {
            const targets = devices.filter(d => d.user_id === peer || (d.user_id === input.userId && d.device_id === input.deviceId));
            const envelopes = targets.map(d => {
              const nonce = input.random(nacl.box.nonceLength);
              if (nonce.length !== nacl.box.nonceLength) throw Error('connect_random_unavailable');
              return { user_id: d.user_id, device_id: d.device_id, nonce: toHex(nonce), ciphertext: toHex(nacl.box(payload, nonce, fromHex(d.public_key, 32), identity.secretKey)) };
            });
            if (!input.current()) throw Error('connect_key_owner_retired');
            const published = await input.exchange.publish(id, input.deviceId, context.generation, envelopes);
            envelope = published ? envelopes.find(e => e.user_id === input.userId && e.device_id === input.deviceId)
              : (await input.exchange.context(id, input.deviceId)).envelopes.find(e => e.user_id === input.userId && e.device_id === input.deviceId);
          } finally { payload.fill(0); }
        } finally { key.fill(0); }
      }
      if (!input.current() || !envelope) throw Error('connect_key_not_ready');
      const clear = nacl.box.open(fromHex(envelope.ciphertext), fromHex(envelope.nonce, 24), fromHex(caller.public_key, 32), identity.secretKey);
      if (!clear) throw Error('connect_key_authentication_failed');
      try {
        const value = JSON.parse(util.encodeUTF8(clear));
        if (!input.current() || value.version !== 1 || value.cid !== binding.cid || value.generation !== context.generation
          || JSON.stringify(value.members) !== JSON.stringify([...members].sort()) || value.expiresAt !== expiry || expiry <= input.now()) throw Error('connect_key_binding_invalid');
        const key = fromHex(value.key, 32);
        // Both peers see the same code, binding this call and every authorized key.
        const digest = fingerprint(['betweener-connect-identity-v1', [...devices].map(d => [d.user_id, d.device_id, d.public_key]).sort()]);
        await input.onSafetyCode?.({ code: digest.slice(0, 60).match(/.{1,4}/g)!.join(' '), peerIdentity: 'unverified' });
        if (!input.current()) { key.fill(0); throw Error('connect_key_owner_retired'); }
        return { ...binding, mode: 'required', epoch: 0, expiresAt: expiry, key: key.buffer as ArrayBuffer };
      } finally { clear.fill(0); }
    } finally { identity.secretKey.fill(0); }
  };
  return { async acquire(binding) {
    // Key bytes belong to one consumer; never share an ArrayBuffer across callers.
    if (inflight.has(binding.cid)) throw Error('connect_key_request_pending');
    const work = acquire(binding); inflight.set(binding.cid, work);
    try { return await work; } finally { if (inflight.get(binding.cid) === work) inflight.delete(binding.cid); }
  } };
}
