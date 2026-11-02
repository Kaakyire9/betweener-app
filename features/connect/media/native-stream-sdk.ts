import { loadStreamVideoSdk, type StreamVideoSdkModule } from '../../live/media/load-stream-video-sdk.ts';
import type { NativeAudioHandle, NativeCallHandle, NativeStreamSdk } from './native-owner-types.ts';
import { retainNativeCaptureTracks } from './native-capture-tracks.ts';
import { createNativeMediaEngineOwner } from './native-media-engine-owner.ts';
import { audioSampleFromReport } from './audio-health.ts';
import { registerConnectRingingOwner } from './native-ringing-guard.ts';

/** Installed SDK boundary. No native module is evaluated until the gated loader runs. */
export function adaptNativeStreamSdk(sdk: Pick<StreamVideoSdkModule, 'StreamVideoClient' | 'callManager' | 'SfuModels' | 'getCallMediaEngineProvider' | 'setCallMediaEngineProvider' | 'StreamCallProvider' | 'StreamTheme' | 'ParticipantView' | 'hasVideo'>): NativeStreamSdk {
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
      return {
        disconnectUser: () => {
          if (disconnected) return Promise.resolve();
          if (disconnecting) return disconnecting;
          // SDK leave catches factory-disposal errors. Retain/retry our exact
          // engines and keep the exclusive lease until their disposal succeeds.
          disconnecting = (async () => {
            await engines.release();
            await client.disconnectUser();
            if (sdk.getCallMediaEngineProvider() !== engines.provider) throw new Error('connect_foreign_media_engine_provider');
            sdk.setCallMediaEngineProvider(previousEngineProvider); disconnected = true;
          })().finally(() => { disconnecting = null; });
          return disconnecting;
        },
        call(type, id): NativeCallHandle {
          const call = client.call(type, id);
          const captures = new WeakMap<object, ReturnType<typeof retainNativeCaptureTracks>>();
          const tracks = (stream: { getTracks(): import('./native-owner-types').NativeTrack[] } | undefined) => {
            if (!stream) return [];
            let owned = captures.get(stream);
            if (!owned) { owned = retainNativeCaptureTracks(stream); captures.set(stream, owned); }
            return owned;
          };
          return {
            id: call.id, cid: call.cid, type: call.type,
            state: () => ({ callingState: call.state.callingState, microphoneStatus: call.microphone.state.status ?? 'unknown',
              cameraStatus: call.camera.state.status ?? 'unknown',
              audioPublishing: call.publisher?.isPublishing(sdk.SfuModels.TrackType.AUDIO) ?? (call.state.callingState === 'left' ? false : null),
              videoPublishing: call.publisher?.isPublishing(sdk.SfuModels.TrackType.VIDEO) ?? (call.state.callingState === 'left' ? false : null),
              publisherPresent: !!call.publisher, subscriberPresent: !!call.subscriber }),
            tracks: () => ({ microphone: tracks(call.microphone.state.mediaStream), camera: tracks(call.camera.state.mediaStream),
              remote: call.state.remoteParticipants.flatMap(p => [p.audioStream, p.videoStream, p.screenShareStream, p.screenShareAudioStream].flatMap(s => s?.getTracks() ?? [])) }),
            observeState(listener) { const s = call.state.callingState$.subscribe(listener); return () => s.unsubscribe(); },
            observeMedia(listener) { const a = call.microphone.state.mediaStream$.subscribe(listener); const b = call.camera.state.mediaStream$.subscribe(listener);
              const c = call.state.remoteParticipants$.subscribe(listener);
              // Observing this SDK stream enables its local stats reporter. Raw
              // reports never leave this boundary or enter the product snapshot.
              const d = call.state.callStatsReport$?.subscribe(listener);
              const e = call.camera.state.status$.subscribe(listener);
              return () => { a.unsubscribe(); b.unsubscribe(); c.unsubscribe(); d?.unsubscribe(); e.unsubscribe(); }; },
            audioSample: () => audioSampleFromReport(call.state.callStatsReport),
            authorizeRingingJoin: current => registerConnectRingingOwner(call, current),
            enableMicrophone: () => call.microphone.enable(), disableMicrophone: () => call.microphone.disable(true), disableCamera: () => call.camera.disable(true),
            enableCamera: () => call.camera.enable(),
            flipCamera: async () => { await call.camera.flip(); return call.camera.state.direction; },
            cameraEnabled: () => call.camera.state.status === 'enabled' ? true : call.camera.state.status === 'disabled' ? false : null,
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
              render(sessionId, local) {
                const participant = call.state.participants.find(p => p.sessionId === sessionId && p.isLocalParticipant === local);
                if (!participant) return null;
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const React = require('react') as typeof import('react');
                // Pure SDK contexts only: StreamCall/StreamVideo mount native auto-resume,
                // push-registration and keep-alive effects that Connect does not authorise.
                return React.createElement(sdk.StreamCallProvider, { call },
                  React.createElement(sdk.StreamTheme, {}, React.createElement(sdk.ParticipantView, {
                    participant, trackType: 'videoTrack', objectFit: local ? 'cover' : 'contain',
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
            disposePublisher: async () => { await call.publisher?.dispose(); }, disposeSubscriber: async () => { await call.subscriber?.dispose(); },
            join: () => call.join({ create: false }), leave: async () => { if (call.state.callingState !== 'left') await call.leave({ reject: false }); },
          };
        },
      };
    },
    audio(platform): NativeAudioHandle {
      const manager = sdk.callManager;
      return { configure: () => manager.start({ audioRole: 'communicator', deviceEndpointType: 'earpiece' }),
        clearConfiguration: () => manager.stop(),
        devices: () => manager.audioDevices.getStatus(), select: id => manager.audioDevices.select(id),
        observeDevices: listener => manager.audioDevices.addChangeListener(listener),
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
