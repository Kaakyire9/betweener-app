// @ts-nocheck
import test from 'node:test';
import { shouldFetchThreadIncrementally } from '../lib/chat/sync/chat-sync-policy.ts';
import assert from 'node:assert/strict';

import {
  buildRetryFailedTextPayload,
  canRetryFailedTextMessage,
  CHAT_READ_RECEIPT_DELAY_MS,
  createDatePlanDraftFromInvite,
  getDatePlanUiState,
  getRetryFailedTextFailureStatus,
  markLoadedIncomingMessagesRead,
  resolveDatePlanResponseKind,
  shouldScheduleMessageRead,
} from '../lib/chat/thread-behavior.ts';

const baseMessage = {
  id: 'msg-1',
  text: 'Hello',
  senderId: 'user-a',
  timestamp: new Date('2026-05-22T08:00:00.000Z'),
  type: 'text',
  reactions: [],
};

test('chat read receipt delay stays stable', () => {
  assert.equal(CHAT_READ_RECEIPT_DELAY_MS, 700);
});

test('thread sync repairs a partial realtime view-once placeholder with a full fetch', () => {
  assert.equal(
    shouldFetchThreadIncrementally({
      syncCursor: '2026-07-20T10:00:00.000Z',
      currentMessages: [
        {
          ...baseMessage,
          id: 'view-once-1',
          type: 'image',
          isViewOnce: true,
          encryptedMedia: false,
          status: 'delivered',
        },
      ],
    }),
    false,
  );
});

test('thread sync remains incremental when cached attachment metadata is complete', () => {
  assert.equal(
    shouldFetchThreadIncrementally({
      syncCursor: '2026-07-20T10:00:00.000Z',
      currentMessages: [
        {
          ...baseMessage,
          id: 'image-1',
          type: 'image',
          storagePath: 'user/thread/image-1.jpg',
          status: 'delivered',
        },
      ],
    }),
    true,
  );
});

test('canRetryFailedTextMessage only allows my failed text messages', () => {
  assert.equal(
    canRetryFailedTextMessage({
      item: { ...baseMessage, status: 'failed' },
      isMyMessage: true,
    }),
    true,
  );

  assert.equal(
    canRetryFailedTextMessage({
      item: { ...baseMessage, status: 'failed', deletedForAll: true },
      isMyMessage: true,
    }),
    false,
  );

  assert.equal(
    canRetryFailedTextMessage({
      item: { ...baseMessage, type: 'image', status: 'failed' },
      isMyMessage: true,
    }),
    false,
  );

  assert.equal(
    canRetryFailedTextMessage({
      item: { ...baseMessage, status: 'failed' },
      isMyMessage: false,
    }),
    false,
  );
});

test('buildRetryFailedTextPayload trims text and preserves reply context', () => {
  assert.deepEqual(
    buildRetryFailedTextPayload({
      failedMessage: {
        ...baseMessage,
        text: '  Re-send me  ',
        status: 'failed',
        replyToId: 'reply-9',
      },
      currentUserId: 'user-a',
    }),
    {
      text: 'Re-send me',
      replyToMessageId: 'reply-9',
    },
  );

  assert.equal(
    buildRetryFailedTextPayload({
      failedMessage: {
        ...baseMessage,
        text: '   ',
        status: 'failed',
      },
      currentUserId: 'user-a',
    }),
    null,
  );
});

test('getRetryFailedTextFailureStatus maps network vs hard failure correctly', () => {
  assert.equal(
    getRetryFailedTextFailureStatus({ isNetworkFailure: true }),
    'queued',
  );
  assert.equal(
    getRetryFailedTextFailureStatus({ isNetworkFailure: false }),
    'failed',
  );
});

test('shouldScheduleMessageRead only schedules unread incoming messages', () => {
  assert.equal(
    shouldScheduleMessageRead({
      item: { ...baseMessage, senderId: 'peer-1', status: 'delivered' },
      currentUserId: 'me',
    }),
    true,
  );

  assert.equal(
    shouldScheduleMessageRead({
      item: { ...baseMessage, senderId: 'me', status: 'delivered' },
      currentUserId: 'me',
    }),
    false,
  );

  assert.equal(
    shouldScheduleMessageRead({
      item: { ...baseMessage, senderId: 'peer-1', status: 'read' },
      currentUserId: 'me',
    }),
    false,
  );

  assert.equal(
    shouldScheduleMessageRead({
      item: null,
      currentUserId: 'me',
    }),
    false,
  );

  assert.equal(
    shouldScheduleMessageRead({
      item: { ...baseMessage, id: 'system:welcome', senderId: 'peer-1' },
      currentUserId: 'me',
    }),
    false,
  );

  assert.equal(
    shouldScheduleMessageRead({
      item: { ...baseMessage, id: 'temp-1', senderId: 'peer-1' },
      currentUserId: 'me',
    }),
    false,
  );
});

test('markLoadedIncomingMessagesRead updates only persisted unread incoming messages', () => {
  const outgoing = { ...baseMessage, id: 'outgoing', senderId: 'me', status: 'delivered' };
  const incoming = { ...baseMessage, id: 'incoming', senderId: 'peer-1', status: 'delivered' };
  const alreadyRead = { ...baseMessage, id: 'read', senderId: 'peer-1', status: 'read' };
  const systemMessage = { ...baseMessage, id: 'system:notice', senderId: 'peer-1' };
  const items = [outgoing, incoming, alreadyRead, systemMessage];

  const result = markLoadedIncomingMessagesRead({
    items,
    currentUserId: 'me',
  });

  assert.notEqual(result, items);
  assert.equal(result[0], outgoing);
  assert.equal(result[1].status, 'read');
  assert.equal(result[2], alreadyRead);
  assert.equal(result[3], systemMessage);
  const unchangedItems = [outgoing, alreadyRead];
  assert.equal(
    markLoadedIncomingMessagesRead({
      items: unchangedItems,
      currentUserId: 'me',
    }),
    unchangedItems,
  );
});

test('getDatePlanUiState exposes incoming pending actions correctly', () => {
  const state = getDatePlanUiState({
    item: {
      ...baseMessage,
      type: 'date_plan',
      dateInvite: {
        planId: 'plan-1',
        scheduledFor: new Date('2026-05-23T18:00:00.000Z'),
        placeName: 'Mikline',
        source: 'betweener_pick',
      },
    },
    isMyMessage: false,
    datePlanActionId: null,
    datePlanCalendarActionId: null,
  });

  assert.equal(state.datePlanStatus, 'pending');
  assert.equal(state.canAcceptDatePlan, true);
  assert.equal(state.canCancelDatePlan, false);
  assert.equal(state.datePlanBadgeLabel, 'Date suggestion');
  assert.equal(state.datePlanBadgeIcon, 'calendar-heart');
  assert.equal(state.isAcceptedDatePlan, false);
});

test('getDatePlanUiState exposes accepted owner actions and busy flags', () => {
  const state = getDatePlanUiState({
    item: {
      ...baseMessage,
      type: 'date_plan',
      dateInvite: {
        planId: 'plan-7',
        scheduledFor: new Date('2026-05-24T19:00:00.000Z'),
        placeName: 'Kumasi',
        source: 'search',
        status: 'accepted',
        conciergeRequested: false,
      },
    },
    isMyMessage: true,
    datePlanActionId: 'plan-7',
    datePlanCalendarActionId: 'plan-7',
  });

  assert.equal(state.datePlanStatus, 'accepted');
  assert.equal(state.datePlanBusy, true);
  assert.equal(state.datePlanCalendarBusy, true);
  assert.equal(state.canAcceptDatePlan, false);
  assert.equal(state.canRescheduleDatePlan, true);
  assert.equal(state.canAddDatePlanToCalendar, true);
  assert.equal(state.canCancelDatePlan, true);
  assert.equal(state.canRequestDatePlanConcierge, true);
  assert.equal(state.datePlanBadgeLabel, 'Plan confirmed');
  assert.equal(state.datePlanBadgeIcon, 'calendar-check');
  assert.equal(state.isAcceptedDatePlan, true);
});

test('getDatePlanUiState maps counter responses to the correct badge copy', () => {
  const state = getDatePlanUiState({
    item: {
      ...baseMessage,
      type: 'date_plan',
      dateInvite: {
        planId: 'plan-9',
        scheduledFor: new Date('2026-05-25T19:00:00.000Z'),
        placeName: 'Accra',
        source: 'preferred',
        responseKind: 'counter_both',
      },
    },
    isMyMessage: false,
    datePlanActionId: null,
    datePlanCalendarActionId: null,
  });

  assert.equal(state.datePlanBadgeLabel, 'Updated suggestion');
  assert.equal(state.datePlanBadgeIcon, 'calendar-refresh');
});

test('getDatePlanUiState allows outgoing pending plans to be cancelled but not accepted', () => {
  const state = getDatePlanUiState({
    item: {
      ...baseMessage,
      senderId: 'me',
      type: 'date_plan',
      dateInvite: {
        planId: 'plan-pending-outgoing',
        scheduledFor: new Date('2026-05-25T19:00:00.000Z'),
        placeName: 'Labadi',
        source: 'search',
        status: 'pending',
      },
    },
    isMyMessage: true,
    datePlanActionId: null,
    datePlanCalendarActionId: null,
  });

  assert.equal(state.canAcceptDatePlan, false);
  assert.equal(state.canCancelDatePlan, true);
  assert.equal(state.canRescheduleDatePlan, false);
  assert.equal(state.canAddDatePlanToCalendar, false);
});

test('getDatePlanUiState disables concierge action once already requested', () => {
  const state = getDatePlanUiState({
    item: {
      ...baseMessage,
      type: 'date_plan',
      dateInvite: {
        planId: 'plan-concierge',
        scheduledFor: new Date('2026-05-26T19:00:00.000Z'),
        placeName: 'East Legon',
        source: 'preferred',
        status: 'accepted',
        conciergeRequested: true,
      },
    },
    isMyMessage: false,
    datePlanActionId: null,
    datePlanCalendarActionId: null,
  });

  assert.equal(state.canRequestDatePlanConcierge, false);
  assert.equal(state.canRescheduleDatePlan, true);
  assert.equal(state.canCancelDatePlan, true);
});

test('createDatePlanDraftFromInvite seeds counter and reschedule transitions consistently', () => {
  const invite = {
    planId: 'plan-12',
    venueId: 'venue-1',
    scheduledFor: new Date('2026-05-25T19:00:00.000Z'),
    placeName: 'Accra Mall',
    placeAddress: 'Spintex Road',
    note: 'Bring flowers',
    source: 'betweener_pick',
    badges: ['Safe venue'],
    summary: 'Easy meetup point',
    city: 'Accra',
    lat: 5.62,
    lng: -0.17,
  } as const;

  const counterDraft = createDatePlanDraftFromInvite({
    invite,
    mode: 'counter_time',
  });
  assert.equal(counterDraft.note, '');
  assert.equal(counterDraft.plannerTab, 'preferred');
  assert.equal(counterDraft.selectedPlace.venueId, 'venue-1');

  const rescheduleDraft = createDatePlanDraftFromInvite({
    invite,
    mode: 'reschedule',
  });
  assert.equal(rescheduleDraft.note, 'Bring flowers');
  assert.equal(rescheduleDraft.plannerTab, 'picks');
  assert.equal(rescheduleDraft.selectedPlace.name, 'Accra Mall');
});

test('resolveDatePlanResponseKind detects unchanged, time, place, and combined updates', () => {
  const baselineInvite = {
    planId: 'plan-20',
    scheduledFor: new Date('2026-05-26T19:00:00.000Z'),
    placeName: 'Kempinski',
    placeAddress: 'Accra',
    source: 'search',
    lat: 5.56,
    lng: -0.18,
    venueId: null,
  };

  const samePlace = {
    id: 'same',
    venueId: null,
    name: 'Kempinski',
    address: 'Accra',
    lat: 5.56,
    lng: -0.18,
    source: 'search',
    badges: [],
    summary: null,
    city: null,
  };

  assert.equal(
    resolveDatePlanResponseKind({
      baselineInvite,
      scheduledFor: new Date('2026-05-26T19:00:00.000Z'),
      selectedPlace: samePlace,
    }),
    null,
  );

  assert.equal(
    resolveDatePlanResponseKind({
      baselineInvite,
      scheduledFor: new Date('2026-05-26T20:00:00.000Z'),
      selectedPlace: samePlace,
    }),
    'counter_time',
  );

  assert.equal(
    resolveDatePlanResponseKind({
      baselineInvite,
      scheduledFor: new Date('2026-05-26T19:00:00.000Z'),
      selectedPlace: { ...samePlace, id: 'new', name: 'Sandbox Beach', lat: 5.55 },
    }),
    'counter_place',
  );

  assert.equal(
    resolveDatePlanResponseKind({
      baselineInvite,
      scheduledFor: new Date('2026-05-26T21:00:00.000Z'),
      selectedPlace: { ...samePlace, id: 'new-2', name: 'Sandbox Beach', lat: 5.55 },
    }),
    'counter_both',
  );

  assert.equal(
    resolveDatePlanResponseKind({
      baselineInvite: null,
      scheduledFor: new Date('2026-05-27T19:00:00.000Z'),
      selectedPlace: samePlace,
    }),
    'initial',
  );
});
