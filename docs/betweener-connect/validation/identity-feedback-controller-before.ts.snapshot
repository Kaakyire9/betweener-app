import { connectedDuration, terminalStates, type ConnectAuthorization, type ConnectSession, type ConnectMedia } from '../domain/connect.ts';
import { launchAllowsCalling, launchAllowsSession } from '../domain/calling-launch-policy.ts';
import type { PrivateCameraPreview } from '../video/private-camera-preview.ts';
import { cameraOff } from '../video/video-types.ts';
import type { MicrophonePermission, VoiceApi, VoicePeer, VoiceTransport, VoiceTransportState, VoiceViewState, VoiceRoute } from './voice-types.ts';
import { connectFeatureFlags, type ConnectFeatureFlags } from '../config/connect-feature-flags.ts';
import { pendingShutdown, unverifiedShutdown, normalizeShutdown } from '../media/local-shutdown.ts';
import { pendingEndBlock, readEndBlockContext, readEndBlockReceipt, type EndBlockContext } from '../domain/end-block.ts';
import { audioSetupFailure, audioSetupMessage, prepareJoinedAudio, type AudioSetupStage } from './audio-setup.ts';
import { createAudioHealthMonitor, retireAudioHealth } from '../media/audio-health.ts';
import type { AudioSample } from '../media/audio-health.ts';
import { createCallQualityTracker } from './call-quality.ts';
import { CONNECT_RECOVERY_ATTEMPTS, CONNECT_RECOVERY_RELEASE_MS, CONNECT_RECOVERY_TOTAL_MS, recoveryAuthorityMatches, sdkOwnerReleased, withinRecoveryBudget } from '../media/recovery-policy.ts';

interface VoiceDependencies {
  cameraPreview?: PrivateCameraPreview;
  nativeAnswerAllowed?(cid: string): boolean;
  checkPermission?(): Promise<MicrophonePermission>;
  encryptionInfo?(): { safetyCode?: string; identityVerified: boolean };
  verifyIdentity?(code: string): Promise<void>;
  reviewIdentity?(peer: string, media: ConnectMedia, authorization: ConnectAuthorization, grant: string | null): Promise<string>;
  replaceIdentity?(peer: string, media: ConnectMedia, authorization: ConnectAuthorization, grant: string | null, code: string): Promise<void>;
  failClosedAuthority?: boolean;
  api: VoiceApi; transport: VoiceTransport; selfProfileId: string; userId: string; deviceId: string;
  permission(): Promise<MicrophonePermission>; uuid(): string; now(): number;
  cameraPermission?(): Promise<MicrophonePermission>;
  peer(profileId: string): Promise<VoicePeer>;
  flags?: ConnectFeatureFlags;
}
const initial = (): VoiceViewState => ({ requestedMedia: undefined, backgroundAudio: 'off', minimized: false, video: undefined, audioHealth: undefined, quality: undefined, interruption: undefined, audioSetupStage: undefined, audioSetupFailure: undefined, endStatus: undefined, localShutdown: unverifiedShutdown(), endBlock: null, phase: 'IDLE', session: null, peer: null, incoming: false, muted: true,
  route: 'earpiece', routes: [], permission: null, error: null, busy: false, durationSeconds: null, foreground: true });
const safeError = (error: unknown, media: ConnectMedia = 'voice'): string => {
  const code = error instanceof Error ? error.message : '';
  if (code === 'connect_busy') return 'They are already on a call. Try again later.';
  if (code === 'connect_consent_required') return `${media === 'video' ? 'Video' : 'Voice'} calling has not been approved for this connection.`;
  if (code === 'connect_device_conflict') return 'This call was answered on another device.';
  if (code === 'connect_disabled') return `${media === 'video' ? 'Video' : 'Voice'} calling is currently unavailable.`;
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
  private request: { peer: VoicePeer; media: ConnectMedia; authorization: ConnectAuthorization; grant: string | null; key: string } | null = null;
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
  private recovering: Promise<void> | null = null;
  private recoveryGeneration: number | null = null;
  private hangingUp: Promise<void> | null = null;
  private hangupGeneration: number | null = null;
  private recoveryAttempts = 0;
  private lastPoll = -Infinity;
  private muteRequest = 0;
  private microphoneIntent: boolean | null = null;
  private routeRequest = 0;
  private cameraRequest = 0;
  private cameraIntent = false;
  private audioHealth = createAudioHealthMonitor();
  private quality = createCallQualityTracker();
  private audioUnsubscribe: (() => void) | null = null;
  private routeUnsubscribe: (() => void) | null = null;
  private lastAudioTimestamp: number | null = null;
  private blocking: Promise<void> | null = null;
  private readingEndBlock = false;
  private endBlockIntent: { call: ConnectSession; peer: string; key: string; generation: number; preparationAttempted: boolean; context?: EndBlockContext } | null = null;
  constructor(dependencies: VoiceDependencies) { this.dependencies = dependencies; }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private setupAllowed(id = this.view.session?.id) { return this.view.foreground || (!!id && this.dependencies.flags?.nativeIncoming === true && this.dependencies.nativeAnswerAllowed?.(`betweener_connect:${id}`) === true); }
  private update(patch: Partial<VoiceViewState>) {
    if (this.disposed) return;
    const now = this.dependencies.now();
    if (patch.audioSetupStage) this.quality.mark(patch.audioSetupStage, now);
    if (patch.audioHealth?.reception === 'receiving') this.quality.mark('receiver_growth', now);
    if (patch.phase === 'ENDING') this.quality.mark('end_requested', now);
    if (patch.endStatus === 'terminal') this.quality.mark('authority_terminal', now);
    if (patch.localShutdown?.sdkLeave === 'completed' && patch.localShutdown.resourceRelease === 'completed') this.quality.mark('sdk_released', now);
    this.view = { ...this.view, ...patch, quality: this.quality.snapshot() }; for (const listener of this.listeners) listener();
  }
  private participant(session: ConnectSession): boolean {
    return (session.media === 'voice' || (this.dependencies.flags?.videoCalling === true && session.media === 'video'))
      && [session.caller_profile_id, session.recipient_profile_id].includes(this.dependencies.selfProfileId);
  }
  private sameCall(a: ConnectSession, b: ConnectSession): boolean {
    return a.id === b.id && a.created_at === b.created_at && a.caller_profile_id === b.caller_profile_id
      && a.recipient_profile_id === b.recipient_profile_id && a.media === b.media && a.authorization === b.authorization;
  }
  private async permission(generation = this.generation): Promise<boolean> {
    const check = this.view.foreground ? this.dependencies.permission : this.dependencies.checkPermission;
    const permission = check ? await check() : 'blocked';
    if (generation !== this.generation || this.disposed) return false;
    this.update({ permission });
    if (permission !== 'granted') this.update({ error: permission === 'blocked'
      ? 'Allow microphone access in Settings to join a voice call.' : 'Microphone permission is needed for a voice call.' });
    return permission === 'granted';
  }
  private async prepareCameraPermission(media: ConnectMedia, generation: number) {
    if (media !== 'video' || !this.dependencies.cameraPermission) return;
    let permission: MicrophonePermission = 'denied';
    try { permission = await this.dependencies.cameraPermission(); } catch { /* Camera denial never certifies capture or audio failure. */ }
    if (generation !== this.generation || this.disposed) return;
    if (permission !== 'granted') this.cameraIntent = false;
    this.update({ video: { ...this.view.video, ...cameraOff(), cameraWanted: this.cameraIntent, permission, error: permission === 'granted' ? null
      : 'Camera access is off. You can continue by voice, or enable camera access in Settings before your next video call.' } });
  }
  start(peer: VoicePeer, authorization: ConnectAuthorization, grant: string | null = null, media: ConnectMedia = 'voice'): Promise<void> {
    if (this.disposed || !this.view.foreground) return Promise.resolve();
    if (!launchAllowsCalling(authorization, grant)) { this.update({ error: 'Calling is available between matches.' }); return Promise.resolve(); }
    if (media !== 'voice' && (media !== 'video' || this.dependencies.flags?.videoCalling !== true)) {
      this.update({ error: 'Video calling is currently unavailable.' }); return Promise.resolve();
    }
    if (this.starting) return this.starting;
    if (this.view.session) {
      if (!this.canDismissCompletedCall()) return Promise.resolve();
      this.reset();
    }
    if (this.request && (this.request.media !== media || this.request.peer.profileId !== peer.profileId || this.request.authorization !== authorization || this.request.grant !== grant)) {
      this.update({ error: 'Resolve the previous call attempt before starting another.' }); return Promise.resolve();
    }
    this.request ??= { peer, media, authorization, grant, key: this.dependencies.uuid() };
    const generation = ++this.generation; this.cancelledDuringStart = false; this.acceptedHere = false;
    this.mediaAttempted = false;
    this.cameraIntent = media === 'video' && this.dependencies.flags?.videoCameraOnEntry === true;
    this.quality = createCallQualityTracker();
    this.update({ ...initial(), foreground: this.view.foreground, peer, busy: true, phase: 'REQUESTED', requestedMedia: media,
      video: media === 'video' ? { ...cameraOff(), cameraWanted: this.cameraIntent } : undefined });
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
      await this.prepareCameraPermission(request.media, generation);
      if (generation !== this.generation || this.disposed || this.cancelledDuringStart) return;
      const session = await d.api.createCall(request.peer.profileId, request.media, request.authorization, request.key, d.deviceId, request.grant);
      if (!this.participant(session) || session.media !== request.media || session.caller_profile_id !== d.selfProfileId || session.recipient_profile_id !== request.peer.profileId) throw new Error('invalid_session');
      this.request = null;
      if (generation !== this.generation || this.disposed || this.cancelledDuringStart) { await this.endOnServer(session); return; }
      await this.reconcile(session);
      if (this.cameraIntent) void this.startPrivatePreview(generation);
    } catch (error) { if (generation === this.generation) this.update({ phase: 'FAILED', error: safeError(error, request.media) }); }
  }
  async receive(session: ConnectSession): Promise<void> {
    if (this.disposed || !launchAllowsSession(session) || !this.setupAllowed(session.id) || !this.participant(session) || session.recipient_profile_id !== this.dependencies.selfProfileId
      || session.state !== 'RINGING' || this.view.session || this.starting) return;
    const generation = this.generation;
    try {
      // History/events are invalidation hints; reload canonical state before answer UI.
      const fresh = await this.dependencies.api.getCall(session.id);
      if (generation !== this.generation || this.disposed || fresh.state !== 'RINGING' || !this.participant(fresh)
        || !this.sameCall(session, fresh) || fresh.recipient_profile_id !== this.dependencies.selfProfileId) return;
      const peer = await this.dependencies.peer(fresh.caller_profile_id);
      if (generation !== this.generation || this.disposed || !this.setupAllowed(session.id) || this.view.session || peer.profileId !== fresh.caller_profile_id) return;
      this.cameraIntent = false;
      this.update({ session: fresh, peer, incoming: true, phase: 'RINGING', error: null,
        video: fresh.media === 'video' ? { ...cameraOff(), cameraWanted: this.dependencies.flags?.videoCameraOnEntry === true } : undefined });
    } catch { /* No invitation is rendered from an unauthorized/stale hint. */ }
  }
  /** Open a canonical notification/history target without accepting or joining it. */
  async openCall(callId: string): Promise<void> {
    if (this.disposed || this.starting || !this.setupAllowed(callId)) return;
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
    this.update({ ...initial(), foreground: this.view.foreground, busy: true });
    try {
      const call = await this.dependencies.api.getCall(callId);
      if (call.id !== callId || !this.participant(call)) throw new Error('invalid_session');
      const peerId = call.caller_profile_id === this.dependencies.selfProfileId ? call.recipient_profile_id : call.caller_profile_id;
      const peer = await this.dependencies.peer(peerId);
      if (generation !== this.generation || this.disposed) return;
      if (peer.profileId !== peerId) throw new Error('invalid_session');
      if (!terminalStates.includes(call.state) && !launchAllowsSession(call)) {
        this.update({ phase: 'FAILED', peer, error: 'Calling is available between matches.' }); return;
      }
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
  async accept(options?: { cameraOn?: boolean }): Promise<void> {
    if (!this.setupAllowed() || !this.view.incoming || this.view.busy || this.view.session?.state !== 'RINGING' || this.disposed) return;
    if (!launchAllowsSession(this.view.session)) return;
    const generation = this.generation;
    // A generic native Answer remains camera-off; the in-app Answer passes the visible toggle explicitly.
    this.cameraIntent = this.dependencies.flags?.videoCameraOnEntry === true && this.view.session.media === 'video' && options?.cameraOn === true;
    this.accepting = true; this.update({ busy: true, error: null, video: this.view.video ? { ...this.view.video, cameraWanted: this.cameraIntent } : undefined });
    try {
      if (!await this.permission() || generation !== this.generation || this.disposed) return;
      const session = this.view.session!;
      if (this.view.foreground && (this.cameraIntent || this.dependencies.flags?.videoCameraOnEntry !== true)) await this.prepareCameraPermission(session.media, generation);
      if (generation !== this.generation || this.disposed) return;
      const accepted = await this.dependencies.api.act(session.id, 'accept', session.version, this.dependencies.deviceId);
      if (!this.sameCall(session, accepted)) throw new Error('invalid_session');
      if (generation !== this.generation || this.disposed) { await this.endOnServer(accepted); return; }
      this.acceptedHere = true;
      await this.reconcile(accepted);
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.update({ error: safeError(error, this.view.session?.media) });
      if (error instanceof Error && error.message === 'connect_device_conflict') await this.finishLocal('ENDED');
      else await this.refresh();
    } finally { if (generation === this.generation) { this.accepting = false; this.update({ busy: false }); } }
  }
  private async endOnServer(session: ConnectSession): Promise<'pending' | 'terminal' | 'unconfirmed'> {
    if (!this.participant(session)) return 'unconfirmed';
    if (terminalStates.includes(session.state)) return 'terminal';
    if (session.state === 'ENDING') return 'pending';
    const d = this.dependencies;
    const generation = this.generation;
    const early = ['REQUESTED', 'RINGING'].includes(session.state);
    const action = early ? (session.caller_profile_id === d.selfProfileId ? 'cancel' : 'decline') : 'end';
    const classify = (reply: ConnectSession) => {
      if (!this.sameCall(session, reply)) throw new Error('invalid_session');
      const status = terminalStates.includes(reply.state) ? 'terminal' as const : reply.state === 'ENDING' ? 'pending' as const : 'unconfirmed' as const;
      const current = this.view.session;
      const ownsCurrent = !this.disposed && generation === this.generation && current && this.sameCall(current, reply);
      if (ownsCurrent && terminalStates.includes(current.state)) return 'terminal' as const;
      if (ownsCurrent && reply.version < current.version) return 'unconfirmed' as const;
      // Retain the canonical acknowledgement, rather than leaving ACTIVE/version
      // from before End in the UI. An old call/generation never replaces a successor.
      if (ownsCurrent && status !== 'unconfirmed') {
        this.update({ session: reply, authorityStatus: 'current' });
      }
      return status;
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
    ++this.muteRequest;
    const subscriptions = [this.audioUnsubscribe, this.routeUnsubscribe];
    this.audioUnsubscribe = null; this.routeUnsubscribe = null;
    for (const unsubscribe of subscriptions) {
      try { unsubscribe?.(); } catch { /* Observability cannot suppress local shutdown. */ }
    }
    this.update({ backgroundAudio: 'off', minimized: false, localShutdown: pendingShutdown(), muted: true, muteControl: undefined, audioHealth: retireAudioHealth(this.view.audioHealth) });
    // A void legacy transport, or a resolved leave alone, cannot verify capture.
    let stopping: ReturnType<VoiceTransport['leave']>;
    try { stopping = this.dependencies.transport.leave(); }
    catch { stopping = Promise.reject(new Error('connect_shutdown_failed')); }
    return Promise.allSettled([Promise.resolve(stopping), this.stopPrivatePreview(generation)]).then(([transport, preview]) => {
      if (generation !== this.generation || this.disposed) return;
      const localShutdown = transport.status === 'fulfilled' ? normalizeShutdown(transport.value) : { ...unverifiedShutdown(), sdkLeave: 'failed' as const };
      if (preview.status === 'rejected') localShutdown.resourceRelease = 'failed';
      this.update({ localShutdown });
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
  hangup(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.hangingUp && this.hangupGeneration === this.generation) return this.hangingUp;
    const session = this.view.session;
    const acknowledged = session?.state === 'ENDING' || (session && terminalStates.includes(session.state))
      || (['ENDED', 'FAILED'].includes(this.view.phase) && ['pending', 'terminal'].includes(this.view.endStatus ?? ''));
    if (acknowledged && ['ENDING', 'ENDED', 'FAILED'].includes(this.view.phase)) {
      // A late native End must not reopen presentation or repeat an acknowledged
      // server command. Failed SDK release can still be explicitly retried.
      if (this.view.localShutdown.sdkLeave === 'failed' || this.view.localShutdown.resourceRelease === 'failed') return this.stopLocal();
      return Promise.resolve();
    }
    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    // Publish the shared request before synchronous native/listener callbacks.
    const generation = this.endBlockIntent ? this.generation : ++this.generation;
    this.hangingUp = pending;
    this.hangupGeneration = generation;
    void this.performHangup(generation).then(() => {
      if (this.hangingUp === pending) { this.hangingUp = null; this.hangupGeneration = null; }
      resolve();
    }, error => {
      if (this.hangingUp === pending) { this.hangingUp = null; this.hangupGeneration = null; }
      reject(error);
    });
    return pending;
  }
  private async performHangup(generation: number): Promise<void> {
    this.cancelledDuringStart = true;
    this.accepting = false;
    this.reconnectAt = null;
    const session = this.view.session;
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
  /** Stop the old owner first. Only a fresh server admission can create its successor. */
  connectionLost(): Promise<void> {
    if (this.recovering && this.recoveryGeneration === this.generation) return this.recovering;
    const d = this.dependencies, call = this.view.session;
    if (d.flags?.connectionRecovery !== true || !d.transport.recover || this.disposed || !this.view.foreground
      || !['ACTIVE', 'CONNECTING'].includes(this.view.phase) || !call || !['ACCEPTED', 'CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(call.state)
      || !this.joining || this.recoveryAttempts >= CONNECT_RECOVERY_ATTEMPTS) return this.interrupted('connection_failed');
    const previousSetup = this.connecting;
    // Setup's safety mute is not a user request. Accepted calling still intends
    // to start the mic after the ordinary permission and admission checks.
    const generation = ++this.generation;
    const muted = this.microphoneIntent ?? (this.view.audioSetupStage === 'ready' ? this.view.muted : false);
    const route = this.view.route, minimized = this.view.minimized;
    this.recoveryGeneration = generation;
    ++this.recoveryAttempts; this.joining = false; this.transportState = 'reconnecting'; this.reconnectAt = d.now();
    const current = () => generation === this.generation && !this.disposed && this.view.foreground;
    this.update({ phase: 'RECONNECTING', busy: true, error: null, video: call.media === 'video' ? cameraOff() : undefined });
    this.recovering = withinRecoveryBudget(async () => {
      await withinRecoveryBudget(() => this.stopLocal(generation), CONNECT_RECOVERY_RELEASE_MS);
      if (!current()) return;
      if (!sdkOwnerReleased(this.view.localShutdown)) throw Error('connect_recovery_release_incomplete');
      // The retired setup must settle before its successor can own media. The
      // unchanged total recovery deadline also bounds this wait.
      if (previousSetup) await previousSetup;
      if (!current()) return;
      const fresh = await d.api.getCall(call.id);
      if (!current()) return;
      if (this.sameCall(call, fresh) && fresh.version >= call.version
        && (fresh.state === 'ENDING' || terminalStates.includes(fresh.state))) {
        // The peer's End can reach the SDK before our authority poll. Local
        // teardown has completed; acknowledge the same call without rejoining,
        // reporting a recovery failure, or sending another End request.
        this.transportState = 'left'; this.reconnectAt = null;
        this.update({ session: fresh, authorityStatus: 'current', error: null, busy: false, muted: true,
          phase: fresh.state === 'FAILED' ? 'FAILED' : 'ENDED',
          endStatus: terminalStates.includes(fresh.state) ? 'terminal' : 'pending',
          durationSeconds: fresh.ended_at ? connectedDuration(fresh.connected_at, fresh.ended_at) : this.view.durationSeconds });
        return;
      }
      if (!recoveryAuthorityMatches(call, fresh, d.now())) throw Error('connect_recovery_authority_changed');
      this.update({ session: fresh, minimized, authorityStatus: 'current' });
      await this.connectAudio({ recovery: true, muted, route });
    }, CONNECT_RECOVERY_TOTAL_MS).catch(async () => {
      if (current()) { this.update({ error: 'The connection could not recover safely. The call is ending.' }); await this.hangup(); }
    }).finally(() => {
      if (generation === this.generation) this.update({ busy: false });
      if (this.recoveryGeneration === generation) { this.recovering = null; this.recoveryGeneration = null; }
    });
    return this.recovering;
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
    this.update({ session, video: session.media === 'video' ? this.view.video ?? { ...cameraOff(), cameraWanted: false } : undefined,
      authorityStatus: 'current', durationSeconds: session.ended_at ? connectedDuration(session.connected_at, session.ended_at) : this.view.durationSeconds });
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
    const encryption = this.dependencies.transport.encryptionStatus?.();
    this.update({ encryption: { required: session.encryption_required === true, sdkConfirmed: encryption?.sdkConfirmed === true,
      identityVerified: this.dependencies.encryptionInfo?.().identityVerified === true, safetyCode: this.dependencies.encryptionInfo?.().safetyCode },
      phase: reconnecting ? 'RECONNECTING' : active ? 'ACTIVE' : 'CONNECTING', routes: [...this.dependencies.transport.routes()],
      durationSeconds: session.connected_at ? connectedDuration(session.connected_at, session.ended_at ?? new Date(this.dependencies.now()).toISOString()) : null });
    if (active && this.view.foreground && !this.view.minimized && this.cameraIntent && this.view.video?.camera === 'off'
      && this.dependencies.flags?.videoCameraOnEntry === true) void this.applyCamera(true);
  }
  private connectAudio(recovery?: { recovery: true; muted: boolean; route: VoiceRoute | null }): Promise<void> {
    const generation = this.generation;
    this.audioHealth = createAudioHealthMonitor();
    this.lastAudioTimestamp = null;
    this.connecting = (async () => {
      const d = this.dependencies; const session = this.view.session!;
      let stage: AudioSetupStage = 'credentials';
      try {
        if (this.view.permission !== 'granted' && !await this.permission()) { await this.hangup(); return; }
        // A system permission dialog can finish before RN delivers foreground.
        // Wait for the ordinary foreground/revalidation path instead of joining muted in the background.
        if (!this.setupAllowed() || generation !== this.generation || this.disposed) return;
        await withinRecoveryBudget(() => this.stopPrivatePreview(generation), 5_000);
        if (generation !== this.generation || this.disposed || !this.setupAllowed()) return;
        this.update({ audioSetupStage: stage });
        const admission = await d.api.credentials(session.id, d.deviceId);
        if (generation !== this.generation || this.disposed || !this.setupAllowed()) return;
        if (admission.user.id !== d.userId || admission.media !== session.media || admission.call.id !== session.id) throw new Error('invalid_admission');
        stage = 'native_join';
        this.update({ audioSetupStage: stage });
        this.mediaAttempted = true;
        const join = recovery ? d.transport.recover : d.transport.join;
        if (!join) throw Error('connect_recovery_unavailable');
        await join.call(d.transport, admission, () => d.api.credentials(session.id, d.deviceId), (state) => {
          if (generation !== this.generation || this.disposed) return;
          this.transportState = state;
          if (state === 'reconnecting') this.reconnectAt ??= d.now();
          if (state === 'joined') this.reconnectAt = null;
          if (state === 'failed' || state === 'left') {
            this.update({ error: state === 'failed' ? 'The audio connection was lost.' : null });
            void this.connectionLost(); return;
          }
          this.renderConnection();
        });
        if (generation !== this.generation || this.disposed) { await d.transport.leave(); return; }
        this.joining = true;
        try {
          const unsubscribe = d.transport.observeAudioRoute?.(state => {
            if (generation === this.generation && !this.disposed && this.joining) this.update({ route: state.route, routes: [...state.routes] });
          });
          if (generation === this.generation && !this.disposed && this.joining) this.routeUnsubscribe = unsubscribe ?? null;
          else unsubscribe?.();
        } catch { /* Route inspection cannot change media ownership or confirmation. */ }
        try {
          const unsubscribe = d.transport.observeAudioSamples?.(sample => {
            if (generation === this.generation && !this.disposed && this.joining) this.readAudioSample(sample);
          });
          if (generation === this.generation && !this.disposed && this.joining) this.audioUnsubscribe = unsubscribe ?? null;
          else unsubscribe?.();
        } catch { /* The ordinary tick remains a fallback for missing stats observers. */ }
        if (!this.view.foreground && this.setupAllowed()) {
          if (!d.transport.setBackgroundAudio || !await d.transport.setBackgroundAudio(true)) throw Error('connect_background_unavailable');
          this.update({ backgroundAudio: 'enabled' });
        }
        const muted = !this.setupAllowed() || (this.microphoneIntent ?? recovery?.muted ?? false);
        const routes = d.transport.routes();
        const observed = d.transport.audioRoute?.()?.route;
        const accessory = observed === 'bluetooth' || observed === 'wired' ? observed : null;
        const preferred = accessory ?? (session.media === 'video' ? routes.find(route => route === 'bluetooth' || route === 'wired') ?? 'speaker' : 'earpiece');
        const route = recovery?.route && routes.includes(recovery.route) ? recovery.route : routes.includes(preferred) ? preferred : routes[0] ?? preferred;
        const current = () => generation === this.generation && !this.disposed;
        await prepareJoinedAudio({
          microphone: () => d.transport.setMuted(muted),
          // Discovery can lag capture initialization. Keep the same native
          // deadline and fresh confirmation, preserving a system accessory.
          output: () => d.transport.selectRoute(route, { waitForAvailability: true, preserveAccessory: !recovery?.route }),
          started: step => { if (current()) { stage = step; this.update({ audioSetupStage: step }); } },
          completed: step => { if (current()) { this.quality.mark(step === 'microphone' ? 'microphone_ready' : 'audio_output_ready', d.now()); this.update({}); } },
        });
        if (generation !== this.generation || this.disposed) return;
        const output = d.transport.audioRoute?.();
        this.update({ muted: this.view.muteControl ? this.view.muted : muted, routes: [...(output?.routes ?? d.transport.routes())],
          route: output ? output.route : route, audioSetupStage: 'ready' });
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
    await this.changeMute(!this.requestedMuted(), 'app');
  }
  private requestedMuted() { return this.view.muteControl?.status === 'pending' ? this.view.muteControl.requestedMuted : this.view.muted; }
  private async changeMute(muted: boolean, source: 'app' | 'system') {
    const generation = this.generation, request = ++this.muteRequest;
    const current = () => generation === this.generation && !this.disposed && request === this.muteRequest;
    const control = { request, source, requestedMuted: muted };
    this.microphoneIntent = muted;
    this.update({ muteControl: { ...control, status: 'pending' } });
    try {
      await this.dependencies.transport.setMuted(muted);
      if (current()) this.update({ muted, muteControl: { ...control, status: 'confirmed' } });
    } catch {
      if (!current()) return;
      this.microphoneIntent = this.view.muted;
      this.update({ error: 'Microphone control is unavailable.', muteControl: { ...control, status: 'failed' } });
      if (source === 'system') void this.interrupted('permission_denied');
    }
  }
  async setSystemMuted(muted: boolean) {
    if (this.disposed || !['ACTIVE', 'CONNECTING', 'RECONNECTING'].includes(this.view.phase)
      || (!this.view.foreground && this.view.backgroundAudio !== 'enabled')) return;
    if (!this.joining) { this.microphoneIntent = muted; return; }
    if (this.requestedMuted() === muted && (this.view.muteControl?.status === 'pending' || this.view.audioSetupStage === 'ready')) {
      this.microphoneIntent = muted; return;
    }
    await this.changeMute(muted, 'system');
  }
  async toggleBackgroundAudio() {
    const call = this.view.session, generation = this.generation;
    if (!call || !this.view.foreground || this.view.phase !== 'ACTIVE' || !this.joining || this.disposed
      || this.dependencies.flags?.backgroundAudio !== true || this.view.backgroundAudio === 'starting') return;
    const enabled = this.view.backgroundAudio !== 'enabled';
    this.update({ backgroundAudio: 'starting', error: null });
    try {
      const fresh = await this.dependencies.api.getCall(call.id);
      if (generation !== this.generation || this.disposed) return;
      if (!this.sameCall(call, fresh) || fresh.version < call.version) throw Error('connect_unavailable');
      if (fresh.state !== 'ACTIVE') { this.update({ backgroundAudio: 'off' }); await this.reconcile(fresh); return; }
      const ready = await this.dependencies.transport.setBackgroundAudio?.(enabled);
      if (generation !== this.generation || this.disposed) return;
      if (enabled && ready !== true) throw Error('connect_background_unavailable');
      this.update({ backgroundAudio: enabled ? 'enabled' : 'off' });
    } catch {
      if (generation === this.generation && !this.disposed) this.update({ backgroundAudio: 'unavailable', error: 'Background audio is unavailable on this device. Keep the app open for this call.' });
    }
  }
  async minimize() {
    const generation = this.generation;
    if (this.disposed || !this.joining || !this.view.foreground || this.view.phase !== 'ACTIVE') return false;
    if (this.view.video) {
      this.cameraIntent = false;
      ++this.cameraRequest;
      this.update({ video: { ...this.view.video, camera: 'stopping' } });
      try { await this.dependencies.transport.setCameraEnabled?.(false); }
      catch { if (generation === this.generation) this.update({ error: 'Camera shutdown could not be confirmed. Stay on the call screen or end the call.' }); return false; }
      if (generation !== this.generation || this.disposed) return false;
      this.update({ video: { ...this.view.video, camera: 'off' } });
    }
    if (generation !== this.generation || this.view.phase !== 'ACTIVE' || !this.view.foreground) return false;
    this.update({ minimized: true }); return true;
  }
  restore() { this.update({ minimized: false }); }
  private videoControlsAvailable() {
    return !this.disposed && this.dependencies.flags?.videoCalling === true && this.view.session?.media === 'video'
      && this.view.foreground && !this.view.minimized && this.view.phase === 'ACTIVE' && this.view.audioSetupStage === 'ready' && this.joining;
  }
  async toggleDataSavingVideo() {
    if (!this.videoControlsAvailable() || !this.dependencies.transport.setCameraQuality || this.view.video?.camera !== 'off' || this.view.video.qualityChanging) return;
    const generation = this.generation;
    const quality = this.view.video.quality === 'data_saver' ? 'standard' : 'data_saver';
    this.update({ video: { ...this.view.video, qualityChanging: true, error: null } });
    try {
      await this.dependencies.transport.setCameraQuality(quality);
      if (generation === this.generation && this.view.video) this.update({ video: { ...this.view.video, qualityChanging: false, quality } });
    } catch { if (generation === this.generation && this.view.video) this.update({ video: { ...this.view.video, qualityChanging: false, error: 'Video quality could not be changed.' } }); }
  }
  videoPresentation() { return this.videoControlsAvailable() ? this.dependencies.transport.videoPresentation?.() ?? null : null; }
  setCameraOnAnswer(cameraOn: boolean) {
    if (this.dependencies.flags?.videoCameraOnEntry !== true || !this.view.foreground || this.view.busy || !this.view.incoming
      || this.view.phase !== 'RINGING' || this.view.session?.media !== 'video' || !launchAllowsSession(this.view.session)) return;
    this.update({ video: { ...(this.view.video ?? cameraOff()), cameraWanted: cameraOn } });
  }
  private privatePreviewAllowed() {
    const call = this.view.session;
    return this.dependencies.flags?.videoCameraOnEntry === true && !this.view.incoming && !!call && call.media === 'video'
      && launchAllowsSession(call) && ['REQUESTED', 'RINGING'].includes(call.state) && this.view.foreground && !this.disposed;
  }
  private async startPrivatePreview(generation: number) {
    const preview = this.dependencies.cameraPreview;
    const current = () => generation === this.generation && this.cameraIntent && this.privatePreviewAllowed();
    if (!preview || !current() || this.view.video?.permission !== 'granted') return;
    this.update({ video: { ...this.view.video!, preview: 'starting' } });
    try {
      await preview.start(current);
      if (current() && preview.presentation()) this.update({ video: { ...this.view.video!, preview: 'ready' } });
    } catch {
      if (current()) {
        this.cameraIntent = false;
        this.update({ video: { ...this.view.video!, preview: 'failed', cameraWanted: false, error: 'Camera preview unavailable. You can continue with your camera off.' } });
      }
    }
  }
  private async stopPrivatePreview(generation = this.generation) {
    if (this.view.video) this.update({ video: { ...this.view.video, preview: 'off' } });
    await this.dependencies.cameraPreview?.stop();
    if (generation === this.generation && !this.disposed) this.update({});
  }
  privateVideoPresentation() { return this.privatePreviewAllowed() ? this.dependencies.cameraPreview?.presentation() ?? null : null; }
  async stopPrivatePreviewForRenderFailure() {
    this.cameraIntent = false;
    try { await this.stopPrivatePreview(); }
    catch { await this.hangup(); return; }
    if (this.view.video) this.update({ video: { ...this.view.video, cameraWanted: false, error: 'Camera preview unavailable. Your camera is off.' } });
  }
  /** Explicit Start/Answer mode or an in-call camera action owns camera intent. */
  async toggleCamera() {
    if (this.privatePreviewAllowed()) {
      this.cameraIntent = !this.cameraIntent;
      const generation = this.generation;
      this.update({ video: { ...(this.view.video ?? cameraOff()), cameraWanted: this.cameraIntent } });
      if (!this.cameraIntent) { await this.stopPrivatePreview(); return; }
      await this.prepareCameraPermission('video', generation);
      if (generation === this.generation && this.cameraIntent) await this.startPrivatePreview(generation);
      return;
    }
    await this.applyCamera(!['starting', 'on'].includes(this.view.video?.camera ?? 'off'));
  }
  private async applyCamera(enabled: boolean) {
    if (!this.videoControlsAvailable() || !this.dependencies.transport.setCameraEnabled || this.view.video?.camera === 'stopping' || this.view.video?.qualityChanging || this.view.video?.renderFailed) return;
    this.cameraIntent = enabled;
    const generation = this.generation, request = ++this.cameraRequest;
    const current = () => generation === this.generation && request === this.cameraRequest && this.videoControlsAvailable();
    this.update({ video: { ...(this.view.video ?? cameraOff()), camera: enabled ? 'starting' : 'stopping', cameraWanted: enabled, error: null } });
    try {
      await this.dependencies.transport.setCameraEnabled(enabled);
      if (current()) this.update({ video: { ...this.view.video!, camera: enabled ? 'on' : 'off', ...(enabled ? { permission: 'granted' as const } : {}) } });
    } catch (error) {
      if (!current()) return;
      this.cameraIntent = false;
      const code = error instanceof Error ? error.message : '';
      const blocked = code === 'connect_camera_permission_blocked', denied = code === 'connect_camera_permission_denied';
      const message = blocked ? 'Allow camera access in Settings before your next call. Audio can continue.'
        : denied ? 'Camera permission was not granted. Audio can continue; enable camera access before your next call.'
          : 'The camera could not start. Audio can continue; try the camera again.';
      this.update({ video: { ...this.view.video!, camera: 'off', cameraWanted: false, error: message, ...(blocked || denied ? { permission: blocked ? 'blocked' as const : 'denied' as const } : {}) } });
      if (code === 'connect_camera_cleanup_unconfirmed') {
        this.update({ video: { ...this.view.video!, camera: 'failed', error: 'Camera shutdown could not be confirmed. Ending this call.' } });
        void this.hangup();
      }
    }
  }
  async flipCamera() {
    if (!this.videoControlsAvailable() || this.view.video?.camera !== 'on' || !this.dependencies.transport.flipCamera) return;
    const generation = this.generation, request = ++this.cameraRequest;
    const current = () => generation === this.generation && request === this.cameraRequest && this.videoControlsAvailable();
    this.update({ video: { ...this.view.video, camera: 'starting', error: null } });
    try {
      const facing = await this.dependencies.transport.flipCamera();
      if (current()) this.update({ video: { ...this.view.video!, camera: 'on', facing } });
    } catch (error) {
      if (current()) {
        const unsafe = error instanceof Error && error.message === 'connect_camera_cleanup_unconfirmed';
        this.update({ video: { ...this.view.video!, camera: unsafe ? 'failed' : 'off', error: unsafe
          ? 'Camera shutdown could not be confirmed. Ending this call.' : 'The camera could not switch. Audio can continue; try the camera again.' } });
        if (unsafe) void this.hangup();
      }
    }
  }
  async stopVideoForRenderFailure() {
    if (!this.videoControlsAvailable() || !this.dependencies.transport.setCameraEnabled) return;
    const generation = this.generation, request = ++this.cameraRequest;
    const current = () => generation === this.generation && request === this.cameraRequest && this.videoControlsAvailable();
    this.update({ video: { ...(this.view.video ?? cameraOff()), camera: 'stopping', renderFailed: true, error: 'Video view unavailable. Stopping your camera; audio can continue.' } });
    try {
      await this.dependencies.transport.setCameraEnabled(false);
      if (current()) this.update({ video: { ...this.view.video!, camera: 'off', error: 'Video view unavailable. Your camera is disabled in the SDK; audio can continue.' } });
    } catch { if (current()) { this.update({ video: { ...this.view.video!, camera: 'failed', error: 'Camera shutdown could not be confirmed. Ending this call.' } }); void this.hangup(); } }
  }
  async selectRoute(route: VoiceRoute) {
    if (this.view.audioSetupStage && this.view.audioSetupStage !== 'ready') return;
    if (!this.joining || !this.view.foreground || !['ACTIVE', 'CONNECTING', 'RECONNECTING'].includes(this.view.phase) || !this.dependencies.transport.routes().includes(route)) return;
    const generation = this.generation, request = ++this.routeRequest;
    const current = () => generation === this.generation && !this.disposed && request === this.routeRequest;
    try {
      await this.dependencies.transport.selectRoute(route);
      if (current()) {
        const output = this.dependencies.transport.audioRoute?.();
        this.update({ route: output ? output.route : route, routes: [...(output?.routes ?? this.dependencies.transport.routes())] });
      }
    }
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
    if (!current || this.disposed || this.polling || (this.recovering && this.recoveryGeneration === this.generation)) return;
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
    if (this.recovering && this.recoveryGeneration === this.generation) return;
    const d = this.dependencies;
    if (this.joining && ['CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(this.view.phase)) {
      let sample = null;
      try { sample = d.transport.audioSample?.() ?? null; } catch { /* Missing statistics cannot certify audio delivery. */ }
      this.readAudioSample(sample);
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
    if (this.reconnectAt !== null && ['CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(this.view.phase) && d.now() - this.reconnectAt >= 30_000) {
      this.update({ error: 'The connection could not recover.' });
      const ending = this.hangup(), generation = this.generation;
      await ending;
      if (generation === this.generation && !this.disposed) this.update({ phase: 'FAILED' });
      return;
    }
    if (!this.setupAllowed() && this.view.backgroundAudio !== 'enabled') return;
    // While a specific invitation is progressing, use the existing one-second
    // host tick rather than waiting an extra tick to notice acceptance. Active
    // calls and idle incoming discovery keep their existing polling intervals.
    const interval = this.view.session ? ['REQUESTED', 'RINGING', 'CONNECTING'].includes(this.view.phase) ? 1_000 : 2_000 : 5_000;
    if (d.now() - this.lastPoll < interval) { if (this.view.session?.connected_at) this.renderConnection(); return; }
    this.lastPoll = d.now();
    if (this.view.session && !['ENDED', 'FAILED'].includes(this.view.phase)) await this.refresh();
    else if (!this.view.session && !this.starting && !this.polling) {
      this.polling = true;
      try {
        const rows = await d.api.getHistory(null, 30);
        const candidate = rows.find((s) => s.recipient_profile_id === d.selfProfileId && this.participant(s) && s.state === 'RINGING');
        if (candidate) await this.receive(candidate);
      } catch { /* Foreground hints are best effort and never bypass getCall. */ }
      finally { this.polling = false; }
    }
    if (this.view.session?.connected_at) this.renderConnection();
  }
  async setForeground(foreground: boolean, keepAudio = false) {
    this.update({ foreground });
    if (!foreground) {
      const captured = this.view.video?.camera === 'on' || this.view.video?.camera === 'starting'
        || this.view.video?.preview === 'ready' || this.view.video?.preview === 'starting';
      if (captured) this.cameraIntent = false;
      void this.stopPrivatePreview().catch(() => { void this.hangup(); });
    }
    if (!foreground && this.setupAllowed()) return;
    if (!foreground && keepAudio && this.view.backgroundAudio === 'enabled' && this.joining) {
      const generation = this.generation;
      ++this.cameraRequest;
      if (this.view.video) {
        this.update({ video: { ...this.view.video, camera: 'stopping' } });
        void this.dependencies.transport.setCameraEnabled?.(false).then(() => {
          if (generation === this.generation && !this.disposed && this.view.backgroundAudio === 'enabled' && this.view.video) this.update({ video: { ...this.view.video, camera: 'off' } });
        }).catch(() => { if (generation === this.generation) void this.interrupted('background'); });
      }
      return;
    }
    if (!foreground && this.joining) {
      // Stop independently of a queued/hung microphone mutation. Native retirement
      // fences late publication; foreground cannot restart this call generation.
      await this.interrupted('background');
    }
    if (foreground) {
      this.lastPoll = -Infinity; await this.tick();
      if (this.cameraIntent && this.privatePreviewAllowed() && !['ready', 'starting'].includes(this.view.video?.preview ?? 'off')) void this.startPrivatePreview(this.generation);
    }
  }
  private readAudioSample(sample: AudioSample | null) {
    const now = this.dependencies.now();
    if (sample && Number.isFinite(sample.timestamp) && sample.timestamp >= 0
      && (this.lastAudioTimestamp === null || sample.timestamp > this.lastAudioTimestamp)) {
      this.lastAudioTimestamp = sample.timestamp;
      // First observed nonzero per-call counters are not proof of current growth
      // or audible output. Keep the two-report health monitor unchanged.
      if ((sample.receivedPackets ?? 0) > 0 || (sample.receivedBytes ?? 0) > 0) this.quality.mark('received_rtp', now);
    }
    this.update({ audioHealth: this.audioHealth.read(sample, now) });
  }
  async enterBackground() {
    this.cameraIntent = false;
    this.update({ foreground: false });
    if (this.setupAllowed()) return;
    if (this.view.backgroundAudio === 'enabled' && this.joining) return;
    // An unanswered invitation is not consent to reject or terminate it. Stop
    // foreground ringing, then reload authority when the app becomes active.
    if (this.view.incoming && !this.accepting && !this.acceptedHere && !this.joining) return;
    await this.interrupted('background');
  }
  async verifyPeerIdentity(code: string) {
    if (!this.view.foreground || !this.view.encryption?.required || !this.view.encryption.sdkConfirmed || code !== this.view.encryption.safetyCode) return;
    await this.dependencies.verifyIdentity?.(code); this.renderConnection();
  }
  private identityBinding() {
    const peer = this.view.peer?.profileId, session = this.view.session;
    const media = session?.media ?? this.request?.media, authorization = session?.authorization ?? this.request?.authorization;
    const grant = session?.grant_id ?? this.request?.grant ?? null;
    if (!this.view.foreground || !peer || !media || !authorization || this.dependencies.flags?.encryptedCalls !== true) throw Error('connect_unavailable');
    return { peer, media, authorization, grant };
  }
  async reviewPeerIdentity() {
    const value = this.identityBinding();
    if (!this.dependencies.reviewIdentity) throw Error('connect_unavailable');
    return this.dependencies.reviewIdentity(value.peer,value.media,value.authorization,value.grant);
  }
  async replacePeerIdentity(code: string) {
    const value = this.identityBinding();
    if (!this.dependencies.replaceIdentity) throw Error('connect_unavailable');
    await this.dependencies.replaceIdentity(value.peer,value.media,value.authorization,value.grant,code);
    if (this.view.session) this.renderConnection();
  }
  canDismissCompletedCall() {
    if (this.dependencies.cameraPreview?.released() === false) return false;
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
    ++this.generation; this.endBlockIntent = null; this.request = null; this.acceptedHere = false; this.accepting = false; this.mediaAttempted = false; this.recoveryAttempts = 0;
    // Recovery clocks and transport state belong to the dismissed call only.
    this.reconnectAt = null; this.transportState = 'left'; this.joining = false;
    this.recovering = null; this.recoveryGeneration = null;
    this.microphoneIntent = null;
    this.cameraIntent = false;
    this.quality = createCallQualityTracker(); this.update({ ...initial(), foreground: this.view.foreground });
  }
  async logout() {
    if (this.disposed) return;
    const session = this.view.session;
    ++this.generation; this.endBlockIntent = null; this.request = null;
    this.reconnectAt = null; this.transportState = 'left'; this.joining = false;
    this.recovering = null; this.recoveryGeneration = null;
    this.microphoneIntent = null;
    void this.stopLocal(); ++this.generation;
    if (session) void this.endOnServer(session);
    this.cameraIntent = false;
    this.quality = createCallQualityTracker(); this.update({ ...initial(), foreground: this.view.foreground });
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true; ++this.generation; this.listeners.clear();
    this.endBlockIntent = null;
    void this.stopLocal();
    if (this.view.session) void this.endOnServer(this.view.session);
  }
}
