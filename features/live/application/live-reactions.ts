import type {
  LiveReactionCounts,
  LiveReactionEvent,
  LiveReactionKind,
  LiveReactionSummary,
} from './live-models.ts';

export const LIVE_REACTION_KINDS = [
  'heart',
  'spark',
  'applause',
  'support',
  'joy',
  'wow',
  'insight',
  'celebrate',
] as const satisfies readonly LiveReactionKind[];

export const MAX_LIVE_REACTION_BURSTS = 18;
export const LIVE_REACTION_COALESCE_MS = 320;

export type LiveReactionBurst = {
  id: string;
  reaction: LiveReactionKind;
  count: number;
  receivedAt: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isSafeCount = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isSafeInteger(value)
  && value >= 0
);

export const emptyLiveReactionCounts = (): LiveReactionCounts => ({
  heart: 0,
  spark: 0,
  applause: 0,
  support: 0,
  joy: 0,
  wow: 0,
  insight: 0,
  celebrate: 0,
});

export const emptyLiveReactionSummary = (sessionId: string): LiveReactionSummary => ({
  sessionId,
  totalCount: 0,
  version: 0,
  updatedAt: null,
  counts: emptyLiveReactionCounts(),
});

export const isLiveReactionKind = (value: unknown): value is LiveReactionKind => (
  typeof value === 'string'
  && (LIVE_REACTION_KINDS as readonly string[]).includes(value)
);

export const parseLiveReactionSummary = (value: unknown): LiveReactionSummary | null => {
  if (!isRecord(value) || !isRecord(value.counts)) return null;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId : '';
  const updatedAt = value.updatedAt === null || value.updatedAt === undefined
    ? null
    : typeof value.updatedAt === 'string' ? value.updatedAt : '';
  if (
    !UUID_PATTERN.test(sessionId)
    || !isSafeCount(value.totalCount)
    || !isSafeCount(value.version)
    || (updatedAt !== null && (!updatedAt || !Number.isFinite(Date.parse(updatedAt))))
  ) return null;

  const counts = emptyLiveReactionCounts() as Record<LiveReactionKind, number>;
  for (const kind of LIVE_REACTION_KINDS) {
    const count = value.counts[kind];
    if (!isSafeCount(count)) return null;
    counts[kind] = count;
  }
  const countedTotal = LIVE_REACTION_KINDS.reduce((total, kind) => total + counts[kind], 0);
  if (countedTotal !== value.totalCount) return null;

  return {
    sessionId,
    totalCount: value.totalCount,
    version: value.version,
    updatedAt,
    counts,
  };
};

export const newestLiveReactionSummary = (
  current: LiveReactionSummary,
  incoming: LiveReactionSummary,
): LiveReactionSummary => {
  if (incoming.sessionId !== current.sessionId) return current;
  if (incoming.version < current.version) return current;
  if (incoming.version === current.version && incoming.totalCount < current.totalCount) return current;
  return incoming;
};

export const parseLiveReactionEvent = (value: unknown): LiveReactionEvent | null => {
  if (!isRecord(value)) return null;
  const row = value;
  const eventId = typeof row.eventId === 'string' ? row.eventId : '';
  const sessionId = typeof row.sessionId === 'string' ? row.sessionId : '';
  const emittedAt = typeof row.emittedAt === 'string' ? row.emittedAt : '';
  if (
    !UUID_PATTERN.test(eventId)
    || !UUID_PATTERN.test(sessionId)
    || !isLiveReactionKind(row.reaction)
    || !emittedAt
    || !Number.isFinite(Date.parse(emittedAt))
  ) return null;
  const summary = row.summary === undefined ? undefined : parseLiveReactionSummary(row.summary);
  if (row.summary !== undefined && (!summary || summary.sessionId !== sessionId)) return null;
  return { eventId, sessionId, reaction: row.reaction, emittedAt, ...(summary ? { summary } : {}) };
};

export const appendLiveReactionBurst = (
  current: readonly LiveReactionBurst[],
  event: LiveReactionEvent,
  receivedAt = Date.now(),
): readonly LiveReactionBurst[] => {
  const last = current.at(-1);
  if (
    last
    && last.reaction === event.reaction
    && receivedAt - last.receivedAt <= LIVE_REACTION_COALESCE_MS
    && last.count < 9
  ) {
    return [
      ...current.slice(0, -1),
      { ...last, count: last.count + 1, receivedAt },
    ];
  }
  return [
    ...current,
    { id: event.eventId, reaction: event.reaction, count: 1, receivedAt },
  ].slice(-MAX_LIVE_REACTION_BURSTS);
};
