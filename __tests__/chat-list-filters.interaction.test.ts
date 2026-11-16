import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useChatListFilters } from '@/lib/chat/hooks/use-chat-list-filters';

type Conversation = {
  id: string;
  isArchived: boolean;
  isPinned: boolean;
  unreadCount: number;
  matchedUser: { name: string };
  lastMessage: { timestamp: Date };
  callPreview?: { at: Date };
  latestActivity?: { createdAt: Date };
};
const conversation = (id: string, overrides: Partial<Conversation> = {}): Conversation => ({
  id, isArchived: false, isPinned: false, unreadCount: 0,
  matchedUser: { name: 'Kwabena' }, lastMessage: { timestamp: new Date('2026-11-16T10:00:00Z') }, ...overrides,
});
const conversations = [
  conversation('read'),
  conversation('unread', { unreadCount: 2 }),
  conversation('pinned', { isPinned: true }),
  conversation('archived', { isArchived: true, isPinned: true, unreadCount: 3 }),
  conversation('other', { matchedUser: { name: 'Dufie' } }),
];

describe('conversation search and inbox filters', () => {
  it.each([
    ['all', ['pinned', 'read', 'unread']],
    ['unread', ['unread']],
    ['pinned', ['pinned']],
    ['archived', ['archived']],
  ] as const)('keeps %s scope when a name matches the search', async (activeTab, expected) => {
    const { result } = await renderHook(() => useChatListFilters({ conversations, activeTab, searchQuery: '  kWa  ' }));
    expect(result.current.filteredConversations.map(item => item.id).sort()).toEqual([...expected].sort());
    expect(result.current.unreadConversationCount).toBe(1);
    expect(result.current.archivedConversationCount).toBe(1);
  });

  it('treats whitespace as an empty query and updates when the query changes', async () => {
    const { result, rerender } = await renderHook(({ searchQuery }) => useChatListFilters({ conversations, activeTab: 'all', searchQuery }), {
      initialProps: { searchQuery: 'no-matching-name' },
    });
    expect(result.current.filteredConversations).toEqual([]);
    await rerender({ searchQuery: '   ' });
    expect(result.current.filteredConversations.map(item => item.id).sort()).toEqual(['other', 'pinned', 'read', 'unread']);
  });

  it('retains pinned-first activity ordering without reordering the source list', async () => {
    const input = [
      conversation('read'),
      conversation('call', { callPreview: { at: new Date('2026-11-16T11:00:00Z') } }),
      conversation('pinned', { isPinned: true }),
      conversation('activity', { latestActivity: { createdAt: new Date('2026-11-16T12:00:00Z') } }),
    ];
    const { result } = await renderHook(() => useChatListFilters({ conversations: input, activeTab: 'all', searchQuery: 'kwa' }));
    expect(result.current.filteredConversations.map(item => item.id)).toEqual(['pinned', 'activity', 'call', 'read']);
    expect(input.map(item => item.id)).toEqual(['read', 'call', 'pinned', 'activity']);
  });
});
