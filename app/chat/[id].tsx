import MomentViewer from "@/components/MomentViewer";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatFailedRetryHint from "@/components/chat/ChatFailedRetryHint";
import ChatMessageActionsSheet from "@/components/chat/ChatMessageActionsSheet";
import ChatMessageBubblePressable from "@/components/chat/ChatMessageBubblePressable";
import ChatQuickReactionsBar from "@/components/chat/ChatQuickReactionsBar";
import ChatReactionSummarySheet from "@/components/chat/ChatReactionSummarySheet";
import ChatSafetyModal from "@/components/chat/ChatSafetyModal";
import {
  DocumentMessageContent,
  LocationMessageContent,
  MediaMessageContent,
  VoiceMessageContent,
} from "@/components/chat/message-variants";
import { getReceiptIconState } from "@/components/chat/message-variants/shared";
import type { DatePlanResponseKind, DatePlanStatus, MessageType } from "@/components/chat/types";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useMoments } from "@/hooks/useMoments";
import { useAuth } from "@/lib/auth-context";
import { clearActiveChatThread, setActiveChatThread } from "@/lib/chat/active-thread";
import { ChatThreadActionsService } from "@/lib/chat/chat-thread-actions-service";
import { validateChatAttachment } from "@/lib/chat/attachment-policy";
import { acknowledgeIncomingMessagesDelivered } from "@/lib/chat/delivery-receipts";
import { useChatMessages } from "@/lib/chat/hooks/use-chat-messages";
import { useChatThreadBrowseUi } from "@/lib/chat/hooks/use-chat-thread-browse-ui";
import { useChatThreadMessageUi } from "@/lib/chat/hooks/use-chat-thread-message-ui";
import { useChatThreadScreenUi } from "@/lib/chat/hooks/use-chat-thread-screen-ui";
import { useChatThreadStateSync } from "@/lib/chat/hooks/use-chat-thread-state-sync";
import { useChatThreadLocalState } from "@/lib/chat/hooks/use-chat-thread-local-state";
import { ChatRepository, type ChatMessageRow, type ChatPendingOutboxRow } from "@/lib/chat/local/chat-db";
import { ChatThreadRemoteService } from "@/lib/chat/chat-thread-remote-service";
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
  replaceMessageById,
  setMessageStatus,
} from "@/lib/chat/message-state";
import { preserveUnchangedMessageReferences } from "@/lib/chat/message-list-reconciliation";
import {
  buildRetryFailedTextPayload,
  canRetryFailedTextMessage,
  CHAT_READ_RECEIPT_DELAY_MS,
  createDatePlanDraftFromInvite,
  type DatePlannerMode,
  getDatePlanUiState,
  getRetryFailedTextFailureStatus,
  markLoadedIncomingMessagesRead,
  resolveDatePlanResponseKind,
  shouldScheduleMessageRead,
} from "@/lib/chat/thread-behavior";
import { ChatOutboxService } from "@/lib/chat/outbox/chat-outbox-service";
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
import { resolveChatImageUri, resolveChatVideoUri } from "@/lib/chat/media-uri";
import { encryptMediaBytes, getOrCreateDeviceKeypair } from "@/lib/e2ee";
import { decideIntentRequestOfflineSafe } from "@/lib/intents/offline-actions";
import { computeConversationSignalLabel, computeFirstReplyHours, computeInterestOverlapRatio } from "@/lib/match/match-score";
import { Motion } from "@/lib/motion";
import { isLikelyNetworkError } from "@/lib/network";
import {
  getAuthoritativePresenceDisplay,
  getChatThreadPresenceKind,
  resolveLatestPeerActivityAt,
} from "@/lib/presence";
import { fetchViewedMomentIds } from "@/lib/moments-views";
import { cacheOfflineImage, getOfflineImageUri, rememberOfflineImageUri } from "@/lib/offline/image-store";
import {
  buildChatPeerStoreKey,
  buildChatThreadStoreKey,
  migrateLegacyChatThreadSnapshot,
  peekOfflineSnapshot,
  readOfflineSnapshot,
  subscribeOfflineSnapshot,
  stageOfflineChatUpload,
  writeOfflineSnapshot,
} from "@/lib/offline/chat-store";
import {
  enqueueChatReactionSyncMutation,
} from "@/lib/offline/mutation-queue";
import { cacheOfflineVideo, getOfflineVideoUri, rememberOfflineVideoUri } from "@/lib/offline/video-store";
import { showOpenSettingsPrompt } from "@/lib/permission-prompts";
import { getSafeRemoteImageUri, getUserFacingDisplayName, hasLeftBetweener } from "@/lib/profile/display-name";
import { type ResponsiveMetrics, useResponsiveMetrics } from "@/lib/responsive";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/supabase/types/database";
import { fetchUserPresence } from "@/lib/user-presence";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from "@react-native-community/netinfo";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useEvent } from "expo";
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
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import type { ComponentProps, ReactNode } from "react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import RNSvg, { Path } from "react-native-svg";
import { WebView } from "react-native-webview";
import { useScopedScreenAwake } from "@/hooks/use-scoped-screen-awake";

const ATTACHMENT_SHEET_MIN_HEIGHT = 300;
const ATTACHMENT_SHEET_MAX_HEIGHT = 420;
const ATTACHMENT_SHEET_SCREEN_RATIO = 0.46;
const CHAT_MEDIA_BUCKET = 'chat-media';
const LOCATION_TEXT_PREFIX = '\u{1F4CD}';
const LOCATION_LIVE_PREFIX = 'LIVE:';
const CHAT_BUBBLE_TAIL_PATH = "M1.2 2.4 C3.6 2.1 6.9 3.1 9.6 5.1 C12.1 6.9 13.7 9.3 14.2 12.2 C11.4 11.3 8.5 11.8 5.3 13.7 C2.9 12.6 1.4 10.6 1.1 7.9 Z";
const DATE_PLAN_TEXT_PREFIX = 'date_plan::';
const GOOGLE_MAPS_NATIVE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_WEB_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY || GOOGLE_MAPS_NATIVE_API_KEY;
const GOOGLE_MAPS_MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID;
const LOCATION_PREVIEW_HEIGHT = 164;
const LIVE_LOCATION_PRESETS = [15, 60, 480] as const;
const FALLBACK_BETWEENER_DATE_PICKS = [
  {
    id: 'fallback-betweener-mikline-kumasi',
    name: 'Mikline Hotel Restaurant Kumasi',
    address: 'Kumasi, Ghana',
    city: 'Kumasi',
    lat: 6.6885,
    lng: -1.6244,
    source: 'betweener_pick',
    badges: ['Betweener Safe Venue', 'Betweener Discount', 'First-date surprise'],
    summary: 'A calm dinner setting with Betweener-ready service.',
    venueId: null,
    metadata: {
      date_vibe: 'Calm dinner energy',
      planning_support: true,
      trust_reasons: ['Well-lit setting', 'Partner-aware team', 'Easy-to-find arrival'],
      concierge_services: ['Reserve venue', 'Arrange surprise touch', 'Safer meetup support'],
    },
  },
  {
    id: 'fallback-betweener-mikline-accra',
    name: 'Mikline Hotel Restaurant Accra',
    address: 'Accra, Ghana',
    city: 'Accra',
    lat: 5.6037,
    lng: -0.187,
    source: 'betweener_pick',
    badges: ['Betweener Safe Venue', 'Betweener Discount', 'First-date surprise'],
    summary: 'An easy city meet-up with a polished first-date feel.',
    venueId: null,
    metadata: {
      date_vibe: 'Polished city meet-up',
      planning_support: true,
      trust_reasons: ['Central public location', 'Smooth first-date arrival', 'Comfortable social setting'],
      concierge_services: ['Reserve venue', 'Arrange surprise touch', 'Safer meetup support'],
    },
  },
] as const;
const CONCIERGE_SERVICE_OPTIONS = [
  {
    id: 'reserve_venue',
    title: 'Reserve venue',
    description: 'Ask Betweener to help lock the place and timing in.',
  },
  {
    id: 'surprise_touch',
    title: 'Arrange surprise',
    description: 'Add a small premium surprise to the plan.',
  },
  {
    id: 'safer_meetup',
    title: 'Safer meetup',
    description: 'Ask for a safer arrival or meetup recommendation.',
  },
] as const;
const REPORT_REASONS = [
  { id: 'spam', label: 'Spam' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'other', label: 'Other' },
];
const BLOCKED_AVATAR_SOURCE = require('../../assets/images/circle-logo.png');
const BLOCKED_BY_ME = 'blocked_by_me';
const BLOCKED_BY_THEM = 'blocked_me';
const HEADER_HINT_STORAGE_KEY = 'chat_header_longpress_hint_v1';
const CHAT_PREFS_STORAGE_KEY = 'chat_header_prefs_v1';
const CHAT_SAFETY_SEEN_KEY = 'chat_safety_seen_v2';
const MESSAGE_SELECT_FIELDS = 'id,client_message_id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,audio_path,audio_duration,audio_waveform,deleted_for_all,deleted_at,deleted_by,edited_at,reply_to_message_id,is_view_once,encrypted_media,encrypted_media_path,encrypted_key_sender,encrypted_key_receiver,encrypted_key_nonce,encrypted_media_nonce,encrypted_media_alg,encrypted_media_mime,encrypted_media_size,storage_path';
const MAP_STYLE_LIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#F3E5D8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5F706C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F7ECE2' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#DCCFC2' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#4FA7A3' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E2EDE7' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#E8D9CB' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#DCCFC2' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#E6D8CB' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DDE4E1' }] },
];
const MAP_STYLE_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#0F1A1A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9CB3AE' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#152222' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1F2C2C' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#5BC1BB' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#142525' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1A2B2B' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1F2C2C' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#142020' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0B1414' }] },
];
const PICKER_MEDIA_TYPES_ALL: ImagePicker.MediaType[] = ['images', 'videos'];
const CHAT_MEDIA_UPLOAD_RETRIES = 2;
const CHAT_MEDIA_UPLOAD_RETRY_DELAY_MS = 900;
const DURABLE_CHAT_OUTBOX_MAX_ATTEMPTS = 48;

const getLegacyChatMediaStoragePath = (url?: string | null) => {
  if (!url) return null;
  const markers = [
    '/storage/v1/object/public/chat-media/',
    '/storage/v1/object/sign/chat-media/',
  ];
  for (const marker of markers) {
    const markerIndex = url.indexOf(marker);
    if (markerIndex < 0) continue;
    const encodedPath = url.slice(markerIndex + marker.length).split('?')[0];
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  }
  return null;
};

const encodeStoragePath = (path: string) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableUploadError = (error: unknown) => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  const status = Number((error as any)?.status || (error as any)?.statusCode || 0);
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('abort') ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
};

const getAttachmentUploadErrorMessage = (error: unknown) => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  if (message.includes('timeout') || message.includes('network')) {
    return 'The upload timed out. Try again on a stronger connection or send a smaller video.';
  }
  return 'Unable to upload this file.';
};

// Message type definition
type BetweenerVenueRow = Database["public"]["Tables"]["betweener_venues"]["Row"];
type DatePlanRow = Database["public"]["Tables"]["date_plans"]["Row"];
type CachedMessageType = Omit<
  MessageType,
  "timestamp" | "readAt" | "deletedAt" | "editedAt" | "replyTo" | "location" | "dateInvite"
> & {
  timestamp: string;
  readAt?: string;
  deletedAt?: string | null;
  editedAt?: string | null;
  location?: Omit<NonNullable<MessageType["location"]>, "expiresAt"> & {
    expiresAt?: string | null;
  };
  dateInvite?: Omit<NonNullable<MessageType["dateInvite"]>, "scheduledFor"> & {
    scheduledFor: string;
  };
};

type MessageRow = {
  id: string;
  client_message_id?: string | null;
  text: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
  delivered_at: string | null;
  message_type?: MessageType['type'];
  audio_path?: string | null;
  audio_duration?: number | null;
  audio_waveform?: number[] | string | null;
  deleted_for_all?: boolean | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  reply_to_message_id?: string | null;
  edited_at?: string | null;
  is_view_once?: boolean | null;
  encrypted_media?: boolean | null;
  encrypted_media_path?: string | null;
  encrypted_key_sender?: string | null;
  encrypted_key_receiver?: string | null;
  encrypted_key_nonce?: string | null;
  encrypted_media_nonce?: string | null;
  encrypted_media_alg?: string | null;
  encrypted_media_mime?: string | null;
  encrypted_media_size?: number | null;
  storage_path?: string | null;
};

const serializeCachedMessages = (messages: MessageType[]): CachedMessageType[] =>
  (messages || []).map((message) => ({
    ...message,
    timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date().toISOString(),
    readAt: message.readAt instanceof Date ? message.readAt.toISOString() : undefined,
    deletedAt: message.deletedAt instanceof Date ? message.deletedAt.toISOString() : (message.deletedAt ?? null),
    editedAt: message.editedAt instanceof Date ? message.editedAt.toISOString() : (message.editedAt ?? null),
    location: message.location
      ? {
          ...message.location,
          expiresAt: message.location.expiresAt instanceof Date
            ? message.location.expiresAt.toISOString()
            : (message.location.expiresAt ?? null),
        }
      : undefined,
    dateInvite: message.dateInvite
      ? {
          ...message.dateInvite,
          scheduledFor:
            message.dateInvite.scheduledFor instanceof Date
              ? message.dateInvite.scheduledFor.toISOString()
              : new Date().toISOString(),
        }
      : undefined,
    replyTo: undefined,
  }));

const deserializeCachedMessages = (raw: unknown): MessageType[] => {
  if (!Array.isArray(raw)) return [];
  return (raw as CachedMessageType[]).map((message) => ({
    ...message,
    timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
    readAt: message.readAt ? new Date(message.readAt) : undefined,
    deletedAt: message.deletedAt ? new Date(message.deletedAt) : null,
    editedAt: message.editedAt ? new Date(message.editedAt) : null,
    location: message.location
      ? {
          ...message.location,
          expiresAt: message.location.expiresAt ? new Date(message.location.expiresAt) : null,
        }
      : undefined,
    dateInvite: message.dateInvite
      ? {
          ...message.dateInvite,
          scheduledFor: message.dateInvite.scheduledFor
            ? new Date(message.dateInvite.scheduledFor)
            : new Date(),
        }
      : undefined,
    replyTo: undefined,
  }));
};

const safeJsonStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const normalizeLocalChatMessageType = (type: MessageType['type']): ChatMessageRow['message_type'] => {
  switch (type) {
    case 'voice':
    case 'image':
    case 'video':
    case 'document':
    case 'location':
    case 'date_plan':
    case 'mood_sticker':
    case 'system':
      return type;
    default:
      return 'text';
  }
};

const normalizeLocalChatMessageStatus = (status: MessageType['status']): ChatMessageRow['status'] => {
  switch (status) {
    case 'sending':
      return 'sending';
    case 'queued':
      return 'pending';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    case 'sent':
    default:
      return 'sent';
  }
};

const chatMessageToLocalRow = (
  ownerUserId: string,
  threadId: string,
  message: MessageType,
): ChatMessageRow => {
  const createdAt = message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date().toISOString();
  const localStatus: ChatMessageRow['status'] = message.deletedForAll
    ? 'deleted'
    : normalizeLocalChatMessageStatus(message.status);
  const serialized = serializeCachedMessages([message])[0] ?? null;
  const localId = message.clientMessageId ?? (String(message.id).startsWith('temp-') ? String(message.id) : null);
  return {
    id: String(message.id),
    local_id: localId,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    sender_user_id: String(message.senderId || ''),
    receiver_user_id: message.senderId === ownerUserId ? threadId : ownerUserId,
    body: typeof message.text === 'string' ? message.text : null,
    message_type: normalizeLocalChatMessageType(message.type),
    status: localStatus,
    direction: message.senderId === ownerUserId ? 'outgoing' : 'incoming',
    created_at: createdAt,
    server_created_at: String(message.id).startsWith('temp-') ? null : createdAt,
    edited_at: message.editedAt instanceof Date ? message.editedAt.toISOString() : null,
    deleted_at: message.deletedAt instanceof Date ? message.deletedAt.toISOString() : (message.deletedForAll ? createdAt : null),
    reply_to_message_id: message.replyToId ? String(message.replyToId) : null,
    is_view_once: message.isViewOnce ? 1 : 0,
    local_only: localStatus === 'pending' || localStatus === 'sending' || localStatus === 'failed' ? 1 : 0,
    error_code: localStatus === 'failed' ? 'send_failed' : null,
    metadata_json: safeJsonStringify(serialized),
    remote_updated_at: String(message.id).startsWith('temp-') ? null : createdAt,
    local_updated_at: new Date().toISOString(),
  };
};

const localRowToChatMessage = (row: ChatMessageRow): MessageType => {
  const structuredStatus: MessageType['status'] =
    row.status === 'pending' ? 'queued' : row.status === 'deleted' ? 'sent' : row.status;

  if (row.metadata_json) {
    try {
      const hydrated = deserializeCachedMessages([JSON.parse(row.metadata_json)])[0];
      if (hydrated) {
        return {
          ...hydrated,
          status: structuredStatus,
          deletedForAll: row.status === 'deleted',
          deletedAt: row.deleted_at ? new Date(row.deleted_at) : hydrated.deletedAt ?? null,
          editedAt: row.edited_at ? new Date(row.edited_at) : hydrated.editedAt ?? null,
          replyToId: row.reply_to_message_id ?? hydrated.replyToId ?? undefined,
        };
      }
    } catch {
      // Fall back to the structured columns below.
    }
  }

  return {
    id: row.id,
    clientMessageId: row.local_id,
    text: row.body ?? '',
    senderId: row.sender_user_id,
    timestamp: new Date(row.created_at),
    type: row.message_type === 'audio' ? 'voice' : (row.message_type as MessageType['type']),
    reactions: [],
    status: structuredStatus,
    deletedForAll: row.status === 'deleted',
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    isViewOnce: row.is_view_once === 1,
    replyToId: row.reply_to_message_id,
  };
};

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

const buildMediaOutboxRow = ({
  ownerUserId,
  threadId,
  message,
  localUri,
  fileName,
  contentType,
  mediaType,
  documentSizeLabel,
  documentTypeLabel,
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
        replyToMessageId: message.replyToId ?? null,
        documentName: mediaType === 'document' ? fileName : null,
        documentSizeLabel: documentSizeLabel ?? null,
        documentTypeLabel: documentTypeLabel ?? null,
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

const mergeIncrementalFetchedMessages = (
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
const QUICK_REACTIONS = ['\u2764\uFE0F', '\u{1F602}', '\u{1F60D}', '\u{1F44D}', '\u{1F525}', '\u{1F44F}'];

const DEFAULT_VOICE_WAVEFORM = [0.2, 0.5, 0.35, 0.6, 0.28, 0.72, 0.44, 0.68, 0.3, 0.55, 0.4, 0.65];
const VIDEO_TEXT_PREFIX = '\u{1F3A5} Video';
const DOCUMENT_TEXT_PREFIX = '\u{1F4CE}';
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

const formatDateInviteWhen = (date: Date) =>
  `${date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} at ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;

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

const getMessageLocalObserverKey = (message: MessageType) =>
  [
    message.id,
    message.clientMessageId ?? '',
    message.text,
    message.senderId,
    message.timestamp.getTime(),
    message.type,
    message.status ?? '',
    message.deletedForAll ? 'deleted' : 'active',
    message.deletedAt?.getTime() ?? 0,
    message.editedAt?.getTime() ?? 0,
    message.replyToId ?? '',
    message.imageUrl ?? '',
    message.videoUrl ?? '',
    message.document?.url ?? '',
    message.location ? `${message.location.lat}:${message.location.lng}:${message.location.label}` : '',
    message.dateInvite?.planId ?? '',
    message.reactions?.map((reaction) => `${reaction.userId}:${reaction.emoji}`).join(',') ?? '',
  ].join('\u001f');

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

type DateBadgeTone = 'safe' | 'discount' | 'surprise' | 'nearby' | 'area' | 'concierge' | 'default';

const getDateBadgeMeta = (badge: string) => {
  const normalized = badge.trim().toLowerCase();
  if (normalized.includes('safe venue')) return { icon: 'shield-check-outline' as const, tone: 'safe' as DateBadgeTone };
  if (normalized.includes('discount')) return { icon: 'ticket-percent-outline' as const, tone: 'discount' as DateBadgeTone };
  if (normalized.includes('surprise')) return { icon: 'party-popper' as const, tone: 'surprise' as DateBadgeTone };
  if (normalized.includes('nearby')) return { icon: 'map-marker-radius-outline' as const, tone: 'nearby' as DateBadgeTone };
  if (normalized.includes('their area')) return { icon: 'home-heart' as const, tone: 'area' as DateBadgeTone };
  if (normalized.includes('concierge') || normalized.includes('betweener help')) return { icon: 'account-tie-hat-outline' as const, tone: 'concierge' as DateBadgeTone };
  return { icon: 'tag-outline' as const, tone: 'default' as DateBadgeTone };
};

const getDateBadgePalette = ({
  tone,
  theme,
  isDark,
  surface,
  isMyMessage = false,
  confirmed = false,
}: {
  tone: DateBadgeTone;
  theme: typeof Colors.light;
  isDark: boolean;
  surface: 'planner' | 'message';
  isMyMessage?: boolean;
  confirmed?: boolean;
}) => {
  const accent =
    tone === 'safe'
      ? '#2fb36c'
      : tone === 'discount'
      ? '#d4a72c'
      : tone === 'surprise'
      ? '#ef6f91'
      : tone === 'nearby'
      ? '#2c9fb4'
      : tone === 'area'
      ? '#7c8cff'
      : tone === 'concierge'
      ? '#8b6fd6'
      : theme.tint;

  if (surface === 'planner') {
    return {
      backgroundColor: withAlpha(accent, isDark ? 0.18 : 0.1),
      borderColor: withAlpha(accent, isDark ? 0.34 : 0.18),
      foregroundColor: accent,
    };
  }

  if (isMyMessage) {
    return {
      backgroundColor: withAlpha(accent, confirmed ? 0.22 : 0.26),
      borderColor: withAlpha(accent, confirmed ? 0.38 : 0.42),
      foregroundColor: Colors.light.background,
    };
  }

  return {
    backgroundColor: withAlpha(accent, confirmed ? (isDark ? 0.1 : 0.08) : (isDark ? 0.14 : 0.1)),
    borderColor: withAlpha(accent, confirmed ? (isDark ? 0.22 : 0.16) : (isDark ? 0.3 : 0.18)),
    foregroundColor: confirmed && tone === 'default' ? theme.textMuted : accent,
  };
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

const formatRemainingTime = (expiresAt: Date | null | undefined, now: number) => {
  if (!expiresAt) return 'Live';
  const diffMs = expiresAt.getTime() - now;
  if (diffMs <= 0) return 'Live ended';
  const totalMinutes = Math.ceil(diffMs / 60000);
  if (totalMinutes < 60) return `Ends in ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `Ends in ${hours}h`;
  return `Ends in ${hours}h ${minutes}m`;
};

const PAGE_SIZE = 60;

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

type MessageRowItemProps = {
  item: MessageType;
  isMyMessage: boolean;
  showAvatar: boolean;
  showAvatarSpacer: boolean;
  isGroupedWithPrev: boolean;
  isGroupedWithNext: boolean;
  shouldAnimateEntry: boolean;
  isPlaying: boolean;
  isReactionOpen: boolean;
  isFocused: boolean;
  focusToken: number;
  timeLabel: string;
  userAvatar: string | null;
  currentUserId: string;
  peerName: string;
  imageSize?: { width: number; height: number };
  cachedImageUrl?: string;
  cachedVideoUrl?: string;
  theme: typeof Colors.light;
  isDark: boolean;
  styles: ReturnType<typeof createStyles>;
  onLongPress: (messageId: string) => void;
  onRetryFailedMessage: (messageId: string) => void;
  onToggleVoice: (messageId: string) => void;
  onFocus: (messageId: string) => void;
  onReply: (message: MessageType) => void;
  onReplyJump: (messageId: string) => void;
  onEditMessage: (message: MessageType) => void;
  onAddReaction: (messageId: string, emoji: string) => void;
  onCloseReactions: () => void;
  onOpenEditHistory: (message: MessageType) => void;
  onCopyMessage: (message: MessageType) => void;
  onTogglePin: (message: MessageType, isPinned: boolean) => void;
  onDeleteMessage: (message: MessageType) => void;
  isActionPinned: boolean;
  onOpenReactionSheet: (message: MessageType) => void;
  onViewImage: (url: string) => void;
  onViewVideo: (url: string) => void;
  onOpenDocument: (doc?: MessageType['document']) => void;
  onOpenLocation: (message: MessageType) => void;
  onStopLiveShare: (messageId: string) => void;
  onOpenViewOnce: (message: MessageType) => void;
  onAcceptDatePlan: (planId: string) => void;
  onSuggestAnotherTime: (invite: MessageType['dateInvite']) => void;
  onSuggestAnotherPlace: (invite: MessageType['dateInvite']) => void;
  onSuggestBoth: (invite: MessageType['dateInvite']) => void;
  onRescheduleDatePlan: (invite: MessageType['dateInvite']) => void;
  onCancelDatePlan: (planId: string) => void;
  onRequestDatePlanConcierge: (planId: string) => void;
  onAddDatePlanToCalendar: (invite: MessageType['dateInvite']) => void;
  datePlanActionId: string | null;
  datePlanCalendarActionId: string | null;
  viewOnceViewedByMe: boolean;
  viewOnceViewedByPeer: boolean;
  highlightQuery?: string;
  onHighlightPress?: (messageId: string) => void;
};

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const formatFileSize = (bytes?: number | null) => {
  if (bytes == null || Number.isNaN(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

const getFileTypeLabel = (mimeType?: string | null, fileName?: string | null) => {
  const safeMime = mimeType?.toLowerCase() ?? '';
  const ext = fileName?.split('.').pop()?.toLowerCase() ?? '';
  if (safeMime.includes('pdf') || ext === 'pdf') return 'PDF';
  if (safeMime.includes('msword') || ext === 'doc') return 'DOC';
  if (safeMime.includes('wordprocessingml') || ext === 'docx') return 'DOCX';
  if (safeMime.includes('presentation') || ext === 'ppt' || ext === 'pptx') return 'PPT';
  if (safeMime.includes('spreadsheet') || ext === 'xls' || ext === 'xlsx') return 'XLS';
  if (safeMime.includes('zip') || ext === 'zip') return 'ZIP';
  if (safeMime.includes('plain') || ext === 'txt' || ext === 'text') return 'TXT';
  if (safeMime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return 'Image';
  if (safeMime.startsWith('video/') || ['mp4', 'mov'].includes(ext)) return 'Video';
  if (ext) return ext.toUpperCase();
  return 'File';
};

const intentTypeLabel = (type?: IntentRequestSummary['type'] | null) => {
  switch (type) {
    case 'connect':
      return 'Connect request';
    case 'date_request':
      return 'Date request';
    case 'like_with_note':
      return 'Like with message';
    case 'circle_intro':
      return 'Circle intro';
    default:
      return 'Request';
  }
};

const intentExpiresIn = (iso?: string | null) => {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffMs = Math.max(0, ts - Date.now());
  const hours = Math.ceil(diffMs / 3600000);
  return `${hours}h`;
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

  const result = await ImageManipulator.manipulateAsync(
    asset.uri,
    [],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
  );
  let jpegName = name.replace(/\.(heic|heif)$/i, '.jpg');
  if (!/\.[a-z0-9]+$/i.test(jpegName)) {
    jpegName = `${jpegName}.jpg`;
  }
  return {
    uri: result.uri,
    fileName: jpegName,
    contentType: 'image/jpeg',
  };
};

type DatePlanMessageContentProps = {
  item: MessageType;
  isMyMessage: boolean;
  userAvatar?: string | null;
  peerName: string;
  theme: typeof Colors.light;
  isDark: boolean;
  styles: ReturnType<typeof createStyles>;
  datePlanActionId: string | null;
  datePlanCalendarActionId: string | null;
  onAcceptDatePlan: (planId: string) => void;
  onSuggestAnotherTime: (invite: MessageType['dateInvite']) => void;
  onSuggestAnotherPlace: (invite: MessageType['dateInvite']) => void;
  onSuggestBoth: (invite: MessageType['dateInvite']) => void;
  onRescheduleDatePlan: (invite: MessageType['dateInvite']) => void;
  onCancelDatePlan: (planId: string) => void;
  onRequestDatePlanConcierge: (planId: string) => void;
  onAddDatePlanToCalendar: (invite: MessageType['dateInvite']) => void;
};

type ReplyMeta = {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  preview: string;
  time: string;
  canJump: boolean;
  thumbnailUri?: string | null;
  thumbnailKind?: 'image' | 'video' | 'location' | 'date_plan' | null;
};

const DatePlanMessageContent = memo(
  ({
    item,
    isMyMessage,
    userAvatar,
    peerName,
    theme,
    isDark,
    styles,
    datePlanActionId,
    datePlanCalendarActionId,
    onAcceptDatePlan,
    onSuggestAnotherTime,
    onSuggestAnotherPlace,
    onSuggestBoth,
    onRescheduleDatePlan,
    onCancelDatePlan,
    onRequestDatePlanConcierge,
    onAddDatePlanToCalendar,
  }: DatePlanMessageContentProps) => {
    const {
      datePlanStatus,
      datePlanPlanId,
      datePlanBusy,
      canAcceptDatePlan,
      canRequestDatePlanConcierge,
      canRescheduleDatePlan,
      canAddDatePlanToCalendar,
      canCancelDatePlan,
      datePlanCalendarBusy,
      datePlanBadgeLabel,
      datePlanBadgeIcon,
      isAcceptedDatePlan,
    } = getDatePlanUiState({
      item,
      isMyMessage,
      datePlanActionId,
      datePlanCalendarActionId,
    });
    const acceptedLockIn = useRef(new Animated.Value(isAcceptedDatePlan ? 1 : 0)).current;
    const previousDatePlanStatus = useRef(datePlanStatus);
    const acceptedLockInHeaderStyle = useMemo(() => ({
      opacity: acceptedLockIn.interpolate({
        inputRange: [0, 1],
        outputRange: [0.72, 1],
      }),
      transform: [
        {
          translateY: acceptedLockIn.interpolate({
            inputRange: [0, 1],
            outputRange: [Motion.transform.enterTranslateY, 0],
          }),
        },
        {
          scale: acceptedLockIn.interpolate({
            inputRange: [0, 0.68, 1],
            outputRange: [0.985, Motion.transform.popScale, 1],
          }),
        },
      ],
    }) as const, [acceptedLockIn]);
    const acceptedLockInLiftStyle = useMemo(() => ({
      opacity: acceptedLockIn.interpolate({
        inputRange: [0, 1],
        outputRange: [0.68, 1],
      }),
      transform: [
        {
          translateY: acceptedLockIn.interpolate({
            inputRange: [0, 1],
            outputRange: [6, 0],
          }),
        },
      ],
    }) as const, [acceptedLockIn]);

    useEffect(() => {
      const previousStatus = previousDatePlanStatus.current;
      if (datePlanStatus === 'accepted' && previousStatus !== 'accepted') {
        acceptedLockIn.stopAnimation();
        acceptedLockIn.setValue(0);
        Animated.timing(acceptedLockIn, {
          toValue: 1,
          duration: Motion.duration.slow,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      } else if (datePlanStatus !== 'accepted') {
        acceptedLockIn.stopAnimation();
        acceptedLockIn.setValue(0);
      }

      previousDatePlanStatus.current = datePlanStatus;
    }, [acceptedLockIn, datePlanStatus]);

    return (
      <View
        style={[
          styles.datePlanMessageContainer,
          isAcceptedDatePlan && styles.datePlanMessageContainerConfirmed,
        ]}
      >
        <View style={styles.datePlanHeader}>
          <View style={styles.datePlanHeaderTop}>
            <View style={[styles.datePlanBadge, { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.16) : withAlpha(theme.tint, 0.14) }]}>
              <MaterialCommunityIcons
                name={datePlanBadgeIcon}
                size={14}
                color={isMyMessage ? Colors.light.background : theme.tint}
              />
              <Text style={[styles.datePlanBadgeText, { color: isMyMessage ? Colors.light.background : theme.tint }]}>
                {datePlanBadgeLabel}
              </Text>
            </View>
            {userAvatar ? (
              <View
                style={[
                  styles.datePlanPersonChip,
                  {
                    backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.12) : withAlpha(theme.tint, 0.1),
                    borderColor: isMyMessage ? withAlpha(Colors.light.background, 0.14) : withAlpha(theme.tint, 0.14),
                  },
                ]}
              >
                <ExpoImage
                  source={{ uri: userAvatar }}
                  style={styles.datePlanPersonAvatar}
                  cachePolicy="disk"
                  contentFit="cover"
                  transition={0}
                />
                <Text
                  style={[
                    styles.datePlanPersonText,
                    { color: isMyMessage ? Colors.light.background : theme.text },
                  ]}
                  numberOfLines={1}
                >
                  {isMyMessage ? `For ${peerName || 'your match'}` : peerName || 'Your match'}
                </Text>
              </View>
            ) : null}
          </View>
          {isAcceptedDatePlan ? (
            <Text
              style={[
                styles.datePlanWhenEyebrow,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.76) : theme.textMuted },
              ]}
            >
              Confirmed plan
            </Text>
          ) : null}
          {isAcceptedDatePlan ? (
            <Animated.View style={acceptedLockInHeaderStyle as any}>
              <View
                style={[
                  styles.datePlanWhenRowConfirmed,
                  {
                    backgroundColor: isMyMessage
                      ? withAlpha(Colors.light.background, 0.1)
                      : withAlpha(theme.text, 0.05),
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="calendar-check-outline"
                  size={16}
                  color={isMyMessage ? Colors.light.background : theme.tint}
                />
                <Text
                  style={[
                    styles.datePlanWhen,
                    styles.datePlanWhenConfirmed,
                    { color: isMyMessage ? Colors.light.background : theme.text },
                  ]}
                >
                  {item.dateInvite ? formatDateInviteWhen(item.dateInvite.scheduledFor) : 'Date suggestion'}
                </Text>
              </View>
            </Animated.View>
          ) : (
            <Text
              style={[
                styles.datePlanWhen,
                { color: isMyMessage ? Colors.light.background : theme.text },
              ]}
            >
              {item.dateInvite ? formatDateInviteWhen(item.dateInvite.scheduledFor) : 'Date suggestion'}
            </Text>
          )}
          {datePlanStatus !== 'pending' || item.dateInvite?.conciergeRequested ? (
            <Animated.View style={isAcceptedDatePlan ? acceptedLockInLiftStyle as any : undefined}>
              <View style={styles.datePlanStatusRow}>
                {datePlanStatus !== 'pending' ? (
                  <View
                    style={[
                      styles.datePlanStatusChip,
                      {
                        backgroundColor: isMyMessage
                          ? withAlpha(Colors.light.background, 0.16)
                          : withAlpha(theme.tint, 0.12),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.datePlanStatusText,
                        { color: isMyMessage ? Colors.light.background : theme.tint },
                      ]}
                    >
                      {datePlanStatus === 'accepted'
                        ? 'Confirmed'
                        : datePlanStatus === 'declined'
                        ? 'Passed'
                        : datePlanStatus === 'countered'
                        ? 'Updated'
                        : 'Cancelled'}
                    </Text>
                  </View>
                ) : null}
                {item.dateInvite?.conciergeRequested ? (
                  <View
                    style={[
                      styles.datePlanStatusChip,
                      {
                        backgroundColor: isMyMessage
                          ? withAlpha(Colors.light.background, 0.12)
                          : withAlpha(theme.text, 0.08),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.datePlanStatusText,
                        { color: isMyMessage ? Colors.light.background : theme.text },
                      ]}
                    >
                      Betweener helping
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>
          ) : null}
        </View>
        {item.dateInvite?.mapUrl ? (
          <Image
            source={{ uri: item.dateInvite.mapUrl }}
            style={[
              styles.datePlanMapImage,
              isAcceptedDatePlan && styles.datePlanMapImageConfirmed,
            ]}
          />
        ) : null}
        <View style={styles.datePlanPlaceBlock}>
          <Text
            style={[
              styles.datePlanVenue,
              isAcceptedDatePlan && styles.datePlanVenueConfirmed,
              { color: isMyMessage ? Colors.light.background : theme.text },
            ]}
            numberOfLines={1}
          >
            {item.dateInvite?.placeName || 'Chosen venue'}
          </Text>
          {item.dateInvite?.placeAddress ? (
            <Text
              style={[
                styles.datePlanAddress,
                isAcceptedDatePlan && styles.datePlanAddressConfirmed,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.78) : theme.textMuted },
              ]}
              numberOfLines={2}
            >
              {item.dateInvite.placeAddress}
            </Text>
          ) : null}
          {item.dateInvite?.summary ? (
            <Text
              style={[
                styles.datePlanSummary,
                isAcceptedDatePlan && styles.datePlanSummaryConfirmed,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.78) : theme.textMuted },
              ]}
              numberOfLines={isAcceptedDatePlan ? 1 : 2}
            >
              {item.dateInvite.summary}
            </Text>
          ) : null}
        </View>
        {item.dateInvite?.badges?.length ? (
          <View style={[styles.datePlanBadgeRow, isAcceptedDatePlan && styles.datePlanBadgeRowCompact]}>
            {item.dateInvite.badges.slice(0, 3).map((badge) => {
              const badgeMeta = getDateBadgeMeta(badge);
              const badgePalette = getDateBadgePalette({
                tone: badgeMeta.tone,
                theme,
                isDark,
                surface: 'message',
                isMyMessage,
                confirmed: isAcceptedDatePlan,
              });
              return (
                <View
                  key={badge}
                  style={[
                    styles.datePlanTag,
                    isAcceptedDatePlan && styles.datePlanTagCompact,
                    isAcceptedDatePlan && styles.datePlanTagConfirmed,
                    {
                      backgroundColor: badgePalette.backgroundColor,
                      borderColor: badgePalette.borderColor,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <View style={styles.datePlanTagContent}>
                    <MaterialCommunityIcons
                      name={badgeMeta.icon}
                      size={12}
                      color={badgePalette.foregroundColor}
                      style={styles.datePlanTagIcon}
                    />
                    <Text
                      style={[
                        styles.datePlanTagText,
                        isAcceptedDatePlan && styles.datePlanTagTextCompact,
                        { color: badgePalette.foregroundColor },
                      ]}
                    >
                      {badge}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
        {item.dateInvite?.note ? (
          <View
            style={[
              styles.datePlanNoteCard,
              isAcceptedDatePlan && styles.datePlanNoteCardLight,
              { borderColor: isMyMessage ? withAlpha(Colors.light.background, 0.18) : withAlpha(theme.text, 0.12) },
            ]}
          >
            <Text
              style={[
                styles.datePlanNoteLabel,
                isAcceptedDatePlan && styles.datePlanNoteLabelCompact,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.7) : theme.textMuted },
              ]}
            >
              Note
            </Text>
            <Text
              style={[
                styles.datePlanNoteText,
                isAcceptedDatePlan && styles.datePlanNoteTextCompact,
                { color: isMyMessage ? Colors.light.background : theme.text },
              ]}
            >
              {item.dateInvite.note}
            </Text>
          </View>
        ) : null}
        {canAcceptDatePlan ? (
          <View style={styles.datePlanActionRow}>
            <TouchableOpacity
              style={[
                styles.datePlanPrimaryAction,
                {
                  backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.14) : theme.tint,
                  opacity: datePlanBusy ? 0.7 : 1,
                },
              ]}
              disabled={datePlanBusy}
              onPress={() => datePlanPlanId && onAcceptDatePlan(datePlanPlanId)}
            >
              <Text
                style={[
                  styles.datePlanPrimaryActionText,
                  { color: Colors.light.background },
                ]}
              >
                {datePlanBusy ? 'Accepting...' : 'Accept'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.datePlanSecondaryAction,
                {
                  borderColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.2)
                    : withAlpha(theme.text, 0.14),
                  opacity: datePlanBusy ? 0.7 : 1,
                },
              ]}
              disabled={datePlanBusy}
              onPress={() => item.dateInvite && onSuggestAnotherTime(item.dateInvite)}
            >
              <Text
                style={[
                  styles.datePlanSecondaryActionText,
                  { color: isMyMessage ? Colors.light.background : theme.text },
                ]}
              >
                Suggest another time
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.datePlanSecondaryAction,
                {
                  borderColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.2)
                    : withAlpha(theme.text, 0.14),
                  opacity: datePlanBusy ? 0.7 : 1,
                },
              ]}
              disabled={datePlanBusy}
              onPress={() => item.dateInvite && onSuggestAnotherPlace(item.dateInvite)}
            >
              <Text
                style={[
                  styles.datePlanSecondaryActionText,
                  { color: isMyMessage ? Colors.light.background : theme.text },
                ]}
              >
                Suggest another place
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.datePlanSecondaryAction,
                {
                  borderColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.2)
                    : withAlpha(theme.text, 0.14),
                  opacity: datePlanBusy ? 0.7 : 1,
                },
              ]}
              disabled={datePlanBusy}
              onPress={() => item.dateInvite && onSuggestBoth(item.dateInvite)}
            >
              <Text
                style={[
                  styles.datePlanSecondaryActionText,
                  { color: isMyMessage ? Colors.light.background : theme.text },
                ]}
              >
                Suggest both
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {canRescheduleDatePlan ? (
          <Animated.View style={acceptedLockInLiftStyle as any}>
            <View style={styles.datePlanActionRow}>
              {canAddDatePlanToCalendar ? (
                <TouchableOpacity
                  style={[
                    styles.datePlanPrimaryAction,
                    styles.datePlanPrimaryActionWide,
                    {
                      backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.16) : theme.tint,
                      opacity: datePlanCalendarBusy ? 0.7 : 1,
                    },
                  ]}
                  disabled={datePlanCalendarBusy}
                  onPress={() => item.dateInvite && onAddDatePlanToCalendar(item.dateInvite)}
                >
                  <View style={styles.datePlanPrimaryActionContent}>
                    <MaterialCommunityIcons
                      name="calendar-plus"
                      size={14}
                      color={Colors.light.background}
                    />
                    <Text
                      style={[
                        styles.datePlanPrimaryActionText,
                        { color: Colors.light.background },
                      ]}
                    >
                      {datePlanCalendarBusy ? 'Adding...' : 'Add to Calendar'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              {item.dateInvite?.mapLink ? (
                <TouchableOpacity
                  style={[
                    styles.datePlanSecondaryAction,
                    styles.datePlanSecondaryActionStrong,
                    {
                      borderColor: isMyMessage
                        ? withAlpha(Colors.light.background, 0.2)
                        : withAlpha(theme.text, 0.14),
                      opacity: datePlanBusy ? 0.7 : 1,
                    },
                  ]}
                  disabled={datePlanBusy}
                  onPress={() => item.dateInvite?.mapLink && Linking.openURL(item.dateInvite.mapLink).catch(() => {})}
                >
                  <View style={styles.datePlanSecondaryActionContent}>
                    <MaterialCommunityIcons
                      name="map-marker-path"
                      size={14}
                      color={isMyMessage ? Colors.light.background : theme.text}
                    />
                    <Text
                      style={[
                        styles.datePlanSecondaryActionText,
                        { color: isMyMessage ? Colors.light.background : theme.text },
                      ]}
                    >
                      Open in Maps
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.datePlanSecondaryAction,
                  styles.datePlanSecondaryActionStrong,
                  {
                    borderColor: isMyMessage
                      ? withAlpha(Colors.light.background, 0.2)
                      : withAlpha(theme.text, 0.14),
                    opacity: datePlanBusy ? 0.7 : 1,
                  },
                ]}
                disabled={datePlanBusy}
                onPress={() => item.dateInvite && onRescheduleDatePlan(item.dateInvite)}
              >
                <Text
                  style={[
                    styles.datePlanSecondaryActionText,
                    { color: isMyMessage ? Colors.light.background : theme.text },
                  ]}
                >
                  Reschedule date
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : null}
        {isMyMessage && datePlanStatus === 'pending' ? (
          <>
            <Text style={[styles.datePlanPendingText, { color: withAlpha(Colors.light.background, 0.82) }]}>
              Waiting for their reply
            </Text>
            {canCancelDatePlan ? (
              <View style={styles.datePlanActionRow}>
                <TouchableOpacity
                  style={[
                    styles.datePlanSecondaryAction,
                    {
                      borderColor: withAlpha(Colors.light.background, 0.2),
                      opacity: datePlanBusy ? 0.7 : 1,
                    },
                  ]}
                  disabled={datePlanBusy}
                  onPress={() => datePlanPlanId && onCancelDatePlan(datePlanPlanId)}
                >
                  <Text style={[styles.datePlanSecondaryActionText, { color: Colors.light.background }]}>
                    {datePlanBusy ? 'Cancelling...' : 'Cancel suggestion'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : null}
        {canRequestDatePlanConcierge ? (
          <Animated.View style={acceptedLockInLiftStyle as any}>
            <TouchableOpacity
              style={[
                styles.datePlanConciergeButton,
                {
                  borderColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.22)
                    : withAlpha(theme.tint, 0.18),
                  backgroundColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.08)
                    : withAlpha(theme.tint, 0.08),
                  opacity: datePlanBusy ? 0.7 : 1,
                },
              ]}
              disabled={datePlanBusy}
              onPress={() => datePlanPlanId && onRequestDatePlanConcierge(datePlanPlanId)}
            >
              <MaterialCommunityIcons
                name="account-tie-hat-outline"
                size={14}
                color={isMyMessage ? Colors.light.background : theme.tint}
              />
              <Text
                style={[
                  styles.datePlanConciergeText,
                  { color: isMyMessage ? Colors.light.background : theme.tint },
                ]}
              >
                {datePlanBusy ? 'Notifying Betweener...' : 'Get Betweener help'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}
        {canRescheduleDatePlan && canCancelDatePlan ? (
          <TouchableOpacity
            style={[
              styles.datePlanTertiaryAction,
              { opacity: datePlanBusy ? 0.7 : 1 },
            ]}
            disabled={datePlanBusy}
            onPress={() => datePlanPlanId && onCancelDatePlan(datePlanPlanId)}
          >
            <Text
              style={[
                styles.datePlanTertiaryActionText,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.84) : '#d96b6b' },
              ]}
            >
              {datePlanBusy ? 'Cancelling...' : 'Cancel date'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {item.dateInvite?.mapLink && !canRescheduleDatePlan ? (
          <View style={styles.datePlanFooterRow}>
            <View style={styles.datePlanFooterLead}>
              <MaterialCommunityIcons
                name="map-marker-path"
                size={13}
                color={isMyMessage ? withAlpha(Colors.light.background, 0.82) : theme.textMuted}
              />
              <Text style={[styles.datePlanFooterText, { color: isMyMessage ? withAlpha(Colors.light.background, 0.82) : theme.textMuted }]}>
                Open in Maps
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={16}
              color={isMyMessage ? withAlpha(Colors.light.background, 0.72) : theme.textMuted}
            />
          </View>
        ) : null}
      </View>
    );
  }
);

DatePlanMessageContent.displayName = "DatePlanMessageContent";

type VideoViewerProps = {
  url: string;
  visible: boolean;
  styles: ReturnType<typeof createStyles>;
  style?: object;
};

  const VideoViewer = ({ url, visible, styles, style }: VideoViewerProps) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.muted = false;
    p.keepScreenOnWhilePlaying = false;
  });
  const { isPlaying } = useEvent(player as any, 'playingChange', { isPlaying: visible && player.playing });
  const { status } = useEvent(player as any, 'statusChange', { status: player.status });

  useScopedScreenAwake({
    enabled: visible && isPlaying && status === 'readyToPlay',
    reason: 'video_playback',
    instanceId: `chat-video-viewer:${url}`,
  });

  useEffect(() => {
    if (visible) {
      try { player.play(); } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [player, visible]);

  return (
    <VideoView
      player={player}
      style={[styles.videoViewer, style]}
      contentFit="contain"
      nativeControls
    />
  );
};

const MessageRowItem = memo(
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
      () => canRetryFailedTextMessage({ item, isMyMessage }),
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
            if (item.type === 'image' && resolvedImageUri) {
              onViewImage(resolvedImageUri);
              return;
            }
            const resolvedVideoUri = resolveChatVideoUri(item, cachedVideoUrl);
            if (item.type === 'video' && resolvedVideoUri) {
              onViewVideo(resolvedVideoUri);
              return;
            }
            if (item.type === 'document' && item.document?.url) {
              onOpenDocument(item.document);
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
                  timeLabel={metaLabel}
                  styles={styles}
                  theme={theme}
                  isDark={isDark}
                  receiptPulseStyle={receiptPulseStyle}
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
  (prev, next) =>
    prev.item === next.item &&
    prev.isMyMessage === next.isMyMessage &&
    prev.showAvatar === next.showAvatar &&
    prev.showAvatarSpacer === next.showAvatarSpacer &&
    prev.isGroupedWithPrev === next.isGroupedWithPrev &&
    prev.isGroupedWithNext === next.isGroupedWithNext &&
    prev.shouldAnimateEntry === next.shouldAnimateEntry &&
    prev.isPlaying === next.isPlaying &&
    prev.isReactionOpen === next.isReactionOpen &&
    prev.isFocused === next.isFocused &&
    prev.focusToken === next.focusToken &&
    prev.isActionPinned === next.isActionPinned &&
    prev.onRetryFailedMessage === next.onRetryFailedMessage &&
    prev.onOpenReactionSheet === next.onOpenReactionSheet &&
    prev.onEditMessage === next.onEditMessage &&
    prev.onOpenEditHistory === next.onOpenEditHistory &&
    prev.onOpenViewOnce === next.onOpenViewOnce &&
    prev.onAcceptDatePlan === next.onAcceptDatePlan &&
    prev.onSuggestAnotherTime === next.onSuggestAnotherTime &&
    prev.onSuggestAnotherPlace === next.onSuggestAnotherPlace &&
    prev.onSuggestBoth === next.onSuggestBoth &&
    prev.onRescheduleDatePlan === next.onRescheduleDatePlan &&
    prev.onCancelDatePlan === next.onCancelDatePlan &&
    prev.onRequestDatePlanConcierge === next.onRequestDatePlanConcierge &&
    prev.onAddDatePlanToCalendar === next.onAddDatePlanToCalendar &&
    prev.datePlanActionId === next.datePlanActionId &&
    prev.datePlanCalendarActionId === next.datePlanCalendarActionId &&
    prev.viewOnceViewedByMe === next.viewOnceViewedByMe &&
    prev.viewOnceViewedByPeer === next.viewOnceViewedByPeer &&
    prev.timeLabel === next.timeLabel &&
    prev.userAvatar === next.userAvatar &&
    prev.currentUserId === next.currentUserId &&
    prev.peerName === next.peerName &&
    prev.onReplyJump === next.onReplyJump &&
    prev.highlightQuery === next.highlightQuery &&
    prev.onHighlightPress === next.onHighlightPress &&
    prev.imageSize?.width === next.imageSize?.width &&
    prev.imageSize?.height === next.imageSize?.height &&
    prev.cachedImageUrl === next.cachedImageUrl &&
    prev.cachedVideoUrl === next.cachedVideoUrl
);

MessageRowItem.displayName = "MessageRowItem";

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
    () => createStyles(theme, isDark, responsive, attachmentSheetHeight, insets.bottom),
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
  const signedChatMediaUrlsRef = useRef(new Map<string, string>());
  const signingChatMediaPathsRef = useRef(new Set<string>());
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [threadBootstrapSettled, setThreadBootstrapSettled] = useState(false);
  const [remoteMessagesChecked, setRemoteMessagesChecked] = useState(false);
  const [chatSafetyVisible, setChatSafetyVisible] = useState(false);
  const [networkReady, setNetworkReady] = useState(true);
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
  const [videoViewerUrl, setVideoViewerUrl] = useState<string | null>(null);
  const [cachedImageUris, setCachedImageUris] = useState<Record<string, string>>({});
  const [cachedVideoUris, setCachedVideoUris] = useState<Record<string, string>>({});
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(null);
  const [imageSizes, setImageSizes] = useState<Record<string, { width: number; height: number }>>({});
  const measuredImageUrlsRef = useRef<Set<string>>(new Set());
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
  const pendingServerReadIdsRef = useRef<Set<string>>(new Set());
  const readReceiptFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localThreadReadPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedThreadReadActionRef = useRef<
    (options?: { forceRemote?: boolean }) => Promise<void>
  >(async () => {});
  const focusedThreadReadInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const focusedThreadReadCompletedRef = useRef<Set<string>>(new Set());
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
  const initialScrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const initialAutoScrollDoneRef = useRef(false);
  const initialAutoScrollAttemptsRef = useRef(0);
  const lockAutoScrollUntilRef = useRef(0);

  const forceScrollToBottom = useCallback(() => {
    if (!flatListRef.current) return;
    const schedule = (delayMs: number) => {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, delayMs);
      initialScrollTimersRef.current.push(timer);
    };
    scheduleIdleTask(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
      schedule(60);
      schedule(220);
    });
  }, []);

  useEffect(() => {
    initialScrollTimersRef.current.forEach((timer) => clearTimeout(timer));
    initialScrollTimersRef.current = [];
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
  
  useEffect(() => {
    return () => {
      initialScrollTimersRef.current.forEach((timer) => clearTimeout(timer));
      initialScrollTimersRef.current = [];
    };
  }, []);
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
    chatMediaBucket: CHAT_MEDIA_BUCKET,
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
  const showThreadBootstrapPlaceholder =
    messages.length === 0 && (needsRouteIdentityResolution || !remoteMessagesChecked);

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
    (row: MessageRow): MessageType => {
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
        } else if (messageType === 'text' && (messageText.startsWith(DOCUMENT_TEXT_PREFIX) || messageText.startsWith('dY\"Z'))) {
          const [label, url, ...rest] = messageText.split('\n');
          const prefixPattern = messageText.startsWith('dY\"Z')
            ? /^dY"Z\s*/
            : new RegExp(`^${DOCUMENT_TEXT_PREFIX}\\s*`);
          const cleanedLabel = label.replace(prefixPattern, '').trim();
          const labelParts = cleanedLabel.split(' | ').map((part) => part.trim()).filter(Boolean);
          const [namePart, sizePart, typePart] = labelParts;
          storagePath = storagePath ?? getLegacyChatMediaStoragePath(url);
          if (url || storagePath) {
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
        imageUrl,
        videoUrl,
        document:
          resolvedType === 'document' && documentUrl
            ? {
                name: documentName || 'Document',
                url: documentUrl,
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

  useEffect(() => {
    const pendingPaths = Array.from(
      new Set(
        messages
          .filter((message) => !message.deletedForAll && message.storagePath)
          .map((message) => message.storagePath as string)
          .filter(
            (path) =>
              !signedChatMediaUrlsRef.current.has(path) &&
              !signingChatMediaPathsRef.current.has(path),
          ),
      ),
    );
    if (pendingPaths.length === 0) return;

    let cancelled = false;
    pendingPaths.forEach((path) => signingChatMediaPathsRef.current.add(path));
    void Promise.all(
      pendingPaths.map(async (path) => {
        const { data, error } = await supabase.storage
          .from(CHAT_MEDIA_BUCKET)
          .createSignedUrl(path, 3600);
        signingChatMediaPathsRef.current.delete(path);
        if (error || !data?.signedUrl) return null;
        signedChatMediaUrlsRef.current.set(path, data.signedUrl);
        return { path, signedUrl: data.signedUrl };
      }),
    ).then((resolved) => {
      if (cancelled) return;
      const signedByPath = new Map(
        resolved
          .filter((entry): entry is { path: string; signedUrl: string } => Boolean(entry))
          .map((entry) => [entry.path, entry.signedUrl]),
      );
      if (signedByPath.size === 0) return;
      setMessages((current) =>
        current.map((message) => {
          const path = message.storagePath;
          const signedUrl = path ? signedByPath.get(path) : null;
          if (!signedUrl) return message;
          if (message.type === 'image') return { ...message, imageUrl: signedUrl };
          if (message.type === 'video') return { ...message, videoUrl: signedUrl };
          if (message.type === 'document' && message.document) {
            return { ...message, document: { ...message.document, url: signedUrl } };
          }
          return message;
        }),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [messages]);

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
          return { ...item, status: 'delivered' as const };
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
    getMessageLocalObserverKey,
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

  useEffect(() => {
    if (!user?.id || !activePeerMessageUserId) return;
    if (!isScreenFocusedRef.current) return;
    if (!localThreadState.mergedMessages || localThreadState.mergedMessages.length === 0) return;

    const localKey = `${user.id}:${activePeerMessageUserId}`;
    if (chatThreadLocalLoadedKeyRef.current !== localKey) {
      chatThreadLocalLoadedKeyRef.current = localKey;
    }

    if (messagesRef.current !== localThreadState.mergedMessages) {
      setMessages((prev) => {
        const prevKey = prev.map(getMessageLocalObserverKey).join("|");
        const nextKey = localThreadState.mergedMessages!
          .map(getMessageLocalObserverKey)
          .join("|");
        return prevKey === nextKey ? prev : localThreadState.mergedMessages!;
      });
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

  useEffect(() => {
    const imageUrls = Array.from(
      new Set(
        messages
          .map((message) => message.imageUrl)
          .filter((value): value is string => Boolean(value && value.startsWith('http'))),
      ),
    );
    if (!imageUrls.length) return;
    let cancelled = false;
    void (async () => {
      for (const url of imageUrls) {
        const cached = await getOfflineImageUri(url);
        if (cancelled) return;
        if (cached) {
          setCachedImageUris((prev) => (prev[url] === cached ? prev : { ...prev, [url]: cached }));
          setMessages((prev) =>
            prev.map((msg) =>
              msg.type === 'image' && msg.imageUrl === url && msg.offlineImageUri !== cached
                ? { ...msg, offlineImageUri: cached }
                : msg
            )
          );
          continue;
        }
        if (!networkReady) continue;
        const downloaded = await cacheOfflineImage(url, url);
        if (cancelled || !downloaded) continue;
        setCachedImageUris((prev) => (prev[url] === downloaded ? prev : { ...prev, [url]: downloaded }));
        setMessages((prev) =>
          prev.map((msg) =>
            msg.type === 'image' && msg.imageUrl === url && msg.offlineImageUri !== downloaded
              ? { ...msg, offlineImageUri: downloaded }
              : msg
          )
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, networkReady]);

  useEffect(() => {
    const videoUrls = Array.from(
      new Set(
        messages
          .map((message) => message.videoUrl)
          .filter((value): value is string => Boolean(value && value.startsWith('http'))),
      ),
    );
    if (!videoUrls.length) return;
    let cancelled = false;
    void (async () => {
      for (const url of videoUrls) {
        const cached = await getOfflineVideoUri(url);
        if (cancelled) return;
        if (cached) {
          setCachedVideoUris((prev) => (prev[url] === cached ? prev : { ...prev, [url]: cached }));
          setMessages((prev) =>
            prev.map((msg) =>
              msg.type === 'video' && msg.videoUrl === url && msg.offlineVideoUri !== cached
                ? { ...msg, offlineVideoUri: cached }
                : msg
            )
          );
          continue;
        }
        if (!networkReady) continue;
        const downloaded = await cacheOfflineVideo(url, url);
        if (cancelled || !downloaded) continue;
        setCachedVideoUris((prev) => (prev[url] === downloaded ? prev : { ...prev, [url]: downloaded }));
        setMessages((prev) =>
          prev.map((msg) =>
            msg.type === 'video' && msg.videoUrl === url && msg.offlineVideoUri !== downloaded
              ? { ...msg, offlineVideoUri: downloaded }
              : msg
          )
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, networkReady]);

  const markLocalMessageFailed = useCallback((messageId: string) => {
    setMessages((prev) => setMessageStatus(prev, messageId, 'failed'));
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
      (messageRows || []).map((row: MessageRow) => mapRowToMessage(row))
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
        linkReplies(prev.map((message) => (message.id === tempId ? mapRowToMessage(messageData as MessageRow) : message))),
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

  const uploadChatMedia = useCallback(async ({
    uri,
    fileName,
    contentType,
  }: {
    uri: string;
    fileName: string;
    contentType: string;
  }) => {
    // Ensure we have an auth session for storage RLS
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error('unauthenticated_storage');
    }
    if (!activePeerMessageUserId) {
      throw new Error('missing_chat_participant');
    }
    const filePath = `${user?.id ?? 'anon'}/${activePeerMessageUserId}/${Date.now()}-${fileName}`;
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('missing_supabase_upload_config');
    }

    const uploadUrl = `${supabaseUrl}/storage/v1/object/${CHAT_MEDIA_BUCKET}/${encodeStoragePath(filePath)}?upsert=true`;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= CHAT_MEDIA_UPLOAD_RETRIES; attempt += 1) {
      try {
        const task = FileSystem.createUploadTask(uploadUrl, uri, {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            'Content-Type': contentType,
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseAnonKey,
            'x-upsert': 'true',
          },
        });
        const result = await task.uploadAsync();
        if (!result) {
          throw new Error('Upload failed (no response)');
        }
        if (result.status >= 200 && result.status < 300) {
          const { data: signedData, error: signedError } = await supabase.storage
            .from(CHAT_MEDIA_BUCKET)
            .createSignedUrl(filePath, 3600);
          if (signedError || !signedData?.signedUrl) {
            throw signedError ?? new Error('signed_media_url_unavailable');
          }
          return { signedUrl: signedData.signedUrl, filePath };
        }

        let message = result.body || `Upload failed (HTTP ${result.status})`;
        try {
          const parsed = JSON.parse(result.body || '{}');
          if (parsed?.message) message = String(parsed.message);
        } catch {}
        const uploadError = new Error(message);
        (uploadError as any).status = result.status;
        throw uploadError;
      } catch (error) {
        lastError = error;
        if (attempt >= CHAT_MEDIA_UPLOAD_RETRIES || !isRetryableUploadError(error)) {
          console.log('[chat] upload media error', error);
          throw error;
        }
        await wait(CHAT_MEDIA_UPLOAD_RETRY_DELAY_MS * (attempt + 1));
      }
    }

    throw lastError ?? new Error('upload_failed');
  }, [activePeerMessageUserId, user?.id]);

  const uploadEncryptedChatMedia = useCallback(async ({
    bytes,
    fileName,
    contentType,
  }: {
    bytes: Uint8Array;
    fileName: string;
    contentType: string;
  }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw new Error('unauthenticated_storage');
    }
    if (!activePeerMessageUserId) {
      throw new Error('missing_chat_participant');
    }
    const filePath = `${user?.id ?? 'anon'}/${activePeerMessageUserId}/${Date.now()}-${fileName}`;
    const { error: uploadError } = await supabase
      .storage
      .from(CHAT_MEDIA_BUCKET)
      .upload(filePath, bytes, { contentType, upsert: true });
    if (uploadError) {
      console.log('[chat] upload encrypted media error', uploadError);
      throw uploadError;
    }
    return filePath;
  }, [activePeerMessageUserId, user?.id]);

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

  const sendImageAttachment = useCallback(async ({
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
        message: {
          ...optimisticImageMessage,
          status: 'queued',
        },
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued image outbox error', persistError));
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? { ...msg, status: 'queued' as const } : msg))
      );
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
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    if (!user?.id || !conversationId) return;

    const keys = await ensureViewOnceKeys();
    if (!keys) return;
    const { keypair, recipientPublicKey } = keys;

    const tempId = `temp-viewonce-${Date.now()}`;
    const clientMessageId = tempId;
    const optimistic: MessageType = {
      id: tempId,
      clientMessageId,
      text: '',
      senderId: user.id,
      timestamp: new Date(),
      type: kind,
      reactions: [],
      status: 'sending',
      isViewOnce: true,
      encryptedMedia: true,
      encryptedMediaPath: null,
    };
    setMessages((prev) => appendMessage(prev, optimistic));
    setReplyingTo(null);
    setEditingMessage(null);
    setViewOnceMode(false);

    try {
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const plaintext = new Uint8Array(arrayBuffer);
      const encryptedPayload = await encryptMediaBytes({
        plainBytes: plaintext,
        senderKeypair: keypair,
        receiverPublicKeyB64: recipientPublicKey,
      });
      plaintext.fill(0);

      const encryptedPath = await uploadEncryptedChatMedia({
        bytes: encryptedPayload.cipherBytes,
        fileName: `${fileName}.enc`,
        contentType,
      });

      const { data, error } = await supabase
        .from('messages')
        .insert({
          text: '',
          client_message_id: clientMessageId,
          sender_id: user.id,
          receiver_id: activePeerMessageUserId,
          is_read: false,
          message_type: kind,
          reply_to_message_id: replyingTo?.id ?? null,
          is_view_once: true,
          encrypted_media: true,
          encrypted_media_path: encryptedPath,
          encrypted_key_sender: encryptedPayload.encryptedKeySenderB64,
          encrypted_key_receiver: encryptedPayload.encryptedKeyReceiverB64,
          encrypted_key_nonce: encryptedPayload.keyNonceB64,
          encrypted_media_nonce: encryptedPayload.mediaNonceB64,
          encrypted_media_alg: 'nacl-secretbox',
          encrypted_media_mime: contentType,
          encrypted_media_size: plaintext.length,
        })
        .select(MESSAGE_SELECT_FIELDS)
        .single();

      if (error || !data) {
        console.log('[chat] send encrypted view-once error', error);
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      } else {
        const nextMessage = mapRowToMessage(data as MessageRow);
        setMessages((prev) =>
          replyingTo
            ? linkReplies(replaceMessageById(prev, tempId, nextMessage))
            : replaceMessageById(prev, tempId, nextMessage)
        );
      }
    } catch (err) {
      console.log('[chat] encrypted view-once error', err);
      Alert.alert('View once', 'Unable to send encrypted media.');
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    }
  }, [conversationId, ensureViewOnceKeys, isBlockedByMe, isChatBlocked, linkReplies, mapRowToMessage, replaceMessageById, replyingTo, uploadEncryptedChatMedia, user?.id]);

  const sendVideoAttachment = useCallback(async ({
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
        message: {
          ...optimisticVideoMessage,
          status: 'queued',
        },
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued video outbox error', persistError));
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? { ...msg, status: 'queued' as const } : msg))
      );
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
  }: {
    localUri: string;
    fileName: string;
    contentType: string;
    mediaType: 'image' | 'video' | 'document';
    documentSizeLabel?: string | null;
    documentTypeLabel?: string | null;
  }) => {
    if (!user?.id || !conversationId) return;
    const stagedUri = await stageOfflineChatUpload(localUri, fileName);
    const tempId = `temp-${mediaType}-${Date.now()}`;
    const clientMessageId = tempId;
    const labelParts = [fileName, documentSizeLabel, documentTypeLabel].filter(Boolean);
    const optimistic: MessageType = {
      id: tempId,
      clientMessageId,
      text: mediaType === 'document' ? `${DOCUMENT_TEXT_PREFIX} ${labelParts.join(' | ')}\n${stagedUri}` : '',
      senderId: user.id,
      timestamp: new Date(),
      type: mediaType === 'document' ? 'document' : mediaType,
      reactions: [],
      status: 'queued',
      imageUrl: mediaType === 'image' ? stagedUri : undefined,
      videoUrl: mediaType === 'video' ? stagedUri : undefined,
      offlineImageUri: mediaType === 'image' ? stagedUri : undefined,
      offlineVideoUri: mediaType === 'video' ? stagedUri : undefined,
      document:
        mediaType === 'document'
          ? {
              name: fileName,
              url: stagedUri,
              sizeLabel: documentSizeLabel ?? null,
              typeLabel: documentTypeLabel ?? null,
            }
          : undefined,
      replyToId: replyingTo?.id ?? null,
      replyTo: replyingTo || undefined,
    };

    setMessages((prev) => [...prev, optimistic]);
    setReplyingTo(null);
    setEditingMessage(null);
    setViewOnceMode(false);

    await ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
      chatMessageToLocalRow(user.id, activePeerMessageUserId, optimistic),
    ]);
    await ChatRepository.upsertPendingOutboxItem(
      user.id,
      buildMediaOutboxRow({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: optimistic,
        localUri: stagedUri,
        fileName,
        contentType,
        mediaType,
        documentSizeLabel: documentSizeLabel ?? null,
        documentTypeLabel: documentTypeLabel ?? null,
      }),
    );
    void ChatOutboxService.flushPending(user.id).catch((error) => {
      if (!isLikelyNetworkError(error)) {
        console.log('[chat] flush queued media outbox error', error);
      }
    });

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
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

      const nextMessage = mapRowToMessage(data as MessageRow);
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
      const queuedMessage: MessageType = { ...optimisticLocationMessage, status: 'queued' };
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: queuedMessage,
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued location outbox error', persistError));
      setMessages((prev) => setMessageStatus(prev, tempId, 'queued'));
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
    try {
      return await fetchRemoteSystemMessages({
        currentUserId: user.id,
        peerUserId: activePeerMessageUserId,
        mapRow: (row) => mapSystemRowToMessage(row as SystemMessageRow),
      });
    } catch (error) {
      console.log('[chat] fetch system messages error', error);
      return [] as MessageType[];
    }
  }, [activePeerMessageUserId, mapSystemRowToMessage, user?.id]);

  const fetchMessages = useCallback(async () => {
    if (!user?.id || !activePeerMessageUserId) return;
    if (!isScreenFocusedRef.current) return;
    const fetchKey = `${user.id}:${activePeerMessageUserId}`;
    if (fetchMessagesInFlightRef.current?.key === fetchKey) {
      await fetchMessagesInFlightRef.current.promise;
      return;
    }
    const run = async () => {
    const { data, error, isIncrementalFetch, threadSyncCursor } = await fetchRemoteThreadMessages({
      currentUserId: user.id,
      peerUserId: activePeerMessageUserId,
      pageSize: PAGE_SIZE,
      selectFields: MESSAGE_SELECT_FIELDS,
      currentMessages: messagesRef.current,
    });
    const isStaleFetch = activePeerMessageUserIdRef.current !== activePeerMessageUserId;
    if (isStaleFetch) {
      return;
    }
    if (!isChatInstanceMountedRef.current) {
      return;
    }

    if (error) {
      void ChatRepository.markSyncFailed(user.id, 'thread_messages', {
        code: (error as { code?: string })?.code ?? null,
        message: error.message || 'Failed to load thread messages',
      }, { threadId: activePeerMessageUserId });
      console.log('[chat] fetch messages error', error);
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
        return;
      }
      setMessagesLoaded(true);
      setThreadBootstrapSettled(true);
      setRemoteMessagesChecked(true);
      return;
    }

    const hiddenSet = hiddenMessageIdsRef.current;
    const previousById = new Map(messagesRef.current.map((message) => [message.id, message] as const));
    const mapped: MessageType[] = (data || [])
      .map((row: MessageRow) => {
        const nextMessage = mapRowToMessage(row);
        const previous = previousById.get(nextMessage.id);
        const withOfflineMedia = mergeOfflineMediaIntoMessage(nextMessage, previous);
        return previous
          ? mergeMessageWithMonotonicReceipt(previous, withOfflineMedia)
          : withOfflineMedia;
      })
      .filter((msg) => !hiddenSet.has(msg.id));

    const ordered = isIncrementalFetch ? mapped : mapped.reverse();
    const systemRows = await fetchSystemMessages();
    if (!isChatInstanceMountedRef.current) {
      return;
    }
    const combined = [...ordered, ...systemRows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const linked = reconcileDeliveredFallback(linkReplies(combined));
    let mergedForState: MessageType[] = linked;
    setMessages((prev) => {
      if (!isIncrementalFetch && linked.length === 0 && prev.length > 0) {
        mergedForState = prev;
        return prev;
      }
      const fetchedMessages = isIncrementalFetch ? mergeIncrementalFetchedMessages(prev, linked) : linked;
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
        getMessageLocalObserverKey,
      );
      return mergedForState;
    });
    setMessagesLoaded(true);
    setThreadBootstrapSettled(true);
    setRemoteMessagesChecked(true);
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

  useEffect(() => {
    if (!user?.id || !activePeerMessageUserId || !networkReady) return;
    void flushThreadOutboxAndRefresh({
      currentUserId: user.id,
      peerUserId: activePeerMessageUserId,
      fetchMessages,
      onUnexpectedError: (error) => {
        console.log('[chat] local outbox flush error', error);
      },
    }).catch(() => {});
  }, [activePeerMessageUserId, fetchMessages, networkReady, user?.id]);

  useEffect(() => {
    if (!user?.id || !activePeerMessageUserId) return;
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
      threadSyncCoordinatorRef.current = null;
      coordinator.stop();
    };
  }, [activePeerMessageUserId, fetchMessages, networkReady, refreshPeerStatus, triggerReconnectToast, user?.id]);

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
      pendingServerReadIdsRef.current.clear();
      if (readReceiptFlushTimerRef.current) {
        clearTimeout(readReceiptFlushTimerRef.current);
        readReceiptFlushTimerRef.current = null;
      }
      if (localThreadReadPersistTimerRef.current) {
        clearTimeout(localThreadReadPersistTimerRef.current);
        localThreadReadPersistTimerRef.current = null;
      }
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
    const clientMessageId =
      failedMessage.clientMessageId ??
      (messageId.startsWith('temp-') ? messageId : `retry-${messageId}-${Date.now()}`);
    const sendingRetryMessage: MessageType = { ...failedMessage, clientMessageId, status: 'sending' };

    Haptics.selectionAsync().catch(() => {});

    setMessages((prev) =>
      setMessageStatus(
        prev.map((msg) => (msg.id === messageId ? { ...msg, clientMessageId } : msg)),
        messageId,
        'sending',
      )
    );
    await persistLocalTextOutboxState({
      ownerUserId: user.id,
      threadId: activePeerMessageUserId,
      message: sendingRetryMessage,
      outboxStatus: 'sending',
    }).catch((persistError) => console.log('[chat] persist retry text outbox error', persistError));

    if (!networkReady) {
      const queuedRetryMessage: MessageType = {
        ...sendingRetryMessage,
        status: getRetryFailedTextFailureStatus({
          isNetworkFailure: true,
        }),
      };
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: queuedRetryMessage,
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued retry text outbox error', persistError));
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                status: getRetryFailedTextFailureStatus({
                  isNetworkFailure: true,
                }),
              }
            : msg
        )
      );
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        text: retryPayload.text,
        client_message_id: clientMessageId,
        sender_id: user.id,
        receiver_id: activePeerMessageUserId,
        is_read: false,
        message_type: 'text',
        reply_to_message_id: retryPayload.replyToMessageId,
      })
      .select(MESSAGE_SELECT_FIELDS)
      .single();

    if (error || !data) {
      if (isLikelyNetworkError(error)) {
        const queuedRetryMessage: MessageType = {
          ...sendingRetryMessage,
          status: getRetryFailedTextFailureStatus({
            isNetworkFailure: true,
          }),
        };
        void persistLocalTextOutboxState({
          ownerUserId: user.id,
          threadId: activePeerMessageUserId,
          message: queuedRetryMessage,
          outboxStatus: 'queued',
        }).catch((persistError) => console.log('[chat] persist queued retry text outbox error', persistError));
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                status: getRetryFailedTextFailureStatus({
                  isNetworkFailure: true,
                }),
              }
            : msg
        )
        );
        return;
      }
      console.log('[chat] retry failed message error', error);
      const failedRetryMessage: MessageType = {
        ...sendingRetryMessage,
        status: getRetryFailedTextFailureStatus({
          isNetworkFailure: false,
        }),
      };
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: failedRetryMessage,
        outboxStatus: 'failed',
        error: {
          code: (error as { code?: string } | null)?.code ?? 'retry_failed',
          message: (error as { message?: string } | null)?.message ?? 'Unable to retry message',
        },
      }).catch((persistError) => console.log('[chat] persist failed retry text outbox error', persistError));
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
              ? {
                  ...msg,
                  status: getRetryFailedTextFailureStatus({
                    isNetworkFailure: false,
                  }),
                }
              : msg
        )
      );
      Alert.alert('Retry failed', 'Unable to resend this message right now.');
      return;
    }

    const mapped = mapRowToMessage(data as MessageRow);
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
    setMessages((current) => setMessageStatus(current, message.id, networkReady ? 'sending' : 'queued'));
    try {
      const result = await ChatOutboxService.retryMessage(user.id, localMessageId);
      if (!result.requeued) {
        setMessages((current) => setMessageStatus(current, message.id, 'failed'));
        Alert.alert('Retry unavailable', 'This attachment is no longer available on this device.');
      }
    } catch (error) {
      setMessages((current) => setMessageStatus(current, message.id, 'failed'));
      if (!isLikelyNetworkError(error)) {
        Alert.alert('Retry failed', 'Unable to resend this attachment right now.');
      }
    }
  }, [isChatBlocked, networkReady, retryFailedTextMessage, user?.id]);

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
      const localRows = await ChatRepository.getMessages(user.id, activePeerMessageUserId, {
        limit: PAGE_SIZE,
        before: oldestTimestamp.toISOString(),
      });
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
      const mapped: MessageType[] = (data || []).map((row: MessageRow) =>
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

  useFocusEffect(
    useCallback(() => {
      if (!user?.id || !activePeerMessageUserId) return () => {};
      void (async () => {
        await localHydrationActionRefs.current.fetchHiddenMessages();
        await localHydrationActionRefs.current.fetchBlockStatus();
        await localHydrationActionRefs.current.fetchPinnedMessages();
        await localHydrationActionRefs.current.fetchMessages();
      })();
      return () => {};
    }, [activePeerMessageUserId, user?.id])
  );

  useFocusEffect(
    useCallback(() => {
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
        const incomingMessage = mapRowToMessage(row as MessageRow);
        void ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
          chatMessageToLocalRow(user.id, activePeerMessageUserId, incomingMessage),
        ]).catch((error) => console.log('[chat] inbox realtime insert local persist error', error));
        void ChatRepository.markSyncSucceeded(user.id, 'thread_messages', {
          threadId: activePeerMessageUserId,
          cursor: row.created_at,
        });
        setMessages((prev) => {
          if (hiddenMessageIdsRef.current.has(row.id)) return prev;
          if (prev.some((msg) => msg.id === row.id)) return prev;
          return reconcileDeliveredFallback(linkReplies([...prev, incomingMessage]));
        });
        if (!hiddenMessageIdsRef.current.has(row.id)) {
          void syncMessageReactions([row.id]);
          if (row.is_view_once) {
            void syncViewOnceStatus([row.id]);
          }
        }
        void acknowledgeIncomingMessagesDelivered(user.id, row.id, activePeerMessageUserId);
        void focusedThreadReadActionRef.current({ forceRemote: true });
      },
      onInboxUpdate: (row) => {
        if (hiddenMessageIdsRef.current.has(row.id)) return;
        setIsTyping(false);
        const previous = messagesRef.current.find((msg) => msg.id === row.id);
        const nextMessage = mergeOfflineMediaIntoMessage(mapRowToMessage(row as MessageRow), previous);
        void ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
          chatMessageToLocalRow(user.id, activePeerMessageUserId, nextMessage),
        ]).catch((error) => console.log('[chat] inbox realtime update local persist error', error));
        void ChatRepository.markSyncSucceeded(user.id, 'thread_messages', {
          threadId: activePeerMessageUserId,
          cursor: row.created_at,
        });
        setMessages((prev) =>
          reconcileDeliveredFallback(
            linkReplies(
              prev.map((msg) =>
                msg.id === row.id
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
      },
      onSentInsert: (row) => {
        const sentMessage = mapRowToMessage(row as MessageRow);
        void ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
          chatMessageToLocalRow(user.id, activePeerMessageUserId, sentMessage),
        ]).catch((error) => console.log('[chat] sent realtime insert local persist error', error));
        void ChatRepository.markSyncSucceeded(user.id, 'thread_messages', {
          threadId: activePeerMessageUserId,
          cursor: row.created_at,
        });
        setMessages((prev) => {
          if (hiddenMessageIdsRef.current.has(row.id)) return prev;
          if (prev.some((msg) => msg.id === row.id)) return prev;
          const rowType = row.message_type ?? 'text';
          const tempIndex = prev.findIndex((msg) => {
            if (row.client_message_id && msg.clientMessageId === row.client_message_id) return true;
            if ((msg.status !== 'sending' && msg.status !== 'queued') || msg.senderId !== user.id) return false;
            if (rowType === 'voice') return msg.type === 'voice';
            if (rowType === 'image' || rowType === 'video') return msg.type === rowType;
            if (rowType === 'text' && row.text?.startsWith(DOCUMENT_TEXT_PREFIX)) return msg.type === 'document';
            return msg.text === row.text;
          });
          const nextMessage = mergeOfflineMediaIntoMessage(sentMessage, prev[tempIndex]);
          if (tempIndex >= 0) {
            const previous = prev[tempIndex];
            if (rowType === 'image' && previous?.offlineImageUri && nextMessage.imageUrl) {
              setCachedImageUris((current) =>
                current[nextMessage.imageUrl!] === previous.offlineImageUri
                  ? current
                  : { ...current, [nextMessage.imageUrl!]: previous.offlineImageUri! }
              );
              void rememberOfflineImageUri(nextMessage.imageUrl, previous.offlineImageUri, nextMessage.imageUrl);
              nextMessage.offlineImageUri = previous.offlineImageUri;
            }
            if (rowType === 'video' && previous?.offlineVideoUri && nextMessage.videoUrl) {
              setCachedVideoUris((current) =>
                current[nextMessage.videoUrl!] === previous.offlineVideoUri
                  ? current
                  : { ...current, [nextMessage.videoUrl!]: previous.offlineVideoUri! }
              );
              void rememberOfflineVideoUri(nextMessage.videoUrl, previous.offlineVideoUri, nextMessage.videoUrl);
              nextMessage.offlineVideoUri = previous.offlineVideoUri;
            }
            const next = [...prev];
            next[tempIndex] = nextMessage;
            return reconcileDeliveredFallback(linkReplies(next));
          }
          return reconcileDeliveredFallback(linkReplies([...prev, mergeOfflineMediaIntoMessage(nextMessage, undefined)]));
        });
        if (!hiddenMessageIdsRef.current.has(row.id)) {
          void syncMessageReactions([row.id]);
          if (row.is_view_once) {
            void syncViewOnceStatus([row.id]);
          }
        }
        if (!row.is_read && !row.delivered_at) {
          scheduleOutgoingReceiptStateSync(row.id);
        }
      },
      onSentUpdate: (row) => {
        if (hiddenMessageIdsRef.current.has(row.id)) return;
        const nextMessage = mapRowToMessage(row as MessageRow);
        void ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
          chatMessageToLocalRow(user.id, activePeerMessageUserId, nextMessage),
        ]).catch((error) => console.log('[chat] sent realtime update local persist error', error));
        void ChatRepository.markSyncSucceeded(user.id, 'thread_messages', {
          threadId: activePeerMessageUserId,
          cursor: row.created_at,
        });
        setMessages((prev) =>
          reconcileDeliveredFallback(
            linkReplies(
              prev.map((msg) =>
                msg.id === row.id
                  ? {
                      ...mergeMessageWithMonotonicReceipt(msg, nextMessage),
                      reactions: msg.reactions,
                    }
                  : msg
              ),
            ),
          ),
        );
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
      fetchMessages,
      linkReplies,
      mapRowToMessage,
      mapSystemRowToMessage,
      reconcileDeliveredFallback,
      scheduleOutgoingReceiptStateSync,
      syncMessageReactions,
      syncViewOnceStatus,
      user?.id,
    ]),
  );

  useFocusEffect(
    useCallback(() => {
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
        setViewOnceStatus((prev) => {
          const current = prev[row.message_id] ?? { viewedByMe: false, viewedByPeer: false };
          const next = {
            viewedByMe: current.viewedByMe || row.viewer_id === user.id,
            viewedByPeer: current.viewedByPeer || row.viewer_id === conversationId,
          };
          return { ...prev, [row.message_id]: next };
        });
        },
      });

      return () => {
        stopAncillaryRealtime();
      };
    }, [applyReactionUpdate, conversationId, resolvedPeerAuthUserId, user?.id]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!user?.id || !resolvedPeerAuthUserId) return;
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
    ]),
  );

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
    const readKey = `${user.id}:${activePeerMessageUserId}`;
    const currentUserId = user.id;
    const peerUserId = activePeerMessageUserId;

    setMessages((prev) =>
      markLoadedIncomingMessagesRead({
        items: prev,
        currentUserId,
      }),
    );

    const existingRead = focusedThreadReadInFlightRef.current.get(readKey);
    if (existingRead) {
      await existingRead;
      if (!options?.forceRemote) return;
    }
    if (!options?.forceRemote && focusedThreadReadCompletedRef.current.has(readKey)) {
      return;
    }
    if (options?.forceRemote) {
      focusedThreadReadCompletedRef.current.delete(readKey);
    }
    const run = (async () => {
      try {
        await ChatRepository.markThreadRead(currentUserId, peerUserId);
      } catch (localError) {
        console.log('[chat] local mark focused thread read error', localError);
      }

      try {
        const { error } = await Promise.resolve(
          ChatThreadActionsService.markThreadRead({
            peerUserId,
            currentUserId,
          }),
        );
        if (error) {
          console.log('[chat] mark focused thread read error', error);
        } else {
          focusedThreadReadCompletedRef.current.add(readKey);
        }
      } catch (error) {
        console.log('[chat] mark focused thread read exception', error);
      }
    })().finally(() => {
      if (focusedThreadReadInFlightRef.current.get(readKey) === run) {
        focusedThreadReadInFlightRef.current.delete(readKey);
      }
    });

    focusedThreadReadInFlightRef.current.set(readKey, run);
    await run;
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
          focusedThreadReadCompletedRef.current.delete(
            `${user.id}:${activePeerMessageUserId}`,
          );
        }
        viewableReadCandidateIdsRef.current.clear();
        Object.values(pendingReadTimersRef.current).forEach((timer) => clearTimeout(timer));
        pendingReadTimersRef.current = {};
        pendingServerReadIdsRef.current.clear();
        if (readReceiptFlushTimerRef.current) {
          clearTimeout(readReceiptFlushTimerRef.current);
          readReceiptFlushTimerRef.current = null;
        }
        if (localThreadReadPersistTimerRef.current) {
          clearTimeout(localThreadReadPersistTimerRef.current);
          localThreadReadPersistTimerRef.current = null;
        }
      };
    }, [activePeerMessageUserId, markFocusedThreadRead, user?.id]),
  );

  const flushReadReceipts = useCallback(() => {
    readReceiptFlushTimerRef.current = null;
    const messageIds = Array.from(pendingServerReadIdsRef.current);
    pendingServerReadIdsRef.current.clear();
    if (!user?.id || messageIds.length === 0) return;
    void Promise.resolve(
      ChatThreadActionsService.markMessagesRead({
        messageIds,
        currentUserId: user.id,
      }),
    ).then(({ error }) => {
      if (error) {
        console.log('[chat] mark messages read error', error);
      }
    }).catch((error) => {
      console.log('[chat] mark messages read exception', error);
    });
  }, [user?.id]);

  const scheduleReadReceiptFlush = useCallback(
    (messageId: string) => {
      pendingServerReadIdsRef.current.add(messageId);
      if (!readReceiptFlushTimerRef.current) {
        readReceiptFlushTimerRef.current = setTimeout(flushReadReceipts, 120);
      }
      if (
        user?.id &&
        activePeerMessageUserId &&
        !localThreadReadPersistTimerRef.current
      ) {
        localThreadReadPersistTimerRef.current = setTimeout(() => {
          localThreadReadPersistTimerRef.current = null;
          void ChatRepository.markThreadRead(user.id, activePeerMessageUserId).catch((localError) =>
            console.log('[chat] local mark thread read error', localError),
          );
        }, 120);
      }
    },
    [activePeerMessageUserId, flushReadReceipts, user?.id],
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
      next.set(item.id, {
        isMyMessage,
        showAvatar,
        showAvatarSpacer,
        isGroupedWithPrev,
        isGroupedWithNext,
        showDateSeparator: !prevMessage || !isSameDay(prevMessage.timestamp, item.timestamp),
        timeLabel: formatTime(item.timestamp),
        imageSize: item.type === 'image' && item.imageUrl ? imageSizes[item.imageUrl] : undefined,
        cachedImageUrl:
          item.type === 'image' && item.imageUrl ? cachedImageUris[item.imageUrl] : undefined,
        cachedVideoUrl:
          item.type === 'video' && item.videoUrl ? cachedVideoUris[item.videoUrl] : undefined,
        viewOnceViewedByMe: viewOnceStatus[item.id]?.viewedByMe ?? false,
        viewOnceViewedByPeer: viewOnceStatus[item.id]?.viewedByPeer ?? false,
        isActionPinned: pinnedMessageIdSet.has(item.id),
      });
    });
    return next;
  }, [
    cachedImageUris,
    cachedVideoUris,
    formatTime,
    imageSizes,
    isChatBlocked,
    isSameDay,
    pinnedMessageIdSet,
    renderedMessages,
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
      const index = messagesRef.current.findIndex((msg) => msg.id === messageId);
      if (index < 0) return;
      if (jumpSettleRef.current) {
        clearTimeout(jumpSettleRef.current);
        jumpSettleRef.current = null;
      }
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.42 });
      jumpSettleRef.current = setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      }, 320);
      focusMessage(messageId);
    },
    [focusMessage]
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
      setRemoteSearchResults(((data ?? []) as MessageRow[]).map(mapRowToMessage));
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
      Alert.alert('Edit message', 'Unable to update this message right now.');
      await fetchMessages();
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    const mapped = mapRowToMessage(row as MessageRow);
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
  }, [activePeerMessageUserId, editingMessage, fetchMessages, inputText, mapRowToMessage, updateTyping, user?.id]);

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
    const nextType: MessageType['type'] = 'text';
    const tempId = `temp-${Date.now()}`;
    const clientMessageId = tempId;
    const optimistic: MessageType = {
      id: tempId,
      clientMessageId,
      text: trimmed,
      senderId: user.id,
      timestamp: new Date(),
      type: nextType,
      reactions: [],
      status: 'sending',
      replyToId: replyingTo?.id ?? null,
      replyTo: replyingTo || undefined,
    };

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
      const queuedMessage: MessageType = { ...optimistic, status: 'queued' };
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: queuedMessage,
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued text outbox error', persistError));
      setMessages((prev) => setMessageStatus(prev, tempId, 'queued'));
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
      const queuedMessage: MessageType = { ...optimisticStickerMessage, status: 'queued' };
      void persistLocalTextOutboxState({
        ownerUserId: user.id,
        threadId: activePeerMessageUserId,
        message: queuedMessage,
        outboxStatus: 'queued',
      }).catch((persistError) => console.log('[chat] persist queued sticker outbox error', persistError));
      setMessages((prev) => setMessageStatus(prev, tempId, 'queued'));
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
    const extension = uri.split('.').pop()?.toLowerCase() || 'm4a';
    const fileName = `voice-${Date.now()}.${extension}`;
    const contentType =
      extension === 'm4a'
        ? 'audio/m4a'
        : extension === 'aac'
        ? 'audio/aac'
        : extension === 'wav'
        ? 'audio/wav'
        : extension === 'mp3'
        ? 'audio/mpeg'
        : extension === 'caf'
        ? 'audio/x-caf'
        : extension === '3gp'
        ? 'audio/3gpp'
        : 'application/octet-stream';

    try {
      const stagedUri = await stageOfflineChatUpload(uri, fileName);
      const localVoiceMessage: MessageType = {
        ...optimistic,
        status: networkReady ? 'sending' : 'queued',
        voiceMessage: optimistic.voiceMessage
          ? { ...optimistic.voiceMessage, audioPath: stagedUri }
          : optimistic.voiceMessage,
      };
      await ChatRepository.upsertMessages(user.id, activePeerMessageUserId, [
        chatMessageToLocalRow(user.id, activePeerMessageUserId, localVoiceMessage),
      ]);
      await ChatRepository.upsertPendingOutboxItem(
        user.id,
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
                ...msg,
                status: networkReady ? ('sending' as const) : ('queued' as const),
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
      Alert.alert('Voice message', 'Something went wrong. Please try again.');
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
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
    let playbackUri = audioPath;
    if (!audioPath.startsWith('file://')) {
      const { data, error } = await supabase
        .storage
        .from('voice-messages')
        .createSignedUrl(audioPath, 3600);
      if (error || !data?.signedUrl) {
        console.log('[chat] signed url error', error);
        Alert.alert('Voice message', 'Unable to load this audio.');
        return;
      }
      playbackUri = data.signedUrl;
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
  }, [playingVoiceId, stopVoicePlayback]);

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
    let queueCandidate: { uri: string; fileName: string; contentType: string; mediaType: 'image' | 'video' } | null = null;
    try {
      const fallbackName = asset.fileName ?? asset.uri.split('/').pop() ?? `camera-${Date.now()}`;
      const baseContentType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const normalized =
        asset.type === 'image'
          ? await normalizeHeicImage(asset, fallbackName)
          : { uri: asset.uri, fileName: fallbackName, contentType: baseContentType };
      queueCandidate = {
        uri: normalized.uri,
        fileName: normalized.fileName,
        contentType: normalized.contentType,
        mediaType: asset.type === 'video' ? 'video' : 'image',
      };

      const netState = await fetchNetInfo();
      const canUseLiveNetwork = Boolean(netState.isConnected) && netState.isInternetReachable !== false;
      if (!viewOnceMode && !canUseLiveNetwork) {
        updateMediaUploadStatus(
          uploadStatusId,
          `Queueing ${mediaKind}...`,
          'This will send automatically when connection returns.',
          'clock-outline'
        );
        await queueMediaAttachment({
          localUri: queueCandidate.uri,
          fileName: queueCandidate.fileName,
          contentType: queueCandidate.contentType,
          mediaType: queueCandidate.mediaType,
        });
        return;
      }

      if (viewOnceMode) {
        updateMediaUploadStatus(
          uploadStatusId,
          `Securing private ${mediaKind}...`,
          'Encrypting and uploading this media for one-time viewing.',
          'shield-lock-outline'
        );
        await sendEncryptedMediaAttachment({
          uri: normalized.uri,
          fileName: normalized.fileName,
          contentType: normalized.contentType,
          kind: asset.type === 'video' ? 'video' : 'image',
        });
      } else {
        updateMediaUploadStatus(
          uploadStatusId,
          `Uploading ${mediaKind}...`,
          'This can take a moment on larger videos.',
          'cloud-upload-outline'
        );
        const { signedUrl, filePath } = await uploadChatMedia({
          uri: normalized.uri,
          fileName: normalized.fileName,
          contentType: normalized.contentType,
        });
        updateMediaUploadStatus(
          uploadStatusId,
          `Sending ${mediaKind}...`,
          'Almost done.',
          'send-outline'
        );
        if (asset.type === 'image') {
          await sendImageAttachment({ imageUrl: signedUrl, storagePath: filePath });
        } else {
          await sendVideoAttachment({ videoUrl: signedUrl, storagePath: filePath });
        }
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
    sendImageAttachment,
    sendVideoAttachment,
    queueMediaAttachment,
    updateMediaUploadStatus,
    uploadChatMedia,
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
    let queueCandidate: { uri: string; fileName: string; contentType: string; mediaType: 'image' | 'video' } | null = null;
    try {
      const fallbackName = asset.fileName ?? asset.uri.split('/').pop() ?? `library-${Date.now()}`;
      const baseContentType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const normalized =
        asset.type === 'image'
          ? await normalizeHeicImage(asset, fallbackName)
          : { uri: asset.uri, fileName: fallbackName, contentType: baseContentType };
      queueCandidate = {
        uri: normalized.uri,
        fileName: normalized.fileName,
        contentType: normalized.contentType,
        mediaType: asset.type === 'video' ? 'video' : 'image',
      };

      const netState = await fetchNetInfo();
      const canUseLiveNetwork = Boolean(netState.isConnected) && netState.isInternetReachable !== false;
      if (!viewOnceMode && !canUseLiveNetwork) {
        updateMediaUploadStatus(
          uploadStatusId,
          `Queueing ${mediaKind}...`,
          'This will send automatically when connection returns.',
          'clock-outline'
        );
        await queueMediaAttachment({
          localUri: queueCandidate.uri,
          fileName: queueCandidate.fileName,
          contentType: queueCandidate.contentType,
          mediaType: queueCandidate.mediaType,
        });
        return;
      }

      if (viewOnceMode) {
        updateMediaUploadStatus(
          uploadStatusId,
          `Securing private ${mediaKind}...`,
          'Encrypting and uploading this media for one-time viewing.',
          'shield-lock-outline'
        );
        await sendEncryptedMediaAttachment({
          uri: normalized.uri,
          fileName: normalized.fileName,
          contentType: normalized.contentType,
          kind: asset.type === 'video' ? 'video' : 'image',
        });
      } else {
        updateMediaUploadStatus(
          uploadStatusId,
          `Uploading ${mediaKind}...`,
          'This can take a moment on larger videos.',
          'cloud-upload-outline'
        );
        const { signedUrl, filePath } = await uploadChatMedia({
          uri: normalized.uri,
          fileName: normalized.fileName,
          contentType: normalized.contentType,
        });
        updateMediaUploadStatus(
          uploadStatusId,
          `Sending ${mediaKind}...`,
          'Almost done.',
          'send-outline'
        );
        if (asset.type === 'image') {
          await sendImageAttachment({ imageUrl: signedUrl, storagePath: filePath });
        } else {
          await sendVideoAttachment({ videoUrl: signedUrl, storagePath: filePath });
        }
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
    sendImageAttachment,
    sendVideoAttachment,
    queueMediaAttachment,
    updateMediaUploadStatus,
    uploadChatMedia,
    viewOnceMode,
  ]);

  const handleDocumentPress = useCallback(async () => {
    if (mediaUploadStatus) {
      Alert.alert('Upload in progress', 'Please wait for the current media upload to finish.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
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
    const { contentHeight, layoutHeight, offsetY } = listMetricsRef.current;
    return Math.max(0, contentHeight - (offsetY + layoutHeight));
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
    const distanceToBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
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
      shouldAutoScrollRef.current = true;
      scheduleIdleTask(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
        initialAutoScrollDoneRef.current = true;
      });
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
  }, [messages.length, threadBootstrapSettled]);

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

  useEffect(() => {
    const maxWidth = Math.min(responsive.width * 0.72, 340);
    const minHeight = 220;
    const maxHeight = 480;
    const pending: string[] = [];
    renderedMessages.forEach((msg) => {
      if (
        msg.type === 'image' &&
        msg.imageUrl &&
        !imageSizes[msg.imageUrl] &&
        !measuredImageUrlsRef.current.has(msg.imageUrl)
      ) {
        measuredImageUrlsRef.current.add(msg.imageUrl);
        pending.push(msg.imageUrl);
      }
    });
    if (pending.length === 0) return;
    const measuredSizes: Record<string, { width: number; height: number }> = {};
    let remaining = pending.length;
    let cancelled = false;
    const commitMeasuredSizes = () => {
      remaining -= 1;
      if (cancelled || remaining > 0) return;
      setImageSizes((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.entries(measuredSizes).forEach(([url, size]) => {
          if (next[url]) return;
          next[url] = size;
          changed = true;
        });
        return changed ? next : prev;
      });
    };
    pending.forEach((url) => {
      Image.getSize(
        url,
        (width, height) => {
          if (!width || !height) {
            measuredSizes[url] = { width: maxWidth, height: 320 };
            commitMeasuredSizes();
            return;
          }
          const ratio = height / width;
          const scaledHeight = Math.round(maxWidth * ratio);
          const clampedHeight = Math.max(minHeight, Math.min(maxHeight, scaledHeight));
          measuredSizes[url] = { width: maxWidth, height: clampedHeight };
          commitMeasuredSizes();
        },
        () => {
          measuredSizes[url] = { width: maxWidth, height: 320 };
          commitMeasuredSizes();
        }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [imageSizes, renderedMessages, responsive.width]);

  const openVideoViewer = useCallback(async (url: string) => {
    const resolved = cachedVideoUris[url] ?? await resolveQueuedVideoUri(url, networkReady);
    if (resolved && resolved !== url) {
      setCachedVideoUris((prev) => (prev[url] === resolved ? prev : { ...prev, [url]: resolved }));
    }
    setVideoViewerUrl(resolved || url);
  }, [cachedVideoUris, networkReady]);

  const openImageViewer = useCallback(async (url: string) => {
    if (!url) return;
    if (!url.startsWith('http')) {
      setImageViewerUrl(url);
      return;
    }
    const cached = cachedImageUris[url] ?? await getOfflineImageUri(url);
    if (cached) {
      setCachedImageUris((prev) => (prev[url] === cached ? prev : { ...prev, [url]: cached }));
      setImageViewerUrl(cached);
      return;
    }
    if (!networkReady) {
      setImageViewerUrl(url);
      return;
    }
    const downloaded = await cacheOfflineImage(url, url);
    if (downloaded) {
      setCachedImageUris((prev) => (prev[url] === downloaded ? prev : { ...prev, [url]: downloaded }));
      setImageViewerUrl(downloaded);
      return;
    }
    setImageViewerUrl(url);
  }, [cachedImageUris, networkReady]);

  const handleOpenDocument = useCallback((doc?: MessageType['document']) => {
    if (!doc?.url) return;
    const url = doc.url;
    const typeLabel = doc.typeLabel?.toLowerCase() ?? '';
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    if (typeLabel === 'image' || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(ext)) {
      setImageViewerUrl(url);
      return;
    }
    if (typeLabel === 'video' || ['mp4', 'mov', 'm4v', 'webm'].includes(ext)) {
      void openVideoViewer(url);
      return;
    }
    const isPdf = typeLabel === 'pdf' || ext === 'pdf';
    const isText = typeLabel === 'txt' || ext === 'txt' || ext === 'text';
    const previewUrl = isPdf || isText
      ? url
      : `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
    setDocumentViewerUrl(previewUrl);
  }, [openVideoViewer, setImageViewerUrl]);

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
    resetImageScale();
    setImageViewerUrl(null);
  }, [resetImageScale]);

  const closeVideoViewer = useCallback(() => {
    setVideoViewerUrl(null);
  }, []);

  const closeDocumentViewer = useCallback(() => {
    setDocumentViewerUrl(null);
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
  }, [hasMore, loadEarlier, loadingEarlier]);

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
      await fetchMessages();
      return;
    }

    void ChatRepository.deleteMessages(user.id, activePeerMessageUserId, [message.id]).catch((deleteError) =>
      console.log('[chat] delete hidden local message error', deleteError),
    );
  }, [activePeerMessageUserId, closeMessageActions, fetchHiddenMessages, fetchMessages, updateHiddenMessageIds, user?.id]);

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
      await fetchMessages();
    }
  }, [closeMessageActions, conversationId, fetchMessages, user?.id]);

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
      const viewOnceViewedByMe = meta?.viewOnceViewedByMe ?? false;
      const viewOnceViewedByPeer = meta?.viewOnceViewedByPeer ?? false;
      const rowHighlightQuery =
        item.type === 'text' && matchMessageIdSet.has(item.id) ? trimmedChatSearchQuery : undefined;
      const rowHighlightPress = rowHighlightQuery ? jumpToNextMatch : undefined;
      const rowDatePlanActionId = item.type === 'date_plan' ? datePlanActionId : null;
      const rowDatePlanCalendarActionId = item.type === 'date_plan' ? datePlanCalendarActionId : null;

      return (
        <View>
          {showDateSeparator && (
            <View style={styles.daySeparator}>
              <Text style={styles.daySeparatorText}>{formatDayLabel(item.timestamp)}</Text>
            </View>
          )}
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
            theme={theme}
            isDark={isDark}
            styles={styles}
            onLongPress={handleLongPress}
            onRetryFailedMessage={retryFailedTextMessage}
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
            onViewImage={(url) => {
              void openImageViewer(url);
            }}
            onViewVideo={(url) => { void openVideoViewer(url); }}
            onOpenDocument={handleOpenDocument}
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
        </View>
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
    (item: { type: 'image' | 'video'; url?: string | null }) => {
      if (!item.url) return;
      closeMediaHub();
      if (item.type === 'image') {
        void openImageViewer(item.url);
      } else {
        void openVideoViewer(item.url);
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
    <SafeAreaView style={styles.container}>
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
              {intentTypeLabel(pendingIntentRequest.type)}
              {pendingIntentRequest.expires_at
                ? ` - Closes in ${intentExpiresIn(pendingIntentRequest.expires_at)}`
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
                        handleOpenDocument({
                          name: item.name,
                          url: item.url,
                          typeLabel: item.typeLabel ?? undefined,
                          sizeLabel: item.sizeLabel ?? undefined,
                        });
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
              <VideoViewer url={viewOnceMediaUri} visible styles={styles} style={styles.viewOnceMediaVideoFull} />
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
        visible={Boolean(imageViewerUrl)}
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
              <Animated.Image
                source={{ uri: imageViewerUrl }}
                style={[
                  styles.imageViewerImage,
                  { transform: [{ scale: imageScale }] },
                ]}
                resizeMode="contain"
              />
            </PinchGestureHandler>
          )}
          <TouchableOpacity
            style={[styles.imageViewerClose, { top: Math.max(insets.top + 10, 18), right: 16 }]}
            onPress={closeImageViewer}
          >
            <MaterialCommunityIcons name="close" size={20} color={Colors.light.background} />
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        transparent
        visible={Boolean(videoViewerUrl)}
        onRequestClose={closeVideoViewer}
      >
        <View style={styles.imageViewerBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeVideoViewer}
          />
          {videoViewerUrl && (
            <VideoViewer
              url={videoViewerUrl}
              visible={Boolean(videoViewerUrl)}
              styles={styles}
            />
          )}
          <TouchableOpacity
            style={[styles.imageViewerClose, { top: Math.max(insets.top + 10, 18), right: 16 }]}
            onPress={closeVideoViewer}
          >
            <MaterialCommunityIcons name="close" size={20} color={Colors.light.background} />
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        transparent
        visible={Boolean(documentViewerUrl)}
        onRequestClose={closeDocumentViewer}
      >
        <View style={styles.imageViewerBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeDocumentViewer}
          />
          {documentViewerUrl && (
            <WebView
              source={{ uri: documentViewerUrl }}
              style={styles.documentViewer}
              startInLoadingState
            />
          )}
          <TouchableOpacity
            style={[styles.imageViewerClose, { top: Math.max(insets.top + 10, 18), right: 16 }]}
            onPress={closeDocumentViewer}
          >
            <MaterialCommunityIcons name="close" size={20} color={Colors.light.background} />
          </TouchableOpacity>
        </View>
      </Modal>

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
            <FlashList
              key={routeId}
              ref={flatListRef}
              data={renderedMessages}
              renderItem={renderMessage}
              getItemType={getMessageItemType}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.messagesList}
              ListHeaderComponent={renderLoadEarlier}
              ListEmptyComponent={
                showThreadBootstrapPlaceholder ? (
                  <View style={styles.threadBootstrapPlaceholder}>
                    <View
                      style={[
                        styles.threadBootstrapBubble,
                        styles.threadBootstrapBubblePeer,
                        { backgroundColor: withAlpha(theme.text, isDark ? 0.14 : 0.08) },
                      ]}
                    />
                    <View
                      style={[
                        styles.threadBootstrapBubble,
                        styles.threadBootstrapBubblePeerShort,
                        { backgroundColor: withAlpha(theme.text, isDark ? 0.1 : 0.06) },
                      ]}
                    />
                    <View
                      style={[
                        styles.threadBootstrapBubble,
                        styles.threadBootstrapBubbleMine,
                        { backgroundColor: withAlpha(theme.tint, isDark ? 0.22 : 0.14) },
                      ]}
                    />
                  </View>
                ) : null
              }
              drawDistance={900}
              removeClippedSubviews={Platform.OS === 'android'}
              showsVerticalScrollIndicator={false}
              bounces={false}
              alwaysBounceVertical={false}
              overScrollMode="never"
              maintainVisibleContentPosition={{
                disabled: false,
                animateAutoScrollToBottom: false,
              }}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onStartReached={handleStartReached}
              onStartReachedThreshold={0.08}
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

    </SafeAreaView>
  );
}

// [Include all the same styles from the original chat screen...]
const createStyles = (
  theme: typeof Colors.light,
  isDark: boolean,
  responsive: ResponsiveMetrics,
  attachmentSheetHeight: number,
  bottomInset: number
) => {
  const screenWidth = responsive.width;
  const screenHeight = responsive.height;
  const locationPreviewWidth = Math.min(screenWidth * 0.68, 296);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    intentBanner: {
      marginHorizontal: 16,
      marginTop: 8,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      backgroundColor: theme.backgroundSubtle,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    intentBannerText: {
      flex: 1,
    },
    intentBannerTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
    },
    intentBannerSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: theme.textMuted,
    },
    intentBannerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    intentAcceptButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    intentAcceptText: {
      color: Colors.light.background,
      fontSize: 12,
      fontWeight: '700',
    },
    intentPassButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.12),
      backgroundColor: theme.background,
    },
    intentPassText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: theme.backgroundSubtle,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    headerProfile: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerOptionsButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      marginLeft: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      backgroundColor: theme.backgroundSubtle,
    },
    headerOptionsButtonBlocked: {
      borderColor: withAlpha(theme.tint, isDark ? 0.36 : 0.24),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
    },
    headerOptionsButtonActive: {
      borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.22),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
    },
    headerOptionsStateStack: {
      position: 'absolute',
      right: -6,
      top: -6,
    },
    headerOptionsStateRail: {
      flexDirection: 'row',
      gap: 4,
      alignItems: 'center',
    },
    headerOptionsStateBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      backgroundColor: theme.tint,
      borderWidth: 2,
      borderColor: theme.background,
    },
    headerOptionsStateBadgeMuted: {
      backgroundColor: '#f59e0b',
    },
    avatarContainer: {
      position: 'relative',
      marginRight: 12,
    },
    avatarPulse: {
      position: 'absolute',
      top: -4,
      left: -4,
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: withAlpha(theme.tint, 0.22),
      zIndex: 0,
    },
    avatarRing: {
      width: 46,
      height: 46,
      borderRadius: 23,
      padding: 2,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
      zIndex: 1,
    },
    avatarRingActive: {
      borderColor: 'transparent',
      shadowColor: theme.tint,
      shadowOpacity: 0.24,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    avatarInner: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.backgroundSubtle,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    onlineIndicator: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 13,
      height: 13,
      borderRadius: 6.5,
      backgroundColor: theme.secondary,
      borderWidth: 2,
      borderColor: theme.background,
      zIndex: 2,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    headerInfo: {
      flex: 1,
    },
    headerName: {
      fontSize: 17,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: theme.text,
    },
    headerStatus: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 1,
      flexShrink: 1,
    },
    headerStatusLeft: {
      color: isDark ? '#D6C0AA' : '#8E735A',
      fontFamily: 'Manrope_600SemiBold',
    },
    headerMatchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    headerStateRow: {
      alignItems: 'flex-start',
      flexDirection: 'column',
      gap: 6,
      marginTop: 6,
    },
    headerStateMeta: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      color: theme.tint,
    },
    headerStatePillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    headerStatePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.22 : 0.12),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.2),
    },
    headerStateText: {
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    headerMatchText: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.tint,
    },
    leftBetweenerThreadNotice: {
      marginHorizontal: 16,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(214, 192, 170, 0.16)' : 'rgba(143, 112, 84, 0.14)',
      backgroundColor: isDark ? 'rgba(214, 192, 170, 0.05)' : 'rgba(248, 242, 235, 0.9)',
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
    },
    leftBetweenerThreadNoticeIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(0,160,160,0.12)' : 'rgba(0,160,160,0.08)',
    },
    leftBetweenerThreadNoticeCopy: {
      flex: 1,
      gap: 2,
    },
    leftBetweenerThreadNoticeTitle: {
      fontSize: 13,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    leftBetweenerThreadNoticeText: {
      fontSize: 12,
      lineHeight: 18,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    pinnedBanner: {
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 2,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.2 : 0.85),
    },
    pinnedBannerBlur: {
      ...StyleSheet.absoluteFill,
    },
    pinnedBannerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    pinnedBannerActionsWrap: {
      overflow: 'hidden',
    },
    pinnedBannerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 2,
      paddingBottom: 12,
    },
    pinnedActionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
    },
    pinnedActionLabel: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    pinnedActionDanger: {
      backgroundColor: withAlpha(theme.danger, 0.12),
      borderColor: withAlpha(theme.danger, 0.4),
    },
    pinnedActionLabelDanger: {
      color: theme.danger,
    },
    pinnedBannerPressed: {
      opacity: 0.85,
    },
    pinnedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
      marginRight: 10,
    },
    pinnedBadgeText: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.tint,
      marginLeft: 4,
    },
    pinnedTextWrap: {
      flex: 1,
    },
    pinnedMessageText: {
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
    },
    pinnedCountText: {
      fontSize: 11,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
      marginTop: 2,
    },
    pinnedSheetBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: withAlpha(Colors.dark.background, 0.45),
    },
    pinnedSheet: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      maxHeight: screenHeight * 0.65,
      borderRadius: 22,
      backgroundColor: withAlpha(theme.background, isDark ? 0.78 : 0.94),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      overflow: 'hidden',
      shadowColor: Colors.dark.background,
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    pinnedSheetBlur: {
      ...StyleSheet.absoluteFill,
    },
    pinnedSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    pinnedSheetTitle: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    pinnedSheetCount: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 2,
    },
    pinnedSheetClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    },
    pinnedSheetContent: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    pinnedSheetCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
    },
    pinnedSheetCardPressed: {
      opacity: 0.85,
    },
    pinnedSheetIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
    },
    pinnedSheetText: {
      flex: 1,
      gap: 4,
    },
    pinnedSheetMessage: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    pinnedSheetMeta: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    pinnedSheetUnpin: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    },
    pinnedSheetEmpty: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      textAlign: 'center',
      paddingVertical: 24,
    },
    pinnedSheetHint: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      textAlign: 'center',
      paddingTop: 4,
    },
    reactionSheetBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: withAlpha(Colors.dark.background, 0.45),
    },
    reactionSheet: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      maxHeight: screenHeight * 0.6,
      borderRadius: 22,
      backgroundColor: withAlpha(theme.background, isDark ? 0.78 : 0.94),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      overflow: 'hidden',
      shadowColor: Colors.dark.background,
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    reactionSheetBlur: {
      ...StyleSheet.absoluteFill,
    },
    reactionSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    reactionSheetTitle: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    reactionSheetCount: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 2,
    },
    reactionSheetClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    },
    reactionSheetPills: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
    },
    reactionSheetPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      gap: 6,
    },
    reactionSheetPillActive: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
      borderColor: withAlpha(theme.tint, isDark ? 0.4 : 0.3),
    },
    reactionSheetPillText: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
    },
    reactionSheetPillTextActive: {
      color: theme.tint,
    },
    reactionSheetPillEmoji: {
      fontSize: 14,
    },
    reactionSheetList: {
      paddingHorizontal: 14,
      paddingBottom: 14,
      gap: 10,
    },
    reactionSheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
    },
    reactionSheetAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    reactionSheetName: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    reactionSheetEmoji: {
      fontSize: 16,
    },
    reactionSheetEmpty: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      textAlign: 'center',
      paddingVertical: 20,
    },
    reactionSheetHint: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      textAlign: 'center',
      paddingTop: 4,
    },
    headerHint: {
      position: 'absolute',
      top: 72,
      alignSelf: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.12),
      shadowColor: Colors.dark.background,
      shadowOpacity: 0.16,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    headerHintText: {
      fontSize: 11,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    datePlannerBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: withAlpha(Colors.dark.background, 0.62),
    },
    datePlannerKeyboard: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    datePlannerSheet: {
      maxHeight: screenHeight * 0.9,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: 'hidden',
      backgroundColor: withAlpha(theme.background, isDark ? 0.92 : 0.97),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
    },
    datePlannerBlur: {
      ...StyleSheet.absoluteFill,
    },
    datePlannerContent: {
      padding: 18,
      paddingBottom: Platform.OS === 'ios' ? 28 : 20,
      gap: 12,
    },
    datePlannerHeader: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
    },
    datePlannerHeaderText: {
      flex: 1,
      gap: 4,
    },
    datePlannerPersonChip: {
      marginTop: 8,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.16),
    },
    datePlannerPersonAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.backgroundSubtle,
    },
    datePlannerPersonText: {
      flexShrink: 1,
      gap: 1,
    },
    datePlannerPersonLabel: {
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      color: theme.textMuted,
    },
    datePlannerPersonName: {
      fontSize: 13,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    datePlannerEyebrow: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
      color: theme.tint,
    },
    datePlannerTitle: {
      fontSize: 24,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    datePlannerSubtitle: {
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
      lineHeight: 20,
    },
    datePlannerClose: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
    },
    datePlannerWhenCard: {
      borderRadius: 22,
      padding: 14,
      backgroundColor: withAlpha(theme.text, isDark ? 0.1 : 0.04),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      gap: 12,
    },
    datePlannerSectionTitle: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 0.9,
      color: theme.textMuted,
    },
    datePlannerWhenRow: {
      flexDirection: 'row',
      gap: 10,
    },
    datePlannerWhenButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 16,
      paddingVertical: 12,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.24 : 0.16),
    },
    datePlannerWhenLabel: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    datePlannerQuickSlotRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    datePlannerQuickSlot: {
      minWidth: '31%',
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 16,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      gap: 3,
    },
    datePlannerQuickSlotActive: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.2 : 0.1),
      borderColor: withAlpha(theme.tint, isDark ? 0.36 : 0.24),
    },
    datePlannerQuickSlotLabel: {
      fontSize: 13,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    datePlannerQuickSlotLabelActive: {
      color: theme.tint,
    },
    datePlannerQuickSlotCaption: {
      fontSize: 11,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    datePlannerQuickSlotCaptionActive: {
      color: withAlpha(theme.tint, isDark ? 0.92 : 0.84),
    },
    datePlannerTabs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    datePlannerTabButton: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    datePlannerTabButtonActive: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.22 : 0.12),
      borderColor: withAlpha(theme.tint, isDark ? 0.35 : 0.24),
    },
    datePlannerTabText: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
    },
    datePlannerTabTextActive: {
      color: theme.text,
    },
    datePlannerList: {
      gap: 10,
    },
    dateVenueCard: {
      borderRadius: 20,
      padding: 13,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      gap: 5,
    },
    dateVenueCardSelected: {
      borderColor: withAlpha(theme.tint, 0.6),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
    },
    dateVenueCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      alignItems: 'center',
    },
    dateVenueName: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    dateVenueAddress: {
      fontSize: 12,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    dateVenueSummary: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      lineHeight: 18,
    },
    dateVenueBadgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    dateVenueBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.1),
      borderWidth: 1,
    },
    dateVenueBadgeContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    dateVenueBadgeIcon: {
      marginTop: 0.5,
    },
    dateVenueBadgeText: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.tint,
    },
    datePlannerEmpty: {
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
      lineHeight: 20,
    },
    datePlannerSearchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 11,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    datePlannerSearchInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
    },
    dateSuggestionRow: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      borderRadius: 16,
      padding: 12,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    dateSuggestionText: {
      flex: 1,
      gap: 2,
    },
    dateSuggestionTitle: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    dateSuggestionSubtitle: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    datePreferredCard: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      borderRadius: 18,
      padding: 14,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.18),
    },
    datePreferredText: {
      flex: 1,
      gap: 2,
    },
    datePreferredTitle: {
      fontSize: 14,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    datePreferredSubtitle: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      lineHeight: 18,
    },
    datePlannerSummaryCard: {
      borderRadius: 24,
      padding: 13,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      gap: 9,
    },
    datePlannerSummaryRow: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    datePlannerSummaryMap: {
      width: 104,
      height: 82,
      borderRadius: 16,
      backgroundColor: theme.background,
    },
    datePlannerSummaryText: {
      flex: 1,
      gap: 4,
    },
    datePlannerSummaryTitle: {
      fontSize: 15,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    datePlannerSummaryMeta: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.tint,
    },
    datePlannerSummaryAddress: {
      fontSize: 12,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    datePlannerSummaryActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'center',
    },
    datePlannerInsightButton: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.1),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.32 : 0.18),
    },
    datePlannerInsightButtonText: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: theme.tint,
    },
    datePlannerConciergeHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.1 : 0.05),
    },
    datePlannerConciergeHintText: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
    },
    datePlannerNoteInput: {
      minHeight: 82,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 11,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      fontSize: 14,
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
      textAlignVertical: 'top',
    },
    datePlannerSendButton: {
      borderRadius: 18,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.tint,
    },
    datePlannerSendButtonDisabled: {
      opacity: 0.5,
    },
    datePlannerSendText: {
      fontSize: 15,
      fontFamily: 'Archivo_700Bold',
      color: Colors.light.background,
    },
    dateDetailSheetWrap: {
      flex: 1,
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    dateDetailSheet: {
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: withAlpha(theme.background, isDark ? 0.84 : 0.96),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      shadowColor: Colors.dark.background,
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
      maxHeight: '84%',
    },
    dateDetailBlur: {
      ...StyleSheet.absoluteFill,
    },
    dateDetailContent: {
      padding: 18,
      gap: 16,
    },
    dateDetailHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    dateDetailHeaderText: {
      flex: 1,
      gap: 4,
    },
    dateDetailEyebrow: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: theme.tint,
    },
    dateDetailTitle: {
      fontSize: 22,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    dateDetailSubtitle: {
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
      lineHeight: 19,
    },
    dateDetailBlock: {
      gap: 10,
      padding: 14,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.04),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
    },
    dateDetailBlockTitle: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      color: theme.textMuted,
    },
    dateDetailBlockLead: {
      fontSize: 15,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
      lineHeight: 22,
    },
    dateDetailBulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    dateDetailBulletText: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
      lineHeight: 19,
    },
    conciergeOptionList: {
      gap: 10,
    },
    conciergeOptionCard: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      gap: 8,
    },
    conciergeOptionCardSelected: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.08),
      borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.2),
    },
    conciergeOptionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    conciergeOptionTitle: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    conciergeOptionDescription: {
      fontSize: 12,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
      lineHeight: 18,
    },
    headerMenuBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: withAlpha(Colors.dark.background, 0.55),
      zIndex: 1,
      elevation: 1,
    },
    headerMenuScreen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerMenuScreenHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
    },
    headerMenuScreenCopy: {
      flex: 1,
    },
    headerMenuScreenClose: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    headerMenuQuickBar: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 18,
      paddingBottom: 10,
    },
    headerMenuQuickChip: {
      flex: 1,
      minHeight: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.24 : 0.14),
    },
    headerMenuQuickChipText: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    headerMenuTitle: {
      fontSize: 18,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    headerMenuSubtitle: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
      paddingBottom: 8,
    },
    headerMenuContent: {
      paddingHorizontal: 18,
      paddingTop: 14,
    },
    headerMenuScroller: {
      flex: 1,
    },
    headerMenuSectionLabel: {
      fontSize: 11,
      fontFamily: 'Manrope_800ExtraBold',
      color: theme.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      paddingTop: 6,
      paddingBottom: 8,
    },
    headerMenuGrid: {
      gap: 8,
      paddingBottom: 10,
    },
    headerMenuActionGrid: {
      gap: 8,
    },
    headerMenuActionButton: {
      minHeight: 56,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.24 : 0.14),
      justifyContent: 'center',
    },
    headerMenuActionButtonDestructive: {
      backgroundColor: withAlpha('#ef4444', isDark ? 0.11 : 0.07),
      borderColor: withAlpha('#ef4444', isDark ? 0.28 : 0.18),
    },
    headerMenuActionButtonCopy: {
      gap: 3,
    },
    headerMenuActionButtonTitle: {
      fontSize: 14,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    headerMenuActionButtonTitleDestructive: {
      color: isDark ? '#fecaca' : '#b91c1c',
    },
    headerMenuActionButtonDescription: {
      fontSize: 11,
      lineHeight: 15,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    headerMenuRow: {
      minHeight: 54,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: withAlpha(theme.text, isDark ? 0.055 : 0.035),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerMenuRowProminent: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.07),
      borderColor: withAlpha(theme.tint, isDark ? 0.22 : 0.14),
    },
    headerMenuRowDestructive: {
      backgroundColor: withAlpha('#ef4444', isDark ? 0.11 : 0.07),
      borderWidth: 1,
      borderColor: withAlpha('#ef4444', isDark ? 0.28 : 0.18),
    },
    headerMenuRowIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.11),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.26 : 0.16),
    },
    headerMenuRowIconDestructive: {
      backgroundColor: withAlpha('#ef4444', isDark ? 0.18 : 0.1),
      borderColor: withAlpha('#ef4444', isDark ? 0.3 : 0.18),
    },
    headerMenuRowCopy: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    headerMenuRowTextStack: {
      flex: 1,
      gap: 2,
    },
    headerMenuRowTitle: {
      fontSize: 14,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
      flexShrink: 1,
    },
    headerMenuRowTitleDestructive: {
      color: isDark ? '#fecaca' : '#b91c1c',
    },
    headerMenuRowDescription: {
      fontSize: 11,
      lineHeight: 15,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    headerMenuBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.32 : 0.2),
    },
    headerMenuBadgeText: {
      fontSize: 10,
      fontFamily: 'Manrope_800ExtraBold',
      color: isDark ? '#b6f4ee' : theme.tint,
      letterSpacing: 0.35,
    },
    headerMenuCancel: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      marginTop: 12,
    },
    headerMenuCancelText: {
      fontSize: 15,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
    },
    searchBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    searchSheet: {
      position: 'absolute',
      left: 16,
      right: 16,
      top: 70,
      bottom: 70,
      borderRadius: 24,
      overflow: 'hidden',
    },
    searchBlur: {
      ...StyleSheet.absoluteFill,
    },
    searchContent: {
      flex: 1,
      padding: 16,
      gap: 12,
    },
    searchHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    searchTitle: {
      fontSize: 16,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    searchClose: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.12),
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
    },
    searchResults: {
      paddingBottom: 16,
      gap: 10,
    },
    searchHint: {
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: 24,
    },
    searchResult: {
      padding: 12,
      borderRadius: 14,
      backgroundColor: withAlpha(theme.text, isDark ? 0.12 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
    },
    searchResultText: {
      fontSize: 14,
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
      marginBottom: 4,
    },
    searchHighlight: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.35 : 0.2),
      color: theme.text,
      borderRadius: 6,
      paddingHorizontal: 2,
    },
    searchResultMeta: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    mediaHubBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    mediaHubSheet: {
      position: 'absolute',
      left: 16,
      right: 16,
      top: 90,
      bottom: 70,
      borderRadius: 24,
      overflow: 'hidden',
    },
    mediaHubBlur: {
      ...StyleSheet.absoluteFill,
    },
    mediaHubContent: {
      flex: 1,
      padding: 16,
    },
    mediaHubHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    mediaHubTitle: {
      fontSize: 16,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    mediaHubClose: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    mediaHubTabs: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    mediaHubTab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      alignItems: 'center',
      backgroundColor: theme.backgroundSubtle,
    },
    mediaHubTabActive: {
      borderColor: theme.tint,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.2 : 0.12),
    },
    mediaHubTabText: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
    },
    mediaHubTabTextActive: {
      color: theme.tint,
    },
    mediaHubBody: {
      paddingBottom: 24,
    },
    mediaHubEmpty: {
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: 20,
    },
    mediaGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    mediaTile: {
      width: '30%',
      aspectRatio: 1,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.12),
    },
    mediaTileImage: {
      width: '100%',
      height: '100%',
    },
    mediaTilePlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    mediaTileLabel: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
    },
    mediaList: {
      gap: 10,
    },
    mediaListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 14,
      backgroundColor: withAlpha(theme.text, isDark ? 0.12 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
    },
    mediaListText: {
      flex: 1,
      gap: 4,
    },
    mediaListTitle: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    mediaListMeta: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },

    // Message Actions Sheet
    messageActionBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: withAlpha(Colors.dark.background, 0.45),
    },
    messageActionSheet: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      borderRadius: 20,
      backgroundColor: withAlpha(theme.background, isDark ? 0.78 : 0.94),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      overflow: 'hidden',
      shadowColor: Colors.dark.background,
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 7,
    },
    messageActionBlur: {
      ...StyleSheet.absoluteFill,
    },
    messageActionContent: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 10,
    },
    messageActionTitle: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    messageActionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
    },
    messageActionDanger: {
      backgroundColor: withAlpha('#ef4444', isDark ? 0.12 : 0.08),
      borderColor: withAlpha('#ef4444', isDark ? 0.3 : 0.18),
    },
    messageActionIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
    },
    messageActionIconDanger: {
      backgroundColor: '#ef4444',
    },
    messageActionText: {
      flex: 1,
      gap: 2,
    },
    messageActionLabel: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    messageActionLabelDanger: {
      color: '#ef4444',
    },
    messageActionHint: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    messageActionCancel: {
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      alignItems: 'center',
      backgroundColor: theme.backgroundSubtle,
    },
    messageActionCancelText: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },

    // Edit History Sheet
    editHistoryBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: withAlpha(Colors.dark.background, 0.45),
    },
    editHistorySheet: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      maxHeight: screenHeight * 0.6,
      borderRadius: 20,
      backgroundColor: withAlpha(theme.background, isDark ? 0.78 : 0.94),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      overflow: 'hidden',
      shadowColor: Colors.dark.background,
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 7,
    },
    editHistoryBlur: {
      ...StyleSheet.absoluteFill,
    },
    editHistoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    editHistoryTitle: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    editHistorySubtitle: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 2,
    },
    editHistoryClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    },
    editHistoryContent: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    editHistoryCard: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      gap: 6,
    },
    editHistoryLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    editHistoryLabel: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    editHistoryText: {
      fontSize: 14,
      fontFamily: 'Manrope_400Regular',
      color: theme.text,
    },
    editHistoryMeta: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    editHistoryEmpty: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      textAlign: 'center',
      paddingVertical: 20,
    },
    editHistoryHint: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      textAlign: 'center',
      paddingVertical: 10,
    },
    viewOnceModalBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.92)',
    },
    viewOnceFullScreen: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewOnceLoading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewOnceModalText: {
      fontSize: 16,
      fontFamily: 'PlayfairDisplay_500Medium',
      color: Colors.light.background,
      lineHeight: 22,
    },
    viewOnceMediaImageFull: {
      width: screenWidth,
      height: screenHeight,
      resizeMode: 'contain',
    },
    viewOnceMediaVideoFull: {
      width: screenWidth,
      height: screenHeight,
    },
    viewOnceOverlayHeader: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 52 : 24,
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    viewOnceHeaderButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    viewOnceHeaderBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    viewOnceHeaderText: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: Colors.light.background,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    viewOnceOverlayFooter: {
      position: 'absolute',
      left: 24,
      right: 24,
      bottom: Platform.OS === 'ios' ? 40 : 56,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    viewOnceFooterButton: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },

    // Report Sheet
    reportBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: withAlpha(Colors.dark.background, 0.45),
    },
    reportSheet: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      borderRadius: 20,
      backgroundColor: withAlpha(theme.background, isDark ? 0.78 : 0.94),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      overflow: 'hidden',
      shadowColor: Colors.dark.background,
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 7,
    },
    reportBlur: {
      ...StyleSheet.absoluteFill,
    },
    reportContent: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
      gap: 12,
    },
    reportTitle: {
      fontSize: 16,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: theme.text,
    },
    reportSubtitle: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: -4,
    },
    reportReasonGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    reportReasonChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      backgroundColor: theme.backgroundSubtle,
    },
    reportReasonChipActive: {
      borderColor: theme.tint,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
    },
    reportReasonLabel: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    reportReasonLabelActive: {
      color: theme.tint,
    },
    reportInputWrap: {
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      backgroundColor: theme.backgroundSubtle,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 64,
    },
    reportInput: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: theme.text,
      minHeight: 48,
    },
    reportEvidenceCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.22),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
    },
    reportEvidenceIcon: {
      width: 30,
      height: 30,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
    },
    reportEvidenceCopy: {
      flex: 1,
      gap: 2,
    },
    reportEvidenceLabel: {
      fontSize: 11,
      fontFamily: 'Manrope_800ExtraBold',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: theme.tint,
    },
    reportEvidenceText: {
      fontSize: 12,
      lineHeight: 17,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    reportBlockOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      backgroundColor: withAlpha(theme.text, isDark ? 0.04 : 0.03),
    },
    reportBlockOptionActive: {
      borderColor: withAlpha(theme.tint, isDark ? 0.58 : 0.42),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.15 : 0.1),
    },
    reportBlockCheck: {
      width: 22,
      height: 22,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.22 : 0.16),
      backgroundColor: theme.backgroundSubtle,
    },
    reportBlockCheckActive: {
      borderColor: theme.tint,
      backgroundColor: theme.tint,
    },
    reportBlockCopy: {
      flex: 1,
      gap: 2,
    },
    reportBlockTitle: {
      fontSize: 13,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    reportBlockText: {
      fontSize: 11,
      lineHeight: 15,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    reportSubmitButton: {
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: 'center',
      backgroundColor: theme.tint,
    },
    reportSubmitDisabled: {
      backgroundColor: withAlpha(theme.tint, 0.4),
    },
    reportSubmitText: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: Colors.light.background,
    },
    reportCancel: {
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      alignItems: 'center',
      backgroundColor: theme.backgroundSubtle,
    },
    reportCancelText: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },

    // Chat Container
    chatContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    threadBootstrapLoader: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    threadBootstrapPlaceholder: {
      paddingTop: 24,
      gap: 12,
    },
    threadBootstrapBubble: {
      borderRadius: 18,
      height: 42,
    },
    threadBootstrapBubblePeer: {
      alignSelf: 'flex-start',
      width: '62%',
    },
    threadBootstrapBubblePeerShort: {
      alignSelf: 'flex-start',
      width: '42%',
      height: 34,
    },
    threadBootstrapBubbleMine: {
      alignSelf: 'flex-end',
      width: '56%',
    },
    jumpToBottomButton: {
      position: 'absolute',
      right: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.tint,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 8,
      zIndex: 20,
    },
    messagesList: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 18,
    },
    daySeparator: {
      alignSelf: 'center',
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      marginBottom: 8,
      marginTop: 2,
    },
    daySeparatorText: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.2,
    },
    systemRow: {
      alignItems: 'center',
      marginBottom: 12,
      marginTop: 2,
    },
    systemBubble: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
      maxWidth: '88%',
    },
    systemText: {
      fontSize: 12,
      color: theme.textMuted,
      fontFamily: 'Manrope_500Medium',
      textAlign: 'center',
    },
    loadEarlierContainer: {
      alignItems: 'center',
      paddingBottom: 12,
    },
    loadEarlierButton: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
    },
    loadEarlierText: {
      fontSize: 12,
      color: theme.textMuted,
      fontFamily: 'Manrope_500Medium',
    },
    loadEarlierSpacer: {
      height: 4,
    },

    // Messages
    messageContainer: {
      marginBottom: 6,
      position: 'relative',
    },
    messageContainerGrouped: {
      marginBottom: 2,
    },
    messageContainerWithReaction: {
      marginBottom: 24,
    },
    messageRowSpotlight: {
      position: 'absolute',
      top: -8,
      bottom: -8,
      left: 8,
      right: 8,
      borderRadius: 24,
      overflow: 'hidden',
      zIndex: 0,
    },
    messageRowSpotlightBlur: {
      ...StyleSheet.absoluteFill,
    },
    messageRowSpotlightTint: {
      ...StyleSheet.absoluteFill,
    },
    messageRowVignetteVertical: {
      ...StyleSheet.absoluteFill,
    },
    messageRowVignetteHorizontal: {
      ...StyleSheet.absoluteFill,
    },
    messageBubbleContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 0,
    },
    myMessageContainer: {
      justifyContent: 'flex-end',
    },
    theirMessageContainer: {
      justifyContent: 'flex-start',
    },
    messageAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      marginRight: 8,
      marginBottom: 2,
      alignSelf: 'flex-end',
    },
    messageAvatarSpacer: {
      width: 36,
      alignSelf: 'flex-end',
      height: 28,
    },
    messageBubble: {
      maxWidth: screenWidth * 0.76,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      position: 'relative',
      overflow: 'visible',
    },
    messageFocusSpotlight: {
      position: 'absolute',
      top: -6,
      left: -6,
      right: -6,
      bottom: -6,
      borderRadius: 26,
      borderWidth: 1,
      overflow: 'hidden',
    },
    messageFocusSpotlightBlur: {
      ...StyleSheet.absoluteFill,
    },
    messageFocusSpotlightTint: {
      ...StyleSheet.absoluteFill,
    },
    textWithMeta: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      alignItems: 'flex-end',
      maxWidth: '100%',
    },
    messageTextInline: {
      flexShrink: 1,
    },
    inlineMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 3,
    },
    inlineMetaRowText: {
      marginLeft: 4,
      marginBottom: 0,
      flexShrink: 0,
    },
    inlineMetaRowTextMy: {
      paddingHorizontal: isDark ? 0 : 4,
      paddingVertical: isDark ? 0 : 1,
      backgroundColor: isDark ? 'transparent' : 'rgba(255,255,255,0.10)',
      borderWidth: 0,
      borderColor: 'transparent',
      borderRadius: isDark ? 0 : 999,
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    inlineMetaRowTextTheir: {
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    receiptMetaBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(6,18,18,0.30)' : 'rgba(218,241,236,0.98)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(235,255,251,0.18)' : 'rgba(0,84,78,0.22)',
      shadowColor: isDark ? '#041212' : '#6B8E87',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.22 : 0.18,
      shadowRadius: isDark ? 4 : 6,
    },
    receiptMetaBadgeSent: {
      backgroundColor: isDark ? 'rgba(5,16,16,0.26)' : 'rgba(208,235,229,0.99)',
      borderColor: isDark ? 'rgba(230,247,244,0.12)' : 'rgba(0,84,78,0.20)',
    },
    receiptMetaBadgeDelivered: {
      backgroundColor: isDark ? 'rgba(7,22,21,0.34)' : 'rgba(191,229,221,0.99)',
      borderColor: isDark ? 'rgba(202,216,213,0.20)' : 'rgba(0,84,78,0.22)',
    },
    receiptMetaBadgeRead: {
      backgroundColor: isDark ? 'rgba(2,50,47,0.48)' : 'rgba(164,226,216,1)',
      borderColor: isDark ? 'rgba(24,224,210,0.46)' : 'rgba(0,125,120,0.34)',
    },
    inlineMetaIcon: {
      marginLeft: 4,
    },
    inlineMetaIconText: {
      marginLeft: 2,
    },
    failedRetryHint: {
      marginTop: 4,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.2,
    },
    failedRetryHintMy: {
      color: withAlpha(Colors.light.background, 0.84),
    },
    failedRetryHintTheir: {
      color: theme.danger,
    },
    myMessageBubble: {
      backgroundColor: theme.tint,
      borderWidth: 1,
      borderColor: withAlpha(Colors.light.background, isDark ? 0.14 : 0.18),
    },
    myMessageBubbleGroupedTop: {
      borderTopRightRadius: 10,
    },
    myMessageBubbleGroupedBottom: {
      borderBottomRightRadius: 10,
    },
    theirMessageBubble: {
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    theirMessageBubbleGroupedTop: {
      borderTopLeftRadius: 10,
    },
    theirMessageBubbleGroupedBottom: {
      borderBottomLeftRadius: 10,
    },
    deletedMessageBubble: {
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.6 : 0.85),
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    },
    bubbleTail: {
      position: 'absolute',
      bottom: 2,
      width: 15,
      height: 14,
    },
    bubbleTailRight: {
      right: -7,
    },
    bubbleTailLeft: {
      left: -7,
    },
    bubbleTailSvgLeft: {
      transform: [{ scaleX: -1 }],
    },
    stickerBubble: {
      padding: 8,
      shadowOpacity: 0.1,
    },
    stickerBubbleMy: {
      backgroundColor: isDark ? withAlpha(theme.tint, 0.14) : withAlpha(theme.tint, 0.08),
      borderColor: isDark ? withAlpha(theme.tint, 0.24) : withAlpha(theme.tint, 0.18),
    },
    stickerBubbleTheir: {
      backgroundColor: isDark ? withAlpha(theme.backgroundSubtle, 0.72) : withAlpha('#FFFFFF', 0.78),
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.09),
    },
    messageText: {
      fontSize: 14.5,
      lineHeight: 19,
      fontFamily: 'Manrope_400Regular',
    },
    messageTextHighlight: {
      borderRadius: 6,
      paddingHorizontal: 2,
    },
    messageTextHighlightMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.22),
      color: Colors.light.background,
    },
    messageTextHighlightTheir: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.28 : 0.16),
      color: theme.text,
    },
    myMessageText: {
      color: Colors.light.background,
    },
    theirMessageText: {
      color: theme.text,
    },
    deletedMessageText: {
      color: theme.textMuted,
      fontStyle: 'italic',
    },
    messageMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 6,
    },
    messageMetaRight: {
      alignSelf: 'flex-end',
    },
    messageMetaLeft: {
      alignSelf: 'flex-end',
    },
    messageMetaText: {
      fontSize: 10,
      fontFamily: 'Manrope_400Regular',
    },
    messageMetaTextMy: {
      color: isDark ? '#FBFFFE' : '#144E49',
      fontFamily: 'Manrope_600SemiBold',
      letterSpacing: 0.15,
    },
    messageMetaTextInlineMy: {
      color: isDark
        ? withAlpha(Colors.light.background, 0.84)
        : withAlpha(Colors.light.background, 0.76),
      fontFamily: 'Manrope_500Medium',
      fontSize: 8,
      letterSpacing: 0.08,
    },
    messageMetaTextInlineTheir: {
      color: withAlpha(theme.textMuted, 0.88),
      fontFamily: 'Manrope_500Medium',
      fontSize: 9,
      letterSpacing: 0.06,
    },
    messageMetaTextTheir: {
      color: theme.textMuted,
    },
    messageMetaEditedWrap: {
      marginRight: 4,
    },
    messageMetaEdited: {
      fontSize: 10,
      fontFamily: 'Manrope_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    messageMetaEditedMy: {
      color: isDark ? withAlpha(Colors.light.background, 0.75) : withAlpha('#144E49', 0.86),
    },
    messageMetaEditedTheir: {
      color: theme.textMuted,
    },
    messageMetaIcon: {
      marginLeft: 4,
    },
    messageTime: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 2,
    },
    myMessageTime: {
      textAlign: 'right',
      marginRight: 4,
    },
    theirMessageTime: {
      textAlign: 'left',
      marginLeft: 36,
    },

    // Mood Stickers
    moodStickerContainer: {
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.24 : 0.18),
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 12,
      elevation: 4,
    },
    moodStickerContainerMy: {
      shadowOpacity: isDark ? 0.18 : 0.12,
    },
    moodStickerContainerTheir: {
      shadowOpacity: isDark ? 0.12 : 0.08,
    },
    moodStickerEmoji: {
      fontSize: 32,
      marginBottom: 4,
    },
    moodStickerName: {
      fontSize: 12,
      fontFamily: 'Archivo_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: theme.text,
    },
    viewOnceWrapper: {
      width: '100%',
    },
    viewOnceInlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      width: '100%',
    },
    viewOnceInlineLabel: {
      flexShrink: 1,
      minWidth: 0,
    },
    viewOnceCard: {
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      minWidth: 140,
    },
    viewOnceCardMy: {
      borderColor: withAlpha(Colors.light.background, 0.2),
    },
    viewOnceCardTheir: {
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
    },
    viewOnceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    viewOnceLockBadge: {
      width: 30,
      height: 30,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewOnceLockBadgeMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.2),
    },
    viewOnceLockBadgeTheir: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
    },
    viewOnceTextBlock: {
      flexGrow: 1,
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      minWidth: 0,
    },
    viewOnceTitle: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      flexShrink: 1,
    },
    viewOnceTitleItalic: {
      fontFamily: 'Manrope_500Medium_Italic',
    },
    viewOnceTitleMy: {
      color: Colors.light.background,
    },
    viewOnceTitleTheir: {
      color: theme.text,
    },
    viewOnceSubtitle: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      flexShrink: 1,
    },
    viewOnceSubtitleMy: {
      color: withAlpha(Colors.light.background, 0.8),
    },
    viewOnceSubtitleTheir: {
      color: theme.textMuted,
    },
    viewOnceFooter: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    viewOnceBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    viewOnceBadgeMy: {
      borderColor: withAlpha(Colors.light.background, 0.45),
    },
    viewOnceBadgeTheir: {
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    },
    viewOnceBadgeText: {
      fontSize: 9,
      fontFamily: 'Manrope_600SemiBold',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    viewOnceBadgeTextMy: {
      color: withAlpha(Colors.light.background, 0.85),
    },
    viewOnceBadgeTextTheir: {
      color: theme.textMuted,
    },

    // Reactions
    reactionSummary: {
      position: 'absolute',
      bottom: -20,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 14,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 3,
    },
    reactionSummaryPressable: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    reactionSummaryLeft: {
      left: 8,
    },
    reactionSummaryRight: {
      right: 10,
    },
    reactionSummaryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    reactionSummaryEmoji: {
      fontSize: 14,
    },
    reactionSummaryCount: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    reactionInlineText: {
      fontSize: 11,
      fontStyle: 'italic',
      fontFamily: 'Manrope_500Medium',
    },
    reactionInlinePill: {
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      maxWidth: '100%',
    },
    reactionInlinePillMy: {
      alignSelf: 'flex-end',
      backgroundColor: theme.tint,
    },
    reactionInlinePillTheir: {
      alignSelf: 'flex-start',
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
    },
    reactionInlineTextMy: {
      textAlign: 'right',
    },
    reactionInlineTextTheir: {
      textAlign: 'left',
    },

    // Quick Reactions
    quickReactionOverlay: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingTop: 76,
      paddingBottom: 24,
      backgroundColor: withAlpha(Colors.dark.background, isDark ? 0.32 : 0.22),
    },
    quickReactionBackdropBlur: {
      ...StyleSheet.absoluteFill,
      backgroundColor: withAlpha(Colors.dark.background, isDark ? 0.7 : 0.58),
    },
    quickReactionBackdrop: {
      ...StyleSheet.absoluteFill,
    },
    quickReactionOverlayScroller: {
      width: '82%',
      maxWidth: 320,
      maxHeight: '100%',
    },
    quickReactionOverlayContent: {
      flexGrow: 1,
      justifyContent: 'center',
      gap: 8,
      paddingBottom: 8,
    },
    quickReactionOverlayContentLeft: {
      alignSelf: 'flex-start',
    },
    quickReactionOverlayContentRight: {
      alignSelf: 'flex-end',
    },
    quickReactionFocusText: {
      flexShrink: 1,
      fontSize: 15,
      lineHeight: 21,
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
    },
    quickReactionFocusTextMy: {
      color: Colors.light.background,
    },
    quickReactionFocusMediaRow: {
      minWidth: 180,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    quickReactionsContainer: {
      alignSelf: 'flex-start',
      backgroundColor: theme.background,
      borderRadius: 24,
      paddingHorizontal: 7,
      paddingVertical: 7,
      flexDirection: 'row',
      gap: 2,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.12),
    },
    quickReactionsLeft: {
      alignSelf: 'flex-start',
    },
    quickReactionsRight: {
      alignSelf: 'flex-end',
    },
    quickReactionPreviewLeft: {
      alignSelf: 'flex-start',
    },
    quickReactionPreviewRight: {
      alignSelf: 'flex-end',
    },
    quickReactionActionRowLeft: {
      alignSelf: 'flex-start',
    },
    quickReactionActionRowRight: {
      alignSelf: 'flex-end',
    },
    messageActionRow: {
      width: 220,
      maxWidth: '76%',
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.14,
      shadowRadius: 12,
      elevation: 7,
    },
    messageActionRowLeft: {
      alignSelf: 'flex-start',
      marginLeft: 36,
    },
    messageActionRowRight: {
      alignSelf: 'flex-end',
      marginRight: 4,
    },
    messageActionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 46,
      paddingHorizontal: 14,
      paddingVertical: 11,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.82 : 0.94),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.2 : 0.1),
    },
    messageActionPillDanger: {
      backgroundColor: withAlpha(theme.danger, 0.12),
      borderColor: withAlpha(theme.danger, 0.3),
    },
    messageActionPillLabel: {
      fontSize: 15,
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
    },
    messageActionPillLabelDanger: {
      color: theme.danger,
    },
    quickReactionButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.backgroundSubtle,
    },
    quickReactionEmoji: {
      fontSize: 18,
    },

    // Typing Indicator
    typingContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    typingAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      marginRight: 8,
      marginBottom: 4,
    },
    typingBubble: {
      backgroundColor: isDark ? withAlpha(theme.backgroundSubtle, 0.92) : withAlpha('#fffaf5', 0.96),
      borderRadius: 16,
      borderBottomLeftRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    typingDots: {
      flexDirection: 'row',
      gap: 4,
    },
    typingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.tint,
    },

    // Mood Stickers Panel
    moodStickersPanel: {
      backgroundColor: theme.background,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      maxHeight: 300,
      paddingBottom: 16,
    },
    moodStickerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
    },
    moodStickersContent: {
      paddingBottom: 16,
    },
    moodStickerTitle: {
      fontSize: 16,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    stickerCategory: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    categoryTitle: {
      fontSize: 14,
      fontFamily: 'Archivo_700Bold',
      color: theme.textMuted,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    stickersGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    stickerButton: {
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      minWidth: 60,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.1),
    },
    stickerEmoji: {
      fontSize: 20,
      marginBottom: 2,
    },
    stickerName: {
      fontSize: 10,
      fontFamily: 'Manrope_400Regular',
      textAlign: 'center',
      color: theme.tint,
    },

    // Input Area
    inputContainer: {
      paddingHorizontal: 16,
      paddingTop: 9,
      paddingBottom: 12,
      backgroundColor: theme.background,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
    },
    composerShell: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 22,
      backgroundColor: isDark ? withAlpha(theme.backgroundSubtle, 0.92) : withAlpha('#fffaf5', 0.96),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.12 : 0.06,
      shadowRadius: 10,
      elevation: 2,
    },
    composerShellFocused: {
      borderColor: withAlpha(theme.tint, isDark ? 0.46 : 0.3),
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.18 : 0.12,
    },
    composerShellAccent: {
      borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.22),
    },
    blockedInput: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginHorizontal: 12,
      marginBottom: 10,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.1 : 0.07),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.18),
    },
    blockedInputIcon: {
      width: 34,
      height: 34,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.32 : 0.18),
    },
    blockedInputCopy: {
      flex: 1,
      gap: 2,
    },
    blockedInputTitle: {
      fontSize: 13,
      fontFamily: 'Manrope_800ExtraBold',
      color: theme.text,
    },
    blockedInputText: {
      fontSize: 11,
      lineHeight: 16,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    blockedInputAction: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    blockedInputActionText: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: Colors.light.background,
    },
    inputContainerRaised: {
      marginBottom: attachmentSheetHeight,
    },
    textInput: {
      flex: 1,
      minHeight: 40,
      paddingHorizontal: 4,
      paddingTop: 9,
      paddingBottom: 8,
      fontSize: 15.5,
      fontFamily: 'Manrope_400Regular',
      color: theme.text,
      maxHeight: 100,
      lineHeight: 21,
    },
    sendButtonActive: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: theme.tint,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: withAlpha(Colors.light.background, isDark ? 0.18 : 0.22),
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.22 : 0.16,
      shadowRadius: 14,
      elevation: 4,
    },
    sendButtonViewOnce: {
      backgroundColor: theme.secondary,
    },

    // Message Status & Info
    messageInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    myMessageInfo: {
      justifyContent: 'flex-end',
      marginRight: 4,
    },
    theirMessageInfo: {
      justifyContent: 'flex-start',
      marginLeft: 36,
    },
    messageStatus: {
      marginLeft: 4,
    },

    // Voice Messages
    voiceBubble: {
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    voiceMessageContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 188,
    },
    voicePlayButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 2,
    },
    voicePlayButtonMy: {
      backgroundColor: Colors.light.background,
      borderColor: withAlpha(Colors.light.background, 0.38),
      shadowColor: Colors.light.background,
    },
    voicePlayButtonTheir: {
      backgroundColor: theme.tint,
      borderColor: withAlpha(theme.tint, isDark ? 0.24 : 0.18),
      shadowColor: theme.tint,
    },
    voicePlayButtonMyActive: {
      transform: [{ scale: 1.02 }],
    },
    voicePlayButtonTheirActive: {
      transform: [{ scale: 1.02 }],
    },
    voiceWaveformCard: {
      flex: 1,
      minHeight: 34,
      paddingLeft: 2,
      paddingRight: 6,
      paddingVertical: 4,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
    },
    voiceWaveformCardMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.08),
      borderColor: withAlpha(Colors.light.background, 0.16),
    },
    voiceWaveformCardTheir: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.06 : 0.035),
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
    },
    voiceWaveformCardMyActive: {
      backgroundColor: withAlpha(Colors.light.background, 0.12),
      borderColor: withAlpha(Colors.light.background, 0.24),
    },
    voiceWaveformCardTheirActive: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
      borderColor: withAlpha(theme.tint, isDark ? 0.22 : 0.14),
    },
    voiceWaveform: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      height: 20,
    },
    waveformBar: {
      width: 2,
      borderRadius: 1,
      minHeight: 4,
    },
    voiceDurationPill: {
      paddingHorizontal: 8,
      height: 22,
      borderRadius: 11,
      justifyContent: 'center',
      alignItems: 'center',
    },
    voiceDurationPillMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.12),
    },
    voiceDurationPillTheir: {
      backgroundColor: withAlpha(theme.background, isDark ? 0.46 : 0.72),
    },
    voiceDuration: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.2,
    },
    voiceDurationMy: {
      color: withAlpha(Colors.light.background, 0.92),
    },
    voiceDurationTheir: {
      color: theme.textMuted,
    },

    // Image Messages
    imageBubble: {
      padding: 4,
      backgroundColor: 'transparent',
    },
    imageMessageContainer: {
      borderRadius: 16,
      overflow: 'hidden',
    },
    mediaSurface: {
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.14 : 0.5),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.12 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    messageImage: {
      width: Math.min(screenWidth * 0.72, 340),
      height: Math.min(screenWidth * 0.9, 420),
      borderRadius: 14,
      backgroundColor: theme.backgroundSubtle,
    },
    videoBubble: {
      padding: 4,
      backgroundColor: 'transparent',
    },
    videoMessageContainer: {
      borderRadius: 16,
      overflow: 'hidden',
    },
    videoPreviewWrap: {
      position: 'relative',
      borderRadius: 14,
      overflow: 'hidden',
    },
    messageVideo: {
      width: Math.min(screenWidth * 0.72, 340),
      height: Math.min(screenWidth * 0.9, 420),
      borderRadius: 14,
      backgroundColor: theme.backgroundSubtle,
    },
    videoOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.18)',
    },
    videoOverlayLabel: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.14)',
      color: Colors.light.background,
      fontSize: 11,
      fontFamily: 'Manrope_800ExtraBold',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    mediaMetaOverlay: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 11,
    },
    mediaMetaOverlayMy: {
      backgroundColor: 'rgba(6,18,18,0.58)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(235,255,251,0.16)',
    },
    mediaMetaOverlaySent: {
      backgroundColor: 'rgba(6,18,18,0.52)',
      borderColor: 'rgba(230,247,244,0.12)',
    },
    mediaMetaOverlayDelivered: {
      backgroundColor: 'rgba(7,22,21,0.62)',
      borderColor: 'rgba(202,216,213,0.20)',
    },
    mediaMetaOverlayRead: {
      backgroundColor: 'rgba(2,50,47,0.72)',
      borderColor: 'rgba(24,224,210,0.44)',
    },
    mediaMetaOverlayTheir: {
      backgroundColor: 'rgba(0,0,0,0.28)',
    },
    mediaMetaText: {
      fontSize: 10,
      fontFamily: 'Manrope_500Medium',
    },
    mediaMetaTextMy: {
      color: '#FBFFFE',
      fontFamily: 'Manrope_600SemiBold',
      letterSpacing: 0.15,
    },
    mediaMetaTextTheir: {
      color: Colors.light.background,
    },
    mediaMetaIcon: {
      marginLeft: 4,
    },
    documentBubble: {
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    datePlanBubble: {
      padding: 8,
      width: Math.min(screenWidth * 0.76, 320),
    },
    datePlanBubbleMy: {
      backgroundColor: isDark ? '#14979C' : '#16AEB3',
      borderColor: withAlpha(Colors.light.background, 0.1),
      shadowOpacity: 0.04,
    },
    datePlanBubbleTheir: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      borderColor: withAlpha(theme.tint, isDark ? 0.24 : 0.12),
    },
    datePlanMessageContainer: {
      gap: 8,
    },
    datePlanMessageContainerConfirmed: {
      gap: 6,
    },
    datePlanHeader: {
      gap: 6,
    },
    datePlanHeaderTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      flexWrap: 'wrap',
    },
    datePlanBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },
    datePlanPersonChip: {
      maxWidth: '58%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
    },
    datePlanPersonAvatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: theme.backgroundSubtle,
    },
    datePlanPersonText: {
      flexShrink: 1,
      fontSize: 11.5,
      fontFamily: 'Manrope_700Bold',
    },
    datePlanBadgeText: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    datePlanWhenEyebrow: {
      fontSize: 10.5,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    datePlanWhen: {
      fontSize: 14,
      fontFamily: 'Archivo_700Bold',
    },
    datePlanWhenConfirmed: {
      fontSize: 18,
      lineHeight: 22,
    },
    datePlanWhenRowConfirmed: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 14,
    },
    datePlanMapImage: {
      width: '100%',
      height: 112,
      borderRadius: 14,
      backgroundColor: theme.backgroundSubtle,
    },
    datePlanMapImageConfirmed: {
      height: 102,
    },
    datePlanPlaceBlock: {
      gap: 3,
    },
    datePlanVenue: {
      fontSize: 15,
      fontFamily: 'Manrope_700Bold',
    },
    datePlanVenueConfirmed: {
      fontSize: 17,
      lineHeight: 22,
    },
    datePlanAddress: {
      fontSize: 12,
      fontFamily: 'Manrope_500Medium',
      lineHeight: 18,
    },
    datePlanAddressConfirmed: {
      lineHeight: 17,
    },
    datePlanSummary: {
      fontSize: 11.5,
      fontFamily: 'Manrope_400Regular',
      lineHeight: 17,
    },
    datePlanSummaryConfirmed: {
      fontSize: 11,
      lineHeight: 16,
    },
    datePlanStatusRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    datePlanStatusChip: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    datePlanStatusText: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
    },
    datePlanBadgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    datePlanBadgeRowCompact: {
      gap: 6,
    },
    datePlanTag: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    datePlanTagCompact: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    datePlanTagConfirmed: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13,26,26,0.08)',
    },
    datePlanTagContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    datePlanTagIcon: {
      marginTop: 0.5,
    },
    datePlanTagText: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
    },
    datePlanTagTextCompact: {
      fontSize: 10.5,
    },
    datePlanNoteCard: {
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.16)',
    },
    datePlanNoteCardLight: {
      paddingHorizontal: 9,
      paddingVertical: 7,
      gap: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.12)',
    },
    datePlanNoteLabel: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    datePlanNoteLabelCompact: {
      fontSize: 10,
      letterSpacing: 0.6,
    },
    datePlanNoteText: {
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
      lineHeight: 19,
    },
    datePlanNoteTextCompact: {
      fontSize: 12.5,
      lineHeight: 18,
    },
    datePlanActionRow: {
      flexDirection: 'column',
      gap: 8,
    },
    datePlanPrimaryAction: {
      minHeight: 38,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    datePlanPrimaryActionWide: {
      paddingHorizontal: 16,
    },
    datePlanPrimaryActionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    datePlanPrimaryActionText: {
      fontSize: 12.5,
      fontFamily: 'Manrope_700Bold',
    },
    datePlanSecondaryAction: {
      minHeight: 38,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderWidth: 1,
    },
    datePlanSecondaryActionStrong: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.06 : 0.04),
    },
    datePlanSecondaryActionText: {
      fontSize: 12.5,
      fontFamily: 'Manrope_700Bold',
    },
    datePlanSecondaryActionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    datePlanPendingText: {
      fontSize: 11.5,
      fontFamily: 'Manrope_600SemiBold',
    },
    datePlanConciergeButton: {
      minHeight: 40,
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    datePlanConciergeText: {
      fontSize: 12.5,
      fontFamily: 'Manrope_700Bold',
      flexShrink: 1,
    },
    datePlanTertiaryAction: {
      alignSelf: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    datePlanTertiaryActionText: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
    },
    datePlanFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingTop: 2,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13,26,26,0.08)',
    },
    datePlanFooterLead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    datePlanFooterText: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
    },
    documentMessageContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 180,
      maxWidth: screenWidth * 0.6,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 18,
      borderWidth: 1,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 2,
    },
    documentMessageSurfaceMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.08),
      borderColor: withAlpha(Colors.light.background, 0.14),
      shadowColor: Colors.light.background,
    },
    documentMessageSurfaceTheir: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.03),
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      shadowColor: Colors.dark.background,
    },
    documentIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    documentInfo: {
      flex: 1,
      gap: 5,
    },
    documentName: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
    },
    documentMetaPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    documentMetaPillMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.1),
      borderColor: withAlpha(Colors.light.background, 0.16),
    },
    documentMetaPillTheir: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.035),
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
    },
    documentHint: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
    },
    // Location Messages
    locationBubble: {
      padding: 8,
      width: locationPreviewWidth + 16,
    },
    locationMessageContainer: {
      gap: 8,
    },
    locationMapFrame: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      backgroundColor: theme.backgroundSubtle,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 2,
    },
    locationMapImage: {
      width: locationPreviewWidth,
      height: LOCATION_PREVIEW_HEIGHT,
      backgroundColor: theme.backgroundSubtle,
    },
    locationMapPlaceholder: {
      width: locationPreviewWidth,
      height: LOCATION_PREVIEW_HEIGHT,
      backgroundColor: theme.backgroundSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    locationDetailsCard: {
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 9,
      borderWidth: 1,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 1,
    },
    locationDetailsCardMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.08),
      borderColor: withAlpha(Colors.light.background, 0.12),
    },
    locationDetailsCardTheir: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.03),
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.08),
    },
    locationPlaceholderText: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
    },
    locationInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    locationIconBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    locationTextBlock: {
      flex: 1,
    },
    locationLabelText: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
    },
    locationAddressText: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      marginTop: 2,
    },
    locationRouteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
    },
    locationRoutePillMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.08),
      borderColor: withAlpha(Colors.light.background, 0.14),
    },
    locationRoutePillTheir: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.03),
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
    },
    locationRouteText: {
      fontSize: 11,
      fontFamily: 'Manrope_500Medium',
    },
    locationLiveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    locationLiveBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      alignSelf: 'flex-start',
      backgroundColor: withAlpha(theme.secondary, 0.18),
    },
    locationLiveBadgeText: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.secondary,
    },
    locationLiveText: {
      fontSize: 11,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    locationStopButton: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    },
    locationStopText: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    imageCaption: {
      fontSize: 13.5,
      lineHeight: 19,
      color: theme.text,
    },
    mediaCaptionCard: {
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    mediaCaptionCardMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.08),
    },
    mediaCaptionCardTheir: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.04 : 0.025),
    },
    imageViewerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.9)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    imageViewerImage: {
      width: screenWidth,
      height: screenHeight * 0.8,
    },
    videoViewer: {
      width: screenWidth,
      height: screenHeight * 0.8,
    },
    documentViewer: {
      width: screenWidth,
      height: screenHeight * 0.8,
      backgroundColor: Colors.light.background,
    },
    imageViewerClose: {
      position: 'absolute',
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.42)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    locationViewerContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    locationViewerHeader: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 56 : 28,
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: withAlpha(theme.background, 0.92),
      padding: 12,
      borderRadius: 16,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 6,
    },
    locationViewerClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
    },
    locationViewerText: {
      flex: 1,
      gap: 2,
    },
    locationViewerTitle: {
      fontSize: 16,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: theme.text,
    },
    locationViewerSubtitle: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    locationViewerFooter: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: Platform.OS === 'ios' ? 32 : 20,
      backgroundColor: withAlpha(theme.background, 0.82),
      padding: 12,
      borderRadius: 16,
      gap: 10,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.14,
      shadowRadius: 14,
      elevation: 6,
    },
    locationViewerLiveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    locationViewerAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    },
    locationViewerActionText: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    locationModalContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    locationTopBar: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 56 : 24,
      left: 16,
      right: 16,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.12),
      zIndex: 20,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 18,
      elevation: 8,
    },
    locationTopContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
    },
    locationTopButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, 0.6),
    },
    locationTopTitle: {
      fontSize: 16,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: theme.text,
    },
    locationTopSubtitle: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 2,
    },
    locationTopSpacer: {
      width: 36,
    },
    locationSearchWrap: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 124 : 92,
      left: 16,
      right: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.12),
      overflow: 'hidden',
      zIndex: 19,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 18,
      elevation: 7,
    },
    locationSearchContent: {
      height: 46,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    locationSearchInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Manrope_400Regular',
      color: theme.text,
    },
    locationGlass: {
      ...StyleSheet.absoluteFill,
      backgroundColor: withAlpha(theme.background, isDark ? 0.5 : 0.65),
    },
    locationSuggestionsPanel: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 176 : 144,
      left: 16,
      right: 16,
      maxHeight: 220,
      backgroundColor: withAlpha(theme.background, 0.98),
      borderRadius: 16,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      paddingVertical: 6,
      zIndex: 18,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 6,
    },
    locationSuggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    locationSuggestionText: {
      flex: 1,
      gap: 2,
    },
    locationSuggestionTitle: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    locationSuggestionSubtitle: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    locationBottomSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 24,
      backgroundColor: 'transparent',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      overflow: 'hidden',
      zIndex: 17,
      gap: 12,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: -10 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 10,
    },
    locationSheetContent: {
      gap: 12,
      backgroundColor: withAlpha(theme.background, isDark ? 0.2 : 0.5),
    },
    locationSheetHandle: {
      alignSelf: 'center',
      width: 46,
      height: 5,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      marginBottom: 4,
    },
    locationSelectedRow: {
      gap: 4,
    },
    locationSectionTitle: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    locationSelectedValue: {
      fontSize: 15,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    locationSelectedSubtitle: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    locationNearbyRow: {
      gap: 8,
    },
    locationNearbyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    locationNearbyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.1),
      backgroundColor: withAlpha(theme.background, 0.7),
      marginRight: 10,
      minWidth: 160,
      maxWidth: 220,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 4,
    },
    locationNearbyIcon: {
      width: 30,
      height: 30,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
    },
    locationNearbyMeta: {
      flex: 1,
      gap: 2,
    },
    locationNearbyName: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    locationNearbyAddress: {
      fontSize: 10,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 2,
    },
    locationLiveSection: {
      gap: 8,
    },
    locationPresetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    locationPresetChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      backgroundColor: withAlpha(theme.background, 0.6),
    },
    locationPresetChipActive: {
      backgroundColor: theme.tint,
      borderColor: theme.tint,
    },
    locationPresetText: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    locationPresetTextActive: {
      color: Colors.light.background,
    },
    locationLiveHint: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    locationErrorText: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: '#b91c1c',
    },
    locationActionRow: {
      flexDirection: 'row',
      gap: 10,
    },
    locationGhostButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      backgroundColor: theme.backgroundSubtle,
    },
    locationGhostText: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    locationPrimaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.tint,
    },
    locationPrimaryText: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: Colors.light.background,
    },
    locationLoadingOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: withAlpha(theme.background, 0.92),
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    locationLoadingText: {
      fontSize: 12,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },

    // Reply Features
    replyIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(Colors.light.background, 0.2),
    },
    replyLine: {
      width: 3,
      height: 20,
      backgroundColor: Colors.light.background,
      borderRadius: 2,
      marginRight: 8,
      opacity: 0.6,
    },
    replyText: {
      flex: 1,
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: Colors.light.background,
      opacity: 0.85,
      fontStyle: 'italic',
    },
    replyChip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      minWidth: 158,
      maxWidth: '100%',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 18,
      marginBottom: 10,
      borderWidth: 1,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 2,
    },
    replyChipMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.13),
      borderColor: withAlpha(Colors.light.background, 0.24),
      shadowColor: Colors.light.background,
    },
    replyChipTheir: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.07 : 0.04),
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.09),
      shadowColor: Colors.dark.background,
    },
    replyChipLine: {
      width: 3,
      minHeight: 42,
      borderRadius: 999,
    },
    replyChipThumb: {
      width: 46,
      height: 46,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      position: 'relative',
    },
    replyChipThumbMy: {
      borderColor: withAlpha(Colors.light.background, 0.22),
      backgroundColor: withAlpha(Colors.light.background, 0.12),
    },
    replyChipThumbTheir: {
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      backgroundColor: withAlpha(theme.text, isDark ? 0.06 : 0.035),
    },
    replyChipThumbImage: {
      width: '100%',
      height: '100%',
    },
    replyChipThumbFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    replyChipThumbFallbackMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.08),
    },
    replyChipThumbFallbackTheir: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
    },
    replyChipThumbOverlay: {
      position: 'absolute',
      right: 5,
      bottom: 5,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    replyChipThumbOverlayMy: {
      backgroundColor: withAlpha('#071E22', 0.34),
    },
    replyChipThumbOverlayTheir: {
      backgroundColor: withAlpha(theme.background, isDark ? 0.62 : 0.78),
    },
    replyChipLineMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.74),
    },
    replyChipLineTheir: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.45 : 0.34),
    },
    replyChipContent: {
      flex: 1,
      gap: 4,
    },
    replyChipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    replyChipIconWrap: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    replyChipIconWrapMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.18),
    },
    replyChipIconWrapTheir: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
    },
    replyChipLabel: {
      flexShrink: 1,
      fontSize: 10,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    replyChipLabelMy: {
      color: withAlpha(Colors.light.background, 0.76),
    },
    replyChipTime: {
      marginLeft: 'auto',
      fontSize: 9,
      fontFamily: 'Manrope_500Medium',
      color: withAlpha(theme.textMuted, 0.86),
    },
    replyChipTimeMy: {
      color: withAlpha(Colors.light.background, 0.62),
    },
    replyChipPreview: {
      fontSize: 13,
      lineHeight: 18,
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
    },
    replyChipPreviewMy: {
      color: withAlpha(Colors.light.background, 0.92),
    },
    replyPreview: {
      backgroundColor: theme.backgroundSubtle,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },
    replyPreviewContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    replyPreviewText: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    cancelReplyButton: {
      padding: 4,
    },
    editPreview: {
      backgroundColor: theme.backgroundSubtle,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.tint, isDark ? 0.2 : 0.14),
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },
    editPreviewContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    editPreviewBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
    },
    editPreviewText: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    cancelEditButton: {
      padding: 4,
    },
    viewOncePreview: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 16,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.secondary, isDark ? 0.3 : 0.2),
    },
    viewOncePreviewContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    viewOncePreviewText: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    replyButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.backgroundSubtle,
      marginRight: 8,
    },

    // Enhanced Input Area
    inputLeftActions: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-end',
      paddingBottom: 1,
    },
    inputRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingBottom: 1,
    },
    inputActionButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? withAlpha(theme.background, 0.48) : withAlpha(theme.background, 0.86),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      justifyContent: 'center',
      alignItems: 'center',
    },
    inputActionButtonActive: {
      backgroundColor: theme.tint,
      borderColor: theme.tint,
    },
    inputActionButtonSecondaryActive: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
      borderColor: withAlpha(theme.tint, isDark ? 0.3 : 0.18),
    },
    viewOnceToggle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.12),
      backgroundColor: theme.backgroundSubtle,
      justifyContent: 'center',
      alignItems: 'center',
    },
    viewOnceToggleActive: {
      backgroundColor: theme.secondary,
      borderColor: theme.secondary,
    },

    // Voice Recording
    voiceButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: theme.tint,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      borderWidth: 1,
      borderColor: withAlpha(Colors.light.background, isDark ? 0.18 : 0.22),
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.2 : 0.14,
      shadowRadius: 14,
      elevation: 4,
    },
    voiceButtonRecording: {
      backgroundColor: withAlpha(theme.tint, 0.85),
    },
    voiceButtonInner: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    recordingControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    recordingControlButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    recordingControlDanger: {
      backgroundColor: withAlpha('#ef4444', 0.9),
    },
    recordingControlPause: {
      backgroundColor: withAlpha(theme.tint, 0.85),
    },
    recordingControlSend: {
      backgroundColor: theme.tint,
    },
    recordingControlDisabled: {
      opacity: 0.6,
    },
    recordingTimerPill: {
      paddingHorizontal: 10,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      backgroundColor: theme.backgroundSubtle,
      justifyContent: 'center',
    },
    recordingTimerText: {
      fontSize: 12,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
      letterSpacing: 0.2,
    },
    mediaUploadNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginHorizontal: 12,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.22),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.13 : 0.08),
    },
    mediaUploadIcon: {
      width: 34,
      height: 34,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.32 : 0.18),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
    },
    mediaUploadCopy: {
      flex: 1,
      gap: 2,
    },
    mediaUploadTitle: {
      fontSize: 13,
      fontFamily: 'Manrope_800ExtraBold',
      color: theme.text,
    },
    mediaUploadSubtitle: {
      fontSize: 11,
      lineHeight: 16,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },

    // Attachment Sheet
    attachmentSheet: {
      backgroundColor: isDark ? 'rgba(7,30,34,0.84)' : 'rgba(255,249,243,0.9)',
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(139,92,255,0.24)' : 'rgba(15,61,62,0.08)',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Math.max(bottomInset + 12, 24),
      gap: 12,
      maxHeight: attachmentSheetHeight,
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 30,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 12,
      overflow: 'hidden',
    },
    attachmentHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.24)' : 'rgba(15,61,62,0.16)',
      marginBottom: 6,
    },
    attachmentSheetScroll: {
      flexGrow: 0,
    },
    attachmentSheetContent: {
      gap: 12,
      paddingBottom: 4,
    },
    imagePickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    imagePickerTitle: {
      fontSize: 16,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    imagePickerClose: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.34)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,61,62,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewOnceAttachmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.28)',
    },
    viewOnceAttachmentRowActive: {
      borderColor: withAlpha(theme.tint, 0.4),
      backgroundColor: isDark ? withAlpha(theme.tint, 0.18) : 'rgba(232,249,246,0.7)',
    },
    viewOnceAttachmentLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    viewOnceAttachmentIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.38)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewOnceAttachmentIconActive: {
      backgroundColor: theme.tint,
    },
    viewOnceAttachmentTitle: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    viewOnceAttachmentSubtitle: {
      fontSize: 10,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    viewOnceAttachmentToggle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.38)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewOnceAttachmentToggleActive: {
      backgroundColor: theme.tint,
    },
    imagePickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 12,
    },
    imagePickerOption: {
      width: '48%',
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.32)',
    },
    imagePickerIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    viewOnceMediaBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: theme.tint,
    },
    viewOnceMediaBadgeText: {
      fontSize: 9,
      fontFamily: 'Manrope_600SemiBold',
      color: Colors.light.background,
    },
    imagePickerLabel: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    imagePickerSubLabel: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 2,
    },

    // Reconnect toast
    reconnectToastHost: {
      position: 'absolute',
      top: 8,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 20,
    },
    reconnectToast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: withAlpha(Colors.dark.background, isDark ? 0.92 : 0.78),
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 10,
    },
    reconnectToastText: {
      fontSize: 12,
      fontFamily: 'Manrope_500Medium',
      color: Colors.light.background,
    },
    chatActionToastHost: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 21,
    },
    chatActionToast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: withAlpha(theme.tint, 0.92),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.98 : 0.86),
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 10,
    },
    chatActionToastText: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: Colors.light.background,
    },
  });
};
