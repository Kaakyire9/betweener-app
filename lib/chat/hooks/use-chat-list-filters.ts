import { useMemo } from "react";

type ChatListFilterTab = 'all' | 'unread' | 'pinned' | 'archived';

type ChatListFilterConversation = {
  id: string;
  isArchived: boolean;
  isPinned: boolean;
  unreadCount: number;
  matchedUser: {
    name: string;
  };
  lastMessage: {
    timestamp: Date;
  };
  latestActivity?: {
    createdAt: Date;
  } | null;
};

type UseChatListFiltersArgs<TConversation extends ChatListFilterConversation> = {
  conversations: TConversation[];
  searchQuery: string;
  activeTab: ChatListFilterTab;
};

export const useChatListFilters = <TConversation extends ChatListFilterConversation>({
  conversations,
  searchQuery,
  activeTab,
}: UseChatListFiltersArgs<TConversation>) => {
  const filteredConversations = useMemo(() => {
    return conversations
      .filter((conversation) => {
        if (searchQuery) {
          return conversation.matchedUser.name.toLowerCase().includes(searchQuery.toLowerCase());
        }
        switch (activeTab) {
          case 'unread':
            return !conversation.isArchived && conversation.unreadCount > 0;
          case 'pinned':
            return !conversation.isArchived && conversation.isPinned;
          case 'archived':
            return conversation.isArchived;
          default:
            return !conversation.isArchived;
        }
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const aActivityAt = Math.max(
          a.lastMessage.timestamp.getTime(),
          a.latestActivity?.createdAt.getTime() ?? 0,
        );
        const bActivityAt = Math.max(
          b.lastMessage.timestamp.getTime(),
          b.latestActivity?.createdAt.getTime() ?? 0,
        );
        return bActivityAt - aActivityAt;
      });
  }, [activeTab, conversations, searchQuery]);

  const unreadConversationCount = useMemo(
    () => conversations.filter((conversation) => !conversation.isArchived && conversation.unreadCount > 0).length,
    [conversations],
  );

  const archivedConversationCount = useMemo(
    () => conversations.filter((conversation) => conversation.isArchived).length,
    [conversations],
  );

  return {
    filteredConversations,
    unreadConversationCount,
    archivedConversationCount,
  };
};
