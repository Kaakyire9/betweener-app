import type { DatePlanResponseKind, MessageType } from "@/components/chat/types";

export const CHAT_READ_RECEIPT_DELAY_MS = 700;

type MaterialCommunityIconName =
  | 'calendar-check'
  | 'calendar-refresh'
  | 'calendar-heart';

export type DatePlannerMode =
  | 'new'
  | 'counter_time'
  | 'counter_place'
  | 'counter_both'
  | 'reschedule';

export type DatePlanPlaceSeed = {
  id: string;
  venueId?: string | null;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  source: NonNullable<NonNullable<MessageType["dateInvite"]>["source"]>;
  badges?: string[];
  summary?: string | null;
  city?: string | null;
};

type RetryFailedTextPayload = {
  text: string;
  replyToMessageId: string | null;
};

type DatePlannerTab = 'picks' | 'nearby' | 'search' | 'preferred';

const normalizeDatePlanText = (value?: string | null) =>
  value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';

const isSameDatePlanPlace = (
  invite: NonNullable<MessageType["dateInvite"]>,
  place: DatePlanPlaceSeed,
) => {
  if (invite.venueId && place.venueId) return invite.venueId === place.venueId;
  if (invite.lat != null && invite.lng != null) {
    const sameLat = Math.abs(invite.lat - place.lat) < 0.000001;
    const sameLng = Math.abs(invite.lng - place.lng) < 0.000001;
    if (sameLat && sameLng) return true;
  }
  return (
    normalizeDatePlanText(invite.placeName) === normalizeDatePlanText(place.name) &&
    normalizeDatePlanText(invite.placeAddress) === normalizeDatePlanText(place.address)
  );
};

export const canRetryFailedTextMessage = ({
  item,
  isMyMessage,
}: {
  item: MessageType;
  isMyMessage: boolean;
}) =>
  isMyMessage &&
  item.type === 'text' &&
  item.status === 'failed' &&
  !item.deletedForAll;

export const buildRetryFailedTextPayload = ({
  failedMessage,
  currentUserId,
}: {
  failedMessage?: MessageType | null;
  currentUserId?: string | null;
}): RetryFailedTextPayload | null => {
  if (!failedMessage || failedMessage.senderId !== (currentUserId || '')) return null;
  if (failedMessage.type !== 'text' || failedMessage.status !== 'failed') return null;
  const text = failedMessage.text.trim();
  if (!text) return null;
  return {
    text,
    replyToMessageId: failedMessage.replyToId ?? null,
  };
};

export const getRetryFailedTextFailureStatus = ({
  isNetworkFailure,
}: {
  isNetworkFailure: boolean;
}): NonNullable<MessageType["status"]> =>
  isNetworkFailure ? 'queued' : 'failed';

export const shouldScheduleMessageRead = ({
  item,
  currentUserId,
}: {
  item?: MessageType | null;
  currentUserId?: string | null;
}) =>
  Boolean(
    item?.id &&
      !item.id.startsWith('system:') &&
      !item.id.startsWith('temp-') &&
      item.senderId !== (currentUserId || '') &&
      item.status !== 'read',
  );

export const markLoadedIncomingMessagesRead = ({
  items,
  currentUserId,
}: {
  items: MessageType[];
  currentUserId?: string | null;
}) => {
  let changed = false;
  const nextItems = items.map((item) => {
    if (!shouldScheduleMessageRead({ item, currentUserId })) return item;
    changed = true;
    return { ...item, status: 'read' as const };
  });
  return changed ? nextItems : items;
};

export const createDatePlanDraftFromInvite = ({
  invite,
  mode,
}: {
  invite: NonNullable<MessageType["dateInvite"]>;
  mode: Exclude<DatePlannerMode, 'new'>;
}) => ({
  mode,
  parentPlanId: invite.planId ?? null,
  baselineInvite: invite,
  note: mode === 'reschedule' ? invite.note ?? '' : '',
  plannerDate: new Date(invite.scheduledFor),
  selectedPlace: {
    id: invite.venueId || invite.planId || invite.placeName,
    venueId: invite.venueId ?? null,
    name: invite.placeName,
    address: invite.placeAddress ?? null,
    lat: invite.lat ?? 0,
    lng: invite.lng ?? 0,
    source: invite.source,
    badges: [...(invite.badges ?? [])],
    summary: invite.summary ?? null,
    city: invite.city ?? null,
  } satisfies DatePlanPlaceSeed,
  plannerTab: (
    mode === 'counter_time'
      ? 'preferred'
      : invite.source === 'betweener_pick'
      ? 'picks'
      : invite.source === 'preferred'
      ? 'preferred'
      : 'search'
  ) as DatePlannerTab,
});

export const resolveDatePlanResponseKind = ({
  baselineInvite,
  scheduledFor,
  selectedPlace,
}: {
  baselineInvite?: NonNullable<MessageType["dateInvite"]> | null;
  scheduledFor: Date;
  selectedPlace: DatePlanPlaceSeed;
}): DatePlanResponseKind | null => {
  if (!baselineInvite) return 'initial';
  const timeChanged = scheduledFor.getTime() !== baselineInvite.scheduledFor.getTime();
  const placeChanged = !isSameDatePlanPlace(baselineInvite, selectedPlace);
  if (!timeChanged && !placeChanged) return null;
  return timeChanged && placeChanged
    ? 'counter_both'
    : timeChanged
    ? 'counter_time'
    : 'counter_place';
};

export const getDatePlanUiState = ({
  item,
  isMyMessage,
  datePlanActionId,
  datePlanCalendarActionId,
}: {
  item: MessageType;
  isMyMessage: boolean;
  datePlanActionId: string | null;
  datePlanCalendarActionId: string | null;
}) => {
  const datePlanStatus = item.dateInvite?.status ?? 'pending';
  const datePlanPlanId = item.dateInvite?.planId ?? null;
  const datePlanBusy = Boolean(datePlanPlanId) && datePlanActionId === datePlanPlanId;
  const canAcceptDatePlan = !isMyMessage && datePlanStatus === 'pending' && Boolean(datePlanPlanId);
  const canRequestDatePlanConcierge =
    datePlanStatus === 'accepted' &&
    !item.dateInvite?.conciergeRequested &&
    Boolean(datePlanPlanId);
  const canRescheduleDatePlan = datePlanStatus === 'accepted' && Boolean(datePlanPlanId);
  const canAddDatePlanToCalendar = datePlanStatus === 'accepted' && Boolean(item.dateInvite);
  const canCancelDatePlan =
    Boolean(datePlanPlanId) &&
    ((datePlanStatus === 'pending' && isMyMessage) || datePlanStatus === 'accepted');
  const datePlanCalendarBusy = Boolean(datePlanPlanId) && datePlanCalendarActionId === datePlanPlanId;
  const datePlanBadgeLabel =
    datePlanStatus === 'accepted'
      ? 'Plan confirmed'
      : item.dateInvite?.responseKind === 'counter_time'
      ? 'Suggested another time'
      : item.dateInvite?.responseKind === 'counter_place'
      ? 'Suggested another place'
      : item.dateInvite?.responseKind === 'counter_both'
      ? 'Updated suggestion'
      : 'Date suggestion';
  const datePlanBadgeIcon: MaterialCommunityIconName =
    datePlanStatus === 'accepted'
      ? 'calendar-check'
      : item.dateInvite?.responseKind === 'counter_time' ||
        item.dateInvite?.responseKind === 'counter_place' ||
        item.dateInvite?.responseKind === 'counter_both'
      ? 'calendar-refresh'
      : 'calendar-heart';
  const isAcceptedDatePlan = datePlanStatus === 'accepted';

  return {
    datePlanStatus,
    datePlanPlanId,
    datePlanBusy,
    canAcceptDatePlan,
    canRequestDatePlanConcierge,
    canRescheduleDatePlan,
    canAddDatePlanToCalendar,
    canCancelDatePlan,
    datePlanCalendarBusy,
    datePlanBadgeLabel,
    datePlanBadgeIcon,
    isAcceptedDatePlan,
  };
};
