import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

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
  lastMessage: {
    text: string;
    timestamp: Date;
    senderId: string;
    type: 'text' | 'voice' | 'image' | 'mood_sticker';
  };
  unreadCount: number;
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
};

export default function ChatScreen() {
  const { user } = useAuth();
  const fontsLoaded = useAppFonts();
  
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'pinned'>('all');
  const [presenceOnline, setPresenceOnline] = useState<Record<string, boolean>>({});
  const [presenceLastSeen, setPresenceLastSeen] = useState<Record<string, Date>>({});
  
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

  const fetchConversations = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { data: messages, error } = await supabase
        .from('messages')
        .select('id,text,created_at,sender_id,receiver_id,is_read')
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

      const profileByUser = new Map(
        (profilesData || []).map((p: any) => [p.user_id, p])
      );

      const nextConversations: ConversationType[] = otherUserIds.map((otherUserId) => {
        const entry = convoMap.get(otherUserId);
        const profileRow = profileByUser.get(otherUserId);
        const last = entry?.last;
        const lastTimestamp = last?.created_at ? new Date(last.created_at) : new Date();
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
          lastMessage: {
            text: last?.text || '',
            timestamp: lastTimestamp,
            senderId: last?.sender_id || '',
            type: 'text',
          },
          unreadCount: entry?.unread || 0,
          isPinned: false,
          matchedAt: lastTimestamp,
        };
      });

      setConversations(nextConversations);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void fetchConversations();
    }, [fetchConversations])
  );

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  const formatLastMessageTime = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInHours * 60);
      return diffInMinutes < 1 ? 'now' : `${diffInMinutes}m`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return diffInDays === 1 ? '1d' : `${diffInDays}d`;
    }
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

  const getLastMessagePreview = (lastMessage: ConversationType['lastMessage']) => {
    switch (lastMessage.type) {
      case 'voice':
        return 'Voice message';
      case 'image':
        return 'Photo';
      case 'mood_sticker':
        return lastMessage.text || 'Sticker';
      default:
        return lastMessage.text;
    }
  };

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
    setConversations(prev => prev.map(conv => 
      conv.id === conversationId 
        ? { ...conv, isPinned: !conv.isPinned }
        : conv
    ));
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
    const isOnline = presenceOnline[item.matchedUser.id] ?? item.matchedUser.isOnline;
    const lastSeen = presenceLastSeen[item.matchedUser.id] ?? item.matchedUser.lastSeen;
    const isMyLastMessage = item.lastMessage.senderId === (user?.id || '');
    
    return (
      <TouchableOpacity
        style={[
          styles.conversationItem,
          item.isPinned && styles.pinnedConversation,
          item.unreadCount > 0 && styles.unreadConversation,
        ]}
        onPress={() => {
          void markAsRead(item.id);
          openConversation(item);
        }}
        onLongPress={() => togglePin(item.id)}
      >
        <View style={styles.conversationLeft}>
          <View style={styles.avatarContainer}>
            {item.matchedUser.avatar_url ? (
              <Image source={{ uri: item.matchedUser.avatar_url }} style={styles.conversationAvatar} />
            ) : (
              <View style={[styles.conversationAvatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>
                  {(item.matchedUser.name || '?')[0]?.toUpperCase()}
                </Text>
              </View>
            )}
            {isOnline && (
              <View style={styles.onlineIndicator} />
            )}
            {item.isPinned && (
              <View style={styles.pinIndicator}>
                <MaterialCommunityIcons name="pin" size={10} color="#fff" />
              </View>
            )}
          </View>
          
          <View style={styles.conversationContent}>
            <View style={styles.conversationHeader}>
              <Text style={[
                styles.conversationName,
                item.unreadCount > 0 && styles.unreadName
              ]}>
                {item.matchedUser.name}
              </Text>
              <Text style={styles.conversationTime}>
                {formatLastMessageTime(item.lastMessage.timestamp)}
              </Text>
            </View>

            {!isOnline && lastSeen && item.unreadCount === 0 && !item.isPinned && (
              <Text style={styles.lastSeenText}>
                Last seen {formatLastSeen(lastSeen)}
              </Text>
            )}
            
            <View style={styles.conversationPreview}>
              <Text 
                style={[
                  styles.lastMessage,
                  item.unreadCount > 0 && styles.unreadMessage
                ]} 
                numberOfLines={1}
              >
                {isMyLastMessage && item.lastMessage.type === 'text' && 'You: '}
                {getLastMessagePreview(item.lastMessage)}
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
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="chat-outline" size={64} color="#9ca3af" />
      <Text style={styles.emptyStateTitle}>No conversations yet</Text>
      <Text style={styles.emptyStateText}>
        Start matching with people to begin chatting!
      </Text>
      <TouchableOpacity 
        style={styles.exploreButton}
        onPress={() => router.push('/(tabs)/explore')}
      >
        <MaterialCommunityIcons name="compass" size={20} color="#fff" />
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
              color={Colors.light.tint} 
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
          <MaterialCommunityIcons name="magnify" size={20} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus={showSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#9ca3af" />
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
        <MaterialCommunityIcons name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  
  // Header
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  // Search
  searchContainer: {
    overflow: 'hidden',
    marginBottom: 16,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#111827',
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
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  activeFilterTab: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  filterTabText: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: '#6b7280',
  },
  activeFilterTabText: {
    color: '#fff',
    fontFamily: 'Manrope_600SemiBold',
  },
  tabBadge: {
    fontSize: 12,
    opacity: 0.8,
  },

  // Conversations List
  conversationsList: {
    paddingVertical: 8,
  },
  conversationItem: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  pinnedConversation: {
    backgroundColor: '#fef3c7',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  unreadConversation: {
    backgroundColor: '#f0f9ff',
  },
  conversationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  conversationAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarFallback: {
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 18,
    fontFamily: 'Archivo_700Bold',
    color: '#475569',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 16,
    fontFamily: 'Archivo_600SemiBold',
    color: '#111827',
    flex: 1,
  },
  unreadName: {
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
  },
  conversationTime: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#9ca3af',
  },
  lastSeenText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#9ca3af',
    marginTop: 2,
  },
  conversationPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    flex: 1,
    marginRight: 8,
  },
  unreadMessage: {
    fontFamily: 'Manrope_500Medium',
    color: '#374151',
  },
  unreadBadge: {
    backgroundColor: Colors.light.tint,
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
    color: '#fff',
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
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  exploreButtonText: {
    fontSize: 16,
    fontFamily: 'Archivo_600SemiBold',
    color: '#fff',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.light.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});

