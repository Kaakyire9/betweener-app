import { expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useChatListRowPresentation, type ChatConversationRowItem } from '@/lib/chat/hooks/use-chat-list-row-presentation';
import { useChatListFilters } from '@/lib/chat/hooks/use-chat-list-filters';
jest.mock('@/lib/presence', () => ({ getAuthoritativePresenceDisplay: () => ({ online: false }) }));
const date = (hour: number) => new Date(`2026-11-05T${hour}:00:00Z`);
function conversation(): ChatConversationRowItem {
  return { id: 'peer', isArchived: false, isPinned: false, isMuted: false, unreadCount: 3, peerHasLeft: false,
    matchedUser: { id: 'profile', name: 'Dufie', avatar_url: '', isOnline: false, lastSeen: date(10) },
    lastMessage: { id: 'message', text: 'A message', timestamp: date(10), senderId: 'me', type: 'text', isRead: true, deliveredAt: date(10) },
    callPreview: { callId: 'canonical-call', text: 'Missed video call', at: date(12), media: 'video' } };
}
const args = (item: ChatConversationRowItem) => ({ item, userId: 'me', presenceNow: date(13).getTime(), typingExpiresAtByPeer: {},
  activeMomentPeerUserIds: new Set<string>(), failedAvatarUris: {}, theme: { tint: '#008080', accent: '#7C5CFF', textMuted: '#809090' }, isDark: true });
it('a typed call preview replaces attachment text without borrowing message read receipts', async () => {
  const item = conversation(), { result } = await renderHook(() => useChatListRowPresentation(args(item)));
  expect(result.current.previewText).toBe('Missed video call'); expect(result.current.receiptIcon).toBeNull();
  expect(result.current.isUnread).toBe(true); expect(item.unreadCount).toBe(3); expect(item.lastMessage.isRead).toBe(true);
});
it('call activity participates in ordering without changing unread, pinned or archived semantics', async () => {
  const item = conversation(), other = { ...conversation(), id: 'other', unreadCount: 0, callPreview: undefined, lastMessage: { ...conversation().lastMessage, timestamp: date(11) } };
  const { result } = await renderHook(() => useChatListFilters({ conversations: [other, item], searchQuery: '', activeTab: 'all' }));
  expect(result.current.filteredConversations.map(row => row.id)).toEqual(['peer', 'other']); expect(result.current.unreadConversationCount).toBe(1);
  expect(item.lastMessage.timestamp).toEqual(date(10));
});
it('normal message preview and receipt presentation remain intact when no call overlay is present', async () => {
  const item = conversation(); item.callPreview = undefined;
  const { result } = await renderHook(() => useChatListRowPresentation(args(item)));
  expect(result.current.previewText).toBe('A message'); expect(result.current.receiptIcon?.name).toBe('check-all');
});
