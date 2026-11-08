import { VoiceController } from './voice-controller.ts';
import type { ConnectSession } from '../domain/connect.ts';
import type { VoiceApi, VoiceTransport, VoiceTransportState, MicrophonePermission } from './voice-types.ts';
const self = 'aa220000-0000-4000-8000-000000000001';
const peer = 'aa220000-0000-4000-8000-000000000002';
/** Isolated development preview. No Supabase, native audio, Stream SDK or tokens. */
export function createVoicePreview() {
  let session: ConnectSession | null = null;
  let sequence = 100;
  const uuid = () => `aa230000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`;
  let permission: MicrophonePermission = 'granted';
  let listener: ((state: VoiceTransportState) => void) | null = null;
  const make = (incoming: boolean): ConnectSession => ({ id: uuid(),
    caller_profile_id: incoming ? peer : self, recipient_profile_id: incoming ? self : peer,
    media: 'voice', authorization: 'matched', state: 'RINGING', version: 1, created_at: new Date().toISOString(),
    accepted_at: null, connected_at: null, ended_at: null, deadline: new Date(Date.now() + 45000).toISOString(), reason: null, duration_seconds: null });
  const api: VoiceApi = {
    async createCall() { session = make(false); return { ...session }; },
    async act(_, action) {
      if (!session) throw new Error('connect_unavailable');
      if (session.ended_at) return { ...session };
      session = { ...session, version: session.version + 1, state: action === 'accept' ? 'ACCEPTED' : action === 'decline' ? 'DECLINED' : action === 'cancel' ? 'CANCELLED' : 'ENDED',
        accepted_at: action === 'accept' ? new Date().toISOString() : session.accepted_at,
        ended_at: action === 'accept' ? null : new Date().toISOString() };
      return { ...session };
    },
    async getCall() { if (!session) throw new Error('connect_unavailable'); return { ...session }; },
    async getHistory() { return session ? [{ ...session }] : []; },
    async credentials() { if (!session) throw new Error('connect_unavailable'); return { apiKey: 'preview', token: 'preview', expiresAt: new Date(Date.now() + 120000).toISOString(), media: 'voice',
      user: { id: self }, call: { type: 'betweener_connect', id: session.id, cid: `betweener_connect:${session.id}` } }; },
  };
  const transport: VoiceTransport = {
    async join(_, __, next) { listener = next; next('connecting'); }, async setMuted() {},
    routes: () => ['earpiece', 'speaker'], async selectRoute() {}, async leave() { listener = null; },
  };
  const controller = new VoiceController({ api, transport, selfProfileId: self, userId: self, deviceId: self,
    permission: async () => permission, uuid, now: Date.now,
    peer: async () => ({ profileId: peer, name: 'Your connection', avatar: null }) });
  return {
    controller,
    start: () => controller.start({ profileId: peer, name: 'Your connection', avatar: null }, 'matched'),
    async incoming() { if (!['IDLE','ENDED','FAILED'].includes(controller.getSnapshot().phase)) return; controller.reset(); session = make(true); await controller.receive(session); },
    async answerPeer() { if (session) { session = { ...session, state: 'ACCEPTED', version: session.version + 1, accepted_at: new Date().toISOString() }; await controller.refresh(); } },
    async connect() {
      if (session && ['ACCEPTED', 'CONNECTING', 'RECONNECTING', 'ACTIVE'].includes(session.state)) {
        session = { ...session, state: 'ACTIVE', version: session.version + 1, connected_at: session.connected_at ?? new Date().toISOString() };
        listener?.('joined'); await controller.refresh();
      }
    },
    async reconnect() { if (session?.state === 'ACTIVE') { session = { ...session, state: 'RECONNECTING', version: session.version + 1 }; listener?.('reconnecting'); await controller.refresh(); } },
    async remoteEnd() { if (session) { session = { ...session, state: 'ENDED', version: session.version + 1, ended_at: new Date().toISOString() }; await controller.refresh(); } },
    setPermission(next: MicrophonePermission) { permission = next; },
  };
}
