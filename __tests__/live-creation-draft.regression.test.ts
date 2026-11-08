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
import { toggleLiveAudienceScope } from '../features/live/creation/live-audience-policy.ts';

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
  assert.deepEqual(draft.audienceScopes, ['global']);
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

test('Studio validates location and diaspora Reach before scheduling', () => {
  const draft = updateLiveCreationDraft(
    createLiveCreationDraft({ clientRequestId: 'request-1234', now }),
    { audienceScopes: ['local', 'diaspora'] },
    now,
  );
  assert.equal(getLiveCreationStepError(draft, 'audience', now.getTime()), 'Choose the country this Live should reach.');
  const country = updateLiveCreationDraft(draft, {
    audienceCountryCode: 'GH',
    audienceCountryName: 'Ghana',
  }, now);
  assert.equal(getLiveCreationStepError(country, 'audience', now.getTime()), 'Choose the city or town this Live should reach.');
  const local = updateLiveCreationDraft(country, { audienceCity: 'Accra' }, now);
  assert.equal(getLiveCreationStepError(local, 'audience', now.getTime()), 'Choose at least one diaspora heritage country.');
  const complete = updateLiveCreationDraft(local, { diasporaOriginCountryCodes: ['gh'] }, now);
  assert.equal(getLiveCreationStepError(complete, 'audience', now.getTime()), null);
});

test('Reach selection keeps exclusive scopes safe and allows location plus diaspora', () => {
  assert.deepEqual(toggleLiveAudienceScope(['global'], 'country'), ['country']);
  assert.deepEqual(toggleLiveAudienceScope(['country'], 'diaspora'), ['country', 'diaspora']);
  assert.deepEqual(toggleLiveAudienceScope(['country', 'diaspora'], 'country'), ['diaspora']);
  assert.deepEqual(toggleLiveAudienceScope(['diaspora'], 'invite_only'), ['invite_only']);
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
    audienceScopes: ['global'],
    audienceCountryCode: null,
    audienceCountryName: null,
    audienceRegion: null,
    audienceCity: null,
    diasporaOriginCountryCodes: [],
    diasporaDestinationCountryCodes: [],
  });
});

test('legacy v1 device drafts migrate safely to global Reach', () => {
  const current = createLiveCreationDraft({ clientRequestId: 'request-1234', now });
  const legacy = { ...current, schemaVersion: 1 } as unknown as Record<string, unknown>;
  delete legacy.audienceScopes;
  delete legacy.audienceCountryCode;
  delete legacy.audienceCountryName;
  delete legacy.audienceRegion;
  delete legacy.audienceCity;
  delete legacy.diasporaOriginCountryCodes;
  delete legacy.diasporaDestinationCountryCodes;
  const parsed = parseLiveCreationDraft(legacy, null);
  assert.equal(parsed?.schemaVersion, 2);
  assert.deepEqual(parsed?.audienceScopes, ['global']);
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
