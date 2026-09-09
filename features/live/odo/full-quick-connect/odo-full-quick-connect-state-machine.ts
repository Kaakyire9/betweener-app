import type {
  OdoFullQuickConnectDecision,
  OdoFullQuickConnectDecisionInput,
} from './odo-full-quick-connect-contracts.ts';

/**
 * Pure policy mirror for client diagnostics and regression tests. The server
 * reconciler independently derives the same decision from authoritative rows.
 */
export const deriveOdoFullQuickConnectDecision = (
  input: OdoFullQuickConnectDecisionInput,
): OdoFullQuickConnectDecision => {
  if (!input.sessionLive) {
    return {
      action: 'CLOSE_QUICK_CONNECT',
      lifecycleState: 'ended',
      orchestrationState: 'quick_connect_closed',
      reasonCode: 'session_not_live',
    };
  }
  if (input.circuitBreakerOpen) {
    return {
      action: 'WAIT',
      lifecycleState: 'paused_by_policy',
      orchestrationState: 'recovering',
      reasonCode: 'circuit_breaker_open',
    };
  }
  if (input.lifecycleState === 'paused_by_host'
    || input.lifecycleState === 'paused_by_policy') {
    return {
      action: 'WAIT',
      lifecycleState: input.lifecycleState,
      orchestrationState: input.activePairs > 0 ? 'pair_active' : 'recovering',
      reasonCode: 'autopilot_paused',
    };
  }
  if (input.lifecycleState === 'closing' || input.controlState === 'ended') {
    return {
      action: 'CLOSE_QUICK_CONNECT',
      lifecycleState: 'ended',
      orchestrationState: 'quick_connect_closed',
      reasonCode: 'quick_connect_segment_closed',
    };
  }
  if (input.lifecycleState === 'draining' || input.controlState === 'draining') {
    return input.activePairs > 0 ? {
      action: 'WAIT',
      lifecycleState: 'draining',
      orchestrationState: 'draining',
      reasonCode: 'finishing_active_pairs',
    } : {
      action: 'QUICK_CONNECT_CLOSING',
      lifecycleState: 'closing',
      orchestrationState: 'quick_connect_closed',
      reasonCode: 'active_rounds_finished',
    };
  }
  if (input.maximumRuntimeReached) {
    return {
      action: 'BEGIN_DRAINING',
      lifecycleState: 'draining',
      orchestrationState: 'draining',
      reasonCode: 'maximum_runtime_reached',
    };
  }
  if (input.controlState === 'closed' || input.controlState === 'paused') {
    return {
      action: 'OPEN_POOL',
      lifecycleState: 'starting',
      orchestrationState: 'waiting_for_pool_open',
      reasonCode: 'host_authorized_autopilot_open',
    };
  }
  if (input.activePairs > 0) {
    return {
      action: 'WAIT',
      lifecycleState: 'active',
      orchestrationState: 'pair_active',
      reasonCode: 'active_pair_in_progress',
    };
  }
  if (input.eligiblePairs > 0) {
    return {
      action: 'SYNC_MATCHER',
      lifecycleState: 'active',
      orchestrationState: 'waiting_for_pair',
      reasonCode: 'eligible_pair_available',
    };
  }
  return {
    action: input.lowLiquidityElapsed ? 'ENTER_LOW_LIQUIDITY' : 'WAIT',
    lifecycleState: 'active',
    orchestrationState: input.lowLiquidityElapsed ? 'low_liquidity' : 'waiting_for_candidates',
    reasonCode: input.lowLiquidityElapsed ? 'no_eligible_pair' : 'waiting_for_candidates',
  };
};
