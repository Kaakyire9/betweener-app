import type {
  LiveParticipantRole,
  LiveParticipantState,
  LiveSessionStatus,
} from '../domain/live-types.ts';
import type { LiveCapability } from '../domain/live-capabilities.ts';

export const LIVE_CONNECTION_QUALITIES = [
  'unknown',
  'excellent',
  'good',
  'poor',
  'offline',
] as const;

export type LiveConnectionQuality = (typeof LIVE_CONNECTION_QUALITIES)[number];

export type LiveMediaJoinMode = 'backstage' | 'audience';

export type LiveMediaUser = {
  id: string;
};

export type LiveMediaCallIdentity = {
  provider: 'stream';
  type: string;
  id: string;
  cid: string;
};

export type LiveMediaAdmission = {
  apiKey: string;
  token: string;
  expiresAt: string;
  sessionId: string;
  user: LiveMediaUser;
  call: LiveMediaCallIdentity;
  primaryRole: LiveParticipantRole;
  roles: readonly LiveParticipantRole[];
  capabilities: readonly LiveCapability[];
  participantState: LiveParticipantState;
  sessionStatus: LiveSessionStatus;
};

export type LiveMediaAdmissionRequest = {
  sessionId: string;
};

export type LiveMediaSessionOptions = {
  mode: LiveMediaJoinMode;
  audioEnabled: boolean;
  videoEnabled: boolean;
};

export type LiveMediaTokenProvider = () => Promise<LiveMediaAdmission>;

export type LiveMediaProviderState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'previewing'
  | 'joining'
  | 'joined'
  | 'leaving'
  | 'failed'
  | 'disposed';

/**
 * Provider-neutral media transport contract. Supabase remains authoritative
 * for Live business state, roles and capabilities.
 */
export interface LiveMediaProvider {
  readonly state: LiveMediaProviderState;

  initialize(
    admission: LiveMediaAdmission,
    tokenProvider: LiveMediaTokenProvider,
  ): Promise<void>;

  /** Starts a device-only preview without joining or publishing to the RTC call. */
  preparePreview(options: LiveMediaSessionOptions): Promise<void>;
  joinSession(options: LiveMediaSessionOptions): Promise<void>;
  leaveSession(): Promise<void>;

  setAudioEnabled(enabled: boolean): Promise<void>;
  setVideoEnabled(enabled: boolean): Promise<void>;

  /** Requests promotion through the Betweener authority layer, never Stream directly. */
  requestPublishPermission(): Promise<void>;
  /** Immediately stops local publication; durable revocation remains server-owned. */
  revokePublishPermission(): Promise<void>;
  /** Terminates through the Betweener authority layer, never Stream directly. */
  terminateCall(): Promise<void>;

  getConnectionQuality(): LiveConnectionQuality;
  dispose(): Promise<void>;
}
