export const ODO_FULL_QUICK_CONNECT_LIFECYCLE_STATES = [
  'off',
  'preparing',
  'starting',
  'active',
  'draining',
  'closing',
  'ended',
  'paused_by_host',
  'paused_by_policy',
  'recovering',
] as const;

export type OdoFullQuickConnectLifecycleState =
  (typeof ODO_FULL_QUICK_CONNECT_LIFECYCLE_STATES)[number];

export const ODO_FULL_QUICK_CONNECT_ORCHESTRATION_STATES = [
  'waiting_for_pool_open',
  'pool_open',
  'waiting_for_candidates',
  'waiting_for_pair',
  'pair_created',
  'pair_presenting',
  'pair_connecting',
  'pair_active',
  'pair_finishing',
  'outcome_processing',
  'returning_participants',
  'intermission',
  'audience_pulse',
  'low_liquidity',
  'recovering',
  'draining',
  'quick_connect_closed',
] as const;

export type OdoFullQuickConnectOrchestrationState =
  (typeof ODO_FULL_QUICK_CONNECT_ORCHESTRATION_STATES)[number];

export const ODO_FULL_QUICK_CONNECT_ACTIONS = [
  'OPEN_POOL',
  'SYNC_MATCHER',
  'PAIR_OBSERVED',
  'ROUND_COMPLETED',
  'RETURN_TO_POOL',
  'ENTER_LOW_LIQUIDITY',
  'SHOW_PRIVATE_SPARK',
  'QUEUE_TIME_CUE',
  'BEGIN_DRAINING',
  'QUICK_CONNECT_CLOSING',
  'CLOSE_QUICK_CONNECT',
  'RECOVER',
  'WAIT',
] as const;

export type OdoFullQuickConnectAction =
  (typeof ODO_FULL_QUICK_CONNECT_ACTIONS)[number];

export type OdoFullQuickConnectMetrics = {
  waitingPeople: number;
  eligiblePairs: number;
  activePairs: number;
  completedRounds: number;
};

export type OdoFullQuickConnectState = {
  schemaVersion: 1;
  available: boolean;
  sessionId: string;
  enabled: boolean;
  lifecycleState: OdoFullQuickConnectLifecycleState;
  orchestrationState: OdoFullQuickConnectOrchestrationState;
  energyMode: 'calm' | 'normal' | 'energize' | 'closing';
  controlState: 'closed' | 'open' | 'paused' | 'draining' | 'ended';
  limitedMode: boolean;
  healthState: 'healthy' | 'degraded_ai' | 'degraded_realtime' | 'recovering'
    | 'paused_policy' | 'paused_host';
  stateVersion: number;
  leaseGeneration: number;
  metrics: OdoFullQuickConnectMetrics;
  lastActionType: OdoFullQuickConnectAction | null;
  lastReasonCode: string | null;
  startedAt: string | null;
  maximumRuntimeEndsAt: string | null;
  nextWakeAt: string | null;
  unavailableReasonCode: string | null;
};

export type OdoFullQuickConnectDecisionInput = {
  lifecycleState: OdoFullQuickConnectLifecycleState;
  controlState: OdoFullQuickConnectState['controlState'];
  sessionLive: boolean;
  circuitBreakerOpen: boolean;
  maximumRuntimeReached: boolean;
  activePairs: number;
  eligiblePairs: number;
  lowLiquidityElapsed: boolean;
};

export type OdoFullQuickConnectDecision = {
  action: OdoFullQuickConnectAction;
  lifecycleState: OdoFullQuickConnectLifecycleState;
  orchestrationState: OdoFullQuickConnectOrchestrationState;
  reasonCode: string;
};

export const odoFullQuickConnectStatusCopy = (
  state: OdoFullQuickConnectState,
): string => {
  if (state.lifecycleState === 'paused_by_host') return 'Waiting for the Host.';
  if (state.lifecycleState === 'paused_by_policy') return 'Paused by Safety.';
  if (state.lifecycleState === 'draining') return 'Finishing current conversations.';
  if (state.lifecycleState === 'closing') return 'Closing Quick Connect gracefully.';
  if (state.lifecycleState === 'ended') return 'Quick Connect is complete.';
  if (state.orchestrationState === 'pair_active') {
    return state.metrics.activePairs === 1 ? 'One connection is active.'
      : `${state.metrics.activePairs} connections are active.`;
  }
  if (state.orchestrationState === 'low_liquidity') {
    return 'Waiting for another eligible connection.';
  }
  if (state.orchestrationState === 'waiting_for_candidates') {
    return 'Waiting for people to join the pool.';
  }
  if (state.orchestrationState === 'waiting_for_pair') {
    return 'Preparing the next eligible connection.';
  }
  return 'Preparing Quick Connect.';
};
