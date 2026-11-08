// Pure server adapter. No native client, shared Live singleton or environment reads.
import { isAcceptedEnd, isScopedEndedCall, isScopedNotFound, unconfirmedEnd, type ConnectEndAcknowledgement } from './connect-provider-end.ts';
export const CONNECT_CALL_TYPE = 'betweener_connect';
export const CONNECT_TOKEN_TTL = 120;
type Json = Record<string, unknown>;
export interface ProviderSnapshot {
  encryption_required?: boolean; native_incoming?: boolean; created_at?: string;
  id: string; state: string; media: 'voice' | 'video'; ended_at: string | null; can_provision: boolean;
  caller_user_id: string; recipient_user_id: string; provider_session_id: string | null;
}
/** Control-plane observations only; none proves cessation of received media. */
export interface ConnectProviderObservation {
  session: string | null;
  users: string[];
  callEnded: boolean;
  sessionEnded: boolean;
  missing: boolean;
}
export interface StreamCallPort {
  getOrCreate(input: { ring: boolean; notify: boolean; data: {
    created_by_id: string; members: { user_id: string; role: string }[];
    custom: { betweener_connect_id: string; media: string };
    settings_override: { encryption?: { mode: 'auto-on' }; limits: { max_participants: number }; video: { enabled: boolean; camera_default_on: boolean; target_resolution: { width: number; height: number; bitrate: number } } };
  } }): Promise<unknown>;
  get(): Promise<{ call: { id: string; type: string; custom: unknown; settings: unknown; ended_at?: string | Date | null; session?: unknown }; members: { user_id?: string; user?: { id: string } }[] }>;
  updateCallMembers(input: { update_members: { user_id: string; role: string }[] }): Promise<unknown>;
  end(): Promise<unknown>;
}
export interface StreamServerPort {
  getApp(): Promise<{ app: { id: number; disable_auth_checks: boolean; disable_permissions_checks: boolean } }>;
  video: { getCallType(input: { name: string }): Promise<{ name: string; grants: Record<string, string[]>; settings: unknown }>; call(type: string, id: string): StreamCallPort };
  upsertUsers(users: { id: string }[]): Promise<unknown>;
  generateUserToken(input: { user_id: string; validity_in_seconds: number; iat: number; exp: number }): string;
}
const record = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rolePermissions: Record<string, readonly string[]> = {
  connect_invited: ['read-call'],
  connect_voice: ['read-call', 'join-call', 'send-audio'],
  connect_video: ['read-call', 'join-call', 'send-audio', 'send-video'],
};
/** Both policies exclude screen capture and all server recording/egress modes. */
export function assertConnectSessionSettings(value: unknown, media: 'voice' | 'video'): void {
  const settings = record(value); const video = record(settings.video);
  if (!['voice', 'video'].includes(media) || video.enabled !== (media === 'video') || video.camera_default_on !== false
    || video.access_request_enabled !== false || record(settings.audio).access_request_enabled !== false
    || record(settings.screensharing).access_request_enabled !== false) throw new Error('connect_provider_policy_unsafe');
  // Reuse the deny-only feature and capacity contract, independently of grants.
  assertConnectCallType({ name: CONNECT_CALL_TYPE, grants: { user: [], admin: [], call_member: [], ...rolePermissions }, settings });
}
/** Reject defaults, unknown grants and any recording/streaming feature. Never edits provider settings. */
export function assertConnectCallType(value: unknown): void {
  const type = record(value);
  const grants = record(type.grants); const settings = record(type.settings);
  if (type.name !== CONNECT_CALL_TYPE || !Object.keys(grants).length) throw new Error('connect_provider_policy_unsafe');
  // The provider omits empty optional roles such as host/moderator on readback.
  for (const role of ['user', 'admin', 'call_member', ...Object.keys(rolePermissions)]) {
    if (!Array.isArray(grants[role])) throw new Error('connect_provider_policy_unsafe');
  }
  for (const [role, permissions] of Object.entries(grants)) {
    const expected = rolePermissions[role] ?? [];
    if (!Array.isArray(permissions) || permissions.length !== expected.length
      || !expected.every((permission) => permissions.includes(permission))) throw new Error('connect_provider_policy_unsafe');
  }
  for (const feature of ['recording', 'transcription', 'individual_recording', 'raw_recording', 'frame_recording']) {
    if (record(settings[feature]).mode !== 'disabled') throw new Error('connect_provider_policy_unsafe');
  }
  for (const feature of ['screensharing', 'thumbnails']) {
    if (record(settings[feature]).enabled !== false) throw new Error('connect_provider_policy_unsafe');
  }
  if (record(settings.transcription).closed_caption_mode !== 'disabled'
    || record(settings.ingress).enabled !== false) throw new Error('connect_provider_policy_unsafe');
  const broadcasting = record(settings.broadcasting);
  if (broadcasting.enabled !== false || record(broadcasting.hls).enabled !== false || record(broadcasting.rtmp).enabled !== false) throw new Error('connect_provider_policy_unsafe');
  if (record(settings.limits).max_participants !== 2) throw new Error('connect_provider_policy_unsafe');
}
export function createConnectStreamAdapter(stream: StreamServerPort, expectedAppId: number) {
  const call = (s: Pick<ProviderSnapshot, 'id'>) => {
    if (!uuid.test(s.id)) throw new Error('connect_provider_identity_invalid');
    return stream.video.call(CONNECT_CALL_TYPE, s.id);
  };
  async function verifyApplication() {
    const { app } = await stream.getApp();
    if (!Number.isSafeInteger(expectedAppId) || expectedAppId <= 0 || app.id !== expectedAppId
      || app.disable_auth_checks !== false || app.disable_permissions_checks !== false) throw new Error('connect_provider_policy_unsafe');
  }
  async function verifyPolicy(requireEncryption = false) {
    await verifyApplication();
    const type = await stream.video.getCallType({ name: CONNECT_CALL_TYPE });
    assertConnectCallType(type);
    if (requireEncryption && !['available','auto-on'].includes(String(record(record(type.settings).encryption).mode))) throw Error('connect_provider_encryption_unavailable');
  }
  async function verifyMembers(s: ProviderSnapshot, c: StreamCallPort) {
    const result = await c.get();
    const actual = result.members.map((m) => String(m.user_id ?? record(m.user).id)).sort();
    const expected = [s.caller_user_id, s.recipient_user_id].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected) || result.call.id !== s.id || result.call.type !== CONNECT_CALL_TYPE
      || record(result.call.custom).betweener_connect_id !== s.id || record(result.call.custom).media !== s.media) throw new Error('connect_provider_identity_invalid');
    assertConnectSessionSettings(result.call.settings, s.media);
    const mode = record(record(result.call.settings).encryption).mode;
    if ((s.encryption_required === true && mode !== 'auto-on') || (s.encryption_required !== true && mode === 'auto-on')) throw Error('connect_provider_encryption_mismatch');
    return result;
  }
  return {
    verifyPolicy,
    async provision(s: ProviderSnapshot) {
      if (s.state !== 'REQUESTED' || s.ended_at || !s.can_provision || s.caller_user_id === s.recipient_user_id) throw new Error('connect_provider_unavailable');
      await verifyPolicy(s.encryption_required === true);
      // Do not overwrite application roles of existing Live users.
      await stream.upsertUsers([{ id: 'betweener-connect-system' }, { id: s.caller_user_id }, { id: s.recipient_user_id }]);
      const c = call(s);
      await c.getOrCreate({ ring: s.native_incoming !== false, notify: false, data: {
        created_by_id: 'betweener-connect-system',
        members: [s.caller_user_id, s.recipient_user_id].map((user_id) => ({ user_id, role: 'connect_invited' })),
        custom: { betweener_connect_id: s.id, media: s.media },
        settings_override: { ...(s.encryption_required === true ? { encryption: { mode: 'auto-on' as const } } : {}), limits: { max_participants: 2 }, video: { enabled: s.media === 'video', camera_default_on: false,
          target_resolution: { width: 640, height: 480, bitrate: 600000 } } },
      } });
      const result = await verifyMembers(s, c);
      if (result.call.ended_at) throw new Error('connect_provider_unavailable');
    },
    async credentials(s: ProviderSnapshot, userId: string) {
      if (!['ACCEPTED', 'CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(s.state) || s.ended_at
        || ![s.caller_user_id, s.recipient_user_id].includes(userId)) throw new Error('connect_provider_unavailable');
      await verifyPolicy(s.encryption_required === true); const c = call(s); const result = await verifyMembers(s, c);
      if (result.call.ended_at) throw new Error('connect_provider_unavailable');
      await c.updateCallMembers({ update_members: [s.caller_user_id, s.recipient_user_id].map((user_id) => ({ user_id, role: `connect_${s.media}` })) });
      // Call tokens implicitly add membership. Ordinary short-lived user tokens
      // leave membership and all private-call permissions under server control.
      const now = Math.floor(Date.now() / 1000);
      return { token: stream.generateUserToken({ user_id: userId, validity_in_seconds: CONNECT_TOKEN_TTL, iat: now - 30, exp: now + CONNECT_TOKEN_TTL }),
        expiresAt: new Date((now + CONNECT_TOKEN_TTL) * 1000).toISOString(),
        call: { type: CONNECT_CALL_TYPE, id: s.id, cid: `${CONNECT_CALL_TYPE}:${s.id}` } };
    },
    async end(s: Pick<ProviderSnapshot, 'id'>): Promise<ConnectEndAcknowledgement> {
      const c = call(s);
      try { await verifyApplication(); } catch (error) { throw unconfirmedEnd(error); }
      let accepted = false;
      try {
        if (!isAcceptedEnd(await c.end())) throw unconfirmedEnd(null);
        accepted = true;
      } catch (error) {
        if (!isScopedNotFound(error)) throw unconfirmedEnd(error);
      }
      // An HTTP ACK alone is not persisted provider termination. A delayed,
      // mismatched or unavailable read keeps the durable end job retryable.
      // Neither an ended call nor scoped absence proves cessation of remote RTP.
      let result: Awaited<ReturnType<StreamCallPort['get']>>;
      try { result = await c.get(); } catch (error) {
        if (isScopedNotFound(error)) return { type: CONNECT_CALL_TYPE, id: s.id, outcome: 'absent', mediaEnforcement: 'unverified' };
        throw unconfirmedEnd(error);
      }
      if (!accepted || !isScopedEndedCall(result, s.id)) throw unconfirmedEnd(null);
      return { type: CONNECT_CALL_TYPE, id: s.id, outcome: 'accepted', mediaEnforcement: 'unverified' };
    },
    async media(s: ProviderSnapshot): Promise<ConnectProviderObservation> {
      let provider: Awaited<ReturnType<StreamCallPort['get']>>['call'];
      try { ({ call: provider } = await verifyMembers(s, call(s))); }
      catch (error) {
        // The pinned SDK supplies HTTP status through StreamError.metadata.
        // Never turn auth, timeout or ambiguous code-only errors into terminal evidence.
        if (record(error).code !== 16 || record(record(error).metadata).responseCode !== 404) throw error;
        return { session: null, users: [], callEnded: false, sessionEnded: false, missing: true };
      }
      const session = record(provider.session);
      const sessionId = typeof session.id === 'string' && session.id.length ? session.id : null;
      const callEnded = !!provider.ended_at;
      const participants = session.participants;
      if (sessionId && !Array.isArray(participants) && !callEnded) throw new Error('connect_provider_snapshot_invalid');
      return { session: sessionId,
        users: sessionId && Array.isArray(participants) ? [...new Set(participants.map((p) => String(record(record(p).user).id)))] : [],
        callEnded, sessionEnded: !!session.ended_at, missing: false };
    },
  };
}
