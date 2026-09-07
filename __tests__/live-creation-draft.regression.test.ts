import assert from 'node:assert/strict';
import test from 'node:test';
import type { LiveSessionSummary } from '../features/live/application/live-models.ts';
import {
  createLiveCreationDraft,
  createLiveCreationDraftFromSession,
  getLiveCreationStepError,
  parseLiveCreationDraft,
  toScheduleLiveStudioInput,
  updateLiveCreationDraft,
} from '../features/live/creation/live-creation-draft.ts';

const now = new Date('2026-09-06T12:00:00.000Z');

const summary = (overrides: Partial<LiveSessionSummary> = {}): LiveSessionSummary => ({
  id: '20000000-0000-4000-8000-000000000001',
  title: 'Sunday introductions',
  description: 'A thoughtful room.',
  format: 'hosted_match_night',
  status: 'scheduled',
  contextType: 'global',
  contextId: null,
  circleId: null,
  createdByProfileId: '10000000-0000-4000-8000-000000000001',
  scheduledStart: '2026-09-07T18:00:00.000Z',
  scheduledEnd: '2026-09-07T19:30:00.000Z',
  scheduledDurationMinutes: 90,
  scheduleRevision: 0,
  rescheduledAt: null,
  startedAt: null,
  endedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  archivedAt: null,
  chemistryFirstEnabled: false,
  minimumParticipants: 2,
  version: 3,
  posterPath: null,
  teaserVideoPath: null,
  teaserDurationSeconds: null,
  maximumPublishers: 4,
  rsvpStatus: 'none',
  participantState: 'invited',
  audienceCount: 0,
  stageCount: 1,
  reservationCount: 0,
  totalAttendeeCount: 0,
  matchesMadeCount: 0,
  ...overrides,
});

test('new Studio drafts have a stable request key and safe room defaults', () => {
  const draft = createLiveCreationDraft({ clientRequestId: 'request-1234', now });
  assert.equal(draft.clientRequestId, 'request-1234');
  assert.equal(draft.format, 'hosted_match_night');
  assert.equal(draft.durationMinutes, 90);
  assert.equal(draft.scheduledStart, '2026-09-07T12:00:00.000Z');
});

test('Circle draft recovery cannot leak into another creation context', () => {
  const circleDraft = createLiveCreationDraft({
    clientRequestId: 'request-1234',
    circleId: 'circle-one',
    circleName: 'London Circle',
    now,
  });
  assert.equal(parseLiveCreationDraft(circleDraft, 'circle-one')?.format, 'circle_live');
  assert.equal(parseLiveCreationDraft(circleDraft, 'circle-two'), null);
  assert.equal(parseLiveCreationDraft(circleDraft, null), null);
});

test('Studio validation protects story and scheduling boundaries', () => {
  const empty = createLiveCreationDraft({ clientRequestId: 'request-1234', now });
  assert.equal(getLiveCreationStepError(empty, 'story', now.getTime()), 'Give your Live room a title.');
  const titled = updateLiveCreationDraft(empty, { title: 'Warm introductions' }, now);
  assert.equal(getLiveCreationStepError(titled, 'story', now.getTime()), null);
  const tooSoon = updateLiveCreationDraft(titled, { scheduledStart: '2026-09-06T12:05:00.000Z' }, now);
  assert.equal(getLiveCreationStepError(tooSoon, 'room', now.getTime()), 'Choose a start at least 10 minutes from now.');
});

test('publication input is normalized without weakening its idempotency key', () => {
  const draft = updateLiveCreationDraft(
    createLiveCreationDraft({ clientRequestId: 'request-1234', now }),
    { title: '  Warm introductions  ', description: '  Come as you are.  ' },
    now,
  );
  assert.deepEqual(toScheduleLiveStudioInput(draft), {
    clientRequestId: 'request-1234',
    title: 'Warm introductions',
    description: 'Come as you are.',
    scheduledStart: '2026-09-07T12:00:00.000Z',
    durationMinutes: 90,
    format: 'hosted_match_night',
    chemistryFirstEnabled: false,
    circleId: null,
    minimumParticipants: 2,
  });
});

test('creating a copy gets a fresh request key and moves an expired schedule forward', () => {
  const draft = createLiveCreationDraftFromSession(
    summary({ scheduledStart: '2026-09-06T11:00:00.000Z' }),
    'fresh-request',
    { duplicate: true, now },
  );
  assert.equal(draft.clientRequestId, 'fresh-request');
  assert.equal(draft.title, 'Sunday introductions');
  assert.equal(draft.scheduledStart, '2026-09-07T12:00:00.000Z');
});
