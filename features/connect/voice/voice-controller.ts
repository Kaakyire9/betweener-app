import { connectedDuration, terminalStates, type ConnectAuthorization, type ConnectSession } from '../domain/connect.ts';
import type { MicrophonePermission, VoiceApi, VoicePeer, VoiceTransport, VoiceTransportState, VoiceViewState, VoiceRoute } from './voice-types.ts';
import { connectFeatureFlags, type ConnectFeatureFlags } from '../config/connect-feature-flags.ts';
import { pendingShutdown, unverifiedShutdown, normalizeShutdown } from '../media/local-shutdown.ts';
import { pendingEndBlock, readEndBlockContext, readEndBlockReceipt, type EndBlockContext } from '../domain/end-block.ts';
import { audioSetupFailure, audioSetupMessage, type AudioSetupStage } from './audio-setup.ts';
import { createAudioHealthMonitor } from '../media/audio-health.ts';
import { createCallQualityTracker } from './call-quality.ts';

interface VoiceDependencies {
  failClosedAuthority?: boolean;
  api: VoiceApi; transport: VoiceTransport; selfProfileId: string; userId: string; deviceId: string;
  permission(): Promise<MicrophonePermission>; uuid(): string; now(): number;
  peer(profileId: string): Promise<VoicePeer>;
  flags?: ConnectFeatureFlags;
}
const initial = (): VoiceViewState => ({ audioHealth: undefined, quality: undefined, interruption: undefined, audioSetupStage: undefined, audioSetupFailure: undefined, endStatus: undefined, localShutdown: unverifiedShutdown(), endBlock: null, phase: 'IDLE', session: null, peer: null, incoming: false, muted: true,
  route: 'earpiece', routes: [], permission: null, error: null, busy: false, durationSeconds: null, foreground: true });
const safeError = (error: unknown): string => {
  const code = error instanceof Error ? error.message : '';
  if (code === 'connect_busy') return 'They are already on a call. Try again later.';
  if (code === 'connect_consent_required') return 'Voice calling has not been approved for this connection.';
  if (code === 'connect_device_conflict') return 'This call was answered on another device.';
  if (code === 'connect_disabled') return 'Voice calling is currently unavailable.';
  if (code === 'connect_test_budget_exhausted') return 'This staging test has reached its call limit. Ask the test organiser to continue.';
  if (code === 'stream_native_owner_busy' || code === 'stream_client_release_pending') return 'Audio is in use by another session. Finish it before calling.';
  return 'The call could not continue. Please try again.';
};

/** One foreground owner per signed-in user. No Stream singleton or native bootstrap. */
export class VoiceController {
  private readonly dependencies: VoiceDependencies;
  private view = initial();
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;
  private request: { peer: VoicePeer; authorization: ConnectAuthorization; grant: string | null; key: string } | null = null;
  private starting: Promise<void> | null = null;
  private connecting: Promise<void> | null = null;
  private polling = false;
  private joining = false;
  private mediaAttempted = false;
  private accepting = false;
  private acceptedHere = false;
  private cancelledDuringStart = false;
  private transportState: VoiceTransportState = 'idle';
  private reconnectAt: number | null = null;
  private lastPoll = -Infinity;
  private muteRequest = 0;
  private routeRequest = 0;
  private audioHealth = createAudioHealthMonitor();
  private quality = createCallQualityTracker();
  private blocking: Promise<void> | null = null;
  private readingEndBlock = false;
  private endBlockIntent: { call: ConnectSession; peer: string; key: string; generation: number; preparationAttempted: boolean; context?: EndBlockContext } | null = null;
  constructor(dependencies: VoiceDependencies) { this.dependencies = dependencies; }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<VoiceViewState>) {
    if (this.disposed) return;
    const now = this.dependencies.now();
    if (patch.audioSetupStage) this.quality.mark(patch.audioSetupStage, now);
    if (patch.audioHealth?.reception === 'receiving') this.quality.mark('received_rtp', now);
    if (patch.phase === 'ENDING') this.quality.mark('end_requested', now);
    if (patch.endStatus === 'terminal') this.quality.mark('authority_terminal', now);
    if (patch.localShutdown?.sdkLeave === 'completed' && patch.localShutdown.resourceRelease === 'completed') this.quality.mark('sdk_released', now);
    this.view = { ...this.view, ...patch, quality: this.quality.snapshot() }; for (const listener of this.listeners) listener();
  }
  private participant(session: ConnectSession): boolean {
    return session.media === 'voice' && [session.caller_profile_id, session.recipient_profile_id].includes(this.dependencies.selfProfileId);
  }
  private sameCall(a: ConnectSession, b: ConnectSession): boolean {
    return a.id === b.id && a.created_at === b.created_at && a.caller_profile_id === b.caller_profile_id
      && a.recipient_profile_id === b.recipient_profile_id && a.media === b.media && a.authorization === b.authorization;
  }
  private async permission(generation = this.generation): Promise<boolean> {
    const permission = await this.dependencies.permission();
    if (generation !== this.generation || this.disposed) return false;
    this.update({ permission });
    if (permission !== 'granted') this.update({ error: permission === 'blocked'
      ? 'Allow microphone access in Settings to join a voice call.' : 'Microphone permission is needed for a voice call.' });
    return permission === 'granted';
  }
  start(peer: VoicePeer, authorization: ConnectAuthorization, grant: string | null = null): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.starting) return this.starting;
    if (this.view.session) {
      if (!this.canDismissCompletedCall()) return Promise.resolve();
      this.reset();
    }
    if (this.request && (this.request.peer.profileId !== peer.profileId || this.request.authorization !== authorization || this.request.grant !== grant)) {
      this.update({ error: 'Resolve the previous call attempt before starting another.' }); return Promise.resolve();
    }
    this.request ??= { peer, authorization, grant, key: this.dependencies.uuid() };
    const generation = ++this.generation; this.cancelledDuringStart = false; this.acceptedHere = false;
    this.mediaAttempted = false;
    this.quality = createCallQualityTracker();
    this.update({ ...initial(), peer, busy: true, phase: 'REQUESTED' });
    this.starting = this.startRequest(generation).finally(() => { this.starting = null; if (!this.disposed && generation === this.generation) this.update({ busy: false }); });
    return this.starting;
  }
  private async startRequest(generation: number) {
    const d = this.dependencies; const request = this.request!;
    try {
      if (!await this.permission(generation) || generation !== this.generation || this.disposed || this.cancelledDuringStart) {
        if (generation === this.generation && !this.disposed && !this.cancelledDuringStart) { this.request = null; this.update({ phase: 'IDLE' }); }
        return;
      }
      const session = await d.api.createCall(request.peer.profileId, 'voice', request.authorization, request.key, d.deviceId, request.grant);
      if (!this.participant(session) || session.caller_profile_id !== d.selfProfileId || session.recipient_profile_id !== request.peer.profileId) throw new Error('invalid_session');
      this.request = null;
      if (generation !== this.generation || this.disposed || this.cancelledDuringStart) { await this.endOnServer(session); return; }
      await this.reconcile(session);
    } catch (error) { if (generation === this.generation) this.update({ phase: 'FAILED', error: safeError(error) }); }
  }
  async receive(session: ConnectSession): Promise<void> {
    if (this.disposed || !this.participant(session) || session.recipient_profile_id !== this.dependencies.selfProfileId
      || session.state !== 'RINGING' || this.view.session || this.starting) return;
    const generation = this.generation;
    try {
      // History/events are invalidation hints; reload canonical state before answer UI.
      const fresh = await this.dependencies.api.getCall(session.id);
      if (generation !== this.generation || this.disposed || fresh.state !== 'RINGING' || !this.participant(fresh)
        || !this.sameCall(session, fresh) || fresh.recipient_profile_id !== this.dependencies.selfProfileId) return;
      const peer = await this.dependencies.peer(fresh.caller_profile_id);
      if (generation !== this.generation || this.disposed || this.view.session || peer.profileId !== fresh.caller_profile_id) return;
      this.update({ session: fresh, peer, incoming: true, phase: 'RINGING', error: null });
    } catch { /* No invitation is rendered from an unauthorized/stale hint. */ }
  }
  /** Open a canonical notification/history target without accepting or joining it. */
  async openCall(callId: string): Promise<void> {
    if (this.disposed || this.starting) return;
    if (this.view.session && !terminalStates.includes(this.view.session.state)) {
      if (this.view.session.id === callId) await this.refresh();
      return;
    }
    if (this.view.session) {
      if (!this.canDismissCompletedCall()) return;
      this.reset();
    }
    const generation = ++this.generation;
    this.acceptedHere = false; this.accepting = false; this.joining = false; this.transportState = 'idle';
    this.mediaAttempted = false;
    this.quality = createCallQualityTracker();
    this.update({ ...initial(), busy: true });
    try {
      const call = await this.dependencies.api.getCall(callId);
      if (call.id !== callId || !this.participant(call)) throw new Error('invalid_session');
      const peerId = call.caller_profile_id === this.dependencies.selfProfileId ? call.recipient_profile_id : call.caller_profile_id;
      const peer = await this.dependencies.peer(peerId);
      if (generation !== this.generation || this.disposed) return;
      if (peer.profileId !== peerId) throw new Error('invalid_session');
      if (terminalStates.includes(call.state)) {
        this.update({ session: call, peer, incoming: call.recipient_profile_id === this.dependencies.selfProfileId,
          phase: call.state === 'FAILED' ? 'FAILED' : 'ENDED', endStatus: 'terminal', durationSeconds: connectedDuration(call.connected_at, call.ended_at) });
      } else if (call.state === 'RINGING' && call.recipient_profile_id === this.dependencies.selfProfileId) {
        await this.receive(call);
      } else {
        // Viewing a stale push never takes over or terminates another device's call.
        this.update({ phase: 'ENDED', peer, error: 'This invitation is no longer available on this device.' });
      }
    } catch { if (generation === this.generation && !this.disposed) this.update({ phase: 'FAILED', error: 'This call is no longer available.' }); }
    finally { if (generation === this.generation && !this.disposed) this.update({ busy: false }); }
  }
  /** A late navigation cleanup cannot end a different call generation. */
  captureNavigationCleanup() {
    const generation = this.generation;
    return () => { if (!this.disposed && generation === this.generation && !['ENDING', 'ENDED', 'FAILED', 'IDLE'].includes(this.view.phase)) void this.hangup(); };
  }
  async accept(): Promise<void> {
    if (!this.view.incoming || this.view.busy || this.view.session?.state !== 'RINGING' || this.disposed) return;
    const generation = this.generation; this.accepting = true; this.update({ busy: true, error: null });
    try {
      if (!await this.permission() || generation !== this.generation || this.disposed) return;
      const session = this.view.session!;
      const accepted = await this.dependencies.api.act(session.id, 'accept', session.version, this.dependencies.deviceId);
      if (!this.sameCall(session, accepted)) throw new Error('invalid_session');
      if (generation !== this.generation || this.disposed) { await this.endOnServer(accepted); return; }
      this.acceptedHere = true;
      await this.reconcile(accepted);
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.update({ error: safeError(error) });
      if (error instanceof Error && error.message === 'connect_device_conflict') await this.finishLocal('ENDED');
      else await this.refresh();
    } finally { if (generation === this.generation) { this.accepting = false; this.update({ busy: false }); } }
  }
  private async endOnServer(session: ConnectSession): Promise<'pending' | 'terminal' | 'unconfirmed'> {
    if (!this.participant(session)) return 'unconfirmed';
    if (terminalStates.includes(session.state)) return 'terminal';
    const d = this.dependencies;
    const early = ['REQUESTED', 'RINGING'].includes(session.state);
    const action = early ? (session.caller_profile_id === d.selfProfileId ? 'cancel' : 'decline') : 'end';
    const classify = (reply: ConnectSession) => {
      if (!this.sameCall(session, reply)) throw new Error('invalid_session');
      return terminalStates.includes(reply.state) ? 'terminal' as const : reply.state === 'ENDING' ? 'pending' as const : 'unconfirmed' as const;
    };
    try { return classify(await d.api.act(session.id, action, session.version, d.deviceId)); }
    catch {
      // Accept/cancel can race. Reload once and terminate the winning state.
      try {
        const fresh = await d.api.getCall(session.id);
        if (!this.sameCall(session, fresh)) return 'unconfirmed';
        if (!terminalStates.includes(fresh.state) && fresh.state !== 'ENDING') {
          const next = ['REQUESTED', 'RINGING'].includes(fresh.state) ? action : 'end';
          return classify(await d.api.act(fresh.id, next, fresh.version, d.deviceId));
        }
        return classify(fresh);
      } catch { /* Server deadline/worker remains authoritative when offline. */ }
      return 'unconfirmed';
    }
  }
  private stopLocal(generation = this.generation) {
    this.update({ localShutdown: pendingShutdown(), muted: true });
    // A void legacy transport, or a resolved leave alone, cannot verify capture.
    let stopping: ReturnType<VoiceTransport['leave']>;
    try { stopping = this.dependencies.transport.leave(); }
    catch { stopping = Promise.reject(new Error('connect_shutdown_failed')); }
    return Promise.resolve(stopping).then(value => {
      if (generation === this.generation && !this.disposed) this.update({ localShutdown: normalizeShutdown(value) });
    }, () => {
      if (generation === this.generation && !this.disposed) this.update({ localShutdown: { ...unverifiedShutdown(), sdkLeave: 'failed' } });
    });
  }
  endCallAndBlock(): Promise<void> {
    if ((this.dependencies.flags ?? connectFeatureFlags).endCallAndBlock !== true) return Promise.reject(new Error('connect_disabled'));
    if (this.disposed) return Promise.reject(new Error('connect_unavailable'));
    if (this.blocking) return this.blocking;
    if (!this.endBlockIntent) {
      const call = this.view.session;
      if (!call || !this.participant(call)) return Promise.reject(new Error('connect_unavailable'));
      const peer = call.caller_profile_id === this.dependencies.selfProfileId ? call.recipient_profile_id : call.caller_profile_id;
      const generation = ++this.generation;
      this.cancelledDuringStart = true; this.accepting = false; this.joining = false; this.transportState = 'left';
      this.endBlockIntent = { call: { ...call }, peer, key: this.dependencies.uuid(), generation, preparationAttempted: false };
      this.update({ phase: 'ENDING', busy: true, endBlock: pendingEndBlock() });
      void this.stopLocal(generation);
    }
    this.blocking = this.commitEndBlock().finally(() => { this.blocking = null; });
    return this.blocking;
  }
  private async commitEndBlock() {
    const intent = this.endBlockIntent!; const api = this.dependencies.api;
    const current = () => !this.disposed && this.generation === intent.generation && this.endBlockIntent === intent;
    this.update({ busy: true });
    try {
      if (!api.prepareEndBlock || !api.endCallAndBlock) throw new Error('connect_unavailable');
      if (!intent.context) {
        if (intent.preparationAttempted) throw new Error('connect_unavailable');
        intent.preparationAttempted = true;
        const value = await api.prepareEndBlock(intent.call, intent.peer);
        if (!current()) return;
        const context = readEndBlockContext(value, intent.call, intent.peer);
        if (context.actor_user_id !== this.dependencies.userId) throw new Error('connect_unavailable');
        intent.context = context;
      }
      const receipt = readEndBlockReceipt(await api.endCallAndBlock(intent.context, intent.key), intent.context, intent.key);
      if (current()) this.update({ phase: 'ENDED', endBlock: { block: receipt.block, call: receipt.call, provider: receipt.provider, media: 'unverified', error: null } });
    } catch {
      if (!current()) return;
      // Reconcile by reading; never obtain a new baseline or recreate a block on retry.
      if (intent.context && api.getEndBlockStatus) {
        try {
          const value = await api.getEndBlockStatus(intent.context);
          if (!current()) return;
          if (value !== null) {
            const r = readEndBlockReceipt(value, intent.context);
            this.update({ phase: 'ENDED', endBlock: { block: r.block, call: r.call, provider: r.provider, media: 'unverified', error: null } });
            return;
          }
        } catch { /* A lost response is still an unresolved authority state. */ }
      }
      if (current()) this.update({ endBlock: { ...(this.view.endBlock ?? pendingEndBlock()), error: 'Blocking has not been confirmed.' } });
    } finally { if (current()) this.update({ busy: false }); }
  }
  async refreshEndBlockStatus(): Promise<void> {
    const intent = this.endBlockIntent; const read = this.dependencies.api.getEndBlockStatus;
    if (!intent?.context || !read || this.disposed || this.readingEndBlock) return;
    const context = intent.context;
    this.readingEndBlock = true;
    try {
      const value = await read.call(this.dependencies.api, context);
      if (this.disposed || this.endBlockIntent !== intent || this.generation !== intent.generation || value === null) return;
      const r = readEndBlockReceipt(value, context);
      this.update({ phase: 'ENDED', endBlock: { block: r.block, call: r.call, provider: r.provider, media: 'unverified', error: null } });
    } catch { /* Failed reads never revoke or upgrade an earlier acknowledged fact. */ }
    finally { this.readingEndBlock = false; }
  }
  async hangup(): Promise<void> {
    this.cancelledDuringStart = true;
    this.accepting = false;
    const session = this.view.session;
    const generation = this.endBlockIntent ? this.generation : ++this.generation;
    this.update({ phase: 'ENDING', busy: true, endStatus: 'pending' });
    // Stop capture first, even if the network/backend is unavailable.
    void this.stopLocal(generation);
    this.joining = false; this.transportState = 'left';
    const endStatus = session ? await this.endOnServer(session) : undefined;
    if (generation === this.generation && !this.endBlockIntent) this.update({ phase: 'ENDED', busy: false, muted: true, endStatus });
  }
  decline = () => this.hangup();
  async interrupted(reason: NonNullable<VoiceViewState['interruption']>) {
    if (this.disposed || ['IDLE', 'ENDING', 'ENDED', 'FAILED'].includes(this.view.phase)) return;
    this.update({ interruption: reason });
    await this.hangup();
  }
  private async finishLocal(phase: 'ENDED' | 'FAILED') {
    void this.stopLocal();
    this.joining = false; this.transportState = 'left'; this.reconnectAt = null;
    this.update({ phase, busy: false, muted: true });
  }
  private async reconcile(session: ConnectSession) {
    if (this.disposed || !this.participant(session) || ['ENDED', 'FAILED'].includes(this.view.phase)) return;
    if (this.view.session && (!this.sameCall(this.view.session, session) || this.view.session.version > session.version
      || terminalStates.includes(this.view.session.state))) return;
    this.update({ session, authorityStatus: 'current', durationSeconds: session.ended_at ? connectedDuration(session.connected_at, session.ended_at) : this.view.durationSeconds });
    if (terminalStates.includes(session.state)) {
      this.update({ endStatus: 'terminal' });
      await this.finishLocal(session.state === 'FAILED' ? 'FAILED' : 'ENDED'); return;
    }
    if (session.state === 'ENDING') { void this.stopLocal(); this.update({ phase: 'ENDING', muted: true }); return; }
    if (['ACCEPTED', 'CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(session.state)) {
      if (this.view.incoming && !this.acceptedHere) {
        if (this.accepting) { this.update({ phase: 'CONNECTING' }); return; }
        this.update({ error: 'This call was answered on another device.' });
        await this.finishLocal('ENDED'); return;
      }
      this.renderConnection();
      if (!this.joining && !this.connecting) await this.connectAudio();
    } else this.update({ phase: session.state === 'RINGING' ? 'RINGING' : 'REQUESTED' });
  }
  private renderConnection() {
    const session = this.view.session;
    if (!session || terminalStates.includes(session.state) || ['ENDING', 'ENDED', 'FAILED'].includes(this.view.phase)) return;
    const active = session.state === 'ACTIVE' && this.transportState === 'joined' && this.view.audioSetupStage === 'ready';
    const reconnecting = session.state === 'RECONNECTING' || this.transportState === 'reconnecting';
    this.update({ phase: reconnecting ? 'RECONNECTING' : active ? 'ACTIVE' : 'CONNECTING', routes: [...this.dependencies.transport.routes()],
      durationSeconds: session.connected_at ? connectedDuration(session.connected_at, session.ended_at ?? new Date(this.dependencies.now()).toISOString()) : null });
  }
  private connectAudio(): Promise<void> {
    const generation = this.generation;
    this.audioHealth = createAudioHealthMonitor();
    this.connecting = (async () => {
      const d = this.dependencies; const session = this.view.session!;
      let stage: AudioSetupStage = 'credentials';
      try {
        if (this.view.permission !== 'granted' && !await this.permission()) { await this.hangup(); return; }
        this.update({ audioSetupStage: stage });
        const admission = await d.api.credentials(session.id, d.deviceId);
        if (generation !== this.generation || this.disposed) return;
        if (admission.user.id !== d.userId || admission.media !== 'voice' || admission.call.id !== session.id) throw new Error('invalid_admission');
        stage = 'native_join';
        this.update({ audioSetupStage: stage });
        this.mediaAttempted = true;
        await d.transport.join(admission, () => d.api.credentials(session.id, d.deviceId), (state) => {
          if (generation !== this.generation || this.disposed) return;
          this.transportState = state;
          if (state === 'reconnecting') this.reconnectAt ??= d.now();
          if (state === 'joined') this.reconnectAt = null;
          if (state === 'failed' || state === 'left') {
            this.update({ error: state === 'failed' ? 'The audio connection was lost.' : null });
            void this.hangup(); return;
          }
          this.renderConnection();
        });
        if (generation !== this.generation || this.disposed) { await d.transport.leave(); return; }
        this.joining = true;
        const muted = !this.view.foreground;
        stage = 'microphone';
        this.update({ audioSetupStage: stage });
        await d.transport.setMuted(muted);
        if (generation !== this.generation || this.disposed) { await d.transport.leave(); return; }
        const routes = d.transport.routes();
        const route = routes.includes('earpiece') ? 'earpiece' : routes[0] ?? 'speaker';
        stage = 'audio_output';
        this.update({ audioSetupStage: stage });
        // Cached availability may still be empty while the native route event
        // is in flight. Always require the owner's fresh output confirmation.
        await d.transport.selectRoute(route);
        if (generation !== this.generation || this.disposed) return;
        this.update({ muted, routes: [...d.transport.routes()], route, audioSetupStage: 'ready' });
        this.renderConnection();
      } catch (error) {
        if (generation === this.generation && !this.disposed) {
          const failure = audioSetupFailure(stage, error);
          // The compatibility check runs before the SDK/client/factory loads.
          if (failure.code === 'native_build_incompatible') this.mediaAttempted = false;
          const knownError = error instanceof Error && ['connect_device_conflict', 'stream_native_owner_busy', 'stream_client_release_pending'].includes(error.message);
          const message = knownError ? safeError(error) : audioSetupMessage(failure);
          this.update({ audioSetupFailure: failure, error: message });
          if (error instanceof Error && error.message === 'connect_device_conflict') { ++this.generation; await this.finishLocal('ENDED'); }
          else { await this.hangup(); this.update({ phase: 'FAILED', audioSetupFailure: failure, error: message }); }
        }
      }
    })().finally(() => { this.connecting = null; this.update({}); });
    return this.connecting;
  }
  async toggleMute() {
    if (!this.joining || !this.view.foreground || !['ACTIVE', 'CONNECTING', 'RECONNECTING'].includes(this.view.phase)) return;
    const generation = this.generation, request = ++this.muteRequest;
    const current = () => generation === this.generation && !this.disposed && request === this.muteRequest;
    const muted = !this.view.muted;
    try { await this.dependencies.transport.setMuted(muted); if (current()) this.update({ muted }); }
    catch { if (current()) this.update({ error: 'Microphone control is unavailable.' }); }
  }
  async selectRoute(route: VoiceRoute) {
    if (this.view.audioSetupStage && this.view.audioSetupStage !== 'ready') return;
    if (!this.joining || !this.view.foreground || !['ACTIVE', 'CONNECTING', 'RECONNECTING'].includes(this.view.phase) || !this.dependencies.transport.routes().includes(route)) return;
    const generation = this.generation, request = ++this.routeRequest;
    const current = () => generation === this.generation && !this.disposed && request === this.routeRequest;
    try { await this.dependencies.transport.selectRoute(route); if (current()) this.update({ route, routes: this.dependencies.transport.routes() }); }
    catch { if (current()) this.update({ error: 'That audio output is unavailable.' }); }
  }
  async refreshEndStatus() {
    const session = this.view.session, generation = this.generation;
    if (!session || !this.view.endStatus || this.view.endStatus === 'terminal' || this.polling || this.disposed || this.endBlockIntent) return;
    this.polling = true;
    try {
      const fresh = await this.dependencies.api.getCall(session.id);
      if (generation !== this.generation || this.disposed || !this.sameCall(session, fresh)) return;
      if (terminalStates.includes(fresh.state)) this.update({ session: fresh, endStatus: 'terminal' });
    } catch { /* Read failure cannot certify authoritative termination. */ }
    finally { this.polling = false; }
  }
  async refresh() {
    const current = this.view.session; const generation = this.generation;
    if (!current || this.disposed || this.polling) return;
    this.polling = true;
    try { const session = await this.dependencies.api.getCall(current.id); if (generation === this.generation) await this.reconcile(session); }
    catch {
      if (generation !== this.generation || this.disposed) return;
      this.update({ authorityStatus: 'unavailable' });
      if (this.dependencies.failClosedAuthority) {
        this.update({ error: 'Calling permission could not be checked. The call is ending.' });
        void this.hangup();
      }
    }
    finally { this.polling = false; }
  }
  async tick() {
    if (this.disposed) return;
    const d = this.dependencies;
    if (this.joining && ['CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(this.view.phase)) {
      let sample = null;
      try { sample = d.transport.audioSample?.() ?? null; } catch { /* Missing statistics cannot certify audio delivery. */ }
      this.update({ audioHealth: this.audioHealth.read(sample, d.now()) });
    }
    if (this.endBlockIntent) {
      if (d.now() - this.lastPoll >= 2_000) { this.lastPoll = d.now(); await this.refreshEndBlockStatus(); }
      return;
    }
    if (this.view.endStatus && this.view.endStatus !== 'terminal' && ['ENDING', 'ENDED', 'FAILED'].includes(this.view.phase)) {
      if (d.now() - this.lastPoll >= 2_000) { this.lastPoll = d.now(); await this.refreshEndStatus(); }
      return;
    }
    const session = this.view.session;
    if (session?.deadline && !['ENDED', 'FAILED', 'IDLE'].includes(this.view.phase)
      && Number.isFinite(Date.parse(session.deadline)) && d.now() >= Date.parse(session.deadline)) {
      const ringing = ['REQUESTED', 'RINGING'].includes(session.state);
      this.update({ error: ringing ? 'There was no answer.' : 'The audio connection timed out.' });
      await this.hangup(); if (!ringing) this.update({ phase: 'FAILED' }); return;
    }
    if (this.reconnectAt !== null && !['IDLE', 'ENDING', 'ENDED', 'FAILED'].includes(this.view.phase) && d.now() - this.reconnectAt >= 30_000) { this.update({ error: 'The connection could not recover.' }); await this.hangup(); this.update({ phase: 'FAILED' }); return; }
    if (!this.view.foreground) return;
    const interval = this.view.session ? 2_000 : 5_000;
    if (d.now() - this.lastPoll < interval) { if (this.view.session?.connected_at) this.renderConnection(); return; }
    this.lastPoll = d.now();
    if (this.view.session && !['ENDED', 'FAILED'].includes(this.view.phase)) await this.refresh();
    else if (!this.view.session && !this.starting && !this.polling) {
      this.polling = true;
      try {
        const rows = await d.api.getHistory(null, 30);
        const candidate = rows.find((s) => s.recipient_profile_id === d.selfProfileId && s.media === 'voice' && s.state === 'RINGING');
        if (candidate) await this.receive(candidate);
      } catch { /* Foreground hints are best effort and never bypass getCall. */ }
      finally { this.polling = false; }
    }
    if (this.view.session?.connected_at) this.renderConnection();
  }
  async setForeground(foreground: boolean) {
    this.update({ foreground });
    if (!foreground && this.joining) {
      await this.dependencies.transport.setMuted(true).catch(() => undefined);
      this.update({ muted: true }); // No automatic microphone restart after interruption/background.
    }
    if (foreground) { this.lastPoll = -Infinity; await this.tick(); }
  }
  canDismissCompletedCall() {
    const authorityEnded = !this.view.session || this.view.endStatus === 'terminal'
      || terminalStates.includes(this.view.session.state) || this.view.endBlock?.call === 'terminal';
    const released = !this.mediaAttempted || (this.view.localShutdown.sdkLeave === 'completed'
      && this.view.localShutdown.resourceRelease === 'completed');
    return !this.disposed && ['ENDED', 'FAILED', 'IDLE'].includes(this.view.phase) && authorityEnded && released
      && !this.starting && !this.connecting && !this.blocking;
  }
  /** Dismiss presentation only after known authority/local-owner work is settled.
   * No native attempt means no SDK resources to release, never hardware proof. */
  dismissCompletedCall() {
    if (!this.canDismissCompletedCall()) return false;
    this.reset(); return this.view.phase === 'IDLE';
  }
  reset() {
    if (!['ENDED', 'FAILED', 'IDLE'].includes(this.view.phase) || this.starting || this.connecting) return;
    ++this.generation; this.endBlockIntent = null; this.request = null; this.acceptedHere = false; this.accepting = false; this.mediaAttempted = false;
    this.quality = createCallQualityTracker(); this.update(initial());
  }
  async logout() {
    if (this.disposed) return;
    const session = this.view.session;
    ++this.generation; this.endBlockIntent = null; this.request = null;
    void this.stopLocal(); ++this.generation;
    if (session) void this.endOnServer(session);
    this.quality = createCallQualityTracker(); this.update(initial());
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true; ++this.generation; this.listeners.clear();
    this.endBlockIntent = null;
    void this.stopLocal();
    if (this.view.session) void this.endOnServer(this.view.session);
  }
}
