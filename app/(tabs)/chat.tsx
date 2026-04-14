import { Colors } from "@/constants/theme";
import { useMoments } from "@/hooks/useMoments";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResolvedProfileId } from "@/hooks/useResolvedProfileId";
import { useAuth } from "@/lib/auth-context";
import { haptics } from "@/lib/haptics";
import { fetchPeerVisibilityPrefs } from "@/lib/peer-visibility";
import { getSafeRemoteImageUri, getUserFacingDisplayName } from "@/lib/profile/display-name";
import { getProfileInitials, getProfilePlaceholderPalette } from "@/lib/profile-placeholders";
import { getDatePlanPreviewText } from "@/lib/message-preview";
import { getSupabaseNetEvents, supabase } from "@/lib/supabase";
import { captureMessage } from "@/lib/telemetry/sentry";
import { readCache, writeCache } from "@/lib/persisted-cache";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import Notice from "@/components/ui/Notice";
import { ChatListSkeleton } from "@/components/ui/Skeleton";

// Chat conversation type
type ConversationType = {
  id: string;
  isArchived: boolean;
  peerHasLeft: boolean;
  matchedUser: {
    id: string;
    name: string;
    avatar_url: string;
    age: number;
    isOnline: boolean;
    lastSeen: Date;
  };
  blockStatus?: 'blocked_by_me' | 'blocked_me' | null;
  lastMessage: {
    id: string;
    text: string;
    timestamp: Date;
    senderId: string;
    type: 'text' | 'voice' | 'image' | 'mood_sticker' | 'video' | 'document' | 'location';
    isViewOnce?: boolean;
    isRead: boolean;
    deliveredAt: Date | null;
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

type MessageRow = {
  id: string;
  text: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
  delivered_at?: string | null;
  deleted_for_all?: boolean | null;
  message_type?: ConversationType['lastMessage']['type'] | null;
  is_view_once?: boolean | null;
};

type NewMatch = {
  userId: string; // auth.users.id (used by messages + chat route)
  profileId: string; // profiles.id (used by matches + profile-view)
  name: string;
  avatar_url: string | null;
  age?: number | null;
  location?: string | null;
};

const CHAT_PREFS_STORAGE_KEY = 'chat_header_prefs_v1';
const CHAT_LIST_CACHE_TTL_MS = 10 * 60_000;
const BLOCKED_AVATAR_SOURCE = require('../../assets/images/circle-logo.png');
const STICKER_TEXT_PREFIX = 'sticker::';
const QUICK_REPORT_REASONS = [
  { id: 'spam', label: 'Spam' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'other', label: 'Other' },
] as const;

type CachedConversation = Omit<ConversationType, "matchedUser" | "lastMessage" | "matchedAt"> & {
  matchedUser: Omit<ConversationType["matchedUser"], "lastSeen"> & { lastSeen: string };
  lastMessage: Omit<ConversationType["lastMessage"], "timestamp" | "reactionPreview" | "deliveredAt"> & {
    timestamp: string;
    deliveredAt: string | null;
    reactionPreview?: Omit<NonNullable<ConversationType["lastMessage"]["reactionPreview"]>, "createdAt"> & { createdAt: string };
  };
  matchedAt: string;
};

const serializeConversations = (list: ConversationType[]): CachedConversation[] => {
  return (list || []).map((c) => ({
    ...c,
    matchedUser: {
      ...c.matchedUser,
      lastSeen: c.matchedUser.lastSeen instanceof Date ? c.matchedUser.lastSeen.toISOString() : new Date().toISOString(),
    },
    lastMessage: {
      ...c.lastMessage,
      timestamp: c.lastMessage.timestamp instanceof Date ? c.lastMessage.timestamp.toISOString() : new Date().toISOString(),
      deliveredAt: c.lastMessage.deliveredAt instanceof Date ? c.lastMessage.deliveredAt.toISOString() : null,
      reactionPreview: c.lastMessage.reactionPreview
        ? {
            ...c.lastMessage.reactionPreview,
            createdAt:
              c.lastMessage.reactionPreview.createdAt instanceof Date
                ? c.lastMessage.reactionPreview.createdAt.toISOString()
                : new Date().toISOString(),
          }
        : undefined,
    },
    matchedAt: c.matchedAt instanceof Date ? c.matchedAt.toISOString() : new Date().toISOString(),
  }));
};

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
      },
      lastMessage: {
        ...lastMessage,
        timestamp: lastMessage?.timestamp ? new Date(lastMessage.timestamp) : new Date(),
        deliveredAt: lastMessage?.deliveredAt ? new Date(lastMessage.deliveredAt) : null,
        reactionPreview: reaction
          ? {
              ...reaction,
              createdAt: reaction?.createdAt ? new Date(reaction.createdAt) : new Date(),
            }
          : undefined,
      },
      matchedAt: c?.matchedAt ? new Date(c.matchedAt) : new Date(),
    } as ConversationType;
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

const parseStickerPreview = (text: string) => {
  if (!text) return null;
  if (!text.startsWith(STICKER_TEXT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(STICKER_TEXT_PREFIX.length));
    if (!parsed || typeof parsed.emoji !== 'string') return null;
    const name = typeof parsed.name === 'string' ? parsed.name : 'Sticker';
    return `${parsed.emoji} ${name}`.trim();
  } catch {
    return null;
  }
};

const getConversationReceiptIconState = (
  lastMessage: ConversationType['lastMessage'],
  theme: typeof Colors.light,
  isDark: boolean,
) => {
  if (lastMessage.isRead) {
    return { name: 'check-all' as const, color: isDark ? '#BFFBEA' : '#0B8F89' };
  }
  if (lastMessage.deliveredAt) {
    return { name: 'check-all' as const, color: isDark ? '#F4FBFA' : '#C4CFCE' };
  }
  return { name: 'check' as const, color: isDark ? '#AAB8B4' : '#8A9895' };
};

export default function ChatScreen() {
  const { user, profile } = useAuth();
  const { profileId: currentProfileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [newMatches, setNewMatches] = useState<NewMatch[]>([]);
  const [newMatchesLoading, setNewMatchesLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastWatchdogLogAtRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'pinned' | 'archived'>('all');
  const [presenceOnline, setPresenceOnline] = useState<Record<string, boolean>>({});
  const [presenceLastSeen, setPresenceLastSeen] = useState<Record<string, Date>>({});
  const [typingStatus, setTypingStatus] = useState<Record<string, boolean>>({});
  const messagedPeerUserIdsRef = useRef<Set<string>>(new Set());
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const swipeActionBusyRef = useRef<Record<string, boolean>>({});
  const { momentUsers } = useMoments({
    currentUserId: user?.id,
    currentUserProfile: profile,
  });

  const chatCacheKey = useMemo(
    () => (user?.id ? `cache:chat_list:v1:${user.id}` : null),
    [user?.id],
  );
  const chatCacheLoadedKeyRef = useRef<string | null>(null);
  
  const searchAnimation = useRef(new Animated.Value(0)).current;

  // Cached-first: hydrate the last conversation list quickly, then refresh in background.
  useEffect(() => {
    if (!chatCacheKey) return;
    if (chatCacheLoadedKeyRef.current === chatCacheKey) return;
    chatCacheLoadedKeyRef.current = chatCacheKey;

    let cancelled = false;
    (async () => {
      const cached = await readCache<CachedConversation[]>(chatCacheKey, CHAT_LIST_CACHE_TTL_MS);
      if (cancelled || !cached) return;
      const hydrated = deserializeConversations(cached);
      if (hydrated.length > 0) {
        setConversations((prev) => (prev.length === 0 ? hydrated : prev));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatCacheKey]);

  useEffect(() => {
    // Keep an up-to-date set of peers we already have message history with.
    // This prevents "New matches" from flickering/loading in a loop due to callback deps.
    messagedPeerUserIdsRef.current = new Set(conversations.map((c) => c.id));
  }, [conversations]);

  useEffect(() => {
    if (showSearch) {
      Animated.timing(searchAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(searchAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [showSearch]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel('presence:chatlist', {
      config: {
        presence: { key: user.id },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineMap: Record<string, boolean> = {};
        Object.keys(state).forEach((key) => {
          onlineMap[key] = (state as any)[key]?.length > 0;
        });
        setPresenceOnline(onlineMap);
        setPresenceLastSeen((prev) => {
          const next = { ...prev };
          Object.keys(onlineMap).forEach((key) => {
            if (onlineMap[key]) {
              delete next[key];
            }
          });
          return next;
        });
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (!key) return;
        setPresenceOnline((prev) => ({ ...prev, [key]: true }));
        setPresenceLastSeen((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (!key) return;
        setPresenceOnline((prev) => ({ ...prev, [key]: false }));
        setPresenceLastSeen((prev) => ({ ...prev, [key]: new Date() }));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ onlineAt: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const typingChannel = supabase.channel(`typing:chatlist:${user.id}`, {
      config: {
        broadcast: { self: false },
      },
    });

    typingChannel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload?.senderId) return;
        setTypingStatus((prev) => ({ ...prev, [payload.senderId]: Boolean(payload.typing) }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(typingChannel);
    };
  }, [user?.id]);

  const applyChatPrefs = useCallback(async (
    items: ConversationType[],
    serverPrefs: Map<string, { muted: boolean; pinned: boolean }>,
  ) => {
    let localParsed: Record<string, { muted?: boolean; pinned?: boolean }> = {};
    try {
      const raw = await AsyncStorage.getItem(CHAT_PREFS_STORAGE_KEY);
      localParsed = raw ? JSON.parse(raw) : {};
    } catch {
      localParsed = {};
    }
    return items.map((item) => {
      const local = localParsed?.[item.id] ?? {};
      const server = serverPrefs.get(item.id);
      return {
        ...item,
        isMuted: server?.muted ?? Boolean(local.muted),
        isPinned: server?.pinned ?? Boolean(local.pinned) ?? item.isPinned,
      };
    });
  }, []);

  const fetchNewMatches = useCallback(
    async (messagedPeerUserIds?: Set<string>) => {
      if (!user?.id || !currentProfileId) {
        setNewMatches([]);
        return;
      }

      setNewMatchesLoading(true);
      try {
        const { data: matches, error } = await supabase
          .from('matches')
          .select('id,user1_id,user2_id,status,updated_at')
          .eq('status', 'ACCEPTED')
          .or(`user1_id.eq.${currentProfileId},user2_id.eq.${currentProfileId}`)
          .order('updated_at', { ascending: false })
          .limit(60);

        if (error || !matches) {
          setNewMatches([]);
          return;
        }

        const otherProfileIds = Array.from(
          new Set(
            (matches as any[])
              .map((m) => (m.user1_id === currentProfileId ? m.user2_id : m.user1_id))
              .filter((v: any) => typeof v === 'string' && v.length > 0),
          ),
        );

        if (otherProfileIds.length === 0) {
          setNewMatches([]);
          return;
        }

        const { data: peerProfiles, error: peerProfilesError } = await supabase
          .from('profiles')
          .select('id,user_id,full_name,avatar_url,age,location,city,region,account_state,deleted_at')
          .in('id', otherProfileIds.slice(0, 24));

        if (peerProfilesError || !peerProfiles) {
          setNewMatches([]);
          return;
        }

        const messaged = messagedPeerUserIds ?? messagedPeerUserIdsRef.current ?? new Set();
        const next: NewMatch[] = [];

        (peerProfiles as any[]).forEach((p) => {
          if (!p?.id || !p?.user_id) return;
          const hasLeft = Boolean(p?.deleted_at) || String(p?.account_state || '').toLowerCase() === 'deleted';
          if (hasLeft) return;
          const peerUserId = String(p.user_id);
          if (messaged.has(peerUserId)) return;

          const loc =
            (typeof p.location === 'string' && p.location) ||
            (typeof p.city === 'string' && p.city) ||
            (typeof p.region === 'string' && p.region) ||
            null;

          next.push({
            userId: peerUserId,
            profileId: String(p.id),
            name: String(p.full_name || 'New match'),
            avatar_url: getSafeRemoteImageUri(p.avatar_url),
            age: typeof p.age === 'number' ? p.age : null,
            location: loc,
          });
        });

        // Keep a stable, recent ordering based on the matches query (best-effort).
        const order = new Map(otherProfileIds.map((id, idx) => [id, idx]));
        next.sort((a, b) => (order.get(a.profileId) ?? 0) - (order.get(b.profileId) ?? 0));

        setNewMatches(next.slice(0, 18));
      } catch {
        setNewMatches([]);
      } finally {
        setNewMatchesLoading(false);
      }
    },
    [currentProfileId, user?.id],
  );

  const fetchConversations = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { data: messages, error } = await supabase
        .from('messages')
        .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at,deleted_for_all,message_type,is_view_once')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) {
        console.log('[chat] messages fetch error', error);
        setLoadError(error.message || "Failed to load chats");
        return;
      }

      const rows = (messages || []) as MessageRow[];
      const rawMessageIds = rows.map((msg) => msg.id).filter(Boolean);
      let hiddenMessageIdSet = new Set<string>();
      if (rawMessageIds.length > 0) {
        const { data: hiddenRows, error: hiddenError } = await supabase
          .from('message_hides')
          .select('message_id')
          .eq('user_id', user.id)
          .in('message_id', rawMessageIds);

        if (hiddenError) {
          console.log('[chat] hidden messages fetch error', hiddenError);
        } else {
          hiddenMessageIdSet = new Set(
            ((hiddenRows as { message_id: string }[] | null) ?? []).map((row) => row.message_id),
          );
        }
      }

      const visibleRows = rows.filter((msg) => !hiddenMessageIdSet.has(msg.id));
      const convoMap = new Map<string, { last: MessageRow; unread: number }>();
      const messageById = new Map<string, MessageRow>();

      visibleRows.forEach((msg) => {
        if (msg.id) messageById.set(msg.id, msg);
        const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        if (!otherId) return;
        if (!convoMap.has(otherId)) {
          convoMap.set(otherId, { last: msg, unread: 0 });
        }
        if (msg.receiver_id === user.id && !msg.is_read) {
          const entry = convoMap.get(otherId);
          if (entry) entry.unread += 1;
        }
      });

      const otherUserIds = Array.from(convoMap.keys());
      const messageIds = visibleRows.map((msg) => msg.id).filter(Boolean);
      const reactionPreviewByUser = new Map<string, ConversationType['lastMessage']['reactionPreview']>();
      if (messageIds.length > 0) {
        const { data: reactionsData, error: reactionsError } = await supabase
          .from('message_reactions')
          .select('message_id,user_id,emoji,created_at')
          .in('message_id', messageIds)
          .order('created_at', { ascending: false });
        if (reactionsError) {
          console.log('[chat] message reactions fetch error', reactionsError);
        } else {
          (reactionsData || []).forEach((row: any) => {
            const msg = row?.message_id ? messageById.get(row.message_id) : null;
            if (!msg || !row?.emoji || !row?.user_id) return;
            const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
            if (!otherId) return;
            const lastForConversation = convoMap.get(otherId)?.last;
            if (!lastForConversation?.id || lastForConversation.id !== msg.id) return;
            const createdAt = row.created_at ? new Date(row.created_at) : new Date();
            const existing = reactionPreviewByUser.get(otherId);
            if (existing && existing.createdAt >= createdAt) return;
            const targetType = (msg.message_type ?? 'text') as ConversationType['lastMessage']['type'];
            reactionPreviewByUser.set(otherId, {
              emoji: row.emoji,
              userId: row.user_id,
              createdAt,
              targetType,
            });
          });
        }
      }
      if (otherUserIds.length === 0) {
        setConversations([]);
        setLoadError(null);
        if (chatCacheKey) void writeCache(chatCacheKey, serializeConversations([]));
        // Still load matches, even if there are no prior chats.
        void fetchNewMatches(new Set());
        return;
      }

        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id,full_name,avatar_url,age,online,updated_at,account_state,deleted_at')
          .in('user_id', otherUserIds);

      if (profilesError) {
        console.log('[chat] profiles fetch error', profilesError);
        setLoadError(profilesError.message || "Failed to load chats");
        return;
      }

      const { data: blocksData, error: blocksError } = await supabase
        .from('blocks')
        .select('blocker_id,blocked_id')
        .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);

      if (blocksError) {
        console.log('[chat] blocks fetch error', blocksError);
      }

      const blockStatusByUser = new Map<string, ConversationType['blockStatus']>();
      (blocksData || []).forEach((row: { blocker_id: string; blocked_id: string }) => {
        if (row.blocker_id === user.id) {
          blockStatusByUser.set(row.blocked_id, 'blocked_by_me');
        } else if (row.blocked_id === user.id) {
          blockStatusByUser.set(row.blocker_id, 'blocked_me');
        }
      });

      const profileByUser = new Map(
        (profilesData || []).map((p: any) => [p.user_id, p])
      );
      const peerVisibilityPrefs = await fetchPeerVisibilityPrefs(user.id, otherUserIds);

      const nextConversations: ConversationType[] = otherUserIds.map((otherUserId) => {
        const entry = convoMap.get(otherUserId);
        const profileRow = profileByUser.get(otherUserId);
        const peerVisibility = peerVisibilityPrefs[otherUserId];
        const last = entry?.last;
        const lastTimestamp = last?.created_at ? new Date(last.created_at) : new Date();
        const lastText = getRowPreviewText(last);
        const lastType = (last?.message_type ?? 'text') as ConversationType['lastMessage']['type'];
        const lastIsViewOnce = Boolean(last?.is_view_once);
        const blockStatus = blockStatusByUser.get(otherUserId) ?? null;
        return {
          id: otherUserId,
          isArchived: Boolean(peerVisibility?.archived) && !Boolean(peerVisibility?.hidden),
          peerHasLeft: Boolean(profileRow?.deleted_at) || String(profileRow?.account_state || '').toLowerCase() === 'deleted',
          matchedUser: {
            id: otherUserId,
            name: getUserFacingDisplayName(profileRow, 'Unknown'),
            avatar_url: getSafeRemoteImageUri(profileRow?.avatar_url) || '',
            age: profileRow?.age || 0,
            isOnline: !!profileRow?.online,
            lastSeen: profileRow?.updated_at ? new Date(profileRow.updated_at) : new Date(),
          },
          blockStatus,
          lastMessage: {
            id: last?.id || '',
            text: lastText,
            timestamp: lastTimestamp,
            senderId: last?.sender_id || '',
            type: lastType,
            isViewOnce: lastIsViewOnce,
            isRead: last?.is_read ?? false,
            deliveredAt: last?.delivered_at ? new Date(last.delivered_at) : null,
            reactionPreview: reactionPreviewByUser.get(otherUserId),
          },
          unreadCount: entry?.unread || 0,
          isMuted: false,
          isPinned: false,
          matchedAt: lastTimestamp,
        };
      }).filter((conversation) => !peerVisibilityPrefs[conversation.id]?.hidden);
      const serverPrefs = new Map<string, { muted: boolean; pinned: boolean }>();
      const { data: prefsData, error: prefsError } = await supabase
        .from('chat_prefs')
        .select('peer_id,muted,pinned')
        .eq('user_id', user.id)
        .in('peer_id', otherUserIds);
      if (prefsError) {
        console.log('[chat] chat prefs fetch error', prefsError);
      }
      (prefsData || []).forEach((row: { peer_id: string; muted: boolean; pinned: boolean }) => {
        if (!row?.peer_id) return;
        serverPrefs.set(row.peer_id, { muted: Boolean(row.muted), pinned: Boolean(row.pinned) });
      });

      const hydrated = await applyChatPrefs(nextConversations, serverPrefs);
      setConversations(hydrated);
      setLoadError(null);
      if (chatCacheKey) void writeCache(chatCacheKey, serializeConversations(hydrated));

      // New matches are accepted matches without any message history yet.
      void fetchNewMatches(new Set(otherUserIds));
    } finally {
      setIsLoading(false);
    }
  }, [applyChatPrefs, chatCacheKey, fetchNewMatches, user?.id]);

  const savePeerVisibilityPref = useCallback(
    async (peerUserId: string, next: { archived: boolean; hidden: boolean }) => {
      if (!user?.id) return { error: new Error('missing_user') };
      return supabase
        .from('peer_visibility_prefs')
        .upsert(
          {
            user_id: user.id,
            peer_user_id: peerUserId,
            archived: next.archived,
            hidden: next.hidden,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,peer_user_id' },
        );
    },
    [user?.id],
  );

  const setPeerPinState = useCallback(
    async (peerUserId: string, pinned: boolean, muted: boolean) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from('chat_prefs')
        .upsert(
          {
            user_id: user.id,
            peer_id: peerUserId,
            pinned,
            muted,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,peer_id' },
        );
      if (error) {
        console.log('[chat] chat prefs upsert error', error);
      }
    },
    [user?.id],
  );

  const clearConversationForMe = useCallback(
    async (peerUserId: string) => {
      if (!user?.id) return { ok: false };

      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('id')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${peerUserId}),and(sender_id.eq.${peerUserId},receiver_id.eq.${user.id})`)
        .limit(1000);

      if (messagesError) {
        console.log('[chat] clear conversation messages fetch error', messagesError);
        return { ok: false };
      }

      const messageIds = ((messagesData as { id: string }[] | null) ?? []).map((row) => row.id).filter(Boolean);
      if (messageIds.length > 0) {
        const { data: hiddenRows, error: hiddenError } = await supabase
          .from('message_hides')
          .select('message_id')
          .eq('user_id', user.id)
          .eq('peer_id', peerUserId);

        if (hiddenError) {
          console.log('[chat] clear conversation hidden message fetch error', hiddenError);
          return { ok: false };
        }

        const hiddenSet = new Set(((hiddenRows as { message_id: string }[] | null) ?? []).map((row) => row.message_id));
        const idsToHide = messageIds.filter((id) => !hiddenSet.has(id));
        if (idsToHide.length > 0) {
          const batchSize = 200;
          for (let i = 0; i < idsToHide.length; i += batchSize) {
            const rows = idsToHide.slice(i, i + batchSize).map((id) => ({
              message_id: id,
              user_id: user.id,
              peer_id: peerUserId,
            }));
            const { error } = await supabase.from('message_hides').insert(rows);
            if (error) {
              console.log('[chat] clear conversation hide insert error', error);
              return { ok: false };
            }
          }
        }
      }

      const visibilityResult = await savePeerVisibilityPref(peerUserId, { archived: false, hidden: true });
      if (visibilityResult.error) {
        console.log('[chat] peer visibility hide upsert error', visibilityResult.error);
        return { ok: false };
      }

      return { ok: true };
    },
    [savePeerVisibilityPref, user?.id],
  );

  const clearMessagesForMe = useCallback(
    async (peerUserId: string) => {
      if (!user?.id) return { ok: false };

      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('id')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${peerUserId}),and(sender_id.eq.${peerUserId},receiver_id.eq.${user.id})`)
        .limit(1000);

      if (messagesError) {
        console.log('[chat] clear messages fetch error', messagesError);
        return { ok: false };
      }

      const messageIds = ((messagesData as { id: string }[] | null) ?? []).map((row) => row.id).filter(Boolean);
      if (messageIds.length === 0) return { ok: true };

      const { data: hiddenRows, error: hiddenError } = await supabase
        .from('message_hides')
        .select('message_id')
        .eq('user_id', user.id)
        .eq('peer_id', peerUserId);

      if (hiddenError) {
        console.log('[chat] clear messages hidden fetch error', hiddenError);
        return { ok: false };
      }

      const hiddenSet = new Set(((hiddenRows as { message_id: string }[] | null) ?? []).map((row) => row.message_id));
      const idsToHide = messageIds.filter((id) => !hiddenSet.has(id));
      if (idsToHide.length === 0) return { ok: true };

      const batchSize = 200;
      for (let i = 0; i < idsToHide.length; i += batchSize) {
        const rows = idsToHide.slice(i, i + batchSize).map((id) => ({
          message_id: id,
          user_id: user.id,
          peer_id: peerUserId,
        }));
        const { error } = await supabase.from('message_hides').insert(rows);
        if (error) {
          console.log('[chat] clear messages hide insert error', error);
          return { ok: false };
        }
      }

      return { ok: true };
    },
    [user?.id],
  );

  const toggleMuteConversation = useCallback(
    async (conversation: ConversationType) => {
      const nextMuted = !conversation.isMuted;
      setConversations((prev) =>
        prev.map((conv) => (conv.id === conversation.id ? { ...conv, isMuted: nextMuted } : conv)),
      );

      try {
        const raw = await AsyncStorage.getItem(CHAT_PREFS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const current = parsed?.[conversation.id] ?? {};
        parsed[conversation.id] = {
          ...current,
          muted: nextMuted,
        };
        await AsyncStorage.setItem(CHAT_PREFS_STORAGE_KEY, JSON.stringify(parsed));
      } catch {}

      await setPeerPinState(conversation.id, conversation.isPinned, nextMuted);
      void haptics.tap();
    },
    [setPeerPinState],
  );

  const blockConversationUser = useCallback(
    async (conversation: ConversationType) => {
      if (!user?.id) return false;
      const { error } = await supabase.from('blocks').insert({
        blocker_id: user.id,
        blocked_id: conversation.id,
      });
      if (error) {
        console.log('[chat] block user from list error', error);
        Alert.alert('Block user', 'Unable to block this user right now.');
        return false;
      }
      setConversations((prev) =>
        prev.map((conv) => (conv.id === conversation.id ? { ...conv, blockStatus: 'blocked_by_me' } : conv)),
      );
      void haptics.warning();
      return true;
    },
    [user?.id],
  );

  const unblockConversationUser = useCallback(
    async (conversation: ConversationType) => {
      if (!user?.id) return false;
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', conversation.id);
      if (error) {
        console.log('[chat] unblock user from list error', error);
        Alert.alert('Unblock user', 'Unable to unblock this user right now.');
        return false;
      }
      setConversations((prev) =>
        prev.map((conv) => (conv.id === conversation.id ? { ...conv, blockStatus: null } : conv)),
      );
      void haptics.success();
      return true;
    },
    [user?.id],
  );

  const reportConversationUser = useCallback(
    async (conversation: ConversationType, reasonId: string) => {
      const reasonLabel = QUICK_REPORT_REASONS.find((reason) => reason.id === reasonId)?.label ?? reasonId;
      const { error } = await supabase.rpc('rpc_submit_report', {
        p_reported_id: conversation.id,
        p_reason: reasonLabel,
      });
      if (error) {
        console.log('[chat] report user from list error', error);
        Alert.alert('Report user', 'Unable to send this report right now.');
        return false;
      }
      void haptics.success();
      Alert.alert('Report sent', 'Thanks. Betweener will review this quietly.');
      return true;
    },
    [],
  );

  const openReportReasonSheet = useCallback(
    (conversation: ConversationType) => {
      Alert.alert(
        'Report user',
        'Choose a reason to continue.',
        [
          ...QUICK_REPORT_REASONS.map((reason) => ({
            text: reason.label,
            onPress: () => {
              void reportConversationUser(conversation, reason.id);
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    },
    [reportConversationUser],
  );

  const openConversationMoreActions = useCallback(
    (conversation: ConversationType) => {
      swipeableRefs.current[conversation.id]?.close();
      Alert.alert(
        conversation.matchedUser.name,
        'Choose what you want to do with this chat.',
        [
          {
            text: conversation.isMuted ? 'Unmute chat' : 'Mute chat',
            onPress: () => {
              void toggleMuteConversation(conversation);
            },
          },
          {
            text: 'Clear chat',
            onPress: () => {
              Alert.alert(
                'Clear chat?',
                'This removes the message history for you only. New messages can still arrive later.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      const previous = conversation;
                      setConversations((prev) => prev.filter((conv) => conv.id !== conversation.id));
                      void (async () => {
                        const result = await clearMessagesForMe(conversation.id);
                        if (!result.ok) {
                          setConversations((prev) => {
                            if (prev.some((conv) => conv.id === previous.id)) return prev;
                            return [...prev, previous].sort(
                              (a, b) => b.lastMessage.timestamp.getTime() - a.lastMessage.timestamp.getTime(),
                            );
                          });
                          Alert.alert('Clear chat', 'Unable to clear this chat right now.');
                          return;
                        }
                        void haptics.medium();
                      })();
                    },
                  },
                ],
              );
            },
          },
          {
            text: conversation.blockStatus === 'blocked_by_me' ? 'Unblock user' : 'Block user',
            style: conversation.blockStatus === 'blocked_by_me' ? 'default' : 'destructive',
            onPress: () => {
              if (conversation.blockStatus === 'blocked_by_me') {
                Alert.alert(
                  'Unblock user?',
                  'You will be able to message each other again.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Unblock',
                      onPress: () => {
                        void unblockConversationUser(conversation);
                      },
                    },
                  ],
                );
                return;
              }

              Alert.alert(
                'Block user?',
                'They will not be able to message you, and they will not be notified.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Block',
                    style: 'destructive',
                    onPress: () => {
                      void blockConversationUser(conversation);
                    },
                  },
                ],
              );
            },
          },
          {
            text: 'Report user',
            onPress: () => {
              openReportReasonSheet(conversation);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    },
    [blockConversationUser, clearMessagesForMe, openReportReasonSheet, toggleMuteConversation, unblockConversationUser],
  );

  const handleArchiveConversation = useCallback(
    async (conversation: ConversationType) => {
      swipeableRefs.current[conversation.id]?.close();
      const nextArchived = !conversation.isArchived;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversation.id
            ? { ...conv, isArchived: nextArchived, isPinned: nextArchived ? false : conv.isPinned }
            : conv,
        ),
      );

      if (nextArchived && conversation.isPinned) {
        void setPeerPinState(conversation.id, false, conversation.isMuted);
      }

      const { error } = await savePeerVisibilityPref(conversation.id, {
        archived: nextArchived,
        hidden: false,
      });
      if (error) {
        console.log('[chat] peer visibility archive upsert error', error);
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversation.id
              ? { ...conv, isArchived: conversation.isArchived, isPinned: conversation.isPinned }
              : conv,
          ),
        );
        Alert.alert('Archive chat', 'Unable to update this chat right now.');
        return;
      }

      void haptics.tap();
    },
    [savePeerVisibilityPref, setPeerPinState],
  );

  const handleRemoveConversation = useCallback(
    (conversation: ConversationType) => {
      swipeableRefs.current[conversation.id]?.close();
      const title = conversation.peerHasLeft ? 'Remove Left Betweener?' : 'Remove conversation?';
      const message = conversation.peerHasLeft
        ? 'This removes their old thread and related leftovers from your app.'
        : 'This removes this conversation from your app only. It does not delete anything for the other person.';

      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: conversation.peerHasLeft ? 'Remove' : 'Delete',
          style: 'destructive',
          onPress: () => {
            const previous = conversation;
            setConversations((prev) => prev.filter((conv) => conv.id !== conversation.id));
            void (async () => {
              const result = await clearConversationForMe(conversation.id);
              if (!result.ok) {
                setConversations((prev) => {
                  if (prev.some((conv) => conv.id === previous.id)) return prev;
                  return [...prev, previous].sort(
                    (a, b) => b.lastMessage.timestamp.getTime() - a.lastMessage.timestamp.getTime(),
                  );
                });
                Alert.alert('Remove conversation', 'Unable to remove this conversation right now.');
                return;
              }
              void haptics.medium();
            })();
          },
        },
      ]);
    },
    [clearConversationForMe],
  );

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

  useFocusEffect(
    useCallback(() => {
      void fetchConversations();
    }, [fetchConversations])
  );

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`messages:chatlist:${user.id}`);

    const handleInsert = (payload: { new: MessageRow }) => {
      const row = payload.new;
      if (!row?.sender_id || !row?.receiver_id) return;
      if (row.sender_id !== user.id && row.receiver_id !== user.id) return;
      const otherId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
      if (!otherId) return;
      const lastText = getRowPreviewText(row);
      const lastType = (row.message_type ?? 'text') as ConversationType['lastMessage']['type'];
      const nextLastMessage = {
        id: row.id,
        text: lastText,
        timestamp: new Date(row.created_at),
        senderId: row.sender_id,
        type: lastType,
        isViewOnce: Boolean(row.is_view_once),
        isRead: row.is_read,
        deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
        reactionPreview: undefined,
      };

      setConversations((prev) => {
        const index = prev.findIndex((conv) => conv.id === otherId);
        if (index === -1) {
          void fetchConversations();
          return prev;
        }
        const current = prev[index];
        const nextUnread =
          row.receiver_id === user.id && !row.is_read
            ? current.unreadCount + 1
            : current.unreadCount;
        const updated = {
          ...current,
          isArchived: row.receiver_id === user.id ? false : current.isArchived,
          lastMessage: nextLastMessage,
          unreadCount: nextUnread,
          matchedAt: nextLastMessage.timestamp,
        };
        const next = [...prev];
        next[index] = updated;
        if (row.receiver_id === user.id && current.isArchived) {
          void savePeerVisibilityPref(otherId, { archived: false, hidden: false });
        }
        return next;
      });
    };

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        handleInsert
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${user.id}`,
        },
        handleInsert
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          const otherId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
          if (!otherId) return;
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== otherId || conv.lastMessage.id !== row.id) return conv;
              return {
                ...conv,
                unreadCount: row.receiver_id === user.id && !row.is_read ? conv.unreadCount : 0,
                lastMessage: {
                  ...conv.lastMessage,
                  text: getRowPreviewText(row),
                  type: (row.message_type ?? conv.lastMessage.type) as ConversationType['lastMessage']['type'],
                  isViewOnce: Boolean(row.is_view_once),
                  isRead: row.is_read,
                  deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
                },
              };
            }),
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          const otherId = row.receiver_id;
          if (!otherId) return;
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== otherId || conv.lastMessage.id !== row.id) return conv;
              return {
                ...conv,
                lastMessage: {
                  ...conv.lastMessage,
                  text: getRowPreviewText(row),
                  type: (row.message_type ?? conv.lastMessage.type) as ConversationType['lastMessage']['type'],
                  isViewOnce: Boolean(row.is_view_once),
                  isRead: row.is_read,
                  deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
                },
              };
            }),
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, savePeerVisibilityPref, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`message_reactions:chatlist:${user.id}`);

  const handleReaction = async (payload: { new?: any; old?: any }) => {
      const row = payload.new || payload.old;
      if (!row?.message_id || !row?.emoji || !row?.user_id) return;
      const createdAt = row.created_at ? new Date(row.created_at) : new Date();
      const { data: messageRow, error } = await supabase
        .from('messages')
        .select('id,sender_id,receiver_id,message_type')
        .eq('id', row.message_id)
        .maybeSingle();
      if (error) {
        console.log('[chat] message reaction fetch error', error);
        return;
      }
      if (!messageRow?.sender_id || !messageRow?.receiver_id) return;
      const otherId = messageRow.sender_id === user.id ? messageRow.receiver_id : messageRow.sender_id;
      if (!otherId) return;
      const targetType = (messageRow.message_type ?? 'text') as ConversationType['lastMessage']['type'];
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== otherId) return conv;
          if (conv.lastMessage.id !== messageRow.id) return conv;
          const existing = conv.lastMessage.reactionPreview;
          if (existing && existing.createdAt >= createdAt) return conv;
          return {
            ...conv,
            lastMessage: {
              ...conv.lastMessage,
              reactionPreview: { emoji: row.emoji, userId: row.user_id, createdAt, targetType },
            },
          };
        }),
      );
    };

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, handleReaction)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions' }, handleReaction)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`chat_prefs:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_prefs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as { peer_id?: string; muted?: boolean; pinned?: boolean } | undefined;
          if (!row?.peer_id) return;
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === row.peer_id
                ? {
                    ...conv,
                    isMuted: row.muted ?? conv.isMuted,
                    isPinned: row.pinned ?? conv.isPinned,
                  }
                : conv
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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

  const getRowPreviewText = (row?: MessageRow | null) => {
    if (!row) return '';
    if (row.deleted_for_all) return 'Message deleted';
    const rowType = (row.message_type ?? 'text') as ConversationType['lastMessage']['type'];
    if (row.is_view_once && (rowType === 'image' || rowType === 'video')) {
      return rowType === 'video' ? 'View once video' : 'View once photo';
    }
    if (rowType === 'mood_sticker') {
      return parseStickerPreview(row.text) || row.text || 'Sticker';
    }
    const datePlanPreview = getDatePlanPreviewText(row.text);
    if (datePlanPreview) return datePlanPreview;
    return row.text || '';
  };

  const getLastMessagePreview = (lastMessage: ConversationType['lastMessage']) => {
    if (lastMessage.isViewOnce && (lastMessage.type === 'image' || lastMessage.type === 'video')) {
      return lastMessage.type === 'video' ? 'View once video' : 'View once photo';
    }
    switch (lastMessage.type) {
      case 'voice':
        return 'Voice message';
      case 'image':
        return 'Photo';
      case 'video':
        return 'Video';
      case 'document':
        return 'Document';
      case 'location':
        return 'Location';
      case 'mood_sticker':
        return parseStickerPreview(lastMessage.text) || lastMessage.text || 'Sticker';
      default:
        return getDatePlanPreviewText(lastMessage.text) || lastMessage.text;
    }
  };

  const getLastMessageReactionPreview = useCallback(
    (lastMessage: ConversationType['lastMessage'], matchedName: string, currentUserId: string) => {
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
    },
    [],
  );


  const filteredConversations = conversations
    .filter(conv => {
      if (searchQuery) {
        return conv.matchedUser.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      switch (activeTab) {
        case 'unread':
          return !conv.isArchived && conv.unreadCount > 0;
        case 'pinned':
          return !conv.isArchived && conv.isPinned;
        case 'archived':
          return conv.isArchived;
        default:
          return !conv.isArchived;
      }
    })
    .sort((a, b) => {
      // Sort pinned conversations first, then by last message time
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.lastMessage.timestamp.getTime() - a.lastMessage.timestamp.getTime();
    });
  const unreadConversationCount = conversations.filter((conv) => !conv.isArchived && conv.unreadCount > 0).length;
  const archivedConversationCount = conversations.filter((conv) => conv.isArchived).length;
  const momentUsersWithContent = useMemo(
    () => momentUsers.filter((entry) => entry.moments.length > 0),
    [momentUsers],
  );
  const activeMomentPeerUserIds = useMemo(
    () => new Set(momentUsersWithContent.filter((entry) => !entry.isOwn).map((entry) => String(entry.userId))),
    [momentUsersWithContent],
  );

  const openConversation = (conversation: ConversationType) => {
    const isOnline =
      presenceOnline[conversation.id] ?? conversation.matchedUser.isOnline;
    const lastSeen =
      presenceLastSeen[conversation.id] ?? conversation.matchedUser.lastSeen;
    // Navigate to the detailed chat screen
    router.push({
      pathname: '/chat/[id]',
      params: { 
        id: conversation.id,
        userName: conversation.matchedUser.name,
        userAvatar: conversation.matchedUser.avatar_url,
        isOnline: isOnline.toString(),
        lastSeen: lastSeen.toISOString(),
      }
    });
  };

  const openNewMatch = (match: NewMatch) => {
    setNewMatches((prev) => prev.filter((m) => m.userId !== match.userId));
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: match.userId,
        userName: match.name,
        userAvatar: match.avatar_url ?? '',
      },
    });
  };

  const togglePin = (conversationId: string) => {
    const current = conversations.find((conv) => conv.id === conversationId);
    const nextPinned = !Boolean(current?.isPinned);
    const nextMuted = Boolean(current?.isMuted);
    setConversations(prev => prev.map(conv => 
      conv.id === conversationId 
        ? { ...conv, isPinned: !conv.isPinned }
        : conv
    ));
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_PREFS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const current = parsed?.[conversationId] ?? {};
        parsed[conversationId] = {
          ...current,
          pinned: !current?.pinned,
        };
        await AsyncStorage.setItem(CHAT_PREFS_STORAGE_KEY, JSON.stringify(parsed));
      } catch {
        // Ignore persistence errors.
      }
      if (!user?.id) return;
      const { error } = await supabase
        .from('chat_prefs')
        .upsert(
          {
            user_id: user.id,
            peer_id: conversationId,
            pinned: nextPinned,
            muted: nextMuted,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,peer_id' },
        );
      if (error) {
        console.log('[chat] chat prefs pin upsert error', error);
      }
    })();
  };

  const markAsRead = async (conversationId: string) => {
    setConversations(prev => prev.map(conv => 
      conv.id === conversationId 
        ? { ...conv, unreadCount: 0 }
        : conv
    ));
    if (!user?.id) return;
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', user.id)
      .eq('sender_id', conversationId)
      .eq('is_read', false);
    if (error) {
      console.log('[chat] markAsRead error', error);
    }
  };

  const renderConversation = ({ item }: { item: ConversationType }) => {
    const isBlocked = Boolean(item.blockStatus);
    const isLeftBetweener = item.peerHasLeft && !isBlocked;
    const isUnread = item.unreadCount > 0;
    const hasActiveMoment = activeMomentPeerUserIds.has(String(item.id));
    const isMyLastMessage = item.lastMessage.senderId === (user?.id || '');
    const isOnline = !isBlocked && (presenceOnline[item.id] ?? item.matchedUser.isOnline);
    const receiptIcon = isMyLastMessage ? getConversationReceiptIconState(item.lastMessage, theme, isDark) : null;
    const isTyping = !isBlocked && Boolean(typingStatus[item.matchedUser.id]);
    const reactionPreview = getLastMessageReactionPreview(
      item.lastMessage,
      item.matchedUser.name,
      user?.id || '',
    );
    const avatarNode = isBlocked ? (
      <Image source={BLOCKED_AVATAR_SOURCE} style={styles.conversationAvatar} />
    ) : item.matchedUser.avatar_url ? (
      <Image source={{ uri: item.matchedUser.avatar_url }} style={styles.conversationAvatar} />
    ) : (
      <LinearGradient
        colors={
          isLeftBetweener
            ? [isDark ? '#6E5B4B' : '#A18873', isDark ? '#8B7662' : '#C7B8A5']
            : [
                getProfilePlaceholderPalette(item.matchedUser.id || item.matchedUser.name).start,
                getProfilePlaceholderPalette(item.matchedUser.id || item.matchedUser.name).end,
              ]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.conversationAvatar,
          styles.avatarFallback,
          isLeftBetweener && styles.avatarFallbackLeft,
        ]}
      >
        <Text style={styles.avatarFallbackText}>
          {getProfileInitials(item.matchedUser.name)}
        </Text>
      </LinearGradient>
    );
    const avatarContent = !isBlocked && hasActiveMoment && !isLeftBetweener ? (
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
        ref={(instance) => {
          swipeableRefs.current[item.id] = instance;
        }}
        friction={2}
        leftThreshold={72}
        rightThreshold={72}
        overshootLeft={false}
        overshootRight={false}
        onSwipeableOpen={(direction) => {
          if (swipeActionBusyRef.current[item.id]) return;
          swipeActionBusyRef.current[item.id] = true;
          if (direction === 'left') {
            void handleArchiveConversation(item).finally(() => {
              swipeActionBusyRef.current[item.id] = false;
            });
            return;
          }
          if (item.peerHasLeft) {
            handleRemoveConversation(item);
          } else {
            openConversationMoreActions(item);
          }
          setTimeout(() => {
            swipeActionBusyRef.current[item.id] = false;
          }, 500);
        }}
        renderLeftActions={() => (
          <View style={[styles.swipeActionRail, styles.swipeActionRailLeft]}>
            <Pressable
              style={[styles.swipeAction, styles.archiveAction]}
              onPress={() => void handleArchiveConversation(item)}
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
              onPress={() => (item.peerHasLeft ? handleRemoveConversation(item) : openConversationMoreActions(item))}
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
            void markAsRead(item.id);
            openConversation(item);
          }}
          onLongPress={() => {
            if (!item.isArchived) togglePin(item.id);
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
                {isTyping ? (
                  <View style={styles.lastMessageRow}>
                    <Text style={[styles.lastMessage, styles.typingText]} numberOfLines={1}>
                      Typing...
                    </Text>
                  </View>
                ) : (
                  <View style={styles.lastMessageRow}>
                    {isMyLastMessage ? (
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
                      reactionPreview && styles.lastMessageReaction,
                      isUnread && styles.unreadMessage,
                    ]}
                      numberOfLines={1}
                    >
                      {reactionPreview ?? getLastMessagePreview(item.lastMessage)}
                    </Text>
                  </View>
                )}

                <View style={styles.conversationMeta}>
                  <Text style={styles.conversationTime}>
                    {formatLastMessageTime(item.lastMessage.timestamp)}
                  </Text>
                  {item.unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadCount}>
                        {item.unreadCount > 9 ? '9+' : item.unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      </Swipeable>
    );
  };

  const renderEmptyState = () => (
    <ScrollView
      style={styles.emptyStateScroll}
      contentContainerStyle={styles.emptyStateContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <View style={styles.emptyState}>
        <View style={styles.emptyHero}>
          <View style={styles.emptyHeroGlowLeft} />
          <View style={styles.emptyHeroGlowRight} />
          <LinearGradient
            colors={[
              withAlpha(theme.background, isDark ? 0.98 : 0.94),
              withAlpha(theme.backgroundSubtle, isDark ? 0.9 : 0.98),
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.emptyHeroPanel}
          >
            <LinearGradient
              colors={[
                withAlpha(theme.tint, isDark ? 0.24 : 0.18),
                withAlpha(theme.accent, isDark ? 0.24 : 0.16),
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyHeroBadge}
            >
              <MaterialCommunityIcons name="message-text-outline" size={30} color={theme.text} />
            </LinearGradient>
            <View style={[styles.emptyHeroOrb, styles.emptyHeroOrbLeft]}>
              <MaterialCommunityIcons name="heart-outline" size={16} color={theme.tint} />
            </View>
            <View style={[styles.emptyHeroOrb, styles.emptyHeroOrbRight]}>
              <MaterialCommunityIcons name="coffee-outline" size={16} color={theme.accent} />
            </View>
            <Text style={styles.emptyHeroKicker}>Private lounge</Text>
            <Text style={styles.emptyHeroLine}>A thoughtful hello starts here.</Text>
          </LinearGradient>
        </View>
        <Text style={styles.emptyStateTitle}>
          {activeTab === 'archived' ? 'No archived chats yet' : 'No conversations yet, but the room is ready'}
        </Text>
        <Text style={styles.emptyStateText}>
          {activeTab === 'archived'
            ? 'Archived chats will rest here until you bring them back into your main lounge.'
            : 'Match with someone who feels aligned, then open with something specific enough to be memorable.'}
        </Text>
        <View style={styles.emptyHighlights}>
          <View style={styles.emptyHighlightCard}>
            <MaterialCommunityIcons name="message-text-outline" size={18} color={theme.tint} />
            <Text style={styles.emptyHighlightTitle}>Better first messages</Text>
            <Text style={styles.emptyHighlightText}>Reference their vibe, not just their looks.</Text>
          </View>
          <View style={styles.emptyHighlightCard}>
            <MaterialCommunityIcons name="star-four-points" size={18} color={theme.accent} />
            <Text style={styles.emptyHighlightTitle}>Premium energy</Text>
            <Text style={styles.emptyHighlightText}>Reply early when a strong match lands.</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.exploreButton}
          onPress={() => router.push('/(tabs)/vibes')}
        >
          <MaterialCommunityIcons name="compass" size={20} color={Colors.light.background} />
          <Text style={styles.exploreButtonText}>Explore Vibes</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderNewMatches = () => {
    if (newMatches.length === 0 && !newMatchesLoading) return null;

    return (
      <View style={styles.newMatchesSection}>
        <View style={styles.newMatchesTitleRow}>
          <Text style={styles.newMatchesTitle}>New matches</Text>
          <Text style={styles.newMatchesSubtitle}>
            {newMatchesLoading ? 'Loading...' : `${newMatches.length} waiting for the first hello`}
          </Text>
        </View>

        {newMatches.length === 0 ? null : (
          <FlatList
            data={newMatches}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.newMatchesList}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openNewMatch(item)}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }, styles.newMatchCard]}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.newMatchAvatar} />
                ) : (
                  <LinearGradient
                    colors={[
                      getProfilePlaceholderPalette(item.profileId || item.name).start,
                      getProfilePlaceholderPalette(item.profileId || item.name).end,
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.newMatchAvatar, styles.avatarFallback]}
                  >
                    <Text style={styles.avatarFallbackText}>{getProfileInitials(item.name)}</Text>
                  </LinearGradient>
                )}
                <Text numberOfLines={1} style={styles.newMatchName}>
                  {item.name}
                </Text>
                {item.location ? (
                  <Text numberOfLines={1} style={styles.newMatchMeta}>
                    {item.location}
                  </Text>
                ) : null}
              </Pressable>
            )}
          />
        )}
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => setShowSearch(!showSearch)}
          >
            <MaterialCommunityIcons 
              name={showSearch ? "close" : "magnify"} 
              size={24} 
              color={theme.tint} 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <Animated.View
        style={[
          styles.searchContainer,
          {
            height: searchAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 50],
            }),
            opacity: searchAnimation,
          },
        ]}
      >
        <View style={styles.searchInputContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus={showSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialCommunityIcons name="close-circle" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {(['all', 'unread', 'pinned', 'archived'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.filterTab,
              activeTab === tab && styles.activeFilterTab,
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.filterTabText,
                activeTab === tab && styles.activeFilterTabText,
              ]}
            >
              {tab === 'all' ? 'All' : tab === 'unread' ? 'Unread' : tab === 'pinned' ? 'Pinned' : 'Archived'}
              {tab === 'unread' && unreadConversationCount > 0 && (
                <Text style={styles.tabBadge}>
                  {' '}({unreadConversationCount})
                </Text>
              )}
              {tab === 'archived' && archivedConversationCount > 0 && (
                <Text style={styles.tabBadge}>
                  {' '}({archivedConversationCount})
                </Text>
              )}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const showBlockingError = Boolean(loadError && conversations.length === 0);
  const showEmptyState = filteredConversations.length === 0 && !showBlockingError && newMatches.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderNewMatches()}

      {showBlockingError ? (
        <Notice
          title="Couldn't load chats"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            void fetchConversations();
            void fetchNewMatches();
          }}
          icon="cloud-alert"
        />
      ) : null}

      {isLoading && conversations.length === 0 && newMatches.length === 0 ? (
        <ChatListSkeleton />
      ) : showEmptyState ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={filteredConversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.conversationsList}
          showsVerticalScrollIndicator={false}
          refreshing={isLoading}
          onRefresh={() => {
            void fetchConversations();
            void fetchNewMatches();
          }}
        />
      )}

      {!showEmptyState ? (
        <TouchableOpacity 
          style={styles.fab}
          onPress={() => router.push('/(tabs)/vibes')}
        >
          <MaterialCommunityIcons name="plus" size={24} color={Colors.light.background} />
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },

    // Header
    header: {
      backgroundColor: theme.background,
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 3,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
    },
    headerTitle: {
      fontSize: 28,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: theme.text,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 12,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.backgroundSubtle,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.12),
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
      gap: 8,
    },
    filterTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
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
      paddingVertical: 8,
      paddingBottom: 92,
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
      backgroundColor: isDark
        ? withAlpha(theme.backgroundSubtle, 0.56)
        : withAlpha('#fffaf5', 0.94),
      marginHorizontal: 16,
      marginVertical: 4,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.07),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.16 : 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    conversationItemPressed: {
      transform: [{ scale: 0.992 }],
      shadowOpacity: 0.04,
    },
    leftConversation: {
      backgroundColor: isDark ? 'rgba(232, 219, 203, 0.045)' : 'rgba(247, 240, 232, 0.96)',
      borderColor: isDark ? 'rgba(196, 171, 145, 0.18)' : 'rgba(188, 164, 140, 0.18)',
    },
    pinnedConversation: {
      backgroundColor: withAlpha(theme.accent, isDark ? 0.13 : 0.08),
      borderColor: withAlpha(theme.accent, isDark ? 0.34 : 0.2),
      shadowColor: theme.accent,
    },
    archivedConversation: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.035),
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
    },
    unreadConversation: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.11 : 0.065),
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.18),
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
      width: 46,
      height: 46,
      borderRadius: 23,
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
      marginBottom: 4,
    },
    conversationHeaderIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginLeft: 8,
    },
    conversationName: {
      fontSize: 15.5,
      fontFamily: 'Archivo_600SemiBold',
      color: theme.text,
      flex: 1,
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
      gap: 5,
      minWidth: 44,
      marginLeft: 10,
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
    lastMessageReaction: {
      fontStyle: 'italic',
      fontFamily: 'Manrope_500Medium',
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
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
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
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.tint,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
  });
