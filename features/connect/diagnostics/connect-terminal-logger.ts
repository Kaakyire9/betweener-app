import { connectRuntimeAvailability, type ConnectRuntimeIdentity } from '../config/connect-runtime-policy.ts';
import type { VoiceApi, VoiceViewState } from '../voice/voice-types.ts';
import type { NativeOwnerSnapshot } from '../media/native-owner-types.ts';
import { nativeTransportFailureCodes, nativeReconnectStrategies } from '../media/native-reconnect-diagnostics.ts';
import { nativeSetupTimingFields } from '../media/native-setup-timings.ts';

type Fields = Record<string, string | number | boolean | null>;
interface Options { sink?(line: string): void; now?(): number }
interface Observable<T> { getSnapshot(): T; subscribe(listener: () => void): () => void }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const member = (value: unknown, values: readonly string[]) => typeof value === 'string' && values.includes(value) ? value : 'unknown';
const metric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
const bool = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const operationStates = ['not_started', 'pending', 'completed', 'failed'];
const knownCodes = new Set(['connect_unavailable', 'connect_disabled', 'connect_conflict', 'connect_busy', 'connect_consent_required',
  'connect_rate_limited', 'connect_invalid_input', 'connect_invalid_transition', 'connect_idempotency_conflict',
  'connect_unauthenticated', 'connect_device_conflict', 'connect_test_budget_exhausted', 'connect_native_owner_retired',
  'connect_native_owner_unavailable', 'connect_native_identity_invalid', 'connect_native_refresh_denied', 'connect_foreign_sdk_client',
  'stream_native_owner_busy', 'stream_client_release_pending', 'connect_native_release_unconfirmed', 'connect_native_permission_denied',
  'connect_native_route_unconfirmed', 'connect_native_route_unavailable', 'connect_native_route_no_owner', 'connect_native_route_superseded',
  'native_build_incompatible', 'connect_video_build_incompatible', 'audio_credentials_failed', 'audio_native_join_failed',
  'audio_microphone_failed', 'audio_audio_output_failed', 'audio_output_unconfirmed', 'audio_output_unavailable', 'audio_output_no_owner',
  'audio_output_cancelled', 'audio_output_superseded', 'connect_camera_cleanup_unconfirmed', 'connect_camera_unconfirmed']);

/** Compare only closed codes; never serialize an error, response, URL or message. */
function failure(error: unknown): Fields {
  try {
    const e = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const context = e.context && typeof e.context === 'object' ? e.context as Record<string, unknown> : {};
    const status = metric(e.status) ?? metric(context.status);
    const message = e.message;
    return { code: e.name === 'ConnectRpcTimeoutError' ? 'request_timeout' : typeof message === 'string' && knownCodes.has(message) ? message
      : ['Network request failed', 'Failed to fetch', 'fetch failed'].includes(message as string) ? 'network_unavailable'
        : e.name === 'AbortError' ? 'request_aborted' : 'unclassified_failure',
      httpStatus: status !== null && status >= 100 && status <= 599 ? status : null,
      databaseCode: member(e.code, ['42501', '23505', '40001', '40P01', '57014', 'P0001', 'PGRST202', 'PGRST301']) };
  } catch { return { code: 'unclassified_failure', httpStatus: null, databaseCode: 'unknown' }; }
}

/** Correlation label only; never an identity, credential or security certificate. */
function callReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.startsWith('betweener_connect:') ? value.slice('betweener_connect:'.length) : value;
  if (!uuid.test(id)) return null;
  // Independent 32-bit accumulators avoid logging the original UUID or loading crypto/native modules.
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (const c of id.toLowerCase()) { a = Math.imul(a ^ c.charCodeAt(0), 0x01000193); b = Math.imul(b ^ c.charCodeAt(0), 0x85ebca6b); }
  return `c-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
let runs = 0;

/** Console-only, exact staging/dev identity. No Sentry, persistence or new network transport. */
export function createConnectTerminalLogger(identity: ConnectRuntimeIdentity, options: Options = {}) {
  const enabled = connectRuntimeAvailability(identity).runtime;
  const now = options.now ?? (() => globalThis.performance?.now() ?? Date.now());
  const start = now(), run = `${identity.platform}-${Date.now().toString(36)}-${++runs}`;
  const sink = options.sink ?? (line => console.log(line));
  let disposed = false, seq = 0, currentCall: string | null = null, request = 0;
  const previous = new Map<string, { signature: string; at: number }>();
  const failures = new Map<string, { signature: string; at: number }>();
  const subscriptions = new Set<() => void>();
  // Bounded process memory only. Replaying the final row makes a pasted later
  // call excerpt useful without persisting identities or manufacturing an End.
  const summaries = new Map<string, Fields>();
  const firstSdkFaults = new Map<string, Fields>();
  const firstTransportFaults = new Map<string, Fields>();
  let nativeUnsubscribe: (() => void) | null = null;
  const emit = (event: string, data: Fields, ref: string | null = currentCall) => {
    if (!enabled || disposed) return;
    try { sink(`[Connect] ${JSON.stringify({ v: 1, platform: identity.platform, run, seq: ++seq,
      elapsedMs: Math.max(0, Math.round(now() - start)), call: ref, event, ...data })}`); } catch { /* Logging never controls a call. */ }
  };
  const changed = (key: string, data: Fields, heartbeatMs?: number, ref?: string | null, signature = JSON.stringify(data)) => {
    const last = previous.get(key), time = now();
    if (last?.signature === signature && (heartbeatMs === undefined || time - last.at < heartbeatMs)) return;
    previous.set(key, { signature, at: time }); emit(key, data, ref);
  };
  const failed = (key: string, error: unknown, ref: string | null = currentCall, details: Fields = {}) => {
    const data = failure(error), signature = JSON.stringify(data), last = failures.get(key), time = now();
    if (last?.signature === signature && time - last.at < 10_000) return;
    if (failures.size >= 32 && !failures.has(key)) failures.delete(failures.keys().next().value!);
    failures.set(key, { signature, at: time }); emit('request_failed', { step: key.split(':')[0], ...details, ...data }, ref);
  };
  const withSdkFault = (ref: string, summary: Fields): Fields => {
    const encryptionFailed = summary.encryptionFailed === true || firstSdkFaults.has(ref);
    return { ...summary, ...firstSdkFaults.get(ref), ...firstTransportFaults.get(ref),
      encryptionFailed, failed: summary.failed === true || summary.cleanupFailed === true || encryptionFailed };
  };
  const replay = (ref: string, reason: 'done' | 'next_call' | 'logger_disposed') => {
    const summary = summaries.get(ref);
    if (summary) emit('call_summary', { ...withSdkFault(ref, summary), reason }, ref);
  };
  const execute = async <T>(step: string, task: () => Promise<T>, id?: string, quiet = false, media?: string): Promise<T> => {
    if (!enabled) return task();
    const ref = callReference(id), key = `${step}:${ref ?? '-'}`, number = ++request, at = now();
    if (!quiet) emit('request_started', { step, request: number, ...(media ? { media: member(media, ['voice', 'video']) } : {}) }, ref);
    try {
      const value = await task();
      const resultId = value && typeof value === 'object' && 'id' in value ? (value as { id: unknown }).id : null;
      if (!quiet || failures.has(key)) emit(quiet ? 'request_recovered' : 'request_completed',
        { step, request: number, durationMs: Math.max(0, Math.round(now() - at)) }, callReference(resultId) ?? ref);
      failures.delete(key); return value;
    } catch (error) { failed(key, error, ref, { request: number, durationMs: Math.max(0, Math.round(now() - at)) }); throw error; }
  };
  const observe = (s: VoiceViewState) => {
    if (!enabled || disposed) return;
    const ref = callReference(s.session?.id);
    if (ref !== currentCall) {
      if (currentCall) replay(currentCall, ref ? 'next_call' : 'done');
      else if (ref) {
        const last = [...summaries.keys()].at(-1);
        if (last && last !== ref) replay(last, 'next_call');
      }
      currentCall = ref; previous.clear();
    }
    changed('flow', { phase: member(s.phase, ['IDLE', 'REQUESTED', 'RINGING', 'CONNECTING', 'ACTIVE', 'RECONNECTING', 'ENDING', 'ENDED', 'FAILED']),
      serverState: member(s.session?.state, ['REQUESTED', 'RINGING', 'ACCEPTED', 'CONNECTING', 'ACTIVE', 'RECONNECTING', 'ENDING', 'ENDED', 'DECLINED', 'CANCELLED', 'MISSED', 'BUSY', 'FAILED']),
      version: metric(s.session?.version), media: s.session ? member(s.session.media, ['voice', 'video']) : 'none',
      direction: s.incoming ? 'incoming' : 'outgoing', foreground: s.foreground, busy: s.busy });
    changed('permission', { microphone: member(s.permission, ['granted', 'denied', 'blocked']) });
    if (s.audioSetupStage) changed('audio_setup', { stage: member(s.audioSetupStage, ['credentials', 'native_join', 'microphone', 'audio_output', 'ready']) });
    changed('audio_controls', { muted: s.muted, route: member(s.route, ['earpiece', 'speaker', 'bluetooth', 'wired']) });
    if (s.muteControl) changed('microphone_control', { request: metric(s.muteControl.request),
      source: member(s.muteControl.source, ['app', 'system']), requestedMuted: bool(s.muteControl.requestedMuted),
      status: member(s.muteControl.status, ['pending', 'confirmed', 'failed']) });
    if (s.audioHealth) changed('audio_health', { reception: member(s.audioHealth.reception, ['unavailable', 'awaiting', 'receiving', 'stale']),
      sending: bool(s.audioHealth.sending), receivedPackets: metric(s.audioHealth.receivedPackets),
      jitterMs: metric(s.audioHealth.jitterMs), roundTripMs: metric(s.audioHealth.roundTripMs), audibleOutput: 'not_verified' },
    10_000, undefined, JSON.stringify([s.audioHealth.reception, s.audioHealth.sending]));
    if (s.video) changed('video', { camera: member(s.video.camera, ['off', 'starting', 'on', 'stopping', 'failed']),
      facing: member(s.video.facing, ['front', 'back', 'unknown']), permission: member(s.video.permission, ['granted', 'denied', 'blocked']), failed: !!s.video.error });
    changed('authority', { status: member(s.authorityStatus, ['current', 'unavailable']), end: member(s.endStatus, ['pending', 'terminal', 'unconfirmed']) });
    changed('local_cleanup', { microphone: member(s.localShutdown.microphone, ['pending', 'verified', 'unverified', 'failed']),
      camera: member(s.localShutdown.camera, ['pending', 'verified', 'unverified', 'failed']),
      publication: member(s.localShutdown.publication, ['pending', 'verified', 'unverified', 'failed']),
      playback: member(s.localShutdown.playback, ['pending', 'verified', 'unverified', 'failed']),
      subscriptions: member(s.localShutdown.subscriptions, ['pending', 'verified', 'unverified', 'failed']),
      sdkLeave: member(s.localShutdown.sdkLeave, ['pending', 'completed', 'failed', 'not_owned']),
      release: member(s.localShutdown.resourceRelease, ['pending', 'completed', 'failed', 'not_owned']),
      physicalShutdown: 'not_verified', remoteMediaShutdown: 'not_verified' });
    if (s.endBlock) changed('end_and_block', { block: member(s.endBlock.block, ['pending', 'saved', 'no_longer_saved']),
      call: member(s.endBlock.call, ['pending', 'terminal']), provider: member(s.endBlock.provider, ['pending', 'acknowledged', 'unconfirmed']), remoteMediaShutdown: 'not_verified' });
    const encryptionFailed = s.interruption === 'encryption_failed' || !!ref && firstSdkFaults.has(ref);
    changed('failure', { present: !!s.error || encryptionFailed, code: s.audioSetupFailure && knownCodes.has(s.audioSetupFailure.code) ? s.audioSetupFailure.code
      : encryptionFailed ? 'connect_encryption_failed' : 'none',
      interruption: member(s.interruption, ['background', 'interruption', 'connection_failed', 'encryption_failed', 'navigation', 'permission_denied', 'stale_generation']) });
    const timing = { credentialsMs: metric(s.quality?.credentialsMs), nativeJoinMs: metric(s.quality?.nativeJoinMs),
      microphoneEnableMs: metric(s.quality?.microphoneEnableMs), outputSelectionMs: metric(s.quality?.outputSelectionMs),
      setupMs: metric(s.quality?.setupMs), firstReceivedPacketMs: metric(s.quality?.firstReceivedPacketMs),
      firstReceiverGrowthMs: metric(s.quality?.firstReceiverGrowthMs) };
    if (s.quality) changed('timings', { ...timing, packetTiming: 'local_report_observation_not_audible',
      sdkReleaseMs: metric(s.quality.sdkReleaseMs), authorityEndMs: metric(s.quality.authorityEndMs) });
    if (ref) {
      const summary = withSdkFault(ref, { phase: member(s.phase, ['IDLE', 'REQUESTED', 'RINGING', 'CONNECTING', 'ACTIVE', 'RECONNECTING', 'ENDING', 'ENDED', 'FAILED']),
        serverState: member(s.session?.state, ['REQUESTED', 'RINGING', 'ACCEPTED', 'CONNECTING', 'ACTIVE', 'RECONNECTING', 'ENDING', 'ENDED', 'DECLINED', 'CANCELLED', 'MISSED', 'BUSY', 'FAILED']),
        version: metric(s.session?.version), media: member(s.session?.media, ['voice', 'video']), direction: s.incoming ? 'incoming' : 'outgoing',
        ...timing, sdkReleaseMs: metric(s.quality?.sdkReleaseMs), authorityEndMs: metric(s.quality?.authorityEndMs),
        authorityEnd: member(s.endBlock?.call ?? s.endStatus, ['pending', 'terminal', 'unconfirmed']),
        sdkLeave: member(s.localShutdown.sdkLeave, ['pending', 'completed', 'failed', 'not_owned']),
        release: member(s.localShutdown.resourceRelease, ['pending', 'completed', 'failed', 'not_owned']),
        providerEnd: member(s.endBlock?.provider, ['pending', 'acknowledged', 'unconfirmed']),
        receivedPackets: metric(s.audioHealth?.receivedPackets), failed: !!s.error, encryptionFailed,
        cleanupFailed: Object.values(s.localShutdown).some(value => value === 'failed'),
        physicalShutdown: 'not_verified', remoteMediaShutdown: 'not_verified' });
      if (summaries.size >= 4 && !summaries.has(ref)) summaries.delete(summaries.keys().next().value!);
      summaries.set(ref, summary);
      if (['ENDING', 'ENDED', 'FAILED'].includes(s.phase)) changed('call_summary', { ...summary, reason: 'state_change' }, undefined, ref);
    }
  };
  const wrapApi = (api: VoiceApi): VoiceApi => !enabled ? api : ({ ...api,
    createCall: (...args) => execute('create_call', () => api.createCall(...args), undefined, false, args[1]),
    act: (...args) => execute(member(args[1], ['accept', 'decline', 'cancel', 'end']), () => api.act(...args), args[0]),
    getCall: (...args) => execute('read_call', () => api.getCall(...args), args[0], true),
    getHistory: (...args) => execute('discover_incoming', () => api.getHistory(...args), undefined, true),
    credentials: (...args) => execute('credentials', () => api.credentials(...args), args[0]),
    ...(api.prepareEndBlock ? { prepareEndBlock: (...args: Parameters<NonNullable<VoiceApi['prepareEndBlock']>>) =>
      execute('prepare_end_and_block', () => api.prepareEndBlock!(...args), args[0].id) } : {}),
    ...(api.endCallAndBlock ? { endCallAndBlock: (...args: Parameters<NonNullable<VoiceApi['endCallAndBlock']>>) =>
      execute('end_and_block', () => api.endCallAndBlock!(...args), args[0].call_id) } : {}),
    ...(api.getEndBlockStatus ? { getEndBlockStatus: (...args: Parameters<NonNullable<VoiceApi['getEndBlockStatus']>>) =>
      execute('read_end_and_block', () => api.getEndBlockStatus!(...args), args[0].call_id, true) } : {}),
  });
  const watch = (source: Observable<VoiceViewState>) => {
    if (!enabled || disposed) return () => undefined;
    const read = () => { try { observe(source.getSnapshot()); } catch { /* Observability is never authority. */ } };
    let unsubscribe = () => {};
    try { unsubscribe = source.subscribe(read); subscriptions.add(unsubscribe); read(); } catch { /* No diagnostic subscription may block setup. */ }
    return () => { subscriptions.delete(unsubscribe); try { unsubscribe(); } catch { /* Call cleanup is independent. */ } };
  };
  const watchOwner = (source: Observable<NativeOwnerSnapshot>) => {
    if (!enabled || disposed) return;
    try { nativeUnsubscribe?.(); } catch { /* Call ownership is independent. */ }
    const last = new Map<string, string>();
    const read = () => {
      try {
        const s = source.getSnapshot(), ref = callReference(s.cid);
        const record = (event: string, data: Fields) => {
          const signature = JSON.stringify(data);
          if (last.get(event) !== signature) { last.set(event, signature); emit(event, data, ref); }
        };
        record('native_owner', { generation: metric(s.generation), retired: s.retired,
          appState: member(s.appState, ['active', 'inactive', 'background', 'unknown']),
          inspection: member(s.inspection, ['complete', 'failed']),
          reason: member(s.reason, ['local_end', 'background', 'interruption', 'account_changed', 'navigation', 'permission_denied', 'connection_failed', 'encryption_failed', 'stale_generation']),
          callingState: member(s.sdk.callingState, ['idle', 'ringing', 'joining', 'joined', 'left', 'reconnecting', 'migrating', 'offline', 'reconnecting-failed', 'unknown']),
          microphone: member(s.sdk.microphoneStatus, ['enabled', 'disabled', 'unknown']),
          camera: member(s.sdk.cameraStatus, ['enabled', 'disabled', 'unknown']),
          audioPublishing: bool(s.sdk.audioPublishing), videoPublishing: bool(s.sdk.videoPublishing),
          publisherPresent: bool(s.sdk.publisherPresent), subscriberPresent: bool(s.sdk.subscriberPresent), evidence: 'sdk_reported' });
        if (s.setupTimings) record('native_setup', { ...Object.fromEntries(nativeSetupTimingFields.map(field => [field, metric(s.setupTimings?.[field])])),
          clock: 'local_process', spans: 'nested_not_additive', evidence: 'sdk_reported' });
        if (s.operations.release === 'failed') record('native_cleanup_fault', {
          reason: member(s.releaseFailure, ['tracks_live', 'capture_release', 'sdk_leave', 'peers_present', 'observers', 'audio_configuration', 'client_release', 'unknown']),
          evidence: 'sdk_reported' });
        if (s.systemCallActivation) record('native_call_activation', {
          status: member(s.systemCallActivation, ['not_started', 'pending', 'confirmed', 'foreground_only', 'not_applicable', 'failed', 'cancelled']),
          reason: member(s.systemCallActivationFailure ?? 'none', ['none', 'invalid_call', 'native_api_failed', 'registration_missing', 'registration_lost',
            'event_subscription_failed', 'activation_request_failed', 'active_event_timeout', 'ack_timeout', 'owner_retired']),
          evidence: s.systemCallActivation === 'confirmed' ? 'native_call_state_event_and_bridge_ack' : 'local_activation_state' });
        if (s.systemInterruption) record('native_interruption', {
          kind: member(s.systemInterruption.kind, ['end', 'hold', 'audio_session']),
          cause: member(s.systemInterruption.cause, ['local', 'remote', 'rejected', 'busy', 'answeredElsewhere', 'missed', 'error']),
          evidence: 'native_system_event' });
        if (s.sdk.transportFailure) {
          const fault = { firstTransportFailure: member(s.sdk.transportFailure.code, nativeTransportFailureCodes),
            firstReconnectStrategy: member(s.sdk.transportFailure.strategy, nativeReconnectStrategies), firstTransportFailureGeneration: metric(s.generation) };
          record('native_transport_fault', { ...fault, evidence: 'sdk_reported' });
          if (ref && !firstTransportFaults.has(ref)) {
            if (firstTransportFaults.size >= 4) firstTransportFaults.delete(firstTransportFaults.keys().next().value!);
            firstTransportFaults.set(ref, fault);
          }
        }
        if (s.sdk.failure) {
          const fault = { firstSdkFailure: member(s.sdk.failure.code, ['e2ee.encryption_failed', 'e2ee.decryption_stalled', 'e2ee.missing_key', 'e2ee.unencrypted_frame', 'e2ee.unsupported_version']),
            firstSdkFailureTrack: member(s.sdk.failure.trackType, ['AUDIO', 'VIDEO', 'SCREEN_SHARE', 'SCREEN_SHARE_AUDIO']),
            firstSdkFailureParty: member(s.sdk.failure.party, ['local', 'remote']), firstSdkFailureGeneration: metric(s.generation),
            failureCallingState: member(s.sdk.failure.context?.callingState, ['idle', 'ringing', 'joining', 'joined', 'left', 'reconnecting', 'migrating', 'offline', 'reconnecting-failed']),
            failureMicrophone: member(s.sdk.failure.context?.microphoneStatus, ['enabled', 'disabled']),
            failurePublisherPresent: bool(s.sdk.failure.context?.publisherPresent), failureSubscriberPresent: bool(s.sdk.failure.context?.subscriberPresent),
            failureLocalRetirementRequested: bool(s.sdk.failure.context?.localRetirementRequested) };
          record('native_fault', { ...fault, evidence: 'sdk_reported' });
          if (ref && !firstSdkFaults.has(ref)) {
            if (firstSdkFaults.size >= 4) firstSdkFaults.delete(firstSdkFaults.keys().next().value!);
            firstSdkFaults.set(ref, fault);
            // A native callback can arrive after the last controller update.
            // Correct that call's retained summary without touching its outcome
            // or a successor call, and never imply confirmed media shutdown.
            const summary = summaries.get(ref);
            if (summary) {
              const corrected = withSdkFault(ref, summary);
              summaries.set(ref, corrected);
              if (['ENDING', 'ENDED', 'FAILED'].includes(String(summary.phase))) emit('call_summary', { ...corrected, reason: 'native_fault' }, ref);
            }
          }
        }
        if (s.audioRoute) record('native_audio_route', {
          requested: member(s.audioRoute.requested, ['speaker', 'earpiece', 'bluetooth', 'wired']),
          status: member(s.audioRoute.status, ['idle', 'checking', 'confirmed', 'unconfirmed', 'failed', 'cancelled']),
          speakerAvailable: Array.isArray(s.audioRoute.available) && s.audioRoute.available.includes('speaker'),
          earpieceAvailable: Array.isArray(s.audioRoute.available) && s.audioRoute.available.includes('earpiece'),
          bluetoothAvailable: Array.isArray(s.audioRoute.available) && s.audioRoute.available.includes('bluetooth'),
          wiredAvailable: Array.isArray(s.audioRoute.available) && s.audioRoute.available.includes('wired'),
          selected: member(s.audioRoute.selected, ['speaker', 'earpiece', 'bluetooth', 'wired']),
          output: member(s.audioRoute.output, ['speaker', 'earpiece', 'bluetooth', 'wired']), evidence: 'native_route_state',
        });
        for (const name of ['microphone', 'camera', 'publisher', 'subscriber', 'microphoneTrackRelease', 'cameraTrackRelease', 'playoutMute', 'leave', 'release', 'audioConfiguration'] as const) {
          record(`native_${name}`, { status: member(s.operations[name], operationStates), evidence: 'sdk_reported' });
        }
      } catch { /* Never dump an unexpected native object. */ }
    };
    try { nativeUnsubscribe = source.subscribe(read); read(); } catch { /* Call setup is independent. */ }
  };
  emit('logging_ready', { clock: 'local_process', destination: 'development_console_only', rawIdentifiers: false, hardwareProof: false });
  return { enabled, wrapApi, watch, watchOwner,
    serviceFailure(service: 'rpc' | 'credentials', error: unknown, callId?: unknown) {
      if (enabled && !disposed) {
        const ref = callReference(callId);
        failed(`service_${member(service, ['rpc', 'credentials'])}:${ref ?? '-'}`, error, ref);
      }
    },
    dispose() { if (disposed) return; for (const ref of summaries.keys()) replay(ref, 'logger_disposed'); emit('logging_stopped', {}); disposed = true;
      for (const unsubscribe of subscriptions) { try { unsubscribe(); } catch { /* Call cleanup is independent. */ } }
      subscriptions.clear(); try { nativeUnsubscribe?.(); } catch { /* Call cleanup is independent. */ } nativeUnsubscribe = null;
      previous.clear(); failures.clear(); summaries.clear(); firstSdkFaults.clear(); firstTransportFaults.clear(); },
  };
}
