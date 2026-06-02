import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import DocumentMessageContent from "@/components/chat/message-variants/DocumentMessageContent";
import LocationMessageContent from "@/components/chat/message-variants/LocationMessageContent";
import type { MessageType } from "@/components/chat/types";
import MediaMessageContent from "@/components/chat/message-variants/MediaMessageContent";
import VoiceMessageContent from "@/components/chat/message-variants/VoiceMessageContent";
import { getReceiptIconState, withAlpha } from "@/components/chat/message-variants/shared";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Animated, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";

type Props = {
  item: MessageType;
  isMyMessage: boolean;
  isActionPinned: boolean;
  canEdit: boolean;
  quickReactions: string[];
  styles: Record<string, any>;
  theme: typeof Colors.light;
  isDark?: boolean;
  timeLabel?: string;
  imageSize?: { width: number; height: number };
  cachedImageUrl?: string;
  cachedVideoUrl?: string;
  isPlaying?: boolean;
  onToggleVoice?: (messageId: string) => void;
  onStopLiveShare?: (messageId: string) => void;
  formatRemainingTime?: (expiresAt: Date | null | undefined, now: number) => string;
  onAddReaction: (messageId: string, emoji: string) => void;
  onCloseReactions: () => void;
  onReply: (message: MessageType) => void;
  onCopyMessage: (message: MessageType) => void;
  onEditMessage: (message: MessageType) => void;
  onTogglePin: (message: MessageType, isPinned: boolean) => void;
  onDeleteMessage: (message: MessageType) => void;
};

export default function ChatQuickReactionsBar({
  item,
  isMyMessage,
  isActionPinned,
  canEdit,
  quickReactions,
  styles,
  theme,
  isDark = false,
  timeLabel,
  imageSize,
  cachedImageUrl,
  cachedVideoUrl,
  isPlaying = false,
  onToggleVoice = () => {},
  onStopLiveShare = () => {},
  formatRemainingTime = () => "",
  onAddReaction,
  onCloseReactions,
  onReply,
  onCopyMessage,
  onEditMessage,
  onTogglePin,
  onDeleteMessage,
}: Props) {
  const imageUri = item.offlineImageUri ?? item.imageUrl;
  const videoUri = item.offlineVideoUri ?? item.videoUrl;
  const previewTimeLabel =
    timeLabel ??
    item.timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  const isMediaPreview =
    !item.isViewOnce &&
    ((item.type === "image" && Boolean(imageUri)) ||
      (item.type === "video" && Boolean(videoUri)));
  const receiptIcon = isMyMessage ? getReceiptIconState(item.status, isDark) : null;
  const receiptToneStyle = isMyMessage
    ? item.status === "read"
      ? styles.receiptMetaBadgeRead
      : item.status === "delivered"
        ? styles.receiptMetaBadgeDelivered
        : styles.receiptMetaBadgeSent
    : null;
  const previewLabel =
    item.type === "video"
      ? "Video"
      : item.type === "document"
        ? item.document?.name || "Document"
        : item.type === "location"
          ? item.location?.label || "Location"
          : item.type === "voice"
            ? "Voice message"
            : item.type === "mood_sticker"
              ? item.sticker?.name || "Sticker"
              : item.text;

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onCloseReactions}
    >
      <View style={styles.quickReactionOverlay}>
        <BlurViewSafe
          testID="chat-quick-reaction-background-blur"
          pointerEvents="none"
          intensity={96}
          tint={isDark ? "dark" : "light"}
          style={styles.quickReactionBackdropBlur}
        />
        <Pressable
          testID="chat-quick-reaction-backdrop"
          style={styles.quickReactionBackdrop}
          onPress={onCloseReactions}
        />

        <ScrollView
          testID="chat-quick-reaction-layout"
          style={[
            styles.quickReactionOverlayScroller,
            isMyMessage ? styles.quickReactionOverlayContentRight : styles.quickReactionOverlayContentLeft,
          ]}
          contentContainerStyle={styles.quickReactionOverlayContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {!item.deletedForAll ? (
            <View
              testID="chat-quick-reactions-tray"
              style={[
                styles.quickReactionsContainer,
                isMyMessage ? styles.quickReactionsRight : styles.quickReactionsLeft,
              ]}
            >
              {quickReactions.map((emoji, idx) => (
                <TouchableOpacity
                  key={`${emoji}-${idx}`}
                  testID={`chat-quick-reaction-${idx}`}
                  style={styles.quickReactionButton}
                  onPress={() => onAddReaction(item.id, emoji)}
                >
                  <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View
            testID="chat-quick-reaction-preview"
            style={[
              styles.messageBubble,
              isMyMessage ? styles.myMessageBubble : styles.theirMessageBubble,
              item.type === "image" && !item.isViewOnce ? styles.imageBubble : null,
              item.type === "video" && !item.isViewOnce ? styles.videoBubble : null,
              item.type === "voice" ? styles.voiceBubble : null,
              item.type === "document" ? styles.documentBubble : null,
              item.type === "location" ? styles.locationBubble : null,
              item.type === "mood_sticker" ? styles.stickerBubble : null,
              isMyMessage ? styles.quickReactionPreviewRight : styles.quickReactionPreviewLeft,
            ]}
          >
            {isMediaPreview ? (
              <View testID={`chat-quick-reaction-${item.type}-preview`}>
                <MediaMessageContent
                  item={item}
                  isMyMessage={isMyMessage}
                  imageSize={imageSize}
                  cachedImageUrl={cachedImageUrl}
                  cachedVideoUrl={cachedVideoUrl}
                  timeLabel={previewTimeLabel}
                  styles={styles}
                  theme={theme}
                  isDark={isDark}
                  receiptPulseStyle={null}
                />
              </View>
            ) : item.type === "document" ? (
              <DocumentMessageContent
                item={item}
                isMyMessage={isMyMessage}
                styles={styles}
                theme={theme}
              />
            ) : item.type === "voice" ? (
              <VoiceMessageContent
                item={item}
                isMyMessage={isMyMessage}
                isPlaying={isPlaying}
                styles={styles}
                theme={theme}
                isDark={isDark}
                onToggleVoice={onToggleVoice}
              />
            ) : item.type === "location" ? (
              <LocationMessageContent
                item={item}
                isMyMessage={isMyMessage}
                styles={styles}
                theme={theme}
                onStopLiveShare={onStopLiveShare}
                formatRemainingTime={formatRemainingTime}
              />
            ) : item.type === "mood_sticker" ? (
              <View
                style={[
                  styles.moodStickerContainer,
                  { backgroundColor: withAlpha(item.sticker?.color || theme.tint, 0.12) },
                ]}
              >
                <Text style={styles.moodStickerEmoji}>{item.sticker?.emoji}</Text>
                <Text style={[styles.moodStickerName, { color: item.sticker?.color || theme.tint }]}>
                  {item.sticker?.name}
                </Text>
              </View>
            ) : item.type !== "text" ? (
              <View style={styles.quickReactionFocusMediaRow}>
                <MaterialCommunityIcons
                  name={
                    item.type === "video"
                      ? "play-circle-outline"
                      : item.type === "image"
                        ? "image-outline"
                        : "emoticon-outline"
                  }
                  size={20}
                  color={isMyMessage ? Colors.light.background : theme.text}
                />
                <Text
                  style={[styles.quickReactionFocusText, isMyMessage && styles.quickReactionFocusTextMy]}
                  numberOfLines={2}
                >
                  {previewLabel}
                </Text>
              </View>
            ) : (
              <Text
                style={[styles.quickReactionFocusText, isMyMessage && styles.quickReactionFocusTextMy]}
                numberOfLines={5}
              >
                {previewLabel}
              </Text>
            )}
            {item.type !== "text" && item.type !== "video" && item.type !== "image" ? (
              <Animated.View
                style={[
                  styles.messageMetaRow,
                  isMyMessage ? styles.messageMetaRight : styles.messageMetaLeft,
                  isMyMessage ? styles.receiptMetaBadge : null,
                  receiptToneStyle,
                ]}
                pointerEvents="none"
              >
                <Text
                  style={[
                    styles.messageMetaText,
                    isMyMessage ? styles.messageMetaTextMy : styles.messageMetaTextTheir,
                  ]}
                >
                  {previewTimeLabel}
                </Text>
                {isMyMessage ? (
                  <MaterialCommunityIcons
                    name={receiptIcon?.name || "clock-outline"}
                    size={receiptIcon?.size || 13}
                    color={receiptIcon?.color || "#C6D7D3"}
                    style={styles.messageMetaIcon}
                  />
                ) : null}
              </Animated.View>
            ) : null}
          </View>

          {!item.deletedForAll ? (
            <View
              testID="chat-quick-actions-menu"
              style={[
                styles.messageActionRow,
                isMyMessage ? styles.quickReactionActionRowRight : styles.quickReactionActionRowLeft,
              ]}
            >
              <TouchableOpacity
                testID="chat-quick-action-reply"
                style={styles.messageActionPill}
                onPress={() => {
                  onReply(item);
                  onCloseReactions();
                }}
              >
                <Text style={styles.messageActionPillLabel}>Reply</Text>
                <MaterialCommunityIcons name="reply" size={18} color={theme.text} />
              </TouchableOpacity>

              {!item.isViewOnce ? (
                <TouchableOpacity
                  testID="chat-quick-action-copy"
                  style={styles.messageActionPill}
                  onPress={() => {
                    onCopyMessage(item);
                    onCloseReactions();
                  }}
                >
                  <Text style={styles.messageActionPillLabel}>Copy</Text>
                  <MaterialCommunityIcons name="content-copy" size={18} color={theme.text} />
                </TouchableOpacity>
              ) : null}

              {canEdit ? (
                <TouchableOpacity
                  testID="chat-quick-action-edit"
                  style={styles.messageActionPill}
                  onPress={() => {
                    onEditMessage(item);
                    onCloseReactions();
                  }}
                >
                  <Text style={styles.messageActionPillLabel}>Edit</Text>
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.text} />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                testID="chat-quick-action-pin"
                style={styles.messageActionPill}
                onPress={() => {
                  onTogglePin(item, isActionPinned);
                  onCloseReactions();
                }}
              >
                <Text style={styles.messageActionPillLabel}>
                  {isActionPinned ? "Unpin" : "Pin"}
                </Text>
                <MaterialCommunityIcons
                  name={isActionPinned ? "pin-off-outline" : "pin-outline"}
                  size={18}
                  color={theme.text}
                />
              </TouchableOpacity>

              <TouchableOpacity
                testID="chat-quick-action-delete"
                style={[styles.messageActionPill, styles.messageActionPillDanger]}
                onPress={() => {
                  onDeleteMessage(item);
                  onCloseReactions();
                }}
              >
                <Text style={[styles.messageActionPillLabel, styles.messageActionPillLabelDanger]}>
                  Delete
                </Text>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.danger} />
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
