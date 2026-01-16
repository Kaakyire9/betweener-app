import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Chat conversation type
type ConversationType = {
  id: string;
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
    text: string;
    timestamp: Date;
    senderId: string;
    type: 'text' | 'voice' | 'image' | 'mood_sticker' | 'video' | 'document' | 'location';
    isViewOnce?: boolean;
    isRead: boolean;
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
  deleted_for_all?: boolean | null;
  message_type?: ConversationType['lastMessage']['type'] | null;
  is_view_once?: boolean | null;
};

const CHAT_PREFS_STORAGE_KEY = 'chat_header_prefs_v1';
const BLOCKED_AVATAR_SOURCE = require('../../assets/images/circle-logo.png');
const STICKER_TEXT_PREFIX = 'sticker::';

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

export default function ChatScreen() {
  const { user } = useAuth();
  const fontsLoaded = useAppFonts();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'pinned'>('all');
  const [presenceOnline, setPresenceOnline] = useState<Record<string, boolean>>({});
  const [presenceLastSeen, setPresenceLastSeen] = useState<Record<string, Date>>({});
  const [typingStatus, setTypingStatus] = useState<Record<string, boolean>>({});
  
  const searchAnimation = useRef(new Animated.Value(0)).current;

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

  const fetchConversations = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { data: messages, error } = await supabase
        .from('messages')
        .select('id,text,created_at,sender_id,receiver_id,is_read,deleted_for_all,message_type,is_view_once')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) {
        console.log('[chat] messages fetch error', error);
        setConversations([]);
        return;
      }

      const rows = (messages || []) as MessageRow[];
      const convoMap = new Map<string, { last: MessageRow; unread: number }>();

      rows.forEach((msg) => {
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
      if (otherUserIds.length === 0) {
        setConversations([]);
        return;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id,full_name,avatar_url,age,online,updated_at')
        .in('user_id', otherUserIds);

      if (profilesError) {
        console.log('[chat] profiles fetch error', profilesError);
        setConversations([]);
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

      const nextConversations: ConversationType[] = otherUserIds.map((otherUserId) => {
        const entry = convoMap.get(otherUserId);
        const profileRow = profileByUser.get(otherUserId);
        const last = entry?.last;
        const lastTimestamp = last?.created_at ? new Date(last.created_at) : new Date();
        const lastText = getRowPreviewText(last);
        const lastType = (last?.message_type ?? 'text') as ConversationType['lastMessage']['type'];
        const lastIsViewOnce = Boolean(last?.is_view_once);
        const blockStatus = blockStatusByUser.get(otherUserId) ?? null;
        return {
          id: otherUserId,
          matchedUser: {
            id: otherUserId,
            name: profileRow?.full_name || 'Unknown',
            avatar_url: profileRow?.avatar_url || '',
            age: profileRow?.age || 0,
            isOnline: !!profileRow?.online,
            lastSeen: profileRow?.updated_at ? new Date(profileRow.updated_at) : new Date(),
          },
          blockStatus,
          lastMessage: {
            text: lastText,
            timestamp: lastTimestamp,
            senderId: last?.sender_id || '',
            type: lastType,
            isViewOnce: lastIsViewOnce,
            isRead: last?.is_read ?? false,
          },
          unreadCount: entry?.unread || 0,
          isMuted: false,
          isPinned: false,
          matchedAt: lastTimestamp,
        };
      });
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
    } finally {
      setIsLoading(false);
    }
  }, [applyChatPrefs, user?.id]);

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
        text: lastText,
        timestamp: new Date(row.created_at),
        senderId: row.sender_id,
        type: lastType,
        isViewOnce: Boolean(row.is_view_once),
        isRead: row.is_read,
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
          lastMessage: nextLastMessage,
          unreadCount: nextUnread,
          matchedAt: nextLastMessage.timestamp,
        };
        const next = [...prev];
        next[index] = updated;
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, user?.id]);

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

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInHours * 60);
      return diffInMinutes < 1 ? 'just now' : `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return diffInDays === 1 ? '1d ago' : `${diffInDays}d ago`;
    }
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
        return lastMessage.text;
    }
  };

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  const filteredConversations = conversations
    .filter(conv => {
      if (searchQuery) {
        return conv.matchedUser.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      switch (activeTab) {
        case 'unread':
          return conv.unreadCount > 0;
        case 'pinned':
          return conv.isPinned;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      // Sort pinned conversations first, then by last message time
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.lastMessage.timestamp.getTime() - a.lastMessage.timestamp.getTime();
    });

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
    const isUnread = item.unreadCount > 0;
    const isMyLastMessage = item.lastMessage.senderId === (user?.id || '');
    const isTyping = !isBlocked && Boolean(typingStatus[item.matchedUser.id]);
    const avatarNode = isBlocked ? (
      <Image source={BLOCKED_AVATAR_SOURCE} style={styles.conversationAvatar} />
    ) : item.matchedUser.avatar_url ? (
      <Image source={{ uri: item.matchedUser.avatar_url }} style={styles.conversationAvatar} />
    ) : (
      <View style={[styles.conversationAvatar, styles.avatarFallback]}>
        <Text style={styles.avatarFallbackText}>
          {(item.matchedUser.name || '?')[0]?.toUpperCase()}
        </Text>
      </View>
    );
    const avatarContent = !isBlocked && isUnread ? (
      <LinearGradient
        colors={[theme.tint, theme.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.avatarRingUnread}
      >
        <View style={styles.avatarRingInner}>{avatarNode}</View>
      </LinearGradient>
    ) : (
      <View style={styles.avatarRing}>{avatarNode}</View>
    );
    
    return (
      <Pressable
        style={({ pressed }) => [
          styles.conversationItem,
          item.isPinned && styles.pinnedConversation,
          isUnread && styles.unreadConversation,
          pressed && styles.conversationItemPressed,
        ]}
        onPress={() => {
          void markAsRead(item.id);
          openConversation(item);
        }}
        onLongPress={() => togglePin(item.id)}
      >
        <View style={styles.conversationLeft}>
          <View style={styles.avatarContainer}>
              {avatarContent}
            {item.isPinned && (
              <View style={styles.pinIndicator}>
                <MaterialCommunityIcons name="pin" size={10} color={Colors.light.background} />
              </View>
            )}
          </View>
          
          <View style={styles.conversationContent}>
            <View style={styles.conversationHeader}>
              <Text style={[
                styles.conversationName,
                isUnread && styles.unreadName
              ]}>
                {item.matchedUser.name}
              </Text>
              {item.isMuted && (
                <MaterialCommunityIcons
                  name="volume-off"
                  size={14}
                  color={theme.textMuted}
                  style={styles.mutedIcon}
                />
              )}
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
                  {isMyLastMessage && (
                    <MaterialCommunityIcons
                      name={item.lastMessage.isRead ? 'check-all' : 'check'}
                      size={16}
                      color={item.lastMessage.isRead ? theme.accent : theme.textMuted}
                      style={styles.readReceiptIcon}
                    />
                  )}
                  <Text
                    style={[
                      styles.lastMessage,
                      isUnread && styles.unreadMessage,
                    ]}
                    numberOfLines={1}
                  >
                    {getLastMessagePreview(item.lastMessage)}
                  </Text>
                </View>
              )}

              <View style={styles.conversationMeta}>
                <Text style={styles.conversationTime}>
                  {formatLastMessageTime(item.lastMessage.timestamp)}
                </Text>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadCount}>
                      {item.unreadCount > 9 ? '9+' : item.unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Image
        source={require('../../assets/images/no-chat-illus.png')}
        style={styles.emptyIllustration}
        resizeMode="contain"
      />
      <Text style={styles.emptyStateTitle}>No conversations yet</Text>
      <Text style={styles.emptyStateText}>
        Start matching with people to begin chatting!
      </Text>
      <TouchableOpacity 
        style={styles.exploreButton}
        onPress={() => router.push('/(tabs)/explore')}
      >
        <MaterialCommunityIcons name="compass" size={20} color={Colors.light.background} />
        <Text style={styles.exploreButtonText}>Explore Matches</Text>
      </TouchableOpacity>
    </View>
  );

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
        {(['all', 'unread', 'pinned'] as const).map((tab) => (
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
              {tab === 'all' ? 'All' : tab === 'unread' ? 'Unread' : 'Pinned'}
              {tab === 'unread' && conversations.filter(c => c.unreadCount > 0).length > 0 && (
                <Text style={styles.tabBadge}>
                  {' '}({conversations.filter(c => c.unreadCount > 0).length})
                </Text>
              )}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      
      {filteredConversations.length === 0 ? (
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
          }}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => router.push('/(tabs)/explore')}
      >
        <MaterialCommunityIcons name="plus" size={24} color={Colors.light.background} />
      </TouchableOpacity>
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
      paddingVertical: 10,
    },
    conversationItem: {
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.7 : 0.9),
      marginHorizontal: 16,
      marginVertical: 6,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.2 : 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
    conversationItemPressed: {
      transform: [{ scale: 0.98 }],
      shadowOpacity: 0.05,
    },
    pinnedConversation: {
      backgroundColor: withAlpha(theme.accent, isDark ? 0.16 : 0.1),
      borderColor: withAlpha(theme.accent, isDark ? 0.5 : 0.35),
      shadowColor: theme.accent,
    },
    unreadConversation: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
      borderColor: withAlpha(theme.tint, isDark ? 0.45 : 0.3),
    },
    conversationLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarContainer: {
      position: 'relative',
      marginRight: 12,
    },
    avatarRing: {
      padding: 2,
      borderRadius: 32,
      backgroundColor: withAlpha(theme.background, isDark ? 0.6 : 0.8),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
    },
    avatarRingUnread: {
      padding: 2,
      borderRadius: 32,
    },
    avatarRingInner: {
      borderRadius: 28,
      backgroundColor: theme.background,
      padding: 2,
      overflow: 'hidden',
    },
    conversationAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    avatarFallback: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarFallbackText: {
      fontSize: 18,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    onlineIndicator: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: theme.secondary,
      borderWidth: 2,
      borderColor: theme.background,
    },
    pinIndicator: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: theme.accent,
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
      marginBottom: 2,
    },
    conversationName: {
      fontSize: 16,
      fontFamily: 'Archivo_600SemiBold',
      color: theme.text,
      flex: 1,
    },
    mutedIcon: {
      marginLeft: 6,
    },
    unreadName: {
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
    },
    conversationTime: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
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
      alignItems: 'flex-start',
    },
    conversationMeta: {
      alignItems: 'flex-end',
      gap: 6,
      minWidth: 40,
    },
    lastMessageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
    },
    lastMessage: {
      fontSize: 14,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      flex: 1,
      minWidth: 0,
      marginRight: 8,
    },
    typingText: {
      fontFamily: 'Manrope_500Medium',
      color: theme.accent,
    },
    readReceiptIcon: {
      marginRight: 6,
    },
    unreadMessage: {
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
    },
    unreadBadge: {
      backgroundColor: theme.tint,
      borderRadius: 12,
      minWidth: 24,
      height: 24,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    unreadCount: {
      fontSize: 12,
      fontFamily: 'Archivo_700Bold',
      color: Colors.light.background,
    },

    // Empty State
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    emptyStateTitle: {
      fontSize: 20,
      fontFamily: 'Archivo_700Bold',
      color: theme.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 16,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 24,
    },
    emptyIllustration: {
      width: 260,
      height: 200,
      maxWidth: '72%',
      maxHeight: 260,
      alignSelf: 'center',
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

