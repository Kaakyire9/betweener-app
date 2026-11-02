import type { StreamVideoSdkModule } from '../../live/media/load-stream-video-sdk.ts';
import { connectUuid } from '../domain/call-navigation.ts';

export interface EncryptionBinding {
  cid: string; userId: string; authEpoch: string; participants: readonly string[];
}
export interface AuthenticatedCallKey extends EncryptionBinding {
  mode: 'required'; epoch: number; expiresAt: number; key: ArrayBuffer;
}
/** Must authenticate peer/device identity and call authority outside Stream.
 * No implementation is installed. A server-visible shared secret is unsuitable. */
export interface CallKeyAgent { acquire(binding: EncryptionBinding): Promise<AuthenticatedCallKey> }
type Manager = Pick<Awaited<ReturnType<StreamVideoSdkModule['EncryptionManager']['create']>>,
  'setSharedKey' | 'removeSharedKey' | 'dispose'>;
interface EncryptionSdk {
  isSupported(): boolean;
  create(userId: string, options: { algorithm: 'AES-128-GCM' | 'AES-256-GCM' }): Promise<Manager>;
}
interface EncryptionCall { cid: string; attach(manager: Manager): void; hasLeft(): boolean }
const sameMembers = (a: readonly string[], b: readonly string[]) => a.length === 2 && b.length === 2
  && new Set(a).size === 2 && new Set(b).size === 2 && [...a].sort().every((id, i) => id === [...b].sort()[i]);

/** Experimental SDK boundary only. Not mounted in the product; never joins a call or transmits keys. */
export async function prepareCallEncryption(input: {
  required: boolean; binding: EncryptionBinding; call: EncryptionCall; sdk: EncryptionSdk;
  agent?: CallKeyAgent; current(): boolean; now(): number;
}) {
  if (!input.required) return null;
  const binding = { ...input.binding, participants: [...input.binding.participants] };
  if (!input.agent) throw new Error('connect_e2ee_key_distribution_unavailable');
  if (!input.sdk.isSupported()) throw new Error('connect_e2ee_native_unsupported');
  if (!binding.authEpoch || !connectUuid(binding.userId) || !binding.cid.startsWith('betweener_connect:')
    || !connectUuid(binding.cid.slice('betweener_connect:'.length)) || !binding.participants.every(connectUuid)
    || !sameMembers(binding.participants, binding.participants) || !binding.participants.includes(binding.userId)) {
    throw new Error('connect_e2ee_binding_invalid');
  }
  let manager: Manager | null = null, epoch = -1, retired = false, disposed = false, algorithmBytes = 0;
  const installedEpochs = new Set<number>();
  const current = () => !retired && !disposed && input.current() && input.call.cid === binding.cid && !input.call.hasLeft();
  const acquire = async () => {
    if (!current()) throw new Error('connect_e2ee_owner_retired');
    const lease = await input.agent!.acquire({ ...binding, participants: [...binding.participants] });
    try {
      if (!current()) throw new Error('connect_e2ee_owner_retired');
      if (lease.cid !== binding.cid || lease.authEpoch !== binding.authEpoch || lease.userId !== binding.userId
        || lease.mode !== 'required' || !sameMembers(lease.participants, binding.participants)
        || !Number.isInteger(lease.epoch) || lease.epoch <= epoch || lease.epoch > 255
        || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= input.now()
        || !(lease.key instanceof ArrayBuffer) || ![16, 32].includes(lease.key.byteLength)
        || (algorithmBytes !== 0 && lease.key.byteLength !== algorithmBytes)) {
        throw new Error('connect_e2ee_key_binding_invalid');
      }
      return lease;
    } catch (error) { if (lease.key instanceof ArrayBuffer) new Uint8Array(lease.key).fill(0); throw error; }
  };
  const first = await acquire();
  algorithmBytes = first.key.byteLength;
  try {
    manager = await input.sdk.create(binding.userId, { algorithm: first.key.byteLength === 32 ? 'AES-256-GCM' : 'AES-128-GCM' });
    if (!current()) throw new Error('connect_e2ee_owner_retired');
    if (first.expiresAt <= input.now()) throw new Error('connect_e2ee_key_expired');
    installedEpochs.add(first.epoch); manager.setSharedKey(first.epoch, first.key); epoch = first.epoch;
    input.call.attach(manager);
  } catch (error) { manager?.dispose(); throw error; }
  finally { new Uint8Array(first.key).fill(0); }
  const owned = manager;
  let rotating = false;
  return {
    state: 'prepared' as const, encryptionEffect: 'not_verified' as const,
    async rotate() {
      if (rotating) throw new Error('connect_e2ee_rotation_pending');
      rotating = true;
      try {
        const next = await acquire();
        try {
          installedEpochs.add(next.epoch); owned.setSharedKey(next.epoch, next.key);
          owned.removeSharedKey(epoch); installedEpochs.delete(epoch); epoch = next.epoch;
        } catch (error) {
          // Retain both possibly-installed epochs for cleanup after ordinary
          // call leave. Do not accept more keys after an ambiguous mutation.
          retired = true; throw error;
        } finally { new Uint8Array(next.key).fill(0); }
      } finally { rotating = false; }
    },
    retire() { retired = true; },
    release() {
      retired = true;
      if (disposed) return { nativeDisposal: 'requested' as const };
      // Attached transforms must outlive the peer connections. The owner must
      // finish its ordinary leave first; E2EE is not an alternative call owner.
      if (!input.call.hasLeft() || rotating) throw new Error('connect_e2ee_release_pending');
      for (const installed of installedEpochs) owned.removeSharedKey(installed);
      owned.dispose(); installedEpochs.clear(); disposed = true;
      // The installed SDK's dispose() has no independent native acknowledgement.
      return { nativeDisposal: 'requested' as const };
    },
  };
}
