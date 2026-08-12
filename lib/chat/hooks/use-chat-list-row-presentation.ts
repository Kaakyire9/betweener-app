import { useMemo } from "react";

import { getChatMessagePreviewText } from "@/lib/message-preview";
import { getProfilePlaceholderPalette } from "@/lib/profile-placeholders";
import { getAuthoritativePresenceDisplay } from "@/lib/presence";
import {
  formatConversationPreview,
  resolveChatListPreview,
} from "@/lib/chat/chat-list-preview";

type MessageType = 'text' | 'voice' | 'image' | 'mood_sticker' | 'video' | 'document' | 'location';
type LocalStatus = 'deleted' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

type ThemePalette = {
  tint: string;
  accent: string;
  textMuted: string;
};

export type ChatConversationRowItem = {
  id: string;
  isArchived: boolean;
  isPinned: boolean;
  isMuted: boolean;
  unreadCount: number;
  peerHasLeft: boolean;
  blockStatus?: 'blocked_by_me' | 'blocked_me' | null;
  latestActivity?: {
    kind: 'edit' | 'reaction';
    messageId: string;
    preview: string;
    createdAt: Date;
  } | null;
  matchedUser: {
    id: string;
    name: string;
    avatar_url: string;
    isOnline: boolean;
    lastSeen: Date;
  };
  lastMessage: {
    id: string;
    text: string;
    timestamp: Date;
    senderId: string;
    type: MessageType;
    isViewOnce?: boolean;
    isRead: boolean;
    deliveredAt: Date | null;
    editedAt?: Date | null;
    localStatus?: LocalStatus;
    deletedForAll?: boolean;
    reactionPreview?: {
      emoji: string;
      userId: string;
      createdAt: Date;
      targetType?: MessageType;
    };
  };
};

type UseChatListRowPresentationArgs = {
  item: ChatConversationRowItem;
  userId?: string | null;
  presenceNow: number;
  typingExpiresAtByPeer: Record<string, number>;
  activeMomentPeerUserIds: Set<string>;
  failedAvatarUris: Record<string, string>;
  theme: ThemePalette;
  isDark: boolean;
};

const getConversationReceiptIconState = (
  lastMessage: ChatConversationRowItem['lastMessage'],
  theme: ThemePalette,
  isDark: boolean,
) => {
  if (lastMessage.localStatus === 'failed') {
    return { name: 'alert-circle-outline' as const, color: isDark ? '#FF908B' : '#D14343' };
  }
  if (lastMessage.localStatus === 'queued' || lastMessage.localStatus === 'sending') {
    return { name: 'clock-outline' as const, color: isDark ? '#CFE1DD' : '#8A9895' };
  }
  if (lastMessage.isRead) {
    return { name: 'check-all' as const, color: theme.tint };
  }
  if (lastMessage.deliveredAt) {
    return { name: 'check-all' as const, color: isDark ? '#AAB8B4' : '#8A9895' };
  }
  return { name: 'check' as const, color: isDark ? '#AAB8B4' : '#8A9895' };
};

const formatLastMessageTime = (date: Date) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  const sameYear = now.getFullYear() === date.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : '2-digit',
  });
};

const getLastMessagePreview = (lastMessage: ChatConversationRowItem['lastMessage']) => {
  return (
    getChatMessagePreviewText({
      text: lastMessage.text,
      messageType: lastMessage.type,
      isViewOnce: Boolean(lastMessage.isViewOnce),
      status: lastMessage.localStatus,
    }) || lastMessage.text
  );
};

const getLastMessageReactionPreview = (
  lastMessage: ChatConversationRowItem['lastMessage'],
  matchedName: string,
  currentUserId: string,
) => {
  const reaction = lastMessage.reactionPreview;
  if (!reaction?.emoji) return null;
  const name = reaction.userId === currentUserId ? 'You' : matchedName || 'Someone';
  const reactionTargetType = reaction.targetType ?? lastMessage.type;
  const target = (() => {
    switch (reactionTargetType) {
      case 'image':
        return 'photo';
      case 'video':
        return 'video';
      case 'voice':
        return 'voice note';
      case 'document':
        return 'document';
      case 'location':
        return 'location';
      case 'mood_sticker':
        return 'sticker';
      default:
        return 'message';
    }
  })();
  return `${name} reacted ${reaction.emoji} to ${target}`;
};

export const useChatListRowPresentation = ({
  item,
  userId,
  presenceNow,
  typingExpiresAtByPeer,
  activeMomentPeerUserIds,
  failedAvatarUris,
  theme,
  isDark,
}: UseChatListRowPresentationArgs) => {
  return useMemo(() => {
    const isBlocked = Boolean(item.blockStatus);
    const isLeftBetweener = item.peerHasLeft && !isBlocked;
    const isUnread = item.unreadCount > 0;
    const hasActiveMoment = activeMomentPeerUserIds.has(String(item.id));
    const isMyLastMessage = item.lastMessage.senderId === (userId || '');
    const isLastMessageDeleted =
      item.lastMessage.deletedForAll ||
      item.lastMessage.localStatus === 'deleted';
    const peerPresence = getAuthoritativePresenceDisplay(
      item.matchedUser.isOnline,
      item.matchedUser.lastSeen?.toISOString?.() ?? null,
      presenceNow,
    );
    const isOnline = !isBlocked && peerPresence.online;
    const receiptIcon = isMyLastMessage ? getConversationReceiptIconState(item.lastMessage, theme, isDark) : null;
    const reactionPreview = isLastMessageDeleted
      ? null
      : getLastMessageReactionPreview(item.lastMessage, item.matchedUser.name, userId || '');
    const isTyping =
      !isBlocked &&
      !isLeftBetweener &&
      Boolean(typingExpiresAtByPeer[item.id] && typingExpiresAtByPeer[item.id] > Date.now());
    const messagePreview = getLastMessagePreview(item.lastMessage);
    const { previewText: normalPreviewText } = resolveChatListPreview({
      messagePreview,
      editedAt: isLastMessageDeleted ? null : item.lastMessage.editedAt,
      reactionPreview:
        reactionPreview && item.lastMessage.reactionPreview
          ? {
              text: reactionPreview,
              createdAt: item.lastMessage.reactionPreview.createdAt,
            }
          : null,
      isTyping,
    });
    const previewText = isTyping
      ? 'Typing...'
      : formatConversationPreview({
          messagePreview: normalPreviewText,
          latestActivity: isLastMessageDeleted ? null : item.latestActivity,
          reactionEmoji: item.lastMessage.reactionPreview?.emoji,
          reactionUserId: item.lastMessage.reactionPreview?.userId,
          currentUserId: userId,
        });
    const avatarUri = item.matchedUser.avatar_url || null;
    const shouldUseFallbackAvatar = !avatarUri || failedAvatarUris[item.id] === avatarUri;
    const avatarPalette = getProfilePlaceholderPalette(item.matchedUser.id || item.matchedUser.name);

    return {
      isBlocked,
      isLeftBetweener,
      isUnread,
      hasActiveMoment,
      isMyLastMessage,
      isOnline,
      receiptIcon,
      isTyping,
      previewText,
      avatarUri,
      shouldUseFallbackAvatar,
      avatarPalette,
      formattedTime: formatLastMessageTime(
        item.latestActivity?.kind === 'reaction' &&
          item.latestActivity.createdAt.getTime() >
            item.lastMessage.timestamp.getTime()
          ? item.latestActivity.createdAt
          : item.lastMessage.timestamp,
      ),
    };
  }, [
    activeMomentPeerUserIds,
    failedAvatarUris,
    isDark,
    item,
    presenceNow,
    theme,
    typingExpiresAtByPeer,
    userId,
  ]);
};
