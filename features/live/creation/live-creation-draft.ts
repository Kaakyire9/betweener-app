import type {
  LiveSessionFormat,
} from '../domain/live-types.ts';
import type {
  LiveSessionSummary,
  ScheduleLiveStudioSessionInput,
  UpdateLiveStudioSessionInput,
} from '../application/live-models.ts';

export const LIVE_CREATION_DRAFT_VERSION = 1;
export const LIVE_CREATION_MIN_LEAD_MS = 10 * 60 * 1000;
export const LIVE_CREATION_MAX_LEAD_MS = 90 * 24 * 60 * 60 * 1000;
export const LIVE_CREATION_DURATION_OPTIONS = [45, 60, 90] as const;
export const LIVE_CREATION_STEPS = ['moment', 'story', 'room', 'review'] as const;

export type LiveCreationStep = (typeof LIVE_CREATION_STEPS)[number];
export type LiveCreationFormat = Extract<
  LiveSessionFormat,
  'hosted_match_night' | 'quick_connect' | 'circle_live'
>;

export type LiveCreationDraft = {
  schemaVersion: typeof LIVE_CREATION_DRAFT_VERSION;
  clientRequestId: string;
  circleId: string | null;
  circleName: string | null;
  format: LiveCreationFormat;
  title: string;
  description: string;
  scheduledStart: string;
  durationMinutes: number;
  chemistryFirstEnabled: boolean;
  minimumParticipants: number;
  updatedAt: string;
};

type CreateDraftOptions = {
  clientRequestId: string;
  circleId?: string | null;
  circleName?: string | null;
  now?: Date;
};

const nextDefaultStart = (now: Date) => {
  const result = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  result.setSeconds(0, 0);
  return result;
};

export const createLiveCreationDraft = ({
  clientRequestId,
  circleId = null,
  circleName = null,
  now = new Date(),
}: CreateDraftOptions): LiveCreationDraft => ({
  schemaVersion: LIVE_CREATION_DRAFT_VERSION,
  clientRequestId,
  circleId,
  circleName,
  format: circleId ? 'circle_live' : 'hosted_match_night',
  title: '',
  description: '',
  scheduledStart: nextDefaultStart(now).toISOString(),
  durationMinutes: 90,
  chemistryFirstEnabled: false,
  minimumParticipants: 2,
  updatedAt: now.toISOString(),
});

const isLiveCreationFormat = (value: unknown): value is LiveCreationFormat =>
  value === 'hosted_match_night' || value === 'quick_connect' || value === 'circle_live';

export const parseLiveCreationDraft = (
  value: unknown,
  expectedCircleId: string | null,
): LiveCreationDraft | null => {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<LiveCreationDraft>;
  if (
    draft.schemaVersion !== LIVE_CREATION_DRAFT_VERSION
    || typeof draft.clientRequestId !== 'string'
    || draft.clientRequestId.length < 8
    || (draft.circleId ?? null) !== expectedCircleId
    || !isLiveCreationFormat(draft.format)
    || (expectedCircleId ? draft.format !== 'circle_live' : draft.format === 'circle_live')
    || typeof draft.title !== 'string'
    || typeof draft.description !== 'string'
    || typeof draft.scheduledStart !== 'string'
    || !Number.isFinite(Date.parse(draft.scheduledStart))
    || typeof draft.durationMinutes !== 'number'
    || draft.durationMinutes < 30
    || draft.durationMinutes > 180
    || typeof draft.chemistryFirstEnabled !== 'boolean'
    || typeof draft.minimumParticipants !== 'number'
    || draft.minimumParticipants < 2
    || draft.minimumParticipants > 100
    || typeof draft.updatedAt !== 'string'
  ) return null;

  return {
    ...draft,
    circleId: expectedCircleId,
    circleName: typeof draft.circleName === 'string' ? draft.circleName : null,
    title: draft.title.slice(0, 120),
    description: draft.description.slice(0, 1000),
    minimumParticipants: Math.floor(draft.minimumParticipants),
    durationMinutes: Math.floor(draft.durationMinutes),
  } as LiveCreationDraft;
};

export const updateLiveCreationDraft = (
  draft: LiveCreationDraft,
  updates: Partial<Omit<LiveCreationDraft, 'schemaVersion' | 'clientRequestId' | 'circleId'>>,
  now = new Date(),
): LiveCreationDraft => ({
  ...draft,
  ...updates,
  updatedAt: now.toISOString(),
});

export const getLiveCreationStepError = (
  draft: LiveCreationDraft,
  step: LiveCreationStep,
  now = Date.now(),
): string | null => {
  if (step === 'moment') {
    if (draft.circleId && draft.format !== 'circle_live') return 'Choose Circle Live for this Circle.';
    if (!draft.circleId && draft.format === 'circle_live') return 'Open a Circle to create Circle Live.';
    return null;
  }
  if (step === 'story') {
    if (!draft.title.trim()) return 'Give your Live room a title.';
    if (draft.title.trim().length > 120) return 'Keep the title within 120 characters.';
    if (draft.description.length > 1000) return 'Keep the host note within 1,000 characters.';
    return null;
  }
  if (step === 'room') {
    const scheduledStart = Date.parse(draft.scheduledStart);
    if (!Number.isFinite(scheduledStart)) return 'Choose a valid start time.';
    if (scheduledStart < now + LIVE_CREATION_MIN_LEAD_MS) {
      return 'Choose a start at least 10 minutes from now.';
    }
    if (scheduledStart > now + LIVE_CREATION_MAX_LEAD_MS) {
      return 'Choose a start within the next 90 days.';
    }
    if (draft.durationMinutes < 30 || draft.durationMinutes > 180) {
      return 'Choose a duration between 30 minutes and 3 hours.';
    }
    if (draft.circleId && (draft.minimumParticipants < 2 || draft.minimumParticipants > 100)) {
      return 'Choose a Circle quorum between 2 and 100 people.';
    }
    return null;
  }

  return LIVE_CREATION_STEPS
    .slice(0, 3)
    .map((candidate) => getLiveCreationStepError(draft, candidate, now))
    .find((error): error is string => Boolean(error)) ?? null;
};

export const toScheduleLiveStudioInput = (
  draft: LiveCreationDraft,
): ScheduleLiveStudioSessionInput => ({
  clientRequestId: draft.clientRequestId,
  title: draft.title.trim(),
  description: draft.description.trim(),
  scheduledStart: draft.scheduledStart,
  durationMinutes: draft.durationMinutes,
  format: draft.format,
  chemistryFirstEnabled: draft.chemistryFirstEnabled,
  circleId: draft.circleId,
  minimumParticipants: draft.minimumParticipants,
});

export const toUpdateLiveStudioInput = (
  draft: LiveCreationDraft,
  session: Pick<LiveSessionSummary, 'id' | 'version'>,
): UpdateLiveStudioSessionInput => ({
  sessionId: session.id,
  expectedVersion: session.version,
  title: draft.title.trim(),
  description: draft.description.trim(),
  scheduledStart: draft.scheduledStart,
  durationMinutes: draft.durationMinutes,
  chemistryFirstEnabled: draft.chemistryFirstEnabled,
  minimumParticipants: draft.minimumParticipants,
});

export const createLiveCreationDraftFromSession = (
  session: LiveSessionSummary,
  clientRequestId: string,
  options?: { duplicate?: boolean; circleName?: string | null; now?: Date },
): LiveCreationDraft => {
  const now = options?.now ?? new Date();
  const existingStart = session.scheduledStart ? new Date(session.scheduledStart) : null;
  const scheduledStart = existingStart
    && existingStart.getTime() >= now.getTime() + LIVE_CREATION_MIN_LEAD_MS
    ? existingStart
    : nextDefaultStart(now);
  const format: LiveCreationFormat = session.format === 'quick_connect'
    ? 'quick_connect'
    : session.format === 'circle_live'
      ? 'circle_live'
      : 'hosted_match_night';

  return {
    schemaVersion: LIVE_CREATION_DRAFT_VERSION,
    clientRequestId,
    circleId: session.circleId,
    circleName: options?.circleName ?? null,
    format,
    title: session.title,
    description: session.description ?? '',
    scheduledStart: scheduledStart.toISOString(),
    durationMinutes: session.scheduledDurationMinutes,
    chemistryFirstEnabled: session.chemistryFirstEnabled,
    minimumParticipants: session.minimumParticipants,
    updatedAt: now.toISOString(),
  };
};

export const getLiveCreationStorageKey = (
  userId: string,
  circleId: string | null,
) => `betweener.live.creation.v1:${userId}:${circleId ?? 'global'}`;
