import ChatFailedRetryHint from '@/components/chat/ChatFailedRetryHint';
import ChatMessageBubblePressable from '@/components/chat/ChatMessageBubblePressable';
import ChatQuickReactionsBar from '@/components/chat/ChatQuickReactionsBar';
import { areMessageRowPropsEqual } from '@/components/chat/message-row-memo';
import type { MessageRowItemProps } from '@/components/chat/message-row-contract';
import { DatePlanMessageContent } from '@/components/chat/message-variants/DatePlanMessageContent';
import { DocumentMessageContent, LocationMessageContent, MediaMessageContent, VoiceMessageContent } from '@/components/chat/message-variants';
import { getReceiptIconState } from '@/components/chat/message-variants/shared';
import type { MessageType } from '@/components/chat/types';
import { BLOCKED_AVATAR_SOURCE, CHAT_BUBBLE_TAIL_PATH, QUICK_REACTIONS } from '@/constants/chat';
import { Colors } from '@/constants/theme';
import { withAlpha } from '@/lib/chat/ui/color-utils';
import { formatRemainingTime } from '@/lib/chat/ui/message-formatters';
import { resolveChatImageUri, resolveChatVideoUri } from '@/lib/chat/media-uri';
import { canRetryFailedTextMessage } from '@/lib/chat/thread-behavior';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Linking, Pressable, Text, View } from 'react-native';
import RNSvg, { Path } from 'react-native-svg';

type ReplyMeta = {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  preview: string;
  time: string;
  canJump: boolean;
  thumbnailUri?: string | null;
  thumbnailKind?: 'image' | 'video' | 'location' | 'date_plan' | null;
};

export const MessageRowItem = memo(
  ({
    item,
    isMyMessage,
    showAvatar,
    showAvatarSpacer,
    isGroupedWithPrev,
    isGroupedWithNext,
    shouldAnimateEntry,
    isPlaying,
    isReactionOpen,
    isFocused,
    focusToken,
    timeLabel,
    userAvatar,
    currentUserId,
    peerName,
    imageSize,
    cachedImageUrl,
    cachedVideoUrl,
    mediaUrisByPath,
    mediaFailure,
    theme,
    isDark,
    styles,
    onLongPress,
    onRetryFailedMessage,
    onToggleVoice,
    onFocus,
    onReply,
    onReplyJump,
    onEditMessage,
    onAddReaction,
    onCloseReactions,
    onOpenEditHistory,
    onCopyMessage,
    onTogglePin,
    onDeleteMessage,
    isActionPinned,
    onOpenReactionSheet,
    onViewImage,
    onViewVideo,
    onOpenDocument,
    onRefreshMedia,
    onMediaLoadSuccess,
    onRetryMedia,
    onOpenLocation,
    onStopLiveShare,
    onOpenViewOnce,
    onAcceptDatePlan,
    onSuggestAnotherTime,
    onSuggestAnotherPlace,
    onSuggestBoth,
    onRescheduleDatePlan,
    onCancelDatePlan,
    onRequestDatePlanConcierge,
    onAddDatePlanToCalendar,
    datePlanActionId,
    datePlanCalendarActionId,
      viewOnceViewedByMe,
      viewOnceViewedByPeer,
      highlightQuery,
      onHighlightPress,
    }: MessageRowItemProps) => {
    const isSystemRow = item.type === 'system' || item.isSystem;
    const focusPulse = useRef(new Animated.Value(0)).current;
    const accent = isMyMessage ? Colors.light.background : theme.tint;
    const reactionEntrance = useRef(new Animated.Value(item.reactions.length > 0 ? 1 : 0)).current;
    const previousReactionCount = useRef(item.reactions.length);
    const entryAnim = useRef(new Animated.Value(shouldAnimateEntry ? 0 : 1)).current;
    const receiptPulse = useRef(new Animated.Value(1)).current;
    const reactionBubblePulse = useRef(new Animated.Value(1)).current;
    const previousReceiptStatus = useRef(item.status);
    const focusPulseStyle = useMemo(() => ({
      opacity: focusPulse,
      transform: [
        {
          scale: focusPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.02],
          }),
        },
      ],
      borderColor: withAlpha(accent, isMyMessage ? 0.65 : 0.5),
      shadowColor: accent,
      shadowOpacity: isDark ? 0.2 : 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    }) as const, [accent, focusPulse, isDark, isMyMessage]);
    const focusTintStyle = useMemo(() => ({
      backgroundColor: withAlpha(accent, isMyMessage ? 0.12 : isDark ? 0.16 : 0.1),
    }) as const, [accent, isDark, isMyMessage]);
    const receiptIcon = isMyMessage ? getReceiptIconState(item.status, isDark) : null;
    const viewOnceReceiptIcon = useMemo(() => {
      if (!isMyMessage) return null;
      if (viewOnceViewedByPeer) {
        return getReceiptIconState('read', isDark);
      }
      return receiptIcon;
    }, [isDark, isMyMessage, receiptIcon, viewOnceViewedByPeer]);
    const receiptBadgeToneStyle = useMemo(() => {
      if (!isMyMessage) return null;
      switch (item.status) {
        case 'read':
          return styles.receiptMetaBadgeRead;
        case 'delivered':
          return styles.receiptMetaBadgeDelivered;
        case 'sent':
          return styles.receiptMetaBadgeSent;
        default:
          return styles.receiptMetaBadgeSent;
      }
    }, [isMyMessage, item.status, styles.receiptMetaBadgeDelivered, styles.receiptMetaBadgeRead, styles.receiptMetaBadgeSent]);
    const viewOnceReceiptBadgeToneStyle = useMemo(() => {
      if (!isMyMessage) return null;
      if (viewOnceViewedByPeer) {
        return styles.receiptMetaBadgeRead;
      }
      return receiptBadgeToneStyle;
    }, [isMyMessage, receiptBadgeToneStyle, styles.receiptMetaBadgeRead, viewOnceViewedByPeer]);
    const rowSpotlightStyle = useMemo(() => ({
      opacity: focusPulse,
    }) as const, [focusPulse]);
    const rowTintStyle = useMemo(() => ({
      backgroundColor: withAlpha(accent, isMyMessage ? 0.06 : isDark ? 0.08 : 0.04),
    }) as const, [accent, isDark, isMyMessage]);
    const bubbleTailFill = item.deletedForAll
      ? withAlpha(theme.backgroundSubtle, isDark ? 0.6 : 0.85)
      : isMyMessage
        ? theme.tint
        : theme.backgroundSubtle;
    const bubbleTailStroke = item.deletedForAll
      ? withAlpha(theme.text, isDark ? 0.12 : 0.08)
      : isMyMessage
        ? withAlpha(Colors.light.background, 0.08)
        : withAlpha(theme.text, isDark ? 0.08 : 0.05);
    const bubbleTailStrokeWidth = item.deletedForAll ? 0.75 : 0.45;
    const textInlineMetaStyle = useMemo(() => ([
      styles.inlineMetaRowText,
      isMyMessage ? styles.inlineMetaRowTextMy : styles.inlineMetaRowTextTheir,
    ]), [isMyMessage, styles.inlineMetaRowText, styles.inlineMetaRowTextMy, styles.inlineMetaRowTextTheir]);
    const inlineReceiptIconColor = useMemo(() => {
      if (!isMyMessage) return receiptIcon?.color || '#C6D7D3';
      if (item.status === 'read') {
        return isDark
          ? withAlpha(Colors.light.background, 0.9)
          : '#D8FFFC';
      }
      return isDark
        ? withAlpha(Colors.light.background, 0.66)
        : withAlpha(Colors.light.background, 0.72);
    }, [isDark, isMyMessage, item.status, receiptIcon?.color]);
    const inlineReceiptIconSize = Math.max((receiptIcon?.size || 13) - 1, 11);
    const reactionEntranceStyle = useMemo(() => ({
      opacity: reactionEntrance,
      transform: [
        {
          translateY: reactionEntrance.interpolate({
            inputRange: [0, 1],
            outputRange: [10, 0],
          }),
        },
        {
          scale: reactionEntrance.interpolate({
            inputRange: [0, 1],
            outputRange: [0.86, 1],
          }),
        },
      ],
    }) as const, [reactionEntrance]);
    const rowEntranceStyle = useMemo(() => ({
      opacity: entryAnim,
      transform: [
        {
          translateY: entryAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [12, 0],
          }),
        },
        {
          translateX: entryAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [isMyMessage ? 10 : -10, 0],
          }),
        },
        {
          scale: entryAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.985, 1],
          }),
        },
      ],
    }) as const, [entryAnim, isMyMessage]);
    const receiptPulseStyle = useMemo(() => ({
      transform: [{ scale: receiptPulse }],
      opacity: receiptPulse.interpolate({
        inputRange: [0.94, 1, 1.08],
        outputRange: [0.88, 1, 1],
      }),
    }) as const, [receiptPulse]);
    const reactionBubblePulseStyle = useMemo(() => ({
      transform: [{ scale: reactionBubblePulse }],
    }) as const, [reactionBubblePulse]);
    const rowVignetteColor = useMemo(
      () => withAlpha(theme.text, isDark ? 0.22 : 0.1),
      [isDark, theme.text]
    );

    useEffect(() => {
      if (!shouldAnimateEntry) {
        entryAnim.setValue(1);
        return;
      }
      entryAnim.stopAnimation();
      entryAnim.setValue(0);
      Animated.spring(entryAnim, {
        toValue: 1,
        friction: 9,
        tension: 84,
        useNativeDriver: true,
      }).start();
    }, [entryAnim, shouldAnimateEntry]);

    useEffect(() => {
      if (!isFocused) return;
      focusPulse.stopAnimation();
      focusPulse.setValue(0);
      Animated.sequence([
        Animated.timing(focusPulse, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(focusPulse, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    }, [focusPulse, focusToken, isFocused]);

    useEffect(() => {
      if (!isMyMessage) {
        previousReceiptStatus.current = item.status;
        return;
      }
      if (previousReceiptStatus.current === item.status) return;
      receiptPulse.stopAnimation();
      receiptPulse.setValue(0.94);
      Animated.sequence([
        Animated.timing(receiptPulse, {
          toValue: 1.08,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(receiptPulse, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      previousReceiptStatus.current = item.status;
    }, [isMyMessage, item.status, receiptPulse]);

    useEffect(() => {
      if (item.reactions.length === 0) {
        reactionEntrance.setValue(0);
        reactionBubblePulse.setValue(1);
        previousReactionCount.current = 0;
        return;
      }

      if (previousReactionCount.current !== item.reactions.length) {
        reactionEntrance.stopAnimation();
        reactionEntrance.setValue(0);
        reactionBubblePulse.stopAnimation();
        reactionBubblePulse.setValue(0.985);
        Animated.spring(reactionEntrance, {
          toValue: 1,
          friction: 8,
          tension: 68,
          useNativeDriver: true,
        }).start();
        Animated.sequence([
          Animated.timing(reactionBubblePulse, {
            toValue: 1.028,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(reactionBubblePulse, {
            toValue: 1,
            duration: 170,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        reactionEntrance.setValue(1);
        reactionBubblePulse.setValue(1);
      }

      previousReactionCount.current = item.reactions.length;
    }, [item.reactions.length, reactionBubblePulse, reactionEntrance]);

    const metaLabel = timeLabel;

    const reactionNodes = useMemo(() => {
      if (item.deletedForAll) return null;
      if (item.reactions.length === 0) return null;
      const counts = new Map<string, number>();
      item.reactions.forEach((reaction) => {
        counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
      });
      const summary = Array.from(counts.entries())
        .map(([emoji, count]) => ({ emoji, count }))
        .sort((a, b) => b.count - a.count);
      return (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.reactionSummary,
            isMyMessage ? styles.reactionSummaryRight : styles.reactionSummaryLeft,
            reactionEntranceStyle,
          ] as any}
        >
          <Pressable
            style={styles.reactionSummaryPressable}
            onPress={() => onOpenReactionSheet(item)}
          >
            {summary.map(({ emoji, count }) => (
              <View key={`${emoji}-${count}`} style={styles.reactionSummaryItem}>
                <Text style={styles.reactionSummaryEmoji}>{emoji}</Text>
                {count > 1 ? (
                  <Text style={styles.reactionSummaryCount}>{count}</Text>
                ) : null}
              </View>
            ))}
          </Pressable>
        </Animated.View>
      );
    }, [item.deletedForAll, item.reactions, isMyMessage, onOpenReactionSheet, reactionEntranceStyle, styles]);
    const hasReactionSummary = !item.deletedForAll && item.reactions.length > 0;

    const canEdit = useMemo(
      () =>
        isMyMessage &&
        item.type === 'text' &&
        !item.deletedForAll &&
        !item.id.startsWith('temp-'),
      [isMyMessage, item.deletedForAll, item.id, item.type]
    );
    const canRetryFailedText = useMemo(
      () =>
        canRetryFailedTextMessage({ item, isMyMessage }) ||
        (
          isMyMessage &&
          item.status === 'failed' &&
          !item.deletedForAll &&
          (item.type === 'image' ||
            item.type === 'video' ||
            item.type === 'document' ||
            item.type === 'voice')
        ),
      [isMyMessage, item]
    );

    const showEdited = Boolean(item.editedAt) && !item.deletedForAll;
    const isEncryptedViewOnce = Boolean(
      item.isViewOnce && item.encryptedMedia && (item.type === 'image' || item.type === 'video')
    );
    const canOpenViewOnce = !isMyMessage && !viewOnceViewedByMe && isEncryptedViewOnce;
    const mediaLabel = item.type === 'video' ? 'Video' : 'Photo';
    const viewOnceTitle = isMyMessage
      ? viewOnceViewedByPeer
        ? 'Opened'
        : mediaLabel
      : viewOnceViewedByMe
      ? 'Viewed'
      : mediaLabel;

    const replyMeta = useMemo<ReplyMeta | null>(() => {
      if (!item.replyTo) {
        if (!item.replyToId) return null;
        return {
          icon: 'reply' as ReplyMeta['icon'],
          label: 'Reply',
          preview: 'Original message unavailable',
          time: '',
          canJump: false,
        };
      }
      const replyTime = item.replyTo.timestamp.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      if (item.replyTo.deletedForAll) {
        return {
          icon: 'message-bulleted-off' as ReplyMeta['icon'],
          label: item.replyTo.senderId === currentUserId ? 'You' : peerName || 'User',
          preview: 'Message deleted',
          time: replyTime,
          canJump: true,
        };
      }
      const iconMap: Record<MessageType['type'], ReplyMeta['icon']> = {
        text: 'chat-outline',
        system: 'information-outline',
        voice: 'microphone-outline',
        image: 'image-outline',
        video: 'video-outline',
        document: 'file-document-outline',
        date_plan: 'calendar-heart',
        location: 'map-marker-outline',
        mood_sticker: 'emoticon-happy-outline',
      };
      let preview = '';
      let thumbnailUri: string | null = null;
      let thumbnailKind: ReplyMeta['thumbnailKind'] = null;
      switch (item.replyTo.type) {
        case 'text':
          preview = item.replyTo.text || 'Message';
          break;
        case 'system':
          preview = item.replyTo.text || 'System message';
          break;
        case 'voice':
          preview = 'Voice message';
          break;
        case 'image':
          preview = 'Photo';
          thumbnailUri = item.replyTo.offlineImageUri ?? item.replyTo.imageUrl ?? null;
          thumbnailKind = 'image';
          break;
        case 'video':
          preview = 'Video';
          thumbnailKind = 'video';
          break;
        case 'document':
          preview = item.replyTo.document?.name || 'Document';
          break;
        case 'date_plan':
          preview = item.replyTo.dateInvite?.placeName
            ? `Date: ${item.replyTo.dateInvite.placeName}`
            : 'Date plan';
          thumbnailUri = item.replyTo.dateInvite?.mapUrl ?? null;
          thumbnailKind = 'date_plan';
          break;
        case 'location':
          preview = item.replyTo.location?.label ? `Location: ${item.replyTo.location.label}` : 'Location';
          thumbnailUri = item.replyTo.location?.mapUrl ?? null;
          thumbnailKind = 'location';
          break;
        case 'mood_sticker':
          preview = item.replyTo.sticker?.name ? `Sticker: ${item.replyTo.sticker.name}` : 'Sticker';
          break;
        default:
          preview = 'Message';
      }
      if (item.replyTo.isViewOnce && (item.replyTo.type === 'image' || item.replyTo.type === 'video')) {
        const replyLabel = item.replyTo.type === 'video' ? 'View once video' : 'View once photo';
        return {
          icon: 'lock-outline' as ReplyMeta['icon'],
          label: item.replyTo.senderId === currentUserId ? 'You' : peerName || 'User',
          preview: replyLabel,
          time: replyTime,
          canJump: true,
          thumbnailUri: null,
          thumbnailKind: null,
        };
      }
      return {
        icon: iconMap[item.replyTo.type],
        label: item.replyTo.senderId === currentUserId ? 'You' : peerName || 'User',
        preview,
        time: replyTime,
        canJump: true,
        thumbnailUri,
        thumbnailKind,
      };
    }, [currentUserId, item.replyTo, item.replyToId, peerName]);

    const messageTextNode = useMemo(() => {
      const text = item.text || '';
      if (!text) return null;
      const baseStyle = [
        styles.messageText,
        styles.messageTextInline,
        isMyMessage ? styles.myMessageText : styles.theirMessageText,
        item.deletedForAll && styles.deletedMessageText,
      ];
      const query = highlightQuery?.trim();
      if (!query || item.deletedForAll) {
        return <Text style={baseStyle}>{text}</Text>;
      }
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'ig');
      const parts = text.split(regex);
      const matches = text.match(regex);
      if (!matches) {
        return <Text style={baseStyle}>{text}</Text>;
      }
      const nodes: ReactNode[] = [];
      parts.forEach((part, index) => {
        if (part) nodes.push(part);
        const match = matches[index];
        if (match) {
          nodes.push(
            <Text
              key={`${match}-${index}`}
              style={[
                styles.messageTextHighlight,
                isMyMessage ? styles.messageTextHighlightMy : styles.messageTextHighlightTheir,
              ]}
              onPress={() => onHighlightPress?.(item.id)}
            >
              {match}
            </Text>
          );
        }
      });
      return <Text style={baseStyle}>{nodes}</Text>;
    }, [highlightQuery, isMyMessage, item.deletedForAll, item.text, styles]);

    if (isSystemRow) {
      return (
        <View style={styles.systemRow}>
          <View style={styles.systemBubble}>
            <Text style={styles.systemText}>{item.text}</Text>
          </View>
        </View>
      );
    }

    return (
      <Animated.View
        style={[
          styles.messageContainer,
          isGroupedWithNext ? styles.messageContainerGrouped : null,
          hasReactionSummary ? styles.messageContainerWithReaction : null,
          rowEntranceStyle,
        ]}
      >
        {isFocused ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.messageRowSpotlight, rowSpotlightStyle]}
          >
            <BlurView
              intensity={16}
              tint={isDark ? 'dark' : 'light'}
              style={styles.messageRowSpotlightBlur}
            />
            <View style={[styles.messageRowSpotlightTint, rowTintStyle]} />
            <LinearGradient
              colors={[rowVignetteColor, 'transparent', rowVignetteColor]}
              start={[0, 0]}
              end={[0, 1]}
              style={styles.messageRowVignetteVertical}
            />
            <LinearGradient
              colors={[rowVignetteColor, 'transparent', rowVignetteColor]}
              start={[0, 0]}
              end={[1, 0]}
              style={styles.messageRowVignetteHorizontal}
            />
          </Animated.View>
        ) : null}
        <ChatMessageBubblePressable
          messageId={item.id}
          canRetryFailedText={canRetryFailedText}
          styles={styles}
          isMyMessage={isMyMessage}
          onFocus={onFocus}
          onRetryFailedMessage={onRetryFailedMessage}
          onLongPress={() => onLongPress(item.id)}
          onPressContent={() => {
            if (item.type === 'voice') {
              return;
            }
            const resolvedImageUri = resolveChatImageUri(item, cachedImageUrl);
            if (item.type === 'image' && (resolvedImageUri || item.storagePath)) {
              onViewImage(item, resolvedImageUri || '');
              return;
            }
            const resolvedVideoUri = resolveChatVideoUri(item, cachedVideoUrl);
            if (item.type === 'video' && (resolvedVideoUri || item.storagePath)) {
              onViewVideo(item, resolvedVideoUri || '');
              return;
            }
            if (item.type === 'document' && (item.document?.url || item.storagePath)) {
              onOpenDocument(item);
              return;
            }
            if (item.type === 'date_plan' && item.dateInvite?.mapLink) {
              Linking.openURL(item.dateInvite.mapLink).catch(() => {});
              return;
            }
            if (item.type === 'location' && item.location) {
              onOpenLocation(item);
            }
          }}
        >
          {showAvatar ? (
            userAvatar ? (
              <ExpoImage
                source={{ uri: userAvatar }}
                style={styles.messageAvatar}
                cachePolicy="disk"
                contentFit="cover"
                transition={0}
              />
            ) : (
              <Image
                source={BLOCKED_AVATAR_SOURCE}
                style={styles.messageAvatar}
              />
            )
            ) : showAvatarSpacer ? (
            <View style={styles.messageAvatarSpacer} />
          ) : null}

          <Animated.View style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessageBubble : styles.theirMessageBubble,
            isMyMessage
              ? (isGroupedWithPrev ? styles.myMessageBubbleGroupedTop : null)
              : (isGroupedWithPrev ? styles.theirMessageBubbleGroupedTop : null),
            isMyMessage
              ? (isGroupedWithNext ? styles.myMessageBubbleGroupedBottom : null)
              : (isGroupedWithNext ? styles.theirMessageBubbleGroupedBottom : null),
            item.deletedForAll && styles.deletedMessageBubble,
            item.type === 'mood_sticker' && styles.stickerBubble,
            item.type === 'mood_sticker' && (isMyMessage ? styles.stickerBubbleMy : styles.stickerBubbleTheir),
            item.type === 'voice' && styles.voiceBubble,
            item.type === 'image' && !isEncryptedViewOnce && styles.imageBubble,
            item.type === 'video' && !isEncryptedViewOnce && styles.videoBubble,
            item.type === 'document' && styles.documentBubble,
            item.type === 'date_plan' && (isMyMessage ? styles.datePlanBubbleMy : styles.datePlanBubbleTheir),
            item.type === 'date_plan' && styles.datePlanBubble,
            item.type === 'location' && styles.locationBubble,
            reactionBubblePulseStyle,
          ]}>
            {isFocused ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.messageFocusSpotlight, focusPulseStyle] as any}
              >
                <BlurView
                  intensity={18}
                  tint={isDark ? 'dark' : 'light'}
                  style={styles.messageFocusSpotlightBlur}
                />
                <View style={[styles.messageFocusSpotlightTint, focusTintStyle]} />
              </Animated.View>
            ) : null}
            {replyMeta && (
              <Pressable
                style={[
                  styles.replyChip,
                  isMyMessage ? styles.replyChipMy : styles.replyChipTheir,
                ]}
                onPress={() => {
                  if (!replyMeta.canJump || !item.replyTo?.id) return;
                  onReplyJump(item.replyTo.id);
                }}
              >
                <View
                  style={[
                    styles.replyChipLine,
                    isMyMessage ? styles.replyChipLineMy : styles.replyChipLineTheir,
                  ]}
                />
                {replyMeta.thumbnailKind ? (
                  <View
                    style={[
                      styles.replyChipThumb,
                      isMyMessage ? styles.replyChipThumbMy : styles.replyChipThumbTheir,
                    ]}
                  >
                    {replyMeta.thumbnailUri && replyMeta.thumbnailKind !== 'video' ? (
                      <ExpoImage
                        source={{ uri: replyMeta.thumbnailUri }}
                        style={styles.replyChipThumbImage}
                        cachePolicy="disk"
                        contentFit="cover"
                        transition={0}
                      />
                    ) : (
                      <View
                        style={[
                          styles.replyChipThumbFallback,
                          isMyMessage ? styles.replyChipThumbFallbackMy : styles.replyChipThumbFallbackTheir,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={
                            replyMeta.thumbnailKind === 'video'
                              ? 'play'
                              : replyMeta.thumbnailKind === 'location' || replyMeta.thumbnailKind === 'date_plan'
                                ? 'map-marker-outline'
                                : replyMeta.icon
                          }
                          size={16}
                          color={isMyMessage ? Colors.light.background : theme.text}
                        />
                      </View>
                    )}
                    {(replyMeta.thumbnailKind === 'video' ||
                      replyMeta.thumbnailKind === 'location' ||
                      replyMeta.thumbnailKind === 'date_plan') ? (
                      <View
                        style={[
                          styles.replyChipThumbOverlay,
                          isMyMessage ? styles.replyChipThumbOverlayMy : styles.replyChipThumbOverlayTheir,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={
                            replyMeta.thumbnailKind === 'video'
                              ? 'play'
                              : replyMeta.thumbnailKind === 'date_plan'
                                ? 'calendar-heart'
                                : 'navigation-variant-outline'
                          }
                          size={12}
                          color={isMyMessage ? Colors.light.background : theme.text}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.replyChipContent}>
                  <View style={styles.replyChipHeader}>
                    {!replyMeta.thumbnailKind ? (
                      <View
                        style={[
                          styles.replyChipIconWrap,
                          isMyMessage ? styles.replyChipIconWrapMy : styles.replyChipIconWrapTheir,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={replyMeta.icon}
                          size={12}
                          color={isMyMessage ? Colors.light.background : theme.text}
                        />
                      </View>
                    ) : null}
                    <Text
                      style={[
                        styles.replyChipLabel,
                        isMyMessage && styles.replyChipLabelMy,
                      ]}
                      numberOfLines={1}
                    >
                      {replyMeta.label}
                    </Text>
                    {replyMeta.time ? (
                      <Text
                        style={[
                          styles.replyChipTime,
                          isMyMessage && styles.replyChipTimeMy,
                        ]}
                      >
                        {replyMeta.time}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.replyChipPreview,
                      isMyMessage && styles.replyChipPreviewMy,
                    ]}
                    numberOfLines={2}
                  >
                    {replyMeta.preview}
                  </Text>
                </View>
              </Pressable>
            )}

            {item.type === 'text' ? (
              <View style={styles.textWithMeta}>
                {messageTextNode}
                <View
                  style={[
                    styles.inlineMetaRow,
                    textInlineMetaStyle,
                  ]}
                  pointerEvents={showEdited ? 'auto' : 'none'}
                >
                  {showEdited ? (
                    <Pressable
                      onPress={() => onOpenEditHistory(item)}
                      hitSlop={6}
                      style={styles.messageMetaEditedWrap}
                    >
                      <Text
                        style={[
                          styles.messageMetaEdited,
                          isMyMessage ? styles.messageMetaEditedMy : styles.messageMetaEditedTheir,
                        ]}
                      >
                        Edited
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text
                    style={[
                      styles.messageMetaText,
                      isMyMessage ? styles.messageMetaTextInlineMy : styles.messageMetaTextInlineTheir,
                    ]}
                  >
                    {metaLabel}
                  </Text>
                  {isMyMessage && (
                    <Animated.View style={receiptPulseStyle}>
                      <MaterialCommunityIcons
                        name={receiptIcon?.name || 'clock-outline'}
                        size={inlineReceiptIconSize}
                        color={inlineReceiptIconColor}
                        style={styles.inlineMetaIconText}
                      />
                    </Animated.View>
                  )}
                </View>
                <ChatFailedRetryHint
                  visible={canRetryFailedText}
                  isMyMessage={isMyMessage}
                  styles={styles}
                />
              </View>
            ) : isEncryptedViewOnce ? (
              <Pressable
                onPress={() => {
                  if (canOpenViewOnce) {
                    onOpenViewOnce(item);
                  }
                }}
                disabled={!canOpenViewOnce}
                style={styles.viewOnceInlineRow}
              >
                <View style={[
                  styles.viewOnceLockBadge,
                  isMyMessage ? styles.viewOnceLockBadgeMy : styles.viewOnceLockBadgeTheir,
                ]}>
                  <MaterialCommunityIcons
                    name="shield-lock-outline"
                    size={16}
                    color={isMyMessage ? Colors.light.background : theme.tint}
                  />
                </View>
                <Text
                  numberOfLines={1}
                    style={[
                      styles.viewOnceTitle,
                      isMyMessage
                        ? { color: Colors.light.background }
                        : styles.viewOnceTitleTheir,
                      styles.viewOnceTitleItalic,
                      styles.viewOnceInlineLabel,
                    ]}
                  >
                  {viewOnceTitle}
                </Text>
                <View
                  style={[
                    styles.viewOnceInlineMetaRow,
                    isMyMessage ? styles.receiptMetaBadge : null,
                    isMyMessage ? viewOnceReceiptBadgeToneStyle : null,
                  ]}
                  pointerEvents="none"
                >
                  <Text
                    style={[
                      styles.messageMetaText,
                      isMyMessage ? styles.messageMetaTextInlineMy : styles.messageMetaTextInlineTheir,
                    ]}
                  >
                    {metaLabel}
                  </Text>
                  {isMyMessage ? (
                    <Animated.View style={receiptPulseStyle}>
                      <MaterialCommunityIcons
                        name={viewOnceReceiptIcon?.name || 'clock-outline'}
                        size={inlineReceiptIconSize}
                        color={viewOnceReceiptIcon?.color || inlineReceiptIconColor}
                        style={styles.inlineMetaIconText}
                      />
                    </Animated.View>
                  ) : null}
                </View>
              </Pressable>
            ) : item.type === 'voice' ? (
              <VoiceMessageContent
                item={item}
                isMyMessage={isMyMessage}
                isPlaying={isPlaying}
                styles={styles}
                theme={theme}
                isDark={isDark}
                onToggleVoice={onToggleVoice}
              />
              ) : item.type === 'image' || item.type === 'video' ? (
                <MediaMessageContent
                  item={item}
                  isMyMessage={isMyMessage}
                  imageSize={imageSize}
                  cachedImageUrl={cachedImageUrl}
                  cachedVideoUrl={cachedVideoUrl}
                  mediaUrisByPath={mediaUrisByPath}
                  mediaFailure={mediaFailure}
                  timeLabel={metaLabel}
                  styles={styles}
                  theme={theme}
                  isDark={isDark}
                  receiptPulseStyle={receiptPulseStyle}
                  onMediaLoadError={onRefreshMedia}
                  onMediaLoadSuccess={onMediaLoadSuccess}
                  onRetryMedia={onRetryMedia}
                  onViewImage={onViewImage}
                />
              ) : item.type === 'date_plan' ? (
                <DatePlanMessageContent
                  item={item}
                  isMyMessage={isMyMessage}
                  userAvatar={userAvatar}
                  peerName={peerName}
                  theme={theme}
                  isDark={isDark}
                  styles={styles}
                  datePlanActionId={datePlanActionId}
                  datePlanCalendarActionId={datePlanCalendarActionId}
                  onAcceptDatePlan={onAcceptDatePlan}
                  onSuggestAnotherTime={onSuggestAnotherTime}
                  onSuggestAnotherPlace={onSuggestAnotherPlace}
                  onSuggestBoth={onSuggestBoth}
                  onRescheduleDatePlan={onRescheduleDatePlan}
                  onCancelDatePlan={onCancelDatePlan}
                  onRequestDatePlanConcierge={onRequestDatePlanConcierge}
                  onAddDatePlanToCalendar={onAddDatePlanToCalendar}
                />
              ) : item.type === 'location' ? (
                <LocationMessageContent
                  item={item}
                  isMyMessage={isMyMessage}
                  styles={styles}
                  theme={theme}
                  onStopLiveShare={onStopLiveShare}
                  formatRemainingTime={formatRemainingTime}
                />
              ) : item.type === 'document' ? (
                <DocumentMessageContent
                  item={item}
                  isMyMessage={isMyMessage}
                  styles={styles}
                  theme={theme}
                />
              ) : item.type === 'mood_sticker' ? (
                <View
                  style={[
                    styles.moodStickerContainer,
                    isMyMessage ? styles.moodStickerContainerMy : styles.moodStickerContainerTheir,
                    {
                      backgroundColor: withAlpha(
                        item.sticker?.color || theme.tint,
                        isMyMessage ? (isDark ? 0.22 : 0.16) : 0.12,
                      ),
                      borderColor: withAlpha(
                        item.sticker?.color || theme.tint,
                        isMyMessage ? (isDark ? 0.34 : 0.26) : (isDark ? 0.26 : 0.18),
                      ),
                      shadowColor: item.sticker?.color || theme.tint,
                    },
                  ]}
                >
                  <Text style={styles.moodStickerEmoji}>{item.sticker?.emoji}</Text>
                  <Text
                    style={[
                      styles.moodStickerName,
                      {
                        color: isMyMessage
                          ? (isDark ? '#F7FFFD' : '#7A4600')
                          : item.sticker?.color || theme.tint,
                      },
                    ]}
                  >
                    {item.sticker?.name}
                  </Text>
                </View>
              ) : null}

            {item.type !== 'text' && item.type !== 'video' && item.type !== 'image' && (
              <Animated.View
                style={[
                  styles.messageMetaRow,
                  isMyMessage ? styles.messageMetaRight : styles.messageMetaLeft,
                  isMyMessage ? styles.receiptMetaBadge : null,
                  isMyMessage ? receiptBadgeToneStyle : null,
                  isMyMessage ? receiptPulseStyle : null,
                ]}
                pointerEvents="none"
              >
                <Text
                  style={[
                    styles.messageMetaText,
                    isMyMessage ? styles.messageMetaTextMy : styles.messageMetaTextTheir,
                  ]}
                >
                  {metaLabel}
                </Text>
                {isMyMessage && (
                  <MaterialCommunityIcons
                    name={receiptIcon?.name || 'clock-outline'}
                    size={receiptIcon?.size || 13}
                    color={receiptIcon?.color || '#C6D7D3'}
                    style={styles.messageMetaIcon}
                  />
                )}
              </Animated.View>
            )}

            {reactionNodes}

            {!isGroupedWithNext ? (
              <View
                pointerEvents="none"
                style={[
                  styles.bubbleTail,
                  isMyMessage ? styles.bubbleTailRight : styles.bubbleTailLeft,
                ]}
              >
                <RNSvg
                  width="100%"
                  height="100%"
                  viewBox="0 0 16 18"
                  style={!isMyMessage ? styles.bubbleTailSvgLeft : undefined}
                >
                  <Path
                    d={CHAT_BUBBLE_TAIL_PATH}
                    fill={bubbleTailFill}
                    stroke={bubbleTailStroke}
                    strokeWidth={bubbleTailStrokeWidth}
                  />
                </RNSvg>
              </View>
            ) : null}
          </Animated.View>
        </ChatMessageBubblePressable>

        {isReactionOpen ? (
          <ChatQuickReactionsBar
            item={item}
            isMyMessage={isMyMessage}
            isActionPinned={isActionPinned}
            canEdit={canEdit}
            quickReactions={QUICK_REACTIONS}
            styles={styles}
            theme={theme}
            isDark={isDark}
            timeLabel={metaLabel}
            imageSize={imageSize}
            cachedImageUrl={cachedImageUrl}
            cachedVideoUrl={cachedVideoUrl}
            isPlaying={isPlaying}
            onToggleVoice={onToggleVoice}
            onStopLiveShare={onStopLiveShare}
            formatRemainingTime={formatRemainingTime}
            onAddReaction={onAddReaction}
            onCloseReactions={onCloseReactions}
            onReply={onReply}
            onCopyMessage={onCopyMessage}
            onEditMessage={onEditMessage}
            onTogglePin={onTogglePin}
            onDeleteMessage={onDeleteMessage}
          />
        ) : null}
      </Animated.View>
    );
  },
  areMessageRowPropsEqual
);

MessageRowItem.displayName = "MessageRowItem";
