import {
  ODO_AUTOPILOT_STATES,
  ODO_DIRECTION_MODES,
  type OdoAutopilotState,
  type OdoDirectionMode,
} from './odo-contracts.ts';

const TRANSITIONS: Readonly<Record<OdoAutopilotState, readonly OdoAutopilotState[]>> = {
  off: ['starting'],
  starting: ['active', 'paused_by_host', 'paused_by_policy', 'recovering', 'ending'],
  active: ['paused_by_host', 'paused_by_policy', 'recovering', 'ending'],
  paused_by_host: ['starting', 'ending'],
  paused_by_policy: ['starting', 'ending'],
  recovering: ['active', 'paused_by_host', 'paused_by_policy', 'ending'],
  ending: ['ended'],
  ended: [],
};

export const isOdoAutopilotState = (value: unknown): value is OdoAutopilotState =>
  typeof value === 'string' && ODO_AUTOPILOT_STATES.includes(value as OdoAutopilotState);

export const isOdoDirectionMode = (value: unknown): value is OdoDirectionMode =>
  typeof value === 'string' && ODO_DIRECTION_MODES.includes(value as OdoDirectionMode);

export const canTransitionOdoAutopilot = (
  current: OdoAutopilotState,
  next: OdoAutopilotState,
): boolean => TRANSITIONS[current].includes(next);

export const assertOdoAutopilotTransition = (
  current: OdoAutopilotState,
  next: OdoAutopilotState,
): void => {
  if (!canTransitionOdoAutopilot(current, next)) {
    throw new Error(`invalid_odo_autopilot_transition:${current}:${next}`);
  }
};

