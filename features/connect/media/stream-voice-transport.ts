import type { VoiceCredentials, VoiceRoute, VoiceTransport, VoiceTransportState } from '../voice/voice-types.ts';
import { unverifiedShutdown, type LocalShutdownResult } from './local-shutdown.ts';
import type { AudioSample } from './audio-health.ts';
interface StreamVoiceCall {
  camera: { disable(forceStop?: boolean): Promise<void>; enable?(current?: () => boolean): Promise<void>; flip?(): Promise<'front' | 'back'>; enabled?(): boolean | null };
  microphone: { enable(): Promise<void>; disable(forceStop?: boolean): Promise<void> };
  state: { callingState$: { subscribe(listener: (state: string) => void): { unsubscribe(): void } } };
  join(options: { create: false }): Promise<unknown>; leave(): Promise<unknown>;
}
export interface VoiceBindings {
  call: StreamVoiceCall; release(): Promise<void>;
  routes(): readonly VoiceRoute[]; selectRoute(route: VoiceRoute): Promise<void>;
  audioSample?(): AudioSample | null;
  videoPresentation?(): import('../video/video-types.ts').VideoPresentation | null;
  // Future Auth-owned native implementation must inspect its actual resources.
  inspectShutdown?(): Promise<{ microphoneStopped: boolean; cameraStopped: boolean; publicationStopped: boolean; playbackStopped: boolean; subscriptionsStopped: boolean;
    evidenceSource?: 'owner_inspection' | 'sdk_reported' }>;
}
export type VoiceBindingsFactory = (credentials: VoiceCredentials, refresh: () => Promise<string>, isCurrent?: () => boolean) => Promise<VoiceBindings>;
const terminal = new Set(['left', 'reconnecting-failed']);
export const streamVoiceState = (state: string): VoiceTransportState => {
  if (state === 'joined') return 'joined';
  if (['reconnecting', 'migrating', 'offline'].includes(state)) return 'reconnecting';
  if (state === 'reconnecting-failed') return 'failed';
  if (state === 'left') return 'left';
  return 'connecting';
};
function assertCredentials(value: VoiceCredentials, previous?: VoiceCredentials, allowVideo = false) {
  if ((value.media !== 'voice' && !(allowVideo && value.media === 'video')) || !value.apiKey || !value.token || value.call.type !== 'betweener_connect'
    || value.call.cid !== `betweener_connect:${value.call.id}` || Date.parse(value.expiresAt) <= Date.now()
    || !Number.isFinite(Date.parse(value.expiresAt)) || !value.user.id) throw new Error('connect_unavailable');
  if (previous && (previous.media !== value.media || previous.apiKey !== value.apiKey || previous.user.id !== value.user.id || previous.call.cid !== value.call.cid)) throw new Error('connect_unavailable');
}
/** No client creation or singleton lookup. A validated Auth-owned lease factory
 * must be supplied after M2A passes; Live's admission token provider is unsuitable. */
export class StreamVoiceTransport implements VoiceTransport {
  private readonly factory: VoiceBindingsFactory;
  private bindings: VoiceBindings | null = null;
  private unsubscribe: (() => void) | null = null;
  private generation = 0;
  private currentCid: string | null = null;
  private readonly retiredCalls = new Set<string>();
  private microphoneQueue: Promise<void> = Promise.resolve();
  private joining: Promise<void> | null = null;
  private videoAdmission = false;
  private cameraRequest = 0;
  private cameraMutation: Promise<void> | null = null;
  private readonly allowVideo: boolean;
  constructor(factory: VoiceBindingsFactory, options: { videoCalling?: boolean } = {}) { this.factory = factory; this.allowVideo = options.videoCalling === true; }
  join(admission: VoiceCredentials, refresh: () => Promise<VoiceCredentials>, listener: (state: VoiceTransportState) => void): Promise<void> {
    if (this.joining) return this.joining;
    if (this.bindings) return Promise.reject(new Error('connect_busy'));
    const generation = ++this.generation;
    this.lastShutdown = null;
    this.joining = (async () => {
      assertCredentials(admission, undefined, this.allowVideo);
      if (this.retiredCalls.has(admission.call.cid)) throw new Error('connect_unavailable');
      this.currentCid = admission.call.cid;
      const bindings = await this.factory(admission, async () => {
        const next = await refresh(); assertCredentials(next, admission, this.allowVideo);
        if (generation !== this.generation) throw new Error('connect_unavailable');
        return next.token;
      }, () => generation === this.generation && this.currentCid === admission.call.cid);
      if (generation !== this.generation) { await this.cleanup(bindings); return; }
      this.bindings = bindings;
      this.videoAdmission = admission.media === 'video';
      try {
        // Both media modes join with the camera off. No acceptance or join starts a camera.
        await bindings.call.camera.disable(true);
        await bindings.call.microphone.disable(true);
        if (generation !== this.generation) { await this.cleanup(bindings); return; }
        const subscription = bindings.call.state.callingState$.subscribe((state) => {
          if (generation !== this.generation) return;
          if (terminal.has(state)) void bindings.call.microphone.disable(true).catch(() => undefined);
          listener(streamVoiceState(state));
        });
        this.unsubscribe = () => subscription.unsubscribe();
        await bindings.call.join({ create: false });
        if (generation !== this.generation) await this.cleanup(bindings);
      } catch (error) { await this.leave(); throw error; }
    })().finally(() => { this.joining = null; });
    return this.joining;
  }
  async setMuted(muted: boolean) {
    const bindings = this.bindings; const generation = this.generation;
    if (!bindings) throw new Error('connect_unavailable');
    const operation = this.microphoneQueue.then(async () => {
      if (generation !== this.generation) throw new Error('connect_unavailable');
      if (muted) await bindings.call.microphone.disable(true); else await bindings.call.microphone.enable();
      if (generation !== this.generation) { await bindings.call.microphone.disable(true); throw new Error('connect_unavailable'); }
    });
    this.microphoneQueue = operation.catch(() => undefined);
    await operation;
  }
  routes() { return this.bindings?.routes() ?? []; }
  audioSample() { return this.bindings?.audioSample?.() ?? null; }
  videoPresentation() { return this.videoAdmission ? this.bindings?.videoPresentation?.() ?? null : null; }
  async setCameraEnabled(enabled: boolean) {
    const bindings = this.bindings, generation = this.generation, request = ++this.cameraRequest;
    if (!bindings || !this.allowVideo || !this.videoAdmission) throw new Error('connect_video_not_authorized');
    if (!enabled) {
      const pending = this.cameraMutation;
      // Disable immediately even when permission/enable/flip is hung. Do not report
      // completion until late mutations settle and have been stopped again.
      const disabling = bindings.call.camera.disable(true);
      await disabling;
      if (pending) { await pending.catch(() => undefined); await bindings.call.camera.disable(true); }
      if (generation === this.generation && bindings.call.camera.enabled?.() !== false) throw new Error('connect_camera_cleanup_unconfirmed');
      return;
    }
    if (this.cameraMutation || !bindings.call.camera.enable) throw new Error('connect_camera_busy');
    const operation = (async () => {
      try {
        await bindings.call.camera.enable!(() => generation === this.generation && request === this.cameraRequest);
        if (generation !== this.generation || request !== this.cameraRequest) throw new Error('connect_camera_superseded');
        if (bindings.call.camera.enabled?.() !== true) throw new Error('connect_camera_unconfirmed');
      } catch (error) {
        try {
          await bindings.call.camera.disable(true);
          if (generation === this.generation && bindings.call.camera.enabled?.() !== false) throw new Error('connect_camera_unconfirmed');
        } catch { throw new Error('connect_camera_cleanup_unconfirmed'); }
        throw error;
      }
    })();
    this.cameraMutation = operation;
    try { await operation; } finally { if (this.cameraMutation === operation) this.cameraMutation = null; }
  }
  async flipCamera(): Promise<'front' | 'back'> {
    const bindings = this.bindings, generation = this.generation, request = ++this.cameraRequest;
    if (!bindings || !this.allowVideo || !this.videoAdmission || !bindings.call.camera.flip || this.cameraMutation
      || bindings.call.camera.enabled?.() !== true) throw new Error('connect_camera_unavailable');
    let facing: 'front' | 'back' = 'front';
    const operation = (async () => {
      facing = await bindings.call.camera.flip!();
      if (generation !== this.generation || request !== this.cameraRequest) {
        await bindings.call.camera.disable(true); throw new Error('connect_camera_superseded');
      }
      if (bindings.call.camera.enabled?.() !== true) throw new Error('connect_camera_unconfirmed');
    })();
    this.cameraMutation = operation;
    try { await operation; return facing; }
    catch (error) {
      try {
        await bindings.call.camera.disable(true);
        if (generation === this.generation && bindings.call.camera.enabled?.() !== false) throw new Error('connect_camera_unconfirmed');
      } catch { throw new Error('connect_camera_cleanup_unconfirmed'); }
      throw error;
    } finally { if (this.cameraMutation === operation) this.cameraMutation = null; }
  }
  async selectRoute(route: VoiceRoute) {
    const bindings = this.bindings, generation = this.generation;
    if (!bindings) throw new Error('connect_native_route_no_owner');
    // The advertised list is a UI snapshot. The native owner must validate and
    // confirm the output from fresh state, including when that snapshot lags.
    await bindings.selectRoute(route);
    if (generation !== this.generation || this.bindings !== bindings) throw new Error('connect_native_owner_retired');
  }
  private cleanups = new WeakMap<VoiceBindings, Promise<LocalShutdownResult>>();
  private released = new WeakSet<VoiceBindings>();
  private cleanup(bindings: VoiceBindings): Promise<LocalShutdownResult> {
    const existing = this.cleanups.get(bindings); if (existing) return existing;
    const result = unverifiedShutdown();
    const attempt = async (run: () => Promise<unknown>) => { try { await run(); return true; } catch { return false; } };
    // Start all stop requests independently; one stalled SDK operation cannot suppress the others.
    const microphone = attempt(() => bindings.call.microphone.disable(true));
    const camera = attempt(() => bindings.call.camera.disable(true));
    const leave = attempt(() => bindings.call.leave());
    const release = leave.then(async () => {
      if (this.released.has(bindings)) return true;
      const ok = await attempt(() => bindings.release());
      if (ok) this.released.add(bindings);
      return ok;
    });
    const operation = (async () => {
      const [micOk, cameraOk, leaveOk, releaseOk] = await Promise.all([microphone, camera, leave, release]);
      result.microphone = micOk ? 'unverified' : 'failed'; result.camera = cameraOk ? 'unverified' : 'failed';
      result.sdkLeave = leaveOk ? 'completed' : 'failed'; result.resourceRelease = releaseOk ? 'completed' : 'failed';
      if (bindings.inspectShutdown) {
        try {
          const proof = await bindings.inspectShutdown();
          // The native adapter exposes SDK/bridge observations separately; they
          // do not establish independently measured OS/hardware shutdown.
          if (proof.evidenceSource !== 'sdk_reported') {
            if (proof.microphoneStopped === true) result.microphone = 'verified';
            if (proof.cameraStopped === true) result.camera = 'verified';
            result.publication = proof.publicationStopped === true ? 'verified' : 'unverified';
            result.playback = proof.playbackStopped === true ? 'verified' : 'unverified';
            result.subscriptions = proof.subscriptionsStopped === true ? 'verified' : 'unverified';
          }
        } catch { /* No inspection result is explicit unverified evidence. */ }
      }
      return result;
    })();
    // Late SDK join completion must run stop operations again; release stays once-only.
    const tracked = operation.finally(() => this.cleanups.delete(bindings));
    this.cleanups.set(bindings, tracked); return tracked;
  }
  private lastShutdown: Promise<LocalShutdownResult> | null = null;
  async leave() {
    ++this.generation; ++this.cameraRequest; this.videoAdmission = false; this.unsubscribe?.(); this.unsubscribe = null;
    if (this.currentCid) this.retiredCalls.add(this.currentCid);
    this.currentCid = null;
    const bindings = this.bindings; this.bindings = null;
    if (bindings) this.lastShutdown = this.cleanup(bindings);
    return this.lastShutdown ? await this.lastShutdown : unverifiedShutdown();
  }
}
