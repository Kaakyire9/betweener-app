import { ODO_SCHEMA_VERSION, type OdoAction, type OdoDirectorSnapshot } from './odo-contracts.ts';

export type OdoFallbackCause =
  | 'content_invalid'
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'invalid_response'
  | 'policy_rejected'
  | 'unknown';

export type OdoFallbackContext = {
  actionId: string;
  sessionId: string;
  snapshotVersion: number;
  leaseGeneration: number;
  now: Date;
  snapshot?: Pick<OdoDirectorSnapshot, 'sessionStatus' | 'activeRoundId'>;
};

export type OdoFallbackTask =
  | 'director_action'
  | 'conversation_spark'
  | 'audience_pulse'
  | 'intermission_copy';

export type OdoFallbackSnapshot = {
  sessionId: string;
  sessionStatus: string;
  activeRoundId: string | null;
  approvedConversationSpark?: {
    approved: true;
    context: string;
    question: string;
    locale: string;
  } | null;
};

export type OdoTaskFallback =
  | { kind: 'WAIT'; waitMs: number }
  | { kind: 'NO_ACTION' }
  | { kind: 'conversation_spark'; context: string; question: string; locale: string }
  | { kind: 'audience_pulse'; templateKey: string; durationSeconds: number }
  | { kind: 'intermission_copy'; copy: string; locale: string };

const CURATED_SPARKS = [
  { context: 'A shared conversation', question: 'What brought you joy this week?' },
  { context: 'A moment to get curious', question: 'What is something you are looking forward to?' },
  { context: 'An easy place to begin', question: 'What is a small tradition you enjoy?' },
] as const;

const stableIndex = (key: string, size: number): number => {
  let hash = 2_166_136_261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % size;
};

const safeLocale = (locale: string): string =>
  /^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale) && locale.startsWith('en') ? locale : 'en';

const isApprovedSpark = (
  value: OdoFallbackSnapshot['approvedConversationSpark'],
): value is NonNullable<OdoFallbackSnapshot['approvedConversationSpark']> =>
  Boolean(value?.approved
    && typeof value.context === 'string'
    && typeof value.question === 'string'
    && typeof value.locale === 'string'
    && value.context.length >= 1 && value.context.length <= 200
    && value.question.length >= 1 && value.question.length <= 300
    && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value.locale));

/** Deterministic task fallback hierarchy used before WAIT/NO_ACTION. */
export const fallbackFor = (
  task: OdoFallbackTask,
  locale: string,
  snapshot: OdoFallbackSnapshot,
): OdoTaskFallback => {
  const normalizedLocale = safeLocale(locale);
  if (task === 'conversation_spark') {
    if (isApprovedSpark(snapshot.approvedConversationSpark)) {
      return {
        kind: 'conversation_spark',
        context: snapshot.approvedConversationSpark.context,
        question: snapshot.approvedConversationSpark.question,
        locale: snapshot.approvedConversationSpark.locale,
      };
    }
    const selected = CURATED_SPARKS[stableIndex(
      `${snapshot.sessionId}:${snapshot.activeRoundId ?? 'no_round'}:${task}`,
      CURATED_SPARKS.length,
    )];
    return { kind: 'conversation_spark', ...selected, locale: normalizedLocale };
  }
  if (task === 'audience_pulse') {
    return { kind: 'audience_pulse', templateKey: 'shared_energy', durationSeconds: 60 };
  }
  if (task === 'intermission_copy') {
    return { kind: 'intermission_copy', copy: 'We will continue shortly.', locale: normalizedLocale };
  }
  return snapshot.sessionStatus === 'live'
    ? { kind: 'WAIT', waitMs: 5_000 }
    : { kind: 'NO_ACTION' };
};

const WAITABLE = new Set<OdoFallbackCause>([
  'provider_timeout',
  'provider_rate_limited',
  'provider_unavailable',
]);

export const selectDeterministicOdoFallback = (
  cause: OdoFallbackCause,
  context: OdoFallbackContext,
): OdoAction<'NO_ACTION' | 'WAIT'> => {
  const safeAction = fallbackFor('director_action', 'en', {
    sessionId: context.sessionId,
    sessionStatus: context.snapshot?.sessionStatus ?? '',
    activeRoundId: context.snapshot?.activeRoundId ?? null,
  });
  const shouldWait = WAITABLE.has(cause) && safeAction.kind === 'WAIT';
  const base = {
    schemaVersion: ODO_SCHEMA_VERSION,
    actionId: context.actionId,
    sessionId: context.sessionId,
    snapshotVersion: context.snapshotVersion,
    leaseGeneration: context.leaseGeneration,
    reasonCode: `fallback_${cause}`,
    expiresAt: new Date(context.now.getTime() + (shouldWait ? 15_000 : 5_000)).toISOString(),
  } as const;

  return shouldWait
    ? { ...base, type: 'WAIT', payload: { waitMs: 5_000 } }
    : { ...base, type: 'NO_ACTION', payload: {} };
};
