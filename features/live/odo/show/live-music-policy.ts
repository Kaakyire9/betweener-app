import type { LiveMusicAction, OdoShowStateName } from './odo-show-contracts.ts';

export type LiveMusicPolicyInput = {
  action: LiveMusicAction;
  showState: OdoShowStateName;
  privateExperienceActive: boolean;
  isPublisher: boolean;
  musicEnabled: boolean;
  circuitBreakerOpen: boolean;
  duckingEnabled: boolean;
  licensedForRegion: boolean;
  catalogueEnabled: boolean;
};

export type LiveMusicPolicyDecision = {
  allowed: boolean;
  reasonCode: string;
  effectiveVolume: number;
};

export const evaluateLiveMusicPolicy = (
  input: LiveMusicPolicyInput,
): LiveMusicPolicyDecision => {
  if (!input.musicEnabled) {
    return { allowed: false, reasonCode: 'music_disabled', effectiveVolume: 0 };
  }
  if (input.circuitBreakerOpen) {
    return { allowed: false, reasonCode: 'circuit_breaker_open', effectiveVolume: 0 };
  }
  if (input.privateExperienceActive) {
    return { allowed: false, reasonCode: 'private_experience_music_forbidden', effectiveVolume: 0 };
  }
  if (input.isPublisher) {
    return { allowed: false, reasonCode: 'publisher_device_mix_unsupported', effectiveVolume: 0 };
  }
  if (!input.catalogueEnabled || !input.licensedForRegion) {
    return { allowed: false, reasonCode: 'approved_track_unavailable', effectiveVolume: 0 };
  }
  if (['stop', 'pause'].includes(input.action)) {
    return { allowed: true, reasonCode: 'transport_safety_action', effectiveVolume: 0 };
  }
  const conversationActive = input.showState === 'pair_active'
    || input.showState === 'conversation_topic';
  if (conversationActive && !input.duckingEnabled) {
    return { allowed: false, reasonCode: 'conversation_music_suppressed', effectiveVolume: 0 };
  }
  return {
    allowed: true,
    reasonCode: conversationActive ? 'conversation_priority_duck' : 'approved_program_music',
    effectiveVolume: conversationActive ? 0.12 : 0.28,
  };
};
