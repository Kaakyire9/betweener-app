import type { ConnectAuthorization, ConnectSession } from '../domain/connect.ts';
import type { EndBlockContext, EndBlockReceipt, EndBlockView } from '../domain/end-block.ts';
import type { LocalShutdownResult } from '../media/local-shutdown.ts';
import type { AudioSetupFailure, AudioSetupStage } from './audio-setup.ts';
import type { AudioHealth, AudioSample } from '../media/audio-health.ts';
import type { CallQuality } from './call-quality.ts';
export type MicrophonePermission = 'granted' | 'denied' | 'blocked';
export type VoiceRoute = 'earpiece' | 'speaker' | 'bluetooth' | 'wired';
export type VoiceTransportState = 'idle' | 'connecting' | 'joined' | 'reconnecting' | 'left' | 'failed';
export interface VoiceCredentials {
  apiKey: string; token: string; expiresAt: string; media: 'voice'; user: { id: string };
  call: { type: 'betweener_connect'; id: string; cid: string };
}
export interface VoiceApi {
  prepareEndBlock?(call: ConnectSession, peer: string): Promise<EndBlockContext>;
  endCallAndBlock?(context: EndBlockContext, key: string): Promise<EndBlockReceipt>;
  getEndBlockStatus?(context: EndBlockContext): Promise<EndBlockReceipt | null>;
  createCall(peer: string, media: 'voice', authorization: ConnectAuthorization, key: string, device: string, grant: string | null): Promise<ConnectSession>;
  act(id: string, action: 'accept' | 'decline' | 'cancel' | 'end', version: number, device: string): Promise<ConnectSession>;
  getCall(id: string): Promise<ConnectSession>;
  getHistory(before: null, limit: number): Promise<ConnectSession[]>;
  credentials(id: string, device: string): Promise<VoiceCredentials>;
}
export interface VoiceTransport {
  join(admission: VoiceCredentials, refresh: () => Promise<VoiceCredentials>, listener: (state: VoiceTransportState) => void): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  routes(): readonly VoiceRoute[];
  selectRoute(route: VoiceRoute): Promise<void>;
  audioSample?(): AudioSample | null;
  leave(): Promise<LocalShutdownResult | void>;
}
export interface VoicePeer { profileId: string; name: string; avatar: string | null }
export type VoicePhase = 'IDLE' | 'REQUESTED' | 'RINGING' | 'CONNECTING' | 'ACTIVE' | 'RECONNECTING' | 'ENDING' | 'ENDED' | 'FAILED';
export interface VoiceViewState {
  audioHealth?: AudioHealth;
  quality?: CallQuality;
  interruption?: 'background' | 'interruption' | 'connection_failed' | 'navigation' | 'permission_denied' | 'stale_generation';
  audioSetupStage?: AudioSetupStage | 'ready';
  audioSetupFailure?: AudioSetupFailure;
  authorityStatus?: 'current' | 'unavailable';
  endStatus?: 'pending' | 'terminal' | 'unconfirmed';
  localShutdown: LocalShutdownResult; endBlock: EndBlockView | null;
  phase: VoicePhase; session: ConnectSession | null; peer: VoicePeer | null; incoming: boolean;
  muted: boolean; route: VoiceRoute; routes: readonly VoiceRoute[]; permission: MicrophonePermission | null;
  error: string | null; busy: boolean; durationSeconds: number | null; foreground: boolean;
}
