import { ConnectNativeMediaOwner } from '../../features/connect/media/connect-native-owner.ts';
import { streamVideoClientLeaseRegistry, type StreamVideoClientLeaseRegistry } from '../../features/live/media/stream-video-client-leases.ts';
import type { NativeAudioHandle, NativeCallHandle, NativeOwnerAccess, NativeRetirement, NativeTrack } from '../../features/connect/media/native-owner-types.ts';
import { ownLocalCaptureStream } from './local-capture-stream.ts';

export type CaptureKind = 'microphone' | 'camera';
export interface LocalStream { getTracks(): NativeTrack[]; release(releaseTracks: boolean): void; toURL(): string }
export interface LocalPlayback { stop(): Promise<void>; snapshot(): unknown }
export interface LocalHardware {
  capture(kind: CaptureKind): Promise<LocalStream>;
  startTone(): Promise<LocalPlayback>;
  release(): Promise<void>;
}
export interface IndependentObservation {
  source: 'os_instrumentation' | 'external_observer';
  axis: CaptureKind | 'playback' | 'route';
  phase: 'active_before_shutdown' | 'stopped_after_shutdown' | 'continued_after_shutdown' | 'unknown';
  reference: string;
  observedAt: string;
}
type Input = NativeOwnerAccess & {
  development: boolean; externalEgressBlocked: boolean; hardware: LocalHardware; audio: NativeAudioHandle;
  registry?: StreamVideoClientLeaseRegistry; now?: () => number;
};

/**
 * Hardware seam, NOT the authenticated Stream factory/adapter. No credentials,
 * provider, peer connection, ICE, SDP, SFU or app bootstrap is available here.
 * Reuses the actual owner class and shared registry with a LOCAL call handle.
 */
export function createOfflineSafetySession(input: Input) {
  if (!input.development || !input.externalEgressBlocked) throw new Error('device_harness_isolation_required');
  const auth = input.auth.snapshot();
  if (!auth?.generation || !auth.authenticated) throw new Error('device_harness_epoch_required');
  const now = input.now ?? (() => performance.now());
  const origin = now();
  const events: { elapsedMs: number; source: string; event: string; detail?: unknown }[] = [];
  const independent: IndependentObservation[] = [];
  const record = (source: string, event: string, detail?: unknown) => events.push({ elapsedMs: now() - origin, source, event, detail });
  const streams: Record<CaptureKind, LocalStream[]> = { microphone: [], camera: [] };
  const releasedStreams = new Set<LocalStream>();
  const pending = new Set<Promise<unknown>>();
  const media = new Set<() => void>();
  const states = new Set<(state: string) => void>();
  let playback: LocalPlayback | null = null;
  let toneRequested = false;
  let owner: ConnectNativeMediaOwner;
  let fault: 'none' | 'fail' | 'hold' = 'none';
  let releaseHold: (() => void) | undefined;
  let hold: Promise<void> | undefined;
  const state = { callingState: 'idle', microphoneStatus: 'disabled', cameraStatus: 'disabled',
    audioPublishing: false, videoPublishing: false, publisherPresent: false, subscriberPresent: false };
  const assertCurrent = () => { if (!owner.isCurrent()) throw new Error('device_harness_retired'); };
  const track = <T>(operation: () => Promise<T>) => {
    const promise = Promise.resolve().then(operation);
    pending.add(promise);
    void promise.finally(() => pending.delete(promise)).catch(() => undefined);
    return promise;
  };
  const emitMedia = () => { for (const listener of media) listener(); };
  const capture = (kind: CaptureKind) => track(async () => {
    assertCurrent(); record('local_adapter', `${kind}_capture_requested`);
    const stream = ownLocalCaptureStream(await input.hardware.capture(kind));
    // Publish every late stream to the retired owner BEFORE resolving the mutation.
    streams[kind].push(stream);
    record('native_bridge_request', `${kind}_stream_returned`, { tracks: stream.getTracks().length });
    state[kind === 'microphone' ? 'microphoneStatus' : 'cameraStatus'] = 'enabled';
    emitMedia();
    if (!owner.isCurrent()) { owner.retire('stale_generation'); throw new Error('device_harness_late_capture'); }
  });
  const stopPlayback = async () => {
    if (!playback) return;
    await playback.stop();
    record('native_bridge_request', 'local_player_stop_completed');
  };
  const id = '00000040-0000-4000-8000-000000000040';
  const handle: NativeCallHandle = {
    id, type: 'betweener_connect', cid: `betweener_connect:${id}`,
    state: () => ({ ...state }),
    tracks: () => ({ microphone: streams.microphone.flatMap(s => s.getTracks()), camera: streams.camera.flatMap(s => s.getTracks()), remote: [] }),
    observeState(listener) { states.add(listener); return () => { states.delete(listener); }; },
    observeMedia(listener) { media.add(listener); return () => { media.delete(listener); }; },
    enableMicrophone: () => capture('microphone'),
    async disableMicrophone() { state.microphoneStatus = 'disabled'; },
    async disableCamera() { state.cameraStatus = 'disabled'; },
    async disposePublisher() { /* No peer/publication exists in this seam. */ },
    disposeSubscriber: stopPlayback,
    async join() { assertCurrent(); state.callingState = 'joined'; for (const listener of states) listener('joined'); },
    async leave() {
      await stopPlayback();
      await Promise.allSettled([...pending]);
      await stopPlayback(); // Includes a player returned after retirement.
      if (fault === 'fail') throw new Error('device_harness_injected_cleanup_failure');
      if (fault === 'hold') await hold;
      state.callingState = 'left';
      for (const listener of states) listener('left');
    },
  };
  const registry = input.registry ?? streamVideoClientLeaseRegistry;
  const lease = registry.acquireNativeExclusive('connect-device-harness:local', () => ({
    call(type: string, callId: string) {
      if (type !== handle.type || callId !== handle.id) throw new Error('device_harness_local_identity_required');
      return handle;
    },
    async disconnectUser() {
      // This is local resource disposal, never StreamVideoClient.disconnectUser.
      await Promise.allSettled([...pending]);
      await stopPlayback();
      for (const stream of [...streams.microphone, ...streams.camera]) {
        if (!releasedStreams.has(stream)) { stream.release(false); releasedStreams.add(stream); }
      }
      await input.hardware.release();
      record('local_adapter', 'local_resources_released');
    },
  }));
  owner = new ConnectNativeMediaOwner({
    // Empty credential fields deliberately cannot be used by the production factory.
    admission: { apiKey: '', token: '', expiresAt: '', user: { id: auth.userId }, media: 'voice',
      call: { type: 'betweener_connect', id, cid: handle.cid } },
    access: input, authGeneration: auth.generation, handle, audio: input.audio, lease,
    onRetire(reason) { record('owner', 'retired', reason); },
  });
  owner.subscribe(() => record('owner_sdk_contract', 'snapshot', owner.getSnapshot()));
  try {
    owner.activate();
    // Local lifecycle only: no Stream join or native peer is constructed.
    void owner.bindings.call.join({ create: false }).catch(() => owner.retire('connection_failed'));
  } catch (error) { owner.retire('connection_failed'); throw error; }
  return {
    owner,
    microphone: () => owner.bindings.call.microphone.enable(),
    camera: () => capture('camera'),
    disableMicrophone: () => owner.bindings.call.microphone.disable(),
    startTone: () => track(async () => {
      assertCurrent();
      if (toneRequested) throw new Error('device_harness_player_already_created');
      toneRequested = true;
      const result = await input.hardware.startTone();
      playback = result;
      record('native_bridge_request', 'local_player_created', result.snapshot());
      if (!owner.isCurrent()) { await result.stop(); throw new Error('device_harness_late_playback'); }
    }),
    cameraStreamUrl: () => owner.isCurrent() ? streams.camera.at(-1)?.toURL() : undefined,
    stop(reason: NativeRetirement = 'local_end') { owner.retire(reason); return owner.release(); },
    setCleanupFault(value: 'fail' | 'hold') {
      assertCurrent(); fault = value;
      if (value === 'hold') hold = new Promise(resolve => { releaseHold = resolve; });
      record('injected_fault', value);
    },
    retryCleanup() {
      if (!owner.getSnapshot().retired) throw new Error('device_harness_retry_requires_retirement');
      fault = 'none'; releaseHold?.(); record('operator', 'explicit_cleanup_retry');
      return Promise.allSettled([owner.bindings.call.microphone.disable(), owner.bindings.call.camera.disable()])
        .then(() => owner.release());
    },
    recordIndependent(observation: IndependentObservation) {
      if (!['os_instrumentation', 'external_observer'].includes(observation.source) || !observation.reference.trim()
        || !['microphone', 'camera', 'playback', 'route'].includes(observation.axis)
        || !['active_before_shutdown', 'stopped_after_shutdown', 'continued_after_shutdown', 'unknown'].includes(observation.phase)
        || !Number.isFinite(Date.parse(observation.observedAt))) throw new Error('device_harness_evidence_reference_required');
      independent.push({ ...observation });
    },
    receipt() { return {
      kind: 'offline_hardware_seam', fullProductionNativeOwnerVerified: false,
      sdkStateOrigin: 'local_adapter_model_not_stream_sdk', streamSdkInspection: 'NOT_TESTED',
      platform: input.lifecycle.platform, deviceOutcome: 'NOT_TESTED',
      ownerAndLocalAdapterEvidence: [...events], independentDeviceEvidence: independent.map(e => ({ ...e })),
      owner: owner.getSnapshot(), localPlayer: playback?.snapshot() ?? null,
      remoteRevocationBound: 'UNVERIFIED',
    }; },
  };
}
