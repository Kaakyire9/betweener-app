import { loadStreamVideoSdk, type StreamVideoSdkModule } from '../../live/media/load-stream-video-sdk.ts';
import type { NativeAudioHandle, NativeCallHandle, NativeSdkCallState, NativeStreamSdk } from './native-owner-types.ts';
import { retainNativeCaptureTracks } from './native-capture-tracks.ts';
import { createNativeMediaEngineOwner } from './native-media-engine-owner.ts';
import { audioSampleFromReport } from './audio-health.ts';
import { registerConnectRingingOwner } from './native-ringing-guard.ts';
import { registerStreamVideoBackgroundClient, unregisterStreamVideoBackgroundClient } from '../../live/media/stream-video-background-client.ts';
import { createOngoingCallLease } from './native-ongoing-call.ts';
import { prepareCallEncryption } from '../experimental/call-encryption.ts';
import { createEncryptionTransformGuard } from '../experimental/encryption-transform-guard.ts';
import { createNativeMicrophonePause } from './native-microphone-pause.ts';
import { createNativeCallActivation, nativeDisconnectCause } from './native-call-activation.ts';
import { createNativePublisherRetirement } from './native-publisher-retirement.ts';
import { nativeReconnectFailure } from './native-reconnect-diagnostics.ts';
import { createNativeCallAudio } from './native-call-audio.ts';
import { configureConnectMicrophoneInput } from './native-microphone-input.ts';

/** Installed SDK boundary. No native module is evaluated until the gated loader runs. */
export function adaptNativeStreamSdk(sdk: Pick<StreamVideoSdkModule, 'StreamVideoClient' | 'callManager' | 'SfuModels' | 'getCallMediaEngineProvider' | 'setCallMediaEngineProvider' | 'StreamCallProvider' | 'StreamTheme' | 'ParticipantView' | 'hasVideo'> & Partial<Pick<StreamVideoSdkModule, 'EncryptionManager'>>, configureMicrophoneInput: (enabled: boolean) => Promise<void> = configureConnectMicrophoneInput): NativeStreamSdk {
  return {
    createClient({ apiKey, userId, tokenProvider, onConnectionFailure }) {
      const onConnectUserError = () => onConnectionFailure();
      const client = sdk.StreamVideoClient.getOrCreateInstance({ apiKey, user: { id: userId }, tokenProvider,
        options: { onConnectUserError, maxConnectUserRetries: 1, clientEventsReportingEnabled: false,
          logOptions: { default: { level: 'error', sink: () => undefined } } } });
      // getOrCreateInstance otherwise silently returns a Live/unowned cached client.
      // A fresh callback identity proves this instance was created with our options.
      if (client.streamClient.options.onConnectUserError !== onConnectUserError) throw new Error('connect_foreign_sdk_client');
      const previousEngineProvider = sdk.getCallMediaEngineProvider();
      const engines = createNativeMediaEngineOwner(previousEngineProvider);
      sdk.setCallMediaEngineProvider(engines.provider);
      let disconnected = false, disconnecting: Promise<void> | null = null;
      // Reuse the existing dispatcher with this already Auth-bound client. Never
      // construct a background client or reuse Live's credential provider.
      registerStreamVideoBackgroundClient(client);
      return {
        disconnectUser: () => {
          if (disconnected) return Promise.resolve();
          if (disconnecting) return disconnecting;
          // SDK leave catches factory-disposal errors. Retain/retry our exact
          // engines and keep the exclusive lease until their disposal succeeds.
          disconnecting = (async () => {
            await engines.release();
            await client.disconnectUser();
            unregisterStreamVideoBackgroundClient(client);
            if (sdk.getCallMediaEngineProvider() !== engines.provider) throw new Error('connect_foreign_media_engine_provider');
            sdk.setCallMediaEngineProvider(previousEngineProvider); disconnected = true;
          })().finally(() => { disconnecting = null; });
          return disconnecting;
        },
        call(type, id): NativeCallHandle {
          const call = client.call(type, id);
          const publisherRetirement = createNativePublisherRetirement(call);
          let encryption: Awaited<ReturnType<typeof prepareCallEncryption>> = null;
          let encryptionRequired = false, encryptionFailed = false, encryptionTransformsRetired = false;
          let encryptionCurrent = () => false;
          let encryptionFailure: NativeSdkCallState['failure'];
          let transportFailure: NativeSdkCallState['transportFailure'];
          let unsubscribeTransport: (() => void) | undefined;
          try {
            unsubscribeTransport = call.on?.('error', event => {
              if (transportFailure || encryptionTransformsRetired || call.state.callingState === 'left') return;
              transportFailure = nativeReconnectFailure(event, sdk.SfuModels);
            });
          } catch { /* Older diagnostic surfaces cannot change call ownership. */ }
          const encryptionListeners = new Set<(state: string) => void>(), encryptionSubscriptions: (() => void)[] = [];
          const failEncryption = (code: NonNullable<NativeSdkCallState['failure']>['code'], details?: { userId?: string; trackType?: string }) => {
            // A retired manager cannot fail its successor. Active faults remain fatal,
            // including faults raised during mute; retain only bounded categories.
            if (encryptionFailed || encryptionTransformsRetired || !encryptionCurrent() || call.state.callingState === 'left') return;
            encryptionFailure = { code, trackType: 'unknown', party: 'unknown' };
            try {
              const trackType = details?.trackType, participant = details?.userId;
              encryptionFailure.trackType = trackType === 'AUDIO' || trackType === 'VIDEO' || trackType === 'SCREEN_SHARE' || trackType === 'SCREEN_SHARE_AUDIO' ? trackType : 'unknown';
              encryptionFailure.party = typeof participant === 'string' ? participant === userId ? 'local' : 'remote' : 'unknown';
            } catch { /* Diagnostic fields cannot suppress an active encryption fault. */ }
            encryptionFailed = true;
            for (const listener of encryptionListeners) listener('reconnecting-failed');
          };
          let ongoing: ReturnType<typeof createOngoingCallLease> | null = null, lastSystemMuted: boolean | null = null;
          let activation: ReturnType<typeof createNativeCallActivation> | null = null;
          const nativeListeners = new Set<() => void>();
          const callingx = () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return (require('@stream-io/react-native-callingx') as typeof import('@stream-io/react-native-callingx')).CallingxModule;
          };
          const captures = new WeakMap<object, ReturnType<typeof retainNativeCaptureTracks>>();
          const microphonePause = createNativeMicrophonePause({
            current: () => !encryptionTransformsRetired && !encryptionFailed && encryptionCurrent()
              && call.state.callingState === 'joined' && call.state.e2eeEnabled === true,
            capture: () => call.microphone.state.mediaStream?.getTracks() ?? [],
            published: publisherRetirement.tracks,
            status: () => call.microphone.state.status ?? 'unknown',
            setStatus: status => { call.microphone.state.setPendingStatus(status); call.microphone.state.setStatus(status); },
            enable: () => call.microphone.enable(), disable: () => call.microphone.disable(true),
          });
          let leaving: Promise<void> | null = null, configuringInput: Promise<void> | null = null, inputConfigured = false;
          const leave = (): Promise<void> => {
            if (leaving) return leaving;
            // Fence late transforms before any SDK/native teardown callback.
            encryptionTransformsRetired = true; activation?.dispose();
            let resolve!: () => void, reject!: (error: unknown) => void;
            const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
            leaving = pending;
            void (async () => {
              await Promise.all([ongoing?.dispose(), call.state.callingState !== 'left' ? call.leave({ reject: false }) : Promise.resolve()]);
              await Promise.allSettled(configuringInput ? [configuringInput] : []);
              if (call.state.callingState === 'left') {
                let inputResetFailed = false;
                if (inputConfigured) {
                  try { await configureMicrophoneInput(false); inputConfigured = false; } catch { inputResetFailed = true; }
                }
                try { unsubscribeTransport?.(); } catch { /* Diagnostic cleanup is independent. */ }
                unsubscribeTransport = undefined;
                encryption?.retire(); encryption?.release(); encryption = null;
                for (const unsubscribe of encryptionSubscriptions.splice(0)) unsubscribe();
                if (inputResetFailed) throw Error('connect_native_audio_input_unconfirmed');
              }
            })().then(resolve, reject);
            void pending.finally(() => { if (leaving === pending) leaving = null; }).catch(() => undefined);
            return pending;
          };
          const tracks = (stream: { getTracks(): import('./native-owner-types').NativeTrack[] } | undefined) => {
            if (!stream) return [];
            let owned = captures.get(stream);
            if (!owned) { owned = retainNativeCaptureTracks(stream); captures.set(stream, owned); }
            return owned;
          };
          return {
            async prepareEncryption(admission, agent, current, authEpoch) {
              const mode = admission.encryption?.mode;
              if (mode !== 'required') return;
              if (encryption) throw Error('connect_e2ee_already_prepared');
              encryptionRequired = true;
              encryptionCurrent = current;
              if (!sdk.EncryptionManager || !agent) throw Error('connect_e2ee_unavailable');
              // Resolve the actual provider mode, never create or modify a call.
              await call.get();
              if (!current() || call.cid !== admission.call.cid) throw Error('connect_e2ee_owner_retired');
              encryption = await prepareCallEncryption({ required: true,
                binding: { cid: call.cid, userId, authEpoch, participants: admission.encryption!.participants, generation: admission.encryption!.generation },
                call: { cid: call.cid, attach: manager => call.setE2EEManager(createEncryptionTransformGuard(
                  manager as unknown as Parameters<typeof call.setE2EEManager>[0],
                  () => !encryptionTransformsRetired && current() && call.state.callingState !== 'left')),
                  hasJoined: () => !!call.publisher || !!call.subscriber || ['joined', 'joining'].includes(call.state.callingState),
                  hasLeft: () => call.state.callingState === 'left', mode: () => call.state.settings?.encryption?.mode === 'auto-on' ? 'auto-on' : call.state.settings?.encryption?.mode === 'disabled' ? 'disabled' : 'unknown' },
                sdk: { isSupported: sdk.EncryptionManager.isSupported, async create(user, options) {
                  const manager = await sdk.EncryptionManager!.create(user, options);
                  for (const event of ['e2ee.encryption_failed', 'e2ee.decryption_stalled', 'e2ee.missing_key', 'e2ee.unencrypted_frame', 'e2ee.unsupported_version'] as const) {
                    encryptionSubscriptions.push(manager.on(event, details => failEncryption(event, details)));
                  }
                  return manager;
                } }, agent, current, now: Date.now });
              if (!current()) {
                if (call.state.callingState === 'left') { encryption?.retire(); encryption?.release(); encryption = null; }
                throw Error('connect_e2ee_owner_retired');
              }
            },
            encryptionStatus: () => ({ mode: encryptionRequired ? 'required' : 'disabled', sdkConfirmed: encryptionRequired && !!encryption && !encryptionFailed && encryptionCurrent() && call.state.callingState === 'joined' && call.state.e2eeEnabled === true }),
            id: call.id, cid: call.cid, type: call.type,
            state: () => ({ failure: encryptionFailure, transportFailure, callingState: call.state.callingState, microphoneStatus: call.microphone.state.status ?? 'unknown',
              cameraStatus: call.camera.state.status ?? 'unknown',
              audioPublishing: call.publisher?.isPublishing(sdk.SfuModels.TrackType.AUDIO) ?? (call.state.callingState === 'left' ? false : null),
              videoPublishing: call.publisher?.isPublishing(sdk.SfuModels.TrackType.VIDEO) ?? (call.state.callingState === 'left' ? false : null),
              publisherPresent: !!call.publisher, subscriberPresent: !!call.subscriber }),
            tracks: () => ({ microphone: [...tracks(call.microphone.state.mediaStream), ...publisherRetirement.tracks().filter(track => track.kind === 'audio')],
              camera: [...tracks(call.camera.state.mediaStream), ...publisherRetirement.tracks().filter(track => track.kind === 'video')],
              remote: call.state.remoteParticipants.flatMap(p => [p.audioStream, p.videoStream, p.screenShareStream, p.screenShareAudioStream].flatMap(s => s?.getTracks() ?? [])) }),
            observeState(listener) { encryptionListeners.add(listener); const s = call.state.callingState$.subscribe(listener);
              if (encryptionFailed) listener('reconnecting-failed'); return () => { encryptionListeners.delete(listener); s.unsubscribe(); }; },
            observeMedia(listener) { const a = call.microphone.state.mediaStream$.subscribe(listener); const b = call.camera.state.mediaStream$.subscribe(listener);
              const c = call.state.remoteParticipants$.subscribe(listener);
              // Observing this SDK stream enables its local stats reporter. Raw
              // reports never leave this boundary or enter the product snapshot.
              const d = call.state.callStatsReport$?.subscribe(listener);
              const e = call.camera.state.status$.subscribe(listener);
              const f = call.microphone.state.status$?.subscribe(listener);
              nativeListeners.add(listener);
              return () => { a.unsubscribe(); b.unsubscribe(); c.unsubscribe(); d?.unsubscribe(); e.unsubscribe(); f?.unsubscribe(); nativeListeners.delete(listener); }; },
            audioSample: () => audioSampleFromReport(call.state.callStatsReport),
            async activateSystemCall(current, foreground = () => false) {
              if (!activation) {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { Platform } = require('react-native') as typeof import('react-native');
                activation = createNativeCallActivation({ cid: call.cid, platform: Platform.OS === 'ios' ? 'ios' : 'android', port: callingx,
                  current: () => current() && !encryptionTransformsRetired && !encryptionFailed,
                  joined: () => call.state.callingState === 'joined', foreground,
                  onChange: () => { for (const listener of nativeListeners) { try { listener(); } catch { /* Inspection is independent. */ } } } });
              }
              await activation.activate();
            },
            systemCallActivation: () => activation?.status() ?? 'not_started',
            systemCallActivationFailure: () => activation?.failure() ?? null,
            async setBackgroundAudio(enabled, current) {
              if (enabled && activation?.status() === 'foreground_only') throw Error('connect_background_unavailable');
              if (!ongoing) {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { Platform } = require('react-native') as typeof import('react-native');
                ongoing = createOngoingCallLease({ cid: call.cid, platform: Platform.OS === 'ios' ? 'ios' : 'android', port: callingx(), current });
              }
              return ongoing.set(enabled);
            },
            backgroundAudioActive: () => ongoing?.active() === true,
            async syncSystemMuted(muted) {
              if (muted === lastSystemMuted) return;
              const port = callingx(); if (!port.isSetup || !port.isCallTracked(call.cid)) return;
              lastSystemMuted = muted;
              try { await port.setMutedCall(call.cid, muted); } catch { lastSystemMuted = null; }
            },
            observeSystemActions(listener) {
              const subscriptions: { remove(): void }[] = [];
              const cleanup = () => { for (const subscription of subscriptions.splice(0)) subscription.remove(); };
              try {
                const port = callingx();
                subscriptions.push(port.addEventListener('endCall', e => { if (e.callId === call.cid && e.source === 'sys') listener({ kind: 'end', cause: nativeDisconnectCause(e.cause) }); }));
                subscriptions.push(port.addEventListener('didPerformSetMutedCallAction', e => { if (e.callId === call.cid) listener({ kind: 'mute', muted: e.muted }); }));
                subscriptions.push(port.addEventListener('didToggleHoldCallAction', e => { if (e.callId === call.cid && e.hold) listener({ kind: 'hold' }); }));
                return cleanup;
              } catch { cleanup(); return () => {}; }
            },
            authorizeRingingJoin: current => registerConnectRingingOwner(call, current),
            enableMicrophone: () => encryptionRequired ? microphonePause.enable() : call.microphone.enable(),
            muteMicrophone: async () => { if (encryptionRequired) microphonePause.mute(); else await call.microphone.disable(true); },
            enforceMicrophoneMute: () => { if (encryptionRequired) microphonePause.enforce(); },
            disableMicrophone: () => encryptionRequired ? microphonePause.stop() : call.microphone.disable(true), disableCamera: () => call.camera.disable(true),
            enableCamera: () => call.camera.enable(),
            flipCamera: async () => { await call.camera.flip(); return call.camera.state.direction; },
            cameraEnabled: () => call.camera.state.status === 'enabled' ? true : call.camera.state.status === 'disabled' ? false : null,
            async setCameraQuality(quality) {
              if (call.camera.state.status !== 'disabled') throw Error('connect_camera_busy');
              await call.camera.selectTargetResolution(quality === 'data_saver' ? { width: 320, height: 240 } : { width: 640, height: 480 });
            },
            videoPresentation: current => {
              // Stable component identity prevents controller ticks from remounting tracks.
              const ScopedVideoRenderer: NonNullable<import('@stream-io/video-react-native-sdk').ParticipantViewProps['VideoRenderer']> = props => {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const React = require('react') as typeof import('react');
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { NativeVideoRenderer } = require('./native-video-renderer') as typeof import('./native-video-renderer');
                return current() ? React.createElement(NativeVideoRenderer, { ...props, current }) : null;
              };
              return {
              participants: () => call.state.participants.map(p => ({ sessionId: p.sessionId, local: p.isLocalParticipant, cameraOn: sdk.hasVideo(p) })),
              subscribe: listener => { const subscription = call.state.participants$.subscribe(listener); return () => subscription.unsubscribe(); },
              render(sessionId, local, options) {
                const participant = call.state.participants.find(p => p.sessionId === sessionId && p.isLocalParticipant === local);
                if (!participant) return null;
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const React = require('react') as typeof import('react');
                // Pure SDK contexts only: StreamCall/StreamVideo mount native auto-resume,
                // push-registration and keep-alive effects that Connect does not authorise.
                return React.createElement(sdk.StreamCallProvider, { call },
                  React.createElement(sdk.StreamTheme, {}, React.createElement(sdk.ParticipantView, {
                    participant, trackType: 'videoTrack', objectFit: options?.fit ?? (local ? 'cover' : 'contain'),
                    mirror: local && call.camera.state.direction === 'front', videoZOrder: local ? 1 : 0,
                    ParticipantLabel: null, ParticipantReaction: null, ParticipantNetworkQualityIndicator: null,
                    VideoRenderer: ScopedVideoRenderer,
                    ParticipantVideoFallback: () => null, style: { width: '100%', height: '100%' },
                  })));
              },
              };
            },
            // These public members are marked SDK-internal. Pin/compile this boundary:
            // disposing the call-owned peer locally need not await an SFU stop ACK.
            disposePublisher: publisherRetirement.dispose, disposeSubscriber: async () => { await call.subscriber?.dispose(); },
            join: async () => {
              if (encryptionFailed || (encryptionRequired && !encryption)) throw Error('connect_e2ee_unavailable');
              // Connect owns capture. The SDK's muted-talker detector can acquire
              // a separate microphone while muted, outside this owner's stream.
              if (encryptionRequired) await call.microphone.disableSpeakingWhileMutedNotification();
              await call.join({ create: false });
              if (encryptionRequired && (!call.state.e2eeEnabled || encryptionFailed)) throw Error('connect_e2ee_not_confirmed');
              if (encryptionRequired) {
                if (encryptionTransformsRetired || !encryptionCurrent()) throw Error('connect_e2ee_owner_retired');
                inputConfigured = true;
                configuringInput = configureMicrophoneInput(true);
                await configuringInput;
                if (encryptionTransformsRetired || !encryptionCurrent()) throw Error('connect_e2ee_owner_retired');
              }
            }, beginRetirement: () => { void leave().catch(() => undefined); }, leave,

          };
        },
      };
    },
    audio(platform, media = 'voice', cid): NativeAudioHandle {
      const manager = sdk.callManager;
      const routing = createNativeCallAudio({ platform, cid, port: () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return (require('@stream-io/react-native-callingx') as typeof import('@stream-io/react-native-callingx')).CallingxModule;
      }, sdk: { devices: () => manager.audioDevices.getStatus(), select: id => manager.audioDevices.select(id),
        observeDevices: listener => manager.audioDevices.addChangeListener(listener) } });
      // Establish the media-appropriate default at join instead of starting
      // video on earpiece and immediately requesting a different output.
      return { configure: () => manager.start({ audioRole: 'communicator', deviceEndpointType: media === 'video' ? 'speaker' : 'earpiece' }),
        clearConfiguration: () => manager.stop(),
        ...routing,
        observeInterruption: listener => platform === 'ios' ? manager.ios.addAudioInterruptionListener(e => listener(e.phase)) : () => undefined };
    },
  };
}
export const loadConnectNativeSdk = async (): Promise<NativeStreamSdk> => {
  // Keep Accept independent of Metro split loading without evaluating native
  // modules before this gated loader is called. The local module uses named RN
  // imports, avoiding enumeration of React Native's deprecated lazy exports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { checkConnectNativeRuntime } = require('./native-runtime-check') as typeof import('./native-runtime-check');
  checkConnectNativeRuntime();
  return adaptNativeStreamSdk(await loadStreamVideoSdk());
};
