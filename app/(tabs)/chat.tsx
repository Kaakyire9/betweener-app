import { Colors } from "@/constants/theme";
import { useMoments } from "@/hooks/useMoments";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResolvedProfileId } from "@/hooks/useResolvedProfileId";
import { useAuth } from "@/lib/auth-context";
import { canAccessInternalTools } from "@/lib/internal-tools";
import {
  upsertChatPref,
  upsertPeerVisibilityPref,
} from "@/lib/chat/chat-list-actions-service";
import { useChatListActions } from "@/lib/chat/hooks/use-chat-list-actions";
import { useChatListFilters } from "@/lib/chat/hooks/use-chat-list-filters";
import { useChatListLocalState } from "@/lib/chat/hooks/use-chat-list-local-state";
import { useChatListScreenUi } from "@/lib/chat/hooks/use-chat-list-screen-ui";
import {
  type ChatListChatPrefRow,
  type ChatListMessageRealtimeRow,
  type ChatListReactionRow,
  useChatListSync,
} from "@/lib/chat/hooks/use-chat-list-sync";
import { useChatThreads } from "@/lib/chat/hooks/use-chat-threads";
import {
  ChatRepository,
  type ChatMessageRow,
  type ChatThreadRow,
} from "@/lib/chat/local/chat-db";
import {
  fetchRemoteChatListMessageMeta,
  fetchRemoteChatListConversations,
  fetchRemoteChatListNewMatches,
} from "@/lib/chat/sync/chat-list-sync-service";
import { isLikelyNetworkError } from "@/lib/network";
import { fetchViewedMomentIds } from "@/lib/moments-views";
import {
  buildChatConversationListStoreKey,
} from "@/lib/offline/chat-store";
import { buildLocationDisplay } from "@/lib/location/location-display";
import { getSafeRemoteImageUri, getUserFacingDisplayName } from "@/lib/profile/display-name";
import { getAuthoritativePresenceDisplay } from "@/lib/presence";
import { getChatMessagePreviewText } from "@/lib/message-preview";
import {
  selectChatListLastMessage,
  selectLatestChatListActivity,
} from "@/lib/chat/chat-list-message-merge";
import { getSupabaseNetEvents, supabase } from "@/lib/supabase";
import { captureMessage } from "@/lib/telemetry/sentry";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Notice from "@/components/ui/Notice";
import { ChatListSkeleton } from "@/components/ui/Skeleton";
import { ChatConversationRow } from "@/components/chat/ChatConversationRow";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { ChatListHeader } from "@/components/chat/ChatListHeader";
import { ChatNewMatchesStrip } from "@/components/chat/ChatNewMatchesStrip";

// Chat conversation type
type ConversationType = {
  id: string;
  isArchived: boolean;
  peerHasLeft: boolean;
  matchedUser: {
    id: string;
    userId: string;
    profileId: string | null;
    name: string;
    avatar_url: string;
    age: number;
    isOnline: boolean;
    lastSeen: Date;
    typingExpiresAt?: Date | null;
  };
  blockStatus?: 'blocked_by_me' | 'blocked_me' | null;
  latestActivity?: {
    kind: 'edit' | 'reaction';
    messageId: string;
    preview: string;
    createdAt: Date;
  } | null;
  lastMessage: {
    id: string;
    text: string;
    timestamp: Date;
    senderId: string;
    type: 'text' | 'voice' | 'image' | 'mood_sticker' | 'video' | 'document' | 'location';
    isViewOnce?: boolean;
    isRead: boolean;
    deliveredAt: Date | null;
    editedAt?: Date | null;
    localStatus?: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    reactionPreview?: {
      emoji: string;
      userId: string;
      createdAt: Date;
      targetType?: ConversationType['lastMessage']['type'];
    };
  };
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  matchedAt: Date;
};

type MessageRow = ChatListMessageRealtimeRow;

const getListRowPreviewText = (row?: Pick<MessageRow, 'deleted_for_all' | 'text' | 'message_type' | 'is_view_once'> | null) => {
  if (!row) return '';
  if (row.deleted_for_all) return 'Message deleted';
  return (
    getChatMessagePreviewText({
      text: row.text,
      messageType: row.message_type,
      isViewOnce: Boolean(row.is_view_once),
    }) || row.text || ''
  );
};

const messageRowToLocalChatMessage = (ownerUserId: string, row: MessageRow): ChatMessageRow => {
  const threadId = row.sender_id === ownerUserId ? row.receiver_id : row.sender_id;
  const isMine = row.sender_id === ownerUserId;
  const status: ChatMessageRow['status'] = row.deleted_for_all
    ? 'deleted'
    : isMine
    ? row.is_read
      ? 'read'
      : row.delivered_at
      ? 'delivered'
      : 'sent'
    : row.is_read
    ? 'read'
    : 'delivered';

  return {
    id: row.id,
    local_id: row.client_message_id ?? null,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    sender_user_id: row.sender_id,
    receiver_user_id: row.receiver_id,
    body: row.text ?? '',
    message_type: row.message_type === 'voice' ? 'voice' : ((row.message_type ?? 'text') as ChatMessageRow['message_type']),
    status,
    direction: isMine ? 'outgoing' : 'incoming',
    created_at: row.created_at,
    server_created_at: row.created_at,
    edited_at: row.edited_at ?? null,
    deleted_at: row.deleted_at ?? (row.deleted_for_all ? row.created_at : null),
    reply_to_message_id: null,
    is_view_once: row.is_view_once ? 1 : 0,
    local_only: 0,
    error_code: null,
    metadata_json: null,
    remote_updated_at: row.created_at,
    local_updated_at: new Date().toISOString(),
  };
};

type NewMatch = {
  userId: string; // auth.users.id (used by messages + chat route)
  profileId: string; // profiles.id (used by matches + profile-view)
  name: string;
  avatar_url: string | null;
  isOnline: boolean;
  lastSeen: Date;
  age?: number | null;
  location?: string | null;
};

const NEW_MATCHES_REFRESH_INTERVAL_MS = 45_000;
const BLOCKED_AVATAR_SOURCE = require('../../assets/images/circle-logo.png');
const QUICK_REPORT_REASONS = [
  { id: 'spam', label: 'Spam' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'other', label: 'Other' },
] as const;

const deserializeConversations = (raw: unknown): ConversationType[] => {
  if (!Array.isArray(raw)) return [];
  return (raw as any[]).map((c) => {
    const matchedUser = c?.matchedUser || {};
    const lastMessage = c?.lastMessage || {};
    const reaction = lastMessage?.reactionPreview || undefined;
    return {
      ...c,
      isArchived: Boolean(c?.isArchived),
      peerHasLeft: Boolean(c?.peerHasLeft),
      matchedUser: {
        ...matchedUser,
        lastSeen: matchedUser?.lastSeen ? new Date(matchedUser.lastSeen) : new Date(),
        typingExpiresAt: matchedUser?.typingExpiresAt ? new Date(matchedUser.typingExpiresAt) : null,
      },
      lastMessage: {
        ...lastMessage,
        timestamp: lastMessage?.timestamp ? new Date(lastMessage.timestamp) : new Date(),
        deliveredAt: lastMessage?.deliveredAt ? new Date(lastMessage.deliveredAt) : null,
        editedAt: lastMessage?.editedAt ? new Date(lastMessage.editedAt) : null,
        reactionPreview: reaction
          ? {
              ...reaction,
              createdAt: reaction?.createdAt ? new Date(reaction.createdAt) : new Date(),
            }
          : undefined,
      },
      latestActivity: c?.latestActivity
        ? {
            ...c.latestActivity,
            preview: rewriteReactionActivityPreview(
              c.latestActivity?.preview,
              c.latestActivity?.kind,
              matchedUser?.name,
            ),
            createdAt: c.latestActivity?.createdAt ? new Date(c.latestActivity.createdAt) : new Date(),
          }
        : null,
      matchedAt: c?.matchedAt ? new Date(c.matchedAt) : new Date(),
    } as ConversationType;
  });
};

const coerceValidDate = (value?: string | Date | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const rewriteReactionActivityPreview = (
  preview: string | null | undefined,
  kind: ConversationType['latestActivity']['kind'] | null | undefined,
  peerName: string | null | undefined,
) => {
  if (!preview || kind !== 'reaction') return preview ?? '';
  if (!preview.startsWith('Someone reacted ')) return preview;
  const resolvedPeerName = peerName && peerName !== 'Unknown' ? peerName : 'Someone';
  return preview.replace('Someone reacted ', `${resolvedPeerName} reacted `);
};

const getProfileLastSeen = (profileRow: any, fallback?: Date | null) => {
  return (
    coerceValidDate(profileRow?.last_active) ||
    coerceValidDate(profileRow?.updated_at) ||
    coerceValidDate(fallback) ||
    new Date(0)
  );
};

const localThreadToConversation = (row: ChatThreadRow): ConversationType => {
  const timestamp =
    coerceValidDate(row.last_message_at) ||
    coerceValidDate(row.remote_updated_at) ||
    coerceValidDate(row.created_at) ||
    coerceValidDate(row.local_updated_at) ||
    new Date();
  const rawPreview = row.last_message_preview || '';
  const previewLooksLikeRemoteMedia = /^https?:\/\//i.test(rawPreview);
  const preview = previewLooksLikeRemoteMedia ? 'Photo' : rawPreview;
  const previewType: ConversationType['lastMessage']['type'] =
    preview === 'Photo' || preview === 'Queued photo' || preview === 'View once photo'
      ? 'image'
      : preview === 'Video' || preview === 'Queued video' || preview === 'View once video'
      ? 'video'
      : preview === 'Voice message' || preview === 'Queued voice message'
      ? 'voice'
      : preview === 'Document' || preview === 'Queued document'
      ? 'document'
      : preview === 'Location'
      ? 'location'
      : 'text';
  const localStatus: ThreadPreviewMessage['localStatus'] =
    row.last_message_status === 'pending'
      ? 'queued'
      : row.last_message_status === 'sending' ||
        row.last_message_status === 'sent' ||
        row.last_message_status === 'delivered' ||
        row.last_message_status === 'read' ||
        row.last_message_status === 'failed'
      ? row.last_message_status
      : undefined;
  const reactionPreview =
    row.last_message_reaction_emoji && row.last_message_reaction_user_id
      ? {
          emoji: row.last_message_reaction_emoji,
          userId: row.last_message_reaction_user_id,
          createdAt: coerceValidDate(row.last_message_reaction_created_at) || timestamp,
          targetType:
            (row.last_message_reaction_target_type as ConversationType['lastMessage']['type'] | null) ??
            undefined,
        }
      : undefined;

  return {
    id: row.id,
    isArchived: row.is_archived === 1,
    peerHasLeft: false,
    matchedUser: {
      id: row.peer_user_id || row.id,
      userId: row.peer_user_id || row.id,
      profileId: row.peer_profile_id,
      name: row.peer_name || 'Unknown',
      avatar_url: row.peer_avatar_url || '',
      age: 0,
      isOnline: row.peer_presence_status === 'online',
      lastSeen: coerceValidDate(row.peer_last_active) || new Date(0),
      typingExpiresAt: null,
    },
    blockStatus: null,
    latestActivity:
      row.last_activity_kind &&
      row.last_activity_message_id &&
      row.last_activity_preview &&
      row.last_activity_at
        ? {
            kind: row.last_activity_kind,
            messageId: row.last_activity_message_id,
            preview: rewriteReactionActivityPreview(
              row.last_activity_preview,
              row.last_activity_kind,
              row.peer_name,
            ),
            createdAt: coerceValidDate(row.last_activity_at) || timestamp,
          }
        : null,
    lastMessage: {
      id: row.last_message_id || '',
      text: preview,
      timestamp,
      senderId: row.last_message_sender_id || '',
      type: previewType,
      isViewOnce: preview === 'View once photo' || preview === 'View once video',
      isRead: row.last_message_status === 'read' || (
        row.last_message_sender_id !== row.owner_user_id && row.unread_count === 0
      ),
      deliveredAt:
        row.last_message_status === 'delivered' || row.last_message_status === 'read'
          ? timestamp
          : null,
      editedAt: coerceValidDate(row.last_message_edited_at),
      localStatus,
      reactionPreview,
    },
    unreadCount: row.unread_count,
    isMuted: row.is_muted === 1,
    isPinned: row.is_pinned === 1,
    matchedAt: coerceValidDate(row.created_at) || timestamp,
  };
};

const conversationToLocalThread = (ownerUserId: string, conversation: ConversationType): ChatThreadRow => {
  const localUpdatedAt = new Date().toISOString();
  const lastMessageAt = conversation.lastMessage.timestamp instanceof Date
    ? conversation.lastMessage.timestamp.toISOString()
    : localUpdatedAt;
  const lastMessagePreview = conversation.lastMessage.isViewOnce && conversation.lastMessage.type === 'image'
    ? 'View once photo'
    : conversation.lastMessage.isViewOnce && conversation.lastMessage.type === 'video'
    ? 'View once video'
    : conversation.lastMessage.type === 'image'
    ? 'Photo'
    : conversation.lastMessage.type === 'video'
    ? 'Video'
    : conversation.lastMessage.type === 'voice'
    ? 'Voice message'
    : conversation.lastMessage.type === 'document'
    ? 'Document'
    : conversation.lastMessage.type === 'location'
    ? 'Location'
    : conversation.lastMessage.text || '';
  const localStatus = (conversation.lastMessage as ThreadPreviewMessage).localStatus;
  const reactionPreview = conversation.lastMessage.reactionPreview;
  const lastMessageStatus: ChatThreadRow['last_message_status'] =
    localStatus === 'queued'
      ? 'pending'
      : localStatus ??
        (conversation.lastMessage.isRead
          ? 'read'
          : conversation.lastMessage.deliveredAt
          ? 'delivered'
          : 'sent');

  return {
    id: conversation.id,
    owner_user_id: ownerUserId,
    peer_user_id: conversation.matchedUser.userId || conversation.id,
    peer_profile_id: conversation.matchedUser.profileId ?? null,
    peer_name: conversation.matchedUser.name || null,
    peer_avatar_url: conversation.matchedUser.avatar_url || null,
    peer_verified: 0,
    peer_presence_status: conversation.matchedUser.isOnline ? 'online' : null,
    peer_last_active: conversation.matchedUser.lastSeen instanceof Date
      ? conversation.matchedUser.lastSeen.toISOString()
      : null,
    title: null,
    thread_type: 'direct',
    last_message_id: conversation.lastMessage.id || null,
    last_message_preview: lastMessagePreview,
    last_message_sender_id: conversation.lastMessage.senderId || null,
    last_message_status: lastMessageStatus,
    last_message_edited_at: conversation.lastMessage.editedAt instanceof Date
      ? conversation.lastMessage.editedAt.toISOString()
      : null,
    last_message_reaction_emoji: reactionPreview?.emoji ?? null,
    last_message_reaction_user_id: reactionPreview?.userId ?? null,
    last_message_reaction_created_at: reactionPreview?.createdAt instanceof Date
      ? reactionPreview.createdAt.toISOString()
      : null,
    last_message_reaction_target_type: reactionPreview?.targetType ?? null,
    last_activity_kind: conversation.latestActivity?.kind ?? null,
    last_activity_message_id: conversation.latestActivity?.messageId ?? null,
    last_activity_preview: conversation.latestActivity?.preview ?? null,
    last_activity_at: conversation.latestActivity?.createdAt instanceof Date
      ? conversation.latestActivity.createdAt.toISOString()
      : null,
    last_message_at: lastMessageAt,
    unread_count: conversation.unreadCount,
    is_muted: conversation.isMuted ? 1 : 0,
    is_pinned: conversation.isPinned ? 1 : 0,
    is_archived: conversation.isArchived ? 1 : 0,
    local_status: 'active',
    remote_updated_at: lastMessageAt,
    local_updated_at: localUpdatedAt,
    created_at: conversation.matchedAt instanceof Date ? conversation.matchedAt.toISOString() : lastMessageAt,
  };
};

const getConversationLocalMergeKey = (conversation: ConversationType) =>
  [
    conversation.id,
    conversation.isArchived ? 'archived' : 'active',
    conversation.isMuted ? 'muted' : 'unmuted',
    conversation.isPinned ? 'pinned' : 'unpinned',
    conversation.unreadCount,
    conversation.lastMessage.id,
    conversation.lastMessage.text,
    conversation.lastMessage.senderId,
    conversation.lastMessage.timestamp.getTime(),
    conversation.lastMessage.type,
    conversation.lastMessage.isRead ? 'read' : 'unread',
    conversation.lastMessage.deliveredAt?.getTime() ?? 0,
    conversation.lastMessage.editedAt?.getTime() ?? 0,
    conversation.lastMessage.reactionPreview?.emoji ?? '',
    conversation.lastMessage.reactionPreview?.userId ?? '',
    conversation.lastMessage.reactionPreview?.createdAt.getTime() ?? 0,
    conversation.lastMessage.reactionPreview?.targetType ?? '',
    conversation.latestActivity?.kind ?? '',
    conversation.latestActivity?.messageId ?? '',
    conversation.latestActivity?.preview ?? '',
    conversation.latestActivity?.createdAt.getTime() ?? 0,
    (conversation.lastMessage as ThreadPreviewMessage).localStatus ?? 'server',
    conversation.matchedUser.isOnline ? 'online' : 'offline',
    conversation.matchedUser.lastSeen.getTime(),
  ].join(':');

const mergeLocalThreadsIntoConversations = (
  current: ConversationType[],
  localThreads: ChatThreadRow[],
): ConversationType[] => {
  if (localThreads.length === 0) return current;

  const mergedById = new Map(current.map((conversation) => [conversation.id, conversation] as const));

  localThreads.forEach((thread) => {
    const localConversation = localThreadToConversation(thread);
    const existing = mergedById.get(thread.id);
    if (!existing) {
      mergedById.set(thread.id, localConversation);
      return;
    }

    const hasUsefulLocalIdentity =
      localConversation.matchedUser.name !== 'Unknown' || Boolean(localConversation.matchedUser.avatar_url);

    const resolvedLastMessage = selectChatListLastMessage(
      existing.lastMessage,
      localConversation.lastMessage,
    );
    const resolvedLatestActivity = selectLatestChatListActivity(
      resolvedLastMessage,
      [localConversation.latestActivity, existing.latestActivity],
    );

    mergedById.set(thread.id, {
      ...existing,
      isArchived: localConversation.isArchived,
      isMuted: localConversation.isMuted,
      isPinned: localConversation.isPinned,
      unreadCount: localConversation.unreadCount,
      latestActivity: resolvedLatestActivity,
      matchedAt: existing.matchedAt ?? localConversation.matchedAt,
      matchedUser: hasUsefulLocalIdentity
        ? {
            ...existing.matchedUser,
            name:
              localConversation.matchedUser.name !== 'Unknown'
                ? localConversation.matchedUser.name
                : existing.matchedUser.name,
            avatar_url: localConversation.matchedUser.avatar_url || existing.matchedUser.avatar_url,
            profileId: localConversation.matchedUser.profileId ?? existing.matchedUser.profileId,
            userId: localConversation.matchedUser.userId || existing.matchedUser.userId,
            isOnline: localConversation.matchedUser.isOnline,
            lastSeen: localConversation.matchedUser.lastSeen,
          }
        : existing.matchedUser,
      lastMessage: resolvedLastMessage,
    });
  });

  const next = Array.from(mergedById.values()).sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const aActivityAt = Math.max(
      a.lastMessage.timestamp.getTime(),
      a.latestActivity?.createdAt.getTime() ?? 0,
    );
    const bActivityAt = Math.max(
      b.lastMessage.timestamp.getTime(),
      b.latestActivity?.createdAt.getTime() ?? 0,
    );
    return bActivityAt - aActivityAt;
  });

  const currentKey = current.map(getConversationLocalMergeKey).join('|');
  const nextKey = next.map(getConversationLocalMergeKey).join('|');
  return currentKey === nextKey ? current : next;
};

type ThreadPreviewMessage = ConversationType['lastMessage'] & {
  localStatus?: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
};

const areNewMatchesEqual = (left: NewMatch[], right: NewMatch[]) => {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      other &&
      item.userId === other.userId &&
      item.profileId === other.profileId &&
      item.name === other.name &&
      item.avatar_url === other.avatar_url &&
      item.isOnline === other.isOnline &&
      item.lastSeen.getTime() === other.lastSeen.getTime() &&
      item.age === other.age &&
      item.location === other.location
    );
  });
};

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

export default function ChatScreen() {
  const { user, profile } = useAuth();
  const { profileId: currentProfileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const fabBottom = Math.max(insets.bottom + 108, 128);
  const styles = useMemo(() => createStyles(theme, isDark, fabBottom), [fabBottom, theme, isDark]);
  const internalToolsEnabled = canAccessInternalTools();
  
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [newMatches, setNewMatches] = useState<NewMatch[]>([]);
  const [newMatchesLoading, setNewMatchesLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastWatchdogLogAtRef = useRef(0);
  const messagedPeerUserIdsRef = useRef<Set<string>>(new Set());
  const [viewedMomentIds, setViewedMomentIds] = useState<Set<string>>(new Set());
  const [viewedMomentIdsReady, setViewedMomentIdsReady] = useState(false);
  const { momentUsers } = useMoments({
    currentUserId: user?.id,
    currentUserProfile: profile,
  });

  const chatCacheKey = useMemo(
    () => (user?.id ? buildChatConversationListStoreKey(user.id) : null),
    [user?.id],
  );
  const conversationsRef = useRef<ConversationType[]>([]);
  const conversationsFetchInFlightRef = useRef(false);
  const newMatchesFetchInFlightRef = useRef(false);
  const lastNewMatchesFetchAtRef = useRef(0);
  const newMatchesCountRef = useRef(0);
  const [typingExpiresAtByPeer, setTypingExpiresAtByPeer] = useState<Record<string, number>>({});
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const {
    searchQuery,
    setSearchQuery,
    showSearch,
    toggleSearch,
    clearSearch,
    activeTab,
    setActiveTab,
    failedAvatarUris,
    markConversationAvatarFailed,
    pruneFailedAvatarUris,
    searchAnimation,
    openConversation,
    openNewMatch,
    openExplore,
  } = useChatListScreenUi<ConversationType, NewMatch>({
    onNewMatchOpened: (match) => {
      setNewMatches((prev) => prev.filter((item) => item.userId !== match.userId));
    },
  });
  const { rows: localObservedThreads, hasLoadedLocal: hasLoadedLocalThreads } = useChatThreads({
    ownerUserId: user?.id ?? null,
    includeArchived: true,
  });
  const {
    initialHydratedConversations,
    mergedLocalConversations,
  } = useChatListLocalState({
    ownerUserId: user?.id ?? null,
    cacheKey: chatCacheKey,
    currentConversations: conversations,
    localObservedThreads,
    hasLoadedLocalThreads,
    deserializeCache: deserializeConversations,
    threadToConversation: localThreadToConversation,
    mergeLocalThreads: mergeLocalThreadsIntoConversations,
  });
  const typingClearTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!initialHydratedConversations || initialHydratedConversations.length === 0) return;
    setConversations((prev) => (prev.length === 0 ? initialHydratedConversations : prev));
  }, [initialHydratedConversations]);

  useEffect(() => {
    if (!mergedLocalConversations) return;
    setConversations((prev) => (prev === mergedLocalConversations ? prev : mergedLocalConversations));
  }, [mergedLocalConversations]);

  useEffect(() => {
    // Keep an up-to-date set of peers we already have message history with.
    // This prevents "New matches" from flickering/loading in a loop due to callback deps.
    messagedPeerUserIdsRef.current = new Set(conversations.map((c) => c.id));
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    newMatchesCountRef.current = newMatches.length;
  }, [newMatches.length]);

  useEffect(() => {
    pruneFailedAvatarUris(conversations);
  }, [conversations, pruneFailedAvatarUris]);

  useEffect(() => {
    return () => {
      Object.values(typingClearTimersRef.current).forEach((timer) => clearTimeout(timer));
      typingClearTimersRef.current = {};
    };
  }, []);

  useFocusEffect(useCallback(() => {
    setPresenceNow(Date.now());
    const interval = setInterval(() => setPresenceNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []));

  const applyChatPrefs = useCallback(async (
    items: ConversationType[],
    serverPrefs: Map<string, { muted: boolean; pinned: boolean }>,
  ) => {
    return items.map((item) => {
      const server = serverPrefs.get(item.id);
      return {
        ...item,
        isMuted: server?.muted ?? item.isMuted,
        isPinned: server?.pinned ?? item.isPinned,
      };
    });
  }, []);

  const setPeerTypingState = useCallback((peerUserId: string, typing: boolean, expiresAtOverride?: number) => {
    const existingTimer = typingClearTimersRef.current[peerUserId];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete typingClearTimersRef.current[peerUserId];
    }

    const expiresAt = expiresAtOverride ?? Date.now() + 5000;
    if (!typing || expiresAt <= Date.now()) {
      setTypingExpiresAtByPeer((prev) => {
        if (!(peerUserId in prev)) return prev;
        const next = { ...prev };
        delete next[peerUserId];
        return next;
      });
      return;
    }

    setTypingExpiresAtByPeer((prev) => ({ ...prev, [peerUserId]: expiresAt }));
    typingClearTimersRef.current[peerUserId] = setTimeout(() => {
      delete typingClearTimersRef.current[peerUserId];
      setTypingExpiresAtByPeer((prev) => {
        if (!(peerUserId in prev)) return prev;
        const next = { ...prev };
        delete next[peerUserId];
        return next;
      });
    }, Math.max(250, expiresAt - Date.now()));
  }, []);

  const fetchNewMatches = useCallback(
    async (messagedPeerUserIds?: Set<string>, options?: { force?: boolean }) => {
      if (!user?.id || !currentProfileId) {
        setNewMatches([]);
        return;
      }
      if (newMatchesFetchInFlightRef.current) return;
      if (!options?.force && Date.now() - lastNewMatchesFetchAtRef.current < NEW_MATCHES_REFRESH_INTERVAL_MS) return;

      newMatchesFetchInFlightRef.current = true;
      lastNewMatchesFetchAtRef.current = Date.now();
      if (newMatchesCountRef.current === 0) {
        setNewMatchesLoading(true);
      }
      try {
        const sliced = await fetchRemoteChatListNewMatches<NewMatch>({
          currentProfileId,
          userId: user.id,
          messagedPeerUserIds: messagedPeerUserIds ?? messagedPeerUserIdsRef.current ?? new Set(),
          hasLocalThreadMessages: (peerUserId) => ChatRepository.hasThreadMessages(user.id, peerUserId),
          buildMatch: ({ profileRow, lastSeen }) => {
            const loc = buildLocationDisplay(profileRow as Record<string, any>, {
              surface: 'vibes',
            }).withFlag || null;

            return {
              userId: String(profileRow.user_id),
              profileId: String(profileRow.id),
              name: String(profileRow.full_name || 'New match'),
              avatar_url: getSafeRemoteImageUri(profileRow.avatar_url),
              isOnline: getAuthoritativePresenceDisplay(profileRow?.online, lastSeen.toISOString(), Date.now()).online,
              lastSeen,
              age: typeof profileRow.age === 'number' ? profileRow.age : null,
              location: loc,
            };
          },
          getMatchProfileId: (match) => match.profileId,
        });
        setNewMatches((prev) => (areNewMatchesEqual(prev, sliced) ? prev : sliced));
      } catch (error) {
        if (!isLikelyNetworkError(error)) {
          setNewMatches([]);
        }
      } finally {
        newMatchesFetchInFlightRef.current = false;
        setNewMatchesLoading(false);
      }
    },
    [currentProfileId, user?.id],
  );

  const fetchConversations = useCallback(async () => {
    if (!user?.id) return;
    if (conversationsFetchInFlightRef.current) return;
    conversationsFetchInFlightRef.current = true;
    const hadExistingConversations = conversationsRef.current.length > 0;
    if (!hadExistingConversations) {
      setIsLoading(true);
    }
    try {
      const { conversations: hydrated, combinedOtherUserIds, syncCursor } =
        await fetchRemoteChatListConversations<ConversationType, ThreadPreviewMessage, ConversationType>({
          currentProfileId,
          userId: user.id,
          currentConversationsByUserId: new Map(
            conversationsRef.current.map((conversation) => [conversation.id, conversation] as const),
          ),
          readCachedThreadFallback: async (peerUserId) => {
            const localThread = await ChatRepository.getThreadById(user.id, peerUserId);
            if (!localThread?.last_message_id) return null;
            return localThreadToConversation(localThread).lastMessage;
          },
          applyChatPrefs,
          buildConversation: ({
            otherUserId,
            entry,
            fallbackPreview,
            profileRow,
            currentConversation,
            peerVisibility,
            blockStatus,
            reactionPreview,
            matchedAt,
          }) => {
            const snapshotLastSeen = currentConversation?.matchedUser.lastSeen ?? null;
            const snapshotTypingExpiresAt = currentConversation?.matchedUser.typingExpiresAt ?? null;
            const lastSeen = getProfileLastSeen(profileRow, snapshotLastSeen);
            const presence = getAuthoritativePresenceDisplay(profileRow?.online, lastSeen.toISOString(), Date.now());
            const peerOnline =
              typeof profileRow?.online === 'boolean'
                ? Boolean(profileRow.online) && presence.online
                : presence.online;
            const last = entry?.last;
            const lastTimestamp = last?.created_at
              ? new Date(last.created_at)
              : (fallbackPreview?.timestamp ?? new Date());
            const lastText = last ? getListRowPreviewText(last) : (fallbackPreview?.text ?? '');
            const lastType = last
              ? ((last?.message_type ?? 'text') as ConversationType['lastMessage']['type'])
              : (fallbackPreview?.type ?? 'text');
            const lastIsViewOnce = last ? Boolean(last?.is_view_once) : Boolean(fallbackPreview?.isViewOnce);

            return {
              id: otherUserId,
              isArchived: Boolean(peerVisibility?.archived) && !Boolean(peerVisibility?.hidden),
              peerHasLeft:
                Boolean(profileRow?.deleted_at) || String(profileRow?.account_state || '').toLowerCase() === 'deleted',
              matchedUser: {
                id:
                  profileRow?.id ||
                  currentConversation?.matchedUser.profileId ||
                  currentConversation?.matchedUser.id ||
                  otherUserId,
                userId: otherUserId,
                profileId:
                  profileRow?.id ||
                  currentConversation?.matchedUser.profileId ||
                  currentConversation?.matchedUser.id ||
                  null,
                name: getUserFacingDisplayName(profileRow, currentConversation?.matchedUser.name || 'Unknown'),
                avatar_url:
                  getSafeRemoteImageUri(profileRow?.avatar_url) ||
                  currentConversation?.matchedUser.avatar_url ||
                  '',
                age: profileRow?.age || currentConversation?.matchedUser.age || 0,
                isOnline: peerOnline,
                lastSeen,
                typingExpiresAt: snapshotTypingExpiresAt,
              },
              blockStatus,
              latestActivity: entry?.activity
                ? {
                    kind: entry.activity.kind,
                    messageId: entry.activity.messageId,
                    preview: rewriteReactionActivityPreview(
                      entry.activity.preview,
                      entry.activity.kind,
                      getUserFacingDisplayName(profileRow, currentConversation?.matchedUser.name || 'Unknown'),
                    ),
                    createdAt: new Date(entry.activity.createdAt),
                  }
                : null,
              lastMessage: {
                id: last?.id || fallbackPreview?.id || '',
                text: lastText,
                timestamp: lastTimestamp,
                senderId: last?.sender_id || fallbackPreview?.senderId || '',
                type: lastType,
                isViewOnce: lastIsViewOnce,
                isRead: last?.is_read ?? (fallbackPreview?.isRead ?? false),
                deliveredAt: last?.delivered_at
                  ? new Date(last.delivered_at)
                  : (fallbackPreview?.deliveredAt ?? null),
                editedAt: last?.edited_at
                  ? new Date(last.edited_at)
                  : (fallbackPreview?.editedAt ?? null),
                reactionPreview: reactionPreview
                  ? {
                      ...reactionPreview,
                      targetType: reactionPreview.targetType as ConversationType['lastMessage']['type'] | undefined,
                    }
                  : undefined,
              },
              unreadCount: entry?.unread || 0,
              isMuted: false,
              isPinned: false,
              matchedAt: fallbackPreview ? matchedAt || fallbackPreview.timestamp : lastTimestamp,
            };
          },
        });

      if (combinedOtherUserIds.length === 0) {
        const hydrated = conversationsRef.current;
        const shouldPreserveExisting = hadExistingConversations || hydrated.length > 0;
        if (shouldPreserveExisting) {
          setLoadError(null);
          void ChatRepository.markSyncSucceeded(user.id, 'global_threads', { cursor: syncCursor });
          void fetchNewMatches(new Set(hydrated.map((conversation) => conversation.id)));
          return;
        }
        setConversations([]);
        setLoadError(null);
        void ChatRepository.markSyncSucceeded(user.id, 'global_threads', { cursor: syncCursor });
        // Still load matches, even if there are no prior chats.
        void fetchNewMatches(new Set());
        return;
      }
      setLoadError(null);
      setConversations(hydrated);
      try {
        await ChatRepository.upsertThreads(
          user.id,
          hydrated.map((conversation) => conversationToLocalThread(user.id, conversation)),
        );
        void ChatRepository.markSyncSucceeded(user.id, 'global_threads', { cursor: syncCursor });
      } catch (cacheError) {
        console.log('[chat] conversation cache persist error', cacheError);
      }

      // New matches are accepted matches without any message history yet.
      void fetchNewMatches(new Set(combinedOtherUserIds));
    } catch (error) {
      void ChatRepository.markSyncFailed(user.id, 'global_threads', {
        code: (error as { code?: string })?.code ?? null,
        message: error instanceof Error ? error.message : 'Failed to load chats',
      });
      if (isLikelyNetworkError(error)) {
        setLoadError(null);
        return;
      }
      console.log('[chat] conversation summaries fetch error', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load chats');
    } finally {
      conversationsFetchInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [applyChatPrefs, currentProfileId, fetchNewMatches, user?.id]);

  const refreshConversationsOnFocus = useCallback(() => {
    void fetchConversations();
  }, [fetchConversations]);

  const savePeerVisibilityPref = useCallback(
    async (peerUserId: string, next: { archived: boolean; hidden: boolean }) => {
      if (!user?.id) return { error: new Error('missing_user') };
      return upsertPeerVisibilityPref(user.id, peerUserId, next);
    },
    [user?.id],
  );

  const setPeerPinState = useCallback(
    async (peerUserId: string, pinned: boolean, muted: boolean) => {
      if (!user?.id) return;
      const { error } = await upsertChatPref(user.id, peerUserId, { pinned, muted });
      if (error) {
        console.log('[chat] chat prefs upsert error', error);
      }
    },
    [user?.id],
  );

  const applyListActivity = useCallback(
    (otherId: string, activity: NonNullable<ConversationType['latestActivity']>) => {
      if (!user?.id) return;
      const currentConversation = conversationsRef.current.find(
        (conversation) => conversation.id === otherId,
      );
      if (!currentConversation) {
        return;
      }
      const targetsLatestMessage =
        currentConversation.lastMessage.id === activity.messageId;
      if (
        activity.createdAt.getTime() <=
          currentConversation.lastMessage.timestamp.getTime() ||
        (activity.kind !== 'reaction' && !targetsLatestMessage)
      ) {
        return;
      }
      void ChatRepository.updateThreadActivityPreview(user.id, otherId, {
        kind: activity.kind,
        messageId: activity.messageId,
        preview: activity.preview,
        createdAt: activity.createdAt.toISOString(),
      }).catch((error) => console.log('[chat] list activity local persist error', error));
      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== otherId) return conversation;
          const currentActivityAt = conversation.latestActivity?.createdAt.getTime() ?? 0;
          if (currentActivityAt > activity.createdAt.getTime()) return conversation;
          return {
            ...conversation,
            latestActivity: activity,
          };
        }),
      );
    },
    [user?.id],
  );

  const handleListMessageInsert = useCallback(
    (row: MessageRow) => {
      if (!user?.id) return;
      if (!row?.sender_id || !row?.receiver_id) return;
      if (row.sender_id !== user.id && row.receiver_id !== user.id) return;
      const otherId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
      if (!otherId) return;
      void ChatRepository.upsertMessages(user.id, otherId, [
        messageRowToLocalChatMessage(user.id, row),
      ]).catch((error) => console.log('[chat] list realtime insert local persist error', error));
      void ChatRepository.markSyncSucceeded(user.id, 'global_threads', { cursor: row.created_at });
      const existing = conversationsRef.current.find((conversation) => conversation.id === otherId);
      if (!existing) {
        void fetchConversations();
      }
      if (row.receiver_id === user.id && existing?.isArchived) {
        void ChatRepository.updateThreadPreferences(user.id, otherId, { archived: false });
        void savePeerVisibilityPref(otherId, { archived: false, hidden: false });
      }
    },
    [fetchConversations, savePeerVisibilityPref, user?.id],
  );

  const handleListMessageReceiverUpdate = useCallback(
    (row: MessageRow) => {
      if (!user?.id) return;
      const otherId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
      if (!otherId) return;
      void ChatRepository.upsertMessages(user.id, otherId, [
        messageRowToLocalChatMessage(user.id, row),
      ]).catch((error) => console.log('[chat] list realtime receiver update local persist error', error));
      void ChatRepository.markSyncSucceeded(user.id, 'global_threads', { cursor: row.created_at });
      if (row.edited_at) {
        applyListActivity(otherId, {
          kind: 'edit',
          messageId: row.id,
          preview: `Edited: ${getListRowPreviewText(row)}`,
          createdAt: new Date(row.edited_at),
        });
      }
    },
    [applyListActivity, user?.id],
  );

  const handleListMessageSenderUpdate = useCallback(
    (row: MessageRow) => {
      if (!user?.id) return;
      const otherId = row.receiver_id;
      if (!otherId) return;
      void ChatRepository.upsertMessages(user.id, otherId, [
        messageRowToLocalChatMessage(user.id, row),
      ]).catch((error) => console.log('[chat] list realtime sender update local persist error', error));
      void ChatRepository.markSyncSucceeded(user.id, 'global_threads', { cursor: row.created_at });
      if (row.edited_at) {
        applyListActivity(otherId, {
          kind: 'edit',
          messageId: row.id,
          preview: `Edited: ${getListRowPreviewText(row)}`,
          createdAt: new Date(row.edited_at),
        });
      }
    },
    [applyListActivity, user?.id],
  );

  const handleListReactionChange = useCallback(
    async (row: ChatListReactionRow) => {
      if (!user?.id) return;
      if (!row?.message_id) return;
      const { data: messageRow, error } = await fetchRemoteChatListMessageMeta(row.message_id);
      if (error) {
        console.log('[chat] message reaction fetch error', error);
        return;
      }
      if (!messageRow?.sender_id || !messageRow?.receiver_id) return;
      const otherId = messageRow.sender_id === user.id ? messageRow.receiver_id : messageRow.sender_id;
      if (!otherId) return;
      const targetType = (messageRow.message_type ?? 'text') as ConversationType['lastMessage']['type'];
      const { data: reactionRows, error: reactionError } = await supabase
        .from('message_reactions')
        .select('message_id,user_id,emoji,created_at')
        .eq('message_id', row.message_id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (reactionError) {
        console.log('[chat] latest reaction preview fetch error', reactionError);
        return;
      }
      const latestReaction = reactionRows?.[0];
      const reactionPreview =
        latestReaction?.emoji && latestReaction?.user_id
          ? {
              emoji: latestReaction.emoji,
              userId: latestReaction.user_id,
              createdAt: latestReaction.created_at ? new Date(latestReaction.created_at) : new Date(),
              targetType,
            }
          : undefined;
      if (!reactionPreview) {
        void fetchConversations();
        return;
      }
      const currentConversation = conversationsRef.current.find(
        (conversation) => conversation.id === otherId,
      );
      if (
        !currentConversation ||
        reactionPreview.createdAt.getTime() <=
          currentConversation.lastMessage.timestamp.getTime()
      ) {
        return;
      }
      applyListActivity(otherId, {
        kind: 'reaction',
        messageId: messageRow.id,
        preview:
          reactionPreview.userId === user.id
            ? reactionPreview.emoji
              ? `You reacted ${reactionPreview.emoji} to their message`
              : 'You reacted to their message'
            : reactionPreview.emoji
            ? `Reacted ${reactionPreview.emoji} to your message`
            : 'Reacted to your message',
        createdAt: reactionPreview.createdAt,
      });
      void ChatRepository.updateThreadReactionPreview(
        user.id,
        otherId,
        messageRow.id,
        reactionPreview
          ? {
              ...reactionPreview,
              createdAt: reactionPreview.createdAt.toISOString(),
            }
          : null,
      ).catch((persistError) => console.log('[chat] list reaction preview local persist error', persistError));
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== otherId) return conv;
          if (conv.lastMessage.id !== messageRow.id) return conv;
          return {
            ...conv,
            lastMessage: {
              ...conv.lastMessage,
              reactionPreview,
            },
          };
        }),
      );
    },
    [applyListActivity, fetchConversations, user?.id],
  );

  const handleListChatPrefChange = useCallback((row: ChatListChatPrefRow) => {
    if (!row?.peer_id) return;
    if (user?.id) {
      void ChatRepository.updateThreadPreferences(user.id, row.peer_id, {
        muted: row.muted,
        pinned: row.pinned,
      });
    }
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === row.peer_id ||
        conv.matchedUser.userId === row.peer_id ||
        conv.matchedUser.id === row.peer_id ||
        conv.matchedUser.profileId === row.peer_id
          ? {
              ...conv,
              isMuted: row.muted ?? conv.isMuted,
              isPinned: row.pinned ?? conv.isPinned,
            }
          : conv
      )
    );
  }, [user?.id]);

  const handleListPresenceChange = useCallback(
    (row: { user_id?: string; online?: boolean | null; last_active?: string | null }) => {
      if (!row?.user_id) return;
      const lastSeen = coerceValidDate(row.last_active);
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.matchedUser.userId === row.user_id
            ? {
                ...conversation,
                matchedUser: {
                  ...conversation.matchedUser,
                  isOnline: row.online === true,
                  lastSeen: lastSeen ?? conversation.matchedUser.lastSeen,
                },
              }
            : conversation,
        ),
      );
      if (user?.id) {
        void ChatRepository.updateThreadPresence(user.id, row.user_id, {
          online: row.online,
          lastActive: row.last_active ?? null,
        });
      }
    },
    [user?.id],
  );

  useChatListSync({
    userId: user?.id ?? null,
    refreshConversationsOnFocus,
    fetchConversations,
    fetchNewMatches: () => fetchNewMatches(),
    setPeerTypingState,
    onMessageInsert: handleListMessageInsert,
    onMessageReceiverUpdate: handleListMessageReceiverUpdate,
    onMessageSenderUpdate: handleListMessageSenderUpdate,
    onReactionChange: handleListReactionChange,
    onChatPrefChange: handleListChatPrefChange,
    onPresenceChange: handleListPresenceChange,
    visiblePeerUserIds: conversations.map((conversation) => conversation.matchedUser.userId),
  });
  const {
    openConversationMoreActions,
    handleArchiveConversation,
    handleRemoveConversation,
    togglePin,
  } = useChatListActions<ConversationType>({
    userId: user?.id ?? null,
    conversations,
    setConversations,
    quickReportReasons: QUICK_REPORT_REASONS,
    savePeerVisibilityPref,
    setPeerPinState,
  });

  // Guardrail: avoid "skeleton forever" if a request stalls or state never resolves.
  useEffect(() => {
    if (!isLoading || conversations.length > 0 || loadError) return;
    const t = setTimeout(() => {
      if (!isLoading || conversations.length > 0 || loadError) return;
      setLoadError("timeout");
      setIsLoading(false);

      const now = Date.now();
      if (now - lastWatchdogLogAtRef.current > 60_000) {
        lastWatchdogLogAtRef.current = now;
        captureMessage("[chat] loading timeout (skeleton watchdog)", {
          hasUserId: !!user?.id,
          conversations: conversations.length,
          net: getSupabaseNetEvents(),
        });
      }
    }, 12_000);
    return () => clearTimeout(t);
  }, [conversations.length, isLoading, loadError, user?.id]);

  const {
    filteredConversations,
    unreadConversationCount,
    archivedConversationCount,
  } = useChatListFilters({
    conversations,
    searchQuery,
    activeTab,
  });
  const momentUsersWithContent = useMemo(
    () => momentUsers.filter((entry) => entry.moments.length > 0),
    [momentUsers],
  );
  const refreshViewedMomentIds = useCallback(async () => {
    const momentIds = momentUsersWithContent.flatMap((entry) => entry.moments.map((moment) => String(moment.id))).filter(Boolean);
    if (momentIds.length === 0) {
      setViewedMomentIds(new Set());
      setViewedMomentIdsReady(true);
      return;
    }
    setViewedMomentIdsReady(false);
    const nextViewedIds = await fetchViewedMomentIds(momentIds);
    setViewedMomentIds(nextViewedIds);
    setViewedMomentIdsReady(true);
  }, [momentUsersWithContent]);
  useEffect(() => {
    void refreshViewedMomentIds();
  }, [refreshViewedMomentIds]);
  useFocusEffect(
    useCallback(() => {
      void refreshViewedMomentIds();
    }, [refreshViewedMomentIds]),
  );
  const unseenMomentPeerUserIds = useMemo(
    () => {
      if (!viewedMomentIdsReady) return new Set<string>();
      return (
      new Set(
        momentUsersWithContent
          .filter(
            (entry) =>
              !entry.isOwn &&
              entry.moments.some((moment) => !viewedMomentIds.has(String(moment.id))),
          )
          .map((entry) => String(entry.userId)),
      )
      );
    },
    [momentUsersWithContent, viewedMomentIds, viewedMomentIdsReady],
  );

  const renderConversation = ({ item }: { item: ConversationType }) => (
    <ChatConversationRow
      item={item}
      userId={user?.id ?? null}
      presenceNow={presenceNow}
      typingExpiresAtByPeer={typingExpiresAtByPeer}
      activeMomentPeerUserIds={unseenMomentPeerUserIds}
      failedAvatarUris={failedAvatarUris}
      theme={theme}
      isDark={isDark}
      styles={styles}
      blockedAvatarSource={BLOCKED_AVATAR_SOURCE}
      onMarkAvatarFailed={markConversationAvatarFailed}
      onOpenConversation={openConversation}
      onTogglePin={togglePin}
      onArchiveConversation={handleArchiveConversation}
      onOpenConversationMoreActions={openConversationMoreActions}
      onRemoveConversation={handleRemoveConversation}
    />
  );

  const showBlockingError = Boolean(loadError && conversations.length === 0);
  const showEmptyState = filteredConversations.length === 0 && !showBlockingError && newMatches.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      <ChatListHeader
        showSearch={showSearch}
        searchAnimation={searchAnimation}
        searchQuery={searchQuery}
        onToggleSearch={toggleSearch}
        showDiagnosticsButton={internalToolsEnabled}
        onOpenDiagnostics={() => router.push('/chat-storage-diagnostics')}
        onChangeSearchQuery={setSearchQuery}
        onClearSearch={clearSearch}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        unreadConversationCount={unreadConversationCount}
        archivedConversationCount={archivedConversationCount}
        styles={styles}
        theme={theme}
      />
      <ChatNewMatchesStrip
        newMatches={newMatches}
        newMatchesLoading={newMatchesLoading}
        onOpenNewMatch={openNewMatch}
        styles={styles}
      />

      {showBlockingError ? (
        <Notice
          title="Couldn't load chats"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            void fetchConversations();
            void fetchNewMatches(undefined, { force: true });
          }}
          icon="cloud-alert"
        />
      ) : null}

      {isLoading && conversations.length === 0 && newMatches.length === 0 ? (
        <ChatListSkeleton />
      ) : showEmptyState ? (
        <ChatEmptyState
          activeTab={activeTab}
          styles={styles}
          theme={theme}
          isDark={isDark}
          withAlpha={withAlpha}
          onExplore={openExplore}
        />
      ) : (
        <FlatList
          data={filteredConversations}
          extraData={{ presenceNow, typingExpiresAtByPeer }}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.conversationsList}
          showsVerticalScrollIndicator={false}
          refreshing={isLoading}
          onRefresh={() => {
            void fetchConversations();
            void fetchNewMatches(undefined, { force: true });
          }}
        />
      )}

      {!showEmptyState ? (
        <TouchableOpacity 
          style={styles.fab}
          onPress={openExplore}
        >
          <MaterialCommunityIcons name="plus" size={24} color={Colors.light.background} />
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean, fabBottom: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },

    // Header
    header: {
      backgroundColor: theme.background,
      paddingHorizontal: 20,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 14,
      paddingBottom: 12,
    },
    headerTitle: {
      fontSize: 30,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: theme.text,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 12,
    },
    headerButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.backgroundSubtle,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.12),
    },
    searchShortcut: {
      minHeight: 44,
      borderRadius: 22,
      marginBottom: 12,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? 'rgba(244, 235, 221, 0.075)' : 'rgba(7, 30, 34, 0.055)',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.13 : 0.08),
    },
    searchShortcutText: {
      flex: 1,
      minWidth: 0,
      fontSize: 14.5,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    searchShortcutKeyline: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.13 : 0.1),
    },

    // New matches strip
    newMatchesSection: {
      paddingTop: 14,
      paddingBottom: 10,
      paddingHorizontal: 20,
    },
    newMatchesTitleRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    newMatchesTitle: {
      fontSize: 16,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
    },
    newMatchesSubtitle: {
      fontSize: 12,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    newMatchesList: {
      paddingRight: 8,
      gap: 12,
    },
    newMatchCard: {
      width: 86,
      alignItems: 'center',
    },
    newMatchAvatar: {
      width: 62,
      height: 62,
      borderRadius: 31,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      backgroundColor: theme.backgroundSubtle,
    },
    newMatchName: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: theme.text,
      maxWidth: 82,
      textAlign: 'center',
    },
    newMatchMeta: {
      marginTop: 2,
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      maxWidth: 82,
      textAlign: 'center',
    },

    // Search
    searchContainer: {
      overflow: 'hidden',
      marginBottom: 16,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.backgroundSubtle,
      borderRadius: 25,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      fontFamily: 'Manrope_400Regular',
      color: theme.text,
    },

    // Filter Tabs
    filterTabs: {
      flexDirection: 'row',
      gap: 3,
      padding: 4,
      borderRadius: 16,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.7 : 0.9),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.07),
    },
    filterTab: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 9,
      borderRadius: 10,
    },
    activeFilterTab: {
      backgroundColor: theme.tint,
      borderColor: theme.tint,
    },
    filterTabText: {
      fontSize: 14,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    activeFilterTabText: {
      color: Colors.light.background,
      fontFamily: 'Manrope_600SemiBold',
    },
    tabBadge: {
      fontSize: 12,
      opacity: 0.8,
      color: theme.textMuted,
    },

    // Conversations List
    conversationsList: {
      paddingTop: 2,
      paddingBottom: 136,
    },
    swipeActionRail: {
      justifyContent: 'center',
      marginVertical: 4,
    },
    swipeActionRailLeft: {
      marginLeft: 16,
    },
    swipeActionRailRight: {
      marginRight: 16,
      alignItems: 'flex-end',
    },
    swipeAction: {
      minWidth: 94,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 14,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'stretch',
    },
    archiveAction: {
      backgroundColor: theme.accent,
    },
    removeAction: {
      backgroundColor: '#C65A5A',
    },
    moreAction: {
      backgroundColor: withAlpha(theme.tint, 0.82),
    },
    swipeActionText: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: Colors.light.background,
    },
    conversationItem: {
      marginHorizontal: 16,
      paddingHorizontal: 4,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.07),
    },
    conversationItemPressed: {
      opacity: 0.72,
    },
    leftConversation: {
      backgroundColor: isDark ? 'rgba(232, 219, 203, 0.045)' : 'rgba(247, 240, 232, 0.96)',
      borderColor: isDark ? 'rgba(196, 171, 145, 0.18)' : 'rgba(188, 164, 140, 0.18)',
    },
    pinnedConversation: {
      backgroundColor: withAlpha(theme.accent, isDark ? 0.13 : 0.08),
      borderBottomColor: withAlpha(theme.accent, isDark ? 0.34 : 0.2),
    },
    archivedConversation: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.035),
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
    },
    unreadConversation: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.075 : 0.045),
      borderBottomColor: withAlpha(theme.tint, isDark ? 0.28 : 0.18),
    },
    conversationLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarContainer: {
      position: 'relative',
      marginRight: 11,
    },
    avatarRing: {
      padding: 2,
      borderRadius: 30,
      backgroundColor: withAlpha(theme.background, isDark ? 0.5 : 0.82),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    avatarRingLeft: {
      backgroundColor: isDark ? 'rgba(196, 171, 145, 0.08)' : 'rgba(255, 249, 242, 0.92)',
      borderColor: isDark ? 'rgba(196, 171, 145, 0.18)' : 'rgba(188, 164, 140, 0.18)',
    },
    avatarRingUnread: {
      padding: 2,
      borderRadius: 30,
    },
    avatarRingMoment: {
      padding: 2,
      borderRadius: 30,
      shadowColor: '#f3c784',
      shadowOpacity: isDark ? 0.34 : 0.22,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
    avatarRingMomentUnread: {
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.42 : 0.28,
    },
    avatarRingInner: {
      borderRadius: 25,
      backgroundColor: theme.background,
      padding: 2,
      overflow: 'hidden',
    },
    avatarRingMomentInner: {
      borderRadius: 25,
      backgroundColor: theme.background,
      padding: 2,
      overflow: 'hidden',
    },
    conversationAvatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
    },
    avatarFallback: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarFallbackLeft: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(248, 236, 221, 0.16)' : 'rgba(143, 112, 84, 0.18)',
    },
    avatarFallbackText: {
      fontSize: 18,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    momentBadge: {
      position: 'absolute',
      right: -1,
      top: -1,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#f59e0b',
      borderWidth: 2,
      borderColor: theme.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    onlineIndicator: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.secondary,
      borderWidth: 2,
      borderColor: theme.background,
    },
    pinIndicator: {
      position: 'absolute',
      top: -1,
      right: -1,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    archivedIndicator: {
      position: 'absolute',
      top: -1,
      right: -1,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: withAlpha(theme.text, isDark ? 0.76 : 0.68),
      justifyContent: 'center',
      alignItems: 'center',
    },
    conversationContent: {
      flex: 1,
    },
    conversationHeader: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'center',
      gap: 8,
      marginBottom: 5,
    },
    conversationHeaderIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 128,
    },
    conversationName: {
      fontSize: 16,
      fontFamily: 'Archivo_600SemiBold',
      color: theme.text,
      flex: 1,
      minWidth: 0,
    },
    leftConversationName: {
      color: theme.text,
    },
    mutedIcon: {
      marginLeft: 6,
    },
    archivedMetaLabel: {
      fontSize: 10.5,
      fontFamily: 'Manrope_700Bold',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    leftStateLabel: {
      fontSize: 10.5,
      fontFamily: 'Manrope_700Bold',
      color: isDark ? '#D6C0AA' : '#8E735A',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    unreadName: {
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    conversationTime: {
      fontSize: 11.5,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
      marginLeft: 'auto',
    },
    unreadTime: {
      color: theme.tint,
      fontFamily: 'Manrope_700Bold',
    },
    lastSeenText: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 2,
    },
    conversationPreview: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    conversationMeta: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      minWidth: 28,
      marginLeft: 8,
    },
    lastMessageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
    },
    lastMessage: {
      fontSize: 13.5,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      flex: 1,
      minWidth: 0,
      marginRight: 6,
    },
    leftConversationPreviewText: {
      color: isDark ? 'rgba(226, 212, 197, 0.72)' : '#887360',
    },
    typingText: {
      fontFamily: 'Manrope_500Medium',
      color: theme.accent,
    },
    readReceiptIcon: {
      marginRight: 5,
    },
    unreadMessage: {
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
    },
    unreadBadge: {
      backgroundColor: theme.tint,
      borderRadius: 11,
      minWidth: 22,
      height: 22,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.3 : 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    unreadCount: {
      fontSize: 11,
      fontFamily: 'Archivo_700Bold',
      color: Colors.light.background,
    },

    // Empty State
    emptyStateScroll: {
      flex: 1,
    },
    emptyStateContent: {
      paddingBottom: 40,
    },
    emptyState: {
      justifyContent: 'flex-start',
      alignItems: 'center',
      width: '100%',
      paddingHorizontal: 40,
      paddingTop: 24,
      paddingBottom: 120,
    },
    emptyHero: {
      width: '100%',
      alignItems: 'center',
      marginBottom: 22,
      position: 'relative',
    },
    emptyHeroGlowLeft: {
      position: 'absolute',
      left: '12%',
      top: 24,
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.14),
    },
    emptyHeroGlowRight: {
      position: 'absolute',
      right: '10%',
      bottom: 22,
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: withAlpha(theme.accent, isDark ? 0.16 : 0.14),
    },
    emptyHeroPanel: {
      width: '100%',
      minHeight: 208,
      borderRadius: 28,
      paddingHorizontal: 22,
      paddingVertical: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: isDark ? 0.28 : 0.14,
      shadowRadius: 30,
      elevation: 10,
      overflow: 'hidden',
    },
    emptyHeroBadge: {
      width: 78,
      height: 78,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    emptyHeroOrb: {
      position: 'absolute',
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.8 : 0.92),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    emptyHeroOrbLeft: {
      left: 28,
      top: 38,
    },
    emptyHeroOrbRight: {
      right: 30,
      top: 90,
    },
    emptyHeroKicker: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      color: theme.tint,
      marginBottom: 8,
    },
    emptyHeroLine: {
      fontSize: 22,
      lineHeight: 28,
      textAlign: 'center',
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
      maxWidth: 260,
    },
    emptyStateTitle: {
      fontSize: 20,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyStateText: {
      fontSize: 16,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 24,
    },
    emptyHighlights: {
      width: '100%',
      gap: 10,
      marginBottom: 24,
    },
    emptyHighlightCard: {
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      alignItems: 'flex-start',
    },
    emptyHighlightTitle: {
      marginTop: 8,
      fontSize: 14,
      fontFamily: 'Archivo_600SemiBold',
      color: theme.text,
    },
    emptyHighlightText: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    exploreButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.tint,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 25,
      gap: 8,
    },
    exploreButtonText: {
      fontSize: 16,
      fontFamily: 'Archivo_600SemiBold',
      color: Colors.light.background,
    },

    // FAB
    fab: {
      position: 'absolute',
      bottom: fabBottom,
      right: 22,
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: theme.tint,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: isDark ? 0.26 : 0.18,
      shadowRadius: 14,
      elevation: 7,
    },
  });
