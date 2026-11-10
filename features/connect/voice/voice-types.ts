import type { ConnectAuthorization, ConnectSession, ConnectMedia } from '../domain/connect.ts';
import type { VideoControlState, VideoPresentation } from '../video/video-types.ts';
import type { EndBlockContext, EndBlockReceipt, EndBlockView } from '../domain/end-block.ts';
import type { LocalShutdownResult } from '../media/local-shutdown.ts';
import type { AudioSetupFailure, AudioSetupStage } from './audio-setup.ts';
import type { AudioHealth, AudioSample } from '../media/audio-health.ts';
import type { CallQuality } from './call-quality.ts';
export type MicrophonePermission = 'granted' | 'denied' | 'blocked';
export type VoiceRoute = 'earpiece' | 'speaker' | 'bluetooth' | 'wired';
export interface VoiceRouteSelection { waitForAvailability?: boolean; preserveAccessory?: boolean }
export interface VoiceAudioRouteState { route: VoiceRoute | null; routes: readonly VoiceRoute[] }
export type VoiceTransportState = 'idle' | 'connecting' | 'joined' | 'reconnecting' | 'left' | 'failed';
export interface VoiceCredentials {
  encryption?: { mode: 'required' | 'disabled'; generation: string; participants: readonly string[] };
  apiKey: string; token: string; expiresAt: string; media: ConnectMedia; user: { id: string };
  call: { type: 'betweener_connect'; id: string; cid: string };
}
export interface VoiceApi {
  prepareEndBlock?(call: ConnectSession, peer: string): Promise<EndBlockContext>;
  endCallAndBlock?(context: EndBlockContext, key: string): Promise<EndBlockReceipt>;
  getEndBlockStatus?(context: EndBlockContext): Promise<EndBlockReceipt | null>;
  createCall(peer: string, media: ConnectMedia, authorization: ConnectAuthorization, key: string, device: string, grant: string | null): Promise<ConnectSession>;
  act(id: string, action: 'accept' | 'decline' | 'cancel' | 'end', version: number, device: string): Promise<ConnectSession>;
  getCall(id: string): Promise<ConnectSession>;
  getHistory(before: null, limit: number): Promise<ConnectSession[]>;
  credentials(id: string, device: string): Promise<VoiceCredentials>;
}
export interface VoiceTransport {
  encryptionStatus?(): { mode: 'disabled' | 'required'; sdkConfirmed: boolean; safetyCode?: string };
  join(admission: VoiceCredentials, refresh: () => Promise<VoiceCredentials>, listener: (state: VoiceTransportState) => void): Promise<void>;
  recover?(admission: VoiceCredentials, refresh: () => Promise<VoiceCredentials>, listener: (state: VoiceTransportState) => void): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  routes(): readonly VoiceRoute[];
  selectRoute(route: VoiceRoute, options?: VoiceRouteSelection): Promise<void>;
  audioRoute?(): VoiceAudioRouteState | undefined;
  observeAudioRoute?(listener: (state: VoiceAudioRouteState) => void): () => void;
  audioSample?(): AudioSample | null;
  observeAudioSamples?(listener: (sample: AudioSample | null) => void): () => void;
  setBackgroundAudio?(enabled: boolean): Promise<boolean>;
  setCameraQuality?(quality: 'standard' | 'data_saver'): Promise<void>;
  setCameraEnabled?(enabled: boolean): Promise<void>;
  flipCamera?(): Promise<'front' | 'back'>;
  videoPresentation?(): VideoPresentation | null;
  leave(): Promise<LocalShutdownResult | void>;
}
export interface VoicePeer { profileId: string; name: string; avatar: string | null; photos?: readonly string[] }
export type VoicePhase = 'IDLE' | 'REQUESTED' | 'RINGING' | 'CONNECTING' | 'ACTIVE' | 'RECONNECTING' | 'ENDING' | 'ENDED' | 'FAILED';
export interface VoiceViewState {
  requestedMedia?: ConnectMedia;
  encryption?: { required: boolean; sdkConfirmed: boolean; safetyCode?: string; identityVerified: boolean };
  backgroundAudio?: 'off' | 'starting' | 'enabled' | 'unavailable';
  minimized?: boolean;
  video?: VideoControlState;
  audioHealth?: AudioHealth;
  quality?: CallQuality;
  interruption?: 'background' | 'interruption' | 'connection_failed' | 'encryption_failed' | 'navigation' | 'permission_denied' | 'stale_generation';
  audioSetupStage?: AudioSetupStage | 'ready';
  audioSetupFailure?: AudioSetupFailure;
  muteControl?: { request: number; source: 'app' | 'system'; requestedMuted: boolean; status: 'pending' | 'confirmed' | 'failed' };
  authorityStatus?: 'current' | 'unavailable';
  endStatus?: 'pending' | 'terminal' | 'unconfirmed';
  localShutdown: LocalShutdownResult; endBlock: EndBlockView | null;
  phase: VoicePhase; session: ConnectSession | null; peer: VoicePeer | null; incoming: boolean;
  muted: boolean; route: VoiceRoute | null; routes: readonly VoiceRoute[]; permission: MicrophonePermission | null;
  error: string | null; busy: boolean; durationSeconds: number | null; foreground: boolean;
}
