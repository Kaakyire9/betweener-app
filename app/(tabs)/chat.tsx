import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";

const { width: screenWidth } = Dimensions.get('window');

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

// Mock conversations data
const MOCK_CONVERSATIONS: ConversationType[] = [
  {
    id: '1',
    matchedUser: {
      id: '2',
      name: 'Akosua',
      avatar_url: 'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=100&h=100&fit=crop&crop=face',
      age: 26,
      isOnline: true,
      lastSeen: new Date(),
    },
    lastMessage: {
      text: 'Here\'s a photo from my morning hike! 🏔️',
      timestamp: new Date(Date.now() - 900000), // 15 minutes ago
      senderId: '1',
      type: 'image',
    },
    unreadCount: 2,
    isPinned: true,
    matchedAt: new Date(Date.now() - 86400000 * 3), // 3 days ago
  },
  {
    id: '2',
    matchedUser: {
      id: '3',
      name: 'Kwame',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
      age: 28,
      isOnline: false,
      lastSeen: new Date(Date.now() - 3600000), // 1 hour ago
    },
    lastMessage: {
      text: 'That sounds like a great plan! 😊',
      timestamp: new Date(Date.now() - 7200000), // 2 hours ago
      senderId: '3',
      type: 'text',
    },
    unreadCount: 0,
    isPinned: false,
    matchedAt: new Date(Date.now() - 86400000 * 5), // 5 days ago
  },
  {
    id: '3',
    matchedUser: {
      id: '4',
      name: 'Ama',
      avatar_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face',
      age: 24,
      isOnline: true,
      lastSeen: new Date(),
    },
    lastMessage: {
      text: '🎵 Voice message',
      timestamp: new Date(Date.now() - 14400000), // 4 hours ago
      senderId: '4',
      type: 'voice',
    },
    unreadCount: 1,
    isPinned: false,
    matchedAt: new Date(Date.now() - 86400000 * 2), // 2 days ago
  },
  {
    id: '4',
    matchedUser: {
      id: '5',
      name: 'Kojo',
      avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
      age: 30,
      isOnline: false,
      lastSeen: new Date(Date.now() - 21600000), // 6 hours ago
    },
    lastMessage: {
      text: 'Looking forward to meeting you!',
      timestamp: new Date(Date.now() - 86400000), // 1 day ago
      senderId: '1',
      type: 'text',
    },
    unreadCount: 0,
    isPinned: false,
    matchedAt: new Date(Date.now() - 86400000 * 7), // 1 week ago
  },
  {
    id: '5',
    matchedUser: {
      id: '6',
      name: 'Adwoa',
      avatar_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=100&h=100&fit=crop&crop=face',
      age: 27,
      isOnline: false,
      lastSeen: new Date(Date.now() - 43200000), // 12 hours ago
    },
    lastMessage: {
      text: '😊 Happy',
      timestamp: new Date(Date.now() - 172800000), // 2 days ago
      senderId: '6',
      type: 'mood_sticker',
    },
    unreadCount: 0,
    isPinned: false,
    matchedAt: new Date(Date.now() - 86400000 * 4), // 4 days ago
  },
  {
    id: '6',
    matchedUser: {
      id: '7',
      name: 'Yaw',
      avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
      age: 25,
      isOnline: true,
      lastSeen: new Date(),
    },
    lastMessage: {
      text: 'Just matched! Hey there 👋',
      timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
      senderId: '7',
      type: 'text',
    },
    unreadCount: 1,
    isPinned: false,
    matchedAt: new Date(Date.now() - 1800000), // 30 minutes ago
  },
];

export default function ChatScreen() {
  const { profile } = useAuth();
  const fontsLoaded = useAppFonts();
  
  const [conversations, setConversations] = useState<ConversationType[]>(MOCK_CONVERSATIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'pinned'>('all');
  
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

  const getLastMessagePreview = (lastMessage: ConversationType['lastMessage']) => {
    switch (lastMessage.type) {
      case 'voice':
        return '🎵 Voice message';
      case 'image':
        return '📷 Photo';
      case 'mood_sticker':
        return `😊 ${lastMessage.text || 'Sticker'}`;
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
    // Navigate to the detailed chat screen
    router.push({
      pathname: '/chat/[id]',
      params: { 
        id: conversation.id,
        userName: conversation.matchedUser.name,
        userAvatar: conversation.matchedUser.avatar_url,
        isOnline: conversation.matchedUser.isOnline.toString(),
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

  const markAsRead = (conversationId: string) => {
    setConversations(prev => prev.map(conv => 
      conv.id === conversationId 
        ? { ...conv, unreadCount: 0 }
        : conv
    ));
  };

  const renderConversation = ({ item }: { item: ConversationType }) => {
    const isMyLastMessage = item.lastMessage.senderId === (profile?.id || '1');
    
    return (
      <TouchableOpacity
        style={[
          styles.conversationItem,
          item.isPinned && styles.pinnedConversation,
          item.unreadCount > 0 && styles.unreadConversation,
        ]}
        onPress={() => {
          markAsRead(item.id);
          openConversation(item);
        }}
        onLongPress={() => togglePin(item.id)}
      >
        <View style={styles.conversationLeft}>
          <View style={styles.avatarContainer}>
            <Image 
              source={{ uri: item.matchedUser.avatar_url }} 
              style={styles.conversationAvatar} 
            />
            {item.matchedUser.isOnline && (
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
          refreshing={false}
          onRefresh={() => {
            // Add refresh logic here
            console.log('Refreshing conversations...');
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

