import type { MicrophonePermission } from '../voice/voice-types.ts';
import type { AudioSample } from './audio-health.ts';
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
export interface NativeSdkCallState {
  callingState: string; microphoneStatus: string; cameraStatus: string;
  audioPublishing: boolean | null; videoPublishing: boolean | null; publisherPresent: boolean | null; subscriberPresent: boolean | null;
}
export interface NativeCallHandle {
  id: string; cid: string; type: string;
  state(): NativeSdkCallState;
  tracks(): NativeTrackSet;
  observeState(listener: (state: string) => void): () => void;
  observeMedia(listener: () => void): () => void;
  audioSample?(): AudioSample | null;
  authorizeRingingJoin?(current: () => boolean): () => void;
  enableMicrophone(): Promise<void>;
  disableMicrophone(): Promise<void>;
  disableCamera(): Promise<void>;
  disposePublisher(): Promise<void>;
  disposeSubscriber(): Promise<void>;
  join(): Promise<unknown>;
  leave(): Promise<unknown>;
}
export interface NativeAudioDevice { id: string; type: string }
export interface NativeAudioState { devices: NativeAudioDevice[]; selectedDeviceId?: string; currentEndpointType?: string }
export interface NativeAudioHandle {
  configure(): void; clearConfiguration(): void;
  devices(): Promise<NativeAudioState>; select(id: string): void;
  observeDevices(listener: (state: NativeAudioState) => void): () => void;
  observeInterruption(listener: (phase: string) => void): () => void;
}
export interface NativeSdkClient { call(type: string, id: string): NativeCallHandle; disconnectUser(): Promise<void> }
export interface NativeStreamSdk {
  createClient(input: { apiKey: string; userId: string; tokenProvider: () => Promise<string>; onConnectionFailure(): void }): NativeSdkClient;
  audio(platform: NativeLifecycle['platform']): NativeAudioHandle;
}
export type NativeOperation = 'not_started' | 'pending' | 'completed' | 'failed';
export type NativeRetirement = 'local_end' | 'background' | 'interruption' | 'account_changed' | 'navigation' | 'permission_denied' | 'connection_failed' | 'stale_generation';
export interface NativeOwnerSnapshot {
  generation: number; cid: string; retired: boolean; reason: NativeRetirement | null;
  evidenceSource: 'sdk_reported'; physicalDeviceShutdown: 'not_verified';
  inspection: 'complete' | 'failed';
  sdk: NativeSdkCallState;
  tracks: { microphone: { observed: number; live: number }; camera: { observed: number; live: number }; remote: { observed: number; live: number } };
  operations: { microphone: NativeOperation; camera: NativeOperation; publisher: NativeOperation; subscriber: NativeOperation;
    microphoneTrackRelease: NativeOperation; cameraTrackRelease: NativeOperation;
    playoutMute: NativeOperation; leave: NativeOperation; release: NativeOperation; audioConfiguration: NativeOperation };
}
export interface NativeOwnerAccess {
  auth: NativeAuthOwner; lifecycle: NativeLifecycle; permission(): Promise<MicrophonePermission>;
}
