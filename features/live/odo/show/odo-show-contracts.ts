export const ODO_SHOW_STATES = [
  'opening',
  'host_focus',
  'host_plus_pool',
  'pool_focus',
  'pair_forming',
  'pair_active',
  'post_pair',
  'audience_pulse',
  'conversation_topic',
  'odo_stage',
  'music_intermission',
  'low_liquidity',
  'draining',
  'closing',
  'paused_by_host',
  'paused_by_policy',
  'recovering',
] as const;

export type OdoShowStateName = (typeof ODO_SHOW_STATES)[number];

export const ODO_SHOW_SCENES = [
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
] as const;

export type OdoShowScene = (typeof ODO_SHOW_SCENES)[number];

export const ODO_SHOW_ENERGY_MODES = [
  'calm', 'social', 'energize', 'reflective', 'closing',
] as const;
export type OdoShowEnergyMode = (typeof ODO_SHOW_ENERGY_MODES)[number];

export const ODO_PROGRAM_SOURCES = ['mobile', 'studio'] as const;
export type OdoProgramSource = (typeof ODO_PROGRAM_SOURCES)[number];

export const ODO_CONTROL_SOURCES = ['odo', 'mobile_host', 'studio_host'] as const;
export type OdoControlSource = (typeof ODO_CONTROL_SOURCES)[number];

export const LIVE_MUSIC_MOODS = [
  'chill',
  'afrobeats_light',
  'soul',
  'warm',
  'upbeat',
  'reflective',
  'instrumental',
  'closing',
] as const;
export type LiveMusicMood = (typeof LIVE_MUSIC_MOODS)[number];

export const LIVE_MUSIC_ACTIONS = [
  'play_track',
  'play_playlist',
  'pause',
  'resume',
  'next',
  'fade_in',
  'fade_out',
  'set_volume',
  'set_mood',
  'duck',
  'unduck',
  'stop',
] as const;
export type LiveMusicAction = (typeof LIVE_MUSIC_ACTIONS)[number];

export type OdoShowMetrics = {
  participants: number;
  audience: number;
  waitingPeople: number;
  activePairs: number;
  completedRounds: number;
};

export type LiveMusicProgramState = {
  enabled: boolean;
  status: 'stopped' | 'playing' | 'paused' | 'ducked' | 'fading';
  trackId: string | null;
  playlistId: string | null;
  title: string | null;
  artist: string | null;
  mood: LiveMusicMood | null;
  volume: number;
  programStartedAt: string | null;
  playbackOffsetSeconds: number;
  stateVersion: number;
  playbackAvailable: boolean;
};

export type OdoShowDirectorState = {
  schemaVersion: 1;
  available: boolean;
  sessionId: string;
  enabled: boolean;
  showState: OdoShowStateName;
  currentScene: OdoShowScene;
  energyMode: OdoShowEnergyMode;
  programSource: OdoProgramSource;
  controlSource: OdoControlSource;
  pausedByHost: boolean;
  stateVersion: number;
  leaseGeneration: number;
  sceneEnteredAt: string | null;
  hostSuppressionEndsAt: string | null;
  nextWakeAt: string | null;
  lastReasonCode: string | null;
  unavailableReasonCode: string | null;
  metrics: OdoShowMetrics;
  music: LiveMusicProgramState;
};

export type OdoLiveProgramState = Pick<
  OdoShowDirectorState,
  'schemaVersion' | 'sessionId' | 'enabled' | 'showState' | 'currentScene'
  | 'energyMode' | 'programSource' | 'stateVersion' | 'nextWakeAt' | 'music'
>;

export type LiveMusicPlaybackGrant = {
  trackId: string;
  uri: string;
  expiresAt: string;
  programStartedAt: string;
  playbackOffsetSeconds: number;
  volume: number;
  stateVersion: number;
};

export const BETWEENER_STUDIO_COMMANDS = [
  'TAKE_CONTROL',
  'RESUME_ODO',
  'SET_SCENE',
  'SET_QUICK_CONNECT_LAYOUT',
  'PLAY_MUSIC',
  'PAUSE_MUSIC',
  'NEXT_TRACK',
  'SET_MUSIC_MOOD',
  'SET_MUSIC_VOLUME',
  'ENABLE_AUTO_DUCK',
  'DISABLE_AUTO_DUCK',
  'OPEN_AUDIENCE_PULSE',
  'START_INTERMISSION',
  'FINISH_CURRENT_CONNECTIONS',
] as const;

export type BetweenerStudioCommandName = (typeof BETWEENER_STUDIO_COMMANDS)[number];

type StudioCommandBase<T extends BetweenerStudioCommandName> = {
  schemaVersion: 1;
  commandId: string;
  sessionId: string;
  expectedStateVersion: number;
  type: T;
};

/**
 * Shared future Studio wire contract. Every branch maps to an existing or
 * capability-gated server operation; there is no arbitrary command payload.
 */
export type BetweenerStudioCommand =
  | StudioCommandBase<'TAKE_CONTROL' | 'RESUME_ODO' | 'PAUSE_MUSIC'
    | 'NEXT_TRACK' | 'ENABLE_AUTO_DUCK' | 'DISABLE_AUTO_DUCK'
    | 'OPEN_AUDIENCE_PULSE' | 'START_INTERMISSION'
    | 'FINISH_CURRENT_CONNECTIONS'>
  | (StudioCommandBase<'SET_SCENE'> & { scene: OdoShowScene })
  | (StudioCommandBase<'SET_QUICK_CONNECT_LAYOUT'> & {
      layout: 'vertical' | 'horizontal';
    })
  | (StudioCommandBase<'PLAY_MUSIC'> & {
      trackId: string | null;
      playlistId: string | null;
    })
  | (StudioCommandBase<'SET_MUSIC_MOOD'> & { mood: LiveMusicMood })
  | (StudioCommandBase<'SET_MUSIC_VOLUME'> & { volume: number });

export type OdoShowDecisionInput = {
  sessionLive: boolean;
  circuitBreakerOpen: boolean;
  pausedByHost: boolean;
  quickConnectState: 'absent' | 'open' | 'active' | 'draining' | 'ended';
  activePairs: number;
  eligiblePairs: number;
  completedRounds: number;
  participantCount: number;
  audienceCount: number;
  currentScene: OdoShowScene;
  currentPriority: number;
  sceneDwellElapsed: boolean;
  hostSuppressionActive: boolean;
  intermissionDue: boolean;
};

export type OdoShowDecision = {
  showState: OdoShowStateName;
  scene: OdoShowScene;
  energyMode: OdoShowEnergyMode;
  priority: number;
  reasonCode: string;
};

export const ODO_SHOW_PRIORITIES = {
  safety: 100,
  host: 95,
  lifecycle: 90,
  consent: 85,
  pairConnecting: 80,
  activePair: 75,
  mutualOutcome: 70,
  draining: 60,
  audiencePulse: 50,
  conversationTopic: 45,
  conversationSpark: 40,
  intermission: 30,
  narration: 20,
  ambient: 10,
} as const;
