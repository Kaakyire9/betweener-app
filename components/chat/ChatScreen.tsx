import MomentViewer from "@/components/MomentViewer";
import ChatComposer from "@/components/chat/ChatComposer";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ChatThreadView } from "@/components/chat/ChatThreadView";
import { createChatScreenStyles } from '@/components/chat/styles/chat-screen.styles';
import { MessageRow } from "@/components/chat/MessageRow";
import { MessageRowItem } from '@/components/chat/MessageRowItem';
import { ChatVideoViewer } from "@/components/chat/media/ChatVideoViewer";
import { ChatDocumentViewer } from '@/components/chat/media/ChatDocumentViewer';
import { ChatImmersiveVideoViewer } from '@/components/chat/media/ChatImmersiveVideoViewer';
import ChatMessageActionsSheet from "@/components/chat/ChatMessageActionsSheet";
import ChatReactionSummarySheet from "@/components/chat/ChatReactionSummarySheet";
import ChatSafetyModal from "@/components/chat/ChatSafetyModal";
import type { ChatMediaItem, DatePlanResponseKind, DatePlanStatus, MessageType } from "@/components/chat/types";
import { Colors } from "@/constants/theme";
import {
  ATTACHMENT_SHEET_MAX_HEIGHT,
  ATTACHMENT_SHEET_MIN_HEIGHT,
  ATTACHMENT_SHEET_SCREEN_RATIO,
  BLOCKED_AVATAR_SOURCE,
  BLOCKED_BY_ME,
  BLOCKED_BY_THEM,
  CHAT_MEDIA_BUCKET,
  CHAT_PREFS_STORAGE_KEY,
  CHAT_SAFETY_SEEN_KEY,
  CONCIERGE_SERVICE_OPTIONS,
  DATE_PLAN_TEXT_PREFIX,
  DEFAULT_VOICE_WAVEFORM,
  DOCUMENT_TEXT_PREFIX,
  DURABLE_CHAT_OUTBOX_MAX_ATTEMPTS,
  FALLBACK_BETWEENER_DATE_PICKS,
  GOOGLE_MAPS_MAP_ID,
  GOOGLE_MAPS_WEB_API_KEY,
  HEADER_HINT_STORAGE_KEY,
  LEGACY_MESSAGE_SELECT_FIELDS,
  LIVE_LOCATION_PRESETS,
  LOCAL_CHAT_OPERATION_TIMEOUT_MS,
  LOCATION_LIVE_PREFIX,
  LOCATION_TEXT_PREFIX,
  MAP_STYLE_DARK,
  MAP_STYLE_LIGHT,
  MESSAGE_SELECT_FIELDS,
  PAGE_SIZE,
  PICKER_MEDIA_TYPES_ALL,
  REPORT_REASONS,
  VIDEO_TEXT_PREFIX,
} from '@/constants/chat';
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useMoments } from "@/hooks/useMoments";
import { useAuth } from "@/lib/auth-context";
import {
  clearActiveChatThread,
  markChatThreadOptimisticallyRead,
  setActiveChatThread,
} from "@/lib/chat/active-thread";
import { ChatThreadActionsService } from "@/lib/chat/chat-thread-actions-service";
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_DOCUMENT_PICKER_MIME_TYPES,
  validateChatAttachment,
} from "@/lib/chat/attachment-policy";
import {
  createChatAttachmentId,
} from "@/lib/chat/attachment-lifecycle";
import {
  createQueuedMediaMessage,
  createQueuedMediaOutboxRow,
  createQueuedViewOnceOutboxRow,
} from "@/lib/chat/attachments/chat-attachment-queue";
import {
  createChatAttachmentPreview,
  removeChatAttachmentPreview,
} from "@/lib/chat/attachments/chat-attachment-preview";
import {
  getAttachmentUploadErrorMessage,
  isRetryableUploadError,
} from "@/lib/chat/attachments/upload-error-policy";
import {
  createViewOnceOptimisticMessage,
  getViewOnceUploadErrorMessage,
} from "@/lib/chat/attachments/view-once-attachment";
import { prepareDurableViewOnceAttachment } from "@/lib/chat/attachments/view-once-send-service";
import { moderateEncryptAndSendViewOnceImage } from "@/lib/chat/attachments/view-once-pre-encryption-service";
import { prepareChatVideo } from "@/lib/chat/video-preparation";
import {
  getMessageMediaItems,
  getStableChatImageFrame,
  normalizeChatMediaItems,
} from "@/lib/chat/media-album";
import { selectChatImageGalleryItem } from '@/lib/chat/media/chat-image-gallery';
import { acknowledgeIncomingMessagesDelivered } from "@/lib/chat/delivery-receipts";
import { useChatMessages } from "@/lib/chat/hooks/use-chat-messages";
import { useChatThreadBrowseUi } from "@/lib/chat/hooks/use-chat-thread-browse-ui";
import { useChatThreadMessageUi } from "@/lib/chat/hooks/use-chat-thread-message-ui";
import { useChatThreadScreenUi } from "@/lib/chat/hooks/use-chat-thread-screen-ui";
import { useChatThreadStateSync } from "@/lib/chat/hooks/use-chat-thread-state-sync";
import { useChatThreadLocalState } from "@/lib/chat/hooks/use-chat-thread-local-state";
import { useChatThreadController } from "@/lib/chat/hooks/use-chat-thread-controller";
import { useChatMediaAccess } from "@/lib/chat/hooks/use-chat-media-access";
import { ChatRepository, type ChatMessageRow, type ChatPendingOutboxRow } from "@/lib/chat/local/chat-db";
import { ChatThreadRemoteService } from "@/lib/chat/chat-thread-remote-service";
import { mergeViewOnceStatus } from '@/lib/chat/view-once-status';
import {
  addPinnedMessageId,
  applyDeleteMessageForEveryone,
  applyLocalReactionToggle,
  applyOptimisticMessageEdit,
  reconcileEditedMessage,
  removePinnedMessageId,
  restoreMessageReactions,
} from "@/lib/chat/message-actions";
import {
  appendMessage,
  applySyncedOutgoingReceiptState,
  markAllOutgoingMessagesDelivered,
  markIncomingMessageRead,
  markOutgoingMessageDelivered,
  mergeMessageWithMonotonicReceipt,
  reconcileMessageWithServer,
  transitionMessageLifecycle,
  transitionMessageLifecycleRecord,
} from "@/lib/chat/message-state";
import {
  getChatMessageRevisionKey,
  preserveUnchangedMessageReferences,
} from "@/lib/chat/message-list-reconciliation";
import { reconcileFetchedThreadRows } from "@/lib/chat/loading/thread-fetch-reconciler";
import { mergeIncrementalThreadMessages } from "@/lib/chat/loading/thread-message-state-merge";
import {
  buildRetryFailedTextPayload,
  CHAT_READ_RECEIPT_DELAY_MS,
  createDatePlanDraftFromInvite,
  type DatePlannerMode,
  markLoadedIncomingMessagesRead,
  resolveDatePlanResponseKind,
  shouldScheduleMessageRead,
} from "@/lib/chat/thread-behavior";
import { ChatOutboxService } from "@/lib/chat/outbox/chat-outbox-service";
import {
  chronologicalIndexToListIndex,
  getChronologicalListDistanceToBottom,
} from '@/lib/chat/message-list-order';
import { resolveChatVoiceRecordingMetadata } from "@/lib/chat/attachments/chat-voice-recording";
import {
  ChatThreadReadCoordinator,
  getLatestIncomingMessageTimestamp,
} from "@/lib/chat/read-state/chat-thread-read-coordinator";
import { ChatReadReceiptBatcher } from "@/lib/chat/read-state/chat-read-receipt-batcher";
import { processThreadRealtimeMessage } from "@/lib/chat/realtime/thread-realtime-message-processor";
import {
  createTextRetryPlan,
  shouldShowAttachmentRetryFailure,
} from "@/lib/chat/retry/chat-retry-service";
import { createOptimisticTextMessage } from "@/lib/chat/messages/chat-message-service";
import { withLocalOperationTimeout } from "@/lib/chat/local/local-operation-timeout";
import { withAlpha } from "@/lib/chat/ui/color-utils";
import { getDateBadgeMeta, getDateBadgePalette } from '@/lib/chat/ui/date-badge-presentation';
import {
  prepareChatDocumentPreview,
  type PreparedChatDocumentPreview,
} from '@/lib/chat/media/chat-document-preview';
import {
  formatFileSize,
  formatDateInviteWhen,
  formatIntentExpiresIn,
  formatIntentTypeLabel,
  formatRemainingTime,
  getFileTypeLabel,
} from "@/lib/chat/ui/message-formatters";
import {
  buildStickerPayload,
  MOOD_STICKERS,
  parseStickerFallback,
  parseStickerPayload,
  STICKER_COLORS,
  STICKER_TEXT_PREFIX,
} from "@/lib/chat-stickers";
import {
  THREAD_ACTIVITY_LEASE_MS,
  isPeerThreadActivityLeaseFresh,
} from "@/lib/chat/thread-activity";
import {
  startThreadPresenceSession,
  subscribeThreadAncillaryRealtime,
  subscribeThreadMessageRealtime,
} from "@/lib/chat/sync/chat-realtime-service";
import { flushThreadOutboxAndRefresh, startThreadSyncCoordinator } from "@/lib/chat/sync/chat-thread-sync-coordinator";
import { fetchRemoteSystemMessages, fetchRemoteThreadMessages } from "@/lib/chat/sync/chat-sync-service";
import { resolveChatImageViewerUri } from "@/lib/chat/media-uri";
import type { ChatMediaAccessFailure } from "@/lib/chat/media/chat-media-access";
import { getLegacyChatMediaStoragePath } from "@/lib/chat/media/chat-media-storage-paths";
import { encryptMediaBytes, getOrCreateDeviceKeypair } from "@/lib/e2ee";
import { decideIntentRequestOfflineSafe } from "@/lib/intents/offline-actions";
import { computeConversationSignalLabel, computeFirstReplyHours, computeInterestOverlapRatio } from "@/lib/match/match-score";
import { isLikelyNetworkError } from "@/lib/network";
import {
  getAuthoritativePresenceDisplay,
  getChatThreadPresenceKind,
  resolveLatestPeerActivityAt,
} from "@/lib/presence";
import { fetchViewedMomentIds } from "@/lib/moments-views";
import {
  cacheOfflineImage,
  getOfflineImageUri,
  persistOfflineImageCopy,
  peekOfflineImageUri,
  rememberOfflineImageUri,
  removeOfflineImage,
} from "@/lib/offline/image-store";
import {
  cacheOfflineAttachment,
  findOfflineAttachment,
} from "@/lib/offline/attachment-file-store";
import {
  buildChatPeerStoreKey,
  patchChatConversationReadSnapshot,
  buildChatThreadStoreKey,
  migrateLegacyChatThreadSnapshot,
  peekOfflineSnapshot,
  readOfflineSnapshot,
  removeStagedOfflineChatUpload,
  stageEncryptedOfflineChatUpload,
  subscribeOfflineSnapshot,
  stageOfflineChatUpload,
  writeOfflineSnapshot,
} from "@/lib/offline/chat-store";
import {
  enqueueChatReactionSyncMutation,
} from "@/lib/offline/mutation-queue";
import {
  cacheOfflineVideo,
  getOfflineVideoUri,
  peekOfflineVideoUri,
  rememberOfflineVideoUri,
  removeOfflineVideo,
} from "@/lib/offline/video-store";
import { showOpenSettingsPrompt } from "@/lib/permission-prompts";
import { getSafeRemoteImageUri, getUserFacingDisplayName, hasLeftBetweener } from "@/lib/profile/display-name";
import { useResponsiveMetrics } from "@/lib/responsive";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/supabase/types/database";
import { fetchUserPresence } from "@/lib/user-presence";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from "@react-native-community/netinfo";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Calendar from "expo-calendar";
import {
  AudioPlayer,
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import type { AudioRecorder } from "expo-audio";
import { BlurView } from "expo-blur";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { Image as ExpoImage } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from 'expo-haptics';
import * as WebBrowser from "expo-web-browser";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import type { FlashListRef } from "@shopify/flash-list";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
    ActivityIndicator,
    Alert,
    AppState,
    Animated,
    Easing,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { PinchGestureHandler, State } from "react-native-gesture-handler";
import { scheduleIdleTask } from "@/lib/scheduling/idle-task";
import {
  chatMessageToLocalRow,
  deserializeCachedMessages,
  localRowToChatMessage,
  safeJsonStringify,
  serializeCachedMessages,
  type CachedMessageType,
  type MessageDatabaseRow,
} from '@/lib/chat/message-mappers';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { Image as NativeImageCompressor } from 'react-native-compressor';
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Message type definition
type BetweenerVenueRow = Database["public"]["Tables"]["betweener_venues"]["Row"];
type DatePlanRow = Database["public"]["Tables"]["date_plans"]["Row"];
const buildTextOutboxRow = ({
  ownerUserId,
  threadId,
  message,
  status,
  error,
}: {
  ownerUserId: string;
  threadId: string;
  message: MessageType;
  status: ChatPendingOutboxRow['status'];
  error?: { code?: string | null; message?: string | null };
}): ChatPendingOutboxRow => {
  const now = new Date().toISOString();
  const localMessageId = message.clientMessageId ?? message.id;
  const durableOutboxStatus: ChatPendingOutboxRow['status'] = status === 'sending' ? 'queued' : status;
  return {
    id: localMessageId,
    local_message_id: localMessageId,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    payload_json:
      safeJsonStringify({
        kind: 'chat_text_send',
        senderId: ownerUserId,
        receiverId: threadId,
        text:
          message.type === 'image'
            ? message.storagePath ? '' : message.imageUrl ?? message.text
            : message.type === 'video'
            ? message.storagePath ? '' : message.videoUrl ?? message.text
            : message.text,
        messageType: message.type,
        clientMessageId: localMessageId,
        replyToMessageId: message.replyToId ?? null,
        storagePath: message.storagePath ?? null,
        metadataJson: safeJsonStringify(message),
    }) ?? '{}',
    attempt_count: 0,
    max_attempts: DURABLE_CHAT_OUTBOX_MAX_ATTEMPTS,
    next_retry_at: null,
    status: durableOutboxStatus,
    error_code: error?.code ?? null,
    error_message: error?.message ?? null,
    created_at: now,
    updated_at: now,
  };
};

const persistLocalTextOutboxState = async ({
  ownerUserId,
  threadId,
  message,
  outboxStatus,
  error,
}: {
  ownerUserId: string;
  threadId: string;
  message: MessageType;
  outboxStatus: ChatPendingOutboxRow['status'];
  error?: { code?: string | null; message?: string | null };
}) => {
  await ChatRepository.upsertMessages(ownerUserId, threadId, [
    chatMessageToLocalRow(ownerUserId, threadId, message),
  ]);
  await ChatRepository.upsertPendingOutboxItem(
    ownerUserId,
    buildTextOutboxRow({ ownerUserId, threadId, message, status: outboxStatus, error }),
  );
};

const markLocalTextOutboxStatus = async ({
  ownerUserId,
  localMessageId,
  status,
  error,
}: {
  ownerUserId: string;
  localMessageId: string;
  status: ChatPendingOutboxRow['status'];
  error?: { code?: string | null; message?: string | null };
}) => {
  await ChatRepository.markOutboxItemStatus(ownerUserId, localMessageId, status, error);
};

const flushLocalTextOutbox = async (ownerUserId: string) => {
  await ChatOutboxService.flushPending(ownerUserId);
};

const _buildMediaOutboxRow = ({
  ownerUserId,
  threadId,
  message,
  localUri,
  fileName,
  contentType,
  mediaType,
  documentSizeLabel,
  documentTypeLabel,
  byteSize,
  width,
  height,
  durationMs,
  attachmentId,
  albumItems,
}: {
  ownerUserId: string;
  threadId: string;
  message: MessageType;
  localUri: string;
  fileName: string;
  contentType: string;
  mediaType: 'image' | 'video' | 'document';
  documentSizeLabel?: string | null;
  documentTypeLabel?: string | null;
  byteSize?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  attachmentId?: string | null;
  albumItems?: {
    localUri: string;
    fileName: string;
    contentType: string;
    attachmentId: string;
    byteSize?: number | null;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
  }[];
}): ChatPendingOutboxRow => {
  const now = new Date().toISOString();
  const localMessageId = message.clientMessageId ?? message.id;
  return {
    id: localMessageId,
    local_message_id: localMessageId,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    payload_json:
      safeJsonStringify({
        kind: 'chat_media_send',
        senderId: ownerUserId,
        receiverId: threadId,
        clientMessageId: localMessageId,
        localUri,
        fileName,
        contentType,
        mediaType,
        attachmentId: attachmentId ?? createChatAttachmentId(),
        byteSize: byteSize ?? null,
        width: width ?? null,
        height: height ?? null,
        durationMs: durationMs ?? null,
        replyToMessageId: message.replyToId ?? null,
        documentName: mediaType === 'document' ? fileName : null,
        documentSizeLabel: documentSizeLabel ?? null,
        documentTypeLabel: documentTypeLabel ?? null,
        albumItems: albumItems?.length ? albumItems : undefined,
      }) ?? '{}',
    attempt_count: 0,
    max_attempts: DURABLE_CHAT_OUTBOX_MAX_ATTEMPTS,
    next_retry_at: null,
    status: 'queued',
    error_code: null,
    error_message: null,
    created_at: now,
    updated_at: now,
  };
};

const buildVoiceOutboxRow = ({
  ownerUserId,
  threadId,
  message,
  localUri,
  fileName,
  contentType,
  durationSeconds,
  waveform,
}: {
  ownerUserId: string;
  threadId: string;
  message: MessageType;
  localUri: string;
  fileName: string;
  contentType: string;
  durationSeconds: number;
  waveform: number[];
}): ChatPendingOutboxRow => {
  const now = new Date().toISOString();
  const localMessageId = message.clientMessageId ?? message.id;
  return {
    id: localMessageId,
    local_message_id: localMessageId,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    payload_json:
      safeJsonStringify({
        kind: 'chat_voice_send',
        senderId: ownerUserId,
        receiverId: threadId,
        clientMessageId: localMessageId,
        localUri,
        fileName,
        contentType,
        attachmentId: createChatAttachmentId(),
        durationSeconds,
        waveform,
        replyToMessageId: message.replyToId ?? null,
      }) ?? '{}',
    attempt_count: 0,
    max_attempts: DURABLE_CHAT_OUTBOX_MAX_ATTEMPTS,
    next_retry_at: null,
    status: 'queued',
    error_code: null,
    error_message: null,
    created_at: now,
    updated_at: now,
  };
};

const mergeOfflineMediaIntoMessage = (nextMessage: MessageType, previous?: MessageType | null): MessageType => {
  if (!previous) return nextMessage;
  if (nextMessage.type === 'image' && (nextMessage.mediaItems?.length || previous.mediaItems?.length)) {
    const previousByAttachment = new Map(
      (previous.mediaItems ?? []).map((mediaItem) => [mediaItem.attachmentId, mediaItem]),
    );
    const nextItems = (nextMessage.mediaItems ?? previous.mediaItems ?? []).map((mediaItem) => {
      const previousItem = previousByAttachment.get(mediaItem.attachmentId);
      return {
        ...mediaItem,
        localUri: mediaItem.localUri ?? previousItem?.localUri,
        signedUrl: mediaItem.signedUrl ?? previousItem?.signedUrl,
      };
    });
    return {
      ...nextMessage,
      mediaItems: nextItems,
      offlineImageUri: nextMessage.offlineImageUri ?? previous.offlineImageUri ?? nextItems[0]?.localUri,
    };
  }
  if (nextMessage.type === 'image' && !nextMessage.offlineImageUri && previous.offlineImageUri) {
    return { ...nextMessage, offlineImageUri: previous.offlineImageUri };
  }
  if (nextMessage.type === 'video' && !nextMessage.offlineVideoUri && previous.offlineVideoUri) {
    return { ...nextMessage, offlineVideoUri: previous.offlineVideoUri };
  }
  return nextMessage;
};

const PENDING_LOCAL_MESSAGE_STATUSES: ReadonlySet<NonNullable<MessageType['status']>> = new Set([
  'sending',
  'queued',
  'failed',
]);

const hasLikelyServerMatch = (
  localMessage: MessageType,
  serverMessages: MessageType[],
  currentUserId: string,
) => {
  if (localMessage.senderId !== currentUserId) return false;
  if (localMessage.clientMessageId) {
    return serverMessages.some(
      (serverMessage) =>
        serverMessage.senderId === currentUserId &&
        serverMessage.clientMessageId === localMessage.clientMessageId,
    );
  }
  const localTimestamp = localMessage.timestamp.getTime();
  return serverMessages.some((serverMessage) => {
    if (serverMessage.senderId !== currentUserId) return false;
    if (serverMessage.type !== localMessage.type) return false;
    if ((serverMessage.replyToId ?? null) !== (localMessage.replyToId ?? null)) return false;
    if (Math.abs(serverMessage.timestamp.getTime() - localTimestamp) > 120000) return false;

    switch (localMessage.type) {
      case 'voice':
        return true;
      case 'image':
        return Boolean(localMessage.imageUrl) ? localMessage.imageUrl === serverMessage.imageUrl : true;
      case 'video':
        return Boolean(localMessage.videoUrl) ? localMessage.videoUrl === serverMessage.videoUrl : true;
      case 'document':
        return localMessage.document?.name
          ? localMessage.document.name === serverMessage.document?.name
          : localMessage.text === serverMessage.text;
      case 'location':
      case 'date_plan':
      case 'mood_sticker':
      case 'text':
        return localMessage.text === serverMessage.text;
      case 'system':
        return false;
      default:
        return localMessage.text === serverMessage.text;
    }
  });
};

const mergeFetchedMessagesWithLocalPending = ({
  fetchedMessages,
  previousMessages,
  currentUserId,
  debug,
}: {
  fetchedMessages: MessageType[];
  previousMessages: MessageType[];
  currentUserId: string;
  debug?: (payload: {
    preservedPendingCount: number;
    droppedPendingCount: number;
    preservedPendingIds: string[];
    droppedPendingIds: string[];
    preservedPendingTypes: string[];
    droppedPendingTypes: string[];
  }) => void;
}) => {
  const fetchedIds = new Set(fetchedMessages.map((message) => message.id));
  const preservedPending: MessageType[] = [];
  const droppedPending: MessageType[] = [];
  const pendingLocals = previousMessages.filter((message) => {
    if (fetchedIds.has(message.id)) return false;
    if (!message.status || !PENDING_LOCAL_MESSAGE_STATUSES.has(message.status)) return false;
    if (message.senderId !== currentUserId) return false;
    if (message.type === 'system' || message.isSystem) return false;
    const shouldKeep = !message.id.startsWith('temp-')
      ? message.status === 'failed'
      : !hasLikelyServerMatch(message, fetchedMessages, currentUserId);
    if (shouldKeep) preservedPending.push(message);
    else droppedPending.push(message);
    return shouldKeep;
  });

  if (debug && (preservedPending.length > 0 || droppedPending.length > 0)) {
    debug({
      preservedPendingCount: preservedPending.length,
      droppedPendingCount: droppedPending.length,
      preservedPendingIds: preservedPending.map((message) => message.id),
      droppedPendingIds: droppedPending.map((message) => message.id),
      preservedPendingTypes: preservedPending.map((message) => `${message.type}:${message.status ?? 'none'}`),
      droppedPendingTypes: droppedPending.map((message) => `${message.type}:${message.status ?? 'none'}`),
    });
  }

  if (pendingLocals.length === 0) return fetchedMessages;

  return [...fetchedMessages, ...pendingLocals].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
};

const _mergeIncrementalFetchedMessages = (
  previousMessages: MessageType[],
  fetchedMessages: MessageType[],
) => {
  if (fetchedMessages.length === 0) return previousMessages;
  const byId = new Map(previousMessages.map((message) => [message.id, message] as const));
  const findExistingIdByClientMessageId = (clientMessageId: string, nextId: string) => {
    for (const [id, message] of byId.entries()) {
      if (id !== nextId && message.clientMessageId === clientMessageId) {
        return id;
      }
    }
    return null;
  };

  fetchedMessages.forEach((message) => {
    const existingClientId = message.clientMessageId
      ? findExistingIdByClientMessageId(message.clientMessageId, message.id)
      : null;
    const previous = byId.get(existingClientId ?? message.id);
    if (existingClientId) {
      byId.delete(existingClientId);
    }
    byId.set(
      message.id,
      previous
        ? {
            ...previous,
            ...message,
            reactions: message.reactions?.length ? message.reactions : previous.reactions,
            replyTo: message.replyTo ?? previous.replyTo,
            offlineImageUri: message.offlineImageUri ?? previous.offlineImageUri,
            offlineVideoUri: message.offlineVideoUri ?? previous.offlineVideoUri,
            voiceMessage:
              message.voiceMessage && previous.voiceMessage
                ? { ...message.voiceMessage, isPlaying: previous.voiceMessage.isPlaying }
                : message.voiceMessage ?? previous.voiceMessage,
          }
        : message,
    );
  });

  return Array.from(byId.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
};

type MediaUploadStatus = {
  id: number;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
};

const getReportEvidencePreview = (message?: MessageType | null) => {
  if (!message) return null;
  if (message.deletedForAll) return 'Deleted message';
  if (message.isViewOnce) return 'View-once message';
  if (message.type === 'text') return message.text || 'Text message';
  if (message.type === 'image') return 'Image message';
  if (message.type === 'video') return 'Video message';
  if (message.type === 'voice') return 'Voice message';
  if (message.type === 'document') return message.document?.name ? `Document: ${message.document.name}` : 'Document message';
  if (message.type === 'location') return message.location?.label ? `Location: ${message.location.label}` : 'Location message';
  if (message.type === 'date_plan') return message.dateInvite?.placeName ? `Date plan: ${message.dateInvite.placeName}` : 'Date plan message';
  if (message.type === 'mood_sticker') return message.sticker?.name ? `Sticker: ${message.sticker.name}` : 'Sticker message';
  return 'Message evidence';
};

type SystemMessageRow = {
  id: string;
  user_id: string;
  peer_user_id: string;
  text: string;
  created_at: string;
  event_type?: string | null;
  intent_request_id?: string | null;
  metadata?: any;
};

type IntentRequestSummary = {
  id: string;
  actor_id: string;
  recipient_id: string;
  type: 'connect' | 'date_request' | 'like_with_note' | 'circle_intro';
  message?: string | null;
  expires_at: string;
  status: 'pending' | 'accepted' | 'passed' | 'expired' | 'cancelled' | 'matched';
};

type ReactionRow = {
  id?: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at?: string | null;
};

// Quick reactions
const buildMapsLink = (lat: number, lng: number) =>
  `https://maps.google.com/?q=${lat},${lng}`;

const parseCoordsFromMapsUrl = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/q=([-0-9.]+),([-0-9.]+)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
};

const getStaticMapUrl = (lat: number, lng: number) => {
  if (!GOOGLE_MAPS_WEB_API_KEY) return null;
  const base = 'https://maps.googleapis.com/maps/api/staticmap';
  const center = `${lat},${lng}`;
  const marker = `color:0x0ea5a0|${center}`;
  const mapId = GOOGLE_MAPS_MAP_ID ? `&map_id=${encodeURIComponent(GOOGLE_MAPS_MAP_ID)}` : '';
  return `${base}?center=${center}&zoom=15&size=640x360&scale=2&markers=${encodeURIComponent(marker)}&key=${GOOGLE_MAPS_WEB_API_KEY}${mapId}`;
};

const parseCoordsLine = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
};

const parseLocationMessage = (rawText: string): MessageType['location'] | null => {
  const lines = rawText.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const first = lines[0] ?? '';
  const isLive = first.startsWith(LOCATION_LIVE_PREFIX);
  const isPinned = first.startsWith(LOCATION_TEXT_PREFIX);
  if (!isLive && !isPinned) return null;

  let label = '';
  let address = '';
  let coordsLine = '';
  let mapLink = '';
  let expiresAt: Date | null = null;

  if (isLive) {
    const rawExpiry = first.slice(LOCATION_LIVE_PREFIX.length).trim();
    if (rawExpiry) {
      const parsed = new Date(rawExpiry);
      if (!Number.isNaN(parsed.getTime())) {
        expiresAt = parsed;
      }
    }
    coordsLine = lines[1] ?? '';
    label = lines[2] ?? '';
    address = lines[3] ?? '';
    mapLink = lines.find((line) => line.includes('maps.google.com') || line.startsWith('http')) ?? '';
  } else {
    label = first.replace(LOCATION_TEXT_PREFIX, '').trim();
    coordsLine = lines[1] ?? '';
    mapLink = lines.find((line) => line.includes('maps.google.com') || line.startsWith('http')) ?? '';
    if (lines.length > 2 && lines[2] !== mapLink) {
      address = lines[2];
    }
  }

  const coords = parseCoordsLine(coordsLine) ?? parseCoordsFromMapsUrl(mapLink);
  if (!coords) return null;
  const resolvedLabel = label || address || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  const mapUrl = getStaticMapUrl(coords.lat, coords.lng);

  return {
    lat: coords.lat,
    lng: coords.lng,
    label: resolvedLabel,
    address: address || undefined,
    mapUrl: mapUrl || undefined,
    mapLink: mapLink || buildMapsLink(coords.lat, coords.lng),
    live: isLive,
    expiresAt,
  };
};

const buildDateInvitePayload = ({
  planId,
  parentPlanId,
  scheduledFor,
  place,
  note,
  status = 'pending',
  conciergeRequested = false,
  responseKind = 'initial',
}: {
  planId?: string | null;
  parentPlanId?: string | null;
  scheduledFor: Date;
  place: DatePlaceOption;
  note?: string | null;
  status?: DatePlanStatus;
  conciergeRequested?: boolean;
  responseKind?: DatePlanResponseKind;
}) =>
  `${DATE_PLAN_TEXT_PREFIX}${JSON.stringify({
    planId: planId || null,
    parentPlanId: parentPlanId || null,
    venueId: place.venueId ?? null,
    scheduledFor: scheduledFor.toISOString(),
    placeName: place.name,
    placeAddress: place.address ?? null,
    source: place.source,
    badges: place.badges ?? [],
    summary: place.summary ?? null,
    city: place.city ?? null,
    lat: place.lat,
    lng: place.lng,
    note: note?.trim() || null,
    responseKind,
    status,
    conciergeRequested,
  })}`;

const parseDateInviteMessage = (rawText: string): MessageType['dateInvite'] | null => {
  if (!rawText?.startsWith(DATE_PLAN_TEXT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(rawText.slice(DATE_PLAN_TEXT_PREFIX.length));
    const scheduledFor = new Date(parsed?.scheduledFor);
    if (!parsed?.placeName || Number.isNaN(scheduledFor.getTime())) return null;
    const lat = typeof parsed?.lat === 'number' ? parsed.lat : null;
    const lng = typeof parsed?.lng === 'number' ? parsed.lng : null;
    const mapUrl = lat != null && lng != null ? getStaticMapUrl(lat, lng) : null;
    const mapLink = lat != null && lng != null ? buildMapsLink(lat, lng) : null;
    return {
      planId: typeof parsed?.planId === 'string' ? parsed.planId : null,
      parentPlanId: typeof parsed?.parentPlanId === 'string' ? parsed.parentPlanId : null,
      venueId: typeof parsed?.venueId === 'string' ? parsed.venueId : null,
      scheduledFor,
      placeName: String(parsed.placeName),
      placeAddress: typeof parsed?.placeAddress === 'string' ? parsed.placeAddress : undefined,
      note: typeof parsed?.note === 'string' ? parsed.note : undefined,
      source: (parsed?.source as DatePlaceSource) || 'search',
      badges: Array.isArray(parsed?.badges) ? parsed.badges.filter((value: unknown) => typeof value === 'string') : [],
      summary: typeof parsed?.summary === 'string' ? parsed.summary : null,
      city: typeof parsed?.city === 'string' ? parsed.city : null,
      lat,
      lng,
      mapUrl,
      mapLink,
      responseKind:
        parsed?.responseKind === 'counter_time' ||
        parsed?.responseKind === 'counter_place' ||
        parsed?.responseKind === 'counter_both'
          ? parsed.responseKind
          : 'initial',
      status:
        parsed?.status === 'accepted' ||
        parsed?.status === 'declined' ||
        parsed?.status === 'cancelled' ||
        parsed?.status === 'countered'
          ? parsed.status
          : 'pending',
      conciergeRequested: Boolean(parsed?.conciergeRequested),
    };
  } catch (error) {
    console.log('[chat] date invite parse error', error);
    return null;
  }
};

const mergeDateInviteWithPlanRow = (
  invite: MessageType['dateInvite'],
  plan: DatePlanRow,
): MessageType['dateInvite'] => {
  if (!invite) return invite;
  const lat = typeof plan.lat === 'number' ? plan.lat : invite.lat ?? null;
  const lng = typeof plan.lng === 'number' ? plan.lng : invite.lng ?? null;
  return {
    ...invite,
    planId: plan.id,
    parentPlanId: plan.parent_plan_id,
    venueId: plan.venue_id,
    scheduledFor: new Date(plan.scheduled_for),
    placeName: plan.place_name,
    placeAddress: plan.place_address || undefined,
    note: plan.note || undefined,
    source: (plan.place_source as DatePlaceSource) || invite.source,
    badges: Array.isArray(plan.place_badges)
      ? plan.place_badges.filter((value): value is string => typeof value === 'string')
      : invite.badges ?? [],
    summary: plan.place_summary,
    city: plan.city,
    lat,
    lng,
    mapUrl: lat != null && lng != null ? getStaticMapUrl(lat, lng) : null,
    mapLink: lat != null && lng != null ? buildMapsLink(lat, lng) : null,
    status: (plan.status as DatePlanStatus) || invite.status || 'pending',
    conciergeRequested: Boolean(plan.concierge_requested),
    responseKind: (plan.response_kind as DatePlanResponseKind) || invite.responseKind || 'initial',
  };
};

const dedupeMessagesById = (items: MessageType[]) => {
  if (items.length <= 1) return items;
  const seen = new Set<string>();
  const deduped: MessageType[] = [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const idKey = `id:${item.id}`;
    const clientKey = item.clientMessageId ? `client:${item.clientMessageId}` : null;
    if (seen.has(idKey) || (clientKey && seen.has(clientKey))) continue;
    seen.add(idKey);
    if (clientKey) seen.add(clientKey);
    deduped.unshift(item);
  }
  return deduped;
};

type MessageRenderMeta = {
  isMyMessage: boolean;
  showAvatar: boolean;
  showAvatarSpacer: boolean;
  isGroupedWithPrev: boolean;
  isGroupedWithNext: boolean;
  showDateSeparator: boolean;
  timeLabel: string;
  imageSize?: { width: number; height: number };
  cachedImageUrl?: string;
  cachedVideoUrl?: string;
  mediaUrisByPath?: Readonly<Record<string, string>>;
  mediaFailure?: ChatMediaAccessFailure;
  viewOnceViewedByMe: boolean;
  viewOnceViewedByPeer: boolean;
  isActionPinned: boolean;
};

const buildDateQuickSlots = (baseNow: Date) => {
  const tonight = new Date(baseNow);
  tonight.setHours(baseNow.getHours() < 18 ? 19 : 20, 0, 0, 0);
  if (tonight.getTime() <= baseNow.getTime()) {
    tonight.setDate(tonight.getDate() + 1);
    tonight.setHours(19, 0, 0, 0);
  }

  const tomorrow = new Date(baseNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(19, 0, 0, 0);

  const saturdayBrunch = new Date(baseNow);
  const daysUntilSaturday = (6 - saturdayBrunch.getDay() + 7) % 7 || 7;
  saturdayBrunch.setDate(saturdayBrunch.getDate() + daysUntilSaturday);
  saturdayBrunch.setHours(11, 30, 0, 0);

  return [
    {
      id: 'tonight',
      label: tonight.getDate() === baseNow.getDate() ? 'Tonight' : 'Next evening',
      caption: tonight.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      date: tonight,
    },
    {
      id: 'tomorrow',
      label: 'Tomorrow',
      caption: 'Dinner time',
      date: tomorrow,
    },
    {
      id: 'saturday_brunch',
      label: 'Saturday brunch',
      caption: '11:30 AM',
      date: saturdayBrunch,
    },
  ] as const;
};

const getMetadataStringArray = (metadata: Record<string, unknown> | null | undefined, key: string) => {
  const value = metadata?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
};


const getDatePlaceExperience = (place: DatePlaceOption | null) => {
  if (!place) {
    return {
      vibe: null as string | null,
      trustReasons: [] as string[],
      perks: [] as string[],
      conciergeServices: [] as string[],
    };
  }

  const metadata = place.metadata ?? null;
  const vibe =
    typeof metadata?.date_vibe === 'string' && metadata.date_vibe.trim().length > 0
      ? metadata.date_vibe
      : place.source === 'betweener_pick'
      ? 'First-date ready'
      : place.source === 'preferred'
      ? 'Closer to their side'
      : place.source === 'nearby'
      ? 'Easy to get to'
      : 'Flexible meet-up';

  const defaultTrustReasons =
    place.source === 'betweener_pick'
      ? ['Public, easy-to-find venue', 'Comfort-first setup', 'Good for a first meeting']
      : ['Public location', 'Easy to find on Maps', 'Simple to adjust if plans shift'];

  const trustReasons = getMetadataStringArray(metadata, 'trust_reasons');
  const conciergeServices = getMetadataStringArray(metadata, 'concierge_services');
  const perks = [
    ...((place.badges ?? []).filter((badge) => badge !== 'Betweener Safe Venue')),
    ...(conciergeServices.length > 0 ? ['Betweener help available'] : []),
  ];

  return {
    vibe,
    trustReasons: trustReasons.length > 0 ? trustReasons : defaultTrustReasons,
    perks,
    conciergeServices,
  };
};

const buildLocationMessageText = ({
  lat,
  lng,
  label,
  address,
  live,
  expiresAt,
}: {
  lat: number;
  lng: number;
  label: string;
  address?: string | null;
  live?: boolean;
  expiresAt?: Date | null;
}) => {
  const safeLabel = label?.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  const mapLink = buildMapsLink(lat, lng);
  if (live && expiresAt) {
    return [
      `${LOCATION_LIVE_PREFIX}${expiresAt.toISOString()}`,
      `${lat},${lng}`,
      safeLabel,
      address?.trim() || '',
      mapLink,
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    `${LOCATION_TEXT_PREFIX} ${safeLabel}`,
    `${lat},${lng}`,
    address?.trim() || '',
    mapLink,
  ]
    .filter(Boolean)
    .join('\n');
};

type PlaceSuggestion = {
  id: string;
  primary: string;
  secondary?: string | null;
};

type PlaceResult = {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
};

type DatePlaceSource = 'betweener_pick' | 'nearby' | 'search' | 'preferred';

type DatePlaceOption = PlaceResult & {
  source: DatePlaceSource;
  badges?: string[];
  summary?: string | null;
  city?: string | null;
  venueId?: string | null;
  metadata?: Record<string, unknown> | null;
};

const normalizeHeicImage = async (
  asset: ImagePicker.ImagePickerAsset,
  fallbackName: string
) => {
  const mime = asset.mimeType?.toLowerCase() ?? '';
  const name = fallbackName || `image-${Date.now()}`;
  const lowerName = name.toLowerCase();
  const isHeic =
    mime === 'image/heic' ||
    mime === 'image/heif' ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif');

  if (!isHeic) {
    return {
      uri: asset.uri,
      fileName: name,
      contentType: mime || 'image/jpeg',
    };
  }

  const convertedUri = await NativeImageCompressor.compress(asset.uri, {
    compressionMethod: 'manual',
    maxWidth: 4096,
    maxHeight: 4096,
    quality: 0.92,
    input: 'uri',
    output: 'jpg',
    returnableOutputType: 'uri',
  });
  let jpegName = name.replace(/\.(heic|heif)$/i, '.jpg');
  if (!/\.[a-z0-9]+$/i.test(jpegName)) {
    jpegName = `${jpegName}.jpg`;
  }
  return {
    uri: convertedUri,
    fileName: jpegName,
    contentType: 'image/jpeg',
  };
};

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const responsive = useResponsiveMetrics();
  const attachmentSheetHeight = useMemo(() => {
    const safeVerticalSpace = Math.max(0, responsive.height - insets.top - 140);
    const preferredHeight = Math.round(safeVerticalSpace * ATTACHMENT_SHEET_SCREEN_RATIO);
    return Math.max(
      ATTACHMENT_SHEET_MIN_HEIGHT,
      Math.min(ATTACHMENT_SHEET_MAX_HEIGHT, preferredHeight)
    );
  }, [insets.top, responsive.height]);
  const styles = useMemo(
    () => createChatScreenStyles(theme, isDark, responsive, attachmentSheetHeight, insets.bottom),
    [attachmentSheetHeight, insets.bottom, isDark, responsive, theme]
  );
  const params = useLocalSearchParams();
  const hasPlacesKey = Boolean(GOOGLE_MAPS_WEB_API_KEY);
  const isChatInstanceMountedRef = useRef(true);
  // Get conversation data from params
  const routeId = params.id as string;
  const routePeerUserId = typeof params.peerUserId === 'string' ? String(params.peerUserId) : '';
  const routePeerProfileId = typeof params.peerProfileId === 'string' ? String(params.peerProfileId) : '';
  const routeRequiresProfileResolution = !routePeerUserId;
  const [peerUserId, setPeerUserId] = useState<string>(routePeerUserId || (routeRequiresProfileResolution ? '' : routeId));
  const [peerProfileId, setPeerProfileId] = useState<string | null>(routePeerProfileId || null);
  const [peerResolved, setPeerResolved] = useState(Boolean(routePeerUserId) || !routeRequiresProfileResolution);
  const userName = params.userName as string;
    const userAvatar = getSafeRemoteImageUri(typeof params.userAvatar === 'string' ? params.userAvatar : null);
  const prefillParam = typeof (params as any)?.prefill === 'string' ? String((params as any).prefill) : '';
  const lastSeenParam = params.lastSeen;
  const initialLastSeen =
    typeof lastSeenParam === 'string' ? new Date(lastSeenParam) : null;
  const initialOnline =
    params.isOnline === 'true' &&
    getAuthoritativePresenceDisplay(
      true,
      initialLastSeen && Number.isFinite(initialLastSeen.getTime()) ? initialLastSeen.toISOString() : null,
    ).online;

  const { momentUsers } = useMoments({
    currentUserId: user?.id,
    currentUserProfile: profile
      ? { full_name: profile.full_name, avatar_url: profile.avatar_url }
      : null,
  });

  // Resolve peer ids: many entry points pass profile.id, but chat tables use auth.users ids.
  // Keep both in state so we can query messages by user id and still open profile-view by profile id.
  useEffect(() => {
    isChatInstanceMountedRef.current = true;
    return () => {
      isChatInstanceMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setPeerUserId(routePeerUserId || (routeRequiresProfileResolution ? '' : routeId));
    setPeerProfileId(routePeerProfileId || null);
    setPeerResolved(Boolean(routePeerUserId) || !routeRequiresProfileResolution);
  }, [routeId, routePeerProfileId, routePeerUserId, routeRequiresProfileResolution]);

  useEffect(() => {
    if (routePeerUserId) return;
    if (!routeId) return;
    let cancelled = false;
    const t = routeRequiresProfileResolution ? null : setTimeout(() => {
      // If we couldn't resolve (profile row missing or slow network), assume routeId is an auth user id.
      if (!cancelled) {
        setPeerResolved(true);
      }
    }, 900);
    (async () => {
      try {
        if (user?.id) {
          const localThread =
            (await ChatRepository.getThreadById(user.id, routeId)) ??
            (await ChatRepository.getThreadByPeerProfileId(user.id, routeId));

          if (!cancelled && localThread?.peer_user_id) {
            setPeerProfileId(localThread.peer_profile_id ?? (routePeerProfileId || null));
            setPeerUserId(localThread.peer_user_id);
            setPeerResolved(true);
            if (t) clearTimeout(t);
            return;
          }
        }

        // 1) routeId is a profile id
        const byProfile = await supabase
          .from('profiles')
          .select('id,user_id')
          .eq('id', routeId)
          .maybeSingle();
        if (!cancelled && byProfile.data?.user_id) {
          setPeerProfileId(String((byProfile.data as any).id));
          setPeerUserId(String((byProfile.data as any).user_id));
          setPeerResolved(true);
          if (t) clearTimeout(t);
          return;
        }

        // 2) routeId is an auth user id
        const byUser = await supabase
          .from('profiles')
          .select('id,user_id')
          .eq('user_id', routeId)
          .maybeSingle();
        if (!cancelled && byUser.data?.user_id) {
          setPeerProfileId(String((byUser.data as any).id));
          setPeerUserId(String((byUser.data as any).user_id));
          setPeerResolved(true);
          if (t) clearTimeout(t);
        }
      } catch (_e) {
        // best-effort; fall back to routeId
      }
    })();
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [routeId, routePeerProfileId, routePeerUserId, routeRequiresProfileResolution, user?.id]);

  // For historical readability, most of this screen uses `conversationId` for the peer auth user id.
  const conversationId = peerUserId;
  const chatPrefsPeerUserId = peerResolved && conversationId ? conversationId : null;
  const resolvedPeerAuthUserId = chatPrefsPeerUserId;
  const activePeerMessageUserId = routeRequiresProfileResolution ? resolvedPeerAuthUserId : conversationId;
  const { rows: localObservedMessageRows, hasLoadedLocal: hasLoadedLocalThreadRows } = useChatMessages({
    ownerUserId: user?.id ?? null,
    threadId: activePeerMessageUserId ?? null,
    limit: PAGE_SIZE,
  });

  const momentUsersWithContent = useMemo(
    () => momentUsers.filter((entry) => entry.moments.length > 0),
    [momentUsers]
  );
  const [viewedMomentIds, setViewedMomentIds] = useState<Set<string>>(new Set());
  const [viewedMomentIdsReady, setViewedMomentIdsReady] = useState(false);

  const peerHasMoment = useMemo(() => {
    if (!conversationId) return false;
    const peer = momentUsers.find((entry) => entry.userId === conversationId);
    return (peer?.moments.length ?? 0) > 0;
  }, [conversationId, momentUsers]);
  const peerHasUnseenMoment = useMemo(() => {
    if (!conversationId || !viewedMomentIdsReady) return false;
    const peer = momentUsers.find((entry) => entry.userId === conversationId);
    if (!peer || peer.isOwn || peer.moments.length === 0) return false;
    return peer.moments.some((moment) => !viewedMomentIds.has(String(moment.id)));
  }, [conversationId, momentUsers, viewedMomentIds, viewedMomentIdsReady]);

  const [messages, setMessages] = useState<MessageType[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [threadBootstrapSettled, setThreadBootstrapSettled] = useState(false);
  const [remoteMessagesChecked, setRemoteMessagesChecked] = useState(false);
  const [chatSafetyVisible, setChatSafetyVisible] = useState(false);
  const [networkReady, setNetworkReady] = useState(true);
  const signChatMediaUrl = useCallback(async (storagePath: string) => {
    const { data, error } = await supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (error) throw error;
    return data?.signedUrl ?? null;
  }, []);
  const findOfflineChatMediaUri = useCallback(async (storagePath: string) => {
    const imageUri = await getOfflineImageUri(storagePath);
    if (imageUri) return imageUri;
    return getOfflineVideoUri(storagePath);
  }, []);
  const peekOfflineChatMediaUri = useCallback((storagePath: string) => (
    peekOfflineImageUri(user?.id, storagePath) ??
    peekOfflineVideoUri(user?.id, storagePath)
  ), [user?.id]);
  const {
    urisByPath: chatMediaUrisByPath,
    failuresByPath: chatMediaFailures,
    reportLoadError: reportChatMediaLoadError,
    retry: retryChatMediaPath,
    resolvePath: resolveChatMediaPath,
  } = useChatMediaAccess({
    messages,
    online: networkReady,
    signUrl: signChatMediaUrl,
    findLocalUri: findOfflineChatMediaUri,
    peekLocalUri: peekOfflineChatMediaUri,
  });
  const [peerOnline, setPeerOnline] = useState(initialOnline);
  const [peerThreadActive, setPeerThreadActive] = useState(false);
  const peerThreadActiveRef = useRef(false);
  const networkReadyRef = useRef(true);
  const refreshOutgoingReceiptStatesRef = useRef<() => void>(() => {});
  const [peerLastSeen, setPeerLastSeen] = useState<Date | null>(initialLastSeen);
  const peerLastSeenRef = useRef<Date | null>(initialLastSeen);
  const [peerProfile, setPeerProfile] = useState<{
    id: string;
    user_id: string;
    verification_level?: number | null;
    full_name?: string | null;
    avatar_url?: string | null;
    city?: string | null;
    region?: string | null;
    location?: string | null;
    online?: boolean | null;
    last_active?: string | null;
    account_state?: string | null;
    deleted_at?: string | null;
  } | null>(null);
  useEffect(() => {
    if (!peerProfile?.id) return;
    setPeerProfileId((prev) => (prev === peerProfile.id ? prev : peerProfile.id));
  }, [peerProfile?.id]);
  const [peerInterests, setPeerInterests] = useState<string[]>([]);
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const [matchAccepted, setMatchAccepted] = useState(false);
  const [conversationSignal, setConversationSignal] = useState<string | null>(null);
  const [pendingIntentRequest, setPendingIntentRequest] = useState<IntentRequestSummary | null>(null);
  const [_pendingIntentLoading, setPendingIntentLoading] = useState(false);
  const [betweenerVenues, setBetweenerVenues] = useState<DatePlaceOption[]>([]);
  const [_datePlanStateById, setDatePlanStateById] = useState<Record<string, DatePlanRow>>({});
  const [datePlannerVisible, setDatePlannerVisible] = useState(false);
  const [datePlannerMode, setDatePlannerMode] = useState<DatePlannerMode>('new');
  const [datePlannerParentPlanId, setDatePlannerParentPlanId] = useState<string | null>(null);
  const [datePlannerBaselineInvite, setDatePlannerBaselineInvite] = useState<NonNullable<MessageType['dateInvite']> | null>(null);
  const [datePlannerTab, setDatePlannerTab] = useState<'picks' | 'nearby' | 'search' | 'preferred'>('picks');
  const [datePlannerDate, setDatePlannerDate] = useState(() => {
    const base = new Date();
    base.setDate(base.getDate() + 1);
    base.setHours(19, 0, 0, 0);
    return base;
  });
  const [datePickerMode, setDatePickerMode] = useState<'date' | 'time' | null>(null);
  const [dateNote, setDateNote] = useState('');
  const [dateSearchQuery, setDateSearchQuery] = useState('');
  const [dateSuggestions, setDateSuggestions] = useState<PlaceSuggestion[]>([]);
  const [dateSelectedPlace, setDateSelectedPlace] = useState<DatePlaceOption | null>(null);
  const [dateSending, setDateSending] = useState(false);
  const [datePlanActionId, setDatePlanActionId] = useState<string | null>(null);
  const [datePlanCalendarActionId, setDatePlanCalendarActionId] = useState<string | null>(null);
  const [dateVenueDetailPlace, setDateVenueDetailPlace] = useState<DatePlaceOption | null>(null);
  const [datePlanConciergeVisible, setDatePlanConciergeVisible] = useState(false);
  const [datePlanConciergePlanId, setDatePlanConciergePlanId] = useState<string | null>(null);
  const [datePlanConciergeSelections, setDatePlanConciergeSelections] = useState<string[]>([]);
  const [datePlanConciergeNote, setDatePlanConciergeNote] = useState('');
  const [dateEligibleMeta, setDateEligibleMeta] = useState<{
    hasAcceptedConnectIntent: boolean;
    hasGuessInterest: boolean;
  }>({
    hasAcceptedConnectIntent: false,
    hasGuessInterest: false,
  });
  const [inputText, setInputText] = useState('');
  const prefillConsumedRef = useRef(false);
  const [isTyping, setIsTyping] = useState(false);
  const chatSafetyThreadKey = conversationId || routeId;
  const chatSafetyStorageKey = useMemo(
    () => (user?.id && chatSafetyThreadKey ? `${CHAT_SAFETY_SEEN_KEY}:${user.id}:${chatSafetyThreadKey}` : null),
    [chatSafetyThreadKey, user?.id],
  );
  const chatThreadCacheKey = useMemo(
    () => (user?.id && conversationId ? buildChatThreadStoreKey(user.id, conversationId) : null),
    [conversationId, user?.id],
  );
  const chatPeerStoreKey = useMemo(
    () => (user?.id && conversationId ? buildChatPeerStoreKey(user.id, conversationId) : null),
    [conversationId, user?.id],
  );
  const chatThreadCacheLoadedKeyRef = useRef<string | null>(null);
  const chatThreadLocalLoadedKeyRef = useRef<string | null>(null);
  const chatThreadLocalAppliedRevisionRef = useRef<string | null>(null);
  const subscribeWarmThreadSnapshot = useCallback(
    (onStoreChange: () => void) =>
      chatThreadCacheKey ? subscribeOfflineSnapshot(chatThreadCacheKey, onStoreChange) : () => {},
    [chatThreadCacheKey],
  );
  const getWarmThreadSnapshot = useCallback(
    () => (chatThreadCacheKey ? peekOfflineSnapshot<CachedMessageType[]>(chatThreadCacheKey) : null),
    [chatThreadCacheKey],
  );
  const warmThreadSnapshot = useSyncExternalStore<CachedMessageType[] | null>(
    subscribeWarmThreadSnapshot,
    getWarmThreadSnapshot,
    () => null,
  );

  useLayoutEffect(() => {
    // When switching threads, allow the safety prompt to re-evaluate (but it will still be deduped via AsyncStorage).
    const hasWarmThreadSnapshot = Boolean(warmThreadSnapshot && warmThreadSnapshot.length > 0);
    if (!hasWarmThreadSnapshot) {
      setMessages([]);
      setHasMore(false);
      setOldestTimestamp(null);
    }
    setMessagesLoaded(hasWarmThreadSnapshot);
    setThreadBootstrapSettled(hasWarmThreadSnapshot);
    setRemoteMessagesChecked(false);
    setChatSafetyVisible(false);
    seededMessageAnimationsRef.current = false;
    animatedMessageIdsRef.current.clear();
  }, [routeId]);

  useEffect(() => {
    if (prefillConsumedRef.current) return;
    if (!prefillParam) return;
    setInputText((prev) => (prev ? prev : prefillParam));
    prefillConsumedRef.current = true;
  }, [prefillParam]);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [showMoodStickers, setShowMoodStickers] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoicePreviewReady, setIsVoicePreviewReady] = useState(false);
  const [isVoicePreviewPlaying, setIsVoicePreviewPlaying] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [mediaUploadStatus, setMediaUploadStatus] = useState<MediaUploadStatus | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageType | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageType | null>(null);
  const [viewOnceMode, setViewOnceMode] = useState(false);
  const [viewOnceStatus, setViewOnceStatus] = useState<Record<string, { viewedByMe: boolean; viewedByPeer: boolean }>>({});
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [oldestTimestamp, setOldestTimestamp] = useState<Date | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [imageViewerLoading, setImageViewerLoading] = useState(false);
  const [imageViewerError, setImageViewerError] = useState(false);
  const [imageViewerAlbumIndex, setImageViewerAlbumIndex] = useState(0);
  const [imageViewerAlbumCount, setImageViewerAlbumCount] = useState(1);
  const [videoViewerUrl, setVideoViewerUrl] = useState<string | null>(null);
  const [cachedImageUris, setCachedImageUris] = useState<Record<string, string>>({});
  const [cachedVideoUris, setCachedVideoUris] = useState<Record<string, string>>({});
  const [documentViewer, setDocumentViewer] = useState<
    (PreparedChatDocumentPreview & { title: string }) | null
  >(null);
  const documentViewerRef = useRef<
    (PreparedChatDocumentPreview & { title: string }) | null
  >(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [locationViewerMessageId, setLocationViewerMessageId] = useState<string | null>(null);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceResult[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<Location.PermissionStatus | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [liveDurationMinutes, setLiveDurationMinutes] = useState(60);
  const [nowTick, setNowTick] = useState(Date.now());
  const [showHeaderHint, setShowHeaderHint] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>([]);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [pinnedMessageMap, setPinnedMessageMap] = useState<Record<string, MessageType>>({});
  const [chatActionToast, setChatActionToast] = useState<{
    label: string;
    icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  } | null>(null);
  const [reactionProfiles, setReactionProfiles] = useState<Record<string, { name: string; avatar?: string | null }>>({});
  const [reactionProfilesLoading, setReactionProfilesLoading] = useState(false);
  const pendingReadTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const readReceiptBatcherRef = useRef(new ChatReadReceiptBatcher({
    markRemoteRead: async (messageIds, currentUserId) =>
      await ChatThreadActionsService.markMessagesRead({ messageIds, currentUserId }),
    persistThreadRead: (currentUserId, peerUserId) => ChatRepository.markThreadRead(currentUserId, peerUserId),
    onError: (scope, error) => console.log(`[chat] ${scope} read receipt error`, error),
  }));
  const focusedThreadReadActionRef = useRef<
    (options?: { forceRemote?: boolean }) => Promise<void>
  >(async () => {});
  const focusedThreadReadCoordinatorRef = useRef(new ChatThreadReadCoordinator());
  const viewableReadCandidateIdsRef = useRef<Set<string>>(new Set());
  const pendingReceiptSyncTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingDeliveredHintTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const textSendInFlightRef = useRef(false);
  const chatActionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLocationLoading = locationLoading && !currentCoords && !locationError;
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const peerTypingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerThreadActiveLeaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerThreadLastActivityAtRef = useRef(0);
  const clearPeerThreadActiveLeaseTimer = useCallback(() => {
    if (!peerThreadActiveLeaseTimerRef.current) return;
    clearTimeout(peerThreadActiveLeaseTimerRef.current);
    peerThreadActiveLeaseTimerRef.current = null;
  }, []);
  const markPeerThreadInactive = useCallback(() => {
    clearPeerThreadActiveLeaseTimer();
    peerThreadLastActivityAtRef.current = 0;
    peerThreadActiveRef.current = false;
    setPeerThreadActive(false);
    setNowTick(Date.now());
  }, [clearPeerThreadActiveLeaseTimer, resolvedPeerAuthUserId]);
  const markPeerThreadActive = useCallback(() => {
    const activityAt = Date.now();
    peerThreadLastActivityAtRef.current = activityAt;
    peerThreadActiveRef.current = true;
    setPeerThreadActive(true);
    setNowTick(activityAt);
    clearPeerThreadActiveLeaseTimer();
    peerThreadActiveLeaseTimerRef.current = setTimeout(() => {
      peerThreadActiveLeaseTimerRef.current = null;
      if (isPeerThreadActivityLeaseFresh(peerThreadLastActivityAtRef.current)) return;
      peerThreadLastActivityAtRef.current = 0;
      peerThreadActiveRef.current = false;
      setPeerThreadActive(false);
      setNowTick(Date.now());
    }, THREAD_ACTIVITY_LEASE_MS + 50);
  }, [clearPeerThreadActiveLeaseTimer, resolvedPeerAuthUserId]);

  const setPeerTypingUntil = useCallback((typingUntilValue?: string | null) => {
    if (peerTypingClearTimerRef.current) {
      clearTimeout(peerTypingClearTimerRef.current);
      peerTypingClearTimerRef.current = null;
    }

    const typingUntil = typingUntilValue ? new Date(typingUntilValue).getTime() : 0;
    const isPeerTyping = Number.isFinite(typingUntil) && typingUntil > Date.now();
    setIsTyping(isPeerTyping);
    if (isPeerTyping) {
      peerTypingClearTimerRef.current = setTimeout(() => {
        setIsTyping(false);
        peerTypingClearTimerRef.current = null;
      }, Math.max(250, typingUntil - Date.now()));
    }
    return isPeerTyping;
  }, []);

  const applyBackendPresence = useCallback((row?: { online?: boolean | null; last_active?: string | null } | null) => {
    if (!row) return;
    const incomingLastActive = row.last_active ? new Date(row.last_active) : null;
    const currentLastSeen = peerLastSeenRef.current;
    if (incomingLastActive && Number.isFinite(incomingLastActive.getTime())) {
      if (!currentLastSeen || incomingLastActive.getTime() >= currentLastSeen.getTime()) {
        peerLastSeenRef.current = incomingLastActive;
        setPeerLastSeen(incomingLastActive);
      }
    }
    setPeerOnline(row.online === true);
    setNowTick(Date.now());
  }, [resolvedPeerAuthUserId]);

  const refreshPeerStatus = useCallback(async () => {
    if (!resolvedPeerAuthUserId) return;
    const presenceResult = await fetchUserPresence(resolvedPeerAuthUserId);

    if (!presenceResult.error) {
      applyBackendPresence(presenceResult.data as { online?: boolean | null; last_active?: string | null } | null);
    } else if (!isLikelyNetworkError(presenceResult.error)) {
      console.log('[chat] peer presence refresh error', presenceResult.error);
    }
  }, [applyBackendPresence, resolvedPeerAuthUserId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = await fetchNetInfo();
      if (!cancelled) {
        const nextReady = Boolean(state.isConnected) && state.isInternetReachable !== false;
        networkReadyRef.current = nextReady;
        setNetworkReady(nextReady);
      }
    })();
    const unsubscribe = addNetInfoListener((state) => {
      const nextReady = Boolean(state.isConnected) && state.isInternetReachable !== false;
      const wasReady = networkReadyRef.current;
      networkReadyRef.current = nextReady;
      setNetworkReady(nextReady);
      if (!nextReady) {
        setIsTyping(false);
        return;
      }
      if (!wasReady && AppState.currentState === 'active') {
        void refreshPeerStatus();
        refreshOutgoingReceiptStatesRef.current();
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refreshPeerStatus]);

  useEffect(() => {
    networkReadyRef.current = networkReady;
  }, [networkReady]);

  useEffect(() => {
    peerLastSeenRef.current = peerLastSeen;
  }, [peerLastSeen]);

  useEffect(() => {
    peerThreadActiveRef.current = peerThreadActive;
  }, [peerThreadActive]);

  useEffect(() => {
    if (!chatPeerStoreKey) return;
    let cancelled = false;
    (async () => {
      const cachedPeer = await readOfflineSnapshot<typeof peerProfile>(chatPeerStoreKey);
      if (cancelled || !cachedPeer) return;
      setPeerProfile((prev) => prev ?? cachedPeer);
    })();
    return () => {
      cancelled = true;
    };
  }, [chatPeerStoreKey]);

  useEffect(() => {
    let cancelled = false;
    const fetchPeerProfile = async () => {
      if (!resolvedPeerAuthUserId) {
        setPeerProfile(null);
        return;
      }
      const [{ data, error }, presenceResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,user_id,verification_level,full_name,avatar_url,city,region,location,online,last_active,account_state,deleted_at')
          .eq('user_id', resolvedPeerAuthUserId)
          .maybeSingle(),
        fetchUserPresence(resolvedPeerAuthUserId),
      ]);
      if (error) {
        console.log('[chat] fetch peer profile error', error);
        if (isLikelyNetworkError(error)) {
          return;
        }
      }
      if (!cancelled && data) {
        const mergedProfile = {
          ...data,
          online:
            typeof (presenceResult.data as any)?.online === 'boolean'
              ? Boolean((presenceResult.data as any)?.online)
              : (data as any)?.online ?? null,
          last_active: (presenceResult.data as any)?.last_active ?? (data as any)?.last_active ?? null,
        };
        setPeerProfile(mergedProfile);
        applyBackendPresence(mergedProfile as { online?: boolean | null; last_active?: string | null });
        if (chatPeerStoreKey) {
          void writeOfflineSnapshot(chatPeerStoreKey, mergedProfile);
        }
      } else if (!cancelled && !error) {
        setPeerProfile(null);
      }
    };
    void fetchPeerProfile();
    return () => {
      cancelled = true;
    };
  }, [applyBackendPresence, chatPeerStoreKey, resolvedPeerAuthUserId]);

  useEffect(() => {
    if (!resolvedPeerAuthUserId) return;

    if (peerProfile) {
      applyBackendPresence(peerProfile);
    }

    const channel = supabase
      .channel(`user_presence:${resolvedPeerAuthUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
          filter: `user_id=eq.${resolvedPeerAuthUserId}`,
        },
        (payload) => {
          applyBackendPresence(payload.new as { online?: boolean | null; last_active?: string | null });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyBackendPresence, peerProfile, resolvedPeerAuthUserId]);

  useEffect(() => {
    let cancelled = false;
    const fetchInterests = async () => {
      if (!profile?.id && !peerProfile?.id) {
        setMyInterests([]);
        setPeerInterests([]);
        return;
      }
      const ids = [profile?.id, peerProfile?.id].filter(Boolean) as string[];
      if (ids.length === 0) return;
      const { data } = await supabase
        .from('profile_interests')
        .select('profile_id, interests!inner(name)')
        .in('profile_id', ids);
      if (cancelled) return;
      const map: Record<string, string[]> = {};
      (data || []).forEach((row: any) => {
        const pid = row?.profile_id;
        if (!pid) return;
        let names: string[] = [];
        if (Array.isArray(row.interests)) {
          names = row.interests.map((i: any) => i?.name).filter(Boolean);
        } else if (row.interests?.name) {
          names = [row.interests.name];
        }
        if (!map[pid]) map[pid] = [];
        map[pid] = [...map[pid], ...names];
      });
      setMyInterests(profile?.id && map[profile.id] ? map[profile.id] : []);
      setPeerInterests(peerProfile?.id && map[peerProfile.id] ? map[peerProfile.id] : []);
    };
    void fetchInterests();
    return () => {
      cancelled = true;
    };
  }, [peerProfile?.id, profile?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadBetweenerVenues = async () => {
      const { data, error } = await supabase
        .from('betweener_venues')
        .select('id,name,address,city,lat,lng,badges,summary,sort_order,metadata')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) {
        console.log('[chat] load betweener venues error', error);
        return;
      }
      if (cancelled) return;
      const mapped = ((data as BetweenerVenueRow[] | null) ?? []).map((venue) => ({
        id: venue.id,
        venueId: venue.id,
        name: venue.name,
        address: venue.address,
        city: venue.city,
        lat: venue.lat,
        lng: venue.lng,
        badges: Array.isArray(venue.badges)
          ? venue.badges.filter((value): value is string => typeof value === 'string')
          : [],
        summary: venue.summary,
        source: 'betweener_pick' as const,
        metadata:
          venue.metadata && typeof venue.metadata === 'object' && !Array.isArray(venue.metadata)
            ? (venue.metadata as Record<string, unknown>)
            : null,
      }));
      setBetweenerVenues(mapped);
    };
    void loadBetweenerVenues();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkAccepted = async () => {
      if (!profile?.id || !peerProfile?.id) {
        setMatchAccepted(false);
        return;
      }
      const { data } = await supabase
        .from('matches')
        .select('id')
        .or(
          `and(user1_id.eq.${profile.id},user2_id.eq.${peerProfile.id},status.eq.ACCEPTED),and(user1_id.eq.${peerProfile.id},user2_id.eq.${profile.id},status.eq.ACCEPTED)`,
        )
        .limit(1);
      if (!cancelled) setMatchAccepted(!!(data && data.length > 0));
    };
    void checkAccepted();
    return () => {
      cancelled = true;
    };
  }, [peerProfile?.id, profile?.id]);

  const ensureMatch = useCallback(async () => {
    if (!profile?.id || !peerProfile?.id) return;
    const { data } = await supabase
      .from('matches')
      .select('id,status')
      .or(
        `and(user1_id.eq.${profile.id},user2_id.eq.${peerProfile.id}),and(user1_id.eq.${peerProfile.id},user2_id.eq.${profile.id})`,
      )
      .limit(1);
    if (data && data.length > 0) {
      const match = data[0];
      if (match.status !== 'ACCEPTED') {
        await supabase.from('matches').update({ status: 'ACCEPTED' }).eq('id', match.id);
      }
      return;
    }
    const [user1, user2] = [profile.id, peerProfile.id].sort();
    await supabase.from('matches').insert({ user1_id: user1, user2_id: user2, status: 'ACCEPTED' });
  }, [peerProfile?.id, profile?.id]);

  const refreshPendingIntent = useCallback(async () => {
    if (!profile?.id || !peerProfile?.id) {
      setPendingIntentRequest(null);
      return;
    }
    setPendingIntentLoading(true);
    try {
      await supabase.rpc('rpc_mark_expired_intent_requests');
      const { data } = await supabase
        .from('intent_requests')
        .select('id,actor_id,recipient_id,type,message,expires_at,status')
        .eq('status', 'pending')
        .eq('actor_id', peerProfile.id)
        .eq('recipient_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1);
      const row = (data && data[0]) as IntentRequestSummary | undefined;
      const expired = row?.expires_at ? Date.parse(row.expires_at) < Date.now() : false;
      setPendingIntentRequest(row && !expired ? row : null);
    } finally {
      setPendingIntentLoading(false);
    }
  }, [peerProfile?.id, profile?.id]);

  useEffect(() => {
    void refreshPendingIntent();
  }, [refreshPendingIntent]);

  useFocusEffect(
    useCallback(() => {
      void refreshPendingIntent();
    }, [refreshPendingIntent]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!conversationId || !user?.id) return () => {};
      void refreshPeerStatus();
      return () => {};
    }, [conversationId, refreshPeerStatus, user?.id]),
  );

  useEffect(() => {
    let cancelled = false;
    const loadDateEligibilityMeta = async () => {
      if (!profile?.id || !peerProfile?.id) {
        if (!cancelled) {
          setDateEligibleMeta({
            hasAcceptedConnectIntent: false,
            hasGuessInterest: false,
          });
        }
        return;
      }
      const { data, error } = await supabase
        .from('intent_requests')
        .select('type,status,metadata')
        .or(
          `and(actor_id.eq.${profile.id},recipient_id.eq.${peerProfile.id}),and(actor_id.eq.${peerProfile.id},recipient_id.eq.${profile.id})`,
        )
        .limit(24);
      if (error) {
        console.log('[chat] date eligibility fetch error', error);
        return;
      }
      if (cancelled) return;
      const rows = (data as { type: string; status: string; metadata?: Record<string, unknown> | null }[] | null) ?? [];
      setDateEligibleMeta({
        hasAcceptedConnectIntent: rows.some(
          (row) => row.type === 'connect' && (row.status === 'accepted' || row.status === 'matched'),
        ),
        hasGuessInterest: rows.some(
          (row) =>
            row.type === 'connect' &&
            String((row.metadata as any)?.source || '').toLowerCase() === 'guess_prompt',
        ),
      });
    };
    void loadDateEligibilityMeta();
    return () => {
      cancelled = true;
    };
  }, [peerProfile?.id, profile?.id]);

  const acceptPendingIntent = useCallback(async () => {
    if (!pendingIntentRequest || !profile?.id) return;
    const expired = pendingIntentRequest.expires_at
      ? Date.parse(pendingIntentRequest.expires_at) < Date.now()
      : false;
    if (expired) {
      setPendingIntentRequest(null);
      return;
    }
    const result = await decideIntentRequestOfflineSafe({
      requestId: pendingIntentRequest.id,
      decision: 'accept',
      insertAcceptanceSystemMessages: true,
      snapshotOwnerIds: [profile?.id ?? null, user?.id ?? null],
    });
    if (result.status === 'queued') return;
    await ensureMatch();
    setPendingIntentRequest(null);
    setMatchAccepted(true);
  }, [ensureMatch, pendingIntentRequest, profile?.id]);

  const passPendingIntent = useCallback(async () => {
    if (!pendingIntentRequest) return;
    const result = await decideIntentRequestOfflineSafe({
      requestId: pendingIntentRequest.id,
      decision: 'pass',
      snapshotOwnerIds: [profile?.id ?? null, user?.id ?? null],
    });
    if (result.status === 'queued') return;
    setPendingIntentRequest(null);
  }, [pendingIntentRequest]);

  useEffect(() => {
    if (!matchAccepted || !user?.id || !conversationId) {
      setConversationSignal(null);
      return;
    }
    let cancelled = false;
    const fetchMatchScore = async () => {
      const { data, count } = await supabase
        .from('messages')
        .select('created_at,sender_id', { count: 'exact' })
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${conversationId}),and(sender_id.eq.${conversationId},receiver_id.eq.${user.id})`,
        )
        .order('created_at', { ascending: true })
        .limit(50);
      if (cancelled) return;
      const messageRows = (data as any[] | null) ?? [];
      const messageCount = typeof count === 'number' ? count : messageRows.length;
      const firstReplyHours = computeFirstReplyHours(messageRows as any, user.id, conversationId);
      const interestOverlapRatio = computeInterestOverlapRatio(myInterests, peerInterests) ?? undefined;
      const bothVerified =
        (profile?.verification_level ?? 0) >= 1 && (peerProfile?.verification_level ?? 0) >= 1;
      const signal = computeConversationSignalLabel({
        rows: messageRows as any,
        userId: user.id,
        peerId: conversationId,
        messageCount,
        firstReplyHours,
        bothVerified,
        interestOverlapRatio,
      });
      setConversationSignal(signal);
    };
    void fetchMatchScore();
    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    matchAccepted,
    myInterests,
    peerInterests,
    peerProfile?.verification_level,
    profile?.verification_level,
    user?.id,
  ]);

  const peerLocationLabel = useMemo(
    () =>
      [peerProfile?.city, peerProfile?.location, peerProfile?.region]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' · '),
    [peerProfile?.city, peerProfile?.location, peerProfile?.region],
  );

  const recommendedDatePicks = useMemo(() => {
    const availablePicks = betweenerVenues.length > 0 ? betweenerVenues : [...FALLBACK_BETWEENER_DATE_PICKS];
    const preferredCity = (peerProfile?.city || peerProfile?.location || peerProfile?.region || '').toLowerCase();
    if (!preferredCity) return [...availablePicks];
    const prioritized = availablePicks.filter((venue) =>
      preferredCity.includes(venue.city.toLowerCase()),
    );
    return prioritized.length > 0
      ? [...prioritized, ...availablePicks.filter((venue) => !prioritized.includes(venue))]
      : [...availablePicks];
  }, [betweenerVenues, peerProfile?.city, peerProfile?.location, peerProfile?.region]);

  const preferredDatePicks = useMemo(() => {
    const availablePicks = betweenerVenues.length > 0 ? betweenerVenues : [...FALLBACK_BETWEENER_DATE_PICKS];
    const preferredCity = (peerProfile?.city || peerProfile?.location || peerProfile?.region || '').toLowerCase();
    if (!preferredCity) return [];
    return availablePicks.filter((venue) => preferredCity.includes(venue.city.toLowerCase()));
  }, [betweenerVenues, peerProfile?.city, peerProfile?.location, peerProfile?.region]);

  const renderedMessages = useMemo(() => dedupeMessagesById(messages), [messages]);
  const pinnedMessageIdSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  const chatMessageCount = useMemo(
    () => renderedMessages.filter((message) => !message.isSystem).length,
    [renderedMessages],
  );

  const hasActiveChat = chatMessageCount > 0;
  const hasStrongMutualSignals = Boolean(conversationSignal) && chatMessageCount >= 6;
  const canPlanDate =
    matchAccepted ||
    dateEligibleMeta.hasAcceptedConnectIntent ||
    hasActiveChat ||
    dateEligibleMeta.hasGuessInterest ||
    hasStrongMutualSignals;

  const datePlanUnlockReason = useMemo(() => {
    if (matchAccepted) return 'Unlocked because you are already matched.';
    if (dateEligibleMeta.hasAcceptedConnectIntent) return 'Unlocked because a connect request has already been accepted.';
    if (hasActiveChat) return 'Unlocked because this conversation is already active.';
    if (dateEligibleMeta.hasGuessInterest) return 'Unlocked because a prompt win already turned into interest.';
    if (hasStrongMutualSignals) return 'Unlocked because the conversation already shows strong mutual signals.';
    return 'Keep warming the connection first, then plan the date from chat.';
  }, [dateEligibleMeta.hasAcceptedConnectIntent, dateEligibleMeta.hasGuessInterest, hasActiveChat, hasStrongMutualSignals, matchAccepted]);

  const selectedDateMapUrl = useMemo(() => {
    if (!dateSelectedPlace) return null;
    return getStaticMapUrl(dateSelectedPlace.lat, dateSelectedPlace.lng);
  }, [dateSelectedPlace]);
  const dateQuickSlots = useMemo(() => buildDateQuickSlots(new Date()), [datePlannerVisible]);
  const selectedDateExperience = useMemo(() => getDatePlaceExperience(dateSelectedPlace), [dateSelectedPlace]);
  const dateVenueDetailExperience = useMemo(() => getDatePlaceExperience(dateVenueDetailPlace), [dateVenueDetailPlace]);
  const conciergePlanSummary = useMemo(
    () => (datePlanConciergePlanId ? _datePlanStateById[datePlanConciergePlanId] ?? null : null),
    [_datePlanStateById, datePlanConciergePlanId],
  );
  const datePlannerTitle = useMemo(() => {
    if (datePlannerMode === 'counter_time') return 'Suggest another time';
    if (datePlannerMode === 'counter_place') return 'Suggest another place';
    if (datePlannerMode === 'counter_both') return 'Suggest both';
    if (datePlannerMode === 'reschedule') return 'Reschedule date';
    return 'Suggest a real plan';
  }, [datePlannerMode]);
  const datePlannerSubtitle = useMemo(() => {
    if (datePlannerMode === 'counter_time') {
      return 'Keep the plan warm by proposing a time that works better.';
    }
    if (datePlannerMode === 'counter_place') {
      return 'Keep the momentum and offer a place that feels right.';
    }
    if (datePlannerMode === 'counter_both') {
      return 'Update the time and place together so the plan lands better.';
    }
    if (datePlannerMode === 'reschedule') {
      return 'Propose an updated plan without overwriting the one you already agreed on.';
    }
    return datePlanUnlockReason;
  }, [datePlanUnlockReason, datePlannerMode]);
  const visibleDatePlanIds = useMemo(
    () =>
      Array.from(
        new Set(
          renderedMessages
            .map((message) => message.dateInvite?.planId)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [renderedMessages],
  );

  const upsertDatePlanRows = useCallback((rows: DatePlanRow[]) => {
    if (rows.length === 0) return;
    setDatePlanStateById((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        next[row.id] = row;
      });
      return next;
    });
    setMessages((prev) =>
      prev.map((message) => {
        const planId = message.dateInvite?.planId;
        if (!planId) return message;
        const row = rows.find((entry) => entry.id === planId);
        if (!row || !message.dateInvite) return message;
        return {
          ...message,
          dateInvite: mergeDateInviteWithPlanRow(message.dateInvite, row),
        };
      }),
    );
  }, []);

  const refreshDatePlan = useCallback(async (planId: string) => {
    const { data, error } = await supabase
      .from('date_plans')
      .select('*')
      .eq('id', planId)
      .single();
    if (error || !data) {
      console.log('[chat] refresh date plan error', error);
      return;
    }
    upsertDatePlanRows([data as DatePlanRow]);
  }, [upsertDatePlanRows]);

  const messagesRef = useRef<MessageType[]>([]);
  const activePeerMessageUserIdRef = useRef<string | null>(null);
  const activeThreadTokenRef = useRef<symbol | null>(null);
  const fetchMessagesInFlightRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const isScreenFocusedRef = useRef(false);
  const flatListRef = useRef<FlashListRef<MessageType>>(null);
  const messageListViewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());
  const seededMessageAnimationsRef = useRef(false);
  const imageScaleBase = useRef(new Animated.Value(1)).current;
  const imagePinchScale = useRef(new Animated.Value(1)).current;
  const imageScaleRef = useRef(1);
  const imageViewerRequestRef = useRef(0);
  const imageViewerSwipeStartXRef = useRef<number | null>(null);
  const imageViewerSourceRef = useRef<{
    message: MessageType;
    renderedUrl: string;
    albumIndex: number;
  } | null>(null);
  const imageScale = useMemo(
    () => Animated.multiply(imageScaleBase, imagePinchScale),
    [imagePinchScale, imageScaleBase]
  );
  const typingAnimation = useRef(new Animated.Value(0)).current;
  const recordingAnimation = useRef(new Animated.Value(0)).current;
  const recordingRef = useRef<AudioRecorder | null>(null);
  const recordingDraftRef = useRef<{ uri: string; durationSeconds: number } | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingPulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const voiceButtonScale = useRef(new Animated.Value(1)).current;
  const voiceSoundRef = useRef<AudioPlayer | null>(null);
  const voicePreviewSoundRef = useRef<AudioPlayer | null>(null);
  const mapRef = useRef<MapView>(null);
  const inputRef = useRef<TextInput>(null);
  const reconnectToastOpacity = useRef(new Animated.Value(0)).current;
  const chatActionToastOpacity = useRef(new Animated.Value(0)).current;
  const momentPulse = useRef(new Animated.Value(0)).current;
  const momentPulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const headerHintOpacity = useRef(new Animated.Value(0)).current;
  const headerHintDismissedRef = useRef(false);
  const hiddenMessageIdsRef = useRef<Set<string>>(new Set());
  const pinnedMessageIdsRef = useRef<Set<string>>(new Set());
  const attachmentAnim = useRef(new Animated.Value(0)).current;
  const locationSheetAnim = useRef(new Animated.Value(0)).current;
  const suppressDateSuggestionRef = useRef(false);
  const pinnedBannerAnim = useRef(new Animated.Value(0)).current;
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadPresenceSessionRef = useRef<ReturnType<typeof startThreadPresenceSession> | null>(null);
  const threadSyncCoordinatorRef = useRef<ReturnType<typeof startThreadSyncCoordinator> | null>(null);
  const lastTypingBroadcastAtRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const hasAutoScrolledRef = useRef(false);
  const keyboardVisibleRef = useRef(false);
  const listMetricsRef = useRef({
    contentHeight: 0,
    layoutHeight: 0,
    offsetY: 0,
  });
  const listInteractionRef = useRef({
    dragging: false,
    momentum: false,
  });
  const wasAtBottomRef = useRef(true);
  const loadingEarlierRef = useRef(false);
  const paginationUserInitiatedRef = useRef(false);
  const scrollRequestRef = useRef<number | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpVisibleRef = useRef(false);
  const suppressSuggestionRef = useRef(false);
  const viewOnceStatusRef = useRef(viewOnceStatus);
  const initialAutoScrollDoneRef = useRef(false);
  const initialAutoScrollAttemptsRef = useRef(0);
  const lockAutoScrollUntilRef = useRef(0);

  const forceScrollToBottom = useCallback(() => {
    if (!flatListRef.current || !initialAutoScrollDoneRef.current) return;
    scheduleIdleTask(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    });
  }, []);

  useEffect(() => {
    loadingEarlierRef.current = false;
    paginationUserInitiatedRef.current = false;
    initialAutoScrollDoneRef.current = false;
    initialAutoScrollAttemptsRef.current = 0;
    lockAutoScrollUntilRef.current = Date.now() + 2500;
    hasAutoScrolledRef.current = false;
    shouldAutoScrollRef.current = true;
    wasAtBottomRef.current = true;
    listMetricsRef.current = { contentHeight: 0, layoutHeight: 0, offsetY: 0 };
    setShowJumpToBottom(false);
  }, [routeId]);

  const liveShareRef = useRef<{
    messageId: string;
    expiresAt: number;
    label: string;
    address?: string | null;
    watch?: Location.LocationSubscription | null;
  } | null>(null);

  const updateHiddenMessageIds = useCallback((ids: string[]) => {
    hiddenMessageIdsRef.current = new Set(ids);
    setHiddenMessageIds(ids);
  }, []);

  const updatePinnedMessageIds = useCallback((ids: string[]) => {
    pinnedMessageIdsRef.current = new Set(ids);
    setPinnedMessageIds(ids);
  }, []);

  const {
    isChatMuted,
    isChatPinned,
    blockStatus,
    setBlockStatus,
    chatPrefsStateRef,
    applyChatPrefsState,
    refreshLocalChatPrefs,
    fetchHiddenMessages,
    syncMessageReactions,
    hydrateLocalViewOnceStatus,
    syncViewOnceStatus,
    applyReactionUpdate,
    fetchBlockStatus,
  } = useChatThreadStateSync({
    userId: user?.id,
    routeId,
    conversationId,
    chatPrefsPeerUserId,
    activePeerMessageUserId,
    peerResolved,
    chatPrefsStorageKey: CHAT_PREFS_STORAGE_KEY,
    blockedByMeValue: BLOCKED_BY_ME,
    blockedByThemValue: BLOCKED_BY_THEM,
    hiddenMessageIds,
    hiddenMessageIdsRef,
    updateHiddenMessageIds,
    setMessages,
    setViewOnceStatus,
    viewOnceStatusRef,
  });

  const {
    messageActionsVisible,
    actionMessage,
    isActionPinned,
    canEditAction,
    canRetryActionMessage,
    canReportActionMessage,
    viewOnceModalMessage,
    viewOnceMediaUri,
    viewOnceDecrypting,
    editHistoryVisible,
    editHistoryMessage,
    editHistoryEntries,
    editHistoryLoading,
    reactionSheetVisible,
    reactionSheetEmoji,
    setReactionSheetEmoji,
    reactionSheetMessage,
    reactionSummary,
    reactionSheetList,
    openReactionSheet,
    closeReactionSheet,
    openEditHistory,
    closeEditHistory,
    openViewOnceMessage,
    closeViewOnceMessage,
    closeMessageActions,
    handleLongPress,
  } = useChatThreadMessageUi({
    currentUserId: user?.id,
    conversationId,
    renderedMessages,
    pinnedMessageIds,
    setShowReactions,
    viewOnceStatusRef,
    setViewOnceStatus,
    _chatMediaBucket: CHAT_MEDIA_BUCKET,
  });

  const isBlockedByMe = blockStatus === BLOCKED_BY_ME;
  const isBlockedByThem = blockStatus === BLOCKED_BY_THEM;
  const isChatBlocked = isBlockedByMe || isBlockedByThem;
  const peerHasLeftBetweener = hasLeftBetweener(peerProfile);
  const headerDisplayName = getUserFacingDisplayName(peerProfile, userName || 'Your match');
  const showMoments = peerHasUnseenMoment && !isChatBlocked && !peerHasLeftBetweener;
  const liveStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveUpdateRef = useRef<{ lastSentAt: number }>({ lastSentAt: 0 });

  const formatLastSeen = (date: Date) => {
    const now = Date.now();
    const diffMs = Math.max(0, now - date.getTime());
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

const resolveQueuedVideoUri = async (
  url: string,
  networkReady: boolean,
): Promise<string> => {
  if (!url) return url;
  if (url.startsWith('file://')) return url;
  const cached = await getOfflineVideoUri(url);
  if (cached) return cached;
  if (!networkReady || !url.startsWith('http')) return url;
  const downloaded = await cacheOfflineVideo(url, url);
  return downloaded || url;
};
  const latestPeerMessageAt = useMemo(() => {
    if (!resolvedPeerAuthUserId) return null;
    let latestTimestamp = 0;
    messages.forEach((message) => {
      if (message.senderId !== resolvedPeerAuthUserId || message.deletedForAll) return;
      latestTimestamp = Math.max(latestTimestamp, message.timestamp.getTime());
    });
    return latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : null;
  }, [messages, resolvedPeerAuthUserId]);
  const effectivePeerLastActiveAt = resolveLatestPeerActivityAt(
    peerLastSeen?.toISOString() ?? null,
    latestPeerMessageAt,
    nowTick,
  );
  const effectivePeerLastSeen = effectivePeerLastActiveAt
    ? new Date(effectivePeerLastActiveAt)
    : null;
  const peerPresenceDisplay = getAuthoritativePresenceDisplay(
    peerOnline,
    effectivePeerLastActiveAt,
    nowTick,
  );
  const peerThreadPresenceKind = getChatThreadPresenceKind(
    peerOnline,
    effectivePeerLastActiveAt,
    peerThreadActive,
    nowTick,
  );
  const headerStatusLabel = peerHasLeftBetweener
    ? 'No longer on Betweener'
    : isChatBlocked
      ? isBlockedByMe
        ? 'Blocked privately'
        : 'Messaging unavailable'
      : isTyping
        ? 'Typing...'
      : peerThreadPresenceKind === 'active_now'
          ? 'Active now'
      : peerThreadPresenceKind === 'recently_active'
        ? 'Recently active'
          : effectivePeerLastSeen
            ? `Last seen ${formatLastSeen(effectivePeerLastSeen)}`
            : 'Last seen unavailable';

  useEffect(() => {
  }, [
    headerStatusLabel,
    isTyping,
    effectivePeerLastActiveAt,
    peerOnline,
    peerPresenceDisplay.label,
    peerThreadActive,
    resolvedPeerAuthUserId,
  ]);
  const needsRouteIdentityResolution = routeRequiresProfileResolution && !peerResolved;
  const showThreadBootstrapLoader = false;

  useEffect(() => {
    if (!locationModalVisible) {
      locationSheetAnim.setValue(0);
      return;
    }
    Animated.timing(locationSheetAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [locationModalVisible, locationSheetAnim]);

  useFocusEffect(
    useCallback(() => {
      lockAutoScrollUntilRef.current = Date.now() + 2500;
      void refreshLocalChatPrefs();
      forceScrollToBottom();
      return () => {};
    }, [conversationId, forceScrollToBottom, refreshLocalChatPrefs])
  );

  useEffect(() => {
    let isMounted = true;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const maybeShowHint = async () => {
      try {
        const seen = await AsyncStorage.getItem(HEADER_HINT_STORAGE_KEY);
        if (!isMounted || seen || headerHintDismissedRef.current) return;
        setShowHeaderHint(true);
        Animated.timing(headerHintOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
        hideTimer = setTimeout(() => {
          Animated.timing(headerHintOpacity, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            if (isMounted) setShowHeaderHint(false);
          });
        }, 3200);
        await AsyncStorage.setItem(HEADER_HINT_STORAGE_KEY, '1');
      } catch {
        // Ignore storage failures for hint.
      }
    };
    void maybeShowHint();
    return () => {
      isMounted = false;
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [headerHintOpacity]);

  useEffect(() => {
    if (!peerHasUnseenMoment) {
      momentPulseLoop.current?.stop();
      momentPulse.setValue(0);
      return;
    }
    momentPulseLoop.current?.stop();
    momentPulse.setValue(0);
    momentPulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(momentPulse, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(momentPulse, {
          toValue: 0.35,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(momentPulse, {
          toValue: 0.85,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(momentPulse, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.delay(900),
      ])
    );
    momentPulseLoop.current.start();
    return () => {
      momentPulseLoop.current?.stop();
    };
  }, [momentPulse, peerHasUnseenMoment]);
  useEffect(() => {
    let cancelled = false;
    const syncViewedMomentIds = async () => {
      const momentIds = momentUsersWithContent.flatMap((entry) => entry.moments.map((moment) => String(moment.id))).filter(Boolean);
      if (momentIds.length === 0) {
        if (!cancelled) {
          setViewedMomentIds(new Set());
          setViewedMomentIdsReady(true);
        }
        return;
      }
      if (!cancelled) setViewedMomentIdsReady(false);
      const nextViewedIds = await fetchViewedMomentIds(momentIds);
      if (cancelled) return;
      setViewedMomentIds(nextViewedIds);
      setViewedMomentIdsReady(true);
    };
    void syncViewedMomentIds();
    return () => {
      cancelled = true;
    };
  }, [momentUsersWithContent]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const syncViewedMomentIds = async () => {
        const momentIds = momentUsersWithContent.flatMap((entry) => entry.moments.map((moment) => String(moment.id))).filter(Boolean);
        if (momentIds.length === 0) {
          if (!cancelled) {
            setViewedMomentIds(new Set());
            setViewedMomentIdsReady(true);
          }
          return;
        }
        if (!cancelled) setViewedMomentIdsReady(false);
        const nextViewedIds = await fetchViewedMomentIds(momentIds);
        if (cancelled) return;
        setViewedMomentIds(nextViewedIds);
        setViewedMomentIdsReady(true);
      };
      void syncViewedMomentIds();
      return () => {
        cancelled = true;
      };
    }, [momentUsersWithContent]),
  );

  const mapRowToMessage = useCallback(
    (row: MessageDatabaseRow): MessageType => {
      const currentUserId = user?.id ?? '';
      const isMine = row.sender_id === currentUserId;
      const status: MessageType['status'] = isMine
        ? row.is_read
          ? 'read'
          : row.delivered_at
          ? 'delivered'
          : 'sent'
        : row.is_read
        ? 'read'
        : 'delivered';
      const messageType = (row.message_type ?? 'text') as MessageType['type'];
      const isViewOnce = Boolean(row.is_view_once);
      const encryptedMedia = Boolean(row.encrypted_media);
      const encryptedMediaPath = row.encrypted_media_path ?? null;
      const encryptedKeySender = row.encrypted_key_sender ?? null;
      const encryptedKeyReceiver = row.encrypted_key_receiver ?? null;
      const encryptedKeyNonce = row.encrypted_key_nonce ?? null;
      const encryptedMediaNonce = row.encrypted_media_nonce ?? null;
      const encryptedMediaAlg = row.encrypted_media_alg ?? null;
      const encryptedMediaMime = row.encrypted_media_mime ?? null;
      const encryptedMediaSize = row.encrypted_media_size ?? null;
      const statusValue = status;
      const deletedForAll = Boolean(row.deleted_for_all);
      const deletedAt = row.deleted_at ? new Date(row.deleted_at) : null;
      const deletedBy = row.deleted_by ?? null;
      const editedAt = row.edited_at ? new Date(row.edited_at) : null;
      let waveform = DEFAULT_VOICE_WAVEFORM;
      if (Array.isArray(row.audio_waveform)) {
        waveform = row.audio_waveform;
      } else if (typeof row.audio_waveform === 'string') {
        try {
          const parsed = JSON.parse(row.audio_waveform);
          if (Array.isArray(parsed)) {
            waveform = parsed;
          }
        } catch (error) {
          console.log('[chat] audio_waveform parse error', error);
        }
      }

      let imageUrl: string | undefined;
      let videoUrl: string | undefined;
      let documentName: string | undefined;
      let documentUrl: string | undefined;
      let documentSizeLabel: string | null | undefined;
      let documentTypeLabel: string | null | undefined;
      let messageText = row.text ?? '';
      let storagePath = row.storage_path ?? null;
      let mediaItems = normalizeChatMediaItems(row.media_items);
      let location: MessageType['location'] | undefined;
      let dateInvite: MessageType['dateInvite'] | undefined;
      let sticker: MessageType['sticker'] | undefined;
      const replyToId = row.reply_to_message_id ?? null;

      let resolvedType = messageType;
      if (deletedForAll) {
        resolvedType = 'text';
        messageText = 'Message deleted';
      }
      if (!deletedForAll) {
        if (messageType === 'image') {
          if (!encryptedMedia) {
            const [firstLine, ...rest] = messageText.split('\n');
            storagePath = storagePath ?? getLegacyChatMediaStoragePath(firstLine);
            imageUrl = storagePath ? undefined : firstLine || undefined;
            messageText = rest.join('\n');
            storagePath = storagePath ?? mediaItems[0]?.storagePath ?? null;
          }
        } else if (messageType === 'video') {
          if (!encryptedMedia) {
            const [firstLine, ...rest] = messageText.split('\n');
            storagePath = storagePath ?? getLegacyChatMediaStoragePath(firstLine);
            videoUrl = storagePath ? undefined : firstLine || undefined;
            messageText = rest.join('\n');
          }
        } else if (messageType === 'text' && messageText.startsWith(`${VIDEO_TEXT_PREFIX}\n`)) {
          const [label, url, ...rest] = messageText.split('\n');
          if (url) {
            resolvedType = 'video';
            videoUrl = url;
            messageText = rest.join('\n');
          } else {
            messageText = label;
          }
        } else if (messageType === 'text' && messageText.startsWith('Video\n')) {
          const [label, url, ...rest] = messageText.split('\n');
          if (url) {
            resolvedType = 'video';
            videoUrl = url;
            messageText = rest.join('\n');
          } else {
            messageText = label;
          }
        } else if (messageType === 'document' || (messageType === 'text' && (messageText.startsWith(DOCUMENT_TEXT_PREFIX) || messageText.startsWith('dY\"Z')))) {
          const [label, url, ...rest] = messageText.split('\n');
          const prefixPattern = messageText.startsWith('dY\"Z')
            ? /^dY"Z\s*/
            : new RegExp(`^${DOCUMENT_TEXT_PREFIX}\\s*`);
          const cleanedLabel = label.replace(prefixPattern, '').trim();
          const labelParts = cleanedLabel.split(' | ').map((part) => part.trim()).filter(Boolean);
          const [namePart, sizePart, typePart] = labelParts;
          storagePath = storagePath ?? getLegacyChatMediaStoragePath(url);
          if (url || storagePath || messageType === 'document') {
            resolvedType = 'document';
            documentUrl = storagePath ? '' : url;
            documentName = namePart || 'Document';
            documentSizeLabel = sizePart ?? null;
            documentTypeLabel = typePart ?? null;
            if (!documentTypeLabel) {
              documentTypeLabel = getFileTypeLabel(null, documentName ?? documentUrl ?? null);
            }
            messageText = rest.join('\n');
          } else {
            messageText = label;
          }
        }
        if (
          messageType === 'location' ||
          (messageText.startsWith(LOCATION_TEXT_PREFIX) ||
            messageText.startsWith(LOCATION_LIVE_PREFIX))
        ) {
          const parsedLocation = parseLocationMessage(messageText);
          if (parsedLocation) {
            resolvedType = 'location';
            location = parsedLocation;
            messageText = '';
          }
        }
        if (messageType === 'text' && messageText.startsWith(DATE_PLAN_TEXT_PREFIX)) {
          const parsedDateInvite = parseDateInviteMessage(messageText);
          if (parsedDateInvite) {
            resolvedType = 'date_plan';
            dateInvite = parsedDateInvite;
            messageText = '';
          }
        }
        if (
          messageType === 'mood_sticker' ||
          messageText.startsWith(STICKER_TEXT_PREFIX)
        ) {
          const parsedSticker = parseStickerPayload(messageText) ?? parseStickerFallback(messageText);
          if (parsedSticker) {
            resolvedType = 'mood_sticker';
            sticker = {
              emoji: parsedSticker.emoji,
              name: parsedSticker.name,
              color: parsedSticker.color || STICKER_COLORS.mood,
            };
            messageText = '';
          }
        }
      }

      if (deletedForAll) {
        imageUrl = undefined;
        videoUrl = undefined;
        documentName = undefined;
        documentUrl = undefined;
        documentSizeLabel = undefined;
        documentTypeLabel = undefined;
        location = undefined;
        dateInvite = undefined;
        sticker = undefined;
      }

      return {
        id: row.id,
        clientMessageId: row.client_message_id ?? null,
        text: messageText,
        senderId: row.sender_id,
        timestamp: new Date(row.created_at),
        type: resolvedType,
        reactions: [],
        status: statusValue,
        deletedForAll,
        deletedAt,
        deletedBy,
        editedAt,
        isViewOnce,
        encryptedMedia,
        encryptedMediaPath,
        encryptedKeySender,
        encryptedKeyReceiver,
        encryptedKeyNonce,
        encryptedMediaNonce,
        encryptedMediaAlg,
        encryptedMediaMime,
        encryptedMediaSize,
        storagePath,
        mediaItems,
        mediaExpectedCount: row.media_expected_count ?? null,
        mediaGroupId: row.media_group_id ?? null,
        mediaCaption: row.media_caption ?? null,
        previewStoragePath: mediaItems[0]?.previewStoragePath ?? null,
        imageUrl,
        videoUrl,
        document:
          resolvedType === 'document' && (documentUrl || storagePath)
            ? {
                name: documentName || 'Document',
                url: documentUrl || '',
                sizeLabel: documentSizeLabel ?? null,
                typeLabel: documentTypeLabel ?? null,
              }
            : undefined,
        voiceMessage:
          resolvedType === 'voice'
            ? {
                duration: Number(row.audio_duration ?? 0),
                waveform,
                isPlaying: false,
                audioPath: row.audio_path ?? undefined,
              }
            : undefined,
        location,
        dateInvite,
        replyToId,
        sticker,
      };
    },
    [user?.id]
  );

  const reconcileDeliveredFallback = useCallback(
    (items: MessageType[]) => {
      const currentUserId = user?.id ?? '';
      let latestPeerMessageAt: number | null = null;
      return items.map((item) => {
        const isPeerMessage =
          item.senderId !== currentUserId &&
          item.type !== 'system' &&
          !String(item.id).startsWith('system:');
        if (isPeerMessage) {
          latestPeerMessageAt = item.timestamp.getTime();
          return item;
        }
        if (
          item.senderId === currentUserId &&
          item.status === 'sent' &&
          latestPeerMessageAt !== null &&
          item.timestamp.getTime() <= latestPeerMessageAt
        ) {
          return transitionMessageLifecycleRecord({
            message: item,
            event: 'delivery_confirmed',
          });
        }
        return item;
      });
    },
    [user?.id]
  );

  const mapSystemRowToMessage = useCallback((row: SystemMessageRow): MessageType => {
    return {
      id: `system:${row.id}`,
      text: row.text,
      senderId: 'system',
      timestamp: new Date(row.created_at),
      type: 'system',
      reactions: [],
      status: 'read',
      deletedForAll: false,
      isSystem: true,
    };
  }, []);

  const linkReplies = useCallback((items: MessageType[]) => {
    if (items.length === 0) return items;
    const map = new Map(items.map((msg) => [msg.id, msg]));
    return items.map((msg) => {
      if (!msg.replyToId) return msg;
      const target = map.get(msg.replyToId);
      if (!target) return msg;
      if (msg.replyTo && msg.replyTo.id === target.id) return msg;
      return { ...msg, replyTo: target };
    });
  }, []);

  const localThreadState = useChatThreadLocalState({
    rows: localObservedMessageRows,
    hasLoadedLocal: hasLoadedLocalThreadRows,
    pageSize: PAGE_SIZE,
    currentMessages: messages,
    mapRow: localRowToChatMessage,
    mergeOfflineMediaIntoMessage,
    linkReplies,
    reconcileDeliveredFallback,
    getMessageRevisionKey: getChatMessageRevisionKey,
  });

  const localHydrationActionRefs = useRef<{
    fetchHiddenMessages: () => Promise<void>;
    fetchBlockStatus: () => Promise<void>;
    fetchPinnedMessages: () => Promise<void>;
    fetchMessages: () => Promise<void>;
  }>({
    fetchHiddenMessages: async () => {},
    fetchBlockStatus: async () => {},
    fetchPinnedMessages: async () => {},
    fetchMessages: async () => {},
  });

  const hydrateCachedThreadMessages = useCallback(
    (cached: CachedMessageType[]) => {
      const hydrated = reconcileDeliveredFallback(linkReplies(deserializeCachedMessages(cached)));
      if (hydrated.length === 0) {
        return false;
      }
      setMessages((prev) => (prev.length === 0 ? hydrated : prev));
      setMessagesLoaded(true);
      setThreadBootstrapSettled(true);
      setHasMore(hydrated.length >= PAGE_SIZE);
      setOldestTimestamp(hydrated[0]?.timestamp ?? null);
      return true;
    },
    [linkReplies, reconcileDeliveredFallback],
  );

  useLayoutEffect(() => {
    if (!user?.id || !activePeerMessageUserId) return;
    if (!isScreenFocusedRef.current) return;
    if (!localThreadState.mergedMessages || localThreadState.mergedMessages.length === 0) return;
    if (!localThreadState.revision) return;

    const localKey = `${user.id}:${activePeerMessageUserId}`;
    const applyRevision = `${localKey}:${remoteMessagesChecked ? 'remote' : 'local'}:${localThreadState.revision}`;
    if (chatThreadLocalAppliedRevisionRef.current === applyRevision) return;
    chatThreadLocalAppliedRevisionRef.current = applyRevision;
    const isFirstLocalApply = chatThreadLocalLoadedKeyRef.current !== localKey;
    const hasMessageChanges = messagesRef.current !== localThreadState.mergedMessages;
    if (isFirstLocalApply) {
      chatThreadLocalLoadedKeyRef.current = localKey;
    }

    if (isFirstLocalApply || hasMessageChanges) {
      console.log('[chat][thread][local] observer-apply', {
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        messageCount: localThreadState.mergedMessages.length,
        hasMore: localThreadState.hasMore,
        remoteMessagesChecked,
      });
    }

    if (hasMessageChanges) {
      setMessages((prev) => {
        const prevKey = prev.map(getChatMessageRevisionKey).join("|");
        const nextKey = localThreadState.mergedMessages!
          .map(getChatMessageRevisionKey)
          .join("|");
        return prevKey === nextKey ? prev : localThreadState.mergedMessages!;
      });
    }
    const localViewOnceIds = localThreadState.mergedMessages
      .filter((message) => message.isViewOnce)
      .map((message) => message.id);
    if (localViewOnceIds.length > 0) {
      void hydrateLocalViewOnceStatus(localViewOnceIds);
    }
    setMessagesLoaded((prev) => (prev ? prev : true));
    setThreadBootstrapSettled((prev) => (prev ? prev : true));
    if (!remoteMessagesChecked) {
      setHasMore((prev) => (prev === localThreadState.hasMore ? prev : localThreadState.hasMore));
    }
    setOldestTimestamp((prev) => {
      const prevTime = prev?.getTime() ?? null;
      const nextTime = localThreadState.oldestTimestamp?.getTime() ?? null;
      return prevTime === nextTime ? prev : localThreadState.oldestTimestamp;
    });
  }, [
    activePeerMessageUserId,
    localThreadState,
    remoteMessagesChecked,
    hydrateLocalViewOnceStatus,
    user?.id,
  ]);

  useLayoutEffect(() => {
    if (!chatThreadCacheKey) return;
    if (!warmThreadSnapshot || warmThreadSnapshot.length === 0) return;
    chatThreadCacheLoadedKeyRef.current = chatThreadCacheKey;
    hydrateCachedThreadMessages(warmThreadSnapshot);
  }, [chatThreadCacheKey, hydrateCachedThreadMessages, warmThreadSnapshot]);

  useEffect(() => {
    if (!chatThreadCacheKey) return;
    if (chatThreadCacheLoadedKeyRef.current === chatThreadCacheKey) return;
    chatThreadCacheLoadedKeyRef.current = chatThreadCacheKey;

    let cancelled = false;
    (async () => {
      const cached =
        (await readOfflineSnapshot<CachedMessageType[]>(chatThreadCacheKey)) ??
        (user?.id && conversationId
          ? await migrateLegacyChatThreadSnapshot<CachedMessageType[]>(user.id, conversationId)
          : null);
      if (cancelled || !cached) return;
      void hydrateCachedThreadMessages(cached);
    })();

    return () => {
      cancelled = true;
    };
  }, [chatThreadCacheKey, conversationId, hydrateCachedThreadMessages, user?.id]);

  useEffect(() => {
    if (!chatThreadCacheKey) return;
    if (!messagesLoaded) return;
    void writeOfflineSnapshot(chatThreadCacheKey, serializeCachedMessages(messages));
  }, [chatThreadCacheKey, messages, messagesLoaded]);

  // Media is cached only when opened. Expo Image handles lightweight bubble
  // caching; eager full-thread downloads waste bandwidth and duplicate signed URLs.

  const markLocalMessageFailed = useCallback((messageId: string) => {
    setMessages((prev) => transitionMessageLifecycle({
      items: prev,
      messageId,
      event: 'retryable_failure',
    }));
  }, []);

  const fetchPinnedMessages = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    const { data, error } = await supabase
      .from('message_pins')
      .select('message_id')
      .eq('user_id', user.id)
      .eq('peer_id', conversationId);
    if (error) {
      console.log('[chat] fetch pinned messages error', error);
      return;
    }
    const ids = (data || []).map((row: { message_id: string }) => row.message_id);
    updatePinnedMessageIds(ids);
    if (ids.length === 0) {
      setPinnedMessageMap({});
      return;
    }
    const { data: messageRows, error: messageError } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT_FIELDS)
      .in('id', ids);
    if (messageError) {
      console.log('[chat] fetch pinned message rows error', messageError);
      return;
    }
    const mapped = linkReplies(
      (messageRows || []).map((row: MessageDatabaseRow) => mapRowToMessage(row))
    );
    setPinnedMessageMap((prev) => {
      const next: Record<string, MessageType> = { ...prev };
      const idSet = new Set(ids);
      Object.keys(next).forEach((id) => {
        if (!idSet.has(id)) delete next[id];
      });
      mapped.forEach((msg) => {
        next[msg.id] = msg;
      });
      return next;
    });
  }, [conversationId, linkReplies, mapRowToMessage, updatePinnedMessageIds, user?.id]);

  const fetchCanonicalRealtimeMessageRow = useCallback(async (row: MessageDatabaseRow) => {
    const requiresCanonicalHydration = Boolean(
      row?.id &&
        (
          row.is_view_once ||
          row.encrypted_media ||
          row.storage_path ||
          row.message_type === 'image' ||
          row.message_type === 'video' ||
          row.message_type === 'document'
        )
    );
    if (!requiresCanonicalHydration) {
      return row;
    }
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT_FIELDS)
      .eq('id', row.id)
      .maybeSingle();
    if (error) {
      console.log('[chat] canonical realtime hydration error', error);
      return row;
    }
    return (data as MessageDatabaseRow | null) ?? row;
  }, []);

  const locationViewerMessage = useMemo(() => {
    if (!locationViewerMessageId) return null;
    return renderedMessages.find((msg) => msg.id === locationViewerMessageId) ?? null;
  }, [locationViewerMessageId, renderedMessages]);
  const shouldTickLocationViewer = Boolean(
    locationModalVisible &&
      locationViewerMessage?.location?.live &&
      locationViewerMessage.location.expiresAt &&
      locationViewerMessage.location.expiresAt.getTime() > nowTick,
  );
  useEffect(() => {
    if (!peerLastSeen) return;
    const interval = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [peerLastSeen]);

  useEffect(() => {
    if (!shouldTickLocationViewer) return;
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, [shouldTickLocationViewer]);

  const fetchNearbyPlaces = useCallback(
    async (coords: { lat: number; lng: number }) => {
      if (!hasPlacesKey) return;
      setPlacesLoading(true);
      try {
        const params = new URLSearchParams({
          key: GOOGLE_MAPS_WEB_API_KEY ?? '',
          location: `${coords.lat},${coords.lng}`,
          radius: '1500',
          type: 'point_of_interest',
        });
        const res = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`);
        const json = await res.json();
        if (!Array.isArray(json?.results)) {
          setNearbyPlaces([]);
          return;
        }
        const mapped: PlaceResult[] = json.results.slice(0, 10).map((result: any) => ({
          id: result.place_id,
          name: result.name,
          address: result.vicinity || result.formatted_address || null,
          lat: result.geometry?.location?.lat,
          lng: result.geometry?.location?.lng,
        })).filter((place: PlaceResult) => typeof place.lat === 'number' && typeof place.lng === 'number');
        setNearbyPlaces(mapped);
      } catch (error) {
        console.log('[chat] nearby places error', error);
      } finally {
        setPlacesLoading(false);
      }
    },
    [hasPlacesKey]
  );

  const fetchPlaceSuggestions = useCallback(
    async (query: string, coords?: { lat: number; lng: number } | null) => {
      if (!hasPlacesKey || !query.trim()) return;
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({
          key: GOOGLE_MAPS_WEB_API_KEY ?? '',
          input: query,
          types: 'establishment',
        });
        if (coords) {
          params.set('location', `${coords.lat},${coords.lng}`);
          params.set('radius', '8000');
        }
        const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
        const json = await res.json();
        if (!Array.isArray(json?.predictions)) {
          setLocationSuggestions([]);
          return;
        }
        const mapped: PlaceSuggestion[] = json.predictions.slice(0, 6).map((prediction: any) => ({
          id: prediction.place_id,
          primary: prediction.structured_formatting?.main_text || prediction.description,
          secondary: prediction.structured_formatting?.secondary_text || null,
        }));
        setLocationSuggestions(mapped);
      } catch (error) {
        console.log('[chat] place suggestions error', error);
      } finally {
        setSearchLoading(false);
      }
    },
    [hasPlacesKey]
  );

  const fetchPlaceDetails = useCallback(
    async (placeId: string) => {
      if (!hasPlacesKey || !placeId) return null;
      try {
        const params = new URLSearchParams({
          key: GOOGLE_MAPS_WEB_API_KEY ?? '',
          place_id: placeId,
          fields: 'geometry,name,formatted_address',
        });
        const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
        const json = await res.json();
        const details = json?.result;
        if (!details?.geometry?.location) return null;
        return {
          id: placeId,
          name: details.name || 'Selected place',
          address: details.formatted_address || null,
          lat: details.geometry.location.lat,
          lng: details.geometry.location.lng,
        } as PlaceResult;
      } catch (error) {
        console.log('[chat] place details error', error);
        return null;
      }
    },
    [hasPlacesKey]
  );

  const selectPlace = useCallback((place: PlaceResult) => {
    suppressSuggestionRef.current = true;
    setSelectedPlace(place);
    setLocationSearchQuery(place.name);
    setLocationSuggestions([]);
    setLocationError(null);
  }, []);

  const handleSuggestionPress = useCallback(
    async (suggestion: PlaceSuggestion) => {
      const details = await fetchPlaceDetails(suggestion.id);
      if (!details) return;
      selectPlace(details);
    },
    [fetchPlaceDetails, selectPlace]
  );

  const handleMapPress = useCallback(
    async (event: any) => {
      const { latitude, longitude } = event.nativeEvent.coordinate || {};
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
      let label = 'Pinned location';
      let address: string | null = null;
      if (locationStatus === 'granted') {
        try {
          const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
          const street = [place?.streetNumber, place?.street].filter(Boolean).join(' ');
          label = place?.name || street || place?.city || label;
          address = [street, place?.city, place?.region].filter(Boolean).join(', ') || null;
        } catch (error) {
          console.log('[chat] reverse geocode error', error);
        }
      }
      selectPlace({
        id: `pin-${Date.now()}`,
        name: label,
        address,
        lat: latitude,
        lng: longitude,
      });
    },
    [locationStatus, selectPlace]
  );

  const handleOpenDatePlanner = useCallback(() => {
    if (!canPlanDate) {
      Alert.alert('Suggest a date', datePlanUnlockReason);
      return;
    }
    const defaultPick = recommendedDatePicks[0];
    setDatePlannerMode('new');
    setDatePlannerParentPlanId(null);
    setDatePlannerBaselineInvite(null);
    setDatePlannerTab(defaultPick ? 'picks' : hasPlacesKey ? 'search' : 'preferred');
    setDateSearchQuery('');
    setDateSuggestions([]);
    setDateNote('');
    setDatePickerMode(null);
    setDateSelectedPlace(
      defaultPick
        ? {
            ...defaultPick,
            badges: [...defaultPick.badges],
          }
        : null,
    );
    setDatePlannerVisible(true);
  }, [canPlanDate, datePlanUnlockReason, hasPlacesKey, recommendedDatePicks]);

  const openDatePlannerUnlocked = useCallback(() => {
    const defaultPick = recommendedDatePicks[0];
    setDatePlannerMode('new');
    setDatePlannerParentPlanId(null);
    setDatePlannerBaselineInvite(null);
    setDatePlannerTab(defaultPick ? 'picks' : hasPlacesKey ? 'search' : 'preferred');
    setDateSearchQuery('');
    setDateSuggestions([]);
    setDateNote('');
    setDatePickerMode(null);
    setDateSelectedPlace(
      defaultPick
        ? {
            ...defaultPick,
            badges: [...defaultPick.badges],
          }
        : null,
    );
    setDatePlannerVisible(true);
  }, [hasPlacesKey, recommendedDatePicks]);

  const openCounterDatePlanner = useCallback(
    (invite: MessageType['dateInvite'], mode: Extract<DatePlannerMode, 'counter_time' | 'counter_place' | 'counter_both'>) => {
      if (!invite?.planId) return;
      const draft = createDatePlanDraftFromInvite({ invite, mode });
      setDatePlannerMode(draft.mode);
      setDatePlannerParentPlanId(draft.parentPlanId);
      setDatePlannerBaselineInvite(draft.baselineInvite);
      setDateNote(draft.note);
      setDateSuggestions([]);
      setDateSearchQuery('');
      setDatePickerMode(null);
      setDatePlannerDate(draft.plannerDate);
      setDateSelectedPlace(draft.selectedPlace);
      setDatePlannerTab(draft.plannerTab);
      setDatePlannerVisible(true);
    },
    [],
  );
  const handleSuggestAnotherTime = useCallback((invite: MessageType['dateInvite']) => {
    openCounterDatePlanner(invite, 'counter_time');
  }, [openCounterDatePlanner]);
  const handleSuggestAnotherPlace = useCallback((invite: MessageType['dateInvite']) => {
    openCounterDatePlanner(invite, 'counter_place');
  }, [openCounterDatePlanner]);
  const handleSuggestBoth = useCallback((invite: MessageType['dateInvite']) => {
    openCounterDatePlanner(invite, 'counter_both');
  }, [openCounterDatePlanner]);

  const openRescheduleDatePlanner = useCallback((invite: MessageType['dateInvite']) => {
    if (!invite?.planId) return;
    const draft = createDatePlanDraftFromInvite({ invite, mode: 'reschedule' });
    setDatePlannerMode(draft.mode);
    setDatePlannerParentPlanId(draft.parentPlanId);
    setDatePlannerBaselineInvite(draft.baselineInvite);
    setDateNote(draft.note);
    setDateSuggestions([]);
    setDateSearchQuery('');
    setDatePickerMode(null);
    setDatePlannerDate(draft.plannerDate);
    setDateSelectedPlace(draft.selectedPlace);
    setDatePlannerTab(draft.plannerTab);
    setDatePlannerVisible(true);
  }, []);

  const handleCloseDatePlanner = useCallback(() => {
    Keyboard.dismiss();
    setDatePickerMode(null);
    setDatePlannerMode('new');
    setDatePlannerParentPlanId(null);
    setDatePlannerBaselineInvite(null);
    setDatePlannerVisible(false);
  }, []);

  const handleDatePickerChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS !== 'ios') {
        setDatePickerMode(null);
      }
      if (event.type === 'dismissed' || !selected) return;
      setDatePlannerDate((prev) => {
        const next = new Date(prev);
        if (datePickerMode === 'date') {
          next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        } else {
          next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        }
        return next;
      });
    },
    [datePickerMode],
  );

  const selectDatePlace = useCallback((place: DatePlaceOption) => {
    suppressDateSuggestionRef.current = true;
    setDateSelectedPlace(place);
    setDateSearchQuery(place.name);
    setDateSuggestions([]);
  }, []);

  const handleDateSuggestionPress = useCallback(
    async (suggestion: PlaceSuggestion) => {
      const details = await fetchPlaceDetails(suggestion.id);
      if (!details) return;
      selectDatePlace({
        ...details,
        source: 'search',
      });
    },
    [fetchPlaceDetails, selectDatePlace],
  );

  const seedPreferredAreaSearch = useCallback(() => {
    if (!peerLocationLabel) return;
    setDatePlannerTab('search');
    setDateSearchQuery(`${peerLocationLabel} restaurant`);
    setDateSuggestions([]);
  }, [peerLocationLabel]);

  const sendDateInvitation = useCallback(async () => {
    if (!dateSelectedPlace || !user?.id || !conversationId || isBlockedByMe || isChatBlocked || dateSending) {
      return;
    }
    const scheduledFor = datePlannerDate;
    if (scheduledFor.getTime() <= Date.now()) {
      Alert.alert('Suggest a date', 'Choose a future time for the suggestion.');
      return;
    }
    let responseKind: DatePlanResponseKind = 'initial';
    if (datePlannerParentPlanId && datePlannerBaselineInvite) {
      const resolvedResponseKind = resolveDatePlanResponseKind({
        baselineInvite: datePlannerBaselineInvite,
        scheduledFor,
        selectedPlace: dateSelectedPlace,
      });
      if (!resolvedResponseKind) {
        Alert.alert(
          datePlannerMode === 'reschedule' ? 'Reschedule date' : 'Update suggestion',
          'Change the time, the place, or both before sending the update.',
        );
        return;
      }
      responseKind = resolvedResponseKind;
    }
    setDateSending(true);
    const tempId = `temp-date-${Date.now()}`;
    const text = buildDateInvitePayload({
      parentPlanId: datePlannerParentPlanId,
      scheduledFor,
      place: dateSelectedPlace,
      note: dateNote,
      responseKind,
    });
    const dateInvite = parseDateInviteMessage(text);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text,
        senderId: user.id,
        timestamp: new Date(),
        type: 'date_plan',
        reactions: [],
        status: 'sending',
        dateInvite: dateInvite ?? undefined,
        replyToId: replyingTo?.id ?? null,
        replyTo: replyingTo || undefined,
      },
    ]);
    setReplyingTo(null);
    try {
      if (!peerProfile?.id) {
        throw new Error('Unable to resolve the person you are chatting with.');
      }
      const { data: sendData, error: sendError } = await ChatThreadRemoteService.sendDatePlan({
        recipientProfileId: peerProfile.id,
        scheduledForIso: scheduledFor.toISOString(),
        placeName: dateSelectedPlace.name,
        placeAddress: dateSelectedPlace.address ?? null,
        placeSource: dateSelectedPlace.source,
        placeBadges: dateSelectedPlace.badges ?? [],
        placeSummary: dateSelectedPlace.summary ?? null,
        city: dateSelectedPlace.city ?? null,
        lat: dateSelectedPlace.lat,
        lng: dateSelectedPlace.lng,
        note: dateNote.trim() || null,
        venueId: dateSelectedPlace.venueId ?? null,
        parentPlanId: datePlannerParentPlanId,
        responseKind,
        replyToMessageId: replyingTo?.id ?? null,
      });
      const created = sendData?.[0];
      if (sendError || !created?.message_id) {
        console.log('[chat] send date invitation error', sendError);
        setMessages((prev) => prev.filter((message) => message.id !== tempId));
        Alert.alert('Suggest a date', sendError?.message || 'Unable to send the suggestion right now.');
        return;
      }
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT_FIELDS)
        .eq('id', created.message_id)
        .single();
      if (messageError || !messageData) {
        console.log('[chat] fetch created date message error', messageError);
        setMessages((prev) => prev.filter((message) => message.id !== tempId));
        Alert.alert('Suggest a date', 'The suggestion was created, but chat could not refresh it yet.');
        return;
      }
      setMessages((prev) =>
        linkReplies(prev.map((message) => (message.id === tempId ? mapRowToMessage(messageData as MessageDatabaseRow) : message))),
      );
      handleCloseDatePlanner();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error) {
      console.log('[chat] unexpected date invitation error', error);
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      Alert.alert('Suggest a date', error instanceof Error ? error.message : 'Unable to send the suggestion right now.');
    } finally {
      setDateSending(false);
    }
  }, [dateNote, datePlannerBaselineInvite, datePlannerDate, datePlannerMode, datePlannerParentPlanId, dateSelectedPlace, dateSending, handleCloseDatePlanner, isBlockedByMe, isChatBlocked, linkReplies, mapRowToMessage, peerProfile?.id, replyingTo, user?.id]);

  const handleAcceptDatePlan = useCallback(async (planId: string) => {
    if (datePlanActionId === planId) return;
    setDatePlanActionId(planId);
    try {
      const { error } = await ChatThreadRemoteService.acceptDatePlan({
        planId,
      });
      if (error) {
        console.log('[chat] accept date plan error', error);
        Alert.alert('Date suggestion', error.message || 'Unable to accept this suggestion right now.');
        return;
      }
      await refreshDatePlan(planId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } finally {
      setDatePlanActionId((current) => (current === planId ? null : current));
    }
  }, [datePlanActionId, refreshDatePlan]);

  const handleCancelDatePlan = useCallback(async (planId: string) => {
    if (datePlanActionId === planId) return;
    setDatePlanActionId(planId);
    try {
      const { error } = await ChatThreadRemoteService.cancelDatePlan({
        planId,
      });
      if (error) {
        console.log('[chat] cancel date plan error', error);
        Alert.alert('Date suggestion', error.message || 'Unable to cancel this plan right now.');
        return;
      }
      await refreshDatePlan(planId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } finally {
      setDatePlanActionId((current) => (current === planId ? null : current));
    }
  }, [datePlanActionId, refreshDatePlan]);

  const handleRequestDatePlanConcierge = useCallback((planId: string) => {
    setDatePlanConciergePlanId(planId);
    setDatePlanConciergeSelections([]);
    setDatePlanConciergeNote('');
    setDatePlanConciergeVisible(true);
  }, []);

  const handleAddDatePlanToCalendar = useCallback(async (invite: MessageType['dateInvite']) => {
    if (!invite) return;
    if (Platform.OS === 'web') {
      Alert.alert('Add to Calendar', 'Calendar saving is available in the iOS and Android app.');
      return;
    }

    const actionId = invite.planId ?? `${invite.placeName}-${invite.scheduledFor.toISOString()}`;

    try {
      setDatePlanCalendarActionId(actionId);

      const startDate = new Date(invite.scheduledFor);
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 2);

      const noteParts = [
        invite.summary?.trim() || null,
        invite.note?.trim() ? `Note: ${invite.note.trim()}` : null,
        invite.mapLink ? `Maps: ${invite.mapLink}` : null,
      ].filter(Boolean);

      const result = await Calendar.createEventInCalendarAsync({
        title: userName ? `Date with ${userName}` : 'Betweener date plan',
        startDate,
        endDate,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: invite.placeAddress || invite.placeName,
        notes: noteParts.length ? noteParts.join('\n\n') : undefined,
        url: invite.mapLink ?? undefined,
      });

      if (result.action === Calendar.CalendarDialogResultActions.saved || result.action === Calendar.CalendarDialogResultActions.done) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (error: any) {
      console.log('[chat] add date plan to calendar error', error);
      Alert.alert('Add to Calendar', error?.message || 'Unable to open your calendar right now.');
    } finally {
      setDatePlanCalendarActionId(null);
    }
  }, [userName]);

  const handleCloseDatePlanConcierge = useCallback(() => {
    setDatePlanConciergeVisible(false);
    setDatePlanConciergePlanId(null);
    setDatePlanConciergeSelections([]);
    setDatePlanConciergeNote('');
  }, []);

  const toggleDatePlanConciergeSelection = useCallback((optionId: string) => {
    setDatePlanConciergeSelections((prev) =>
      prev.includes(optionId) ? prev.filter((value) => value !== optionId) : [...prev, optionId],
    );
  }, []);

  const submitDatePlanConciergeRequest = useCallback(async () => {
    const planId = datePlanConciergePlanId;
    if (!planId) return;
    if (datePlanActionId === planId) return;
    if (datePlanConciergeSelections.length === 0 && !datePlanConciergeNote.trim()) {
      Alert.alert('Betweener help', 'Choose at least one way Betweener can help or add a short note.');
      return;
    }
    setDatePlanActionId(planId);
    try {
      const selectedLabels = CONCIERGE_SERVICE_OPTIONS.filter((option) =>
        datePlanConciergeSelections.includes(option.id),
      ).map((option) => option.title);
      const conciergeBrief = [
        selectedLabels.length > 0 ? `Services: ${selectedLabels.join(', ')}` : null,
        datePlanConciergeNote.trim() ? `Member note: ${datePlanConciergeNote.trim()}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const { error } = await ChatThreadRemoteService.requestDatePlanConcierge({
        planId,
        note: conciergeBrief || null,
      });
      if (error) {
        console.log('[chat] concierge request error', error);
        Alert.alert('Betweener help', error.message || 'Unable to ask Betweener to help right now.');
        return;
      }
      await refreshDatePlan(planId);
      handleCloseDatePlanConcierge();
      Alert.alert('Betweener help', 'The Betweener team has been notified to help plan this date.');
    } finally {
      setDatePlanActionId((current) => (current === planId ? null : current));
    }
  }, [datePlanActionId, datePlanConciergeNote, datePlanConciergePlanId, datePlanConciergeSelections, handleCloseDatePlanConcierge, refreshDatePlan]);

  useEffect(() => {
    if (!(locationModalVisible || datePlannerVisible) || currentCoords) return;
    let isActive = true;
    const init = async () => {
      setLocationLoading(true);
      setLocationError(null);
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!isActive) return;
        setLocationStatus(permission.status);
        if (permission.status !== 'granted') {
          setLocationError('Enable location to show nearby places.');
          showOpenSettingsPrompt(
            'Location access',
            'Turn on location access in Settings so Betweener can show nearby places and share your location.',
          );
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!isActive) return;
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCurrentCoords(coords);
        if (locationModalVisible && !selectedPlace) {
          let label = 'Current location';
          let address: string | null = null;
          try {
            const [place] = await Location.reverseGeocodeAsync({
              latitude: coords.lat,
              longitude: coords.lng,
            });
            const street = [place?.streetNumber, place?.street].filter(Boolean).join(' ');
            label = place?.name || street || place?.city || label;
            address = [street, place?.city, place?.region].filter(Boolean).join(', ') || null;
          } catch (error) {
            console.log('[chat] reverse geocode error', error);
          }
          setSelectedPlace({
            id: 'current',
            name: label,
            address,
            lat: coords.lat,
            lng: coords.lng,
          });
        }
      } catch (error) {
        console.log('[chat] location init error', error);
        setLocationError('Unable to fetch your location.');
      } finally {
        setLocationLoading(false);
      }
    };
    void init();
    return () => {
      isActive = false;
    };
  }, [currentCoords, datePlannerVisible, locationModalVisible, selectedPlace]);

  useEffect(() => {
    if (!(locationModalVisible || datePlannerVisible) || !currentCoords) return;
    void fetchNearbyPlaces(currentCoords);
  }, [currentCoords, datePlannerVisible, fetchNearbyPlaces, locationModalVisible]);

  useEffect(() => {
    if (!locationModalVisible) return;
    const query = locationSearchQuery.trim();
    if (suppressSuggestionRef.current) {
      suppressSuggestionRef.current = false;
      setLocationSuggestions([]);
      return;
    }
    if (query.length < 2) {
      setLocationSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void fetchPlaceSuggestions(query, currentCoords);
    }, 350);
    return () => clearTimeout(timer);
  }, [currentCoords, fetchPlaceSuggestions, locationModalVisible, locationSearchQuery]);

  useEffect(() => {
    if (!datePlannerVisible) return;
    const query = dateSearchQuery.trim();
    if (suppressDateSuggestionRef.current) {
      suppressDateSuggestionRef.current = false;
      setDateSuggestions([]);
      return;
    }
    if (query.length < 2) {
      setDateSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      if (!hasPlacesKey) return;
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({
          key: GOOGLE_MAPS_WEB_API_KEY ?? '',
          input: query,
          types: 'establishment',
        });
        if (currentCoords) {
          params.set('location', `${currentCoords.lat},${currentCoords.lng}`);
          params.set('radius', '8000');
        }
        const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
        const json = await res.json();
        const mapped: PlaceSuggestion[] = Array.isArray(json?.predictions)
          ? json.predictions.slice(0, 6).map((prediction: any) => ({
              id: prediction.place_id,
              primary: prediction.structured_formatting?.main_text || prediction.description,
              secondary: prediction.structured_formatting?.secondary_text || null,
            }))
          : [];
        setDateSuggestions(mapped);
      } catch (error) {
        console.log('[chat] date place suggestions error', error);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [currentCoords, datePlannerVisible, dateSearchQuery, hasPlacesKey]);

  useEffect(() => {
    if (!selectedPlace) return;
    const region: Region = {
      latitude: selectedPlace.lat,
      longitude: selectedPlace.lng,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
    mapRef.current?.animateToRegion(region, 350);
  }, [selectedPlace]);

  const mapInitialRegion = useMemo<Region>(() => {
    if (selectedPlace) {
      return {
        latitude: selectedPlace.lat,
        longitude: selectedPlace.lng,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      };
    }
    if (currentCoords) {
      return {
        latitude: currentCoords.lat,
        longitude: currentCoords.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    return {
      latitude: 0,
      longitude: 0,
      latitudeDelta: 60,
      longitudeDelta: 60,
    };
  }, [currentCoords, selectedPlace]);

  const ensureOwnKeypair = useCallback(async () => {
    if (!user?.id) return null;
    const keypair = await getOrCreateDeviceKeypair();
    const { data, error } = await supabase
      .from('profiles')
      .select('public_key')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.log('[chat] fetch own public key error', error);
    }
    if (!data?.public_key || data.public_key !== keypair.publicKeyB64) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ public_key: keypair.publicKeyB64 })
        .eq('user_id', user.id);
      if (updateError) {
        console.log('[chat] update public key error', updateError);
      }
    }
    return keypair;
  }, [user?.id]);

  const fetchPeerPublicKey = useCallback(async () => {
    if (!conversationId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('public_key')
      .eq('user_id', conversationId)
      .maybeSingle();
    if (error) {
      console.log('[chat] fetch peer public key error', error);
      return null;
    }
    return data?.public_key ?? null;
  }, [conversationId]);

  const ensureViewOnceKeys = useCallback(async () => {
    if (!user?.id || !conversationId) return null;
    const keypair = await ensureOwnKeypair();
    if (!keypair?.publicKeyB64) {
      Alert.alert('View once unavailable', 'Your secure keys could not be created.');
      return null;
    }
    const recipientPublicKey = await fetchPeerPublicKey();
    if (!recipientPublicKey) {
      Alert.alert(
        'View once unavailable',
        'The other user has not enabled secure media yet. Ask them to open the app once.'
      );
      return null;
    }
    return { keypair, recipientPublicKey };
  }, [conversationId, ensureOwnKeypair, fetchPeerPublicKey, user?.id]);

  const _sendImageAttachment = useCallback(async ({
    imageUrl,
    storagePath,
    isViewOnce = false,
    encryptedPayload,
    encryptedPath,
    mimeType,
    size,
  }: {
    imageUrl?: string;
    storagePath?: string | null;
    isViewOnce?: boolean;
    encryptedPayload?: {
      encryptedKeySender: string;
      encryptedKeyReceiver: string;
      encryptedKeyNonce: string;
      encryptedMediaNonce: string;
    };
    encryptedPath?: string | null;
    mimeType?: string | null;
    size?: number | null;
  }) => {
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    if (!user?.id || !conversationId) return;
    const tempId = `temp-image-${Date.now()}`;
    const clientMessageId = tempId;
    const optimisticImageMessage: MessageType = {
      id: tempId,
      clientMessageId,
      text: '',
      senderId: user.id,
      timestamp: new Date(),
      type: 'image',
      isViewOnce,
      encryptedMedia: Boolean(encryptedPayload),
      encryptedMediaPath: encryptedPath ?? null,
      encryptedKeySender: encryptedPayload?.encryptedKeySender ?? null,
      encryptedKeyReceiver: encryptedPayload?.encryptedKeyReceiver ?? null,
      encryptedKeyNonce: encryptedPayload?.encryptedKeyNonce ?? null,
      encryptedMediaNonce: encryptedPayload?.encryptedMediaNonce ?? null,
      encryptedMediaAlg: encryptedPayload ? 'nacl-secretbox' : null,
      encryptedMediaMime: mimeType ?? null,
      encryptedMediaSize: size ?? null,
      reactions: [],
      status: 'sending',
      imageUrl: isViewOnce ? undefined : imageUrl,
      storagePath: storagePath ?? null,
      replyToId: replyingTo?.id ?? null,
      replyTo: replyingTo || undefined,
    };
    setMessages((prev) => [...prev, optimisticImageMessage]);
    await persistLocalTextOutboxState({
      ownerUserId: user.id,
      threadId: activePeerMessageUserId,
      message: optimisticImageMessage,
      outboxStatus: 'queued',
    }).catch((persistError) => console.log('[chat] persist image outbox error', persistError));
    setReplyingTo(null);
    setEditingMessage(null);
    if (!networkReady) {
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: transitionMessageLifecycleRecord({
          message: optimisticImageMessage,
          event: 'send_deferred',
        }),
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued image outbox error', persistError));
      setMessages((prev) => transitionMessageLifecycle({
        items: prev,
        messageId: tempId,
        event: 'send_deferred',
      }));
      return;
    }
    await flushLocalTextOutbox(user.id).catch((error) => {
      if (!isLikelyNetworkError(error)) {
        console.log('[chat] flush image outbox error', error);
      }
    });
  }, [activePeerMessageUserId, conversationId, isBlockedByMe, isChatBlocked, networkReady, replyingTo, user?.id]);

  const sendEncryptedMediaAttachment = useCallback(async ({
    uri,
    fileName,
    contentType,
    kind,
  }: {
    uri: string;
    fileName: string;
    contentType: string;
    kind: 'image' | 'video';
  }) => {
    if (isChatBlocked) {
      console.log('[chat][view-once-send] blocked', {
        kind,
        isBlockedByMe,
        isChatBlocked,
      });
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    if (!user?.id || !conversationId) {
      console.log('[chat][view-once-send] missing-user-or-conversation', {
        kind,
        hasUserId: Boolean(user?.id),
        hasConversationId: Boolean(conversationId),
      });
      return;
    }
    if (kind === 'image' && !networkReady) {
      Alert.alert(
        'Connection required',
        'View-once photos must be checked securely before encryption. Connect to the internet and try again.',
      );
      return;
    }

    const startedAt = Date.now();
    console.log('[chat][view-once-send] start', {
      kind,
      userId: user.id,
      conversationId,
      activePeerMessageUserId,
      fileName,
      contentType,
      replyingToId: replyingTo?.id ?? null,
    });

    const keys = await ensureViewOnceKeys();
    if (!keys) {
      console.log('[chat][view-once-send] keys-unavailable', {
        kind,
        userId: user.id,
        conversationId,
        durationMs: Date.now() - startedAt,
      });
      return;
    }
    const { keypair, recipientPublicKey } = keys;
    console.log('[chat][view-once-send] keys-ready', {
      kind,
      hasSenderPublicKey: Boolean(keypair.publicKeyB64),
      hasRecipientPublicKey: Boolean(recipientPublicKey),
      durationMs: Date.now() - startedAt,
    });

    const tempId = `temp-viewonce-${Date.now()}`;
    const clientMessageId = tempId;
    const attachmentId = createChatAttachmentId();
    const replyToMessage = replyingTo || undefined;
    const optimisticBase = createViewOnceOptimisticMessage({
      id: tempId,
      senderId: user.id,
      kind,
      replyTo: replyToMessage,
    });

    if (kind === 'image') {
      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        const byteSize = fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number'
          ? fileInfo.size
          : 0;
        if (byteSize <= 0) throw new Error('chat_upload_source_unavailable');
        const canonical = await moderateEncryptAndSendViewOnceImage({
          senderId: user.id,
          receiverId: activePeerMessageUserId,
          clientMessageId,
          attachmentId,
          localUri: uri,
          fileName,
          contentType,
          byteSize,
          replyToMessageId: replyToMessage?.id ?? null,
        });
        const mapped = mapRowToMessage(canonical as MessageDatabaseRow);
        await ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
          chatMessageToLocalRow(user.id, activePeerMessageUserId, mapped),
        ]);
        setMessages((prev) => appendMessage(prev, mapped));
        setReplyingTo(null);
        setEditingMessage(null);
        setViewOnceMode(false);
        console.log('[chat][view-once-send] pre-encryption-moderated', {
          kind,
          attachmentId,
          clientMessageId,
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        console.log('[chat][view-once-send] pre-encryption-error', {
          attachmentId,
          clientMessageId,
          code: (err as { code?: string })?.code ?? null,
          message: err instanceof Error ? err.message : String(err),
        }, err);
        Alert.alert('View once', getViewOnceUploadErrorMessage(kind, err));
      }
      return;
    }

    let encryptedLocalUri: string | null = null;
    try {
      const prepared = await prepareDurableViewOnceAttachment({
        kind,
        uri,
        fileName,
        contentType,
        receiverPublicKey: recipientPublicKey,
        imageLimitBytes: CHAT_ATTACHMENT_LIMITS.imageBytes,
        videoLimitBytes: CHAT_ATTACHMENT_LIMITS.viewOnceVideoBytes,
        getFileSize: async (sourceUri) => {
          const fileInfo = await FileSystem.getInfoAsync(sourceUri);
          return fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number' ? fileInfo.size : 0;
        },
        readBytes: async (sourceUri) => new Uint8Array(await (await fetch(sourceUri)).arrayBuffer()),
        encrypt: async ({ plainBytes, receiverPublicKey }) => encryptMediaBytes({
          plainBytes,
          senderKeypair: keypair,
          receiverPublicKeyB64: receiverPublicKey,
        }),
        persistCiphertext: ({ bytes, fileName: encryptedFileName }) =>
          stageEncryptedOfflineChatUpload(bytes, encryptedFileName),
      });
      encryptedLocalUri = prepared.encryptedLocalUri;
      const optimistic: MessageType = {
        ...optimisticBase,
        status: networkReady ? 'sending' : 'queued',
        encryptedKeySender: prepared.encryptedKeySenderB64,
        encryptedKeyReceiver: prepared.encryptedKeyReceiverB64,
        encryptedKeyNonce: prepared.keyNonceB64,
        encryptedMediaNonce: prepared.mediaNonceB64,
        encryptedMediaAlg: 'nacl-secretbox',
        encryptedMediaMime: contentType,
        encryptedMediaSize: prepared.encryptedByteSize,
      };
      await ChatRepository.enqueueMessageWithOutbox(
        user.id,
        activePeerMessageUserId,
        chatMessageToLocalRow(user.id, activePeerMessageUserId, optimistic),
        createQueuedViewOnceOutboxRow({
          ownerUserId: user.id,
          threadId: activePeerMessageUserId,
          message: optimistic,
          attachment: {
            localUri: prepared.encryptedLocalUri,
            fileName: prepared.encryptedFileName,
            contentType,
            attachmentId,
            byteSize: prepared.encryptedByteSize,
            attachmentType: kind,
            encryptedKeySender: prepared.encryptedKeySenderB64,
            encryptedKeyReceiver: prepared.encryptedKeyReceiverB64,
            encryptedKeyNonce: prepared.keyNonceB64,
            encryptedMediaNonce: prepared.mediaNonceB64,
            senderPublicKey: keypair.publicKeyB64,
          },
        }),
      );
      setMessages((prev) => appendMessage(prev, optimistic));
      setReplyingTo(null);
      setEditingMessage(null);
      setViewOnceMode(false);
      console.log('[chat][view-once-send] queued', {
        kind,
        attachmentId,
        clientMessageId,
        durationMs: Date.now() - startedAt,
      });
      if (networkReady) {
        void ChatOutboxService.flushPending(user.id).catch((error) => {
          if (!isLikelyNetworkError(error)) {
            console.log('[chat][view-once-send] flush-error', error);
          }
        });
      }
    } catch (err) {
      if (encryptedLocalUri) {
        await removeStagedOfflineChatUpload(encryptedLocalUri);
      }
      console.log('[chat][view-once-send] error', {
        kind,
        attachmentId,
        clientMessageId,
        durationMs: Date.now() - startedAt,
        code: (err as { code?: string })?.code ?? null,
        message: err instanceof Error ? err.message : String(err),
      }, err);
      Alert.alert(
        'View once',
        getViewOnceUploadErrorMessage(kind, err),
      );
    }
  }, [activePeerMessageUserId, conversationId, ensureViewOnceKeys, isBlockedByMe, isChatBlocked, mapRowToMessage, networkReady, replyingTo, user?.id]);

  const _sendVideoAttachment = useCallback(async ({
    videoUrl,
    storagePath,
    isViewOnce = false,
    encryptedPayload,
    encryptedPath,
    mimeType,
    size,
  }: {
    videoUrl?: string;
    storagePath?: string | null;
    isViewOnce?: boolean;
    encryptedPayload?: {
      encryptedKeySender: string;
      encryptedKeyReceiver: string;
      encryptedKeyNonce: string;
      encryptedMediaNonce: string;
    };
    encryptedPath?: string | null;
    mimeType?: string | null;
    size?: number | null;
  }) => {
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    if (!user?.id || !conversationId) return;
    const tempId = `temp-video-${Date.now()}`;
    const clientMessageId = tempId;
    const optimisticVideoMessage: MessageType = {
      id: tempId,
      clientMessageId,
      text: '',
      senderId: user.id,
      timestamp: new Date(),
      type: 'video',
      isViewOnce,
      encryptedMedia: Boolean(encryptedPayload),
      encryptedMediaPath: encryptedPath ?? null,
      encryptedKeySender: encryptedPayload?.encryptedKeySender ?? null,
      encryptedKeyReceiver: encryptedPayload?.encryptedKeyReceiver ?? null,
      encryptedKeyNonce: encryptedPayload?.encryptedKeyNonce ?? null,
      encryptedMediaNonce: encryptedPayload?.encryptedMediaNonce ?? null,
      encryptedMediaAlg: encryptedPayload ? 'nacl-secretbox' : null,
      encryptedMediaMime: mimeType ?? null,
      encryptedMediaSize: size ?? null,
      reactions: [],
      status: 'sending',
      videoUrl: isViewOnce ? undefined : videoUrl,
      storagePath: storagePath ?? null,
      replyToId: replyingTo?.id ?? null,
      replyTo: replyingTo || undefined,
    };
    setMessages((prev) => [...prev, optimisticVideoMessage]);
    await persistLocalTextOutboxState({
      ownerUserId: user.id,
      threadId: activePeerMessageUserId,
      message: optimisticVideoMessage,
      outboxStatus: 'queued',
    }).catch((persistError) => console.log('[chat] persist video outbox error', persistError));
    setReplyingTo(null);
    setEditingMessage(null);
    if (!networkReady) {
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: transitionMessageLifecycleRecord({
          message: optimisticVideoMessage,
          event: 'send_deferred',
        }),
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued video outbox error', persistError));
      setMessages((prev) => transitionMessageLifecycle({
        items: prev,
        messageId: tempId,
        event: 'send_deferred',
      }));
      return;
    }
    await flushLocalTextOutbox(user.id).catch((error) => {
      if (!isLikelyNetworkError(error)) {
        console.log('[chat] flush video outbox error', error);
      }
    });
  }, [activePeerMessageUserId, conversationId, isBlockedByMe, isChatBlocked, networkReady, replyingTo, user?.id]);

  const queueMediaAttachment = useCallback(async ({
    localUri,
    fileName,
    contentType,
    mediaType,
    documentSizeLabel,
    documentTypeLabel,
    byteSize,
    width,
    height,
    durationMs,
  }: {
    localUri: string;
    fileName: string;
    contentType: string;
    mediaType: 'image' | 'video' | 'document';
    documentSizeLabel?: string | null;
    documentTypeLabel?: string | null;
    byteSize?: number | null;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
  }) => {
    if (!user?.id || !conversationId) return;
    const stagedUri = await stageOfflineChatUpload(localUri, fileName);
    const attachmentId = createChatAttachmentId();
    let preview: Awaited<ReturnType<typeof createChatAttachmentPreview>>;
    try {
      preview = await createChatAttachmentPreview({
        attachmentId,
        kind: mediaType,
        localUri: stagedUri,
        width,
        height,
      });
    } catch (error) {
      await removeStagedOfflineChatUpload(stagedUri);
      throw error;
    }
    const tempId = `temp-${mediaType}-${Date.now()}`;
    const clientMessageId = tempId;
    const optimistic = createQueuedMediaMessage({
      id: clientMessageId,
      senderId: user.id,
      mediaType,
      stagedUri,
      fileName,
      replyTo: replyingTo || undefined,
      documentSizeLabel,
      documentTypeLabel,
      previewUri: preview?.localUri ?? null,
    });

    setMessages((prev) => [...prev, optimistic]);
    setReplyingTo(null);
    setEditingMessage(null);
    setViewOnceMode(false);

    try {
      await ChatRepository.enqueueMessageWithOutbox(
        user.id,
        activePeerMessageUserId,
        chatMessageToLocalRow(user.id, activePeerMessageUserId, optimistic),
        createQueuedMediaOutboxRow({
          ownerUserId: user.id,
          threadId: activePeerMessageUserId,
          message: optimistic,
          file: {
            localUri: stagedUri,
            fileName,
            contentType,
            attachmentId,
            byteSize,
            width,
            height,
            durationMs,
            previewLocalUri: preview?.localUri ?? null,
            previewContentType: preview?.mimeType ?? null,
            previewByteSize: preview?.byteSize ?? null,
            previewWidth: preview?.width ?? null,
            previewHeight: preview?.height ?? null,
          },
          mediaType,
          documentSizeLabel: documentSizeLabel ?? null,
          documentTypeLabel: documentTypeLabel ?? null,
        }),
      );
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== clientMessageId));
      await Promise.all([
        removeStagedOfflineChatUpload(stagedUri),
        removeChatAttachmentPreview(preview?.localUri),
      ]);
      throw error;
    }
    void ChatOutboxService.flushPending(user.id).catch((error) => {
      if (!isLikelyNetworkError(error)) {
        console.log('[chat] flush queued media outbox error', error);
      }
    });

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [activePeerMessageUserId, replyingTo, user?.id]);

  const queueMediaAlbum = useCallback(async (items: {
    localUri: string;
    fileName: string;
    contentType: string;
    mediaType: 'image' | 'video';
    byteSize?: number | null;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
  }[], caption = '') => {
    if (!user?.id || !activePeerMessageUserId || items.length < 2) return;
    const selectedItems = items.slice(0, 10);
    const stagedItems: {
      localUri: string;
      fileName: string;
      contentType: string;
      byteSize?: number | null;
      width?: number | null;
      height?: number | null;
      attachmentId: string;
      previewLocalUri: string | null;
      previewContentType: 'image/jpeg' | null;
      previewByteSize: number | null;
      previewWidth: number | null;
      previewHeight: number | null;
      mediaType: 'image' | 'video';
      durationMs?: number | null;
    }[] = [];
    try {
      for (let index = 0; index < selectedItems.length; index += 1) {
        const mediaItem = selectedItems[index];
        const attachmentId = createChatAttachmentId();
        const localUri = await stageOfflineChatUpload(mediaItem.localUri, `${index}-${mediaItem.fileName}`);
        try {
          const preview = await createChatAttachmentPreview({
            attachmentId,
            kind: mediaItem.mediaType,
            localUri,
            width: mediaItem.width,
            height: mediaItem.height,
          });
          stagedItems.push({
            ...mediaItem,
            localUri,
            attachmentId,
            previewLocalUri: preview?.localUri ?? null,
            previewContentType: preview?.mimeType ?? null,
            previewByteSize: preview?.byteSize ?? null,
            previewWidth: preview?.width ?? null,
            previewHeight: preview?.height ?? null,
          });
        } catch (error) {
          await removeStagedOfflineChatUpload(localUri);
          throw error;
        }
      }
    } catch (error) {
      await Promise.all(stagedItems.flatMap((mediaItem) => [
        removeStagedOfflineChatUpload(mediaItem.localUri),
        removeChatAttachmentPreview(mediaItem.previewLocalUri),
      ]));
      throw error;
    }
    const mediaGroupId = createChatAttachmentId();
    const clientMessageId = `temp-album-${mediaGroupId}`;
    const mediaItems: ChatMediaItem[] = stagedItems.map((mediaItem, index) => ({
      attachmentId: mediaItem.attachmentId,
      index,
      type: mediaItem.mediaType,
      storagePath: '',
      mimeType: mediaItem.contentType,
      width: mediaItem.width ?? null,
      height: mediaItem.height ?? null,
      byteSize: mediaItem.byteSize ?? null,
      localUri: mediaItem.localUri,
      localPreviewUri: mediaItem.previewLocalUri,
      transferState: 'queued',
      uploadProgress: 0,
    }));
    const optimistic: MessageType = {
      id: clientMessageId,
      clientMessageId,
      text: caption.trim(),
      senderId: user.id,
      timestamp: new Date(),
      // Album bubbles use the image container while each tile retains its own
      // image/video type and opens the correct viewer.
      type: 'image',
      reactions: [],
      status: 'queued',
      imageUrl: stagedItems[0].localUri,
      offlineImageUri: stagedItems[0].localUri,
      mediaItems,
      mediaExpectedCount: stagedItems.length,
      mediaGroupId,
      mediaCaption: caption.trim() || null,
      replyToId: replyingTo?.id ?? null,
      replyTo: replyingTo || undefined,
    };
    setMessages((current) => [...current, optimistic]);
    setReplyingTo(null);
    setEditingMessage(null);
    setViewOnceMode(false);

    try {
      await ChatRepository.enqueueMessageWithOutbox(
        user.id,
        activePeerMessageUserId,
        chatMessageToLocalRow(user.id, activePeerMessageUserId, optimistic),
        createQueuedMediaOutboxRow({
          ownerUserId: user.id,
          threadId: activePeerMessageUserId,
          message: optimistic,
          file: {
            localUri: stagedItems[0].localUri,
            fileName: stagedItems[0].fileName,
            contentType: stagedItems[0].contentType,
            attachmentId: stagedItems[0].attachmentId,
            byteSize: stagedItems[0].byteSize ?? null,
            width: stagedItems[0].width ?? null,
            height: stagedItems[0].height ?? null,
            durationMs: stagedItems[0].durationMs ?? null,
            mediaType: stagedItems[0].mediaType,
          },
          mediaType: stagedItems[0].mediaType,
          albumItems: stagedItems,
          mediaGroupId,
          albumCaption: caption.trim() || null,
        }),
      );
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== clientMessageId));
      await Promise.all(
        stagedItems.flatMap((mediaItem) => [
          removeStagedOfflineChatUpload(mediaItem.localUri),
          removeChatAttachmentPreview(mediaItem.previewLocalUri),
        ]),
      );
      throw error;
    }
    void ChatOutboxService.flushPending(user.id).catch((error) => {
      if (!isLikelyNetworkError(error)) console.log('[chat] flush queued media album error', error);
    });
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [activePeerMessageUserId, replyingTo, user?.id]);

  const sendLocationMessage = useCallback(async ({
    lat,
    lng,
    label,
    address,
    live,
    expiresAt,
  }: {
    lat: number;
    lng: number;
    label: string;
    address?: string | null;
    live?: boolean;
    expiresAt?: Date | null;
  }) => {
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return null;
    }
    if (!user?.id || !activePeerMessageUserId) return null;
    const tempId = `temp-location-${Date.now()}`;
    const clientMessageId = tempId;
    const text = buildLocationMessageText({
      lat,
      lng,
      label,
      address,
      live,
      expiresAt,
    });
    const mapUrl = getStaticMapUrl(lat, lng);
    const mapLink = buildMapsLink(lat, lng);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        clientMessageId,
        text,
        senderId: user.id,
        timestamp: new Date(),
        type: 'location',
        reactions: [],
        status: 'sending',
        location: {
          lat,
          lng,
          label,
          address: address || undefined,
          mapUrl: mapUrl || undefined,
          mapLink,
          live: Boolean(live),
          expiresAt: live ? expiresAt ?? null : null,
        },
        replyToId: replyingTo?.id ?? null,
        replyTo: replyingTo || undefined,
      },
    ]);
    const optimisticLocationMessage: MessageType = {
      id: tempId,
      clientMessageId,
      text,
      senderId: user.id,
      timestamp: new Date(),
      type: 'location',
      reactions: [],
      status: 'sending',
      location: {
        lat,
        lng,
        label,
        address: address || undefined,
        mapUrl: mapUrl || undefined,
        mapLink,
        live: Boolean(live),
        expiresAt: live ? expiresAt ?? null : null,
      },
      replyToId: replyingTo?.id ?? null,
      replyTo: replyingTo || undefined,
    };
    setReplyingTo(null);

    if (live) {
      if (!networkReady) {
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        Alert.alert('Live location', 'Live location needs an active connection.');
        return null;
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          text,
          client_message_id: clientMessageId,
          sender_id: user.id,
          receiver_id: activePeerMessageUserId,
          is_read: false,
          message_type: 'location',
          reply_to_message_id: replyingTo?.id ?? null,
        })
        .select(MESSAGE_SELECT_FIELDS)
        .single();

      if (error || !data) {
        console.log('[chat] send live location error', error);
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        return null;
      }

      const nextMessage = mapRowToMessage(data as MessageDatabaseRow);
      void ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
        chatMessageToLocalRow(user.id, activePeerMessageUserId, nextMessage),
      ]).catch((persistError) => console.log('[chat] persist sent live location error', persistError));
      setMessages((prev) =>
        linkReplies(prev.map((msg) => (msg.id === tempId ? nextMessage : msg))),
      );
      return data.id as string;
    }

    await persistLocalTextOutboxState({
      ownerUserId: user.id,
      threadId: activePeerMessageUserId,
      message: optimisticLocationMessage,
      outboxStatus: 'sending',
    }).catch((persistError) => console.log('[chat] persist location outbox error', persistError));

    if (!networkReady) {
      const queuedMessage = transitionMessageLifecycleRecord({
        message: optimisticLocationMessage,
        event: 'send_deferred',
      });
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: queuedMessage,
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued location outbox error', persistError));
      setMessages((prev) => transitionMessageLifecycle({
        items: prev,
        messageId: tempId,
        event: 'send_deferred',
      }));
      return null;
    }

    await flushLocalTextOutbox(user.id).catch((error) => {
      if (!isLikelyNetworkError(error)) {
        console.log('[chat] flush location outbox error', error);
      }
    });
    return null;
  }, [activePeerMessageUserId, isBlockedByMe, isChatBlocked, linkReplies, mapRowToMessage, networkReady, replyingTo, user?.id]);

  const updateLiveLocationMessage = useCallback(async ({
    messageId,
    coords,
    label,
    address,
    expiresAt,
  }: {
    messageId: string;
    coords: { lat: number; lng: number };
    label: string;
    address?: string | null;
    expiresAt: Date;
  }) => {
    const text = buildLocationMessageText({
      lat: coords.lat,
      lng: coords.lng,
      label,
      address,
      live: true,
      expiresAt,
    });
    const mapUrl = getStaticMapUrl(coords.lat, coords.lng);
    const mapLink = buildMapsLink(coords.lat, coords.lng);
    const existingMessage = messagesRef.current.find((msg) => msg.id === messageId);
    const nextMessage: MessageType | null = existingMessage
      ? {
          ...existingMessage,
          text,
          location: {
            lat: coords.lat,
            lng: coords.lng,
            label,
            address: address || undefined,
            mapUrl: mapUrl || existingMessage.location?.mapUrl,
            mapLink,
            live: true,
            expiresAt,
          },
        }
      : null;
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          text,
          location: {
            lat: coords.lat,
            lng: coords.lng,
            label,
            address: address || undefined,
            mapUrl: mapUrl || msg.location?.mapUrl,
            mapLink,
            live: true,
            expiresAt,
          },
        };
      })
    );
    if (user?.id && activePeerMessageUserId && nextMessage) {
      void ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
        chatMessageToLocalRow(user.id, activePeerMessageUserId, nextMessage),
      ]).catch((persistError) => console.log('[chat] persist live location update error', persistError));
    }
    if (!user?.id) return;
    const { error } = await supabase
      .from('messages')
      .update({ text })
      .eq('id', messageId)
      .eq('sender_id', user.id);
    if (error) {
      console.log('[chat] live location update error', error);
    }
  }, [activePeerMessageUserId, user?.id]);

  const stopLiveSharing = useCallback(async (messageId?: string) => {
    const liveShare = liveShareRef.current;
    const targetId = messageId ?? liveShare?.messageId;
    if (!targetId) return;
    if (liveShare?.watch && liveShare.messageId === targetId) {
      liveShare.watch.remove();
    }
    if (liveShare?.messageId === targetId) {
      liveShareRef.current = null;
    }
    if (liveStopTimerRef.current && liveShare?.messageId === targetId) {
      clearTimeout(liveStopTimerRef.current);
      liveStopTimerRef.current = null;
    }
    const targetMessage = messagesRef.current.find((msg) => msg.id === targetId);
    const location = targetMessage?.location;
    if (!location) return;
    const expiresAt = new Date();
    await updateLiveLocationMessage({
      messageId: targetId,
      coords: { lat: location.lat, lng: location.lng },
      label: location.label,
      address: location.address,
      expiresAt,
    });
  }, [updateLiveLocationMessage]);

  const startLiveLocationUpdates = useCallback(async ({
    messageId,
    expiresAt,
    label,
    address,
  }: {
    messageId: string;
    expiresAt: Date;
    label: string;
    address?: string | null;
  }) => {
    if (liveShareRef.current?.watch) {
      liveShareRef.current.watch.remove();
    }
    liveShareRef.current = {
      messageId,
      expiresAt: expiresAt.getTime(),
      label,
      address,
      watch: null,
    };
    liveUpdateRef.current.lastSentAt = 0;

    if (liveStopTimerRef.current) {
      clearTimeout(liveStopTimerRef.current);
    }
    liveStopTimerRef.current = setTimeout(() => {
      void stopLiveSharing(messageId);
    }, Math.max(0, expiresAt.getTime() - Date.now()));

    if (locationStatus !== 'granted') return;

    try {
      const watch = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 20000,
          distanceInterval: 30,
        },
        (pos) => {
          const now = Date.now();
          if (now > expiresAt.getTime()) {
            void stopLiveSharing(messageId);
            return;
          }
          if (now - liveUpdateRef.current.lastSentAt < 20000) return;
          liveUpdateRef.current.lastSentAt = now;
          void updateLiveLocationMessage({
            messageId,
            coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            label,
            address,
            expiresAt,
          });
        }
      );
      liveShareRef.current = {
        messageId,
        expiresAt: expiresAt.getTime(),
        label,
        address,
        watch,
      };
    } catch (error) {
      console.log('[chat] live location watch error', error);
    }
  }, [locationStatus, stopLiveSharing, updateLiveLocationMessage]);

  useEffect(() => {
    return () => {
      if (liveShareRef.current?.watch) {
        liveShareRef.current.watch.remove();
      }
      if (liveStopTimerRef.current) {
        clearTimeout(liveStopTimerRef.current);
      }
    };
  }, []);

  const triggerReconnectToast = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    Animated.timing(reconnectToastOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    reconnectTimerRef.current = setTimeout(() => {
      Animated.timing(reconnectToastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }, 1800);
  }, [reconnectToastOpacity]);

  const triggerChatActionToast = useCallback(
    (label: string, icon: ComponentProps<typeof MaterialCommunityIcons>['name']) => {
      if (chatActionToastTimerRef.current) {
        clearTimeout(chatActionToastTimerRef.current);
        chatActionToastTimerRef.current = null;
      }
      setChatActionToast({ label, icon });
      chatActionToastOpacity.stopAnimation();
      chatActionToastOpacity.setValue(0);
      Animated.timing(chatActionToastOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      chatActionToastTimerRef.current = setTimeout(() => {
        Animated.timing(chatActionToastOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setChatActionToast(null);
        });
      }, 1800);
    },
    [chatActionToastOpacity]
  );

  const openAttachmentSheet = useCallback(() => {
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    Keyboard.dismiss();
    setShowImagePicker(true);
    attachmentAnim.setValue(0);
    requestAnimationFrame(() => {
      Animated.timing(attachmentAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    });
  }, [attachmentAnim]);

  const closeAttachmentSheet = useCallback(() => {
    Animated.timing(attachmentAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShowImagePicker(false);
      }
    });
  }, [attachmentAnim, isBlockedByMe, isChatBlocked]);

  const toggleComposerAttachmentSheet = useCallback(() => {
    if (showImagePicker) {
      closeAttachmentSheet();
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    openAttachmentSheet();
  }, [closeAttachmentSheet, openAttachmentSheet, showImagePicker]);

  const toggleComposerMoodStickers = useCallback(() => {
    if (showImagePicker) {
      closeAttachmentSheet();
    }
    setShowMoodStickers((prev) => !prev);
  }, [closeAttachmentSheet, showImagePicker]);

  const beginMediaUploadStatus = useCallback((
    title: string,
    subtitle: string,
    icon: MediaUploadStatus['icon'] = 'cloud-upload-outline'
  ) => {
    const id = Date.now();
    setMediaUploadStatus({ id, title, subtitle, icon });
    return id;
  }, []);

  const updateMediaUploadStatus = useCallback((
    id: number,
    title: string,
    subtitle: string,
    icon: MediaUploadStatus['icon'] = 'cloud-upload-outline'
  ) => {
    setMediaUploadStatus((current) =>
      current?.id === id ? { id, title, subtitle, icon } : current
    );
  }, []);

  const clearMediaUploadStatus = useCallback((id: number) => {
    setMediaUploadStatus((current) => (current?.id === id ? null : current));
  }, []);

  const openLocationModal = useCallback(() => {
    closeAttachmentSheet();
    setLiveDurationMinutes(60);
    setLocationModalVisible(true);
  }, [closeAttachmentSheet]);

  const closeLocationModal = useCallback(() => {
    setLocationModalVisible(false);
    setLocationSearchQuery('');
    setLocationSuggestions([]);
    setLocationError(null);
    setSelectedPlace(null);
    setCurrentCoords(null);
    setNearbyPlaces([]);
  }, []);

  const openLocationViewer = useCallback((message: MessageType) => {
    if (!message.location) return;
    setLocationViewerMessageId(message.id);
  }, []);

  const closeLocationViewer = useCallback(() => {
    setLocationViewerMessageId(null);
  }, []);

  const handleSendLocation = useCallback(async () => {
    if (!selectedPlace) {
      setLocationError('Choose a place to share.');
      return;
    }
    const payload = {
      lat: selectedPlace.lat,
      lng: selectedPlace.lng,
      label: selectedPlace.name,
      address: selectedPlace.address,
    };
    closeLocationModal();
    await sendLocationMessage(payload);
  }, [closeLocationModal, selectedPlace, sendLocationMessage]);

  const handleSendLiveLocation = useCallback(async () => {
    let coords = currentCoords;
    if (!coords) {
      if (locationStatus !== 'granted') {
        setLocationError('Enable location to share live movement.');
        return;
      }
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCurrentCoords(coords);
      } catch (error) {
        console.log('[chat] live location start error', error);
        setLocationError('Unable to fetch your current location for live sharing.');
        return;
      }
    }

    if (!coords) {
      setLocationError('Unable to fetch your current location for live sharing.');
      return;
    }

    const expiresAt = new Date(Date.now() + liveDurationMinutes * 60000);
    const payload = {
      lat: coords.lat,
      lng: coords.lng,
      label: 'Live location',
      address: null,
      live: true,
      expiresAt,
    };
    closeLocationModal();
    const messageId = await sendLocationMessage(payload);
    if (messageId) {
      void startLiveLocationUpdates({
        messageId,
        expiresAt,
        label: 'Live location',
        address: null,
      });
    }
  }, [closeLocationModal, currentCoords, liveDurationMinutes, locationStatus, sendLocationMessage, startLiveLocationUpdates]);

  const handleInputFocus = useCallback(() => {
    setIsInputFocused(true);
    if (showImagePicker) {
      closeAttachmentSheet();
    }
  }, [closeAttachmentSheet, showImagePicker]);

  const handleInputBlur = useCallback(() => {
    setIsInputFocused(false);
  }, []);

  const fetchSystemMessages = useCallback(async () => {
    if (!user?.id || !activePeerMessageUserId) return [] as MessageType[];
    const startedAt = Date.now();
    try {
      console.log('[chat][thread][system] start', {
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
      });
      const { value: rows, timedOut } = await withLocalOperationTimeout(
        fetchRemoteSystemMessages({
          currentUserId: user.id,
          peerUserId: activePeerMessageUserId,
          mapRow: (row) => mapSystemRowToMessage(row as SystemMessageRow),
        }),
        LOCAL_CHAT_OPERATION_TIMEOUT_MS,
        [] as MessageType[],
      );
      if (timedOut) {
        console.log('[chat][thread][system] timeout', {
          currentUserId: user.id,
          peerUserId: activePeerMessageUserId,
          durationMs: Date.now() - startedAt,
          timeoutMs: LOCAL_CHAT_OPERATION_TIMEOUT_MS,
        });
      }
      console.log('[chat][thread][system] success', {
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        durationMs: Date.now() - startedAt,
        rowCount: rows.length,
      });
      return rows;
    } catch (error) {
      console.log('[chat][thread][system] error', {
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        durationMs: Date.now() - startedAt,
      });
      console.log('[chat] fetch system messages error', error);
      return [] as MessageType[];
    }
  }, [activePeerMessageUserId, mapSystemRowToMessage, user?.id]);

  const fetchMessages = useCallback(async () => {
    if (!user?.id || !activePeerMessageUserId) {
      console.log('[chat][thread][remote] skip:missing-user-or-peer', {
        hasUserId: Boolean(user?.id),
        hasPeerUserId: Boolean(activePeerMessageUserId),
      });
      return;
    }
    if (!isScreenFocusedRef.current) {
      console.log('[chat][thread][remote] skip:not-focused', {
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
      });
      return;
    }
    const fetchKey = `${user.id}:${activePeerMessageUserId}`;
    if (fetchMessagesInFlightRef.current?.key === fetchKey) {
      console.log('[chat][thread][remote] reuse-in-flight', {
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        existingMessageCount: messagesRef.current.length,
      });
      await fetchMessagesInFlightRef.current.promise;
      return;
    }
    const run = async () => {
      const startedAt = Date.now();
      console.log('[chat][thread][remote] start', {
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        existingMessageCount: messagesRef.current.length,
      });
      // System events are an independent immutable stream. Fetch them beside
      // the canonical message delta so a slower system query cannot extend
      // thread reconciliation by running serially after the message request.
      const systemRowsPromise = fetchSystemMessages();
      const { data, error, isIncrementalFetch, threadSyncCursor } = await fetchRemoteThreadMessages({
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        pageSize: PAGE_SIZE,
        selectFields: MESSAGE_SELECT_FIELDS,
        fallbackSelectFields: LEGACY_MESSAGE_SELECT_FIELDS,
        currentMessages: messagesRef.current,
      });
      const isStaleFetch = activePeerMessageUserIdRef.current !== activePeerMessageUserId;
      if (isStaleFetch) {
        console.log('[chat][thread][remote] skip:stale-fetch', {
          currentUserId: user.id,
          peerUserId: activePeerMessageUserId,
          durationMs: Date.now() - startedAt,
        });
        return;
      }
      if (!isChatInstanceMountedRef.current) {
        console.log('[chat][thread][remote] skip:unmounted', {
          currentUserId: user.id,
          peerUserId: activePeerMessageUserId,
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      if (error) {
        void ChatRepository.markSyncFailed(user.id, 'thread_messages', {
          code: (error as { code?: string })?.code ?? null,
          message: error.message || 'Failed to load thread messages',
        }, { threadId: activePeerMessageUserId });
        console.log('[chat][thread][remote] error', {
          currentUserId: user.id,
          peerUserId: activePeerMessageUserId,
          durationMs: Date.now() - startedAt,
          code: (error as { code?: string })?.code ?? null,
          message: error.message || 'Failed to load thread messages',
          isLikelyNetworkError: isLikelyNetworkError(error),
        });
        if (isLikelyNetworkError(error)) {
          if (messagesRef.current.length === 0 && chatThreadCacheKey) {
            const cached =
              (await readOfflineSnapshot<CachedMessageType[]>(chatThreadCacheKey)) ??
              (user?.id && conversationId
                ? await migrateLegacyChatThreadSnapshot<CachedMessageType[]>(user.id, conversationId)
                : null);
            if (cached) {
              if (!isChatInstanceMountedRef.current) {
                return;
              }
              const hydrated = reconcileDeliveredFallback(linkReplies(deserializeCachedMessages(cached)));
              console.log('[chat][thread][remote] network-fallback-cache-applied', {
                currentUserId: user.id,
                peerUserId: activePeerMessageUserId,
                cachedMessageCount: hydrated.length,
              });
              setMessages(hydrated);
              setHasMore(hydrated.length >= PAGE_SIZE);
              setOldestTimestamp(hydrated[0]?.timestamp ?? null);
            }
          }
          if (!isChatInstanceMountedRef.current) {
            return;
          }
          setMessagesLoaded(true);
          setThreadBootstrapSettled(true);
          console.log('[chat][thread][remote] settle:network-error', {
            currentUserId: user.id,
            peerUserId: activePeerMessageUserId,
            finalMessageCount: messagesRef.current.length,
          });
          return;
        }
        setMessagesLoaded(true);
        setThreadBootstrapSettled(true);
        setRemoteMessagesChecked(true);
        console.log('[chat][thread][remote] settle:error', {
          currentUserId: user.id,
          peerUserId: activePeerMessageUserId,
          finalMessageCount: messagesRef.current.length,
        });
        return;
      }

      const ordered = reconcileFetchedThreadRows({
        rows: (data || []) as MessageDatabaseRow[],
        previousMessages: messagesRef.current,
        hiddenMessageIds: hiddenMessageIdsRef.current,
        isIncrementalFetch,
        mapRow: mapRowToMessage,
        mergeOfflineMedia: mergeOfflineMediaIntoMessage,
        mergeReceipt: mergeMessageWithMonotonicReceipt,
      });
      console.log('[chat][thread][remote] success', {
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        durationMs: Date.now() - startedAt,
        remoteRowCount: (data || []).length,
        orderedMessageCount: ordered.length,
        isIncrementalFetch,
      });
      const systemRows = await systemRowsPromise;
      if (!isChatInstanceMountedRef.current) {
        console.log('[chat][thread][remote] skip:unmounted-after-system', {
          currentUserId: user.id,
          peerUserId: activePeerMessageUserId,
        });
        return;
      }
      const combined = [...ordered, ...systemRows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const linked = reconcileDeliveredFallback(linkReplies(combined));
      let mergedForState: MessageType[] = linked;
      setMessages((prev) => {
        if (!isIncrementalFetch && linked.length === 0 && prev.length > 0) {
          mergedForState = prev;
          console.log('[chat][thread][remote] state-preserve-existing', {
            currentUserId: user.id,
            peerUserId: activePeerMessageUserId,
            previousMessageCount: prev.length,
          });
          return prev;
        }
        const fetchedMessages = isIncrementalFetch ? mergeIncrementalThreadMessages(prev, linked) : linked;
        mergedForState = reconcileDeliveredFallback(
          linkReplies(
            mergeFetchedMessagesWithLocalPending({
              fetchedMessages,
              previousMessages: prev,
              currentUserId: user.id,
            }),
          ),
        );
        mergedForState = preserveUnchangedMessageReferences(
          prev,
          mergedForState,
          getChatMessageRevisionKey,
        );
        console.log('[chat][thread][remote] state-apply', {
          currentUserId: user.id,
          peerUserId: activePeerMessageUserId,
          previousMessageCount: prev.length,
          nextMessageCount: mergedForState.length,
          linkedMessageCount: linked.length,
          systemMessageCount: systemRows.length,
          isIncrementalFetch,
        });
        return mergedForState;
      });
      setMessagesLoaded(true);
      setThreadBootstrapSettled(true);
      setRemoteMessagesChecked(true);
      console.log('[chat][thread][remote] settle:success', {
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        fetchedMessageCount: linked.length,
        threadSyncCursor,
      });
      if (ordered.length > 0) {
        void (async () => {
          try {
            const { timedOut } = await withLocalOperationTimeout(
              ChatRepository.upsertMessages(
                user.id,
                activePeerMessageUserId,
                ordered.map((message) =>
                  chatMessageToLocalRow(user.id, activePeerMessageUserId, message),
                ),
                { priority: 'background' },
              ),
              LOCAL_CHAT_OPERATION_TIMEOUT_MS,
              undefined,
            );
            if (timedOut) {
              console.log('[chat][thread][remote] local-persist-timeout', {
                currentUserId: user.id,
                peerUserId: activePeerMessageUserId,
                timeoutMs: LOCAL_CHAT_OPERATION_TIMEOUT_MS,
                messageCount: ordered.length,
              });
            } else {
              console.log('[chat][thread][remote] local-persist-success', {
                currentUserId: user.id,
                peerUserId: activePeerMessageUserId,
                messageCount: ordered.length,
              });
            }
          } catch (localPersistError) {
            // Remote data remains authoritative and should still render even if
            // the device cache is temporarily unavailable.
            console.log('[chat][thread][remote] local-repair-error', localPersistError);
          }
        })();
      }
      if (chatThreadCacheKey) {
        void writeOfflineSnapshot(chatThreadCacheKey, serializeCachedMessages(mergedForState));
      }
      void ChatRepository.markSyncSucceeded(user.id, 'thread_messages', {
        threadId: activePeerMessageUserId,
        cursor: threadSyncCursor,
      });
      void syncMessageReactions(mergedForState.map((msg) => msg.id).filter((id) => !id.startsWith('system:')));
      const viewOnceIds = mergedForState.filter((msg) => msg.isViewOnce).map((msg) => msg.id);
      void syncViewOnceStatus(viewOnceIds);
      if (!isIncrementalFetch) {
        setHasMore((data || []).length === PAGE_SIZE);
        setOldestTimestamp(ordered[0]?.timestamp ?? null);
      }

      await acknowledgeIncomingMessagesDelivered(user.id, null, activePeerMessageUserId);
      await focusedThreadReadActionRef.current();
    };
    const promise = run().finally(() => {
      if (fetchMessagesInFlightRef.current?.key === fetchKey) {
        fetchMessagesInFlightRef.current = null;
      }
    });
    fetchMessagesInFlightRef.current = { key: fetchKey, promise };
    await promise;
  }, [activePeerMessageUserId, chatThreadCacheKey, linkReplies, mapRowToMessage, reconcileDeliveredFallback, syncMessageReactions, syncViewOnceStatus, user?.id]);

  useEffect(() => {
    localHydrationActionRefs.current = {
      fetchHiddenMessages,
      fetchBlockStatus,
      fetchPinnedMessages,
      fetchMessages,
    };
  }, [fetchBlockStatus, fetchHiddenMessages, fetchMessages, fetchPinnedMessages]);

  useEffect(() => {
    activePeerMessageUserIdRef.current = activePeerMessageUserId ?? null;
  }, [activePeerMessageUserId]);

  const startThreadSynchronization = useCallback(() => {
    if (!user?.id || !activePeerMessageUserId) return;

    if (networkReady) {
      void flushThreadOutboxAndRefresh({
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        fetchMessages,
        onUnexpectedError: (error) => {
          console.log('[chat] local outbox flush error', error);
        },
      }).catch(() => {});
    }

    const coordinator = startThreadSyncCoordinator({
      currentUserId: user.id,
      peerUserId: activePeerMessageUserId,
      networkReady,
      fetchMessages,
      refreshPeerStatus,
      onReconnectRecovered: () => {
        triggerReconnectToast();
      },
      onReconnectPending: () => {},
      onUnexpectedError: (error) => {
        console.log('[chat] resume outbox flush error', error);
      },
    });
    threadSyncCoordinatorRef.current = coordinator;

    return () => {
      if (threadSyncCoordinatorRef.current === coordinator) {
        threadSyncCoordinatorRef.current = null;
      }
      coordinator.stop();
    };
  }, [
    activePeerMessageUserId,
    fetchMessages,
    networkReady,
    refreshPeerStatus,
    triggerReconnectToast,
    user?.id,
  ]);

  const clearPendingReadTimer = useCallback((messageId: string) => {
    const timer = pendingReadTimersRef.current[messageId];
    if (timer) {
      clearTimeout(timer);
      delete pendingReadTimersRef.current[messageId];
    }
  }, []);

  const clearPendingReceiptSyncTimer = useCallback((messageId: string) => {
    const timer = pendingReceiptSyncTimersRef.current[messageId];
    if (timer) {
      clearTimeout(timer);
      delete pendingReceiptSyncTimersRef.current[messageId];
    }
  }, []);

  const clearPendingDeliveredHintTimer = useCallback((messageId: string) => {
    const timer = pendingDeliveredHintTimersRef.current[messageId];
    if (timer) {
      clearTimeout(timer);
      delete pendingDeliveredHintTimersRef.current[messageId];
    }
  }, []);

  useEffect(() => {
    return () => {
      Object.values(pendingReadTimersRef.current).forEach((timer) => clearTimeout(timer));
      pendingReadTimersRef.current = {};
      Object.values(pendingReceiptSyncTimersRef.current).forEach((timer) => clearTimeout(timer));
      pendingReceiptSyncTimersRef.current = {};
      Object.values(pendingDeliveredHintTimersRef.current).forEach((timer) => clearTimeout(timer));
      pendingDeliveredHintTimersRef.current = {};
      readReceiptBatcherRef.current.dispose();
    };
  }, []);

  const hintOutgoingDelivered = useCallback(
    (messageId: string) => {
      if (pendingDeliveredHintTimersRef.current[messageId]) return;
      pendingDeliveredHintTimersRef.current[messageId] = setTimeout(() => {
        delete pendingDeliveredHintTimersRef.current[messageId];
        setMessages((prev) =>
          markOutgoingMessageDelivered({
            items: prev,
            messageId,
            currentUserId: user?.id,
          })
        );
      }, 320);
    },
    [user?.id]
  );

  const syncOutgoingReceiptState = useCallback(
    async (messageId: string): Promise<MessageType['status'] | null> => {
      if (!user?.id || !activePeerMessageUserId) return null;
      clearPendingReceiptSyncTimer(messageId);
      const { data, error } = await supabase
        .from('messages')
        .select('id,is_read,delivered_at')
        .eq('id', messageId)
        .eq('sender_id', user.id)
        .maybeSingle();
      if (error || !data) return null;
      clearPendingDeliveredHintTimer(messageId);
      let resolvedStatus: MessageType['status'] | null = null;
      setMessages((prev) => {
        const nextState = applySyncedOutgoingReceiptState({
          items: prev,
          messageId,
          currentUserId: user.id,
          isRead: Boolean(data.is_read),
          deliveredAt: data.delivered_at,
        });
        resolvedStatus = nextState.resolvedStatus;
        return nextState.items;
      });
      if (resolvedStatus === 'sent' || resolvedStatus === 'delivered' || resolvedStatus === 'read') {
        void ChatRepository.markMessageReceiptState(
          user.id,
          activePeerMessageUserId,
          messageId,
          resolvedStatus,
        ).catch((localError) => console.log('[chat] local receipt state persist error', localError));
      }
      return resolvedStatus;
    },
    [activePeerMessageUserId, clearPendingDeliveredHintTimer, clearPendingReceiptSyncTimer, user?.id]
  );

  const scheduleOutgoingReceiptStateSync = useCallback(
    (messageId: string, attempt = 0) => {
      if (pendingReceiptSyncTimersRef.current[messageId]) return;
      if (attempt === 0 && peerPresenceDisplay.online) {
        hintOutgoingDelivered(messageId);
      }
      pendingReceiptSyncTimersRef.current[messageId] = setTimeout(() => {
        delete pendingReceiptSyncTimersRef.current[messageId];
        void syncOutgoingReceiptState(messageId).then((status) => {
          if ((status === 'sent' || status === 'sending' || status === 'queued' || status === null) && attempt < 5) {
            scheduleOutgoingReceiptStateSync(messageId, attempt + 1);
          }
        });
      }, attempt === 0 ? 500 : Math.min(2800, 900 + attempt * 450));
    },
    [hintOutgoingDelivered, peerPresenceDisplay.online, syncOutgoingReceiptState]
  );

  const refreshOutgoingReceiptStates = useCallback(() => {
    if (!user?.id || !networkReadyRef.current) return;
    const pendingMessageIds = Array.from(
      new Set(
        messagesRef.current
          .filter((message) =>
            message.senderId === user.id &&
            !String(message.id).startsWith('temp-') &&
            message.status !== 'read' &&
            message.status !== 'failed',
          )
          .map((message) => message.id),
      ),
    );

    pendingMessageIds.forEach((messageId, index) => {
      if (pendingReceiptSyncTimersRef.current[messageId]) return;
      pendingReceiptSyncTimersRef.current[messageId] = setTimeout(() => {
        delete pendingReceiptSyncTimersRef.current[messageId];
        void syncOutgoingReceiptState(messageId);
      }, Math.min(index * 120, 720));
    });
  }, [syncOutgoingReceiptState, user?.id]);

  useEffect(() => {
    refreshOutgoingReceiptStatesRef.current = refreshOutgoingReceiptStates;
  }, [refreshOutgoingReceiptStates]);

  const markOutgoingMessagesDelivered = useCallback(() => {
    setMessages((prev) => {
      prev.forEach((msg) => {
        if (
          msg.senderId === user?.id &&
          msg.status !== 'read' &&
          msg.status !== 'delivered' &&
          msg.status !== 'failed'
        ) {
          clearPendingDeliveredHintTimer(msg.id);
        }
      });
      return markAllOutgoingMessagesDelivered({
        items: prev,
        currentUserId: user?.id,
      });
    });
  }, [clearPendingDeliveredHintTimer, user?.id]);

  const retryFailedTextMessage = useCallback(async (messageId: string) => {
    if (!user?.id || !activePeerMessageUserId || isChatBlocked) return;

    const failedMessage = messagesRef.current.find((msg) => msg.id === messageId);
    const retryPayload = buildRetryFailedTextPayload({
      failedMessage,
      currentUserId: user.id,
    });
    if (!failedMessage || !retryPayload) return;
    const { clientMessageId, sendingMessage: sendingRetryMessage } = createTextRetryPlan({
      message: failedMessage,
    });

    Haptics.selectionAsync().catch(() => {});

    setMessages((prev) => transitionMessageLifecycle({
      items: prev.map((msg) => (msg.id === messageId ? { ...msg, clientMessageId } : msg)),
      messageId,
      event: 'send_started',
    }));
    await persistLocalTextOutboxState({
      ownerUserId: user.id,
      threadId: activePeerMessageUserId,
      message: sendingRetryMessage,
      outboxStatus: 'sending',
    }).catch((persistError) => console.log('[chat] persist retry text outbox error', persistError));

    if (!networkReady) {
      const queuedRetryMessage = transitionMessageLifecycleRecord({
        message: sendingRetryMessage,
        event: 'send_deferred',
      });
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: queuedRetryMessage,
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued retry text outbox error', persistError));
      setMessages((prev) => transitionMessageLifecycle({
        items: prev,
        messageId,
        event: 'send_deferred',
      }));
      return;
    }

    const { data: guardData, error } = await supabase.functions.invoke('private-message-guard-send', {
      body: {
        receiverId: activePeerMessageUserId,
        clientMessageId,
        text: retryPayload.text,
        messageType: 'text',
        replyToMessageId: retryPayload.replyToMessageId,
      },
    });
    const guardResult = (guardData ?? {}) as {
      ok?: boolean;
      code?: string;
      message?: MessageDatabaseRow;
    };
    const data = guardResult.message ?? null;

    if (error || !data) {
      if (error && isLikelyNetworkError(error)) {
        const queuedRetryMessage = transitionMessageLifecycleRecord({
          message: sendingRetryMessage,
          event: 'send_deferred',
        });
        void persistLocalTextOutboxState({
          ownerUserId: user.id,
          threadId: activePeerMessageUserId,
          message: queuedRetryMessage,
          outboxStatus: 'queued',
        }).catch((persistError) => console.log('[chat] persist queued retry text outbox error', persistError));
        setMessages((prev) => transitionMessageLifecycle({
          items: prev,
          messageId,
          event: 'send_deferred',
        }));
        return;
      }
      console.log('[chat] retry failed message error', error ?? guardResult.code);
      const failedRetryMessage = transitionMessageLifecycleRecord({
        message: sendingRetryMessage,
        event: 'retryable_failure',
      });
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: failedRetryMessage,
        outboxStatus: 'failed',
        error: {
          code: (error as { code?: string } | null)?.code ?? guardResult.code ?? 'retry_failed',
          message: (error as { message?: string } | null)?.message
            ?? (guardResult.code === 'MESSAGE_REVIEW_REQUIRED'
              ? 'Message held for safety review'
              : 'Message violates Betweener safety rules'),
        },
      }).catch((persistError) => console.log('[chat] persist failed retry text outbox error', persistError));
      setMessages((prev) => transitionMessageLifecycle({
        items: prev,
        messageId,
        event: 'retryable_failure',
      }));
      Alert.alert(
        guardResult.ok === false ? 'Message not sent' : 'Retry failed',
        guardResult.code === 'MESSAGE_REVIEW_REQUIRED'
          ? 'This message is being held for a safety review.'
          : guardResult.ok === false
            ? 'Please remove solicitation, threats, scams, or unsafe content and try again.'
            : 'Unable to resend this message right now.',
      );
      return;
    }

    const mapped = mapRowToMessage(data as MessageDatabaseRow);
    void ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
      chatMessageToLocalRow(user.id, activePeerMessageUserId, mapped),
    ])
      .then(() =>
        markLocalTextOutboxStatus({
          ownerUserId: user.id,
          localMessageId: clientMessageId,
          status: 'sent',
        }),
      )
      .catch((persistError) => console.log('[chat] persist sent retry text outbox error', persistError));
    setMessages((prev) =>
      linkReplies(
        reconcileMessageWithServer({
          items: prev,
          messageId,
          serverMessage: mapped,
        })
      )
    );
    scheduleOutgoingReceiptStateSync(data.id as string);
  }, [activePeerMessageUserId, isChatBlocked, linkReplies, mapRowToMessage, markLocalMessageFailed, networkReady, scheduleOutgoingReceiptStateSync, user?.id]);

  const retryFailedMessage = useCallback(async (message: MessageType) => {
    if (!user?.id || isChatBlocked || message.status !== 'failed') return;
    if (message.type === 'text') {
      await retryFailedTextMessage(message.id);
      return;
    }
    const localMessageId = message.clientMessageId ?? message.id;
    if ((message.mediaItems?.length ?? 0) > 1) {
      Alert.alert(
        'Finish this album',
        'Retry only the unfinished items, send the items that are ready, or cancel the album.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Cancel album',
            style: 'destructive',
            onPress: () => {
              void ChatOutboxService.cancelMessage(user.id, localMessageId).then(() => {
                setMessages((current) => current.filter((entry) => entry.id !== message.id));
              });
            },
          },
          {
            text: 'Send ready items',
            onPress: () => {
              setMessages((current) => transitionMessageLifecycle({
                items: current,
                messageId: message.id,
                event: 'retry_requested',
              }));
              void ChatOutboxService.sendRemainingAlbumItems(user.id, localMessageId).then((sent) => {
                if (!sent) Alert.alert('Album unchanged', 'At least one unfinished item must be retried or removed first.');
              });
            },
          },
          {
            text: 'Retry unfinished',
            onPress: () => {
              setMessages((current) => transitionMessageLifecycle({
                items: current,
                messageId: message.id,
                event: networkReady ? 'send_started' : 'retry_requested',
              }));
              void ChatOutboxService.retryMessage(user.id, localMessageId).then((result) => {
                if (!result.requeued) Alert.alert('Retry unavailable', 'The unfinished media is no longer on this device.');
              });
            },
          },
        ],
      );
      return;
    }
    setMessages((current) => transitionMessageLifecycle({
      items: current,
      messageId: message.id,
      event: networkReady ? 'send_started' : 'retry_requested',
    }));
    try {
      const result = await ChatOutboxService.retryMessage(user.id, localMessageId);
      if (!result.requeued) {
        setMessages((current) => transitionMessageLifecycle({
          items: current,
          messageId: message.id,
          event: 'retryable_failure',
        }));
        Alert.alert('Retry unavailable', 'This attachment is no longer available on this device.');
      }
    } catch (error) {
      setMessages((current) => transitionMessageLifecycle({
        items: current,
        messageId: message.id,
        event: 'retryable_failure',
      }));
      if (shouldShowAttachmentRetryFailure(isLikelyNetworkError(error))) {
        Alert.alert('Retry failed', 'Unable to resend this attachment right now.');
      }
    }
  }, [isChatBlocked, networkReady, retryFailedTextMessage, user?.id]);

  const retryFailedMessageById = useCallback(async (messageId: string) => {
    const message = messagesRef.current.find((entry) => entry.id === messageId);
    if (!message) return;
    await retryFailedMessage(message);
  }, [retryFailedMessage]);

  const manageFailedAlbumItem = useCallback((message: MessageType, albumIndex: number) => {
    if (!user?.id || message.status !== 'failed') return;
    const mediaItem = message.mediaItems?.find((entry) => entry.index === albumIndex);
    if (!mediaItem) return;
    const localMessageId = message.clientMessageId ?? message.id;
    Alert.alert(
      'Album item',
      `Choose what to do with item ${albumIndex + 1} of ${message.mediaItems?.length ?? 1}.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Remove item',
          style: 'destructive',
          onPress: () => {
            void ChatOutboxService.removeAlbumItem(user.id, localMessageId, mediaItem.attachmentId)
              .then((result) => {
                if (!result.changed) {
                  Alert.alert('Album locked', 'This album is already being finalised and can no longer be changed.');
                  return;
                }
                setMessages((current) => current.map((entry) => entry.id === message.id
                  ? {
                      ...entry,
                      mediaExpectedCount: result.remainingCount,
                      mediaItems: entry.mediaItems
                        ?.filter((candidate) => candidate.attachmentId !== mediaItem.attachmentId)
                        .map((candidate, index) => ({ ...candidate, index })),
                    }
                  : entry));
              });
          },
        },
        {
          text: 'Retry this item',
          onPress: () => {
            setMessages((current) => current.map((entry) => entry.id === message.id
              ? {
                  ...transitionMessageLifecycleRecord({ message: entry, event: networkReady ? 'send_started' : 'retry_requested' }),
                  mediaItems: entry.mediaItems?.map((candidate) => candidate.attachmentId === mediaItem.attachmentId
                    ? { ...candidate, transferState: 'queued', transferError: null }
                    : candidate),
                }
              : entry));
            void ChatOutboxService.retryAlbumItem(user.id, localMessageId, mediaItem.attachmentId)
              .then((requeued) => {
                if (!requeued) Alert.alert('Retry unavailable', 'This item can no longer be retried from this device.');
              });
          },
        },
      ],
    );
  }, [networkReady, user?.id]);

  useEffect(() => {
    if (!messagesLoaded) return;
    if (!remoteMessagesChecked) return;
    if (!chatSafetyStorageKey) return;
    if (chatSafetyVisible) return;

    // Only prompt when the thread has no real user messages yet (system messages don't count as a conversation).
    const hasUserMessages = messages.some((m) => m.type !== 'system' && !String(m.id).startsWith('system:'));
    if (hasUserMessages) return;

    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(chatSafetyStorageKey);
        if (cancelled || seen) return;
        setChatSafetyVisible(true);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [chatSafetyStorageKey, chatSafetyVisible, messages, messagesLoaded, remoteMessagesChecked]);

  const dismissChatSafety = useCallback(() => {
    setChatSafetyVisible(false);
    if (chatSafetyStorageKey) {
      AsyncStorage.setItem(chatSafetyStorageKey, '1').catch(() => {});
    }
  }, [chatSafetyStorageKey]);

  const loadEarlier = useCallback(async () => {
    if (
      !user?.id ||
      !activePeerMessageUserId ||
      loadingEarlierRef.current ||
      !oldestTimestamp
    ) return;
    loadingEarlierRef.current = true;
    setLoadingEarlier(true);
    shouldAutoScrollRef.current = false;
    wasAtBottomRef.current = false;
    try {
      const localReadStartedAt = Date.now();
      const localRows = await Promise.race([
        ChatRepository.getMessages(user.id, activePeerMessageUserId, {
          limit: PAGE_SIZE,
          before: oldestTimestamp.toISOString(),
        }),
        new Promise<ChatMessageRow[]>((resolve) => {
          setTimeout(() => resolve([]), Platform.OS === 'ios' ? 1200 : 2500);
        }),
      ]);
      if (localRows.length === 0 && Date.now() - localReadStartedAt >= (Platform.OS === 'ios' ? 1150 : 2450)) {
        console.log('[chat][thread][local] load-earlier-timeout', {
          currentUserId: user.id,
          peerUserId: activePeerMessageUserId,
          platform: Platform.OS,
          durationMs: Date.now() - localReadStartedAt,
        });
      }
      const localEarlierMessages = localRows.map(localRowToChatMessage);
      let networkBefore = oldestTimestamp;

      if (localEarlierMessages.length > 0) {
        setMessages((prev) => {
          const existing = new Set(prev.map((msg) => msg.id));
          const merged = localEarlierMessages.filter((msg) => !existing.has(msg.id));
          if (merged.length === 0) return prev;
          const combined = [...merged, ...prev].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          return linkReplies(combined);
        });
        networkBefore = localEarlierMessages[0]?.timestamp ?? oldestTimestamp;
        setOldestTimestamp(networkBefore);

        if (localEarlierMessages.length >= PAGE_SIZE) {
          setHasMore(true);
          return;
        }
      }

      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT_FIELDS)
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${activePeerMessageUserId}),and(sender_id.eq.${activePeerMessageUserId},receiver_id.eq.${user.id})`
        )
        .lt('created_at', networkBefore.toISOString())
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) {
        console.log('[chat] load earlier error', error);
        if (localEarlierMessages.length > 0) {
          setHasMore(localEarlierMessages.length >= PAGE_SIZE);
        }
        return;
      }

      const hiddenSet = hiddenMessageIdsRef.current;
      const previousById = new Map(messagesRef.current.map((message) => [message.id, message] as const));
      const mapped: MessageType[] = (data || []).map((row: MessageDatabaseRow) =>
        {
          const previous = previousById.get(row.id);
          const withOfflineMedia = mergeOfflineMediaIntoMessage(mapRowToMessage(row), previous);
          return previous
            ? mergeMessageWithMonotonicReceipt(previous, withOfflineMedia)
            : withOfflineMedia;
        }
      ).filter((msg) => !hiddenSet.has(msg.id));

      const ordered = mapped.reverse();
      if (ordered.length > 0) {
        void ChatRepository.upsertMessages(
          user.id,
          activePeerMessageUserId,
          ordered.map((message) => chatMessageToLocalRow(user.id, activePeerMessageUserId, message)),
        );
        setMessages((prev) => {
          const existing = new Set(prev.map((msg) => msg.id));
          const merged = ordered.filter((msg) => !existing.has(msg.id));
          if (merged.length === 0) return prev;
          const combined = [...merged, ...prev].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          return linkReplies(combined);
        });
        void syncMessageReactions(ordered.map((msg) => msg.id).filter((id) => !id.startsWith('system:')));
        const viewOnceIds = ordered.filter((msg) => msg.isViewOnce).map((msg) => msg.id);
        void syncViewOnceStatus(viewOnceIds);
        setOldestTimestamp(ordered[0]?.timestamp ?? networkBefore);
      }
      setHasMore((data || []).length === PAGE_SIZE);
    } finally {
      loadingEarlierRef.current = false;
      setLoadingEarlier(false);
    }
  }, [activePeerMessageUserId, linkReplies, loadingEarlier, mapRowToMessage, oldestTimestamp, syncMessageReactions, syncViewOnceStatus, user?.id]);

  const startFocusedThreadHydration = useCallback(() => {
    if (!user?.id || !activePeerMessageUserId) return () => {};
    void (async () => {
      await localHydrationActionRefs.current.fetchHiddenMessages();
      await localHydrationActionRefs.current.fetchBlockStatus();
      await localHydrationActionRefs.current.fetchPinnedMessages();
      await localHydrationActionRefs.current.fetchMessages();
    })();
    return () => {};
  }, [activePeerMessageUserId, user?.id]);

  const startThreadMessageRealtime = useCallback(() => {
      if (!user?.id || !activePeerMessageUserId) return () => {};
      const handleRealtimeStatus = (status: string) => {
        threadSyncCoordinatorRef.current?.handleRealtimeStatus(status);
      };

      const stopRealtime = subscribeThreadMessageRealtime({
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        onStatus: handleRealtimeStatus,
        onInboxInsert: (row) => {
          setIsTyping(false);
          void (async () => {
            const { canonicalRow, message: incomingMessage } = await processThreadRealtimeMessage({
              row: row as MessageDatabaseRow,
              hydrate: fetchCanonicalRealtimeMessageRow,
              map: mapRowToMessage,
              persist: async (message) => {
                await ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
                  chatMessageToLocalRow(user.id, activePeerMessageUserId, message),
                ]).catch((error) => console.log('[chat] inbox realtime insert local persist error', error));
              },
              markSyncSucceeded: async (cursor) => {
                await ChatRepository.markSyncSucceeded(user.id, 'thread_messages', {
                  threadId: activePeerMessageUserId,
                  cursor: cursor ?? null,
                });
              },
              getCursor: (message) => message.created_at,
            });
            setMessages((prev) => {
              if (hiddenMessageIdsRef.current.has(canonicalRow.id)) return prev;
              if (prev.some((msg) => msg.id === canonicalRow.id)) return prev;
              return reconcileDeliveredFallback(linkReplies([...prev, incomingMessage]));
            });
            if (!hiddenMessageIdsRef.current.has(canonicalRow.id)) {
              void syncMessageReactions([canonicalRow.id]);
              if (canonicalRow.is_view_once) {
                void syncViewOnceStatus([canonicalRow.id]);
              }
            }
            void acknowledgeIncomingMessagesDelivered(user.id, canonicalRow.id, activePeerMessageUserId);
            void focusedThreadReadActionRef.current({ forceRemote: true });
          })();
        },
        onInboxUpdate: (row) => {
          if (hiddenMessageIdsRef.current.has(row.id)) return;
          setIsTyping(false);
          void (async () => {
            const previous = messagesRef.current.find((msg) => msg.id === row.id);
            const { canonicalRow, message: hydratedMessage } = await processThreadRealtimeMessage({
              row: row as MessageDatabaseRow,
              hydrate: fetchCanonicalRealtimeMessageRow,
              map: (canonicalRow) => mergeOfflineMediaIntoMessage(mapRowToMessage(canonicalRow), previous),
              persist: async (message) => {
                await ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
                  chatMessageToLocalRow(user.id, activePeerMessageUserId, message),
                ]).catch((error) => console.log('[chat] inbox realtime update local persist error', error));
              },
              markSyncSucceeded: (cursor) => ChatRepository.markSyncSucceeded(user.id, 'thread_messages', {
                threadId: activePeerMessageUserId, cursor: cursor ?? null,
              }),
              getCursor: (message) => message.created_at,
            });
            const nextMessage = hydratedMessage;
            setMessages((prev) =>
              reconcileDeliveredFallback(
                linkReplies(
                  prev.map((msg) =>
                    msg.id === canonicalRow.id
                      ? {
                          ...nextMessage,
                          reactions: msg.reactions,
                          offlineImageUri: msg.offlineImageUri,
                          offlineVideoUri: msg.offlineVideoUri,
                        }
                      : msg
                  ),
                ),
              ),
            );
          })();
        },
        onSentInsert: (row) => {
          void (async () => {
            const { canonicalRow, message: sentMessage } = await processThreadRealtimeMessage({
              row: row as MessageDatabaseRow, hydrate: fetchCanonicalRealtimeMessageRow, map: mapRowToMessage,
              persist: async (message) => {
                await ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
                  chatMessageToLocalRow(user.id, activePeerMessageUserId, message),
                ]).catch((error) => console.log('[chat] sent realtime insert local persist error', error));
              },
              markSyncSucceeded: (cursor) => ChatRepository.markSyncSucceeded(user.id, 'thread_messages', {
                threadId: activePeerMessageUserId, cursor: cursor ?? null,
              }),
              getCursor: (message) => message.created_at,
            });
            setMessages((prev) => {
              if (hiddenMessageIdsRef.current.has(canonicalRow.id)) return prev;
              if (prev.some((msg) => msg.id === canonicalRow.id)) return prev;
              const rowType = canonicalRow.message_type ?? 'text';
              const tempIndex = prev.findIndex((msg) => {
                if (canonicalRow.client_message_id && msg.clientMessageId === canonicalRow.client_message_id) return true;
                if ((msg.status !== 'sending' && msg.status !== 'queued') || msg.senderId !== user.id) return false;
                if (rowType === 'voice') return msg.type === 'voice';
                if (rowType === 'image' || rowType === 'video') return msg.type === rowType;
                if (rowType === 'text' && canonicalRow.text?.startsWith(DOCUMENT_TEXT_PREFIX)) return msg.type === 'document';
                return msg.text === canonicalRow.text;
              });
              const nextMessage = mergeOfflineMediaIntoMessage(sentMessage, prev[tempIndex]);
              if (tempIndex >= 0) {
                const previous = prev[tempIndex];
                if (rowType === 'image' && previous?.offlineImageUri && nextMessage.imageUrl) {
                  const cacheKey = nextMessage.storagePath ?? nextMessage.imageUrl;
                  setCachedImageUris((current) =>
                    current[cacheKey] === previous.offlineImageUri
                      ? current
                      : {
                          ...current,
                          [cacheKey]: previous.offlineImageUri!,
                          [nextMessage.imageUrl!]: previous.offlineImageUri!,
                        }
                  );
                  void rememberOfflineImageUri(
                    cacheKey,
                    previous.offlineImageUri,
                    nextMessage.imageUrl,
                  ).then((durableUri) => {
                    if (!durableUri) return;
                    setCachedImageUris((current) => ({
                      ...current,
                      [cacheKey]: durableUri,
                      [nextMessage.imageUrl!]: durableUri,
                    }));
                    setMessages((current) => current.map((candidate) =>
                      candidate.id === nextMessage.id
                        ? { ...candidate, offlineImageUri: durableUri }
                        : candidate,
                    ));
                  });
                  nextMessage.offlineImageUri = previous.offlineImageUri;
                }
                if (rowType === 'video' && previous?.offlineVideoUri && nextMessage.videoUrl) {
                  const cacheKey = nextMessage.storagePath ?? nextMessage.videoUrl;
                  setCachedVideoUris((current) =>
                    current[cacheKey] === previous.offlineVideoUri
                      ? current
                      : {
                          ...current,
                          [cacheKey]: previous.offlineVideoUri!,
                          [nextMessage.videoUrl!]: previous.offlineVideoUri!,
                        }
                  );
                  void rememberOfflineVideoUri(
                    cacheKey,
                    previous.offlineVideoUri,
                    nextMessage.videoUrl,
                  ).then((durableUri) => {
                    if (!durableUri) return;
                    setCachedVideoUris((current) => ({
                      ...current,
                      [cacheKey]: durableUri,
                      [nextMessage.videoUrl!]: durableUri,
                    }));
                    setMessages((current) => current.map((candidate) =>
                      candidate.id === nextMessage.id
                        ? { ...candidate, offlineVideoUri: durableUri }
                        : candidate,
                    ));
                  });
                  nextMessage.offlineVideoUri = previous.offlineVideoUri;
                }
                const next = [...prev];
                next[tempIndex] = nextMessage;
                return reconcileDeliveredFallback(linkReplies(next));
              }
              return reconcileDeliveredFallback(linkReplies([...prev, mergeOfflineMediaIntoMessage(nextMessage, undefined)]));
            });
            if (!hiddenMessageIdsRef.current.has(canonicalRow.id)) {
              void syncMessageReactions([canonicalRow.id]);
              if (canonicalRow.is_view_once) {
                void syncViewOnceStatus([canonicalRow.id]);
              }
            }
            if (!canonicalRow.is_read && !canonicalRow.delivered_at) {
              scheduleOutgoingReceiptStateSync(canonicalRow.id);
            }
          })();
        },
        onSentUpdate: (row) => {
          if (hiddenMessageIdsRef.current.has(row.id)) return;
          void (async () => {
            const { canonicalRow, message: nextMessage } = await processThreadRealtimeMessage({
              row: row as MessageDatabaseRow, hydrate: fetchCanonicalRealtimeMessageRow, map: mapRowToMessage,
              persist: async (message) => {
                await ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
                  chatMessageToLocalRow(user.id, activePeerMessageUserId, message),
                ]).catch((error) => console.log('[chat] sent realtime update local persist error', error));
              },
              markSyncSucceeded: (cursor) => ChatRepository.markSyncSucceeded(user.id, 'thread_messages', {
                threadId: activePeerMessageUserId, cursor: cursor ?? null,
              }),
              getCursor: (message) => message.created_at,
            });
            setMessages((prev) =>
              reconcileDeliveredFallback(
                linkReplies(
                  prev.map((msg) =>
                    msg.id === canonicalRow.id
                      ? {
                          ...mergeMessageWithMonotonicReceipt(msg, nextMessage),
                          reactions: msg.reactions,
                        }
                      : msg
                  ),
                ),
              ),
            );
          })();
        },
        onSystemInsert: (row) => {
        const nextMessage = mapSystemRowToMessage(row as SystemMessageRow);
        setMessages((prev) => {
          if (prev.some((msg) => msg.id === nextMessage.id)) return prev;
          const combined = [...prev, nextMessage].sort(
            (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
          );
          return linkReplies(combined);
        });
        },
      });

      return () => {
        stopRealtime();
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
      };
    }, [
      activePeerMessageUserId,
      conversationId,
      fetchCanonicalRealtimeMessageRow,
      fetchMessages,
      linkReplies,
      mapRowToMessage,
      mapSystemRowToMessage,
      reconcileDeliveredFallback,
      scheduleOutgoingReceiptStateSync,
      syncMessageReactions,
      syncViewOnceStatus,
      user?.id,
    ]);

  const startThreadAncillaryRealtime = useCallback(() => {
      if (!user?.id || !conversationId || !resolvedPeerAuthUserId) return () => {};

      const stopAncillaryRealtime = subscribeThreadAncillaryRealtime({
        currentUserId: user.id,
        conversationId,
        peerUserId: resolvedPeerAuthUserId,
        onReactionInsert: (row) => {
        if (!messagesRef.current.some((msg) => msg.id === row.message_id)) return;
        applyReactionUpdate(row as ReactionRow, 'upsert');
      },
      onReactionUpdate: (row) => {
        if (!messagesRef.current.some((msg) => msg.id === row.message_id)) return;
        applyReactionUpdate(row as ReactionRow, 'upsert');
      },
      onReactionDelete: (row) => {
        if (!messagesRef.current.some((msg) => msg.id === row.message_id)) return;
        applyReactionUpdate(row as ReactionRow, 'delete');
      },
      onMessageViewInsert: (row) => {
        if (!row?.message_id || !row?.viewer_id) return;
        if (!messagesRef.current.some((msg) => msg.id === row.message_id)) return;
        const nextStatus = mergeViewOnceStatus(viewOnceStatusRef.current[row.message_id], {
          viewedByMe: row.viewer_id === user.id,
          viewedByPeer: row.viewer_id === conversationId,
        });
        viewOnceStatusRef.current[row.message_id] = nextStatus;
        setViewOnceStatus((prev) => {
          return {
            ...prev,
            [row.message_id]: mergeViewOnceStatus(prev[row.message_id], nextStatus),
          };
        });
        void ChatRepository.upsertViewOnceStatuses(
          user.id,
          conversationId,
          [{ messageId: row.message_id, ...nextStatus }],
          { priority: 'background' },
        ).catch((error) => {
          console.log('[chat] persist realtime view-once status error', error);
        });
        },
      });

      return () => {
        stopAncillaryRealtime();
      };
    }, [applyReactionUpdate, conversationId, resolvedPeerAuthUserId, user?.id]);
  const startFocusedThreadPresence = useCallback(() => {
      if (!user?.id || !resolvedPeerAuthUserId) return () => {};
      const session = startThreadPresenceSession({
        currentUserId: user.id,
        peerUserId: resolvedPeerAuthUserId,
        onPeerPresenceSync: ({ hasPeer, peerTyping }) => {
          if (hasPeer) {
            markPeerThreadActive();
          } else {
            void refreshPeerStatus();
          }
          if (peerTyping) {
            setPeerTypingUntil(new Date(Date.now() + 5000).toISOString());
          }
        },
        onPeerJoin: () => {
          markPeerThreadActive();
        },
        onPeerLeave: () => {
          markPeerThreadInactive();
          void refreshPeerStatus();
        },
        onPeerOpenedThread: () => {
          markPeerThreadActive();
          markOutgoingMessagesDelivered();
        },
        onPeerTypingBroadcast: ({ typing }) => {
          if (typing) {
            markPeerThreadActive();
            setPeerTypingUntil(new Date(Date.now() + 5000).toISOString());
            markOutgoingMessagesDelivered();
            return;
          }
          setPeerTypingUntil(null);
        },
        onAppActive: () => {
          void refreshPeerStatus();
          refreshOutgoingReceiptStates();
        },
      });
      threadPresenceSessionRef.current = session;

      return () => {
        threadPresenceSessionRef.current = null;
        session.stop();
        markPeerThreadInactive();
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        if (peerTypingClearTimerRef.current) {
          clearTimeout(peerTypingClearTimerRef.current);
          peerTypingClearTimerRef.current = null;
        }
      };
    }, [
      markOutgoingMessagesDelivered,
      markPeerThreadActive,
      markPeerThreadInactive,
      refreshPeerStatus,
      refreshOutgoingReceiptStates,
      resolvedPeerAuthUserId,
      setPeerTypingUntil,
      user?.id,
    ]);

  const { refresh: refreshThread } = useChatThreadController({
    refreshThread: fetchMessages,
    startMessageRealtime: startThreadMessageRealtime,
    startAncillaryRealtime: startThreadAncillaryRealtime,
    startFocusedHydration: startFocusedThreadHydration,
    startFocusedPresence: startFocusedThreadPresence,
    startSynchronization: startThreadSynchronization,
  });

  const markFocusedThreadRead = useCallback(async (
    options?: { forceRemote?: boolean },
  ) => {
    if (
      !user?.id ||
      !activePeerMessageUserId ||
      !isScreenFocusedRef.current ||
      AppState.currentState !== 'active'
    ) {
      return;
    }
    const currentUserId = user.id;
    const peerUserId = activePeerMessageUserId;

    const latestLoadedIncomingAt = getLatestIncomingMessageTimestamp(messagesRef.current, peerUserId);
    if (latestLoadedIncomingAt !== null) {
      markChatThreadOptimisticallyRead(
        currentUserId,
        peerUserId,
        latestLoadedIncomingAt,
      );
    }
    setMessages((prev) =>
      markLoadedIncomingMessagesRead({
        items: prev,
        currentUserId,
      }),
    );

    await focusedThreadReadCoordinatorRef.current.acknowledge({
      currentUserId,
      peerUserId,
      forceRemote: options?.forceRemote,
      persistLocal: async () => {
        const { timedOut } = await withLocalOperationTimeout(
          ChatRepository.markThreadRead(currentUserId, peerUserId),
          LOCAL_CHAT_OPERATION_TIMEOUT_MS,
          undefined,
        );
        if (timedOut) console.log('[chat][thread][read] local-timeout', { currentUserId, peerUserId });
      },
      persistSnapshot: () => patchChatConversationReadSnapshot(currentUserId, peerUserId),
      markRemote: async () =>
        await ChatThreadActionsService.markThreadRead({ peerUserId, currentUserId }),
    });
  }, [activePeerMessageUserId, user?.id]);

  useEffect(() => {
    focusedThreadReadActionRef.current = markFocusedThreadRead;
  }, [markFocusedThreadRead]);

  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;
      if (user?.id && activePeerMessageUserId) {
        activeThreadTokenRef.current = setActiveChatThread(user.id, activePeerMessageUserId);
        void markFocusedThreadRead();
      }
      return () => {
        isScreenFocusedRef.current = false;
        clearActiveChatThread(user?.id, activePeerMessageUserId, activeThreadTokenRef.current);
        activeThreadTokenRef.current = null;
        if (user?.id && activePeerMessageUserId) {
          focusedThreadReadCoordinatorRef.current.clear(user.id, activePeerMessageUserId);
        }
        viewableReadCandidateIdsRef.current.clear();
        Object.values(pendingReadTimersRef.current).forEach((timer) => clearTimeout(timer));
        pendingReadTimersRef.current = {};
        readReceiptBatcherRef.current.dispose();
      };
    }, [activePeerMessageUserId, markFocusedThreadRead, user?.id]),
  );

  const scheduleReadReceiptFlush = useCallback(
    (messageId: string) => {
      if (!user?.id || !activePeerMessageUserId) return;
      readReceiptBatcherRef.current.enqueue({
        messageId,
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
      });
    },
    [activePeerMessageUserId, user?.id],
  );

  const markAsRead = useCallback(
    (messageId: string) => {
      if (!user?.id || !activePeerMessageUserId) return;
      clearPendingReadTimer(messageId);
      if (!isScreenFocusedRef.current || AppState.currentState !== 'active') {
        return;
      }
      if (!viewableReadCandidateIdsRef.current.has(messageId)) {
        return;
      }
      const targetMessage = messagesRef.current.find((message) => message.id === messageId);
      if (!shouldScheduleMessageRead({ item: targetMessage, currentUserId: user.id })) {
        return;
      }
      setMessages((prev) =>
        markIncomingMessageRead({
          items: prev,
          messageId,
          currentUserId: user.id,
        })
      );
      markChatThreadOptimisticallyRead(
        user.id,
        activePeerMessageUserId,
        targetMessage.timestamp,
      );
      scheduleReadReceiptFlush(messageId);
    },
    [activePeerMessageUserId, clearPendingReadTimer, scheduleReadReceiptFlush, user?.id]
  );

  const scheduleMarkAsRead = useCallback(
    (messageId: string) => {
      if (!isScreenFocusedRef.current || AppState.currentState !== 'active') return;
      if (!viewableReadCandidateIdsRef.current.has(messageId)) return;
      if (pendingReadTimersRef.current[messageId]) return;
      pendingReadTimersRef.current[messageId] = setTimeout(() => {
        delete pendingReadTimersRef.current[messageId];
        void markAsRead(messageId);
      }, CHAT_READ_RECEIPT_DELAY_MS);
    },
    [markAsRead]
  );

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (isTyping) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(typingAnimation, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(typingAnimation, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    } else {
      typingAnimation.setValue(0);
    }

    return () => {
      if (loop) loop.stop();
    };
  }, [isTyping, typingAnimation]);

  const formatTime = useCallback((date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }, []);

  const isSameDay = useCallback((a?: Date | null, b?: Date | null) => {
    if (!a || !b) return false;
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }, []);

  const formatDayLabel = useCallback((date: Date) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    const weekdaysLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (diffDays > 1 && diffDays < 7) {
      return weekdaysLong[date.getDay()];
    }
    const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const weekday = weekdaysShort[date.getDay()];
    const day = date.getDate();
    const month = monthsShort[date.getMonth()];
    return `${weekday} ${day} ${month}`;
  }, []);

  const messageRenderMetaById = useMemo(() => {
    const next = new Map<string, MessageRenderMeta>();
    renderedMessages.forEach((item, index) => {
      const isSystemMessage = item.type === 'system' || item.isSystem;
      const isMyMessage = !isSystemMessage && item.senderId === (user?.id || '');
      const prevMessage = renderedMessages[index - 1];
      const nextMessage = renderedMessages[index + 1];
      const prevIsSystemMessage = prevMessage?.type === 'system' || prevMessage?.isSystem;
      const nextIsSystemMessage = nextMessage?.type === 'system' || nextMessage?.isSystem;
      const isGroupedWithPrev =
        !isSystemMessage &&
        Boolean(
          prevMessage &&
            !prevIsSystemMessage &&
            prevMessage.senderId === item.senderId &&
            isSameDay(prevMessage.timestamp, item.timestamp),
        );
      const isGroupedWithNext =
        !isSystemMessage &&
        Boolean(
          nextMessage &&
            !nextIsSystemMessage &&
            nextMessage.senderId === item.senderId &&
            isSameDay(nextMessage.timestamp, item.timestamp),
        );
      const showAvatar = !isSystemMessage && !isMyMessage && !isChatBlocked && !isGroupedWithNext;
      const showAvatarSpacer =
        !isSystemMessage && !isMyMessage && !isChatBlocked && isGroupedWithNext;
      const mediaPaths = [
        item.storagePath,
        item.previewStoragePath,
        ...(item.mediaItems ?? []).flatMap((mediaItem) => [
          mediaItem.storagePath,
          mediaItem.previewStoragePath,
        ]),
      ].filter((path): path is string => Boolean(path));
      const mediaUrisByPath = Object.fromEntries(
        mediaPaths
          .map((path) => [path, chatMediaUrisByPath[path]] as const)
          .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
      );
      const primaryMediaPath = item.storagePath ?? item.mediaItems?.[0]?.storagePath;
      const mediaFailure = mediaPaths
        .map((path) => chatMediaFailures[path])
        .find((failure) => Boolean(failure));
      next.set(item.id, {
        isMyMessage,
        showAvatar,
        showAvatarSpacer,
        isGroupedWithPrev,
        isGroupedWithNext,
        showDateSeparator: !prevMessage || !isSameDay(prevMessage.timestamp, item.timestamp),
        timeLabel: formatTime(item.timestamp),
        imageSize: item.type === 'image'
          ? getStableChatImageFrame(item.mediaItems?.[0]?.width, item.mediaItems?.[0]?.height, Math.min(responsive.width * 0.72, 340))
          : undefined,
        cachedImageUrl:
          item.type === 'image'
            ? (primaryMediaPath ? chatMediaUrisByPath[primaryMediaPath] : undefined) ??
              (item.imageUrl ? cachedImageUris[item.imageUrl] : undefined)
            : undefined,
        cachedVideoUrl:
          item.type === 'video'
            ? (primaryMediaPath ? chatMediaUrisByPath[primaryMediaPath] : undefined) ??
              (item.videoUrl ? cachedVideoUris[item.videoUrl] : undefined)
            : undefined,
        mediaUrisByPath,
        mediaFailure,
        viewOnceViewedByMe: viewOnceStatus[item.id]?.viewedByMe ?? false,
        viewOnceViewedByPeer: viewOnceStatus[item.id]?.viewedByPeer ?? false,
        isActionPinned: pinnedMessageIdSet.has(item.id),
      });
    });
    return next;
  }, [
    cachedImageUris,
    cachedVideoUris,
    chatMediaFailures,
    chatMediaUrisByPath,
    formatTime,
    isChatBlocked,
    isSameDay,
    pinnedMessageIdSet,
    renderedMessages,
    responsive.width,
    user?.id,
    viewOnceStatus,
  ]);

  const getMessageItemType = useCallback((item: MessageType) => {
    if (item.type === 'system' || item.isSystem) return 'system';
    switch (item.type) {
      case 'image':
      case 'video':
      case 'voice':
      case 'document':
      case 'date_plan':
      case 'mood_sticker':
        return item.type;
      case 'location':
        return item.location?.live ? 'location-live' : 'location';
      case 'text':
      default:
        return 'text';
    }
  }, []);

  const focusMessage = useCallback((messageId: string) => {
    setFocusedMessageId(messageId);
    setFocusTick((prev) => prev + 1);
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
    }
    focusTimerRef.current = setTimeout(() => {
      setFocusedMessageId(null);
      focusTimerRef.current = null;
    }, 2500);
  }, []);

  const jumpToMessage = useCallback(
    (messageId: string) => {
      const index = renderedMessages.findIndex((msg) => msg.id === messageId);
      if (index < 0) return;
      if (jumpSettleRef.current) {
        clearTimeout(jumpSettleRef.current);
        jumpSettleRef.current = null;
      }
      const listIndex = chronologicalIndexToListIndex(index);
      flatListRef.current?.scrollToIndex({ index: listIndex, animated: true, viewPosition: 0.58 });
      jumpSettleRef.current = setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: listIndex, animated: true, viewPosition: 0.5 });
      }, 320);
      focusMessage(messageId);
    },
    [focusMessage, renderedMessages]
  );

  const pinnedMessages = useMemo(() => {
    if (pinnedMessageIds.length === 0) return [];
    const idSet = new Set(pinnedMessageIds);
    const messageMap = new Map<string, MessageType>();
    Object.values(pinnedMessageMap).forEach((msg) => {
      if (idSet.has(msg.id)) messageMap.set(msg.id, msg);
    });
    messages.forEach((msg) => {
      if (idSet.has(msg.id)) messageMap.set(msg.id, msg);
    });
    return pinnedMessageIds
      .map((id) => messageMap.get(id))
      .filter((msg): msg is MessageType => Boolean(msg))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [messages, pinnedMessageIds, pinnedMessageMap]);

  const primaryPinnedMessage = pinnedMessages[0] ?? null;
  const pinnedMessageCount = pinnedMessages.length;
  const pinnedMessageTotal = pinnedMessageIds.length;
  const getPinnedPreview = useCallback((message?: MessageType | null) => {
    if (!message) return 'Pinned message';
    if (message.deletedForAll) return 'Message deleted';
      switch (message.type) {
        case 'system':
          return message.text?.trim() || 'System message';
        case 'text':
          return message.text?.trim() || 'Pinned message';
      case 'image':
        return 'Photo';
      case 'video':
        return 'Video';
      case 'voice':
        return 'Voice message';
      case 'document':
        return message.document?.name || 'Document';
      case 'date_plan':
        return message.dateInvite?.placeName
          ? `Date: ${message.dateInvite.placeName}`
          : 'Date plan';
      case 'location':
        return message.location?.label
          ? `Location: ${message.location.label}`
          : 'Location';
      case 'mood_sticker':
        return message.sticker?.name ? `Sticker: ${message.sticker.name}` : 'Sticker';
      default:
        return 'Pinned message';
    }
  }, []);

  const getPinnedIcon = useCallback((message?: MessageType | null) => {
    if (!message) return 'pin-outline';
    switch (message.type) {
      case 'system':
        return 'information-outline';
      case 'image':
        return 'image-outline';
      case 'video':
        return 'video-outline';
      case 'voice':
        return 'microphone-outline';
      case 'document':
        return 'file-document-outline';
      case 'date_plan':
        return 'calendar-heart';
      case 'location':
        return 'map-marker-outline';
      case 'mood_sticker':
        return 'emoticon-happy-outline';
      case 'text':
      default:
        return 'chat-outline';
    }
  }, []);

  const pinnedPreviewText = useMemo(
    () => getPinnedPreview(primaryPinnedMessage),
    [getPinnedPreview, primaryPinnedMessage]
  );

  const [remoteSearchResults, setRemoteSearchResults] = useState<MessageType[]>([]);
  useEffect(() => {
    const query = chatSearchQuery.trim();
    if (query.length < 2 || !user?.id || !activePeerMessageUserId) {
      setRemoteSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT_FIELDS)
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${activePeerMessageUserId}),and(sender_id.eq.${activePeerMessageUserId},receiver_id.eq.${user.id})`,
        )
        .eq('message_type', 'text')
        .eq('deleted_for_all', false)
        .ilike('text', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        console.log('[chat] full history search error', error);
        setRemoteSearchResults([]);
        return;
      }
      setRemoteSearchResults(((data ?? []) as MessageDatabaseRow[]).map(mapRowToMessage));
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activePeerMessageUserId, chatSearchQuery, mapRowToMessage, user?.id]);

  const {
    pinnedSheetVisible,
    pinnedBannerExpanded,
    setPinnedBannerExpanded,
    closePinnedSheet,
    trimmedChatSearchQuery,
    searchResults,
    matchMessageIdSet,
    mediaItems,
    linkItems,
    docItems,
    jumpToNextMatch,
    togglePinnedBanner,
    handlePinnedJump,
    handlePinnedSeeAll,
  } = useChatThreadBrowseUi({
    chatSearchQuery,
    renderedMessages,
    remoteSearchResults,
    pinnedMessageCount,
    primaryPinnedMessage,
    jumpToMessage,
  });

  useEffect(() => {
    if (pinnedMessageCount === 0 && pinnedBannerExpanded) {
      setPinnedBannerExpanded(false);
    }
  }, [pinnedBannerExpanded, pinnedMessageCount]);

  useEffect(() => {
    Animated.timing(pinnedBannerAnim, {
      toValue: pinnedBannerExpanded ? 1 : 0,
      duration: pinnedBannerExpanded ? 260 : 200,
      easing: pinnedBannerExpanded ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pinnedBannerAnim, pinnedBannerExpanded]);

  const pinnedActionsHeight = useMemo(
    () =>
      pinnedBannerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 52],
      }),
    [pinnedBannerAnim]
  );
  const pinnedActionsOpacity = useMemo(
    () =>
      pinnedBannerAnim.interpolate({
        inputRange: [0, 0.35, 1],
        outputRange: [0, 0, 1],
      }),
    [pinnedBannerAnim]
  );
  const pinnedChevronRotation = useMemo(
    () =>
      pinnedBannerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
      }),
    [pinnedBannerAnim]
  );

  const updateTyping = useCallback(
    (text: string) => {
      if (isChatBlocked) return;
      if (!user?.id) return;
      const presenceSession = threadPresenceSessionRef.current;
      if (!presenceSession) return;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      const sendTypingStatus = (typing: boolean) => {
        presenceSession.broadcastTyping(typing);
      };
      if (text.trim().length === 0) {
        lastTypingBroadcastAtRef.current = 0;
        sendTypingStatus(false);
        return;
      }
      const now = Date.now();
      if (now - lastTypingBroadcastAtRef.current >= 800) {
        lastTypingBroadcastAtRef.current = now;
        sendTypingStatus(true);
      }
      typingTimeoutRef.current = setTimeout(() => {
        lastTypingBroadcastAtRef.current = 0;
        sendTypingStatus(false);
      }, 1500);
    },
    [isChatBlocked, resolvedPeerAuthUserId, user?.id]
  );

  const handleInputChange = (text: string) => {
    setInputText(text);
    updateTyping(text);
  };

  const submitEditMessage = useCallback(async () => {
    if (!editingMessage || !user?.id) return;
    const trimmed = inputText.trim();
    if (!trimmed) return;
    if (trimmed === (editingMessage.text || '')) {
      setEditingMessage(null);
      setInputText('');
      updateTyping('');
      return;
    }
    const targetId = editingMessage.id;
    const optimisticEditedAt = new Date();
    setMessages((prev) =>
      applyOptimisticMessageEdit({
        items: prev,
        messageId: targetId,
        text: trimmed,
        editedAt: optimisticEditedAt,
      })
    );
    setEditingMessage(null);
    setInputText('');
    updateTyping('');

    const { data, error } = await ChatThreadActionsService.editMessage({
      messageId: targetId,
      newText: trimmed,
    });

    if (error) {
      console.log('[chat] edit message error', error);
      const moderationCode = String((error as { code?: string })?.code ?? '');
      Alert.alert(
        moderationCode === 'MESSAGE_CONTENT_NOT_ALLOWED' || moderationCode === 'MESSAGE_REVIEW_REQUIRED'
          ? 'Edit not saved'
          : 'Edit message',
        moderationCode === 'MESSAGE_REVIEW_REQUIRED'
          ? 'This edit is being held for a safety review.'
          : moderationCode === 'MESSAGE_CONTENT_NOT_ALLOWED'
            ? 'Please remove solicitation, threats, scams, or unsafe content and try again.'
            : 'Unable to update this message right now.',
      );
      await refreshThread();
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    const mapped = mapRowToMessage(row as MessageDatabaseRow);
    if (activePeerMessageUserId) {
      void ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
        chatMessageToLocalRow(user.id, activePeerMessageUserId, mapped),
      ]).catch((localError) => console.log('[chat] edited message local persist error', localError));
    }
    setMessages((prev) =>
      reconcileEditedMessage({
        items: prev,
        messageId: mapped.id,
        text: mapped.text,
        editedAt: mapped.editedAt ?? optimisticEditedAt,
      })
    );
  }, [activePeerMessageUserId, editingMessage, inputText, mapRowToMessage, refreshThread, updateTyping, user?.id]);

  const sendMessage = async () => {
    if (editingMessage) {
      await submitEditMessage();
      return;
    }
    if (!peerResolved) {
      Alert.alert('Loading chat', 'One moment - we are setting up this conversation.');
      return;
    }
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    const trimmed = inputText.trim();
    if (!trimmed || !user?.id || !activePeerMessageUserId) return;
    if (textSendInFlightRef.current) return;
    textSendInFlightRef.current = true;
    Haptics.selectionAsync().catch(() => {});
    const optimistic = createOptimisticTextMessage({
      text: trimmed,
      senderId: user.id,
      replyTo: replyingTo ?? undefined,
    });
    const tempId = optimistic.id;

    setMessages((prev) => [...prev, optimistic]);
    await persistLocalTextOutboxState({
      ownerUserId: user.id,
      threadId: activePeerMessageUserId,
      message: optimistic,
      outboxStatus: 'sending',
    }).catch((persistError) => console.log('[chat] persist text outbox error', persistError));
    setInputText('');
    updateTyping('');
    setReplyingTo(null);
    setEditingMessage(null);

    if (!networkReady) {
      const queuedMessage = transitionMessageLifecycleRecord({
        message: optimistic,
        event: 'send_deferred',
      });
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: queuedMessage,
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued text outbox error', persistError));
      setMessages((prev) => transitionMessageLifecycle({
        items: prev,
        messageId: tempId,
        event: 'send_deferred',
      }));
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      textSendInFlightRef.current = false;
      return;
    }
    await flushLocalTextOutbox(user.id)
      .catch((error) => {
        if (!isLikelyNetworkError(error)) {
          console.log('[chat] flush text outbox error', error);
        }
      })
      .finally(() => {
        textSendInFlightRef.current = false;
      });

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMoodSticker = useCallback(async (sticker: (typeof MOOD_STICKERS)[number]) => {
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    if (!peerResolved || !user?.id || !activePeerMessageUserId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const tempId = `temp-sticker-${Date.now()}`;
    const clientMessageId = tempId;
    const payload = buildStickerPayload(sticker);
    const optimisticStickerMessage: MessageType = {
      id: tempId,
      clientMessageId,
      text: payload,
      senderId: user.id,
      timestamp: new Date(),
      type: 'mood_sticker',
      reactions: [],
      status: 'sending',
      sticker: {
        emoji: sticker.emoji,
        name: sticker.name,
        color: sticker.color,
      },
      replyToId: replyingTo?.id ?? null,
      replyTo: replyingTo || undefined,
    };
    setMessages((prev) => [
      ...prev,
      optimisticStickerMessage,
    ]);
    await persistLocalTextOutboxState({
      ownerUserId: user.id,
      threadId: activePeerMessageUserId,
      message: optimisticStickerMessage,
      outboxStatus: 'sending',
    }).catch((persistError) => console.log('[chat] persist sticker outbox error', persistError));
    setShowMoodStickers(false);
    setReplyingTo(null);
    setEditingMessage(null);
    setViewOnceMode(false);

    if (!networkReady) {
      const queuedMessage = transitionMessageLifecycleRecord({
        message: optimisticStickerMessage,
        event: 'send_deferred',
      });
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: queuedMessage,
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued sticker outbox error', persistError));
      setMessages((prev) => transitionMessageLifecycle({
        items: prev,
        messageId: tempId,
        event: 'send_deferred',
      }));
      return;
    }

    await flushLocalTextOutbox(user.id).catch((error) => {
      if (!isLikelyNetworkError(error)) {
        console.log('[chat] flush sticker outbox error', error);
      }
    });
  }, [peerResolved, activePeerMessageUserId, isBlockedByMe, isChatBlocked, networkReady, replyingTo, user?.id]);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user?.id) return;
    if (messageId.startsWith('temp-')) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const reactionMutation = applyLocalReactionToggle({
      items: messagesRef.current,
      messageId,
      userId: user.id,
      emoji,
    });
    const { previousReactions, shouldRemove } = reactionMutation;
    setMessages(reactionMutation.items);
    setShowReactions(null);

    if (shouldRemove) {
      const { error } = await ChatThreadRemoteService.removeReaction({
        messageId,
        currentUserId: user.id,
      });
      if (error) {
        if (isLikelyNetworkError(error)) {
          await enqueueChatReactionSyncMutation({
            messageId,
            userId: user.id,
            emoji: null,
          });
          return;
        }
        console.log('[chat] remove reaction error', error);
        setMessages((prev) =>
          restoreMessageReactions({
            items: prev,
            messageId,
            reactions: previousReactions,
          })
        );
        Alert.alert('Reaction', 'Unable to remove your reaction right now.');
      }
      return;
    }

    const { error } = await ChatThreadRemoteService.upsertReaction({
      messageId,
      currentUserId: user.id,
      emoji,
    });

    if (error) {
      if (isLikelyNetworkError(error)) {
        await enqueueChatReactionSyncMutation({
          messageId,
          userId: user.id,
          emoji,
        });
        return;
      }
      console.log('[chat] add reaction error', error);
      setMessages((prev) =>
        restoreMessageReactions({
          items: prev,
          messageId,
          reactions: previousReactions,
        })
      );
      Alert.alert('Reaction', 'Unable to react right now.');
    }
  }, [user?.id]);

  const stopRecordingTimer = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }, []);

  const startRecordingTimer = useCallback(() => {
    stopRecordingTimer();
    recordingIntervalRef.current = setInterval(() => {
      const recording = recordingRef.current;
      if (!recording) return;
      const status = recording.getStatus();
      const durationSeconds = (status.durationMillis ?? 0) / 1000;
      setRecordingDuration((prev) =>
        Math.abs(prev - durationSeconds) > 0.1 ? durationSeconds : prev
      );
    }, 300);
  }, [stopRecordingTimer]);

  const startRecordingPulse = useCallback(() => {
    recordingPulseRef.current?.stop();
    recordingAnimation.setValue(0);
    recordingPulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(recordingAnimation, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(recordingAnimation, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    recordingPulseRef.current.start();
  }, [recordingAnimation]);

  const stopRecordingPulse = useCallback(() => {
    recordingPulseRef.current?.stop();
    recordingPulseRef.current = null;
    recordingAnimation.stopAnimation();
    recordingAnimation.setValue(0);
  }, [recordingAnimation]);

  const resetRecordingState = useCallback(() => {
    stopRecordingTimer();
    stopRecordingPulse();
    if (voicePreviewSoundRef.current) {
      voicePreviewSoundRef.current.pause();
      voicePreviewSoundRef.current.remove();
      voicePreviewSoundRef.current = null;
    }
    recordingDraftRef.current = null;
    setIsRecording(false);
    setIsVoicePreviewReady(false);
    setIsVoicePreviewPlaying(false);
    setRecordingDuration(0);
    recordingRef.current = null;
  }, [stopRecordingPulse, stopRecordingTimer]);

  const startVoiceRecording = async () => {
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    if (isRecording || isUploadingVoice) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        showOpenSettingsPrompt(
          'Microphone access',
          'Turn on microphone access in Settings so Betweener can record voice messages.',
        );
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      const recording = recordingRef.current ?? audioRecorder;
      const recorderState = recording.getStatus();
      if (!recorderState.canRecord && !recorderState.isRecording) {
        await recording.prepareToRecordAsync();
      }
      recording.record();
      recordingRef.current = recording;
      recordingDraftRef.current = null;
      setIsRecording(true);
      setIsVoicePreviewReady(false);
      setIsVoicePreviewPlaying(false);
      setRecordingDuration(0);
      startRecordingPulse();
      startRecordingTimer();
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.log('[chat] voice recording error', error);
      Alert.alert('Voice message', 'Could not start recording. Please try again.');
      resetRecordingState();
    }
  };

  const finishVoiceRecording = useCallback(async () => {
    if (!recordingRef.current || !isRecording || isVoicePreviewReady) return;
    let finalizedUri: string | null = null;
    try {
      const recording = recordingRef.current;
      const status = recording.getStatus();
      const durationSeconds = Math.max(
        recordingDuration,
        typeof status.durationMillis === 'number' ? status.durationMillis / 1000 : 0,
      );
      await recording.stop();
      const uri = recording.uri;
      if (!uri) {
        throw new Error('Recording completed without a local file.');
      }
      finalizedUri = uri;
      recordingRef.current = null;
      recordingDraftRef.current = { uri, durationSeconds };
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      setIsVoicePreviewReady(true);
      setIsVoicePreviewPlaying(false);
      stopRecordingTimer();
      stopRecordingPulse();
    } catch (error) {
      console.log('[chat] finish recording for preview error', error);
      if (finalizedUri) {
        await FileSystem.deleteAsync(finalizedUri, { idempotent: true }).catch(() => undefined);
      }
      Alert.alert('Voice message', 'Could not prepare this recording for review. Please try again.');
      resetRecordingState();
    }
  }, [isRecording, isVoicePreviewReady, recordingDuration, resetRecordingState, stopRecordingPulse, stopRecordingTimer]);

  const toggleVoicePreview = useCallback(async () => {
    const draft = recordingDraftRef.current;
    if (!draft || !isRecording || !isVoicePreviewReady) return;
    try {
      if (voicePreviewSoundRef.current) {
        if (isVoicePreviewPlaying) {
          voicePreviewSoundRef.current.pause();
          setIsVoicePreviewPlaying(false);
        } else {
          voicePreviewSoundRef.current.play();
          setIsVoicePreviewPlaying(true);
        }
        return;
      }

      const player = createAudioPlayer({ uri: draft.uri }, { updateInterval: 100 });
      voicePreviewSoundRef.current = player;
      (player as any).addListener?.('playbackStatusUpdate', (status: any) => {
        if (!status?.didJustFinish) return;
        player.pause();
        player.remove();
        if (voicePreviewSoundRef.current === player) {
          voicePreviewSoundRef.current = null;
          setIsVoicePreviewPlaying(false);
        }
      });
      player.play();
      setIsVoicePreviewPlaying(true);
    } catch (error) {
      console.log('[chat] voice preview error', error);
      setIsVoicePreviewPlaying(false);
      Alert.alert('Voice message', 'Could not play this recording. Please try again.');
    }
  }, [isRecording, isVoicePreviewPlaying, isVoicePreviewReady]);

  const discardVoiceRecording = useCallback(async () => {
    if (!isRecording) return;
    const draftUri = recordingDraftRef.current?.uri ?? null;
    try {
      const recording = recordingRef.current;
      let uri = draftUri;
      if (recording) {
        await recording.stop();
        uri = recording.uri ?? uri;
      }
      if (uri) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
    } catch (error) {
      console.log('[chat] discard recording error', error);
    } finally {
      resetRecordingState();
    }
  }, [isRecording, resetRecordingState]);

  const sendVoiceRecording = useCallback(async () => {
    if ((!recordingRef.current && !recordingDraftRef.current) || !user?.id || !conversationId || isUploadingVoice) return;
    setIsUploadingVoice(true);
    const recording = recordingRef.current;
    const draft = recordingDraftRef.current;
    let uri: string | null = draft?.uri ?? null;
    let durationSeconds = Math.max(recordingDuration, draft?.durationSeconds ?? 0);
    try {
      if (voicePreviewSoundRef.current) {
        voicePreviewSoundRef.current.pause();
        voicePreviewSoundRef.current.remove();
        voicePreviewSoundRef.current = null;
        setIsVoicePreviewPlaying(false);
      }
      if (recording) {
        const status = recording.getStatus();
        if (typeof status.durationMillis === 'number') {
          durationSeconds = Math.max(durationSeconds, status.durationMillis / 1000);
        }
        await recording.stop();
        uri = recording.uri;
      }
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
    } catch (error) {
      console.log('[chat] stop recording error', error);
      Alert.alert('Voice message', 'Could not finish recording. Please try again.');
    }
    resetRecordingState();

    if (!uri) {
      setIsUploadingVoice(false);
      return;
    }

    const waveform = DEFAULT_VOICE_WAVEFORM;
    const tempId = `temp-voice-${Date.now()}`;
    const clientMessageId = tempId;
    const optimistic: MessageType = {
      id: tempId,
      clientMessageId,
      text: '',
      senderId: user.id,
      timestamp: new Date(),
      type: 'voice',
      reactions: [],
      status: 'sending',
      voiceMessage: {
        duration: durationSeconds,
        waveform,
        isPlaying: false,
        audioPath: uri,
      },
      replyToId: replyingTo?.id ?? null,
      replyTo: replyingTo || undefined,
    };
    setMessages((prev) => [...prev, optimistic]);
    setReplyingTo(null);
    setEditingMessage(null);
    const { extension, contentType } = resolveChatVoiceRecordingMetadata(uri);
    const fileName = `voice-${Date.now()}.${extension}`;
    let recoverableUri = uri;

    try {
      const stagedUri = await stageOfflineChatUpload(uri, fileName);
      recoverableUri = stagedUri;
      const transitionedVoiceMessage = transitionMessageLifecycleRecord({
        message: optimistic,
        event: networkReady ? 'send_started' : 'send_deferred',
      });
      const localVoiceMessage: MessageType = {
        ...transitionedVoiceMessage,
        voiceMessage: optimistic.voiceMessage
          ? { ...optimistic.voiceMessage, audioPath: stagedUri }
          : optimistic.voiceMessage,
      };
      await ChatRepository.enqueueMessageWithOutbox(
        user.id,
        activePeerMessageUserId,
        chatMessageToLocalRow(user.id, activePeerMessageUserId, localVoiceMessage),
        buildVoiceOutboxRow({
          ownerUserId: user.id,
          threadId: activePeerMessageUserId,
          message: localVoiceMessage,
          localUri: stagedUri,
          fileName,
          contentType,
          durationSeconds,
          waveform,
        }),
      );
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? {
                ...transitionMessageLifecycleRecord({
                  message: msg,
                  event: networkReady ? 'send_started' : 'send_deferred',
                }),
                voiceMessage: msg.voiceMessage
                  ? { ...msg.voiceMessage, audioPath: stagedUri }
                  : msg.voiceMessage,
              }
            : msg
        )
      );
      if (networkReady) {
        void ChatOutboxService.flushPending(user.id).catch((error) => {
          if (!isLikelyNetworkError(error)) {
            console.log('[chat] flush queued voice outbox error', error);
          }
        });
      }
    } catch (error) {
      console.log('[chat] queue voice message error', error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      recordingDraftRef.current = {
        uri: recoverableUri,
        durationSeconds,
      };
      setRecordingDuration(durationSeconds);
      setIsRecording(true);
      setIsVoicePreviewReady(true);
      setIsVoicePreviewPlaying(false);
      Alert.alert(
        'Voice message',
        'This recording is still ready. Please try sending it again.',
      );
    } finally {
      setIsUploadingVoice(false);
    }
  }, [activePeerMessageUserId, conversationId, isUploadingVoice, networkReady, recordingDuration, replyingTo, resetRecordingState, user?.id]);

  const stopVoicePlayback = useCallback(async () => {
    if (!voiceSoundRef.current) {
      setPlayingVoiceId(null);
      return;
    }
    try {
      voiceSoundRef.current.pause();
      voiceSoundRef.current.remove();
    } catch (error) {
      console.log('[chat] stop playback error', error);
    } finally {
      voiceSoundRef.current = null;
      setPlayingVoiceId(null);
    }
  }, []);

  const toggleVoicePlayback = useCallback(async (messageId: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (playingVoiceId === messageId) {
      await stopVoicePlayback();
      return;
    }

    const message = messagesRef.current.find((msg) => msg.id === messageId);
    const audioPath = message?.voiceMessage?.audioPath;
    if (!audioPath) return;

    await stopVoicePlayback();
    const voiceCacheKey = `voice:${audioPath}`;
    let playbackUri = audioPath;
    if (!audioPath.startsWith('file://')) {
      const cachedUri = await findOfflineAttachment(voiceCacheKey);
      if (cachedUri) {
        playbackUri = cachedUri;
      } else {
        const { data, error } = await supabase
          .storage
          .from('voice-messages')
          .createSignedUrl(audioPath, 3600);
        if (error || !data?.signedUrl) {
          console.log('[chat] signed url error', error);
          Alert.alert('Voice message', networkReady
            ? 'Unable to load this audio.'
            : 'Reconnect to play this voice message for the first time.');
          return;
        }
        playbackUri =
          await cacheOfflineAttachment({
            sourceKey: voiceCacheKey,
            remoteUri: data.signedUrl,
            category: 'audio',
            fileName: audioPath,
          }) ?? data.signedUrl;
      }
    }

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      const player = createAudioPlayer({ uri: playbackUri }, { updateInterval: 200 });
      voiceSoundRef.current = player;
      setPlayingVoiceId(messageId);
      (player as any).addListener?.('playbackStatusUpdate', (status: any) => {
        if (!status.isLoaded) {
          return;
        }
        if (status.didJustFinish) {
          stopVoicePlayback();
        }
      });
      player.play();
    } catch (error) {
      console.log('[chat] playback error', error);
      Alert.alert('Voice message', 'Playback failed.');
    }
  }, [networkReady, playingVoiceId, stopVoicePlayback]);

  const captureCameraMedia = useCallback(async (captureMode: 'image' | 'video' | 'mixed') => {
    if (mediaUploadStatus) {
      Alert.alert('Upload in progress', 'Please wait for the current media upload to finish.');
      return;
    }
    const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
    if (!cameraStatus.granted) {
      showOpenSettingsPrompt(
        'Camera access',
        'Turn on camera access in Settings so Betweener can take photos or videos.',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes:
        captureMode === 'image'
          ? ['images']
          : captureMode === 'video'
          ? ['videos']
          : PICKER_MEDIA_TYPES_ALL,
      quality: 0.85,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      videoMaxDuration: 30,
    });
    if (result.canceled) return;
    closeAttachmentSheet();
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    const attachmentError = validateChatAttachment({
      kind: asset.type === 'video' ? 'video' : 'image',
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.fileSize,
      durationMs: asset.duration,
    });
    if (attachmentError) {
      Alert.alert('Attachment unavailable', attachmentError);
      return;
    }
    const mediaKind = asset.type === 'video' ? 'video' : 'photo';
    const uploadStatusId = beginMediaUploadStatus(
      viewOnceMode ? `Securing private ${mediaKind}...` : `Uploading ${mediaKind}...`,
      'Keep this chat open while Betweener prepares your message.',
      viewOnceMode ? 'shield-lock-outline' : 'cloud-upload-outline'
    );
    let queueCandidate: {
      uri: string;
      fileName: string;
      contentType: string;
      mediaType: 'image' | 'video';
      byteSize?: number | null;
    } | null = null;
    try {
      const fallbackName = asset.fileName ?? asset.uri.split('/').pop() ?? `camera-${Date.now()}`;
      const baseContentType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const normalized =
        asset.type === 'image'
          ? await normalizeHeicImage(asset, fallbackName)
          : await prepareChatVideo({
              uri: asset.uri,
              fileName: fallbackName,
              contentType: baseContentType,
              sizeBytes: asset.fileSize,
              durationMs: asset.duration,
              onProgress: (progress) => updateMediaUploadStatus(
                uploadStatusId,
                'Optimizing video…',
                `${Math.max(1, Math.round(progress * 100))}% · Preparing smooth, secure playback`,
                'auto-fix',
              ),
            });
      queueCandidate = {
        uri: normalized.uri,
        fileName: normalized.fileName,
        contentType: normalized.contentType,
        mediaType: asset.type === 'video' ? 'video' : 'image',
        byteSize:
          'sizeBytes' in normalized && typeof normalized.sizeBytes === 'number'
            ? normalized.sizeBytes
            : asset.fileSize,
      };

      if (viewOnceMode) {
        updateMediaUploadStatus(
          uploadStatusId,
          `Securing private ${mediaKind}...`,
          asset.type === 'image'
            ? 'Checking this photo, then encrypting it for one-time viewing.'
            : 'Encrypting and uploading this media for one-time viewing.',
          'shield-lock-outline'
        );
        await sendEncryptedMediaAttachment({
          uri: normalized.uri,
          fileName: normalized.fileName,
          contentType: normalized.contentType,
          kind: asset.type === 'video' ? 'video' : 'image',
        });
      } else {
        updateMediaUploadStatus(uploadStatusId, `Queueing ${mediaKind}...`,
          'Betweener will upload, verify, and send it safely.', 'clock-outline');
        await queueMediaAttachment({
          localUri: queueCandidate.uri,
          fileName: queueCandidate.fileName,
          contentType: queueCandidate.contentType,
          mediaType: queueCandidate.mediaType,
          byteSize: queueCandidate.byteSize ?? null,
          width: asset.width ?? null,
          height: asset.height ?? null,
          durationMs: asset.duration ?? null,
        });
      }
    } catch (error) {
      if (!viewOnceMode && queueCandidate && (isLikelyNetworkError(error) || isRetryableUploadError(error))) {
        await queueMediaAttachment({
          localUri: queueCandidate.uri,
          fileName: queueCandidate.fileName,
          contentType: queueCandidate.contentType,
          mediaType: queueCandidate.mediaType,
        });
      } else {
        Alert.alert('Attachment', getAttachmentUploadErrorMessage(error));
      }
    } finally {
      clearMediaUploadStatus(uploadStatusId);
    }
  }, [
    beginMediaUploadStatus,
    clearMediaUploadStatus,
    closeAttachmentSheet,
    mediaUploadStatus,
    sendEncryptedMediaAttachment,
    queueMediaAttachment,
    updateMediaUploadStatus,
    viewOnceMode,
  ]);

  const handleCameraPress = useCallback(() => {
    if (Platform.OS === 'android') {
      Alert.alert('Camera', 'Choose what you want to capture.', [
        { text: 'Photo', onPress: () => void captureCameraMedia('image') },
        { text: 'Video', onPress: () => void captureCameraMedia('video') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    void captureCameraMedia('mixed');
  }, [captureCameraMedia]);

  const handleLibraryPress = useCallback(async () => {
    if (mediaUploadStatus) {
      Alert.alert('Upload in progress', 'Please wait for the current media upload to finish.');
      return;
    }
    const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libraryStatus.granted) {
      showOpenSettingsPrompt(
        'Photos access',
        'Turn on photo access in Settings so Betweener can share media from your library.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: PICKER_MEDIA_TYPES_ALL,
      quality: 0.85,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      allowsMultipleSelection: !viewOnceMode,
      selectionLimit: viewOnceMode ? 1 : 10,
      orderedSelection: true,
    });
    if (result.canceled) return;
    closeAttachmentSheet();
    const selectedAssets = (result.assets ?? []).filter((selectedAsset) => Boolean(selectedAsset.uri));
    if (!viewOnceMode && selectedAssets.length > 1) {
      const invalidAsset = selectedAssets.find((selectedAsset) => validateChatAttachment({
        kind: selectedAsset.type === 'video' ? 'video' : 'image',
        fileName: selectedAsset.fileName,
        mimeType: selectedAsset.mimeType,
        sizeBytes: selectedAsset.fileSize,
        durationMs: selectedAsset.duration,
      }));
      if (invalidAsset) {
        Alert.alert('Media unavailable', validateChatAttachment({
          kind: invalidAsset.type === 'video' ? 'video' : 'image',
          fileName: invalidAsset.fileName,
          mimeType: invalidAsset.mimeType,
          sizeBytes: invalidAsset.fileSize,
          durationMs: invalidAsset.duration,
        }) ?? 'One of these items could not be prepared.');
        return;
      }
      const uploadStatusId = beginMediaUploadStatus(
        `Preparing ${selectedAssets.length} items...`,
        'Building one ordered, secure media album.',
        'image-multiple-outline',
      );
      try {
        const normalizedAssets = await Promise.all(selectedAssets.map(async (selectedAsset, index) => {
          const isVideo = selectedAsset.type === 'video';
          const fallbackName = selectedAsset.fileName ?? selectedAsset.uri.split('/').pop()
            ?? `${isVideo ? 'video' : 'photo'}-${index + 1}.${isVideo ? 'mp4' : 'jpg'}`;
          const normalized = isVideo
            ? await prepareChatVideo({
                uri: selectedAsset.uri,
                fileName: fallbackName,
                contentType: selectedAsset.mimeType ?? 'video/mp4',
                sizeBytes: selectedAsset.fileSize,
                durationMs: selectedAsset.duration,
              })
            : await normalizeHeicImage(selectedAsset, fallbackName);
          return {
            localUri: normalized.uri,
            fileName: normalized.fileName,
            contentType: normalized.contentType,
            mediaType: isVideo ? 'video' as const : 'image' as const,
            byteSize: 'sizeBytes' in normalized && typeof normalized.sizeBytes === 'number'
              ? normalized.sizeBytes
              : selectedAsset.fileSize ?? null,
            width: selectedAsset.width ?? null,
            height: selectedAsset.height ?? null,
            durationMs: selectedAsset.duration ?? null,
          };
        }));
        updateMediaUploadStatus(uploadStatusId, 'Queueing media album...', 'Everything will appear together in one message.', 'clock-outline');
        const albumCaption = inputText.trim();
        await queueMediaAlbum(normalizedAssets, albumCaption);
        if (albumCaption) setInputText('');
      } catch (error) {
        Alert.alert('Media album', getAttachmentUploadErrorMessage(error));
      } finally {
        clearMediaUploadStatus(uploadStatusId);
      }
      return;
    }
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    const attachmentError = validateChatAttachment({
      kind: asset.type === 'video' ? 'video' : 'image',
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.fileSize,
      durationMs: asset.duration,
    });
    if (attachmentError) {
      Alert.alert('Attachment unavailable', attachmentError);
      return;
    }
    const mediaKind = asset.type === 'video' ? 'video' : 'photo';
    const uploadStatusId = beginMediaUploadStatus(
      viewOnceMode ? `Securing private ${mediaKind}...` : `Uploading ${mediaKind}...`,
      'Keep this chat open while Betweener prepares your message.',
      viewOnceMode ? 'shield-lock-outline' : 'cloud-upload-outline'
    );
    let queueCandidate: {
      uri: string;
      fileName: string;
      contentType: string;
      mediaType: 'image' | 'video';
      byteSize?: number | null;
    } | null = null;
    try {
      const fallbackName = asset.fileName ?? asset.uri.split('/').pop() ?? `library-${Date.now()}`;
      const baseContentType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const normalized =
        asset.type === 'image'
          ? await normalizeHeicImage(asset, fallbackName)
          : await prepareChatVideo({
              uri: asset.uri,
              fileName: fallbackName,
              contentType: baseContentType,
              sizeBytes: asset.fileSize,
              durationMs: asset.duration,
              onProgress: (progress) => updateMediaUploadStatus(
                uploadStatusId,
                'Optimizing video…',
                `${Math.max(1, Math.round(progress * 100))}% · Preparing smooth, secure playback`,
                'auto-fix',
              ),
            });
      queueCandidate = {
        uri: normalized.uri,
        fileName: normalized.fileName,
        contentType: normalized.contentType,
        mediaType: asset.type === 'video' ? 'video' : 'image',
        byteSize:
          'sizeBytes' in normalized && typeof normalized.sizeBytes === 'number'
            ? normalized.sizeBytes
            : asset.fileSize,
      };

      if (viewOnceMode) {
        updateMediaUploadStatus(
          uploadStatusId,
          `Securing private ${mediaKind}...`,
          asset.type === 'image'
            ? 'Checking this photo, then encrypting it for one-time viewing.'
            : 'Encrypting and uploading this media for one-time viewing.',
          'shield-lock-outline'
        );
        await sendEncryptedMediaAttachment({
          uri: normalized.uri,
          fileName: normalized.fileName,
          contentType: normalized.contentType,
          kind: asset.type === 'video' ? 'video' : 'image',
        });
      } else {
        updateMediaUploadStatus(uploadStatusId, `Queueing ${mediaKind}...`,
          'Betweener will upload, verify, and send it safely.', 'clock-outline');
        await queueMediaAttachment({
          localUri: queueCandidate.uri,
          fileName: queueCandidate.fileName,
          contentType: queueCandidate.contentType,
          mediaType: queueCandidate.mediaType,
          byteSize: queueCandidate.byteSize ?? null,
          width: asset.width ?? null,
          height: asset.height ?? null,
          durationMs: asset.duration ?? null,
        });
      }
    } catch (error) {
      if (!viewOnceMode && queueCandidate && (isLikelyNetworkError(error) || isRetryableUploadError(error))) {
        await queueMediaAttachment({
          localUri: queueCandidate.uri,
          fileName: queueCandidate.fileName,
          contentType: queueCandidate.contentType,
          mediaType: queueCandidate.mediaType,
        });
      } else {
        Alert.alert('Attachment', getAttachmentUploadErrorMessage(error));
      }
    } finally {
      clearMediaUploadStatus(uploadStatusId);
    }
  }, [
    beginMediaUploadStatus,
    clearMediaUploadStatus,
    closeAttachmentSheet,
    mediaUploadStatus,
    inputText,
    sendEncryptedMediaAttachment,
    queueMediaAttachment,
    queueMediaAlbum,
    updateMediaUploadStatus,
    viewOnceMode,
  ]);

  const handleDocumentPress = useCallback(async () => {
    if (mediaUploadStatus) {
      Alert.alert('Upload in progress', 'Please wait for the current media upload to finish.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: [...CHAT_DOCUMENT_PICKER_MIME_TYPES],
    });
    if (result.canceled) return;
    closeAttachmentSheet();
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    const attachmentError = validateChatAttachment({
      kind: 'document',
      fileName: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: asset.size,
    });
    if (attachmentError) {
      Alert.alert('Attachment unavailable', attachmentError);
      return;
    }
    const uploadStatusId = beginMediaUploadStatus(
      'Preparing file...',
      asset.name ? `Queueing ${asset.name}` : 'Keep this chat open while Betweener prepares your file.',
      'file-document-outline'
    );
    try {
      const fileName = asset.name ?? asset.uri.split('/').pop() ?? `file-${Date.now()}`;
      const contentType = asset.mimeType ?? 'application/octet-stream';
      updateMediaUploadStatus(
        uploadStatusId,
        'Queueing file...',
        'Betweener will upload and send this file safely.',
        'clock-outline'
      );
      await queueMediaAttachment({
        localUri: asset.uri,
        fileName,
        contentType,
        mediaType: 'document',
        byteSize: asset.size ?? null,
        documentSizeLabel: formatFileSize(asset.size),
        documentTypeLabel: getFileTypeLabel(contentType, fileName),
      });
    } catch (error) {
      Alert.alert('Attachment', getAttachmentUploadErrorMessage(error));
    } finally {
      clearMediaUploadStatus(uploadStatusId);
    }
  }, [
    beginMediaUploadStatus,
    clearMediaUploadStatus,
    closeAttachmentSheet,
    mediaUploadStatus,
    queueMediaAttachment,
    updateMediaUploadStatus,
  ]);

  const handleLocationPress = useCallback(() => {
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    openLocationModal();
  }, [isBlockedByMe, isChatBlocked, openLocationModal]);

  const replyToMessage = useCallback((message: MessageType) => {
    setReplyingTo(message);
    setEditingMessage(null);
    setViewOnceMode(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const startEditMessage = useCallback((message: MessageType) => {
    if (!user?.id) return;
    if (message.senderId !== user.id) return;
    if (message.type !== 'text' || message.deletedForAll) return;
    if (message.id.startsWith('temp-')) return;
    setEditingMessage(message);
    setReplyingTo(null);
    setViewOnceMode(false);
    setInputText(message.text || '');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [user?.id]);

  const cancelEdit = () => {
    setEditingMessage(null);
  };

  const triggerActionHaptic = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    Haptics.impactAsync(style).catch(() => {});
  }, []);

  const renderTypingIndicator = () => {
    if (!isTyping || isChatBlocked) return null;

    return (
        <View style={styles.typingContainer}>
          {userAvatar ? (
            <ExpoImage
              source={{ uri: userAvatar }}
              style={styles.typingAvatar}
              cachePolicy="disk"
              contentFit="cover"
              transition={0}
            />
          ) : (
            <Image source={BLOCKED_AVATAR_SOURCE} style={styles.typingAvatar} />
          )}
        <View style={styles.typingBubble}>
          <Animated.View style={styles.typingDots}>
            {[0, 1, 2].map((index) => (
              <Animated.View
                key={index}
                style={[
                  styles.typingDot,
                  {
                    opacity: typingAnimation.interpolate({
                      inputRange: [0, 0.3, 0.6, 1],
                      outputRange: index === 0 ? [0.3, 1, 0.3, 0.3] :
                                   index === 1 ? [0.3, 0.3, 1, 0.3] :
                                   [0.3, 0.3, 0.3, 1],
                    }),
                  },
                ]}
              />
            ))}
          </Animated.View>
        </View>
      </View>
    );
  };

  const getDistanceToBottom = useCallback(() => {
    return getChronologicalListDistanceToBottom(listMetricsRef.current);
  }, []);

  const ensureInitialScrollToBottom = useCallback(() => {
    if (initialAutoScrollDoneRef.current) return;
    return;
  }, [getDistanceToBottom]);

  const updateJumpToBottomVisibility = useCallback((distanceToBottom: number) => {
    const threshold = keyboardVisibleRef.current ? 240 : 120;
    const shouldShow = distanceToBottom > threshold;
    if (shouldShow !== jumpVisibleRef.current) {
      jumpVisibleRef.current = shouldShow;
      setShowJumpToBottom(shouldShow);
    }
  }, []);

  const handleScroll = useCallback((event: any) => {
    if (!hasAutoScrolledRef.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    listMetricsRef.current = {
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
      offsetY: contentOffset.y,
    };
    if (Date.now() < lockAutoScrollUntilRef.current) {
      shouldAutoScrollRef.current = true;
      wasAtBottomRef.current = true;
      updateJumpToBottomVisibility(0);
      return;
    }
    const distanceToBottom = getChronologicalListDistanceToBottom({
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
      offsetY: contentOffset.y,
    });
    const paddingToBottom = keyboardVisibleRef.current ? 200 : 60;
    shouldAutoScrollRef.current =
      distanceToBottom <= paddingToBottom;
    wasAtBottomRef.current = distanceToBottom <= paddingToBottom;
    updateJumpToBottomVisibility(distanceToBottom);
  }, [updateJumpToBottomVisibility]);

  const handleStartReached = useCallback(() => {
    if (!paginationUserInitiatedRef.current) return;
    if (!hasMore || loadingEarlierRef.current) return;
    paginationUserInitiatedRef.current = false;
    void loadEarlier();
  }, [hasMore, loadEarlier]);

  useEffect(() => {
    if (!threadBootstrapSettled) return;
    if (messages.length === 0) return;
    if (!hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;
      initialAutoScrollDoneRef.current = true;
      shouldAutoScrollRef.current = true;
      wasAtBottomRef.current = true;
      lockAutoScrollUntilRef.current = Date.now() + 600;
      updateJumpToBottomVisibility(0);
      return;
    }
    const paddingToBottom = keyboardVisibleRef.current ? 200 : 60;
    const distanceToBottom = getDistanceToBottom();
    if (
      !shouldAutoScrollRef.current &&
      distanceToBottom > paddingToBottom
    ) {
      return;
    }
    if (!shouldAutoScrollRef.current) return;
    scheduleIdleTask(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length, threadBootstrapSettled, updateJumpToBottomVisibility]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: any) => {
      keyboardVisibleRef.current = true;
      const inset =
        Platform.OS === 'ios' ? event?.endCoordinates?.height ?? 0 : 0;
      setKeyboardInset(inset);
      if (getDistanceToBottom() <= 200) {
        shouldAutoScrollRef.current = true;
        scheduleIdleTask(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        });
      }
    };
    const onHide = () => {
      keyboardVisibleRef.current = false;
      setKeyboardInset(0);
      if (getDistanceToBottom() <= 60) {
        shouldAutoScrollRef.current = true;
        scheduleIdleTask(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        });
      }
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  messagesRef.current = messages;

  useEffect(() => {
    if (!messagesLoaded || seededMessageAnimationsRef.current) return;
    animatedMessageIdsRef.current = new Set(renderedMessages.map((message) => message.id));
    seededMessageAnimationsRef.current = true;
  }, [messagesLoaded, renderedMessages]);

  useEffect(() => {
    if (visibleDatePlanIds.length === 0) {
      setDatePlanStateById({});
      return;
    }
    let cancelled = false;
    const loadDatePlans = async () => {
      const { data, error } = await supabase
        .from('date_plans')
        .select('*')
        .in('id', visibleDatePlanIds);
      if (error) {
        console.log('[chat] load date plans error', error);
        return;
      }
      if (cancelled || !data) return;
      upsertDatePlanRows(data as DatePlanRow[]);
    };
    void loadDatePlans();
    return () => {
      cancelled = true;
    };
  }, [upsertDatePlanRows, visibleDatePlanIds]);

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    const channel = supabase
      .channel(`date_plans:${user.id}:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'date_plans',
        },
        (payload) => {
          const row = (payload.new || payload.old) as DatePlanRow | undefined;
          if (!row) return;
          const participantIds = [row.creator_user_id, row.recipient_user_id];
          if (!participantIds.includes(user.id) || !participantIds.includes(conversationId)) return;
          upsertDatePlanRows([row]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, upsertDatePlanRows, user?.id]);

  useEffect(() => {
    viewOnceStatusRef.current = viewOnceStatus;
  }, [viewOnceStatus]);

  const maybeScrollToEnd = useCallback((animated: boolean) => {
    if (!flatListRef.current) return;
    if (scrollRequestRef.current !== null) {
      cancelAnimationFrame(scrollRequestRef.current);
    }
    scrollRequestRef.current = requestAnimationFrame(() => {
      scrollRequestRef.current = null;
      flatListRef.current?.scrollToEnd({ animated });
    });
    if (jumpVisibleRef.current) {
      jumpVisibleRef.current = false;
      setShowJumpToBottom(false);
    }
  }, []);

  const keyExtractor = useCallback((item: MessageType) => item.id, []);

  const handleMessagesContentSizeChange = useCallback((_width: number, height: number) => {
    listMetricsRef.current.contentHeight = height;
    if (!threadBootstrapSettled) return;
    if (renderedMessages.length === 0) return;
    if (!initialAutoScrollDoneRef.current) return;
    updateJumpToBottomVisibility(getDistanceToBottom());
  }, [getDistanceToBottom, renderedMessages.length, threadBootstrapSettled, updateJumpToBottomVisibility]);

  const handleMessagesLayout = useCallback((event: any) => {
    const height = event.nativeEvent.layout.height;
    listMetricsRef.current.layoutHeight = height;
    if (!threadBootstrapSettled) return;
    if (renderedMessages.length === 0) return;
    if (!initialAutoScrollDoneRef.current) return;
    const distanceToBottom = getDistanceToBottom();
    const paddingToBottom = keyboardVisibleRef.current ? 200 : 60;
    wasAtBottomRef.current = distanceToBottom <= paddingToBottom;
    updateJumpToBottomVisibility(distanceToBottom);
    if (
      shouldAutoScrollRef.current &&
      !listInteractionRef.current.dragging &&
      !listInteractionRef.current.momentum
    ) {
      maybeScrollToEnd(false);
    }
  }, [ensureInitialScrollToBottom, getDistanceToBottom, maybeScrollToEnd, renderedMessages.length, threadBootstrapSettled, updateJumpToBottomVisibility]);

  const clearFocus = useCallback(() => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    if (jumpSettleRef.current) {
      clearTimeout(jumpSettleRef.current);
      jumpSettleRef.current = null;
    }
    setFocusedMessageId(null);
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    listInteractionRef.current.dragging = true;
    paginationUserInitiatedRef.current = true;
    setShowReactions(null);
    clearFocus();
    initialAutoScrollDoneRef.current = true;
    initialAutoScrollAttemptsRef.current = 0;
    lockAutoScrollUntilRef.current = 0;
  }, [clearFocus]);

  const onScrollEndDrag = useCallback(() => {
    listInteractionRef.current.dragging = false;
  }, []);

  const onMomentumScrollBegin = useCallback(() => {
    listInteractionRef.current.momentum = true;
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    listInteractionRef.current.momentum = false;
  }, []);

  const createFreshChatMediaUrl = useCallback(async (storagePath: string) => {
    const result = await resolveChatMediaPath(storagePath, {
      force: true,
      bypassBackoff: true,
    });
    if (result.status !== 'ready') {
      console.log('[chat][media] refresh unavailable', { storagePath, failure: result.failure });
      return null;
    }
    return result.uri;
  }, [resolveChatMediaPath]);

  const refreshChatMediaMessage = useCallback((message: MessageType) => {
    reportChatMediaLoadError(message.storagePath);
  }, [reportChatMediaLoadError]);

  const persistRenderedChatMedia = useCallback((
    message: MessageType,
    renderedUri: string,
    nativeCacheUri?: string | null,
  ) => {
    const storagePath = message.storagePath?.trim();
    if (!storagePath) return;
    if (message.type !== 'image') return;
    const persistRequest = nativeCacheUri
      ? persistOfflineImageCopy(storagePath, nativeCacheUri, renderedUri)
      : renderedUri.startsWith('http')
        ? cacheOfflineImage(storagePath, renderedUri)
        : Promise.resolve(null);
    void persistRequest.then((localUri) => {
      if (!localUri) return;
      setCachedImageUris((current) => ({
        ...current,
        [storagePath]: localUri,
        [renderedUri]: localUri,
      }));
    });
  }, []);

  const retryChatMediaMessage = useCallback((message: MessageType) => {
    if (!networkReady) return;
    void retryChatMediaPath(message.storagePath);
  }, [networkReady, retryChatMediaPath]);

  const openVideoViewer = useCallback(async (
    message: MessageType,
    renderedUrl: string,
    albumIndex = 0,
  ) => {
    const selection = selectChatImageGalleryItem(
      message,
      albumIndex,
      chatMediaUrisByPath,
      renderedUrl,
    );
    const mediaItem = selection.mediaItem;
    const selectedMessage: MessageType = {
      ...selection.message,
      type: 'video',
      storagePath: mediaItem?.storagePath || message.storagePath || null,
      videoUrl: mediaItem?.signedUrl ?? selection.renderedUri ?? renderedUrl,
      offlineVideoUri: mediaItem?.localUri,
      previewStoragePath: mediaItem?.previewStoragePath ?? message.previewStoragePath,
    };
    const selectedRenderedUrl = selection.renderedUri ?? renderedUrl;
    imageViewerSourceRef.current = {
      message,
      renderedUrl: selectedRenderedUrl,
      albumIndex: selection.index,
    };
    setImageViewerAlbumIndex(selection.index);
    setImageViewerAlbumCount(selection.count);
    setImageViewerVisible(false);
    const localUri = selectedMessage.offlineVideoUri
      ?? (selectedMessage.storagePath ? await getOfflineVideoUri(selectedMessage.storagePath) : null)
      ?? (selectedRenderedUrl ? cachedVideoUris[selectedRenderedUrl] : null);
    if (localUri) {
      setVideoViewerUrl(localUri);
      return;
    }

    let playableUrl = selectedRenderedUrl || selectedMessage.videoUrl || '';
    if (networkReady && selectedMessage.storagePath) {
      const refreshedUrl = await createFreshChatMediaUrl(selectedMessage.storagePath);
      if (refreshedUrl) {
        playableUrl = refreshedUrl;
        setMessages((current) => current.map((candidate) =>
          candidate.id === message.id ? { ...candidate, videoUrl: refreshedUrl } : candidate,
        ));
        void cacheOfflineVideo(selectedMessage.storagePath, refreshedUrl).then((cachedUri) => {
          if (!cachedUri) return;
          setCachedVideoUris((current) => ({
            ...current,
            [selectedMessage.storagePath as string]: cachedUri,
            [refreshedUrl]: cachedUri,
          }));
        });
      }
    }
    if (!playableUrl) {
      Alert.alert('Video unavailable', networkReady
        ? 'This video could not be opened. Please try again.'
        : 'Reconnect to load this video for the first time.');
      return;
    }
    const resolved = cachedVideoUris[playableUrl] ?? await resolveQueuedVideoUri(playableUrl, networkReady);
    setVideoViewerUrl(resolved || playableUrl);
  }, [cachedVideoUris, chatMediaUrisByPath, createFreshChatMediaUrl, networkReady]);

  const openImageViewer = useCallback(async (
    message: MessageType,
    renderedUrl: string,
    albumIndex = 0,
  ) => {
    const selection = selectChatImageGalleryItem(
      message,
      albumIndex,
      chatMediaUrisByPath,
      renderedUrl,
    );
    const selectedMessage = selection.message;
    const selectedRenderedUrl = selection.renderedUri ?? renderedUrl;
    if (!selectedRenderedUrl && !selectedMessage.storagePath) return;
    const requestId = imageViewerRequestRef.current + 1;
    imageViewerRequestRef.current = requestId;
    imageViewerSourceRef.current = {
      message,
      renderedUrl: selectedRenderedUrl,
      albumIndex: selection.index,
    };
    setImageViewerAlbumIndex(selection.index);
    setImageViewerAlbumCount(selection.count);
    setImageViewerError(false);
    setImageViewerLoading(true);
    setImageViewerVisible(true);
    // Open immediately. TestFlight must never look unresponsive while a private URL is refreshed.
    setImageViewerUrl(selectedRenderedUrl || null);

    const resolution = await resolveChatImageViewerUri(selectedMessage, selectedRenderedUrl, {
      online: networkReady,
      findCachedUri: async (sourceKey) => cachedImageUris[sourceKey] ?? await getOfflineImageUri(sourceKey),
      localUriExists: async (uri) => {
        if (!uri.startsWith('file://') && !uri.startsWith('content://')) return true;
        try {
          return (await FileSystem.getInfoAsync(uri)).exists;
        } catch {
          return false;
        }
      },
      createSignedUrl: async (storagePath) => {
        const result = await resolveChatMediaPath(storagePath, {
          force: true,
          bypassBackoff: true,
        });
        return result.status === 'ready' ? result.uri : null;
      },
      cacheRemoteImage: cacheOfflineImage,
    });

    if (imageViewerRequestRef.current !== requestId) return;
    if (resolution.cachedUri) {
      setCachedImageUris((current) => {
        const next = { ...current };
        if (selectedRenderedUrl) next[selectedRenderedUrl] = resolution.cachedUri!;
        if (resolution.cacheKey) next[resolution.cacheKey] = resolution.cachedUri!;
        if (resolution.refreshedRemoteUri) next[resolution.refreshedRemoteUri] = resolution.cachedUri!;
        return next;
      });
    }
    if (!resolution.uri) {
      setImageViewerLoading(false);
      setImageViewerError(true);
      return;
    }
    if (resolution.uri !== selectedRenderedUrl) {
      setImageViewerLoading(true);
      setImageViewerError(false);
    }
    setImageViewerUrl(resolution.uri);
  }, [cachedImageUris, chatMediaUrisByPath, networkReady]);

  const retryImageViewer = useCallback(() => {
    const source = imageViewerSourceRef.current;
    if (!source) return;
    void openImageViewer(source.message, source.renderedUrl, source.albumIndex);
  }, [openImageViewer]);

  const moveMediaViewer = useCallback((direction: -1 | 1) => {
    const source = imageViewerSourceRef.current;
    if (!source) return;
    const mediaItems = getMessageMediaItems(source.message);
    const mediaCount = mediaItems.length;
    if (mediaCount <= 1) return;
    const nextIndex = source.albumIndex + direction;
    if (nextIndex < 0 || nextIndex >= mediaCount) return;
    const nextSelection = selectChatImageGalleryItem(
      source.message,
      nextIndex,
      chatMediaUrisByPath,
    );
    if (mediaItems[nextIndex]?.type === 'video') {
      void openVideoViewer(source.message, nextSelection.renderedUri ?? '', nextIndex);
      return;
    }
    setVideoViewerUrl(null);
    void openImageViewer(source.message, nextSelection.renderedUri ?? '', nextIndex);
  }, [chatMediaUrisByPath, openImageViewer, openVideoViewer]);

  const retryCurrentAlbumViewerItem = useCallback(() => {
    const source = imageViewerSourceRef.current;
    if (!source) return;
    const mediaItem = getMessageMediaItems(source.message)[source.albumIndex];
    if (mediaItem?.type === 'video') {
      void openVideoViewer(source.message, source.renderedUrl, source.albumIndex);
      return;
    }
    void openImageViewer(source.message, source.renderedUrl, source.albumIndex);
  }, [openImageViewer, openVideoViewer]);

  const handleOpenDocument = useCallback(async (message: MessageType) => {
    const doc = message.document;
    if (!doc) return;
    const documentCacheKey = message.storagePath
      ? `document:${message.storagePath}`
      : `document:${doc.url}`;
    let remoteUrl = doc.url?.startsWith('http') ? doc.url : '';
    let url = await findOfflineAttachment(documentCacheKey) ?? doc.url;
    if (!url?.startsWith('file://') && networkReady) {
      remoteUrl = message.storagePath
        ? await createFreshChatMediaUrl(message.storagePath)
        : url;
      if (remoteUrl) {
        url =
          await cacheOfflineAttachment({
            sourceKey: documentCacheKey,
            remoteUri: remoteUrl,
            category: 'document',
            fileName: doc.name,
          }) ?? remoteUrl;
      }
    }
    if (!url) {
      Alert.alert('Document unavailable', networkReady
        ? 'This document could not be opened. Please try again.'
        : 'Reconnect to open this document for the first time.');
      return;
    }
    const typeLabel = doc.typeLabel?.toLowerCase() ?? '';
    const ext = doc.name.split('?')[0].split('.').pop()?.toLowerCase()
      ?? url.split('?')[0].split('.').pop()?.toLowerCase()
      ?? '';
    if (typeLabel === 'image' || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(ext)) {
      setImageViewerUrl(url);
      setImageViewerVisible(true);
      return;
    }
    if (typeLabel === 'video' || ['mp4', 'mov', 'm4v', 'webm'].includes(ext)) {
      void openVideoViewer(message, url);
      return;
    }
    const isPdf = typeLabel === 'pdf' || ext === 'pdf';
    const isText = typeLabel === 'txt' || ext === 'txt' || ext === 'text';
    if (isPdf && Platform.OS === 'android') {
      try {
        if (url.startsWith('file://')) {
          const contentUri = await FileSystem.getContentUriAsync(url);
          const IntentLauncher = await import('expo-intent-launcher');
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            type: 'application/pdf',
          });
          return;
        }
        await WebBrowser.openBrowserAsync(url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          controlsColor: theme.tint,
        });
        return;
      } catch {
        if (networkReady) {
          const fallbackUrl = message.storagePath
            ? await createFreshChatMediaUrl(message.storagePath)
            : remoteUrl;
          if (fallbackUrl) {
            await WebBrowser.openBrowserAsync(fallbackUrl, {
              presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
              controlsColor: theme.tint,
            });
            return;
          }
        }
        Alert.alert(
          'PDF viewer unavailable',
          networkReady
            ? 'No compatible PDF viewer was found on this device.'
            : 'Reconnect to open this PDF, or install a PDF viewer for offline access.',
        );
        return;
      }
    }
    if (isPdf || isText) {
      try {
        const prepared = await prepareChatDocumentPreview({
          sourceUri: url,
          fileName: doc.name,
        });
        const nextViewer = { ...prepared, title: doc.name };
        const previousViewer = documentViewerRef.current;
        documentViewerRef.current = nextViewer;
        setDocumentViewer(nextViewer);
        if (previousViewer) void previousViewer.cleanup().catch(() => {});
      } catch {
        Alert.alert(
          'Document unavailable',
          'The downloaded copy could not be prepared for viewing. Please try again.',
        );
      }
      return;
    }

    // Office formats need the platform document renderer. Never hand it a
    // sandboxed file:// URL: iOS cannot grant Safari access to the app cache.
    if (!networkReady) {
      Alert.alert(
        'Reconnect to open this document',
        'This file format needs a secure online preview. PDFs remain available offline.',
      );
      return;
    }
    if (message.storagePath) {
      remoteUrl = await createFreshChatMediaUrl(message.storagePath);
    }
    if (!remoteUrl) {
      Alert.alert('Document unavailable', 'A secure preview link could not be created. Please try again.');
      return;
    }
    await WebBrowser.openBrowserAsync(remoteUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      controlsColor: theme.tint,
    });
  }, [createFreshChatMediaUrl, networkReady, openVideoViewer, theme.tint]);

  const onViewableItemsChanged = useCallback(
    ({
      viewableItems,
      changed,
    }: {
      viewableItems: { item?: MessageType | null }[];
      changed?: { item?: MessageType | null; isViewable: boolean }[];
    }) => {
      if (!isScreenFocusedRef.current || AppState.currentState !== 'active') return;
      changed?.forEach(({ item, isViewable }) => {
        if (!item?.id) return;
        if (isViewable && shouldScheduleMessageRead({ item, currentUserId: user?.id || '' })) {
          viewableReadCandidateIdsRef.current.add(item.id);
          return;
        }
        viewableReadCandidateIdsRef.current.delete(item.id);
        clearPendingReadTimer(item.id);
      });
      viewableItems.forEach(({ item }) => {
        if (!item?.id) return;
        if (shouldScheduleMessageRead({ item, currentUserId: user?.id || '' })) {
          viewableReadCandidateIdsRef.current.add(item.id);
          scheduleMarkAsRead(item.id);
        }
      });
    },
    [activePeerMessageUserId, clearPendingReadTimer, scheduleMarkAsRead, user?.id]
  );

  const resetImageScale = useCallback(() => {
    imageScaleRef.current = 1;
    imageScaleBase.setValue(1);
    imagePinchScale.setValue(1);
  }, [imagePinchScale, imageScaleBase]);

  const onImagePinchEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { scale: imagePinchScale } }], {
        useNativeDriver: true,
      }),
    [imagePinchScale]
  );

  const onImagePinchStateChange = useCallback(
    (event: any) => {
      if (event.nativeEvent.oldState === State.ACTIVE) {
        const nextScale = Math.max(1, Math.min(imageScaleRef.current * event.nativeEvent.scale, 3));
        imageScaleRef.current = nextScale;
        imageScaleBase.setValue(nextScale);
        imagePinchScale.setValue(1);
      }
    },
    [imagePinchScale, imageScaleBase]
  );

  const closeImageViewer = useCallback(() => {
    imageViewerRequestRef.current += 1;
    imageViewerSourceRef.current = null;
    setImageViewerVisible(false);
    setImageViewerLoading(false);
    setImageViewerError(false);
    setImageViewerAlbumIndex(0);
    setImageViewerAlbumCount(1);
    resetImageScale();
    setImageViewerUrl(null);
  }, [resetImageScale]);

  const closeVideoViewer = useCallback(() => {
    imageViewerSourceRef.current = null;
    setImageViewerAlbumIndex(0);
    setImageViewerAlbumCount(1);
    setVideoViewerUrl(null);
  }, []);

  const closeDocumentViewer = useCallback(() => {
    const current = documentViewerRef.current;
    documentViewerRef.current = null;
    setDocumentViewer(null);
    if (current) void current.cleanup().catch(() => {});
  }, []);

  useEffect(() => () => {
    const current = documentViewerRef.current;
    documentViewerRef.current = null;
    if (current) void current.cleanup().catch(() => {});
  }, []);

  useEffect(() => {
    if (imageViewerUrl) {
      resetImageScale();
    }
  }, [imageViewerUrl, resetImageScale]);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      stopRecordingTimer();
      recordingPulseRef.current?.stop();
      if (recordingRef.current) {
        recordingRef.current.stop().catch(() => {});
        recordingRef.current = null;
      }
      if (voiceSoundRef.current) {
        voiceSoundRef.current.pause();
        voiceSoundRef.current.remove();
        voiceSoundRef.current = null;
      }
      if (voicePreviewSoundRef.current) {
        voicePreviewSoundRef.current.pause();
        voicePreviewSoundRef.current.remove();
        voicePreviewSoundRef.current = null;
      }
    };
  }, [stopRecordingTimer]);

  const renderLoadEarlier = useCallback(() => {
    if (renderedMessages.length === 0) return null;
    if (!hasMore) return <View style={styles.loadEarlierSpacer} />;
    return (
      <View style={styles.loadEarlierContainer}>
        <TouchableOpacity
          style={styles.loadEarlierButton}
          onPress={loadEarlier}
          disabled={loadingEarlier}
        >
          <Text style={styles.loadEarlierText}>
            {loadingEarlier ? 'Loading...' : 'Load earlier'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [hasMore, loadEarlier, loadingEarlier, renderedMessages.length]);

  const {
    reportModalVisible,
    reportReasonId,
    setReportReasonId,
    reportDetails,
    setReportDetails,
    reportShouldBlock,
    setReportShouldBlock,
    reportEvidenceMessage,
    reportSubmitting,
    momentViewerVisible,
    momentViewerUserId,
    chatSearchVisible,
    mediaHubVisible,
    mediaTab,
    setMediaTab,
    handleGoBack,
    handleHeaderPress,
    handleCloseMomentViewer,
    closeReportModal,
    submitReport,
    confirmUnblockUser,
    closeChatSearch,
    closeMediaHub,
    handleToggleMute,
    handleReportMessage,
    handleOpenHeaderMenu,
    handleHeaderLongPress,
  } = useChatThreadScreenUi({
    userId: user?.id,
    routeId,
    conversationId,
    activePeerMessageUserId,
    peerProfileId,
    resolvedPeerProfileId: peerProfile?.id ?? null,
    peerHasLeftBetweener,
    peerHasMoment,
    isChatBlocked,
    isBlockedByMe,
    canPlanDate,
    datePlanUnlockReason,
    headerStatusLabel,
    conversationSignal,
    userName,
    chatPrefsStorageKey: CHAT_PREFS_STORAGE_KEY,
    headerHintStorageKey: HEADER_HINT_STORAGE_KEY,
    blockedByMeValue: BLOCKED_BY_ME,
    reportReasons: REPORT_REASONS,
    showHeaderHint,
    setShowHeaderHint,
    headerHintOpacity,
    headerHintDismissedRef,
    chatPrefsStateRef,
    applyChatPrefsState,
    triggerChatActionToast,
    openDatePlannerUnlocked,
    handleOpenDatePlanner,
    fetchMessages,
    fetchHiddenMessages,
    updateHiddenMessageIds,
    setMessages,
    setHasMore,
    setOldestTimestamp,
    setBlockStatus,
    setChatSearchQuery,
  });

  const openSearchResult = useCallback((result: MessageType) => {
    const alreadyLoaded = messagesRef.current.some((message) => message.id === result.id);
    if (!alreadyLoaded) {
      setMessages((current) =>
        linkReplies(
          [...current, result].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime()),
        ),
      );
    }
    closeChatSearch();
    setTimeout(() => jumpToMessage(result.id), alreadyLoaded ? 50 : 180);
  }, [closeChatSearch, jumpToMessage, linkReplies]);

  const reportEvidencePreview = useMemo(
    () => getReportEvidencePreview(reportEvidenceMessage),
    [reportEvidenceMessage]
  );

  const hideMessageForMe = useCallback(async (message: MessageType) => {
    if (!user?.id || !activePeerMessageUserId) return;
    closeMessageActions();
    setShowReactions(null);

    if (message.id.startsWith('temp-')) {
      setMessages((prev) => prev.filter((msg) => msg.id !== message.id));
      return;
    }

    const nextSet = new Set(hiddenMessageIdsRef.current);
    nextSet.add(message.id);
    updateHiddenMessageIds(Array.from(nextSet));
    setMessages((prev) => prev.filter((msg) => msg.id !== message.id));

    const { error } = await ChatThreadActionsService.hideMessageForUser({
      messageId: message.id,
      currentUserId: user.id,
      peerUserId: activePeerMessageUserId,
    });

    if (error) {
      console.log('[chat] hide message error', error);
      Alert.alert('Hide message', 'Unable to hide this message right now.');
      await fetchHiddenMessages();
      await refreshThread();
      return;
    }

    void ChatRepository.deleteMessages(user.id, activePeerMessageUserId, [message.id]).catch((deleteError) =>
      console.log('[chat] delete hidden local message error', deleteError),
    );
  }, [activePeerMessageUserId, closeMessageActions, fetchHiddenMessages, refreshThread, updateHiddenMessageIds, user?.id]);

  const deleteMessageForEveryone = useCallback(async (message: MessageType) => {
    if (!user?.id) return;
    if (message.deletedForAll || message.senderId !== user.id) return;
    closeMessageActions();
    setShowReactions(null);

    if (message.id.startsWith('temp-')) {
      setMessages((prev) => prev.filter((msg) => msg.id !== message.id));
      return;
    }

    const deletedAt = new Date();
    const deletedMessage: MessageType = {
      ...message,
      type: 'text',
      text: 'Message deleted',
      deletedForAll: true,
      deletedAt,
      deletedBy: user.id,
      imageUrl: undefined,
      videoUrl: undefined,
      document: undefined,
      location: undefined,
      voiceMessage: undefined,
      reactions: [],
    };
    setMessages((prev) =>
      applyDeleteMessageForEveryone({
        items: prev,
        messageId: message.id,
        deletedAt,
        deletedBy: user.id,
      })
    );
    if (activePeerMessageUserId) {
      void ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
        chatMessageToLocalRow(user.id, activePeerMessageUserId, deletedMessage),
      ]).catch((localError) => console.log('[chat] local delete tombstone persist error', localError));
    }

    const { error } = await ChatThreadActionsService.deleteMessageForEveryone({
      messageId: message.id,
      currentUserId: user.id,
      deletedAtIso: deletedAt.toISOString(),
    });

    if (error) {
      console.log('[chat] delete message error', error);
      Alert.alert('Delete message', 'Unable to delete this message for everyone.');
      await refreshThread();
      return;
    }
    if (message.storagePath) {
      void removeOfflineImage(message.storagePath);
      void removeOfflineVideo(message.storagePath);
    }
  }, [closeMessageActions, conversationId, refreshThread, user?.id]);

  const pinMessage = useCallback(async (message: MessageType) => {
    if (!user?.id || !conversationId) return;
    if (message.id.startsWith('temp-')) return;
    updatePinnedMessageIds(addPinnedMessageId(Array.from(pinnedMessageIdsRef.current), message.id));
    const { error } = await ChatThreadActionsService.pinMessageForUser({
      messageId: message.id,
      currentUserId: user.id,
      peerUserId: conversationId,
    });
    if (error) {
      console.log('[chat] pin message error', error);
      Alert.alert('Pin message', 'Unable to pin this message right now.');
      await fetchPinnedMessages();
    }
  }, [conversationId, fetchPinnedMessages, updatePinnedMessageIds, user?.id]);

  const unpinMessage = useCallback(async (message: MessageType) => {
    if (!user?.id || !conversationId) return;
    if (message.id.startsWith('temp-')) return;
    updatePinnedMessageIds(removePinnedMessageId(Array.from(pinnedMessageIdsRef.current), message.id));
    const { error } = await ChatThreadActionsService.unpinMessageForUser({
      messageId: message.id,
      currentUserId: user.id,
    });
    if (error) {
      console.log('[chat] unpin message error', error);
      Alert.alert('Unpin message', 'Unable to unpin this message right now.');
      await fetchPinnedMessages();
    }
  }, [conversationId, fetchPinnedMessages, updatePinnedMessageIds, user?.id]);

  const handleToggleMessagePin = useCallback(
    (message: MessageType, isPinned: boolean) => {
      if (isPinned) {
        void unpinMessage(message);
      } else {
        void pinMessage(message);
      }
    },
    [pinMessage, unpinMessage]
  );

  const handlePinnedUnpin = useCallback(() => {
    if (!primaryPinnedMessage) return;
    void unpinMessage(primaryPinnedMessage);
    setPinnedBannerExpanded(false);
  }, [primaryPinnedMessage, setPinnedBannerExpanded, unpinMessage]);

  useEffect(() => {
    if (!reactionSheetVisible || !reactionSheetMessage) return;
    const userIds = Array.from(
      new Set(reactionSheetMessage.reactions.map((reaction) => reaction.userId))
    ).filter(Boolean);
    if (userIds.length === 0) return;
    const missing = userIds.filter((id) => !reactionProfiles[id]);
    if (missing.length === 0) return;
    let isMounted = true;
    setReactionProfilesLoading(true);
    supabase
      .from('profiles')
      .select('user_id,full_name,avatar_url,account_state,deleted_at')
      .in('user_id', missing)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.log('[chat] reaction profiles error', error);
          setReactionProfilesLoading(false);
          return;
        }
        setReactionProfiles((prev) => {
          const next = { ...prev };
          (data || []).forEach((row: any) => {
            next[row.user_id] = {
              name: getUserFacingDisplayName(row, 'Unknown'),
              avatar: row.avatar_url || null,
            };
          });
          return next;
        });
        setReactionProfilesLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [reactionProfiles, reactionSheetMessage, reactionSheetVisible]);

  const handleCopyMessage = useCallback(async (message: MessageType) => {
    if (message.isViewOnce) {
      Alert.alert('Copy', 'View once messages cannot be copied.');
      return;
    }
    let textToCopy = '';
    if (message.type === 'text') {
      textToCopy = message.text || '';
    } else if (message.type === 'image') {
      textToCopy = message.imageUrl || '';
    } else if (message.type === 'video') {
      textToCopy = message.videoUrl || '';
    } else if (message.type === 'document') {
      textToCopy = message.document?.url || '';
    } else if (message.type === 'location') {
      textToCopy = message.location?.mapLink || `${message.location?.lat},${message.location?.lng}`;
    }
    if (!textToCopy) {
      Alert.alert('Copy', 'Nothing to copy from this message.');
      return;
    }
    try {
      await Clipboard.setStringAsync(textToCopy);
      Haptics.selectionAsync().catch(() => {});
      Alert.alert('Copied', 'Message copied to clipboard.');
    } catch (error) {
      console.log('[chat] copy message error', error);
      Alert.alert('Copy', 'Unable to copy this message right now.');
    }
  }, []);

  const handleDeleteAction = useCallback((message: MessageType) => {
    if (message.senderId === user?.id && !message.deletedForAll) {
      Alert.alert(
        'Delete message?',
        'Choose how you want to delete this message.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete for me', style: 'destructive', onPress: () => hideMessageForMe(message) },
          { text: 'Delete for everyone', style: 'destructive', onPress: () => deleteMessageForEveryone(message) },
        ]
      );
      return;
    }
    void hideMessageForMe(message);
  }, [closeMessageActions, deleteMessageForEveryone, hideMessageForMe, user?.id]);

  const renderMessage = useCallback(
    ({ item, index }: { item: MessageType; index: number }) => {
      const meta = messageRenderMetaById.get(item.id);
      const isSystemMessage = item.type === 'system' || item.isSystem;
      const isMyMessage = meta?.isMyMessage ?? (!isSystemMessage && item.senderId === (user?.id || ''));
      const prevMessage = messagesRef.current[index - 1];
      const isGroupedWithPrev = meta?.isGroupedWithPrev ?? false;
      const isGroupedWithNext = meta?.isGroupedWithNext ?? false;
      const showAvatar = meta?.showAvatar ?? false;
      const showAvatarSpacer = meta?.showAvatarSpacer ?? false;
      const shouldAnimateEntry =
        seededMessageAnimationsRef.current &&
        !animatedMessageIdsRef.current.has(item.id);
      if (shouldAnimateEntry) {
        animatedMessageIdsRef.current.add(item.id);
      }
      const isPlaying = playingVoiceId === item.id;
      const isReactionOpen = showReactions === item.id;
      const isFocused = focusedMessageId === item.id;
      const isActionPinned = meta?.isActionPinned ?? false;
      const timeLabel = meta?.timeLabel ?? formatTime(item.timestamp);
      const showDateSeparator =
        meta?.showDateSeparator ??
        (!prevMessage || !isSameDay(prevMessage.timestamp, item.timestamp));
      const imageSize = meta?.imageSize;
      const cachedImageUrl = meta?.cachedImageUrl;
      const cachedVideoUrl = meta?.cachedVideoUrl;
      const mediaUrisByPath = meta?.mediaUrisByPath;
      const mediaFailure = meta?.mediaFailure;
      const viewOnceViewedByMe = meta?.viewOnceViewedByMe ?? false;
      const viewOnceViewedByPeer = meta?.viewOnceViewedByPeer ?? false;
      const rowHighlightQuery =
        item.type === 'text' && matchMessageIdSet.has(item.id) ? trimmedChatSearchQuery : undefined;
      const rowHighlightPress = rowHighlightQuery ? jumpToNextMatch : undefined;
      const rowDatePlanActionId = item.type === 'date_plan' ? datePlanActionId : null;
      const rowDatePlanCalendarActionId = item.type === 'date_plan' ? datePlanCalendarActionId : null;

      return (
        <MessageRow
          showDateSeparator={showDateSeparator}
          dateLabel={formatDayLabel(item.timestamp)}
          styles={styles}
        >
          <MessageRowItem
            item={item}
            isMyMessage={isMyMessage}
            showAvatar={showAvatar}
            showAvatarSpacer={showAvatarSpacer}
            isGroupedWithPrev={isGroupedWithPrev}
            isGroupedWithNext={isGroupedWithNext}
            shouldAnimateEntry={shouldAnimateEntry}
            isPlaying={isPlaying}
            isReactionOpen={isReactionOpen}
            isFocused={isFocused}
            focusToken={isFocused ? focusTick : 0}
            timeLabel={timeLabel}
            userAvatar={userAvatar}
            currentUserId={user?.id || ''}
            peerName={userName}
            imageSize={imageSize}
            cachedImageUrl={cachedImageUrl}
            cachedVideoUrl={cachedVideoUrl}
            mediaUrisByPath={mediaUrisByPath}
            mediaFailure={mediaFailure}
            theme={theme}
            isDark={isDark}
            styles={styles}
            onLongPress={handleLongPress}
            onRetryFailedMessage={retryFailedMessageById}
            onToggleVoice={toggleVoicePlayback}
            onFocus={focusMessage}
            onReply={replyToMessage}
            onReplyJump={jumpToMessage}
            onEditMessage={startEditMessage}
            onAddReaction={addReaction}
            onCloseReactions={() => setShowReactions(null)}
            onCopyMessage={handleCopyMessage}
            onTogglePin={handleToggleMessagePin}
            onDeleteMessage={handleDeleteAction}
            isActionPinned={isActionPinned}
            onOpenReactionSheet={openReactionSheet}
            onOpenEditHistory={openEditHistory}
            onViewImage={(message, url, albumIndex) => {
              void openImageViewer(message, url, albumIndex);
            }}
            onViewVideo={(message, url, albumIndex) => {
              void openVideoViewer(message, url, albumIndex);
            }}
            onManageAlbumItem={manageFailedAlbumItem}
            onOpenDocument={handleOpenDocument}
            onRefreshMedia={refreshChatMediaMessage}
            onMediaLoadSuccess={persistRenderedChatMedia}
            onRetryMedia={retryChatMediaMessage}
            onOpenLocation={openLocationViewer}
            onStopLiveShare={stopLiveSharing}
            onOpenViewOnce={openViewOnceMessage}
            onAcceptDatePlan={handleAcceptDatePlan}
            onSuggestAnotherTime={handleSuggestAnotherTime}
            onSuggestAnotherPlace={handleSuggestAnotherPlace}
            onSuggestBoth={handleSuggestBoth}
            onRescheduleDatePlan={openRescheduleDatePlanner}
            onCancelDatePlan={handleCancelDatePlan}
            onRequestDatePlanConcierge={handleRequestDatePlanConcierge}
            onAddDatePlanToCalendar={handleAddDatePlanToCalendar}
            datePlanActionId={rowDatePlanActionId}
            datePlanCalendarActionId={rowDatePlanCalendarActionId}
            viewOnceViewedByMe={viewOnceViewedByMe}
            viewOnceViewedByPeer={viewOnceViewedByPeer}
            highlightQuery={rowHighlightQuery}
            onHighlightPress={rowHighlightPress}
          />
        </MessageRow>
      );
    },
    [
      focusedMessageId,
      focusTick,
      formatTime,
      datePlanActionId,
      datePlanCalendarActionId,
      isChatBlocked,
      isSameDay,
      playingVoiceId,
      showReactions,
      messageRenderMetaById,
      user?.id,
      userAvatar,
      userName,
      theme,
      isDark,
      handleLongPress,
      toggleVoicePlayback,
      replyToMessage,
      startEditMessage,
      addReaction,
      formatDayLabel,
      chatSearchQuery,
      handleAcceptDatePlan,
      handleCancelDatePlan,
      handleAddDatePlanToCalendar,
      handleOpenDocument,
      refreshChatMediaMessage,
      retryChatMediaMessage,
      manageFailedAlbumItem,
      handleSuggestAnotherTime,
      handleSuggestAnotherPlace,
      handleSuggestBoth,
      openRescheduleDatePlanner,
      handleRequestDatePlanConcierge,
      openLocationViewer,
      stopLiveSharing,
      openViewOnceMessage,
      handleCopyMessage,
      handleToggleMessagePin,
      handleDeleteAction,
      openReactionSheet,
      openEditHistory,
      jumpToMessage,
      jumpToNextMatch,
      matchMessageIdSet,
      focusMessage,
      trimmedChatSearchQuery,
      retryFailedMessageById,
    ]
  );

  const renderHighlightedText = (text: string, query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      return <Text style={styles.searchResultText} numberOfLines={2}>{text}</Text>;
    }
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'ig');
    const parts = text.split(regex);
    const matches = text.match(regex);
    if (!matches) {
      return <Text style={styles.searchResultText} numberOfLines={2}>{text}</Text>;
    }
    const nodes = parts.flatMap((part, index) => {
      const match = matches[index];
      if (match === undefined) return [part];
      return [
        part,
        <Text key={`${match}-${index}`} style={styles.searchHighlight}>
          {match}
        </Text>,
      ];
    });
    return (
      <Text style={styles.searchResultText} numberOfLines={2}>
        {nodes}
      </Text>
    );
  };

  const handleOpenMediaItem = useCallback(
    (item: { type: 'image' | 'video'; url?: string | null; message: MessageType }) => {
      closeMediaHub();
      if (item.type === 'image') {
        if (!item.url) return;
        void openImageViewer(item.message, item.url);
      } else {
        void openVideoViewer(item.message, item.url || '');
      }
    },
    [closeMediaHub, openImageViewer, openVideoViewer]
  );

  const renderMoodStickersPanel = () => {
    if (!showMoodStickers) return null;

    const categories = [...new Set(MOOD_STICKERS.map(s => s.category))];

    return (
      <View style={styles.moodStickersPanel}>
        <View style={styles.moodStickerHeader}>
          <Text style={styles.moodStickerTitle}>Mood Stickers</Text>
          <TouchableOpacity onPress={() => setShowMoodStickers(false)}>
            <MaterialCommunityIcons name="close" size={24} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.moodStickersContent}
        >
          {categories.map(category => (
            <View key={category} style={styles.stickerCategory}>
              <Text style={styles.categoryTitle}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </Text>
              <View style={styles.stickersGrid}>
                {MOOD_STICKERS.filter(s => s.category === category).map((sticker, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.stickerButton}
                    onPress={() => sendMoodSticker(sticker)}
                  >
                    <Text style={styles.stickerEmoji}>{sticker.emoji}</Text>
                    <Text style={styles.stickerName}>
                      {sticker.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <ChatThreadView style={styles.container}>
      <ChatSafetyModal visible={chatSafetyVisible} onGotIt={dismissChatSafety} />
      <View style={styles.reconnectToastHost} pointerEvents="none">
        <Animated.View
          style={[
            styles.reconnectToast,
            {
              opacity: reconnectToastOpacity,
              transform: [
                {
                  translateY: reconnectToastOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-6, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <MaterialCommunityIcons name="wifi" size={14} color={Colors.light.background} />
          <Text style={styles.reconnectToastText}>Reconnected</Text>
        </Animated.View>
      </View>
      <View style={[styles.chatActionToastHost, { top: insets.top + 84 }]} pointerEvents="none">
        {chatActionToast ? (
          <Animated.View
            style={[
              styles.chatActionToast,
              {
                opacity: chatActionToastOpacity,
                transform: [
                  {
                    translateY: chatActionToastOpacity.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-6, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <MaterialCommunityIcons name={chatActionToast.icon} size={14} color={Colors.light.background} />
            <Text style={styles.chatActionToastText}>{chatActionToast.label}</Text>
          </Animated.View>
        ) : null}
      </View>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerProfile}
          onPress={handleHeaderPress}
          onLongPress={handleHeaderLongPress}
          activeOpacity={0.85}
        >
          <View style={styles.avatarContainer}>
            {showMoments ? (
              <Animated.View
                pointerEvents="none"
                style={[
                    styles.avatarPulse,
                    {
                      opacity: momentPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.22, 0],
                      }),
                      transform: [
                        {
                          scale: momentPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.15],
                          }),
                        },
                      ],
                    },
                ]}
              />
            ) : null}
            {showMoments ? (
              <LinearGradient
                colors={['#f59e0b', '#f43f5e', '#22d3ee']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.avatarRing, styles.avatarRingActive]}
              >
                <View style={styles.avatarInner}>
                    {isChatBlocked || !userAvatar ? (
                      <Image source={BLOCKED_AVATAR_SOURCE} style={styles.headerAvatar} />
                    ) : (
                      <ExpoImage
                        source={{ uri: userAvatar }}
                        style={styles.headerAvatar}
                        cachePolicy="disk"
                        contentFit="cover"
                        transition={0}
                      />
                    )}
                </View>
              </LinearGradient>
            ) : (
              <View style={styles.avatarRing}>
                <View style={styles.avatarInner}>
                    {isChatBlocked || !userAvatar ? (
                      <Image source={BLOCKED_AVATAR_SOURCE} style={styles.headerAvatar} />
                    ) : (
                      <ExpoImage
                        source={{ uri: userAvatar }}
                        style={styles.headerAvatar}
                        cachePolicy="disk"
                        contentFit="cover"
                        transition={0}
                      />
                    )}
                </View>
              </View>
            )}
            {!isChatBlocked && networkReady && peerPresenceDisplay.online && (
              <View style={styles.onlineIndicator} />
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{headerDisplayName}</Text>
            <Text style={[styles.headerStatus, peerHasLeftBetweener && styles.headerStatusLeft]}>
              {headerStatusLabel}
            </Text>
            {false ? (
              <View style={styles.headerStateRow}>
                <Text style={styles.headerStateMeta}>
                  {[isChatMuted ? 'Chat muted' : null, isChatPinned ? 'Pinned to top' : null]
                    .filter(Boolean)
                    .join(' • ')}
                </Text>
                <View style={styles.headerStatePillRow}>
                  {isChatMuted ? (
                    <View style={styles.headerStatePill}>
                      <MaterialCommunityIcons name="volume-off" size={12} color={theme.tint} />
                      <Text style={styles.headerStateText}>Muted</Text>
                    </View>
                  ) : null}
                  {isChatPinned ? (
                    <View style={styles.headerStatePill}>
                      <MaterialCommunityIcons name="pin-outline" size={12} color={theme.tint} />
                      <Text style={styles.headerStateText}>Pinned</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
            {!peerHasLeftBetweener && matchAccepted && conversationSignal ? (
              <View style={styles.headerMatchRow}>
                <MaterialCommunityIcons name="heart" size={14} color={theme.tint} />
                <Text style={styles.headerMatchText}>{conversationSignal}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.headerOptionsButton,
            isChatBlocked && styles.headerOptionsButtonBlocked,
            false && !isChatBlocked && (isChatMuted || isChatPinned) && styles.headerOptionsButtonActive,
          ]}
          hitSlop={10}
          onPress={handleOpenHeaderMenu}
          accessibilityRole="button"
          accessibilityLabel="Open chat options"
          activeOpacity={0.82}
        >
          <MaterialCommunityIcons
            name={isChatBlocked ? 'shield-lock-outline' : 'dots-horizontal'}
            size={22}
            color={isChatBlocked ? theme.tint : theme.text}
          />
          {false ? (
            <View style={styles.headerOptionsStateStack}>
              <View style={styles.headerOptionsStateRail}>
                {isChatPinned ? (
                  <View style={styles.headerOptionsStateBadge}>
                    <MaterialCommunityIcons name="pin" size={10} color={Colors.light.background} />
                  </View>
                ) : null}
                {isChatMuted ? (
                  <View style={[styles.headerOptionsStateBadge, styles.headerOptionsStateBadgeMuted]}>
                    <MaterialCommunityIcons name="volume-off" size={10} color={Colors.light.background} />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
      {peerHasLeftBetweener ? (
        <View style={styles.leftBetweenerThreadNotice}>
          <View style={styles.leftBetweenerThreadNoticeIcon}>
            <MaterialCommunityIcons name="door-closed" size={14} color={theme.tint} />
          </View>
          <View style={styles.leftBetweenerThreadNoticeCopy}>
            <Text style={styles.leftBetweenerThreadNoticeTitle}>Left Betweener</Text>
            <Text style={styles.leftBetweenerThreadNoticeText}>
              This member is no longer on Betweener. You can still review the conversation history.
            </Text>
          </View>
        </View>
      ) : null}
      {pendingIntentRequest ? (
        <View style={styles.intentBanner}>
          <View style={styles.intentBannerText}>
            <Text style={styles.intentBannerTitle}>Pending request</Text>
            <Text style={styles.intentBannerSubtitle}>
              {formatIntentTypeLabel(pendingIntentRequest.type)}
              {pendingIntentRequest.expires_at
                ? ` - Closes in ${formatIntentExpiresIn(pendingIntentRequest.expires_at)}`
                : ''}
            </Text>
          </View>
          <View style={styles.intentBannerActions}>
            <TouchableOpacity style={styles.intentAcceptButton} onPress={acceptPendingIntent}>
              <Text style={styles.intentAcceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.intentPassButton} onPress={passPendingIntent}>
              <Text style={styles.intentPassText}>Pass</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {pinnedMessageCount > 0 ? (
        <View style={styles.pinnedBanner}>
          <BlurView
            intensity={28}
            tint={isDark ? 'dark' : 'light'}
            style={styles.pinnedBannerBlur}
            pointerEvents="none"
          />
          <Pressable
            style={({ pressed }) => [
              styles.pinnedBannerContent,
              pressed && styles.pinnedBannerPressed,
            ]}
            onPress={togglePinnedBanner}
            disabled={pinnedMessageCount === 0}
          >
            <View style={styles.pinnedBadge}>
              <MaterialCommunityIcons name="pin" size={14} color={theme.tint} />
              <Text style={styles.pinnedBadgeText}>Pinned</Text>
            </View>
            <View style={styles.pinnedTextWrap}>
              <Text style={styles.pinnedMessageText} numberOfLines={1}>
                {pinnedPreviewText}
              </Text>
              {pinnedMessageCount > 1 ? (
                <Text style={styles.pinnedCountText}>
                  +{pinnedMessageCount - 1} more
                </Text>
              ) : null}
            </View>
            <Animated.View style={{ transform: [{ rotate: pinnedChevronRotation }] }}>
              <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
            </Animated.View>
          </Pressable>
          <Animated.View
            style={[
              styles.pinnedBannerActionsWrap,
              { height: pinnedActionsHeight, opacity: pinnedActionsOpacity },
            ]}
            pointerEvents={pinnedBannerExpanded ? 'auto' : 'none'}
          >
            <View style={styles.pinnedBannerActions}>
              <Pressable
                style={styles.pinnedActionButton}
                onPress={handlePinnedJump}
              >
                <MaterialCommunityIcons name="target" size={16} color={theme.text} />
                <Text style={styles.pinnedActionLabel}>Jump</Text>
              </Pressable>
              <Pressable
                style={[styles.pinnedActionButton, styles.pinnedActionDanger]}
                onPress={handlePinnedUnpin}
              >
                <MaterialCommunityIcons name="pin-off" size={16} color={theme.danger} />
                <Text style={[styles.pinnedActionLabel, styles.pinnedActionLabelDanger]}>Unpin</Text>
              </Pressable>
              <Pressable
                style={styles.pinnedActionButton}
                onPress={handlePinnedSeeAll}
              >
                <MaterialCommunityIcons name="pin-outline" size={16} color={theme.text} />
                <Text style={styles.pinnedActionLabel}>All pins</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      ) : null}
      {showHeaderHint ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.headerHint,
            {
              opacity: headerHintOpacity,
              transform: [
                {
                  translateY: headerHintOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-4, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.headerHintText}>Use the menu for chat options</Text>
        </Animated.View>
      ) : null}
      <Modal
        transparent
        visible={datePlannerVisible}
        animationType="fade"
        onRequestClose={handleCloseDatePlanner}
      >
        <Pressable style={styles.datePlannerBackdrop} onPress={handleCloseDatePlanner} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 10}
          style={styles.datePlannerKeyboard}
        >
          <View style={styles.datePlannerSheet}>
            <BlurView intensity={38} tint={isDark ? 'dark' : 'light'} style={styles.datePlannerBlur} />
            <ScrollView
              contentContainerStyle={styles.datePlannerContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.datePlannerHeader}>
                <View style={styles.datePlannerHeaderText}>
                  <Text style={styles.datePlannerEyebrow}>
                    {datePlannerMode === 'reschedule' ? 'Reschedule request' : 'Date suggestion'}
                  </Text>
                  <Text style={styles.datePlannerTitle}>{datePlannerTitle}</Text>
                  <Text style={styles.datePlannerSubtitle}>{datePlannerSubtitle}</Text>
                  {userAvatar ? (
                      <View style={styles.datePlannerPersonChip}>
                        <ExpoImage
                          source={{ uri: userAvatar }}
                          style={styles.datePlannerPersonAvatar}
                          cachePolicy="disk"
                          contentFit="cover"
                          transition={0}
                        />
                      <View style={styles.datePlannerPersonText}>
                        <Text style={styles.datePlannerPersonLabel}>Planning for</Text>
                        <Text style={styles.datePlannerPersonName} numberOfLines={1}>
                          {userName || 'your match'}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity style={styles.datePlannerClose} onPress={handleCloseDatePlanner}>
                  <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.datePlannerWhenCard}>
                <Text style={styles.datePlannerSectionTitle}>When</Text>
                <View style={styles.datePlannerWhenRow}>
                  <TouchableOpacity style={styles.datePlannerWhenButton} onPress={() => setDatePickerMode('date')}>
                    <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={theme.tint} />
                    <Text style={styles.datePlannerWhenLabel}>
                      {datePlannerDate.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.datePlannerWhenButton} onPress={() => setDatePickerMode('time')}>
                    <MaterialCommunityIcons name="clock-time-four-outline" size={18} color={theme.tint} />
                    <Text style={styles.datePlannerWhenLabel}>
                      {datePlannerDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                </View>
                {datePickerMode ? (
                  <DateTimePicker
                    value={datePlannerDate}
                    mode={datePickerMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={datePickerMode === 'date' ? new Date() : undefined}
                    onChange={handleDatePickerChange}
                  />
                ) : null}
                <View style={styles.datePlannerQuickSlotRow}>
                  {dateQuickSlots.map((slot) => {
                    const active =
                      datePlannerDate.getTime() === slot.date.getTime();
                    return (
                      <TouchableOpacity
                        key={slot.id}
                        style={[
                          styles.datePlannerQuickSlot,
                          active && styles.datePlannerQuickSlotActive,
                        ]}
                        onPress={() => setDatePlannerDate(new Date(slot.date))}
                      >
                        <Text style={[styles.datePlannerQuickSlotLabel, active && styles.datePlannerQuickSlotLabelActive]}>
                          {slot.label}
                        </Text>
                        <Text style={[styles.datePlannerQuickSlotCaption, active && styles.datePlannerQuickSlotCaptionActive]}>
                          {slot.caption}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.datePlannerTabs}>
                {[
                  { key: 'picks', label: 'Betweener Picks' },
                  { key: 'nearby', label: 'Near us' },
                  { key: 'search', label: 'Search' },
                  { key: 'preferred', label: 'Preferred' },
                ].map((tab) => {
                  const active = datePlannerTab === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.datePlannerTabButton, active && styles.datePlannerTabButtonActive]}
                      onPress={() => setDatePlannerTab(tab.key as 'picks' | 'nearby' | 'search' | 'preferred')}
                    >
                      <Text style={[styles.datePlannerTabText, active && styles.datePlannerTabTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {datePlannerTab === 'picks' ? (
                <View style={styles.datePlannerList}>
                  {recommendedDatePicks.map((venue) => {
                    const selected = dateSelectedPlace?.id === venue.id;
                    return (
                      <TouchableOpacity
                        key={venue.id}
                        style={[styles.dateVenueCard, selected && styles.dateVenueCardSelected]}
                        onPress={() =>
                          selectDatePlace({
                            id: venue.id,
                            name: venue.name,
                            address: venue.address,
                            lat: venue.lat,
                            lng: venue.lng,
                            source: 'betweener_pick',
                            badges: [...venue.badges],
                            summary: venue.summary,
                            city: venue.city,
                          })
                        }
                      >
                        <View style={styles.dateVenueCardHeader}>
                          <Text style={styles.dateVenueName}>{venue.name}</Text>
                          {selected ? <MaterialCommunityIcons name="check-circle" size={18} color={theme.tint} /> : null}
                        </View>
                        <Text style={styles.dateVenueAddress}>{venue.address}</Text>
                        <Text style={styles.dateVenueSummary}>{venue.summary}</Text>
                        <View style={styles.dateVenueBadgeRow}>
                          {venue.badges.map((badge) => {
                            const badgeMeta = getDateBadgeMeta(badge);
                            const badgePalette = getDateBadgePalette({
                              tone: badgeMeta.tone,
                              theme,
                              isDark,
                              surface: 'planner',
                            });
                            return (
                              <View
                                key={badge}
                                style={[
                                  styles.dateVenueBadge,
                                  {
                                    backgroundColor: badgePalette.backgroundColor,
                                    borderColor: badgePalette.borderColor,
                                  },
                                ]}
                              >
                                <View style={styles.dateVenueBadgeContent}>
                                  <MaterialCommunityIcons
                                    name={badgeMeta.icon}
                                    size={12}
                                    color={badgePalette.foregroundColor}
                                    style={styles.dateVenueBadgeIcon}
                                  />
                                  <Text style={[styles.dateVenueBadgeText, { color: badgePalette.foregroundColor }]}>{badge}</Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              {datePlannerTab === 'nearby' ? (
                <View style={styles.datePlannerList}>
                  {placesLoading ? (
                    <Text style={styles.datePlannerEmpty}>Looking for places nearby...</Text>
                  ) : nearbyPlaces.length > 0 ? (
                    nearbyPlaces.slice(0, 6).map((place) => {
                      const selected = dateSelectedPlace?.id === place.id;
                      return (
                        <TouchableOpacity
                          key={place.id}
                          style={[styles.dateVenueCard, selected && styles.dateVenueCardSelected]}
                          onPress={() =>
                            selectDatePlace({
                              ...place,
                              source: 'nearby',
                              badges: ['Nearby'],
                              summary: 'Close enough to keep the plan easy.',
                            })
                          }
                        >
                          <View style={styles.dateVenueCardHeader}>
                            <Text style={styles.dateVenueName}>{place.name}</Text>
                            {selected ? <MaterialCommunityIcons name="check-circle" size={18} color={theme.tint} /> : null}
                          </View>
                          <Text style={styles.dateVenueAddress}>{place.address || 'Nearby venue'}</Text>
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <Text style={styles.datePlannerEmpty}>Enable location to surface nearby spots.</Text>
                  )}
                </View>
              ) : null}

              {datePlannerTab === 'search' ? (
                <View style={styles.datePlannerList}>
                  <View style={styles.datePlannerSearchBar}>
                    <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
                    <TextInput
                      style={styles.datePlannerSearchInput}
                      placeholder="Search restaurants, lounges, cafes"
                      placeholderTextColor={theme.textMuted}
                      value={dateSearchQuery}
                      onChangeText={setDateSearchQuery}
                    />
                    {searchLoading ? <ActivityIndicator size="small" color={theme.textMuted} /> : null}
                  </View>
                  {dateSuggestions.length > 0 ? (
                    dateSuggestions.map((suggestion) => (
                      <TouchableOpacity
                        key={suggestion.id}
                        style={styles.dateSuggestionRow}
                        onPress={() => void handleDateSuggestionPress(suggestion)}
                      >
                        <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.textMuted} />
                        <View style={styles.dateSuggestionText}>
                          <Text style={styles.dateSuggestionTitle}>{suggestion.primary}</Text>
                          {suggestion.secondary ? (
                            <Text style={styles.dateSuggestionSubtitle}>{suggestion.secondary}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={styles.datePlannerEmpty}>
                      Search for a place and it will drop straight into the suggestion.
                    </Text>
                  )}
                </View>
              ) : null}

              {datePlannerTab === 'preferred' ? (
                <View style={styles.datePlannerList}>
                  {preferredDatePicks.length > 0 ? (
                    preferredDatePicks.map((venue) => {
                      const selected = dateSelectedPlace?.id === venue.id;
                      return (
                        <TouchableOpacity
                          key={venue.id}
                          style={[styles.dateVenueCard, selected && styles.dateVenueCardSelected]}
                          onPress={() =>
                            selectDatePlace({
                              id: venue.id,
                              name: venue.name,
                              address: venue.address,
                              lat: venue.lat,
                              lng: venue.lng,
                              source: 'preferred',
                              venueId: venue.venueId ?? null,
                              badges: ['Their area', ...venue.badges.slice(0, 2)],
                              summary: venue.summary,
                              city: venue.city,
                            })
                          }
                        >
                          <View style={styles.dateVenueCardHeader}>
                            <Text style={styles.dateVenueName}>{venue.name}</Text>
                            {selected ? <MaterialCommunityIcons name="check-circle" size={18} color={theme.tint} /> : null}
                          </View>
                          <Text style={styles.dateVenueAddress}>{venue.address}</Text>
                          <Text style={styles.dateVenueSummary}>
                            Closer to {peerProfile?.full_name?.split(' ')[0] || 'their'} area.
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  ) : peerLocationLabel ? (
                    <TouchableOpacity style={styles.datePreferredCard} onPress={seedPreferredAreaSearch}>
                      <MaterialCommunityIcons name="compass-outline" size={18} color={theme.tint} />
                      <View style={styles.datePreferredText}>
                        <Text style={styles.datePreferredTitle}>Search around {peerLocationLabel}</Text>
                        <Text style={styles.datePreferredSubtitle}>Use Google Places to find something in their area.</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.datePlannerEmpty}>No preferred area on their profile yet.</Text>
                  )}
                </View>
              ) : null}

              <View style={styles.datePlannerSummaryCard}>
                <Text style={styles.datePlannerSectionTitle}>
                  {datePlannerMode === 'reschedule' ? 'Ready to update' : 'Ready to suggest'}
                </Text>
                {dateSelectedPlace ? (
                  <>
                    <View style={styles.datePlannerSummaryRow}>
                      {selectedDateMapUrl ? (
                        <Image source={{ uri: selectedDateMapUrl }} style={styles.datePlannerSummaryMap} />
                      ) : null}
                      <View style={styles.datePlannerSummaryText}>
                        <Text style={styles.datePlannerSummaryTitle}>{dateSelectedPlace.name}</Text>
                        <Text style={styles.datePlannerSummaryMeta}>
                          {formatDateInviteWhen(datePlannerDate)}
                        </Text>
                        {dateSelectedPlace.address ? (
                          <Text style={styles.datePlannerSummaryAddress}>{dateSelectedPlace.address}</Text>
                        ) : null}
                      </View>
                    </View>
                    {dateSelectedPlace.badges?.length ? (
                      <View style={styles.dateVenueBadgeRow}>
                        {dateSelectedPlace.badges.slice(0, 3).map((badge) => {
                          const badgeMeta = getDateBadgeMeta(badge);
                          const badgePalette = getDateBadgePalette({
                            tone: badgeMeta.tone,
                            theme,
                            isDark,
                            surface: 'planner',
                          });
                          return (
                            <View
                              key={badge}
                              style={[
                                styles.dateVenueBadge,
                                {
                                  backgroundColor: badgePalette.backgroundColor,
                                  borderColor: badgePalette.borderColor,
                                },
                              ]}
                            >
                              <View style={styles.dateVenueBadgeContent}>
                                <MaterialCommunityIcons
                                  name={badgeMeta.icon}
                                  size={12}
                                  color={badgePalette.foregroundColor}
                                  style={styles.dateVenueBadgeIcon}
                                />
                                <Text style={[styles.dateVenueBadgeText, { color: badgePalette.foregroundColor }]}>{badge}</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                    <View style={styles.datePlannerSummaryActions}>
                      <TouchableOpacity
                        style={styles.datePlannerInsightButton}
                        onPress={() => setDateVenueDetailPlace(dateSelectedPlace)}
                      >
                        <MaterialCommunityIcons name="shield-check-outline" size={14} color={theme.tint} />
                        <Text style={styles.datePlannerInsightButtonText}>Why this venue works</Text>
                      </TouchableOpacity>
                      {selectedDateExperience.conciergeServices.length > 0 ? (
                        <View style={styles.datePlannerConciergeHint}>
                          <MaterialCommunityIcons name="account-tie-hat-outline" size={14} color={theme.textMuted} />
                          <Text style={styles.datePlannerConciergeHintText}>Betweener help available after acceptance</Text>
                        </View>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <Text style={styles.datePlannerEmpty}>Choose a place to finish the suggestion.</Text>
                )}
                <TextInput
                  style={styles.datePlannerNoteInput}
                  placeholder="Add a warm note, a small surprise, or the vibe you want"
                  placeholderTextColor={theme.textMuted}
                  value={dateNote}
                  onChangeText={setDateNote}
                  multiline
                />
                <TouchableOpacity
                  style={[
                    styles.datePlannerSendButton,
                    (!dateSelectedPlace || dateSending) && styles.datePlannerSendButtonDisabled,
                  ]}
                  disabled={!dateSelectedPlace || dateSending}
                  onPress={() => void sendDateInvitation()}
                >
                  <Text style={styles.datePlannerSendText}>
                    {dateSending
                      ? 'Sending...'
                      : datePlannerMode === 'counter_time'
                      ? 'Suggest another time'
                      : datePlannerMode === 'counter_place'
                      ? 'Suggest another place'
                      : datePlannerMode === 'counter_both'
                      ? 'Suggest both'
                      : datePlannerMode === 'reschedule'
                      ? 'Send update'
                      : 'Send suggestion'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        transparent
        visible={Boolean(dateVenueDetailPlace)}
        animationType="fade"
        onRequestClose={() => setDateVenueDetailPlace(null)}
      >
        <Pressable style={styles.datePlannerBackdrop} onPress={() => setDateVenueDetailPlace(null)} />
        <View style={styles.dateDetailSheetWrap}>
          <View style={styles.dateDetailSheet}>
            <BlurView intensity={34} tint={isDark ? 'dark' : 'light'} style={styles.dateDetailBlur} />
            <View style={styles.dateDetailContent}>
              <View style={styles.dateDetailHeader}>
                <View style={styles.dateDetailHeaderText}>
                  <Text style={styles.dateDetailEyebrow}>Venue details</Text>
                  <Text style={styles.dateDetailTitle}>{dateVenueDetailPlace?.name || 'Selected venue'}</Text>
                  {dateVenueDetailPlace?.address ? (
                    <Text style={styles.dateDetailSubtitle}>{dateVenueDetailPlace.address}</Text>
                  ) : null}
                </View>
                <TouchableOpacity style={styles.datePlannerClose} onPress={() => setDateVenueDetailPlace(null)}>
                  <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.dateDetailBlock}>
                <Text style={styles.dateDetailBlockTitle}>Why it works</Text>
                <Text style={styles.dateDetailBlockLead}>{dateVenueDetailExperience.vibe || 'Strong first-date fit'}</Text>
                {dateVenueDetailExperience.trustReasons.map((reason) => (
                  <View key={reason} style={styles.dateDetailBulletRow}>
                    <MaterialCommunityIcons name="check-circle-outline" size={14} color={theme.tint} />
                    <Text style={styles.dateDetailBulletText}>{reason}</Text>
                  </View>
                ))}
              </View>

              {dateVenueDetailExperience.perks.length > 0 ? (
                <View style={styles.dateDetailBlock}>
                  <Text style={styles.dateDetailBlockTitle}>Betweener perks</Text>
                  <View style={styles.dateVenueBadgeRow}>
                    {dateVenueDetailExperience.perks.map((perk) => {
                      const badgeMeta = getDateBadgeMeta(perk);
                      const badgePalette = getDateBadgePalette({
                        tone: badgeMeta.tone,
                        theme,
                        isDark,
                        surface: 'planner',
                      });
                      return (
                        <View
                          key={perk}
                          style={[
                            styles.dateVenueBadge,
                            {
                              backgroundColor: badgePalette.backgroundColor,
                              borderColor: badgePalette.borderColor,
                            },
                          ]}
                        >
                          <View style={styles.dateVenueBadgeContent}>
                            <MaterialCommunityIcons
                              name={badgeMeta.icon}
                              size={12}
                              color={badgePalette.foregroundColor}
                              style={styles.dateVenueBadgeIcon}
                            />
                            <Text style={[styles.dateVenueBadgeText, { color: badgePalette.foregroundColor }]}>{perk}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {dateVenueDetailExperience.conciergeServices.length > 0 ? (
                <View style={styles.dateDetailBlock}>
                  <Text style={styles.dateDetailBlockTitle}>Betweener can help with</Text>
                  {dateVenueDetailExperience.conciergeServices.map((service) => (
                    <View key={service} style={styles.dateDetailBulletRow}>
                      <MaterialCommunityIcons name="account-tie-hat-outline" size={14} color={theme.textMuted} />
                      <Text style={styles.dateDetailBulletText}>{service}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        visible={datePlanConciergeVisible}
        animationType="fade"
        onRequestClose={handleCloseDatePlanConcierge}
      >
        <Pressable style={styles.datePlannerBackdrop} onPress={handleCloseDatePlanConcierge} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 10}
          style={styles.datePlannerKeyboard}
        >
          <View style={styles.dateDetailSheetWrap}>
            <View style={styles.dateDetailSheet}>
              <BlurView intensity={34} tint={isDark ? 'dark' : 'light'} style={styles.dateDetailBlur} />
              <ScrollView contentContainerStyle={styles.dateDetailContent} keyboardShouldPersistTaps="handled">
                <View style={styles.dateDetailHeader}>
                  <View style={styles.dateDetailHeaderText}>
                    <Text style={styles.dateDetailEyebrow}>Betweener help</Text>
                    <Text style={styles.dateDetailTitle}>Let Betweener help with the plan</Text>
                    <Text style={styles.dateDetailSubtitle}>
                      {conciergePlanSummary?.place_name
                        ? `For ${conciergePlanSummary.place_name}`
                        : 'Tell Betweener what kind of help you want.'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.datePlannerClose} onPress={handleCloseDatePlanConcierge}>
                    <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.conciergeOptionList}>
                  {CONCIERGE_SERVICE_OPTIONS.map((option) => {
                    const selected = datePlanConciergeSelections.includes(option.id);
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[styles.conciergeOptionCard, selected && styles.conciergeOptionCardSelected]}
                        onPress={() => toggleDatePlanConciergeSelection(option.id)}
                      >
                        <View style={styles.conciergeOptionHeader}>
                          <Text style={styles.conciergeOptionTitle}>{option.title}</Text>
                          <MaterialCommunityIcons
                            name={selected ? 'check-circle' : 'circle-outline'}
                            size={18}
                            color={selected ? theme.tint : theme.textMuted}
                          />
                        </View>
                        <Text style={styles.conciergeOptionDescription}>{option.description}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  style={styles.datePlannerNoteInput}
                  placeholder="Add a note for the Betweener team"
                  placeholderTextColor={theme.textMuted}
                  value={datePlanConciergeNote}
                  onChangeText={setDatePlanConciergeNote}
                  multiline
                />

                <TouchableOpacity
                  style={[
                    styles.datePlannerSendButton,
                    ((!datePlanConciergePlanId || datePlanActionId === datePlanConciergePlanId) && styles.datePlannerSendButtonDisabled),
                  ]}
                  disabled={!datePlanConciergePlanId || datePlanActionId === datePlanConciergePlanId}
                  onPress={() => void submitDatePlanConciergeRequest()}
                >
                  <Text style={styles.datePlannerSendText}>
                    {datePlanActionId === datePlanConciergePlanId ? 'Sending request...' : 'Request Betweener help'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        transparent
        visible={pinnedSheetVisible}
        animationType="fade"
        onRequestClose={closePinnedSheet}
      >
        <Pressable style={styles.pinnedSheetBackdrop} onPress={closePinnedSheet} />
        <View style={styles.pinnedSheet}>
          <BlurView
            intensity={32}
            tint={isDark ? 'dark' : 'light'}
            style={styles.pinnedSheetBlur}
          />
          <View style={styles.pinnedSheetHeader}>
            <View>
              <Text style={styles.pinnedSheetTitle}>Pinned messages</Text>
              <Text style={styles.pinnedSheetCount}>{pinnedMessageCount} pinned</Text>
            </View>
            <TouchableOpacity onPress={closePinnedSheet} style={styles.pinnedSheetClose}>
              <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.pinnedSheetContent}>
            {pinnedMessages.length === 0 ? (
              <Text style={styles.pinnedSheetEmpty}>No pinned messages loaded yet.</Text>
            ) : (
              pinnedMessages.map((message) => (
                <Pressable
                  key={message.id}
                  style={({ pressed }) => [
                    styles.pinnedSheetCard,
                    pressed && styles.pinnedSheetCardPressed,
                  ]}
                  onPress={() => {
                    closePinnedSheet();
                    jumpToMessage(message.id);
                  }}
                >
                  <View style={styles.pinnedSheetIconWrap}>
                    <MaterialCommunityIcons
                      name={getPinnedIcon(message)}
                      size={18}
                      color={theme.tint}
                    />
                  </View>
                  <View style={styles.pinnedSheetText}>
                    <Text style={styles.pinnedSheetMessage} numberOfLines={1}>
                      {getPinnedPreview(message)}
                    </Text>
                    <Text style={styles.pinnedSheetMeta}>
                      {formatDayLabel(message.timestamp)} • {formatTime(message.timestamp)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.pinnedSheetUnpin}
                    onPress={() => {
                      void unpinMessage(message);
                    }}
                  >
                    <MaterialCommunityIcons name="pin-off-outline" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                </Pressable>
              ))
            )}
            {pinnedMessageTotal > pinnedMessageCount ? (
              <Text style={styles.pinnedSheetHint}>
                {pinnedMessageCount} of {pinnedMessageTotal} pins loaded. Scroll up to load more.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        transparent
        visible={reactionSheetVisible}
        animationType="fade"
        onRequestClose={closeReactionSheet}
      >
        <ChatReactionSummarySheet
          visible={reactionSheetVisible}
          styles={styles}
          theme={theme}
          isDark={isDark}
          currentUserId={user?.id}
          currentUserAvatarUrl={profile?.avatar_url}
          reactionSheetMessage={reactionSheetMessage}
          reactionSummary={reactionSummary}
          reactionSheetList={reactionSheetList}
          reactionSheetEmoji={reactionSheetEmoji}
          reactionProfiles={reactionProfiles}
          reactionProfilesLoading={reactionProfilesLoading}
          fallbackAvatarSource={BLOCKED_AVATAR_SOURCE}
          onClose={closeReactionSheet}
          onSelectEmoji={setReactionSheetEmoji}
        />
      </Modal>

      <Modal
        transparent
        visible={chatSearchVisible}
        animationType="fade"
        onRequestClose={closeChatSearch}
      >
        <Pressable style={styles.searchBackdrop} onPress={closeChatSearch} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.searchSheet}
        >
          <BlurView
            intensity={36}
            tint={isDark ? 'dark' : 'light'}
            style={styles.searchBlur}
          />
          <View style={styles.searchContent}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>Search in chat</Text>
              <TouchableOpacity style={styles.searchClose} onPress={closeChatSearch}>
                <MaterialCommunityIcons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
              <TextInput
                value={chatSearchQuery}
                onChangeText={setChatSearchQuery}
                placeholder="Search messages"
                placeholderTextColor={theme.textMuted}
                style={styles.searchInput}
                autoFocus
              />
            </View>
            <ScrollView contentContainerStyle={styles.searchResults}>
              {chatSearchQuery.trim().length === 0 ? (
                <Text style={styles.searchHint}>Type to search messages.</Text>
              ) : searchResults.length === 0 ? (
                <Text style={styles.searchHint}>No matches found.</Text>
              ) : (
                searchResults.map((result) => (
                  <Pressable
                    key={result.id}
                    style={styles.searchResult}
                    accessibilityRole="button"
                    accessibilityLabel={`Message from ${formatDayLabel(result.timestamp)}. ${result.text}`}
                    onPress={() => openSearchResult(result)}
                  >
                    {renderHighlightedText(result.text, chatSearchQuery)}
                    <Text style={styles.searchResultMeta}>
                      {formatDayLabel(result.timestamp)} • {formatTime(result.timestamp)}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={mediaHubVisible}
        animationType="fade"
        onRequestClose={closeMediaHub}
      >
        <Pressable style={styles.mediaHubBackdrop} onPress={closeMediaHub} />
        <View style={styles.mediaHubSheet}>
          <BlurView
            intensity={36}
            tint={isDark ? 'dark' : 'light'}
            style={styles.mediaHubBlur}
          />
          <View style={styles.mediaHubContent}>
            <View style={styles.mediaHubHeader}>
              <Text style={styles.mediaHubTitle}>Media, links & docs</Text>
              <TouchableOpacity style={styles.mediaHubClose} onPress={closeMediaHub}>
                <MaterialCommunityIcons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.mediaHubTabs}>
              {[
                { key: 'media', label: 'Media' },
                { key: 'links', label: 'Links' },
                { key: 'docs', label: 'Docs' },
              ].map((tab) => {
                const isActive = mediaTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    style={[styles.mediaHubTab, isActive && styles.mediaHubTabActive]}
                    onPress={() => setMediaTab(tab.key as typeof mediaTab)}
                  >
                    <Text style={[styles.mediaHubTabText, isActive && styles.mediaHubTabTextActive]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <ScrollView contentContainerStyle={styles.mediaHubBody}>
              {mediaTab === 'media' ? (
                mediaItems.length === 0 ? (
                  <Text style={styles.mediaHubEmpty}>No media yet.</Text>
                ) : (
                  <View style={styles.mediaGrid}>
                    {mediaItems.map((item) => (
                      <Pressable
                        key={item.id}
                        style={styles.mediaTile}
                        onPress={() => handleOpenMediaItem(item)}
                      >
                        {item.type === 'image' && item.url ? (
                          <ExpoImage
                            source={{ uri: item.url }}
                            style={styles.mediaTileImage}
                            cachePolicy="disk"
                            contentFit="cover"
                            transition={0}
                          />
                        ) : (
                          <View style={styles.mediaTilePlaceholder}>
                            <MaterialCommunityIcons name="play-circle" size={26} color={theme.textMuted} />
                            <Text style={styles.mediaTileLabel}>Video</Text>
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </View>
                )
              ) : mediaTab === 'links' ? (
                linkItems.length === 0 ? (
                  <Text style={styles.mediaHubEmpty}>No links shared.</Text>
                ) : (
                  <View style={styles.mediaList}>
                    {linkItems.map((item, idx) => (
                      <Pressable
                        key={`${item.id}-${idx}`}
                        style={styles.mediaListItem}
                        onPress={() => Linking.openURL(item.url)}
                      >
                        <MaterialCommunityIcons name="link-variant" size={18} color={theme.tint} />
                        <View style={styles.mediaListText}>
                          <Text style={styles.mediaListTitle} numberOfLines={1}>
                            {item.url}
                          </Text>
                          <Text style={styles.mediaListMeta} numberOfLines={1}>
                            {formatDayLabel(item.timestamp)} • {formatTime(item.timestamp)}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )
              ) : docItems.length === 0 ? (
                <Text style={styles.mediaHubEmpty}>No documents yet.</Text>
              ) : (
                <View style={styles.mediaList}>
                  {docItems.map((item) => (
                    <Pressable
                      key={item.id}
                      style={styles.mediaListItem}
                      onPress={() => {
                        closeMediaHub();
                        void handleOpenDocument(item.message);
                      }}
                    >
                      <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.tint} />
                      <View style={styles.mediaListText}>
                        <Text style={styles.mediaListTitle} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.mediaListMeta} numberOfLines={1}>
                          {item.typeLabel || 'Document'} • {formatDayLabel(item.timestamp)}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ChatMessageActionsSheet
        visible={messageActionsVisible}
        actionMessage={actionMessage}
        styles={styles}
        theme={theme}
        isDark={isDark}
        canRetryActionMessage={canRetryActionMessage}
        canEditAction={canEditAction}
        canReportActionMessage={canReportActionMessage}
        isActionPinned={isActionPinned}
        isChatMuted={isChatMuted}
        onClose={closeMessageActions}
        onReply={(message) => {
          triggerActionHaptic(Haptics.ImpactFeedbackStyle.Light);
          replyToMessage(message);
        }}
        onRetry={(message) => {
          triggerActionHaptic(Haptics.ImpactFeedbackStyle.Medium);
          void retryFailedMessage(message);
        }}
        onEdit={(message) => {
          triggerActionHaptic(Haptics.ImpactFeedbackStyle.Medium);
          startEditMessage(message);
        }}
        onCopy={(message) => {
          triggerActionHaptic(Haptics.ImpactFeedbackStyle.Light);
          void handleCopyMessage(message);
        }}
        onViewEditHistory={(message) => {
          triggerActionHaptic(Haptics.ImpactFeedbackStyle.Light);
          void openEditHistory(message);
        }}
        onTogglePin={(message, currentlyPinned) => {
          triggerActionHaptic(Haptics.ImpactFeedbackStyle.Medium);
          if (currentlyPinned) {
            void unpinMessage(message);
            return;
          }
          void pinMessage(message);
        }}
        onToggleMute={() => {
          triggerActionHaptic(Haptics.ImpactFeedbackStyle.Light);
          handleToggleMute();
        }}
        onReport={(message) => {
          triggerActionHaptic(Haptics.ImpactFeedbackStyle.Medium);
          handleReportMessage(message);
        }}
        onDelete={(message) => {
          triggerActionHaptic(Haptics.ImpactFeedbackStyle.Heavy);
          handleDeleteAction(message);
        }}
      />

      <Modal
        transparent
        visible={editHistoryVisible}
        animationType="fade"
        onRequestClose={closeEditHistory}
      >
        <Pressable style={styles.editHistoryBackdrop} onPress={closeEditHistory} />
        <View style={styles.editHistorySheet}>
          <BlurView
            intensity={34}
            tint={isDark ? 'dark' : 'light'}
            style={styles.editHistoryBlur}
          />
          <View style={styles.editHistoryHeader}>
            <View>
              <Text style={styles.editHistoryTitle}>Edit history</Text>
              <Text style={styles.editHistorySubtitle}>
                {editHistoryMessage
                  ? `${formatDayLabel(editHistoryMessage.timestamp)} ${formatTime(editHistoryMessage.timestamp)}`
                  : 'Message edits'}
              </Text>
            </View>
            <TouchableOpacity onPress={closeEditHistory} style={styles.editHistoryClose}>
              <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.editHistoryContent}>
            {editHistoryMessage ? (
              <View style={styles.editHistoryCard}>
                <View style={styles.editHistoryLabelRow}>
                  <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.tint} />
                  <Text style={styles.editHistoryLabel}>Current</Text>
                </View>
                <Text style={styles.editHistoryText}>{editHistoryMessage.text}</Text>
                <Text style={styles.editHistoryMeta}>
                  {formatDayLabel(editHistoryMessage.timestamp)} {formatTime(editHistoryMessage.timestamp)}
                </Text>
              </View>
            ) : null}
            {editHistoryLoading ? (
              <Text style={styles.editHistoryHint}>Loading edit history...</Text>
            ) : editHistoryEntries.length === 0 ? (
              <Text style={styles.editHistoryEmpty}>No edits recorded yet.</Text>
            ) : (
              editHistoryEntries.map((entry) => {
                const editedAt = new Date(entry.created_at);
                return (
                  <View key={entry.id} style={styles.editHistoryCard}>
                    <View style={styles.editHistoryLabelRow}>
                      <MaterialCommunityIcons name="history" size={14} color={theme.textMuted} />
                      <Text style={styles.editHistoryLabel}>Previous</Text>
                    </View>
                    <Text style={styles.editHistoryText}>{entry.previous_text}</Text>
                    <Text style={styles.editHistoryMeta}>
                      {formatDayLabel(editedAt)} {formatTime(editedAt)}
                    </Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        transparent
        visible={Boolean(viewOnceModalMessage)}
        animationType="fade"
        onRequestClose={closeViewOnceMessage}
      >
        <View style={styles.viewOnceModalBackdrop} />
        <View style={styles.viewOnceFullScreen}>
          {viewOnceDecrypting ? (
            <View style={styles.viewOnceLoading}>
              <ActivityIndicator size="small" color={theme.tint} />
            </View>
          ) : viewOnceMediaUri ? (
            viewOnceModalMessage?.type === 'video' || (viewOnceModalMessage?.encryptedMediaMime || '').includes('video') ? (
              <ChatVideoViewer url={viewOnceMediaUri} visible styles={styles} style={styles.viewOnceMediaVideoFull} />
            ) : (
              <Image source={{ uri: viewOnceMediaUri }} style={styles.viewOnceMediaImageFull} />
            )
          ) : (
            <View style={styles.viewOnceLoading}>
              <Text style={styles.viewOnceModalText}>Unable to load media.</Text>
            </View>
          )}

          <View style={styles.viewOnceOverlayHeader}>
            <TouchableOpacity style={styles.viewOnceHeaderButton} onPress={closeViewOnceMessage}>
              <MaterialCommunityIcons name="chevron-left" size={22} color={Colors.light.background} />
            </TouchableOpacity>
            <View style={styles.viewOnceHeaderBadge}>
              <MaterialCommunityIcons name="shield-lock" size={14} color={Colors.light.background} />
            </View>
          </View>

          <View style={styles.viewOnceOverlayFooter}>
            <TouchableOpacity
              style={styles.viewOnceFooterButton}
              onPress={() => {
                if (viewOnceModalMessage) {
                  openReactionSheet(viewOnceModalMessage);
                }
              }}
            >
              <MaterialCommunityIcons name="emoticon-outline" size={22} color={Colors.light.background} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.viewOnceFooterButton}
              onPress={() => {
                if (viewOnceModalMessage) {
                  replyToMessage(viewOnceModalMessage);
                  closeViewOnceMessage();
                }
              }}
            >
              <MaterialCommunityIcons name="reply-outline" size={22} color={Colors.light.background} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={reportModalVisible}
        animationType="fade"
        onRequestClose={closeReportModal}
      >
        <Pressable style={styles.reportBackdrop} onPress={closeReportModal} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.reportSheet}
        >
          <BlurView
            intensity={40}
            tint={isDark ? 'dark' : 'light'}
            style={styles.reportBlur}
          />
          <View style={styles.reportContent}>
            <Text style={styles.reportTitle}>
              {reportEvidenceMessage ? 'Report message' : `Report ${userName}`}
            </Text>
            <Text style={styles.reportSubtitle}>
              {reportEvidenceMessage
                ? 'This message will be attached privately for Betweener review.'
                : 'Reports are private. Help us understand what happened so Betweener can review it.'}
            </Text>
            {reportEvidenceMessage && reportEvidencePreview ? (
              <View style={styles.reportEvidenceCard}>
                <View style={styles.reportEvidenceIcon}>
                  <MaterialCommunityIcons name="message-alert-outline" size={17} color={theme.tint} />
                </View>
                <View style={styles.reportEvidenceCopy}>
                  <Text style={styles.reportEvidenceLabel}>Message evidence</Text>
                  <Text style={styles.reportEvidenceText} numberOfLines={3}>
                    {reportEvidencePreview}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.reportReasonGrid}>
              {REPORT_REASONS.map((reason) => {
                const isSelected = reportReasonId === reason.id;
                return (
                  <TouchableOpacity
                    key={reason.id}
                    style={[
                      styles.reportReasonChip,
                      isSelected && styles.reportReasonChipActive,
                    ]}
                    onPress={() => setReportReasonId(reason.id)}
                  >
                    <Text
                      style={[
                        styles.reportReasonLabel,
                        isSelected && styles.reportReasonLabelActive,
                      ]}
                    >
                      {reason.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.reportInputWrap}>
              <TextInput
                style={styles.reportInput}
                placeholder="Add details (optional)"
                placeholderTextColor={theme.textMuted}
                value={reportDetails}
                onChangeText={setReportDetails}
                multiline
              />
            </View>
            {!isBlockedByMe ? (
              <TouchableOpacity
                style={[
                  styles.reportBlockOption,
                  reportShouldBlock && styles.reportBlockOptionActive,
                ]}
                onPress={() => setReportShouldBlock((prev) => !prev)}
                activeOpacity={0.85}
              >
                <View style={[
                  styles.reportBlockCheck,
                  reportShouldBlock && styles.reportBlockCheckActive,
                ]}>
                  {reportShouldBlock ? (
                    <MaterialCommunityIcons name="check" size={14} color={Colors.light.background} />
                  ) : null}
                </View>
                <View style={styles.reportBlockCopy}>
                  <Text style={styles.reportBlockTitle}>Also block this member</Text>
                  <Text style={styles.reportBlockText}>
                    They will not be notified, and the chat will move out of your way.
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.reportSubmitButton,
                (!reportReasonId || reportSubmitting) && styles.reportSubmitDisabled,
              ]}
              disabled={!reportReasonId || reportSubmitting}
              onPress={submitReport}
            >
              {reportSubmitting ? (
                <ActivityIndicator size="small" color={Colors.light.background} />
              ) : (
                <Text style={styles.reportSubmitText}>
                  {reportShouldBlock && !isBlockedByMe ? 'Send report & block' : 'Send report'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.reportCancel}
            onPress={closeReportModal}
          >
            <Text style={styles.reportCancelText}>Cancel</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={imageViewerVisible}
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeImageViewer}
      >
        <View style={styles.imageViewerBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeImageViewer}
          />
          {imageViewerUrl && (
            <PinchGestureHandler
              onGestureEvent={onImagePinchEvent}
              onHandlerStateChange={onImagePinchStateChange}
            >
              <Animated.View
                style={[
                  styles.imageViewerImage,
                  { transform: [{ scale: imageScale }] },
                ]}
                onTouchStart={(event) => {
                  imageViewerSwipeStartXRef.current = imageViewerAlbumCount > 1
                    ? event.nativeEvent.pageX
                    : null;
                }}
                onTouchEnd={(event) => {
                  const startX = imageViewerSwipeStartXRef.current;
                  imageViewerSwipeStartXRef.current = null;
                  if (startX === null) return;
                  const delta = event.nativeEvent.pageX - startX;
                  if (Math.abs(delta) < 56) return;
                  moveMediaViewer(delta < 0 ? 1 : -1);
                }}
              >
                <ExpoImage
                  source={{ uri: imageViewerUrl }}
                  style={StyleSheet.absoluteFill}
                  cachePolicy="disk"
                  contentFit="contain"
                  transition={120}
                  onLoadStart={() => {
                    setImageViewerLoading(true);
                    setImageViewerError(false);
                  }}
                  onLoad={() => {
                    setImageViewerLoading(false);
                    setImageViewerError(false);
                  }}
                  onError={() => {
                    setImageViewerLoading(false);
                    setImageViewerError(true);
                  }}
                />
              </Animated.View>
            </PinchGestureHandler>
          )}
          {imageViewerAlbumCount > 1 ? (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.imageViewerCounter,
                  { top: Math.max(insets.top + 17, 25) },
                ]}
              >
                <Text style={styles.imageViewerCounterText}>
                  {imageViewerAlbumIndex + 1} / {imageViewerAlbumCount}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.imageViewerPrevious,
                  imageViewerAlbumIndex === 0 && styles.imageViewerNavigationDisabled,
                ]}
                onPress={() => moveMediaViewer(-1)}
                disabled={imageViewerAlbumIndex === 0}
                accessibilityRole="button"
                accessibilityLabel="Previous photo"
              >
                <MaterialCommunityIcons name="chevron-left" size={30} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.imageViewerNext,
                  imageViewerAlbumIndex >= imageViewerAlbumCount - 1 &&
                    styles.imageViewerNavigationDisabled,
                ]}
                onPress={() => moveMediaViewer(1)}
                disabled={imageViewerAlbumIndex >= imageViewerAlbumCount - 1}
                accessibilityRole="button"
                accessibilityLabel="Next photo"
              >
                <MaterialCommunityIcons name="chevron-right" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            </>
          ) : null}
          {imageViewerLoading ? (
            <View pointerEvents="none" style={styles.imageViewerStatus}>
              <ActivityIndicator size="small" color={Colors.light.background} />
              <Text style={styles.imageViewerStatusText}>Opening photo…</Text>
            </View>
          ) : null}
          {imageViewerError ? (
            <TouchableOpacity style={styles.imageViewerRetry} onPress={retryImageViewer}>
              <MaterialCommunityIcons name="refresh" size={20} color={Colors.light.background} />
              <Text style={styles.imageViewerRetryText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
          {imageViewerSourceRef.current?.message.mediaCaption || imageViewerSourceRef.current?.message.text ? (
            <View
              pointerEvents="none"
              style={[styles.imageViewerCaption, { bottom: Math.max(insets.bottom + 18, 26) }]}
            >
              <Text style={styles.imageViewerCaptionText}>
                {imageViewerSourceRef.current.message.mediaCaption
                  ?? imageViewerSourceRef.current.message.text}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.imageViewerClose, { top: Math.max(insets.top + 10, 18), right: 16 }]}
            onPress={closeImageViewer}
          >
            <MaterialCommunityIcons name="close" size={20} color={Colors.light.background} />
          </TouchableOpacity>
        </View>
      </Modal>

      <ChatImmersiveVideoViewer
        visible={Boolean(videoViewerUrl)}
        uri={videoViewerUrl}
        onClose={closeVideoViewer}
        currentIndex={imageViewerAlbumIndex}
        itemCount={imageViewerAlbumCount}
        caption={imageViewerSourceRef.current?.message.mediaCaption
          ?? imageViewerSourceRef.current?.message.text
          ?? null}
        onPrevious={() => moveMediaViewer(-1)}
        onNext={() => moveMediaViewer(1)}
        onRetry={retryCurrentAlbumViewerItem}
      />

      <ChatDocumentViewer
        visible={Boolean(documentViewer)}
        uri={documentViewer?.uri ?? null}
        title={documentViewer?.title ?? 'Document'}
        readAccessRoot={documentViewer?.readAccessRoot}
        onClose={closeDocumentViewer}
      />

      <Modal
        visible={Boolean(locationViewerMessage?.location)}
        onRequestClose={closeLocationViewer}
        animationType="slide"
      >
        <View style={styles.locationViewerContainer}>
          {locationViewerMessage?.location ? (
            <>
              <MapView
                key={`${locationViewerMessage.location.lat}-${locationViewerMessage.location.lng}`}
                style={StyleSheet.absoluteFill}
                provider={Platform.OS === 'web' ? undefined : PROVIDER_GOOGLE}
                googleMapId={GOOGLE_MAPS_MAP_ID || undefined}
                mapPadding={{ top: 120, right: 20, bottom: 220, left: 20 }}
                customMapStyle={GOOGLE_MAPS_MAP_ID ? undefined : isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
                initialRegion={{
                  latitude: locationViewerMessage.location.lat,
                  longitude: locationViewerMessage.location.lng,
                  latitudeDelta: 0.012,
                  longitudeDelta: 0.012,
                }}
                showsPointsOfInterests
                showsBuildings
              >
                <Marker
                  coordinate={{
                    latitude: locationViewerMessage.location.lat,
                    longitude: locationViewerMessage.location.lng,
                  }}
                  title={locationViewerMessage.location.label}
                  pinColor={theme.tint}
                />
              </MapView>
              <View style={styles.locationViewerHeader}>
                <TouchableOpacity
                  style={styles.locationViewerClose}
                  onPress={closeLocationViewer}
                >
                  <MaterialCommunityIcons name="close" size={20} color={theme.text} />
                </TouchableOpacity>
                <View style={styles.locationViewerText}>
                  <Text style={styles.locationViewerTitle} numberOfLines={1}>
                    {locationViewerMessage.location.label}
                  </Text>
                  {locationViewerMessage.location.address ? (
                    <Text style={styles.locationViewerSubtitle} numberOfLines={1}>
                      {locationViewerMessage.location.address}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.locationViewerFooter}>
                {locationViewerMessage.location.live && (
                  <View style={styles.locationViewerLiveRow}>
                    <View style={styles.locationLiveBadge}>
                      <Text style={styles.locationLiveBadgeText}>Live</Text>
                    </View>
                    <Text style={styles.locationLiveText}>
                      {formatRemainingTime(locationViewerMessage.location.expiresAt, nowTick)}
                    </Text>
                    {locationViewerMessage.senderId === user?.id &&
                      locationViewerMessage.location.expiresAt &&
                      locationViewerMessage.location.expiresAt.getTime() > nowTick && (
                        <TouchableOpacity
                          style={styles.locationStopButton}
                          onPress={() => stopLiveSharing(locationViewerMessage.id)}
                        >
                          <Text style={styles.locationStopText}>Stop sharing</Text>
                        </TouchableOpacity>
                      )}
                  </View>
                )}
                <TouchableOpacity
                  style={styles.locationViewerAction}
                  onPress={() => {
                    const link = locationViewerMessage.location.mapLink || buildMapsLink(locationViewerMessage.location.lat, locationViewerMessage.location.lng);
                    Linking.openURL(link);
                  }}
                >
                  <MaterialCommunityIcons name="directions" size={18} color={theme.text} />
                  <Text style={styles.locationViewerActionText}>Open in Maps</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={locationModalVisible}
        onRequestClose={closeLocationModal}
        animationType="slide"
      >
        <View style={styles.locationModalContainer}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={Platform.OS === 'web' ? undefined : PROVIDER_GOOGLE}
            googleMapId={GOOGLE_MAPS_MAP_ID || undefined}
            mapPadding={{ top: 160, right: 20, bottom: 320, left: 20 }}
            customMapStyle={GOOGLE_MAPS_MAP_ID ? undefined : isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
            initialRegion={mapInitialRegion}
            onPress={handleMapPress}
            showsUserLocation={locationStatus === 'granted'}
            showsMyLocationButton={locationStatus === 'granted'}
            showsPointsOfInterests
            showsBuildings
          >
            {selectedPlace && (
              <Marker
                coordinate={{ latitude: selectedPlace.lat, longitude: selectedPlace.lng }}
                title={selectedPlace.name}
                pinColor={theme.tint}
              />
            )}
          </MapView>

          <Animated.View
            style={[
              styles.locationTopBar,
              {
                opacity: locationSheetAnim,
                transform: [
                  {
                    translateY: locationSheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-12, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <BlurView
              intensity={45}
              tint={isDark ? 'dark' : 'light'}
              style={styles.locationGlass}
              pointerEvents="none"
            />
            <View style={styles.locationTopContent}>
              <TouchableOpacity
                style={styles.locationTopButton}
                onPress={closeLocationModal}
              >
                <MaterialCommunityIcons name="chevron-left" size={22} color={theme.text} />
              </TouchableOpacity>
              <View>
                <Text style={styles.locationTopTitle}>Share location</Text>
                <Text style={styles.locationTopSubtitle}>Pick a place to send</Text>
              </View>
              <View style={styles.locationTopSpacer} />
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.locationSearchWrap,
              {
                opacity: locationSheetAnim,
                transform: [
                  {
                    translateY: locationSheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-6, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <BlurView
              intensity={45}
              tint={isDark ? 'dark' : 'light'}
              style={styles.locationGlass}
              pointerEvents="none"
            />
            <View style={styles.locationSearchContent}>
              <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
              <TextInput
                style={styles.locationSearchInput}
                placeholder="Search places"
                placeholderTextColor={theme.textMuted}
                value={locationSearchQuery}
                onChangeText={setLocationSearchQuery}
              />
              {searchLoading ? (
                <ActivityIndicator size="small" color={theme.textMuted} />
              ) : locationSearchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setLocationSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </Animated.View>

          {locationSuggestions.length > 0 && (
            <View style={styles.locationSuggestionsPanel}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {locationSuggestions.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion.id}
                    style={styles.locationSuggestionRow}
                    onPress={() => handleSuggestionPress(suggestion)}
                  >
                    <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.textMuted} />
                    <View style={styles.locationSuggestionText}>
                      <Text style={styles.locationSuggestionTitle}>{suggestion.primary}</Text>
                      {suggestion.secondary ? (
                        <Text style={styles.locationSuggestionSubtitle}>{suggestion.secondary}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <Animated.View
            style={[
              styles.locationBottomSheet,
              {
                opacity: locationSheetAnim,
                transform: [
                  {
                    translateY: locationSheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [40, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <BlurView
              intensity={55}
              tint={isDark ? 'dark' : 'light'}
              style={styles.locationGlass}
              pointerEvents="none"
            />
            <View style={styles.locationSheetContent}>
              <View style={styles.locationSheetHandle} />
              <View style={styles.locationSelectedRow}>
              <Text style={styles.locationSectionTitle}>Selected</Text>
              <Text style={styles.locationSelectedValue} numberOfLines={1}>
                {selectedPlace?.name || 'Tap the map or search'}
              </Text>
              {selectedPlace?.address ? (
                <Text style={styles.locationSelectedSubtitle} numberOfLines={1}>
                  {selectedPlace.address}
                </Text>
              ) : null}
              </View>

              <View style={styles.locationNearbyRow}>
                <View style={styles.locationNearbyHeader}>
                  <Text style={styles.locationSectionTitle}>Nearby</Text>
                  {placesLoading ? (
                    <ActivityIndicator size="small" color={theme.textMuted} />
                  ) : null}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {nearbyPlaces.map((place) => (
                    <TouchableOpacity
                      key={place.id}
                      style={styles.locationNearbyCard}
                      onPress={() => selectPlace(place)}
                    >
                      <View style={styles.locationNearbyIcon}>
                        <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.tint} />
                      </View>
                      <View style={styles.locationNearbyMeta}>
                        <Text style={styles.locationNearbyName} numberOfLines={1}>
                          {place.name}
                        </Text>
                        {place.address ? (
                          <Text style={styles.locationNearbyAddress} numberOfLines={1}>
                            {place.address}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                  {!hasPlacesKey && (
                    <View style={styles.locationNearbyCard}>
                      <View style={styles.locationNearbyIcon}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={16} color={theme.textMuted} />
                      </View>
                      <View style={styles.locationNearbyMeta}>
                        <Text style={styles.locationNearbyName}>Add Google Maps key</Text>
                        <Text style={styles.locationNearbyAddress}>Places search disabled</Text>
                      </View>
                    </View>
                  )}
                </ScrollView>
              </View>

              <View style={styles.locationLiveSection}>
                <Text style={styles.locationSectionTitle}>Live location</Text>
                <View style={styles.locationPresetRow}>
                  {LIVE_LOCATION_PRESETS.map((preset) => (
                    <TouchableOpacity
                      key={preset}
                      style={[
                        styles.locationPresetChip,
                        liveDurationMinutes === preset && styles.locationPresetChipActive,
                      ]}
                      onPress={() => setLiveDurationMinutes(preset)}
                    >
                      <Text
                        style={[
                          styles.locationPresetText,
                          liveDurationMinutes === preset && styles.locationPresetTextActive,
                        ]}
                      >
                        {preset === 60
                          ? '1 hour'
                          : preset === 480
                          ? '8 hours'
                          : `${preset} min`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.locationLiveHint}>
                  Remaining time is always visible and you can stop sharing anytime.
                </Text>
              </View>

              {locationError ? (
                <Text style={styles.locationErrorText}>{locationError}</Text>
              ) : null}

              <View style={styles.locationActionRow}>
                <TouchableOpacity
                  style={styles.locationGhostButton}
                  onPress={handleSendLocation}
                >
                  <MaterialCommunityIcons name="map-marker-outline" size={18} color={theme.text} />
                  <Text style={styles.locationGhostText}>Send pin</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.locationPrimaryButton}
                  onPress={handleSendLiveLocation}
                >
                  <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={Colors.light.background} />
                  <Text style={styles.locationPrimaryText}>Share live</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>

          {showLocationLoading && (
            <View style={styles.locationLoadingOverlay}>
              <ActivityIndicator size="large" color={theme.tint} />
              <Text style={styles.locationLoadingText}>Finding your location...</Text>
            </View>
          )}
        </View>
      </Modal>

      {momentViewerVisible && momentUsersWithContent.length > 0 ? (
        <MomentViewer
          visible={momentViewerVisible}
          users={momentUsersWithContent}
          startUserId={momentViewerUserId}
          onMomentViewed={(momentId) => {
            const normalizedMomentId = String(momentId || "").trim();
            if (!normalizedMomentId) return;
            setViewedMomentIds((prev) => {
              if (prev.has(normalizedMomentId)) return prev;
              const next = new Set(prev);
              next.add(normalizedMomentId);
              return next;
            });
            setViewedMomentIdsReady(true);
          }}
          onClose={handleCloseMomentViewer}
        />
      ) : null}

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {showJumpToBottom && !showThreadBootstrapLoader && (
          <Pressable
            style={[
              styles.jumpToBottomButton,
              {
                bottom:
                  (replyingTo ? 140 : 96) +
                  (keyboardInset ? Math.max(0, keyboardInset - 12) : 0),
              },
            ]}
            onPress={() => {
              shouldAutoScrollRef.current = true;
              maybeScrollToEnd(true);
            }}
          >
            <MaterialCommunityIcons name="chevron-down" size={20} color={Colors.light.background} />
          </Pressable>
        )}
        {showThreadBootstrapLoader ? (
          <View style={styles.threadBootstrapLoader}>
            <ActivityIndicator size="small" color={theme.tint} />
          </View>
        ) : (
          <>
            <ChatMessageList
              routeKey={routeId}
              listRef={flatListRef}
              messages={renderedMessages}
              renderItem={renderMessage}
              getItemType={getMessageItemType}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.messagesList}
              header={renderLoadEarlier}
              empty={null}
              onScroll={handleScroll}
              onStartReached={handleStartReached}
              onContentSizeChange={handleMessagesContentSizeChange}
              onLayout={handleMessagesLayout}
              onScrollBeginDrag={onScrollBeginDrag}
              onScrollEndDrag={onScrollEndDrag}
              onMomentumScrollBegin={onMomentumScrollBegin}
              onMomentumScrollEnd={onMomentumScrollEnd}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={messageListViewabilityConfig}
            />

            {renderTypingIndicator()}
          </>
        )}
        {renderMoodStickersPanel()}

        {mediaUploadStatus ? (
          <View style={styles.mediaUploadNotice}>
            <View style={styles.mediaUploadIcon}>
              <MaterialCommunityIcons name={mediaUploadStatus.icon} size={17} color={theme.tint} />
            </View>
            <View style={styles.mediaUploadCopy}>
              <Text style={styles.mediaUploadTitle}>{mediaUploadStatus.title}</Text>
              <Text style={styles.mediaUploadSubtitle}>{mediaUploadStatus.subtitle}</Text>
            </View>
            <ActivityIndicator size="small" color={theme.tint} />
          </View>
        ) : null}

        {!needsRouteIdentityResolution ? (
          <ChatComposer
            styles={styles}
            theme={theme}
            isDark={isDark}
            inputRef={inputRef}
            inputText={inputText}
            onChangeText={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholderTextColor={withAlpha(theme.textMuted, isDark ? 0.66 : 0.72)}
            isRecording={isRecording}
            isVoicePreviewReady={isVoicePreviewReady}
            isVoicePreviewPlaying={isVoicePreviewPlaying}
            isUploadingVoice={isUploadingVoice}
            recordingDuration={recordingDuration}
            voiceButtonScale={voiceButtonScale}
            recordingAnimation={recordingAnimation}
            showImagePicker={showImagePicker}
            showMoodStickers={showMoodStickers}
            isInputFocused={isInputFocused}
            replyingTo={replyingTo}
            editingMessage={editingMessage}
            isChatBlocked={isChatBlocked}
            isBlockedByMe={isBlockedByMe}
            onConfirmUnblock={confirmUnblockUser}
            onCancelReply={cancelReply}
            onCancelEdit={cancelEdit}
            onToggleAttachment={toggleComposerAttachmentSheet}
            onToggleMoodStickers={toggleComposerMoodStickers}
            onStartVoiceRecording={startVoiceRecording}
            onDiscardVoiceRecording={discardVoiceRecording}
            onFinishVoiceRecording={finishVoiceRecording}
            onToggleVoicePreview={toggleVoicePreview}
            onSendVoiceRecording={sendVoiceRecording}
            onSendMessage={sendMessage}
          />
        ) : null}

        {/* Image Picker Actions */}
        {showImagePicker && (
          <Animated.View
            pointerEvents={showImagePicker ? "auto" : "none"}
            style={[
              styles.attachmentSheet,
              {
                opacity: attachmentAnim,
                transform: [
                  {
                    translateY: attachmentAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [attachmentSheetHeight + insets.bottom + 24, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <BlurView
              pointerEvents="none"
              intensity={40}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.attachmentHandle} />
            <View style={styles.imagePickerHeader}>
              <Text style={styles.imagePickerTitle}>Share</Text>
              <TouchableOpacity
                style={styles.imagePickerClose}
                onPress={closeAttachmentSheet}
              >
                <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.attachmentSheetScroll}
              contentContainerStyle={styles.attachmentSheetContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                style={[
                  styles.viewOnceAttachmentRow,
                  viewOnceMode && styles.viewOnceAttachmentRowActive,
                ]}
                onPress={async () => {
                  Haptics.selectionAsync().catch(() => {});
                  if (!viewOnceMode) {
                    const keys = await ensureViewOnceKeys();
                    if (!keys) return;
                  }
                  setViewOnceMode((prev) => !prev);
                }}
              >
                <View style={styles.viewOnceAttachmentLeft}>
                  <View
                    style={[
                      styles.viewOnceAttachmentIcon,
                      viewOnceMode && styles.viewOnceAttachmentIconActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={viewOnceMode ? 'shield-lock' : 'shield-lock-outline'}
                      size={18}
                      color={viewOnceMode ? Colors.light.background : theme.textMuted}
                    />
                  </View>
                  <View>
                    <Text style={styles.viewOnceAttachmentTitle}>View once (encrypted)</Text>
                    <Text style={styles.viewOnceAttachmentSubtitle}>Only for photos & videos</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.viewOnceAttachmentToggle,
                    viewOnceMode && styles.viewOnceAttachmentToggleActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={viewOnceMode ? 'lock' : 'lock-open-variant'}
                    size={16}
                    color={viewOnceMode ? Colors.light.background : theme.textMuted}
                  />
                </View>
              </TouchableOpacity>

              <View style={styles.imagePickerGrid}>
                <TouchableOpacity
                  style={styles.imagePickerOption}
                  onPress={handleCameraPress}
                >
                  <View style={styles.imagePickerIcon}>
                    <MaterialCommunityIcons name="camera-outline" size={22} color={theme.tint} />
                  </View>
                  {viewOnceMode && (
                    <View style={styles.viewOnceMediaBadge}>
                      <MaterialCommunityIcons name="lock" size={12} color={Colors.light.background} />
                      <Text style={styles.viewOnceMediaBadgeText}>Once</Text>
                    </View>
                  )}
                  <Text style={styles.imagePickerLabel}>Camera</Text>
                  <Text style={styles.imagePickerSubLabel}>Photo & video</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.imagePickerOption}
                  onPress={handleLibraryPress}
                >
                  <View style={styles.imagePickerIcon}>
                    <MaterialCommunityIcons name="image-multiple-outline" size={22} color={theme.tint} />
                  </View>
                  {viewOnceMode && (
                    <View style={styles.viewOnceMediaBadge}>
                      <MaterialCommunityIcons name="lock" size={12} color={Colors.light.background} />
                      <Text style={styles.viewOnceMediaBadgeText}>Once</Text>
                    </View>
                  )}
                  <Text style={styles.imagePickerLabel}>Photos</Text>
                  <Text style={styles.imagePickerSubLabel}>Library</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.imagePickerOption}
                  onPress={handleDocumentPress}
                >
                  <View style={styles.imagePickerIcon}>
                    <MaterialCommunityIcons name="file-document-outline" size={22} color={theme.tint} />
                  </View>
                  <Text style={styles.imagePickerLabel}>Documents</Text>
                  <Text style={styles.imagePickerSubLabel}>Files & media</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.imagePickerOption}
                  onPress={handleLocationPress}
                >
                  <View style={styles.imagePickerIcon}>
                    <MaterialCommunityIcons name="map-marker-outline" size={22} color={theme.tint} />
                  </View>
                  <Text style={styles.imagePickerLabel}>Location</Text>
                  <Text style={styles.imagePickerSubLabel}>Send a pin</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        )}
      </KeyboardAvoidingView>

    </ChatThreadView>
  );
}
