import { memo, useMemo } from "react";
import { Animated, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { MessageType } from "@/components/chat/types";
import type { ChatMessageStyles } from "@/components/chat/message-variants/shared";
import { getReceiptIconState } from "@/components/chat/message-variants/shared";
import VideoPreview from "@/components/chat/message-variants/VideoPreview";
import { resolveChatImageUri, resolveChatVideoUri } from "@/lib/chat/media-uri";

type MediaMessageContentProps = {
  item: MessageType;
  isMyMessage: boolean;
  imageSize?: { width: number; height: number };
  cachedImageUrl?: string;
  cachedVideoUrl?: string;
  timeLabel: string;
  styles: ChatMessageStyles;
  theme: typeof Colors.light;
  isDark: boolean;
  receiptPulseStyle: any;
};

const MediaMessageContent = memo(
  ({
    item,
    isMyMessage,
    imageSize,
    cachedImageUrl,
    cachedVideoUrl,
    timeLabel,
    styles,
    theme: _theme,
    isDark,
    receiptPulseStyle,
  }: MediaMessageContentProps) => {
    const receiptIcon = isMyMessage ? getReceiptIconState(item.status, isDark) : null;
    const mediaReceiptToneStyle = useMemo(() => {
      if (!isMyMessage) return null;
      switch (item.status) {
        case 'read':
          return styles.mediaMetaOverlayRead;
        case 'delivered':
          return styles.mediaMetaOverlayDelivered;
        case 'sent':
          return styles.mediaMetaOverlaySent;
        default:
          return styles.mediaMetaOverlaySent;
      }
    }, [isMyMessage, item.status, styles.mediaMetaOverlayDelivered, styles.mediaMetaOverlayRead, styles.mediaMetaOverlaySent]);

    if (item.type === 'image') {
      const resolvedImageUri = resolveChatImageUri(item, cachedImageUrl);
      return (
        <View style={[styles.imageMessageContainer, styles.mediaSurface]}>
          <ExpoImage
            source={{ uri: resolvedImageUri ?? undefined }}
            style={[
              styles.messageImage,
              imageSize ? { width: imageSize.width, height: imageSize.height } : null,
            ]}
            cachePolicy="disk"
            contentFit="cover"
            transition={0}
          />
          <Animated.View
            style={[
              styles.mediaMetaOverlay,
              isMyMessage ? styles.mediaMetaOverlayMy : styles.mediaMetaOverlayTheir,
              isMyMessage ? mediaReceiptToneStyle : null,
              isMyMessage ? receiptPulseStyle : null,
            ]}
            pointerEvents="none"
          >
            <Text
              style={[
                styles.mediaMetaText,
                isMyMessage ? styles.mediaMetaTextMy : styles.mediaMetaTextTheir,
              ]}
            >
              {timeLabel}
            </Text>
            {isMyMessage ? (
              <MaterialCommunityIcons
                name={receiptIcon?.name || 'clock-outline'}
                size={receiptIcon?.size || 13}
                color={receiptIcon?.color || '#C6D7D3'}
                style={styles.mediaMetaIcon}
              />
            ) : null}
          </Animated.View>
          {item.text ? (
            <View
              style={[
                styles.mediaCaptionCard,
                isMyMessage ? styles.mediaCaptionCardMy : styles.mediaCaptionCardTheir,
              ]}
            >
              <Text
                style={[
                  styles.imageCaption,
                  isMyMessage ? styles.myMessageText : styles.theirMessageText,
                ]}
              >
                {item.text}
              </Text>
            </View>
          ) : null}
        </View>
      );
    }

    if (item.type === 'video') {
      const resolvedVideoUri = resolveChatVideoUri(item, cachedVideoUrl);
      return (
        <View style={[styles.videoMessageContainer, styles.mediaSurface]}>
          {item.videoUrl ? (
            <VideoPreview
              styles={styles}
              url={item.videoUrl}
              resolvedUrl={resolvedVideoUri ?? undefined}
            />
          ) : null}
          <Animated.View
            style={[
              styles.mediaMetaOverlay,
              isMyMessage ? styles.mediaMetaOverlayMy : styles.mediaMetaOverlayTheir,
              isMyMessage ? mediaReceiptToneStyle : null,
              isMyMessage ? receiptPulseStyle : null,
            ]}
            pointerEvents="none"
          >
            <Text
              style={[
                styles.mediaMetaText,
                isMyMessage ? styles.mediaMetaTextMy : styles.mediaMetaTextTheir,
              ]}
            >
              {timeLabel}
            </Text>
            {isMyMessage ? (
              <MaterialCommunityIcons
                name={receiptIcon?.name || 'clock-outline'}
                size={receiptIcon?.size || 13}
                color={receiptIcon?.color || '#C6D7D3'}
                style={styles.mediaMetaIcon}
              />
            ) : null}
          </Animated.View>
          {item.text ? (
            <View
              style={[
                styles.mediaCaptionCard,
                isMyMessage ? styles.mediaCaptionCardMy : styles.mediaCaptionCardTheir,
              ]}
            >
              <Text
                style={[
                  styles.imageCaption,
                  isMyMessage ? styles.myMessageText : styles.theirMessageText,
                ]}
              >
                {item.text}
              </Text>
            </View>
          ) : null}
        </View>
      );
    }

    return null;
  },
);

MediaMessageContent.displayName = "MediaMessageContent";

export default MediaMessageContent;
