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
import {
  getChatAttachmentFailurePresentation,
  getChatAttachmentRetryLabel,
  isChatMediaProviderUnavailable,
} from "@/lib/chat/attachments/chat-attachment-error";
import { getChatAlbumSendStage } from '@/lib/chat/album/chat-media-album';
import {
  isChatExpression,
  isTransparentChatExpression,
} from '@/lib/chat/expressions/chat-expression-presentation';

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
  onRetryFailedMessage?: (messageId: string) => void;
  onViewImage?: (message: MessageType, renderedUrl: string, albumIndex?: number) => void;
  onViewVideo?: (message: MessageType, renderedUrl: string, albumIndex?: number) => void;
  onManageAlbumItem?: (message: MessageType, albumIndex: number) => void;
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
    onRetryFailedMessage,
    onViewImage,
    onViewVideo,
    onManageAlbumItem,
  }: MediaMessageContentProps) => {
    const attachmentFailure = isMyMessage && item.status === 'failed'
      ? getChatAttachmentFailurePresentation(item.sendErrorCode)
      : null;
    const attachmentRetryLabel =
      isMyMessage && item.status === 'queued' && item.sendErrorCode
        ? getChatAttachmentRetryLabel(item.sendErrorCode)
        : null;
    const providerUnavailable = isMyMessage && item.status === 'failed' &&
      isChatMediaProviderUnavailable(item.sendErrorCode);
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
    const albumSendStage = getChatAlbumSendStage(item.mediaItems ?? []);
    const activeSendLabel = albumSendStage?.kind === 'preparing'
      ? 'Preparing...'
      : albumSendStage?.kind === 'checking_safety'
        ? 'Checking safety...'
        : albumSendStage?.kind === 'uploading'
          ? `Uploading ${Math.round(albumSendStage.progress * 100)}%`
          : 'Sending...';
    const deliveryLabel =
      isMyMessage && item.status === 'queued'
        ? attachmentRetryLabel ?? 'Waiting to send'
        : isMyMessage && item.status === 'sending'
          ? activeSendLabel
        : attachmentFailure
          ? attachmentFailure.retryable
            ? 'Couldn’t send · Tap to retry'
            : 'Not sent · Choose another'
          : null;
    const resolvedDeliveryLabel = providerUnavailable
      ? 'Couldn’t check this photo · Try again'
      : deliveryLabel;
    const deliveryBadge = resolvedDeliveryLabel ? (
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
                ? albumSendStage?.kind === 'preparing'
                  ? 'clock-outline'
                  : albumSendStage?.kind === 'checking_safety'
                    ? 'shield-check-outline'
                    : 'cloud-upload-outline'
                : 'clock-outline'
          }
          size={13}
          color="#FFFFFF"
        />
        <Text style={deliveryStyles.label}>{resolvedDeliveryLabel}</Text>
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
      const transparentExpression = isTransparentChatExpression(item.mediaKind);
      const expressionMessage = isChatExpression(item.mediaKind);
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
        if (
          mediaItem.transferState === 'retryable_failed' ||
          mediaItem.transferState === 'terminal_failed'
        ) {
          onManageAlbumItem?.(item, albumIndex);
          return;
        }
        // A fully uploaded album can still fail atomic server finalisation.
        // In that state the media remains locally viewable, but tapping the
        // failed bubble must retry the durable command rather than opening the
        // viewer and making the visible retry affordance ineffective.
        if (isMyMessage && item.status === 'failed') {
          if (attachmentFailure?.retryable === false) return;
          onRetryFailedMessage?.(item.id);
          return;
        }
        if (!uri) {
          if (mediaItem.storagePath || item.storagePath) {
            onRetryMedia?.({ ...item, storagePath: mediaItem.storagePath || item.storagePath });
          }
          return;
        }
        if (mediaItem.type === 'video') {
          onViewVideo?.({
            ...item,
            type: 'video',
            storagePath: mediaItem.storagePath,
            videoUrl: mediaItem.signedUrl,
            offlineVideoUri: mediaItem.localUri,
            previewStoragePath: mediaItem.previewStoragePath,
          }, uri, albumIndex);
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
            onPress={(event) => {
              if (isMyMessage && item.status === 'failed') event.stopPropagation();
              openTile(openItem, openUri, openIndex);
            }}
            onLongPress={
              isMyMessage && isAlbum && ['queued', 'sending', 'failed'].includes(item.status ?? '')
                ? () => onManageAlbumItem?.(item, openIndex)
                : undefined
            }
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel={
              remaining > 0
                ? `Open ${remaining} more ${remaining === 1 ? 'photo' : 'photos'}`
                : `Open photo ${tileIndex + 1} of ${mediaItems.length}`
            }
            accessibilityHint={
              isMyMessage && isAlbum && ['queued', 'sending', 'failed'].includes(item.status ?? '')
                ? 'Press and hold to cancel this item or the whole album.'
                : undefined
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
            {mediaItem.type === 'video' && remaining <= 0 ? (
              <View pointerEvents="none" style={albumStyles.videoBadge}>
                <MaterialCommunityIcons name="play" size={18} color="#FFFFFF" />
              </View>
            ) : null}
            {mediaItem.transferState === 'retryable_failed' || mediaItem.transferState === 'terminal_failed' ? (
              <View pointerEvents="none" style={albumStyles.itemStateBadge}>
                <MaterialCommunityIcons name="alert-circle-outline" size={15} color="#FFFFFF" />
                <Text style={albumStyles.itemStateText}>
                  {mediaItem.transferState === 'terminal_failed' ? 'Choose another' : 'Tap to retry'}
                </Text>
              </View>
            ) : mediaItem.transferState === 'cancelling' ? (
              <View pointerEvents="none" style={albumStyles.itemStateBadge}>
                <MaterialCommunityIcons name="close-circle-outline" size={15} color="#FFFFFF" />
                <Text style={albumStyles.itemStateText}>Cancelling</Text>
              </View>
            ) : mediaItem.transferState === 'uploading' ? (
              <View pointerEvents="none" style={albumStyles.itemStateBadge}>
                <MaterialCommunityIcons name="cloud-upload-outline" size={15} color="#FFFFFF" />
                <Text style={albumStyles.itemStateText}>
                  {typeof mediaItem.uploadProgress === 'number'
                    ? `${Math.round(mediaItem.uploadProgress * 100)}%`
                    : 'Uploading'}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      };
      if (expressionMessage && !isAlbum) {
        const expressionLabel = item.mediaKind === 'giphy_emoji'
          ? 'Animated emoji'
          : item.mediaKind === 'giphy_sticker'
            ? 'Animated sticker'
            : item.mediaKind === 'giphy_text'
              ? 'Animated text'
              : 'GIF';
        return (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={expressionLabel}
            style={[
              expressionStyles.container,
              { width: frameWidth },
            ]}
          >
            <View
              style={[
                { width: frameWidth, height: frameHeight },
                !transparentExpression && expressionStyles.gifSurface,
              ]}
            >
              {primaryImageUri ? (
                <ExpoImage
                  source={{
                    uri: primaryImageUri,
                    cacheKey: primaryPreviewUri
                      ? mediaItems[0]?.previewStoragePath || undefined
                      : mediaItems[0]?.storagePath || item.storagePath || undefined,
                  }}
                  style={StyleSheet.absoluteFill}
                  cachePolicy="memory-disk"
                  contentFit={transparentExpression ? 'contain' : 'cover'}
                  transition={100}
                  autoplay
                  onLoad={() => reportLoadedImage(
                    item,
                    primaryImageUri,
                    primaryPreviewUri
                      ? mediaItems[0]?.previewStoragePath
                      : mediaItems[0]?.storagePath || item.storagePath,
                  )}
                  onError={() => onMediaLoadError?.(item)}
                />
              ) : (
                <View style={[albumStyles.placeholder, expressionStyles.placeholder]}>
                  <MaterialCommunityIcons name="sticker-emoji" size={28} color="rgba(255,255,255,0.72)" />
                </View>
              )}
              {deliveryBadge}
            </View>
            <Animated.View
              pointerEvents="none"
              style={[
                expressionStyles.metaRow,
                isMyMessage ? receiptPulseStyle : null,
              ]}
            >
              <Text style={[expressionStyles.metaText, { color: _theme.textMuted }]}>{timeLabel}</Text>
              {isMyMessage ? (
                <MaterialCommunityIcons
                  name={receiptIcon?.name || 'clock-outline'}
                  size={receiptIcon?.size || 13}
                  color={receiptIcon?.color || _theme.textMuted}
                />
              ) : null}
            </Animated.View>
            {isMyMessage && item.status === 'failed' && attachmentFailure?.retryable !== false ? (
              <Pressable
                style={deliveryStyles.retryHitTarget}
                onPress={(event) => {
                  event.stopPropagation();
                  onRetryFailedMessage?.(item.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Retry sending ${expressionLabel.toLowerCase()}`}
              />
            ) : null}
          </View>
        );
      }
      return (
        <View
          style={[
            styles.imageMessageContainer,
            styles.mediaSurface,
            transparentExpression && expressionStyles.transparentSurface,
            { width: frameWidth },
          ]}
        >
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
              onPress={(event) => {
                if (isMyMessage && item.status === 'failed') event.stopPropagation();
                openTile(mediaItems[0], primaryImageUri, 0);
              }}
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
                  contentFit={transparentExpression ? 'contain' : 'cover'}
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
          {attachmentFailure ? (
            <View style={deliveryStyles.failureCard}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FF9C9C" />
              <Text style={deliveryStyles.failureCopy}>{attachmentFailure.message}</Text>
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
          {isMyMessage && item.status === 'failed' && attachmentFailure?.retryable !== false ? (
            <Pressable
              style={deliveryStyles.retryHitTarget}
              onPress={(event) => {
                event.stopPropagation();
                onRetryFailedMessage?.(item.id);
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry sending video"
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
          {attachmentFailure ? (
            <View style={deliveryStyles.failureCard}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FF9C9C" />
              <Text style={deliveryStyles.failureCopy}>{attachmentFailure.message}</Text>
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

const expressionStyles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'stretch',
  },
  gifSurface: {
    borderRadius: 15,
    overflow: 'hidden',
  },
  transparentSurface: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    overflow: 'visible',
  },
  placeholder: {
    backgroundColor: 'rgba(16, 44, 46, 0.5)',
    borderRadius: 14,
  },
  metaRow: {
    minHeight: 18,
    marginTop: 2,
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 3,
  },
  metaText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
    lineHeight: 14,
  },
});

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
  retryHitTarget: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 5,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
  },
  failureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 10,
    backgroundColor: 'rgba(92, 25, 32, 0.92)',
  },
  failureCopy: {
    flex: 1,
    color: '#FFE8E8',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Manrope_600SemiBold',
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
  videoBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 38,
    height: 38,
    marginLeft: -19,
    marginTop: -19,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3,17,19,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
  },
  itemStateBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '82%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(8,24,25,0.82)',
  },
  itemStateText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Manrope_700Bold' },
});
