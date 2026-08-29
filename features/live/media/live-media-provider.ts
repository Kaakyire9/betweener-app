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

export type LiveMediaJoinMode = 'backstage' | 'audience' | 'private_spark' | 'quick_connect';

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

export type LiveMediaAdmissionRequester = (
  request: LiveMediaAdmissionRequest,
) => Promise<LiveMediaAdmission>;

export type LiveMediaSessionOptions = {
  mode: LiveMediaJoinMode;
  audioEnabled: boolean;
  videoEnabled: boolean;
};

export type LiveMediaDeviceKind = 'microphone' | 'camera';

export type LiveMediaDeviceIssue = {
  device: LiveMediaDeviceKind;
  code: string;
};

/**
 * Transport admission and local device publication are deliberately reported
 * separately. A camera handoff failure must not eject an otherwise admitted
 * participant from the room.
 */
export type LiveMediaJoinResult = {
  audioEnabled: boolean;
  videoEnabled: boolean;
  deviceIssues: readonly LiveMediaDeviceIssue[];
};

export type LiveMediaTokenProvider = () => Promise<LiveMediaAdmission>;

export type LiveMediaProviderState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'joining'
  | 'joined'
  | 'leaving'
  | 'failed'
  | 'disposed';

export type LiveMediaTransportState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export type LiveMediaTransportListener = (state: LiveMediaTransportState) => void;

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

  /** Discards stale native transport state before a fresh admission/rejoin. */
  resetConnection(): Promise<void>;

  /** Reconciles a fresh server-signed authority grant without leaving the call. */
  reconcileAdmission(admission: LiveMediaAdmission): Promise<void>;

  joinSession(options: LiveMediaSessionOptions): Promise<LiveMediaJoinResult>;
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
  getTransportState(): LiveMediaTransportState;
  subscribeTransportState(listener: LiveMediaTransportListener): () => void;
  dispose(): Promise<void>;
}
