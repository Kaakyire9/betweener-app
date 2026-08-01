import { memo, useMemo } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { MessageType } from "@/components/chat/types";
import type { ChatMessageStyles } from "@/components/chat/message-variants/shared";
import { getReceiptIconState } from "@/components/chat/message-variants/shared";
import VideoPreview from "@/components/chat/message-variants/VideoPreview";
import { resolveChatImageUri, resolveChatVideoUri } from "@/lib/chat/media-uri";
import { getMessageImageItems } from "@/lib/chat/media-album";
import type { ChatMediaAccessFailure } from "@/lib/chat/media/chat-media-access";

type MediaMessageContentProps = {
  item: MessageType;
  isMyMessage: boolean;
  imageSize?: { width: number; height: number };
  cachedImageUrl?: string;
  cachedVideoUrl?: string;
  mediaUrisByPath?: Readonly<Record<string, string>>;
  mediaFailure?: ChatMediaAccessFailure;
  timeLabel: string;
  styles: ChatMessageStyles;
  theme: typeof Colors.light;
  isDark: boolean;
  receiptPulseStyle: any;
  onMediaLoadError?: (message: MessageType) => void;
  onMediaLoadSuccess?: (
    message: MessageType,
    renderedUri: string,
    nativeCacheUri?: string | null,
  ) => void;
  onRetryMedia?: (message: MessageType) => void;
  onViewImage?: (message: MessageType, renderedUrl: string, albumIndex?: number) => void;
};

const MediaMessageContent = memo(
  ({
    item,
    isMyMessage,
    imageSize,
    cachedImageUrl,
    cachedVideoUrl,
    mediaUrisByPath,
    mediaFailure,
    timeLabel,
    styles,
    theme: _theme,
    isDark,
    receiptPulseStyle,
    onMediaLoadError,
    onMediaLoadSuccess,
    onRetryMedia,
    onViewImage,
  }: MediaMessageContentProps) => {
    const reportLoadedImage = (
      message: MessageType,
      renderedUri: string,
      cacheKey?: string | null,
    ) => {
      if (!cacheKey || !renderedUri.startsWith('http')) {
        onMediaLoadSuccess?.(message, renderedUri);
        return;
      }
      void ExpoImage.getCachePathAsync(cacheKey)
        .then((nativeCacheUri) => {
          onMediaLoadSuccess?.(message, renderedUri, nativeCacheUri);
        })
        .catch(() => {
          onMediaLoadSuccess?.(message, renderedUri);
        });
    };
    const receiptIcon = isMyMessage ? getReceiptIconState(item.status, isDark) : null;
    const unavailableTitle = mediaFailure ? 'Media unavailable' : null;
    const unavailableCopy =
      mediaFailure === 'missing_storage_path'
        ? 'This attachment is incomplete.'
        : mediaFailure === 'retry_exhausted'
        ? 'Tap to try loading it again.'
        : mediaFailure
        ? 'Retrying securely…'
        : null;
    const resolvedVideoUri =
      item.type === 'video'
        ? resolveChatVideoUri(item, cachedVideoUrl)
        : null;
    const deliveryLabel =
      isMyMessage && item.status === 'queued'
        ? 'Waiting to send'
        : isMyMessage && item.status === 'sending'
          ? 'Sending…'
        : isMyMessage && item.status === 'failed'
          ? 'Couldn’t send · Tap to retry'
          : null;
    const deliveryBadge = deliveryLabel ? (
      <View
        style={[
          deliveryStyles.badge,
          item.status === 'failed' && deliveryStyles.failedBadge,
        ]}
        pointerEvents="none"
      >
        <MaterialCommunityIcons
          name={
            item.status === 'failed'
              ? 'alert-circle-outline'
              : item.status === 'sending'
                ? 'cloud-upload-outline'
                : 'clock-outline'
          }
          size={13}
          color="#FFFFFF"
        />
        <Text style={deliveryStyles.label}>{deliveryLabel}</Text>
      </View>
    ) : null;
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
      const mediaItems = getMessageImageItems(item);
      const primaryPreviewUri =
        mediaItems[0]?.localPreviewUri ??
        (mediaItems[0]?.previewStoragePath
          ? mediaUrisByPath?.[mediaItems[0].previewStoragePath]
          : mediaItems[0]?.previewSignedUrl);
      const primaryImageUri =
        resolvedImageUri ??
        primaryPreviewUri ??
        (mediaItems[0]?.storagePath
          ? mediaUrisByPath?.[mediaItems[0].storagePath]
          : mediaItems[0]?.signedUrl) ??
        (item.status === 'queued' || item.status === 'sending'
          ? mediaItems[0]?.localUri
          : undefined);
      const visibleItems = mediaItems.slice(0, 4);
      const isAlbum = mediaItems.length > 1;
      const frameWidth = imageSize?.width ?? 340;
      const frameHeight = isAlbum ? Math.round(frameWidth * 0.86) : (imageSize?.height ?? 340);
      const resolveTileUri = (mediaItem: (typeof mediaItems)[number], tileIndex: number) => {
        const optimisticLocalUri =
          item.status === 'queued' || item.status === 'sending'
            ? mediaItem.localUri
            : undefined;
        const previewUri = mediaItem.localPreviewUri
          ?? (mediaItem.previewStoragePath
            ? mediaUrisByPath?.[mediaItem.previewStoragePath]
            : mediaItem.previewSignedUrl);
        const originalUri = mediaUrisByPath?.[mediaItem.storagePath];
        const cachedOriginalUri =
          originalUri?.startsWith('file://') || originalUri?.startsWith('content://')
            ? originalUri
            : undefined;
        return cachedOriginalUri
          ?? previewUri
          ?? originalUri
          ?? optimisticLocalUri
          ?? (!mediaItem.storagePath ? mediaItem.signedUrl : undefined)
          ?? (tileIndex === 0 ? primaryImageUri : undefined);
      };
      const openTile = (
        mediaItem: (typeof mediaItems)[number],
        uri: string | undefined,
        albumIndex: number,
      ) => {
        if (!uri) {
          if (mediaItem.storagePath || item.storagePath) {
            onRetryMedia?.({ ...item, storagePath: mediaItem.storagePath || item.storagePath });
          }
          return;
        }
        onViewImage?.(item, uri, albumIndex);
      };
      const renderTile = (mediaItem: (typeof mediaItems)[number], tileIndex: number) => {
        const previewUri = mediaItem.localPreviewUri
          ?? (mediaItem.previewStoragePath
            ? mediaUrisByPath?.[mediaItem.previewStoragePath]
            : mediaItem.previewSignedUrl);
        const uri = resolveTileUri(mediaItem, tileIndex);
        const remaining = tileIndex === 3 ? mediaItems.length - 4 : 0;
        const openIndex = remaining > 0 ? 4 : tileIndex;
        const openItem = mediaItems[openIndex] ?? mediaItem;
        const openUri = resolveTileUri(openItem, openIndex);
        return (
          <Pressable
            key={mediaItem.attachmentId || `${item.id}-${tileIndex}`}
            style={({ pressed }) => [albumStyles.tile, pressed && albumStyles.tilePressed]}
            onPress={() => openTile(openItem, openUri, openIndex)}
            accessibilityRole="button"
            accessibilityLabel={
              remaining > 0
                ? `Open ${remaining} more ${remaining === 1 ? 'photo' : 'photos'}`
                : `Open photo ${tileIndex + 1} of ${mediaItems.length}`
            }
          >
            {uri ? (
              <ExpoImage
                source={{
                  uri,
                  cacheKey: previewUri
                    ? mediaItem.previewStoragePath || undefined
                    : mediaItem.storagePath || undefined,
                }}
                style={StyleSheet.absoluteFill}
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={100}
                onLoad={() => reportLoadedImage(
                  {
                    ...item,
                    storagePath: previewUri
                      ? mediaItem.previewStoragePath || null
                      : mediaItem.storagePath || item.storagePath,
                  },
                  uri,
                  previewUri
                    ? mediaItem.previewStoragePath
                    : mediaItem.storagePath || item.storagePath,
                )}
                onError={() => onMediaLoadError?.({ ...item, storagePath: mediaItem.storagePath || item.storagePath })}
              />
            ) : (
              <View style={albumStyles.placeholder}>
                <MaterialCommunityIcons name="image-outline" size={30} color="rgba(255,255,255,0.72)" />
                {unavailableTitle ? <Text style={albumStyles.placeholderText}>{unavailableTitle}</Text> : null}
                {unavailableCopy ? <Text style={albumStyles.placeholderCopy}>{unavailableCopy}</Text> : null}
              </View>
            )}
            {remaining > 0 ? (
              <View style={albumStyles.moreOverlay}>
                <Text style={albumStyles.moreText}>+{remaining}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      };
      return (
        <View style={[styles.imageMessageContainer, styles.mediaSurface, { width: frameWidth }]}>
          {isAlbum ? (
            <View style={[albumStyles.album, { height: frameHeight }]}>
              {visibleItems.length === 2 ? (
                <View style={albumStyles.row}>{visibleItems.map(renderTile)}</View>
              ) : visibleItems.length === 3 ? (
                <View style={albumStyles.row}>
                  <View style={albumStyles.largeTile}>{renderTile(visibleItems[0], 0)}</View>
                  <View style={albumStyles.column}>{visibleItems.slice(1).map((entry, index) => renderTile(entry, index + 1))}</View>
                </View>
              ) : (
                <View style={albumStyles.column}>
                  <View style={albumStyles.row}>{visibleItems.slice(0, 2).map(renderTile)}</View>
                  <View style={albumStyles.row}>{visibleItems.slice(2, 4).map((entry, index) => renderTile(entry, index + 2))}</View>
                </View>
              )}
            </View>
          ) : mediaItems[0] ? (
            <Pressable
              onPress={() => openTile(mediaItems[0], primaryImageUri, 0)}
              style={{ width: frameWidth, height: frameHeight }}
              accessibilityRole="button"
              accessibilityLabel="Open photo"
            >
              {primaryImageUri ? (
                <ExpoImage
                  source={{
                    uri: primaryImageUri,
                    cacheKey: primaryPreviewUri
                      ? mediaItems[0].previewStoragePath || undefined
                      : mediaItems[0].storagePath || item.storagePath || undefined,
                  }}
                  style={StyleSheet.absoluteFill}
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  transition={100}
                  onLoad={() => reportLoadedImage(
                    {
                      ...item,
                      storagePath: primaryPreviewUri
                        ? mediaItems[0].previewStoragePath || null
                        : mediaItems[0].storagePath || item.storagePath,
                    },
                    primaryImageUri,
                    primaryPreviewUri
                      ? mediaItems[0].previewStoragePath
                      : mediaItems[0].storagePath || item.storagePath,
                  )}
                  onError={() => onMediaLoadError?.(item)}
                />
              ) : (
                <View style={albumStyles.placeholder}>
                  <MaterialCommunityIcons name="image-outline" size={32} color="rgba(255,255,255,0.72)" />
                  {unavailableTitle ? <Text style={albumStyles.placeholderText}>{unavailableTitle}</Text> : null}
                  {unavailableCopy ? <Text style={albumStyles.placeholderCopy}>{unavailableCopy}</Text> : null}
                </View>
              )}
            </Pressable>
          ) : (
            <View style={[albumStyles.placeholder, { width: frameWidth, height: frameHeight }]}>
              <MaterialCommunityIcons name="image-outline" size={32} color="rgba(255,255,255,0.72)" />
              {unavailableTitle ? <Text style={albumStyles.placeholderText}>{unavailableTitle}</Text> : null}
              {unavailableCopy ? <Text style={albumStyles.placeholderCopy}>{unavailableCopy}</Text> : null}
            </View>
          )}
          {deliveryBadge}
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
      const posterUri =
        item.offlinePreviewUri ??
        (item.previewStoragePath ? mediaUrisByPath?.[item.previewStoragePath] : undefined) ??
        item.previewUrl ??
        item.mediaItems?.[0]?.localPreviewUri ??
        (item.mediaItems?.[0]?.previewStoragePath
          ? mediaUrisByPath?.[item.mediaItems[0].previewStoragePath]
          : item.mediaItems?.[0]?.previewSignedUrl);
      return (
        <View style={[styles.videoMessageContainer, styles.mediaSurface]}>
          {resolvedVideoUri || posterUri ? (
            <VideoPreview
              styles={styles}
              url={resolvedVideoUri ?? ''}
              resolvedUrl={resolvedVideoUri ?? undefined}
              posterUri={posterUri}
              onError={() => onMediaLoadError?.(item)}
            />
          ) : (
            <Pressable
              style={[styles.messageVideo, styles.videoPreviewPlaceholder]}
              onPress={() => onRetryMedia?.(item)}
              disabled={!item.storagePath}
              accessibilityRole="button"
              accessibilityLabel={mediaFailure ? 'Retry video' : 'Video is loading'}
            >
              <View style={styles.videoPreviewPlaceholderIcon}>
                <MaterialCommunityIcons name="video-outline" size={28} color={Colors.light.background} />
              </View>
              {unavailableTitle ? (
                <Text style={styles.videoPreviewPlaceholderTitle}>{unavailableTitle}</Text>
              ) : null}
              {unavailableCopy ? (
                <Text style={styles.videoPreviewPlaceholderCopy}>{unavailableCopy}</Text>
              ) : null}
            </Pressable>
          )}
          {deliveryBadge}
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

const deliveryStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(8, 24, 25, 0.78)',
  },
  failedBadge: {
    backgroundColor: 'rgba(132, 38, 45, 0.9)',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
  },
});

const albumStyles = StyleSheet.create({
  album: { width: '100%', gap: 2, backgroundColor: '#0B2224' },
  row: { flex: 1, flexDirection: 'row', gap: 2 },
  column: { flex: 1, gap: 2 },
  largeTile: { flex: 1.25 },
  tile: { flex: 1, overflow: 'hidden', backgroundColor: '#143235' },
  tilePressed: { opacity: 0.88 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#143235' },
  placeholderText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontFamily: 'Manrope_700Bold' },
  placeholderCopy: { color: 'rgba(255,255,255,0.62)', fontSize: 11, fontFamily: 'Manrope_600SemiBold', textAlign: 'center', paddingHorizontal: 12 },
  moreOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,17,19,0.62)' },
  moreText: { color: '#FFFFFF', fontSize: 28, fontFamily: 'Manrope_800ExtraBold' },
});
