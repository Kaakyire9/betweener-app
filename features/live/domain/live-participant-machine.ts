import type { LiveParticipantState } from './live-types.ts';

export const LIVE_PARTICIPANT_EVENTS = [
  'rsvp',
  'waitlist',
  'enter_backstage',
  'join_audience',
  'request_stage',
  'promote_to_stage',
  'demote_to_audience',
  'enter_private_spark',
  'return_from_private_spark',
  'connection_lost',
  'reconnect_to_audience',
  'reconnect_to_stage',
  'leave',
  'remove',
  'ban',
] as const;

export type LiveParticipantEvent = (typeof LIVE_PARTICIPANT_EVENTS)[number];

const PARTICIPANT_TRANSITIONS: Readonly<
  Record<
    LiveParticipantState,
    Readonly<Partial<Record<LiveParticipantEvent, LiveParticipantState>>>
  >
> = {
  invited: { rsvp: 'confirmed', waitlist: 'waitlisted', enter_backstage: 'backstage', remove: 'removed', ban: 'banned' },
  confirmed: { rsvp: 'confirmed', waitlist: 'waitlisted', enter_backstage: 'backstage', join_audience: 'audience', leave: 'left', remove: 'removed', ban: 'banned' },
  waitlisted: { waitlist: 'waitlisted', rsvp: 'confirmed', enter_backstage: 'backstage', join_audience: 'audience', leave: 'left', remove: 'removed', ban: 'banned' },
  backstage: { enter_backstage: 'backstage', join_audience: 'audience', promote_to_stage: 'on_stage', connection_lost: 'temporarily_disconnected', leave: 'left', remove: 'removed', ban: 'banned' },
  audience: { join_audience: 'audience', request_stage: 'stage_requested', promote_to_stage: 'on_stage', connection_lost: 'temporarily_disconnected', leave: 'left', remove: 'removed', ban: 'banned' },
  stage_requested: { request_stage: 'stage_requested', demote_to_audience: 'audience', promote_to_stage: 'on_stage', connection_lost: 'temporarily_disconnected', leave: 'left', remove: 'removed', ban: 'banned' },
  on_stage: { promote_to_stage: 'on_stage', demote_to_audience: 'audience', enter_private_spark: 'private_spark', connection_lost: 'temporarily_disconnected', leave: 'left', remove: 'removed', ban: 'banned' },
  private_spark: { enter_private_spark: 'private_spark', return_from_private_spark: 'on_stage', demote_to_audience: 'audience', connection_lost: 'temporarily_disconnected', leave: 'left', remove: 'removed', ban: 'banned' },
  temporarily_disconnected: { connection_lost: 'temporarily_disconnected', reconnect_to_audience: 'audience', reconnect_to_stage: 'on_stage', leave: 'left', remove: 'removed', ban: 'banned' },
  left: { leave: 'left', ban: 'banned' },
  removed: { remove: 'removed', ban: 'banned' },
  banned: { ban: 'banned' },
};

export type LiveParticipantTransition = {
  from: LiveParticipantState;
  to: LiveParticipantState;
  event: LiveParticipantEvent;
  occurredAt: string;
  idempotent: boolean;
};

export const transitionLiveParticipant = (args: {
  currentState: LiveParticipantState;
  event: LiveParticipantEvent;
  now?: Date;
}): LiveParticipantTransition => {
  const nextState = PARTICIPANT_TRANSITIONS[args.currentState][args.event];
  if (!nextState) {
    throw new Error(`invalid_live_participant_transition:${args.currentState}:${args.event}`);
  }

  return {
    from: args.currentState,
    to: nextState,
    event: args.event,
    occurredAt: (args.now ?? new Date()).toISOString(),
    idempotent: nextState === args.currentState,
  };
};

export const getLiveParticipantTransitions = (state: LiveParticipantState) =>
  PARTICIPANT_TRANSITIONS[state];
