import type { DatePlanResponseKind, DatePlanStatus, MessageType } from '@/components/chat/types';
import { DATE_PLAN_TEXT_PREFIX } from '@/constants/chat';
import { buildMapsLink, getStaticMapUrl, type PlaceResult } from '@/lib/chat/location/chat-location-payload';
import type { Database } from '@/supabase/types/database';

type DatePlanRow = Database['public']['Tables']['date_plans']['Row'];

export type DatePlaceSource = 'betweener_pick' | 'nearby' | 'search' | 'preferred';

export type DatePlaceOption = PlaceResult & {
  source: DatePlaceSource;
  badges?: string[];
  summary?: string | null;
  city?: string | null;
  venueId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const buildDateInvitePayload = ({
  planId,
  parentPlanId,
  scheduledFor,
  place,
  note,
  status = 'pending',
  conciergeRequested = false,
  responseKind = 'initial',
}: {
  planId?: string | null;
  parentPlanId?: string | null;
  scheduledFor: Date;
  place: DatePlaceOption;
  note?: string | null;
  status?: DatePlanStatus;
  conciergeRequested?: boolean;
  responseKind?: DatePlanResponseKind;
}) => `${DATE_PLAN_TEXT_PREFIX}${JSON.stringify({
  planId: planId || null,
  parentPlanId: parentPlanId || null,
  venueId: place.venueId ?? null,
  scheduledFor: scheduledFor.toISOString(),
  placeName: place.name,
  placeAddress: place.address ?? null,
  source: place.source,
  badges: place.badges ?? [],
  summary: place.summary ?? null,
  city: place.city ?? null,
  lat: place.lat,
  lng: place.lng,
  note: note?.trim() || null,
  responseKind,
  status,
  conciergeRequested,
})}`;

export const parseDateInviteMessage = (rawText: string): MessageType['dateInvite'] | null => {
  if (!rawText?.startsWith(DATE_PLAN_TEXT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(rawText.slice(DATE_PLAN_TEXT_PREFIX.length));
    const scheduledFor = new Date(parsed?.scheduledFor);
    if (!parsed?.placeName || Number.isNaN(scheduledFor.getTime())) return null;
    const lat = typeof parsed?.lat === 'number' ? parsed.lat : null;
    const lng = typeof parsed?.lng === 'number' ? parsed.lng : null;
    return {
      planId: typeof parsed?.planId === 'string' ? parsed.planId : null,
      parentPlanId: typeof parsed?.parentPlanId === 'string' ? parsed.parentPlanId : null,
      venueId: typeof parsed?.venueId === 'string' ? parsed.venueId : null,
      scheduledFor,
      placeName: String(parsed.placeName),
      placeAddress: typeof parsed?.placeAddress === 'string' ? parsed.placeAddress : undefined,
      note: typeof parsed?.note === 'string' ? parsed.note : undefined,
      source: (parsed?.source as DatePlaceSource) || 'search',
      badges: Array.isArray(parsed?.badges)
        ? parsed.badges.filter((value: unknown) => typeof value === 'string')
        : [],
      summary: typeof parsed?.summary === 'string' ? parsed.summary : null,
      city: typeof parsed?.city === 'string' ? parsed.city : null,
      lat,
      lng,
      mapUrl: lat != null && lng != null ? getStaticMapUrl(lat, lng) : null,
      mapLink: lat != null && lng != null ? buildMapsLink(lat, lng) : null,
      responseKind: parsed?.responseKind === 'counter_time'
        || parsed?.responseKind === 'counter_place'
        || parsed?.responseKind === 'counter_both'
        ? parsed.responseKind
        : 'initial',
      status: parsed?.status === 'accepted'
        || parsed?.status === 'declined'
        || parsed?.status === 'cancelled'
        || parsed?.status === 'countered'
        ? parsed.status
        : 'pending',
      conciergeRequested: Boolean(parsed?.conciergeRequested),
    };
  } catch (error) {
    console.log('[chat] date invite parse error', error);
    return null;
  }
};

export const mergeDateInviteWithPlanRow = (
  invite: MessageType['dateInvite'],
  plan: DatePlanRow,
): MessageType['dateInvite'] => {
  if (!invite) return invite;
  const lat = typeof plan.lat === 'number' ? plan.lat : invite.lat ?? null;
  const lng = typeof plan.lng === 'number' ? plan.lng : invite.lng ?? null;
  return {
    ...invite,
    planId: plan.id,
    parentPlanId: plan.parent_plan_id,
    venueId: plan.venue_id,
    scheduledFor: new Date(plan.scheduled_for),
    placeName: plan.place_name,
    placeAddress: plan.place_address || undefined,
    note: plan.note || undefined,
    source: (plan.place_source as DatePlaceSource) || invite.source,
    badges: Array.isArray(plan.place_badges)
      ? plan.place_badges.filter((value): value is string => typeof value === 'string')
      : invite.badges ?? [],
    summary: plan.place_summary,
    city: plan.city,
    lat,
    lng,
    mapUrl: lat != null && lng != null ? getStaticMapUrl(lat, lng) : null,
    mapLink: lat != null && lng != null ? buildMapsLink(lat, lng) : null,
    status: (plan.status as DatePlanStatus) || invite.status || 'pending',
    conciergeRequested: Boolean(plan.concierge_requested),
    responseKind: (plan.response_kind as DatePlanResponseKind) || invite.responseKind || 'initial',
  };
};

export const buildDateQuickSlots = (baseNow: Date) => {
  const tonight = new Date(baseNow);
  tonight.setHours(baseNow.getHours() < 18 ? 19 : 20, 0, 0, 0);
  if (tonight.getTime() <= baseNow.getTime()) {
    tonight.setDate(tonight.getDate() + 1);
    tonight.setHours(19, 0, 0, 0);
  }
  const tomorrow = new Date(baseNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(19, 0, 0, 0);
  const saturdayBrunch = new Date(baseNow);
  const daysUntilSaturday = (6 - saturdayBrunch.getDay() + 7) % 7 || 7;
  saturdayBrunch.setDate(saturdayBrunch.getDate() + daysUntilSaturday);
  saturdayBrunch.setHours(11, 30, 0, 0);
  return [
    {
      id: 'tonight',
      label: tonight.getDate() === baseNow.getDate() ? 'Tonight' : 'Next evening',
      caption: tonight.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      date: tonight,
    },
    { id: 'tomorrow', label: 'Tomorrow', caption: 'Dinner time', date: tomorrow },
    { id: 'saturday_brunch', label: 'Saturday brunch', caption: '11:30 AM', date: saturdayBrunch },
  ] as const;
};

const getMetadataStringArray = (
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) => {
  const value = metadata?.[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
};

export const getDatePlaceExperience = (place: DatePlaceOption | null) => {
  if (!place) {
    return {
      vibe: null as string | null,
      trustReasons: [] as string[],
      perks: [] as string[],
      conciergeServices: [] as string[],
    };
  }
  const metadata = place.metadata ?? null;
  const vibe = typeof metadata?.date_vibe === 'string' && metadata.date_vibe.trim().length > 0
    ? metadata.date_vibe
    : place.source === 'betweener_pick'
    ? 'First-date ready'
    : place.source === 'preferred'
    ? 'Closer to their side'
    : place.source === 'nearby'
    ? 'Easy to get to'
    : 'Flexible meet-up';
  const defaultTrustReasons = place.source === 'betweener_pick'
    ? ['Public, easy-to-find venue', 'Comfort-first setup', 'Good for a first meeting']
    : ['Public location', 'Easy to find on Maps', 'Simple to adjust if plans shift'];
  const trustReasons = getMetadataStringArray(metadata, 'trust_reasons');
  const conciergeServices = getMetadataStringArray(metadata, 'concierge_services');
  return {
    vibe,
    trustReasons: trustReasons.length > 0 ? trustReasons : defaultTrustReasons,
    perks: [
      ...((place.badges ?? []).filter((badge) => badge !== 'Betweener Safe Venue')),
      ...(conciergeServices.length > 0 ? ['Betweener help available'] : []),
    ],
    conciergeServices,
  };
};
