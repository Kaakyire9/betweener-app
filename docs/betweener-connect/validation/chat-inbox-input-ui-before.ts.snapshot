import { router } from "expo-router";
import { Animated } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";

import { getAuthoritativePresenceDisplay } from "@/lib/presence";

type ChatListConversation = {
  id: string;
  matchedUser: {
    name: string;
    userId: string;
    profileId: string | null;
    avatar_url: string;
    isOnline: boolean;
    lastSeen: Date;
  };
};

type ChatListNewMatch = {
  userId: string;
  profileId: string;
  name: string;
  avatar_url: string | null;
  isOnline: boolean;
  lastSeen: Date;
};

type UseChatListScreenUiArgs<TNewMatch extends ChatListNewMatch> = {
  onNewMatchOpened?: (match: TNewMatch) => void;
  prepareThreadOpen?: (peerUserId: string) => Promise<void>;
};

export const useChatListScreenUi = <
  TConversation extends ChatListConversation,
  TNewMatch extends ChatListNewMatch,
>({
  onNewMatchOpened,
  prepareThreadOpen,
}: UseChatListScreenUiArgs<TNewMatch> = {}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'pinned' | 'archived'>('all');
  const [failedAvatarUris, setFailedAvatarUris] = useState<Record<string, string>>({});
  const searchAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showSearch) {
      Animated.timing(searchAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
      return;
    }
    Animated.timing(searchAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [searchAnimation, showSearch]);

  const toggleSearch = useCallback(() => {
    setShowSearch((prev) => !prev);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const markConversationAvatarFailed = useCallback((peerId: string, avatarUri: string | null) => {
    if (!avatarUri) return;
    setFailedAvatarUris((prev) => {
      if (prev[peerId] === avatarUri) return prev;
      return { ...prev, [peerId]: avatarUri };
    });
  }, []);

  const pruneFailedAvatarUris = useCallback((conversations: TConversation[]) => {
    setFailedAvatarUris((prev) => {
      const next = { ...prev };
      let changed = false;
      const activePeers = new Set(conversations.map((conversation) => conversation.id));

      Object.keys(next).forEach((peerId) => {
        if (!activePeers.has(peerId)) {
          delete next[peerId];
          changed = true;
        }
      });

      conversations.forEach((conversation) => {
        const failedUri = prev[conversation.id];
        if (failedUri && failedUri !== conversation.matchedUser.avatar_url) {
          delete next[conversation.id];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, []);

  const openConversation = useCallback(async (conversation: TConversation) => {
    const presence = getAuthoritativePresenceDisplay(
      conversation.matchedUser.isOnline,
      conversation.matchedUser.lastSeen.toISOString(),
      Date.now(),
    );
    const peerUserId = conversation.matchedUser.userId || conversation.id;
    const peerProfileId = conversation.matchedUser.profileId || '';
    await prepareThreadOpen?.(peerUserId);
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: peerUserId,
        peerUserId,
        peerProfileId,
        userName: conversation.matchedUser.name,
        userAvatar: conversation.matchedUser.avatar_url,
        isOnline: presence.online.toString(),
        lastSeen: conversation.matchedUser.lastSeen.toISOString(),
      },
    });
  }, [prepareThreadOpen]);

  const openNewMatch = useCallback(async (match: TNewMatch) => {
    const presence = getAuthoritativePresenceDisplay(match.isOnline, match.lastSeen.toISOString(), Date.now());
    onNewMatchOpened?.(match);
    await prepareThreadOpen?.(match.userId);
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: match.userId,
        peerUserId: match.userId,
        peerProfileId: match.profileId,
        userName: match.name,
        userAvatar: match.avatar_url ?? '',
        isOnline: presence.online.toString(),
        lastSeen: match.lastSeen.toISOString(),
      },
    });
  }, [onNewMatchOpened, prepareThreadOpen]);

  const openExplore = useCallback(() => {
    router.push('/(tabs)/vibes');
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    showSearch,
    toggleSearch,
    clearSearch,
    activeTab,
    setActiveTab,
    failedAvatarUris,
    markConversationAvatarFailed,
    pruneFailedAvatarUris,
    searchAnimation,
    openConversation,
    openNewMatch,
    openExplore,
  };
};
