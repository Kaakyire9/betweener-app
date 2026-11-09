import type { MicrophonePermission, VoiceRoute } from '../voice/voice-types.ts';
import type { AudioSample } from './audio-health.ts';
import type { VideoPresentation } from '../video/video-types.ts';
import type { ConnectMedia } from '../domain/connect.ts';
export interface NativeAuthSnapshot { userId: string; generation: string; authenticated: true }
export interface NativeAuthOwner {
  snapshot(): NativeAuthSnapshot | null;
  subscribe(listener: () => void): () => void;
}
export interface NativeLifecycle {
  platform: 'ios' | 'android';
  appState(): string;
  subscribeAppState(listener: (state: string) => void): () => void;
}
export interface NativeTrack { enabled: boolean; readyState: string; stop(): void; release?(): void }
export interface NativeTrackSet { microphone: NativeTrack[]; camera: NativeTrack[]; remote: NativeTrack[] }
export type NativeDisconnectCause = 'local' | 'remote' | 'rejected' | 'busy' | 'answeredElsewhere' | 'missed' | 'error' | 'unknown';
export type NativeCallActivationStatus = 'not_started' | 'pending' | 'confirmed' | 'foreground_only' | 'not_applicable' | 'failed' | 'cancelled';
export type NativeCallActivationFailure = 'invalid_call' | 'native_api_failed' | 'registration_missing' | 'registration_lost'
  | 'event_subscription_failed' | 'activation_request_failed' | 'active_event_timeout' | 'ack_timeout' | 'owner_retired';
export interface NativeSystemAction { kind: 'end' | 'mute' | 'hold'; muted?: boolean; cause?: NativeDisconnectCause }
export interface NativeSdkCallState {
  transportFailure?: import('./native-reconnect-diagnostics').NativeTransportFailure;
  failure?: { code: 'e2ee.encryption_failed' | 'e2ee.decryption_stalled' | 'e2ee.missing_key' | 'e2ee.unencrypted_frame' | 'e2ee.unsupported_version';
    trackType: 'AUDIO' | 'VIDEO' | 'SCREEN_SHARE' | 'SCREEN_SHARE_AUDIO' | 'unknown'; party: 'local' | 'remote' | 'unknown' };
  callingState: string; microphoneStatus: string; cameraStatus: string;
  audioPublishing: boolean | null; videoPublishing: boolean | null; publisherPresent: boolean | null; subscriberPresent: boolean | null;
}
export interface NativeCallHandle {
  prepareEncryption?(admission: import('../voice/voice-types.ts').VoiceCredentials, agent: import('../experimental/call-encryption.ts').CallKeyAgent | undefined, current: () => boolean, authEpoch: string): Promise<void>;
  encryptionStatus?(): { mode: 'disabled' | 'required'; sdkConfirmed: boolean; safetyCode?: string };
  id: string; cid: string; type: string;
  state(): NativeSdkCallState;
  tracks(): NativeTrackSet;
  observeState(listener: (state: string) => void): () => void;
  observeMedia(listener: () => void): () => void;
  audioSample?(): AudioSample | null;
  setBackgroundAudio?(enabled: boolean, current: () => boolean): Promise<boolean>;
  backgroundAudioActive?(): boolean;
  syncSystemMuted?(muted: boolean): Promise<void>;
  activateSystemCall?(current: () => boolean, foreground?: () => boolean): Promise<void>;
  systemCallActivation?(): NativeCallActivationStatus;
  systemCallActivationFailure?(): NativeCallActivationFailure | null;
  observeSystemActions?(listener: (event: NativeSystemAction) => void): () => void;
  authorizeRingingJoin?(current: () => boolean): () => void;
  enableMicrophone(): Promise<void>;
  muteMicrophone?(): Promise<void>;
  enforceMicrophoneMute?(): void;
  disableMicrophone(): Promise<void>;
  disableCamera(): Promise<void>;
  enableCamera?(): Promise<void>;
  flipCamera?(): Promise<'front' | 'back'>;
  cameraEnabled?(): boolean | null;
  setCameraQuality?(quality: 'standard' | 'data_saver'): Promise<void>;
  videoPresentation?(current: () => boolean): VideoPresentation;
  beginRetirement?(): void;
  disposePublisher(): Promise<void>;
  disposeSubscriber(): Promise<void>;
  join(): Promise<unknown>;
  leave(): Promise<unknown>;
}
export interface NativeAudioDevice { id: string; type: string }
export interface NativeAudioState { devices: NativeAudioDevice[]; selectedDeviceId?: string; currentEndpointType?: string }
export interface NativeAudioHandle {
  configure(): void; clearConfiguration(): void;
  devices(): Promise<NativeAudioState>; select(id: string): void | Promise<void>;
  observeDevices(listener: (state: NativeAudioState) => void): () => void;
  observeInterruption(listener: (phase: string) => void): () => void;
}
export interface NativeSdkClient { call(type: string, id: string): NativeCallHandle; disconnectUser(): Promise<void> }
export interface NativeStreamSdk {
  createClient(input: { apiKey: string; userId: string; tokenProvider: () => Promise<string>; onConnectionFailure(): void }): NativeSdkClient;
  audio(platform: NativeLifecycle['platform'], media?: ConnectMedia, cid?: string): NativeAudioHandle;
}
export type NativeOperation = 'not_started' | 'pending' | 'completed' | 'failed';
export type NativeRetirement = 'local_end' | 'background' | 'interruption' | 'account_changed' | 'navigation' | 'permission_denied' | 'connection_failed' | 'encryption_failed' | 'stale_generation';
export interface NativeOwnerSnapshot {
  appState?: 'active' | 'inactive' | 'background' | 'unknown';
  systemCallActivation?: NativeCallActivationStatus;
  systemCallActivationFailure?: NativeCallActivationFailure | null;
  systemInterruption?: { kind: 'end' | 'hold' | 'audio_session'; cause: NativeDisconnectCause };
  generation: number; cid: string; retired: boolean; reason: NativeRetirement | null;
  evidenceSource: 'sdk_reported'; physicalDeviceShutdown: 'not_verified';
  inspection: 'complete' | 'failed';
  sdk: NativeSdkCallState;
  audioRoute?: { requested: VoiceRoute | null; status: 'idle' | 'checking' | 'confirmed' | 'unconfirmed' | 'failed' | 'cancelled';
    available: VoiceRoute[]; selected: VoiceRoute | null; output: VoiceRoute | null };
  tracks: { microphone: { observed: number; live: number }; camera: { observed: number; live: number }; remote: { observed: number; live: number } };
  releaseFailure?: 'tracks_live' | 'capture_release' | 'sdk_leave' | 'peers_present' | 'observers' | 'audio_configuration' | 'client_release' | 'unknown';
  operations: { microphone: NativeOperation; camera: NativeOperation; publisher: NativeOperation; subscriber: NativeOperation;
    microphoneTrackRelease: NativeOperation; cameraTrackRelease: NativeOperation;
    playoutMute: NativeOperation; leave: NativeOperation; release: NativeOperation; audioConfiguration: NativeOperation };
}
export interface NativeOwnerAccess {
  nativeAnswerAllowed?(cid: string): boolean;
  nativeAnswerReady?(cid: string): void;
  auth: NativeAuthOwner; lifecycle: NativeLifecycle; permission(): Promise<MicrophonePermission>;
  checkPermission?(): Promise<MicrophonePermission>;
  cameraPermission?(): Promise<MicrophonePermission>;
}
