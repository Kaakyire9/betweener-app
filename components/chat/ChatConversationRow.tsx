import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Pressable, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useRef } from "react";

import { Colors } from "@/constants/theme";
import { haptics } from "@/lib/haptics";
import { getProfileInitials } from "@/lib/profile-placeholders";
import {
  type ChatConversationRowItem,
  useChatListRowPresentation,
} from "@/lib/chat/hooks/use-chat-list-row-presentation";

type ChatConversationRowProps = {
  item: ChatConversationRowItem;
  userId?: string | null;
  presenceNow: number;
  typingExpiresAtByPeer: Record<string, number>;
  activeMomentPeerUserIds: Set<string>;
  failedAvatarUris: Record<string, string>;
  theme: {
    tint: string;
    accent: string;
    textMuted: string;
  };
  isDark: boolean;
  styles: Record<string, any>;
  blockedAvatarSource: any;
  onMarkAvatarFailed: (peerId: string, avatarUri: string | null) => void;
  onOpenConversation: (conversation: ChatConversationRowItem) => void;
  onTogglePin: (conversationId: string) => void;
  onArchiveConversation: (conversation: ChatConversationRowItem) => Promise<void>;
  onOpenConversationMoreActions: (conversation: ChatConversationRowItem) => void;
  onRemoveConversation: (conversation: ChatConversationRowItem) => void;
};

export function ChatConversationRow({
  item,
  userId,
  presenceNow,
  typingExpiresAtByPeer,
  activeMomentPeerUserIds,
  failedAvatarUris,
  theme,
  isDark,
  styles,
  blockedAvatarSource,
  onMarkAvatarFailed,
  onOpenConversation,
  onTogglePin,
  onArchiveConversation,
  onOpenConversationMoreActions,
  onRemoveConversation,
}: ChatConversationRowProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const swipeActionBusyRef = useRef(false);
  const {
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
    formattedTime,
  } = useChatListRowPresentation({
    item,
    userId,
    presenceNow,
    typingExpiresAtByPeer,
    activeMomentPeerUserIds,
    failedAvatarUris,
    theme,
    isDark,
  });

  const avatarNode = isBlocked ? (
    <Image source={blockedAvatarSource} style={styles.conversationAvatar} />
  ) : !shouldUseFallbackAvatar ? (
    <ExpoImage
      source={{ uri: avatarUri }}
      style={styles.conversationAvatar}
      cachePolicy="disk"
      contentFit="cover"
      transition={0}
      onError={() => onMarkAvatarFailed(item.id, avatarUri)}
    />
  ) : (
    <LinearGradient
      colors={
        isLeftBetweener
          ? [isDark ? '#6E5B4B' : '#A18873', isDark ? '#8B7662' : '#C7B8A5']
          : [avatarPalette.start, avatarPalette.end]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.conversationAvatar,
        styles.avatarFallback,
        isLeftBetweener && styles.avatarFallbackLeft,
      ]}
    >
      <Text style={styles.avatarFallbackText}>{getProfileInitials(item.matchedUser.name)}</Text>
    </LinearGradient>
  );

  const avatarContent =
    !isBlocked && hasActiveMoment && !isLeftBetweener ? (
      <LinearGradient
        colors={['#f59e0b', '#f43f5e', '#22d3ee']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.avatarRingMoment, isUnread && styles.avatarRingMomentUnread]}
      >
        <View style={styles.avatarRingMomentInner}>{avatarNode}</View>
        <View style={styles.momentBadge}>
          <MaterialCommunityIcons name="star-four-points" size={11} color={Colors.light.background} />
        </View>
      </LinearGradient>
    ) : !isBlocked && isUnread && !isLeftBetweener ? (
      <LinearGradient
        colors={[theme.tint, theme.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.avatarRingUnread}
      >
        <View style={styles.avatarRingInner}>{avatarNode}</View>
      </LinearGradient>
    ) : (
      <View style={[styles.avatarRing, isLeftBetweener && styles.avatarRingLeft]}>{avatarNode}</View>
    );

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={72}
      rightThreshold={72}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableOpen={(direction) => {
        if (swipeActionBusyRef.current) return;
        swipeActionBusyRef.current = true;
        if (direction === 'left') {
          swipeableRef.current?.close();
          void onArchiveConversation(item).finally(() => {
            swipeActionBusyRef.current = false;
          });
          return;
        }
        swipeableRef.current?.close();
        if (item.peerHasLeft) {
          onRemoveConversation(item);
        } else {
          onOpenConversationMoreActions(item);
        }
        setTimeout(() => {
          swipeActionBusyRef.current = false;
        }, 500);
      }}
      renderLeftActions={() => (
        <View style={[styles.swipeActionRail, styles.swipeActionRailLeft]}>
          <Pressable
            style={[styles.swipeAction, styles.archiveAction]}
            onPress={() => {
              swipeableRef.current?.close();
              void onArchiveConversation(item);
            }}
          >
            <MaterialCommunityIcons
              name={item.isArchived ? 'archive-arrow-up-outline' : 'archive-arrow-down-outline'}
              size={20}
              color={Colors.light.background}
            />
            <Text style={styles.swipeActionText}>{item.isArchived ? 'Return' : 'Archive'}</Text>
          </Pressable>
        </View>
      )}
      renderRightActions={() => (
        <View style={[styles.swipeActionRail, styles.swipeActionRailRight]}>
          <Pressable
            style={[styles.swipeAction, item.peerHasLeft ? styles.removeAction : styles.moreAction]}
            onPress={() => {
              swipeableRef.current?.close();
              if (item.peerHasLeft) {
                onRemoveConversation(item);
                return;
              }
              onOpenConversationMoreActions(item);
            }}
          >
            <MaterialCommunityIcons
              name={item.peerHasLeft ? 'trash-can-outline' : 'dots-horizontal-circle-outline'}
              size={20}
              color={Colors.light.background}
            />
            <Text style={styles.swipeActionText}>{item.peerHasLeft ? 'Remove' : 'More'}</Text>
          </Pressable>
        </View>
      )}
    >
      <Pressable
        style={({ pressed }) => [
          styles.conversationItem,
          item.isPinned && styles.pinnedConversation,
          item.isArchived && styles.archivedConversation,
          isLeftBetweener && styles.leftConversation,
          isUnread && styles.unreadConversation,
          pressed && styles.conversationItemPressed,
        ]}
        onPress={() => {
          void haptics.tap();
          onOpenConversation(item);
        }}
        onLongPress={() => {
          if (!item.isArchived) onTogglePin(item.id);
        }}
      >
        <View style={styles.conversationLeft}>
          <View style={styles.avatarContainer}>
            {avatarContent}
            {isOnline ? <View style={styles.onlineIndicator} /> : null}
            {item.isPinned && !item.isArchived ? (
              <View style={styles.pinIndicator}>
                <MaterialCommunityIcons name="pin" size={10} color={Colors.light.background} />
              </View>
            ) : null}
            {item.isArchived ? (
              <View style={styles.archivedIndicator}>
                <MaterialCommunityIcons name="archive-outline" size={10} color={Colors.light.background} />
              </View>
            ) : null}
          </View>

          <View style={styles.conversationContent}>
            <View style={styles.conversationHeader}>
              <Text
                style={[
                  styles.conversationName,
                  isLeftBetweener && styles.leftConversationName,
                  isUnread && styles.unreadName,
                ]}
              >
                {item.matchedUser.name}
              </Text>
              <View style={styles.conversationHeaderIcons}>
                {isLeftBetweener ? <Text style={styles.leftStateLabel}>No longer on Betweener</Text> : null}
                {item.isArchived ? <Text style={styles.archivedMetaLabel}>Archived</Text> : null}
                {item.isMuted ? (
                  <MaterialCommunityIcons
                    name="volume-off"
                    size={14}
                    color={theme.textMuted}
                    style={styles.mutedIcon}
                  />
                ) : null}
              </View>
            </View>

            <View style={styles.conversationPreview}>
              <View style={styles.lastMessageRow}>
                {isMyLastMessage && !isTyping ? (
                  <MaterialCommunityIcons
                    name={receiptIcon?.name || 'check'}
                    size={16}
                    color={receiptIcon?.color || theme.textMuted}
                    style={styles.readReceiptIcon}
                  />
                ) : null}
                <Text
                  style={[
                    styles.lastMessage,
                    isLeftBetweener && styles.leftConversationPreviewText,
                    isTyping && styles.typingText,
                    isUnread && styles.unreadMessage,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {previewText}
                </Text>
              </View>

              <View style={styles.conversationMeta}>
                <Text style={styles.conversationTime}>{formattedTime}</Text>
                {item.unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadCount}>{item.unreadCount > 9 ? '9+' : item.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}
