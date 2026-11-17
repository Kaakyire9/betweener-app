import { launchAllowsSession } from '../domain/calling-launch-policy.ts';
import type { ConnectSession } from '../domain/connect.ts';
import { terminalStates } from '../domain/connect.ts';
import { connectUuid } from '../domain/call-navigation.ts';

export interface NativeCallEvent { cid: string; action: 'incoming' | 'answer' | 'end'; onAnswerReady?(): void }
export interface NativeIncomingProduct {
  selfProfileId: string; accountUserId: string; authGeneration: string;
  services: { api: { getCall(id: string): Promise<ConnectSession>; act(id: string, action: 'decline' | 'cancel', version: number, device: string): Promise<ConnectSession> }; peer?(profile: string): Promise<{ name: string }> };
  controller: { getSnapshot(): { session: ConnectSession | null; phase: string }; hangup(): Promise<void> };
  answerNative(call: ConnectSession, ready?: () => void): Promise<boolean>;
  dispose(): Promise<void>;
}
/** OS actions are hints, not admission. Only the existing authenticated product
 * accepts and creates media. Non-Connect events are left to the existing SDK. */
export function createNativeCallCoordinator(input: {
  enabled(): boolean; load(): Promise<NativeIncomingProduct>; deviceId(): Promise<string>;
  current(user: string, epoch: string): boolean;
  close(cid: string, reason: 'remote' | 'rejected' | 'error'): Promise<void>;
  keepAlive(cid: string): Promise<() => Promise<void>>;
  identify?(cid: string, product: NativeIncomingProduct, peer: string): Promise<void>;
  now(): number;
}) {
  const pending = new Map<string, Promise<{ handled: true; success: boolean }>>();
  const serial = new Map<string, Promise<unknown>>(), answered = new Set<string>();
  const calls = new Map<string, { product: NativeIncomingProduct; generation: string; stop(): Promise<void> }>();
  const idFrom = (cid: string) => cid.startsWith('betweener_connect:') && connectUuid(cid.slice(18)) ? cid.slice(18) : null;
  const stop = async (cid: string, reason: 'remote' | 'rejected' | 'error') => {
    const owned = calls.get(cid); calls.delete(cid); answered.delete(cid);
    try {
      // Dispatch local stop synchronously; an unavailable backend must not hold
      // the system UI or a background task open indefinitely.
      if (owned?.product.controller.getSnapshot().session?.id === cid.slice(18)) void owned.product.controller.hangup().catch(() => undefined);
      await input.close(cid, reason);
    } finally { if (owned) { await owned.stop(); await owned.product.dispose(); } }
  };
  const valid = (p: NativeIncomingProduct, call: ConnectSession) => input.current(p.accountUserId, p.authGeneration)
    && [call.caller_profile_id, call.recipient_profile_id].includes(p.selfProfileId) && !call.ended_at && !terminalStates.includes(call.state)
    && call.native_incoming === true && (!call.deadline || Date.parse(call.deadline) > input.now());
  return {
    async handle(event: NativeCallEvent): Promise<{ handled: boolean; success: boolean }> {
      const id = idFrom(event.cid);
      if (!id) return { handled: false, success: false };
      // Even while disabled, never fall through to SDK auto-accept for Connect.
      if (!input.enabled()) { await input.close(event.cid, 'error'); return { handled: true, success: false }; }
      const key = `${event.cid}:${event.action}`;
      const old = pending.get(key); if (old) return old;
      let expired = false;
      const deadline = input.now() + 20_000;
      const assertDeadline = () => { if (expired || input.now() >= deadline) throw Error('connect_native_action_timeout'); };
      const work = (serial.get(event.cid) ?? Promise.resolve()).catch(() => undefined).then(async (): Promise<{ handled: true; success: boolean }> => {
        let product: NativeIncomingProduct | undefined;
        try {
          assertDeadline();
          let owned = calls.get(event.cid);
          product = owned?.product ?? await input.load();
          assertDeadline();
          const call = await product.services.api.getCall(id);
          assertDeadline();
          if (event.action !== 'end' && !launchAllowsSession(call)) throw Error('connect_disabled');
          if (!valid(product, call) || (owned && owned.generation !== call.created_at)) throw Error('connect_native_invitation_unavailable');
          if (event.action === 'incoming' && owned && answered.has(event.cid)) return { handled: true, success: true };
          if (event.action !== 'end' && call.recipient_profile_id !== product.selfProfileId) throw Error('connect_native_invitation_unavailable');
          const view=product.controller.getSnapshot();
          if (event.action !== 'end' && view.phase === 'ACTIVE' && view.session?.id === id && view.session.created_at === call.created_at) {
            if(event.action === 'answer') event.onAnswerReady?.();
            if(!owned) await product.dispose();
            return {handled:true,success:true};
          }
          if (event.action === 'answer' && answered.has(event.cid) && product.controller.getSnapshot().session?.id === id) return { handled: true, success: true };
          if (!owned) {
            if (calls.size > 0 || (!['IDLE', 'ENDED', 'FAILED'].includes(product.controller.getSnapshot().phase)
              && product.controller.getSnapshot().session?.id !== id)) throw Error('connect_native_busy');
            const release = await input.keepAlive(event.cid);
            if (expired || input.now() >= deadline) { await release(); throw Error('connect_native_action_timeout'); }
            let polling = false;
            const timer = setInterval(() => {
              if (polling) return; polling = true;
              void product!.services.api.getCall(id).then(fresh => {
                if (!valid(product!, fresh) || fresh.created_at !== call.created_at) return stop(event.cid, 'remote');
              }).catch(() => stop(event.cid, 'error')).finally(() => { polling = false; });
            }, 2000);
            owned = { product, generation: call.created_at, stop: async () => { clearInterval(timer); await release(); } };
            calls.set(event.cid, owned);
          }
          if (event.action === 'incoming') {
            if (call.state !== 'RINGING') throw Error('connect_native_invitation_unavailable');
            await input.identify?.(event.cid,product,call.caller_profile_id); assertDeadline();
            return { handled: true, success: true };
          }
          if (event.action === 'end') {
            if (call.state === 'RINGING') {
              if(product.controller.getSnapshot().session?.id===id) await product.controller.hangup();
              else await product.services.api.act(id,call.caller_profile_id===product.selfProfileId?'cancel':'decline',call.version,await input.deviceId());
            }
            else if (product.controller.getSnapshot().session?.id === id) await product.controller.hangup();
            else throw Error('connect_native_invitation_unavailable');
            await stop(event.cid, 'rejected'); return { handled: true, success: true };
          }
          if (call.state !== 'RINGING' || !await product.answerNative(call,event.onAnswerReady)) throw Error('connect_native_invitation_unavailable');
          assertDeadline();
          const confirmed = await product.services.api.getCall(id);
          assertDeadline();
          if (!valid(product, confirmed) || confirmed.created_at !== call.created_at || !['ACCEPTED','CONNECTING','ACTIVE','RECONNECTING'].includes(confirmed.state)) throw Error('connect_native_invitation_unavailable');
          answered.add(event.cid);
          return { handled: true, success: true };
        } catch {
          const owned = calls.get(event.cid);
          await stop(event.cid, 'error').catch(() => undefined);
          if (product && !owned) await product.dispose().catch(() => undefined);
          return { handled: true, success: false };
        }
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const bounded = Promise.race([work, new Promise<{ handled: true; success: boolean }>(resolve => {
        timer = setTimeout(() => { expired = true; void stop(event.cid, 'error').catch(() => undefined); resolve({ handled: true, success: false }); },20_000);
      })]).finally(() => { clearTimeout(timer); });
      pending.set(key, bounded);
      serial.set(event.cid, work);
      void work.finally(() => { if (serial.get(event.cid) === work) serial.delete(event.cid); }).catch(() => undefined);
      try { return await bounded; } finally { if (pending.get(key) === bounded) pending.delete(key); }
    },
    async dispose() { await Promise.allSettled([...calls.keys()].map(cid => stop(cid, 'error'))); },
  };
}
