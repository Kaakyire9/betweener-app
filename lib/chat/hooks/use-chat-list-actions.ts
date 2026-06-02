import { Alert } from "react-native";
import { useCallback } from "react";

import {
  hideConversationForUser,
  hideConversationMessagesForUser,
  submitChatPeerReport,
  unblockChatPeer,
  blockChatPeer,
  upsertChatPref,
} from "@/lib/chat/chat-list-actions-service";
import { ChatRepository } from "@/lib/chat/local/chat-db";
import { haptics } from "@/lib/haptics";

type QuickReportReason = {
  id: string;
  label: string;
};

type ChatListActionConversation = {
  id: string;
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  peerHasLeft: boolean;
  blockStatus?: 'blocked_by_me' | 'blocked_me' | null;
  matchedUser: {
    name: string;
    id?: string | null;
    userId?: string | null;
    profileId?: string | null;
  };
  lastMessage: {
    timestamp: Date;
  };
};

type UseChatListActionsArgs<TConversation extends ChatListActionConversation> = {
  userId?: string | null;
  conversations: TConversation[];
  setConversations: React.Dispatch<React.SetStateAction<TConversation[]>>;
  quickReportReasons: readonly QuickReportReason[];
  savePeerVisibilityPref: (peerUserId: string, next: { archived: boolean; hidden: boolean }) => Promise<{ error?: unknown }>;
  setPeerPinState: (peerUserId: string, pinned: boolean, muted: boolean) => Promise<void>;
};

export const useChatListActions = <TConversation extends ChatListActionConversation>({
  userId,
  conversations,
  setConversations,
  quickReportReasons,
  savePeerVisibilityPref,
  setPeerPinState,
}: UseChatListActionsArgs<TConversation>) => {
  const getConversationPeerUserId = useCallback((conversation: TConversation) => {
    return (
      conversation.matchedUser.userId ||
      conversation.matchedUser.id ||
      conversation.id
    );
  }, []);

  const clearConversationForMe = useCallback(
    async (peerUserId: string) => {
      if (!userId) return { ok: false };
      try {
        const result = await hideConversationForUser(userId, peerUserId);
        if (!result.ok) {
          console.log('[chat] clear conversation remote hide error', result.error);
          return { ok: false };
        }
      } catch (error) {
        console.log('[chat] clear conversation hide error', error);
        return { ok: false };
      }

      await ChatRepository.hideThreadForUser(userId, peerUserId);
      return { ok: true };
    },
    [userId],
  );

  const clearMessagesForMe = useCallback(
    async (peerUserId: string) => {
      if (!userId) return { ok: false };
      try {
        const result = await hideConversationMessagesForUser(userId, peerUserId);
        if (!result.ok) {
          console.log('[chat] clear messages remote hide error', result.error);
          return { ok: false };
        }
        await ChatRepository.deleteMessages(userId, peerUserId, result.idsToHide);
      } catch (error) {
        console.log('[chat] clear messages hide error', error);
        return { ok: false };
      }

      return { ok: true };
    },
    [userId],
  );

  const toggleMuteConversation = useCallback(
    async (conversation: TConversation) => {
      const peerUserId = getConversationPeerUserId(conversation);
      const nextMuted = !conversation.isMuted;
      setConversations((prev) =>
        prev.map((item) => (item.id === conversation.id ? { ...item, isMuted: nextMuted } : item)),
      );

      if (userId) {
        void ChatRepository.updateThreadPreferences(userId, peerUserId, { muted: nextMuted });
      }

      await setPeerPinState(peerUserId, conversation.isPinned, nextMuted);
      void haptics.tap();
    },
    [getConversationPeerUserId, setConversations, setPeerPinState, userId],
  );

  const blockConversationUser = useCallback(
    async (conversation: TConversation) => {
      if (!userId) return false;
      const { error } = await blockChatPeer(userId, getConversationPeerUserId(conversation));
      if (error) {
        console.log('[chat] block user from list error', error);
        Alert.alert('Block user', 'Unable to block this user right now.');
        return false;
      }
      setConversations((prev) =>
        prev.map((item) => (item.id === conversation.id ? { ...item, blockStatus: 'blocked_by_me' } : item)),
      );
      void haptics.warning();
      return true;
    },
    [getConversationPeerUserId, setConversations, userId],
  );

  const unblockConversationUser = useCallback(
    async (conversation: TConversation) => {
      if (!userId) return false;
      const { error } = await unblockChatPeer(userId, getConversationPeerUserId(conversation));
      if (error) {
        console.log('[chat] unblock user from list error', error);
        Alert.alert('Unblock user', 'Unable to unblock this user right now.');
        return false;
      }
      setConversations((prev) =>
        prev.map((item) => (item.id === conversation.id ? { ...item, blockStatus: null } : item)),
      );
      void haptics.success();
      return true;
    },
    [getConversationPeerUserId, setConversations, userId],
  );

  const reportConversationUser = useCallback(
    async (conversation: TConversation, reasonId: string) => {
      const reasonLabel = quickReportReasons.find((reason) => reason.id === reasonId)?.label ?? reasonId;
      const { error } = await submitChatPeerReport(getConversationPeerUserId(conversation), reasonLabel);
      if (error) {
        console.log('[chat] report user from list error', error);
        Alert.alert('Report user', 'Unable to send this report right now.');
        return false;
      }
      void haptics.success();
      Alert.alert('Report sent', 'Thanks. Betweener will review this quietly.');
      return true;
    },
    [getConversationPeerUserId, quickReportReasons],
  );

  const openReportReasonSheet = useCallback(
    (conversation: TConversation) => {
      Alert.alert(
        'Report user',
        'Choose a reason to continue.',
        [
          ...quickReportReasons.map((reason) => ({
            text: reason.label,
            onPress: () => {
              void reportConversationUser(conversation, reason.id);
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    },
    [quickReportReasons, reportConversationUser],
  );

  const openConversationMoreActions = useCallback(
    (conversation: TConversation) => {
      Alert.alert(
        conversation.matchedUser.name,
        'Choose what you want to do with this chat.',
        [
          {
            text: conversation.isMuted ? 'Unmute chat' : 'Mute chat',
            onPress: () => {
              void toggleMuteConversation(conversation);
            },
          },
          {
            text: 'Clear chat',
            onPress: () => {
              Alert.alert(
                'Clear chat?',
                'This removes the message history for you only. New messages can still arrive later.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      const previous = conversation;
                      setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
                      void (async () => {
                        const result = await clearMessagesForMe(conversation.id);
                        if (!result.ok) {
                          setConversations((prev) => {
                            if (prev.some((item) => item.id === previous.id)) return prev;
                            return [...prev, previous].sort(
                              (a, b) => b.lastMessage.timestamp.getTime() - a.lastMessage.timestamp.getTime(),
                            );
                          });
                          Alert.alert('Clear chat', 'Unable to clear this chat right now.');
                          return;
                        }
                        void haptics.medium();
                      })();
                    },
                  },
                ],
              );
            },
          },
          {
            text: conversation.blockStatus === 'blocked_by_me' ? 'Unblock user' : 'Block user',
            style: conversation.blockStatus === 'blocked_by_me' ? 'default' : 'destructive',
            onPress: () => {
              if (conversation.blockStatus === 'blocked_by_me') {
                Alert.alert('Unblock user?', 'You will be able to message each other again.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Unblock',
                    onPress: () => {
                      void unblockConversationUser(conversation);
                    },
                  },
                ]);
                return;
              }

              Alert.alert(
                'Block user?',
                'They will not be able to message you, and they will not be notified.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Block',
                    style: 'destructive',
                    onPress: () => {
                      void blockConversationUser(conversation);
                    },
                  },
                ],
              );
            },
          },
          {
            text: 'Report user',
            onPress: () => {
              openReportReasonSheet(conversation);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    },
    [
      blockConversationUser,
      clearMessagesForMe,
      openReportReasonSheet,
      setConversations,
      toggleMuteConversation,
      unblockConversationUser,
    ],
  );

  const handleArchiveConversation = useCallback(
    async (conversation: TConversation) => {
      const peerUserId = getConversationPeerUserId(conversation);
      const nextArchived = !conversation.isArchived;

      setConversations((prev) =>
        prev.map((item) =>
          item.id === conversation.id
            ? { ...item, isArchived: nextArchived, isPinned: nextArchived ? false : item.isPinned }
            : item,
        ),
      );
      if (userId) {
        void ChatRepository.updateThreadPreferences(userId, peerUserId, {
          archived: nextArchived,
          pinned: nextArchived ? false : conversation.isPinned,
        });
      }

      if (nextArchived && conversation.isPinned) {
        void setPeerPinState(peerUserId, false, conversation.isMuted);
      }

      const { error } = await savePeerVisibilityPref(peerUserId, {
        archived: nextArchived,
        hidden: false,
      });
      if (error) {
        console.log('[chat] peer visibility archive upsert error', error);
        setConversations((prev) =>
          prev.map((item) =>
            item.id === conversation.id
              ? { ...item, isArchived: conversation.isArchived, isPinned: conversation.isPinned }
              : item,
          ),
        );
        if (userId) {
          void ChatRepository.updateThreadPreferences(userId, peerUserId, {
            archived: conversation.isArchived,
            pinned: conversation.isPinned,
          });
        }
        Alert.alert('Archive chat', 'Unable to update this chat right now.');
        return;
      }

      void haptics.tap();
    },
    [getConversationPeerUserId, savePeerVisibilityPref, setConversations, setPeerPinState, userId],
  );

  const handleRemoveConversation = useCallback(
    (conversation: TConversation) => {
      const title = conversation.peerHasLeft ? 'Remove Left Betweener?' : 'Remove conversation?';
      const message = conversation.peerHasLeft
        ? 'This removes their old thread and related leftovers from your app.'
        : 'This removes this conversation from your app only. It does not delete anything for the other person.';

      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: conversation.peerHasLeft ? 'Remove' : 'Delete',
          style: 'destructive',
          onPress: () => {
            const previous = conversation;
            const peerUserId = getConversationPeerUserId(conversation);
            setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
            void (async () => {
              const result = await clearConversationForMe(peerUserId);
              if (!result.ok) {
                setConversations((prev) => {
                  if (prev.some((item) => item.id === previous.id)) return prev;
                  return [...prev, previous].sort(
                    (a, b) => b.lastMessage.timestamp.getTime() - a.lastMessage.timestamp.getTime(),
                  );
                });
                Alert.alert('Remove conversation', 'Unable to remove this conversation right now.');
                return;
              }
              void haptics.medium();
            })();
          },
        },
      ]);
    },
    [clearConversationForMe, getConversationPeerUserId, setConversations],
  );

  const togglePin = useCallback(
    (conversationId: string) => {
      const current = conversations.find((conversation) => conversation.id === conversationId);
      const peerUserId = current ? getConversationPeerUserId(current) : conversationId;
      const nextPinned = !Boolean(current?.isPinned);
      const nextMuted = Boolean(current?.isMuted);
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, isPinned: !conversation.isPinned }
            : conversation,
        ),
      );
      void (async () => {
        if (!userId) return;
        await ChatRepository.updateThreadPreferences(userId, peerUserId, { pinned: nextPinned });
        const { error } = await upsertChatPref(userId, peerUserId, {
          pinned: nextPinned,
          muted: nextMuted,
        });
        if (error) {
          console.log('[chat] chat prefs pin upsert error', error);
        }
      })();
    },
    [conversations, getConversationPeerUserId, setConversations, userId],
  );

  return {
    clearConversationForMe,
    clearMessagesForMe,
    toggleMuteConversation,
    blockConversationUser,
    unblockConversationUser,
    reportConversationUser,
    openReportReasonSheet,
    openConversationMoreActions,
    handleArchiveConversation,
    handleRemoveConversation,
    togglePin,
  };
};
