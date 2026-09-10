export const PROGRAM_CONTROLLER_SOURCES = [
  'odo',
  'mobile_host',
  'studio_host',
  'system',
] as const;
export type ProgramControllerSource = (typeof PROGRAM_CONTROLLER_SOURCES)[number];

export const PROGRAM_SCENES = [
  'host_focus',
  'host_plus_pool',
  'pool_focus',
  'pair_forming',
  'quick_connect_active',
  'audience_pulse',
  'conversation_topic',
  'odo_stage',
  'music_intermission',
  'branded_intermission',
  'session_closing',
  'screen_full',
  'screen_plus_host',
  'screen_plus_pair',
  'screen_plus_panel',
  'screen_discussion',
  'screen_plus_pool',
  'screen_plus_audience_pulse',
  'screen_plus_odo',
  'dj_plus_pool',
] as const;
export type ProgramScene = (typeof PROGRAM_SCENES)[number];

export const PROGRAM_SOURCE_TYPES = [
  'host_camera',
  'participant_camera',
  'active_pair',
  'quick_connect_pool',
  'odo_stage',
  'audience_pulse',
  'branded_visual',
  'screen_share',
  'screen_share_audio',
  'host_microphone',
  'dj_audio',
  'programme_music',
] as const;
export type ProgramSourceType = (typeof PROGRAM_SOURCE_TYPES)[number];

export const PROGRAM_SOURCE_ROLES = [
  'visual',
  'host_audio',
  'screen_audio',
  'atmosphere_audio',
] as const;
export type ProgramSourceRole = (typeof PROGRAM_SOURCE_ROLES)[number];

export const PROGRAM_SOURCE_READINESS = [
  'unavailable',
  'permission_required',
  'preparing',
  'ready',
  'live',
  'ended',
  'failed',
] as const;
export type ProgramSourceReadiness = (typeof PROGRAM_SOURCE_READINESS)[number];

export const PROGRAM_SOURCE_HEALTH = [
  'unknown',
  'healthy',
  'degraded',
  'lost',
] as const;
export type ProgramSourceHealth = (typeof PROGRAM_SOURCE_HEALTH)[number];

export const PROGRAM_TARGET_CANVASES = [
  'portrait_9_16',
  'landscape_16_9',
  'square_1_1',
] as const;
export type ProgramTargetCanvas = (typeof PROGRAM_TARGET_CANVASES)[number];

export const PROGRAM_TRANSITIONS = ['cut', 'auto', 'fade'] as const;
export type ProgramTransition = (typeof PROGRAM_TRANSITIONS)[number];

export const PROGRAM_SOURCE_SLOTS = [
  'primary',
  'host',
  'guest_1',
  'guest_2',
  'guest_3',
  'pair',
  'pool',
  'pulse',
  'odo',
  'pip',
  'audio_host',
  'audio_screen',
  'audio_atmosphere',
] as const;
export type ProgramSourceSlot = (typeof PROGRAM_SOURCE_SLOTS)[number];
export type ProgramSourceAssignments = Partial<Record<ProgramSourceSlot, string>>;

export type ProgramSource = {
  id: string;
  key: string;
  type: ProgramSourceType;
  role: ProgramSourceRole;
  ownerUserId: string | null;
  providerUserId: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
  readiness: ProgramSourceReadiness;
  health: ProgramSourceHealth;
  muted: boolean;
  failureReasonCode: string | null;
  generation: number;
  version: number;
  lastSeenAt: string | null;
};

export type ProgramController = {
  source: ProgramControllerSource;
  userId: string | null;
  instanceId: string | null;
  generation: number;
  leaseExpiresAt: string | null;
};

export type ProgramState = {
  schemaVersion: 1;
  sessionId: string;
  scene: ProgramScene;
  targetCanvas: ProgramTargetCanvas;
  sourceAssignments: ProgramSourceAssignments;
  transition: ProgramTransition;
  fallbackScene: ProgramScene;
  programVersion: number;
  showStateVersion: number;
  controller: ProgramController;
  updatedAt: string;
};

export type ProgramPreviewState = {
  scene: ProgramScene;
  targetCanvas: ProgramTargetCanvas;
  sourceAssignments: ProgramSourceAssignments;
  transition: ProgramTransition;
  baseProgramVersion: number;
  baseControllerGeneration: number;
  dirty: boolean;
};

export type StudioTakeCommand = {
  schemaVersion: 1;
  commandId: string;
  sessionId: string;
  controllerInstanceId: string;
  expectedControllerGeneration: number;
  expectedProgramVersion: number;
  scene: ProgramScene;
  targetCanvas: ProgramTargetCanvas;
  sourceAssignments: ProgramSourceAssignments;
  transition: ProgramTransition;
};

export type ProgramRegion = {
  slot: ProgramSourceSlot;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  treatment: 'full' | 'panel' | 'pip' | 'strip' | 'audio';
};

export type ProgramLayout = {
  scene: ProgramScene;
  canvas: ProgramTargetCanvas;
  regions: readonly ProgramRegion[];
};

export type StudioSessionSummary = {
  id: string;
  title: string;
  status: string;
  ownershipType: 'human' | 'system';
  systemSessionKind: string | null;
  scheduledStart: string | null;
  startedAt: string | null;
  participantCount: number;
  controllerSource: ProgramControllerSource;
  controllerLeaseExpiresAt: string | null;
  programScene: ProgramScene;
  programVersion: number;
  health: 'healthy' | 'degraded' | 'unavailable';
};

export type StudioOperationalSnapshot = {
  schemaVersion: 1;
  serverNow: string;
  access: {
    canView: boolean;
    canControl: boolean;
    canPublish: boolean;
    canScreenShare: boolean;
    canUseExternalAudio: boolean;
    canModerate: boolean;
  };
  session: {
    id: string;
    title: string;
    status: string;
    version: number;
    ownershipType: 'human' | 'system';
    systemSessionKind: string | null;
  };
  program: ProgramState;
  sources: readonly ProgramSource[];
  show: {
    enabled: boolean;
    state: string;
    energyMode: string;
    nextWakeAt: string | null;
    reasonCode: string | null;
  };
  quickConnect: {
    state: string;
    poolCount: number;
    eligiblePairCount: number;
    activePairCount: number;
    completedRoundCount: number;
    reconnectingCount: number;
  };
  odo: {
    state: string;
    nextWakeAt: string | null;
    healthy: boolean;
  };
  music: {
    enabled: boolean;
    status: string;
    trackId: string | null;
    playlistId: string | null;
    mood: string | null;
    volume: number;
    stateVersion: number;
  };
  audiencePulse: { open: boolean };
  safety: { status: 'healthy' | 'degraded'; activeHoldCount: number };
};
