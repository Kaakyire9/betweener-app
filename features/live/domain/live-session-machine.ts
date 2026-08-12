import type { LiveSessionStatus } from './live-types.ts';

export const LIVE_SESSION_EVENTS = [
  'schedule',
  'open_backstage',
  'start',
  'end',
  'cancel',
] as const;

export type LiveSessionEvent = (typeof LIVE_SESSION_EVENTS)[number];

const SESSION_TRANSITIONS: Readonly<
  Record<LiveSessionStatus, Readonly<Partial<Record<LiveSessionEvent, LiveSessionStatus>>>>
> = {
  draft: { schedule: 'scheduled', cancel: 'cancelled' },
  scheduled: { schedule: 'scheduled', open_backstage: 'backstage', cancel: 'cancelled' },
  backstage: { open_backstage: 'backstage', start: 'live', cancel: 'cancelled' },
  live: { start: 'live', end: 'ended' },
  ended: { end: 'ended' },
  cancelled: { cancel: 'cancelled' },
};

export type LiveSessionTransition = {
  from: LiveSessionStatus;
  to: LiveSessionStatus;
  event: LiveSessionEvent;
  occurredAt: string;
  idempotent: boolean;
};

export const transitionLiveSession = (args: {
  currentState: LiveSessionStatus;
  event: LiveSessionEvent;
  now?: Date;
}): LiveSessionTransition => {
  const nextState = SESSION_TRANSITIONS[args.currentState][args.event];
  if (!nextState) {
    throw new Error(`invalid_live_session_transition:${args.currentState}:${args.event}`);
  }

  return {
    from: args.currentState,
    to: nextState,
    event: args.event,
    occurredAt: (args.now ?? new Date()).toISOString(),
    idempotent: nextState === args.currentState,
  };
};

export const getLiveSessionTransitions = (state: LiveSessionStatus) =>
  SESSION_TRANSITIONS[state];

