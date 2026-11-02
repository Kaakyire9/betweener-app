import type { NativeSessionOwner } from '../../../lib/auth/native-session-owner.ts';
import { createConnectRepository, type ConnectRpcPort } from './connect-repository.ts';
import { createVoiceApi, readVoiceCredentials } from './voice-api.ts';
import { transitions, type ConnectSession } from '../domain/connect.ts';
import { connectUuid } from '../domain/call-navigation.ts';
import type { VoicePeer } from '../voice/voice-types.ts';
import { readIntentCallingContext } from '../domain/intent-consent.ts';

export interface AuthenticatedConnectPorts {
  rpc(name: string, args: Record<string, unknown>, token: string): ReturnType<ConnectRpcPort['rpc']>;
  credentials(callId: string, deviceId: string, token: string): Promise<unknown>;
  peer(profileId: string, token: string): Promise<VoicePeer>;
}
export interface PinnedConnectRpcClient {
  schema(name: 'public'): { rpc(name: string, args: Record<string, unknown>): {
    setHeader(name: string, value: string): { abortSignal(signal: AbortSignal): PromiseLike<Awaited<ReturnType<ConnectRpcPort['rpc']>>> };
  } };
}
// Preserve the development facade's 12-second UI request budget, not a media lease.
export const CONNECT_RPC_UI_TIMEOUT_MS = 12_000;
/** The app facade's rpc() is Promise-wrapped. schema().rpc() retains the SDK builder. */
export async function invokePinnedConnectRpc(client: PinnedConnectRpcClient, name: string, args: Record<string, unknown>, token: string, timeoutMs = CONNECT_RPC_UI_TIMEOUT_MS) {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    const request = client.schema('public').rpc(name, args).setHeader('Authorization', `Bearer ${token}`).abortSignal(abort.signal);
    return await Promise.race([Promise.resolve(request), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new Error('connect_unavailable')); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
export function readCanonicalVoiceSession(value: unknown, selfProfileId: string): ConnectSession {
  const call = value as ConnectSession | null;
  if (!call || !connectUuid(call.id) || !connectUuid(call.caller_profile_id) || !connectUuid(call.recipient_profile_id)
    || call.caller_profile_id === call.recipient_profile_id || ![call.caller_profile_id, call.recipient_profile_id].includes(selfProfileId)
    || call.media !== 'voice' || !Object.hasOwn(transitions, call.state) || !['matched', 'pre_match'].includes(call.authorization)
    || !Number.isSafeInteger(call.version) || call.version < 1 || !Number.isFinite(Date.parse(call.created_at))) throw new Error('connect_unavailable');
  return call;
}
/** Same repository/RPC/issuer, with explicit per-request bearer and immutable Auth epoch. */
export function createAuthenticatedConnectServices(auth: NativeSessionOwner, selfProfileId: string, ports: AuthenticatedConnectPorts) {
  const binding = auth.snapshot();
  if (!binding || !connectUuid(selfProfileId)) throw new Error('connect_unauthenticated');
  const guard = async <T>(run: (token: string) => Promise<T>): Promise<T> => {
    const token = auth.accessToken(binding);
    const value = await run(token);
    auth.accessToken(binding);
    return value;
  };
  const repository = createConnectRepository({ rpc: (name, args) => guard(token => ports.rpc(name, args, token)) });
  const relationshipCommand = (name: 'rpc_is_relationship_mutually_verified' | 'rpc_reconfirm_relationship', peerId: string) => guard(async token => {
    if (!connectUuid(peerId) || peerId === selfProfileId) throw new Error('connect_unavailable');
    const { data, error } = await ports.rpc(name, { p_peer_profile_id: peerId }, token);
    if (error || typeof data !== 'boolean') throw new Error('connect_unavailable');
    return data;
  });
  const api = createVoiceApi({
    ...repository,
    createCall: async (...args) => readCanonicalVoiceSession(await repository.createCall(...args), selfProfileId),
    act: async (...args) => readCanonicalVoiceSession(await repository.act(...args), selfProfileId),
    getCall: async id => readCanonicalVoiceSession(await repository.getCall(id), selfProfileId),
    getHistory: async (...args) => {
      const rows = await repository.getHistory(...args);
      if (!Array.isArray(rows)) throw new Error('connect_unavailable');
      return rows.filter(call => call.media === 'voice').map(call => readCanonicalVoiceSession(call, selfProfileId));
    },
  }, (call, device) => guard(async token => readVoiceCredentials(await ports.credentials(call, device, token), call, binding.userId)));
  return { api, checkEligibility: repository.checkEligibility, getGrant: repository.getGrant,
    relationship: {
      verified: (peerId: string) => relationshipCommand('rpc_is_relationship_mutually_verified', peerId),
      confirm: (peerId: string) => relationshipCommand('rpc_reconfirm_relationship', peerId),
    },
    consent: {
      get: async (intent: string) => readIntentCallingContext(await repository.getIntentConsent(intent), intent, selfProfileId),
      offer: repository.requestGrant, decide: repository.decideGrant, withdraw: repository.revokeGrant,
    },
    preferences: { get: repository.getPreferences, set: repository.setPreferences },
    registerNotificationCapability: repository.registerNotificationCapability,
    peer: (id: string) => guard(async token => {
      if (!connectUuid(id) || id === selfProfileId) throw new Error('connect_unavailable');
      const peer = await ports.peer(id, token);
      if (peer.profileId !== id || !peer.name.trim()) throw new Error('connect_unavailable');
      return peer;
    }),
  };
}
