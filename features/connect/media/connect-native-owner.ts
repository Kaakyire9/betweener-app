import { connectFeatureFlags, type ConnectFeatureFlags } from '../config/connect-feature-flags.ts';
import type { VoiceBindings, VoiceBindingsFactory } from './stream-voice-transport.ts';
import type { VoiceCredentials, VoiceRoute } from '../voice/voice-types.ts';
import { streamVideoClientLeaseRegistry, type StreamVideoClientLeaseRegistry, type StreamVideoClientLease } from '../../live/media/stream-video-client-leases.ts';
import { loadConnectNativeSdk } from './native-stream-sdk.ts';
import { createNativeAudioRouteSelector, nativeAudioRouteType as routeType } from './native-audio-route.ts';
import type { NativeAudioHandle, NativeAudioState, NativeCallHandle, NativeOwnerAccess, NativeOwnerSnapshot, NativeSdkCallState,
  NativeRetirement, NativeSdkClient, NativeStreamSdk, NativeTrack } from './native-owner-types.ts';

export interface NativeOwnerDependencies extends NativeOwnerAccess {
  retireOnReconnect?: boolean;
  flags?: ConnectFeatureFlags; registry?: StreamVideoClientLeaseRegistry; loadSdk?(): Promise<NativeStreamSdk>;
  now?(): number; onOwner?(owner: ConnectNativeMediaOwner): void; onRetire?(reason: NativeRetirement): void;
}
const safeState = (s: string) => ['idle', 'ringing', 'joining', 'joined', 'left', 'reconnecting', 'migrating', 'offline', 'reconnecting-failed'].includes(s) ? s : 'unknown';
let nextGeneration = 0;
interface OwnerInput {
  retireOnReconnect?: boolean;
  admission: VoiceCredentials; access: NativeOwnerAccess; authGeneration: string; handle: NativeCallHandle;
  audio: NativeAudioHandle; lease: StreamVideoClientLease<NativeSdkClient>; onRetire?(reason: NativeRetirement): void;
}

/** One authenticated call/owner epoch. SDK observations never certify physical shutdown. */
export class ConnectNativeMediaOwner {
  readonly generation = ++nextGeneration;
  private retired = false;
  private released = false;
  private reason: NativeRetirement | null = null;
  private nativeUseStarted = false;
  private stoppingNow = false;
  private releasePromise: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribes: (() => void)[] = [];
  private readonly tracks = { microphone: new Set<NativeTrack>(), camera: new Set<NativeTrack>(), remote: new Set<NativeTrack>() };
  private readonly releasedTracks = new WeakSet<NativeTrack>();
  private readonly pendingMutations = new Set<Promise<unknown>>();
  private readonly operations: NativeOwnerSnapshot['operations'] = { microphone: 'not_started', camera: 'not_started', publisher: 'not_started',
    microphoneTrackRelease: 'not_started', cameraTrackRelease: 'not_started',
    subscriber: 'not_started', playoutMute: 'not_started', leave: 'not_started', release: 'not_started', audioConfiguration: 'not_started' };
  private readonly pendingOperations = new Map<keyof NativeOwnerSnapshot['operations'], Promise<void>>();
  private audioState: NativeAudioState = { devices: [] };
  private audioStateVersion = 0;
  private routeRequest = 0;
  private readonly audioRoute: ReturnType<typeof createNativeAudioRouteSelector>;

  private readonly input: OwnerInput;
  constructor(input: OwnerInput) {
    this.input = input;
    this.audioRoute = createNativeAudioRouteSelector({ audio: input.audio, isCurrent: this.isCurrent });
  }

  isCurrent = () => {
    const auth = this.input.access.auth.snapshot();
    return !this.retired && !this.released && auth?.authenticated === true && auth.userId === this.input.admission.user.id
      && auth.generation === this.input.authGeneration && this.input.access.lifecycle.appState() === 'active';
  };
  private assertCurrent() { if (!this.isCurrent()) throw new Error('connect_native_owner_retired'); }
  private emit() { for (const listener of this.listeners) { try { listener(); } catch { /* Inspection observers cannot interrupt privacy cleanup. */ } } }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private collect() {
    const current = this.input.handle.tracks();
    for (const key of ['microphone', 'camera', 'remote'] as const) for (const track of current[key]) this.tracks[key].add(track);
  }
  getSnapshot = (): NativeOwnerSnapshot => {
    let inspection: NativeOwnerSnapshot['inspection'] = 'complete';
    try { this.collect(); } catch { inspection = 'failed'; }
    const counts = (set: Set<NativeTrack>) => ({ observed: set.size, live: [...set].filter(t => t.readyState !== 'ended').length });
    let sdk: NativeSdkCallState = { callingState: 'unknown', microphoneStatus: 'unknown', cameraStatus: 'unknown',
      audioPublishing: null, videoPublishing: null, publisherPresent: null, subscriberPresent: null };
    try { sdk = this.input.handle.state(); } catch { inspection = 'failed'; }
    return { generation: this.generation, cid: this.input.admission.call.cid, retired: this.retired, reason: this.reason,
      evidenceSource: 'sdk_reported', physicalDeviceShutdown: 'not_verified', inspection, sdk: { ...sdk, callingState: safeState(sdk.callingState) },
      tracks: { microphone: counts(this.tracks.microphone), camera: counts(this.tracks.camera), remote: counts(this.tracks.remote) }, operations: { ...this.operations } };
  };
  private run(key: keyof NativeOwnerSnapshot['operations'], action: () => Promise<unknown> | unknown): Promise<void> {
    const pending = this.pendingOperations.get(key); if (pending) return pending;
    this.operations[key] = 'pending';
    let resolve!: (value: unknown) => void; let reject!: (error: unknown) => void;
    const result = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
    const operation = result.then(() => { this.operations[key] = 'completed'; }, () => {
      this.operations[key] = 'failed'; throw new Error('connect_native_operation_failed');
    }).finally(() => { this.pendingOperations.delete(key); this.emit(); });
    this.pendingOperations.set(key, operation);
    try { Promise.resolve(action()).then(resolve, reject); } catch (error) { reject(error); }
    // Privacy requests are started independently; failures remain observable.
    void operation.catch(() => undefined);
    return operation;
  }
  private stopTracks(key: keyof ConnectNativeMediaOwner['tracks']) {
    this.collect();
    let failed = false; let releaseFailed = false;
    for (const track of this.tracks[key]) {
      try { track.enabled = false; track.stop(); } catch { failed = true; }
      if (key !== 'remote' && !this.releasedTracks.has(track)) {
        // RN stop() only mutes the track. release() requests native source/capturer
        // disposal without waiting for an SFU response. Neither is an OS ACK.
        try {
          if (typeof track.release !== 'function') throw new Error('connect_native_release_unsupported');
          track.release(); this.releasedTracks.add(track);
        } catch { releaseFailed = true; }
      }
    }
    if (key !== 'remote') this.operations[key === 'microphone' ? 'microphoneTrackRelease' : 'cameraTrackRelease'] = releaseFailed ? 'failed' : 'completed';
    if (failed) throw new Error('connect_native_track_stop_failed');
  }
  private stopNow() {
    if (this.released || this.stoppingNow) return;
    this.stoppingNow = true;
    try {
      // RN track.stop updates JS state and sends a bridge disable request. Do it
      // before DeviceManager.disable can wait for an SFU stop-publish response.
      for (const key of ['microphone', 'camera', 'remote'] as const) { try { this.stopTracks(key); } catch { /* SDK operations below remain independent. */ } }
      void this.run('microphone', () => this.input.handle.disableMicrophone());
      void this.run('camera', () => this.input.handle.disableCamera());
      void this.run('playoutMute', () => this.stopTracks('remote'));
      void this.run('publisher', () => this.input.handle.disposePublisher());
      void this.run('subscriber', () => this.input.handle.disposeSubscriber());
      void this.run('leave', () => this.input.handle.leave());
    } finally { this.stoppingNow = false; this.emit(); }
  }
  retire = (reason: NativeRetirement = 'local_end') => {
    if (this.retired || this.released) return;
    this.retired = true; this.reason = reason;
    this.audioRoute.cancel();
    this.stopNow();
    try { this.input.onRetire?.(reason); } catch { /* Cleanup still owns release even if a composition observer fails. */ }
    void Promise.resolve().then(() => this.release()).catch(() => undefined);
  };
  private trackMutation<T>(action: () => Promise<T>): Promise<T> {
    const operation = action(); this.pendingMutations.add(operation);
    void operation.finally(() => this.pendingMutations.delete(operation)).catch(() => undefined);
    return operation;
  }
  activate() {
    this.assertCurrent();
    if (this.input.handle.authorizeRingingJoin) this.unsubscribes.push(this.input.handle.authorizeRingingJoin(this.isCurrent));
    this.unsubscribes.push(this.input.access.auth.subscribe(() => {
      if (!this.isCurrent()) this.retire('account_changed');
    }));
    this.unsubscribes.push(this.input.access.lifecycle.subscribeAppState(state => { if (state !== 'active') this.retire('background'); }));
    this.unsubscribes.push(this.input.audio.observeInterruption(phase => { if (phase === 'began') this.retire('interruption'); }));
    this.unsubscribes.push(this.input.audio.observeDevices(state => {
      if (this.isCurrent()) { this.audioStateVersion++; this.audioState = state; this.audioRoute.observe(state); this.emit(); }
    }));
    this.unsubscribes.push(this.input.handle.observeMedia(() => { if (this.retired) this.stopNow(); else { this.collect(); this.emit(); } }));
    this.unsubscribes.push(this.input.handle.observeState(state => {
      if (this.input.retireOnReconnect && ['reconnecting', 'migrating', 'offline'].includes(state)) this.retire('connection_failed');
      if (this.retired) this.stopNow(); this.emit();
    }));
    this.input.audio.configure(); this.operations.audioConfiguration = 'completed';
    const audioVersion = this.audioStateVersion;
    void this.input.audio.devices().then(state => {
      if (this.isCurrent() && audioVersion === this.audioStateVersion) { this.audioState = state; this.emit(); }
    }).catch(() => undefined);
    this.assertCurrent();
  }
  readonly bindings: VoiceBindings = {
    call: {
      microphone: {
        enable: () => this.trackMutation(async () => {
          this.assertCurrent();
          if (await this.input.access.permission() !== 'granted') { this.retire('permission_denied'); throw new Error('connect_native_permission_denied'); }
          this.assertCurrent(); this.nativeUseStarted = true;
          try { await this.input.handle.enableMicrophone(); }
          finally { if (this.retired) this.stopNow(); this.emit(); }
          this.assertCurrent();
        }),
        disable: async () => { this.stopTracks('microphone'); await this.run('microphone', () => this.input.handle.disableMicrophone()); },
      },
      camera: { disable: async () => { this.stopTracks('camera'); await this.run('camera', () => this.input.handle.disableCamera()); } },
      state: { callingState$: { subscribe: listener => ({ unsubscribe: this.input.handle.observeState(state => { if (this.isCurrent()) listener(state); }) }) } },
      join: () => this.trackMutation(async () => {
        this.assertCurrent(); this.nativeUseStarted = true;
        try { await this.input.handle.join(); }
        catch { this.retire('connection_failed'); throw new Error('connect_native_join_failed'); }
        finally { if (this.retired) this.stopNow(); this.emit(); }
        this.assertCurrent();
      }),
      leave: async () => { this.retire('local_end'); await this.run('leave', () => this.input.handle.leave()); },
    },
    routes: () => this.isCurrent() ? [...new Set(this.audioState.devices.map(d => routeType(d.type)).filter((r): r is VoiceRoute => r !== null))] : [],
    audioSample: () => this.isCurrent() ? this.input.handle.audioSample?.() ?? null : null,
    selectRoute: async route => {
      this.assertCurrent();
      const request = ++this.routeRequest;
      const state = await this.audioRoute.select(route);
      this.assertCurrent();
      if (request !== this.routeRequest) throw new Error('connect_native_route_superseded');
      this.audioStateVersion++; this.audioState = state; this.emit();
    },
    release: () => this.release(),
    inspectShutdown: async () => {
      const s = this.getSnapshot();
      return { evidenceSource: 'sdk_reported', microphoneStopped: s.inspection === 'complete' && s.tracks.microphone.live === 0 && s.sdk.microphoneStatus === 'disabled',
        cameraStopped: s.inspection === 'complete' && s.tracks.camera.live === 0 && s.sdk.cameraStatus === 'disabled',
        publicationStopped: s.inspection === 'complete' && s.sdk.audioPublishing === false && s.sdk.videoPublishing === false,
        playbackStopped: s.inspection === 'complete' && s.tracks.remote.live === 0,
        subscriptionsStopped: s.inspection === 'complete' && s.sdk.subscriberPresent === false && s.sdk.callingState === 'left' };
    },
  };
  release(): Promise<void> {
    if (this.released) return Promise.resolve();
    if (this.releasePromise) return this.releasePromise;
    this.retire('local_end');
    this.operations.release = 'pending';
    const operation = (async () => {
      // A late join/unmute must settle before another owner may acquire audio.
      await Promise.allSettled([...this.pendingMutations]);
      const leave = this.run('leave', () => this.input.handle.leave());
      await Promise.allSettled([...this.pendingOperations.values(), leave]);
      const sdk = this.input.handle.state();
      this.collect();
      const tracksStillLive = Object.values(this.tracks).some(set => [...set].some(track => track.readyState !== 'ended'));
      const captureReleaseFailed = this.operations.microphoneTrackRelease === 'failed' || this.operations.cameraTrackRelease === 'failed';
      if (tracksStillLive || captureReleaseFailed || (this.nativeUseStarted && (this.operations.leave !== 'completed' || sdk.callingState !== 'left' || sdk.publisherPresent !== false || sdk.subscriberPresent !== false))) {
        // Disconnect only our authenticated client, retaining the registry tombstone.
        await this.input.lease.client.disconnectUser().catch(() => undefined);
        throw new Error('connect_native_release_unconfirmed');
      }
      const subscriptions = this.unsubscribes.splice(0);
      for (const unsubscribe of subscriptions) {
        try { unsubscribe(); } catch { this.unsubscribes.push(unsubscribe); }
      }
      if (this.unsubscribes.length) throw new Error('connect_native_release_unconfirmed');
      this.input.audio.clearConfiguration();
      await this.input.lease.release();
      this.released = true;
      this.operations.release = 'completed'; this.emit();
    })().catch(() => { this.operations.release = 'failed'; this.emit(); throw new Error('connect_native_release_unconfirmed'); })
      .finally(() => { this.releasePromise = null; });
    this.releasePromise = operation; return operation;
  }
}

export function createConnectNativeOwnerFactory(dependencies: NativeOwnerDependencies): { create: VoiceBindingsFactory; current(): ConnectNativeMediaOwner | null } {
  const flags = dependencies.flags ?? connectFeatureFlags;
  const registry = dependencies.registry ?? streamVideoClientLeaseRegistry;
  let current: ConnectNativeMediaOwner | null = null;
  return {
    current: () => current,
    create: async (suppliedAdmission, refresh, activeGeneration = () => true) => {
      if (flags.nativeSafetyOwner !== true) throw new Error('connect_native_owner_disabled');
      const admission = { ...suppliedAdmission, call: { ...suppliedAdmission.call }, user: { ...suppliedAdmission.user } };
      const sourceAuth = dependencies.auth.snapshot();
      const auth = sourceAuth ? { ...sourceAuth } : null;
      const valid = (requireInitialExpiry = true) => {
        const live = dependencies.auth.snapshot();
        return activeGeneration() && auth?.authenticated === true && !!auth.generation && live?.authenticated === true && live.userId === auth.userId && live.generation === auth.generation
          && admission.user.id === auth.userId && admission.media === 'voice' && admission.call.type === 'betweener_connect'
          && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(admission.call.id)
          && admission.call.cid === `betweener_connect:${admission.call.id}` && !!admission.apiKey && !!admission.token
          && Number.isFinite(Date.parse(admission.expiresAt)) && (!requireInitialExpiry || Date.parse(admission.expiresAt) > (dependencies.now?.() ?? Date.now()))
          && dependencies.lifecycle.appState() === 'active';
      };
      if (!valid()) throw new Error('connect_native_identity_invalid');
      if (await dependencies.permission() !== 'granted') throw new Error('connect_native_permission_denied');
      if (!valid()) throw new Error('connect_native_owner_retired');
      const sdk = await (dependencies.loadSdk ?? loadConnectNativeSdk)();
      if (!valid()) throw new Error('connect_native_owner_retired');
      let owner: ConnectNativeMediaOwner | null = null; let connectionFailed = false; let initialToken = true;
      const tokenProvider = async () => {
        if (!valid(initialToken) || connectionFailed || (owner && !owner.isCurrent())) throw new Error('connect_native_refresh_denied');
        if (initialToken) { initialToken = false; return admission.token; }
        const token = await refresh();
        if (!valid(false) || !owner?.isCurrent() || !token) throw new Error('connect_native_refresh_denied');
        return token;
      };
      const lease = registry.acquireNativeExclusive(`${admission.apiKey}:${admission.user.id}`, () => sdk.createClient({ apiKey: admission.apiKey,
        userId: admission.user.id, tokenProvider, onConnectionFailure() { connectionFailed = true; owner?.retire('connection_failed'); } }));
      try {
        const handle = lease.client.call(admission.call.type, admission.call.id);
        if (handle.id !== admission.call.id || handle.type !== admission.call.type || handle.cid !== admission.call.cid) throw new Error('connect_native_identity_invalid');
        owner = new ConnectNativeMediaOwner({ admission, access: dependencies, authGeneration: auth!.generation, handle, retireOnReconnect: dependencies.retireOnReconnect,
          audio: sdk.audio(dependencies.lifecycle.platform), lease, onRetire: dependencies.onRetire });
        current = owner; dependencies.onOwner?.(owner); owner.activate();
        if (connectionFailed || !valid()) throw new Error('connect_native_owner_retired');
        return owner.bindings;
      } catch {
        if (owner) { owner.retire('connection_failed'); void owner.release().catch(() => undefined); }
        else await lease.release();
        throw new Error('connect_native_owner_unavailable');
      }
    },
  };
}
