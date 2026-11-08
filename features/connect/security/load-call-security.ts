import type { NativeSessionOwner } from '../../../lib/auth/native-session-owner.ts';
import type { AuthenticatedConnectPorts } from '../data/authenticated-connect-services.ts';
import { createCallKeyAgent, type CallKeyContext, type KeyEnvelope } from './call-key-agent.ts';
import { createDeviceKeyStore, fingerprint } from './device-keys.ts';
import type { ConnectAuthorization, ConnectMedia } from '../domain/connect.ts';

/** Uses the existing pinned, per-request bearer. A missing migration keeps the
 * current product compatible; any other failure is not a capability downgrade. */
export async function loadCallSecurity(auth: NativeSessionOwner, deviceId: string, rpc: AuthenticatedConnectPorts['rpc']) {
  const expected = auth.snapshot();
  if (!expected) throw Error('connect_unauthenticated');
  const invoke = async (name: string, args: Record<string, unknown>) => {
    const result = await rpc(name, args, auth.accessToken(expected));
    auth.accessToken(expected);
    return result;
  };
  const capabilities = await invoke('rpc_connect_security_capabilities', {});
  if (capabilities.error) {
    const code = (capabilities.error as { code?: string }).code;
    if (code === 'PGRST202' || code === '42883') return { encryptedCalls: false, nativeIncoming: false, agent: undefined };
    throw Error('connect_security_unavailable');
  }
  const caps = capabilities.data as { e2ee?: unknown; native_incoming?: unknown } | null;
  if (!caps || typeof caps.e2ee !== 'boolean' || typeof caps.native_incoming !== 'boolean') throw Error('connect_security_unavailable');
  if (!caps.e2ee && !caps.native_incoming) return { encryptedCalls: false, nativeIncoming: false, agent: undefined };
  const [secure, crypto] = await Promise.all([import('expo-secure-store'), import('expo-crypto')]);
  const keys = createDeviceKeyStore({ get: name => secure.getItemAsync(name), set: (name, value) => secure.setItemAsync(name, value, {
    keychainAccessible: secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }) }, crypto.getRandomBytes);
  const identity = await keys.identity(expected.userId, deviceId);
  try {
    const registered = await invoke('rpc_connect_register_secure_device', { p_device: deviceId, p_public_key: identity.publicKey });
    if (registered.error || registered.data !== true) throw Error('connect_security_unavailable');
  } finally { identity.secretKey.fill(0); }
  let safetyCode: string | undefined, identityVerified = false;
  const agent = caps.e2ee ? createCallKeyAgent({ userId: expected.userId, deviceId, authEpoch: expected.generation, keys, current: () => {
    try { auth.accessToken(expected); return true; } catch { return false; }
  }, random: crypto.getRandomBytes, now: Date.now, onSafetyCode: async value => {
    if (safetyCode !== value.code) identityVerified = false;
    safetyCode = value.code;
    const verified = await secure.getItemAsync(`connect.e2ee.verified.v1.${expected.userId}.${value.code.replaceAll(' ', '')}`);
    auth.accessToken(expected); if (safetyCode === value.code) identityVerified = verified === 'verified';
  }, exchange: {
    async context(callId, device) {
      const result = await invoke('rpc_connect_key_context', { p_call: callId, p_device: device });
      if (result.error) throw Error('connect_key_unavailable'); return result.data as CallKeyContext;
    },
    async publish(callId, device, generation, envelopes: KeyEnvelope[]) {
      const result = await invoke('rpc_connect_publish_key_envelopes', { p_call: callId, p_device: device, p_generation: generation, p_envelopes: envelopes });
      if (result.error || typeof result.data !== 'boolean') throw Error('connect_key_unavailable'); return result.data;
    },
  } }) : undefined;
  const review = async (peer: string, media: ConnectMedia, authorization: ConnectAuthorization, grant: string | null) => {
    const result = await invoke('rpc_connect_peer_key_context', { p_peer: peer, p_media: media, p_authorization: authorization, p_grant: grant });
    const value = result.data as { peer_user_id: string; devices: import('./call-key-agent').CallDevice[] };
    if (result.error || !value || !Array.isArray(value.devices) || value.devices.length < 2 || value.devices.length > 8
      || value.devices.some(d => ![expected.userId,value.peer_user_id].includes(d.user_id) || !/^[0-9a-f]{64}$/.test(d.public_key))) throw Error('connect_key_unavailable');
    const digest = fingerprint(['betweener-connect-identity-v1',value.devices.map(d => [d.user_id,d.device_id,d.public_key]).sort()]);
    return { ...value, code: digest.slice(0,60).match(/.{1,4}/g)!.join(' ') };
  };
  return { encryptedCalls: caps.e2ee, nativeIncoming: caps.native_incoming, agent,
    reviewIdentity: async (peer: string, media: ConnectMedia, authorization: ConnectAuthorization, grant: string | null) => (await review(peer,media,authorization,grant)).code,
    async replaceIdentity(peer: string, media: ConnectMedia, authorization: ConnectAuthorization, grant: string | null, code: string) {
      const fresh = await review(peer,media,authorization,grant);
      if (fresh.code !== code) throw Error('connect_peer_key_changed');
      await keys.replacePin(expected.userId,fresh.peer_user_id,fresh.devices.filter(d => d.user_id === fresh.peer_user_id));
      await secure.setItemAsync(`connect.e2ee.verified.v1.${expected.userId}.${code.replaceAll(' ','')}`,'verified',{keychainAccessible:secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY});
      auth.accessToken(expected); safetyCode=code; identityVerified=true;
    },
    encryptionInfo: () => ({ safetyCode, identityVerified }),
    async verifyIdentity(code: string) {
      auth.accessToken(expected);
      if (!code || code !== safetyCode) throw Error('connect_key_binding_invalid');
      await secure.setItemAsync(`connect.e2ee.verified.v1.${expected.userId}.${code.replaceAll(' ', '')}`, 'verified', {
        keychainAccessible: secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      auth.accessToken(expected); if (code !== safetyCode) throw Error('connect_key_binding_invalid'); identityVerified = true;
    },
  };
}
