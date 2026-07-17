import type { InboxItem } from '@/hooks/useInbox';

export const INSIGHTS_SYSTEM_ACTIVITY_KEYS = [
  'profile_interest',
  'profile_gift_revealed',
  'profile_gift_archived',
] as const;

const INTENT_REQUEST_TYPES = ['connect', 'date_request', 'like_with_note', 'circle_intro'] as const;

const getSystemActivityKey = (item: {
  type?: string | null;
  entity_type?: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  if (item.type !== 'SYSTEM') return null;
  const entityType = typeof item.entity_type === 'string' ? item.entity_type : null;
  const metadataType = typeof item.metadata?.type === 'string' ? item.metadata.type : null;
  return entityType ?? metadataType;
};

const hasUnreadOrActionRequired = (item: InboxItem) => item.action_required || !item.read_at;

export const isIntentRelatedInboxItem = (item: InboxItem) => {
  if (item.type === 'LIKE_RECEIVED' || item.type === 'SUPERLIKE_RECEIVED') return true;

  const metadata = item.metadata ?? null;
  const metadataType = typeof metadata?.type === 'string' ? metadata.type : null;
  const requestType = typeof metadata?.request_type === 'string' ? metadata.request_type : null;
  const hasIntentRequestId = typeof metadata?.intent_request_id === 'string' && metadata.intent_request_id.length > 0;
  const systemKey = getSystemActivityKey(item);

  return (
    (requestType ? INTENT_REQUEST_TYPES.includes(requestType as (typeof INTENT_REQUEST_TYPES)[number]) : false) ||
    (metadataType ? INTENT_REQUEST_TYPES.includes(metadataType as (typeof INTENT_REQUEST_TYPES)[number]) : false) ||
    metadataType === 'intent_request' ||
    metadataType === 'intent_reminder' ||
    systemKey === 'intent_request' ||
    systemKey === 'intent_reminder' ||
    hasIntentRequestId
  );
};

export const isPassiveProfileInterestSystemItem = (item: {
  type?: string | null;
  entity_type?: string | null;
  metadata?: Record<string, unknown> | null;
}) => getSystemActivityKey(item) === 'profile_interest';

export const isInsightsInboxActivityItem = (item: InboxItem) => {
  if (!hasUnreadOrActionRequired(item)) return false;
  if (item.type === 'GIFT_RECEIVED') return true;
  const systemKey = getSystemActivityKey(item);
  return systemKey ? INSIGHTS_SYSTEM_ACTIVITY_KEYS.includes(systemKey as (typeof INSIGHTS_SYSTEM_ACTIVITY_KEYS)[number]) : false;
};

export const isMomentsInboxActivityItem = (item: InboxItem) => {
  if (!hasUnreadOrActionRequired(item)) return false;
  return (
    item.type === 'MOMENT_REACTION' ||
    item.type === 'MOMENT_COMMENT' ||
    item.type === 'MOMENT_COMMENT_REACTION'
  );
};

export const isNonChatInboxActivityItem = (item: InboxItem) => {
  if (item.type === 'NEW_MESSAGE' || item.type === 'MESSAGE_REQUEST') return false;
  return hasUnreadOrActionRequired(item);
};

export const getNonChatInboxActivityItems = (items: InboxItem[]) =>
  items.filter(isNonChatInboxActivityItem);

export const isMeInboxActivityItem = (item: InboxItem) => {
  if (!isNonChatInboxActivityItem(item)) return false;
  if (isIntentRelatedInboxItem(item)) return false;
  if (isInsightsInboxActivityItem(item)) return false;
  if (isMomentsInboxActivityItem(item)) return false;
  return true;
};

export const getInsightsInboxActivityItems = (items: InboxItem[]) =>
  items.filter(isInsightsInboxActivityItem);

export const getMomentsInboxActivityItems = (items: InboxItem[]) =>
  items.filter(isMomentsInboxActivityItem);

export const getMeInboxActivityItems = (items: InboxItem[]) =>
  items.filter(isMeInboxActivityItem);
