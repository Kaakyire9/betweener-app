import type { InboxItem } from '@/hooks/useInbox';

export const isPassiveProfileInterestSystemItem = (item: {
  type?: string | null;
  entity_type?: string | null;
  metadata?: Record<string, unknown> | null;
}) =>
  item.type === 'SYSTEM' &&
  (item.entity_type === 'profile_interest' || item.metadata?.type === 'profile_interest');

export const isNonChatInboxActivityItem = (item: InboxItem) => {
  if (item.type === 'NEW_MESSAGE' || item.type === 'MESSAGE_REQUEST') return false;
  if (isPassiveProfileInterestSystemItem(item)) return false;
  return item.action_required || !item.read_at;
};

export const getNonChatInboxActivityItems = (items: InboxItem[]) =>
  items.filter(isNonChatInboxActivityItem);
