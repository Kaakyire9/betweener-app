import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export function fromHex(value: string, length?: number): Uint8Array {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(value) || (length !== undefined && value.length !== length * 2)) throw Error('connect_key_invalid');
  return Uint8Array.from(value.match(/../g)!, byte => parseInt(byte, 16));
}
export const encode = (value: unknown) => util.decodeUTF8(JSON.stringify(value));
export const fingerprint = (value: unknown): string => toHex(nacl.hash(encode(value)));
export interface DeviceIdentity { publicKey: string; secretKey: Uint8Array }
export interface KeyStorage { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Separate account AND installation keys. Never reuse chat's installation-wide key. */
export function createDeviceKeyStore(storage: KeyStorage, random: (size: number) => Uint8Array) {
  const pending = new Map<string, Promise<void>>();
  const pins = new Map<string, Promise<string>>();
  return {
    async identity(userId: string, deviceId: string): Promise<DeviceIdentity> {
      if (!uuid.test(userId) || !uuid.test(deviceId)) throw Error('connect_key_identity_invalid');
      const name = `connect.e2ee.v1.${userId}.${deviceId}`;
      let creation = pending.get(name);
      if (!creation) {
        creation = (async () => {
          if (await storage.get(name)) return;
          const bytes = random(32);
          try { if (bytes.length !== 32) throw Error('connect_random_unavailable'); await storage.set(name, toHex(bytes)); }
          finally { bytes.fill(0); }
        })();
        pending.set(name, creation);
        void creation.catch(() => { if (pending.get(name) === creation) pending.delete(name); });
      }
      await creation;
      const secretKey = fromHex((await storage.get(name)) ?? '', 32);
      return { publicKey: toHex(nacl.scalarMult.base(secretKey)), secretKey };
    },
    async pin(userId: string, peerId: string, keys: readonly { device_id: string; public_key: string }[]) {
      if (!uuid.test(userId) || !uuid.test(peerId) || userId === peerId || keys.length < 1 || keys.length > 4) throw Error('connect_key_identity_invalid');
      const digest = fingerprint([...keys].map(key => [key.device_id, key.public_key]).sort((a, b) => a[0].localeCompare(b[0])));
      const name = `connect.e2ee.peer.v1.${userId}.${peerId}`;
      const work = (pins.get(name) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const old = await storage.get(name);
        if (old && old !== digest) throw Error('connect_peer_key_changed');
        if (!old) await storage.set(name, digest);
        return digest;
      });
      pins.set(name, work);
      try { return await work; } finally { if (pins.get(name) === work) pins.delete(name); }
    },
    async replacePin(userId: string, peerId: string, keys: readonly { device_id: string; public_key: string }[]) {
      if (!uuid.test(userId) || !uuid.test(peerId) || userId === peerId || keys.length < 1 || keys.length > 4) throw Error('connect_key_identity_invalid');
      const name = `connect.e2ee.peer.v1.${userId}.${peerId}`;
      await pins.get(name)?.catch(() => undefined);
      await storage.set(name, fingerprint([...keys].map(key => [key.device_id, key.public_key]).sort((a, b) => a[0].localeCompare(b[0]))));
    },
  };
}
