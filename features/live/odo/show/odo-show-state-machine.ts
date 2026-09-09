import {
  ODO_SHOW_PRIORITIES,
  type OdoShowDecision,
  type OdoShowDecisionInput,
} from './odo-show-contracts.ts';

const holdCurrentScene = (
  input: OdoShowDecisionInput,
  reasonCode: string,
): OdoShowDecision => ({
  showState: input.pausedByHost ? 'paused_by_host' : 'recovering',
  scene: input.currentScene,
  energyMode: 'calm',
  priority: input.pausedByHost ? ODO_SHOW_PRIORITIES.host : input.currentPriority,
  reasonCode,
});

/**
 * Pure mirror of the server policy. It recommends presentation only; it never
 * selects people, bypasses consent, changes RTC membership, or ends a Live.
 */
export const deriveOdoShowDecision = (
  input: OdoShowDecisionInput,
): OdoShowDecision => {
  if (!input.sessionLive) return {
    showState: 'closing',
    scene: 'session_closing',
    energyMode: 'closing',
    priority: ODO_SHOW_PRIORITIES.lifecycle,
    reasonCode: 'session_not_live',
  };
  if (input.circuitBreakerOpen) return {
    showState: 'paused_by_policy',
    scene: input.currentScene,
    energyMode: 'calm',
    priority: ODO_SHOW_PRIORITIES.safety,
    reasonCode: 'circuit_breaker_open',
  };
  if (input.pausedByHost || input.hostSuppressionActive) {
    return holdCurrentScene(input, input.pausedByHost
      ? 'host_control_active' : 'host_scene_suppression_active');
  }
  if (input.quickConnectState === 'draining') return {
    showState: 'draining',
    scene: input.activePairs > 0 ? 'quick_connect_active' : 'session_closing',
    energyMode: 'closing',
    priority: ODO_SHOW_PRIORITIES.draining,
    reasonCode: input.activePairs > 0 ? 'active_pairs_draining' : 'rotation_drained',
  };
  if (input.activePairs > 0) return {
    showState: 'pair_active',
    scene: 'quick_connect_active',
    energyMode: 'social',
    priority: ODO_SHOW_PRIORITIES.activePair,
    reasonCode: 'private_conversation_active',
  };
  if (input.eligiblePairs > 0) return {
    showState: 'pair_forming',
    scene: 'pair_forming',
    energyMode: 'social',
    priority: ODO_SHOW_PRIORITIES.pairConnecting,
    reasonCode: 'eligible_pair_forming',
  };
  if (!input.sceneDwellElapsed && input.currentPriority >= ODO_SHOW_PRIORITIES.intermission) {
    return holdCurrentScene(input, 'scene_minimum_dwell_active');
  }
  if (input.intermissionDue && input.participantCount > 1) return {
    showState: 'music_intermission',
    scene: 'music_intermission',
    energyMode: input.completedRounds % 4 === 0 ? 'reflective' : 'energize',
    priority: ODO_SHOW_PRIORITIES.intermission,
    reasonCode: 'bounded_intermission_due',
  };
  if (input.quickConnectState === 'open' && input.eligiblePairs === 0) return {
    showState: 'low_liquidity',
    scene: 'odo_stage',
    energyMode: 'social',
    priority: ODO_SHOW_PRIORITIES.narration,
    reasonCode: 'low_liquidity_program_moment',
  };
  if (input.audienceCount > 0 && input.participantCount > 1) return {
    showState: 'host_plus_pool',
    scene: 'host_plus_pool',
    energyMode: 'social',
    priority: ODO_SHOW_PRIORITIES.ambient,
    reasonCode: 'room_social_baseline',
  };
  return {
    showState: 'host_focus',
    scene: 'host_focus',
    energyMode: 'calm',
    priority: ODO_SHOW_PRIORITIES.ambient,
    reasonCode: 'host_focus_baseline',
  };
};
