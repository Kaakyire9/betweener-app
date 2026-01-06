import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: screenWidth } = Dimensions.get('window');

// Message type definition
type MessageType = {
  id: string;
  text: string;
  senderId: string;
  timestamp: Date;
  type: 'text' | 'voice' | 'image' | 'mood_sticker';
  reactions: { userId: string; emoji: string; }[];
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  readAt?: Date;
  sticker?: {
    emoji: string;
    color: string;
    name: string;
  };
  voiceMessage?: {
    duration: number;
    waveform: number[];
    isPlaying: boolean;
  };
  imageUrl?: string;
  replyTo?: MessageType;
};

type MessageRow = {
  id: string;
  text: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
  delivered_at: string | null;
};

// Quick reactions
const QUICK_REACTIONS = ['\u2764\uFE0F', '\u{1F602}', '\u{1F60D}', '\u{1F44D}', '\u{1F525}', '\u{1F44F}'];

// Mood stickers with color themes
const MOOD_STICKERS = [
  { emoji: '\u{1F60A}', name: 'Happy', category: 'mood' },
  { emoji: '\u{1F970}', name: 'Loved', category: 'mood' },
  { emoji: '\u{1F929}', name: 'Excited', category: 'mood' },
  { emoji: '\u{1F60E}', name: 'Cool', category: 'mood' },
  { emoji: '\u{1F979}', name: 'Adorable', category: 'mood' },
  { emoji: '\u{1F4AA}', name: 'Motivated', category: 'energy' },
  { emoji: '\u{1F525}', name: 'Fire', category: 'energy' },
  { emoji: '\u26A1', name: 'Electric', category: 'energy' },
  { emoji: '\u2728', name: 'Sparkle', category: 'energy' },
  { emoji: '\u2B50', name: 'Star', category: 'energy' },
  { emoji: '\u2764\uFE0F', name: 'Love', category: 'heart' },
  { emoji: '\u{1F495}', name: 'Hearts', category: 'heart' },
  { emoji: '\u{1F496}', name: 'Sparkling Heart', category: 'heart' },
  { emoji: '\u{1F339}', name: 'Rose', category: 'heart' },
  { emoji: '\u{1F973}', name: 'Party', category: 'celebration' },
  { emoji: '\u{1F389}', name: 'Confetti', category: 'celebration' },
  { emoji: '\u{1F64C}', name: 'Celebrate', category: 'celebration' },
  { emoji: '\u{1F388}', name: 'Balloon', category: 'celebration' },
];

const PAGE_SIZE = 60;

type MessageRowItemProps = {
  item: MessageType;
  isMyMessage: boolean;
  showAvatar: boolean;
  isPlaying: boolean;
  isReactionOpen: boolean;
  isFocused: boolean;
  timeLabel: string;
  userAvatar: string;
  onLongPress: (messageId: string) => void;
  onToggleVoice: (messageId: string) => void;
  onFocus: (messageId: string) => void;
  onReply: (message: MessageType) => void;
  onAddReaction: (messageId: string, emoji: string) => void;
  onCloseReactions: () => void;
};

const MessageRowItem = memo(
  ({
    item,
    isMyMessage,
    showAvatar,
    isPlaying,
    isReactionOpen,
    isFocused,
    timeLabel,
    userAvatar,
    onLongPress,
    onToggleVoice,
    onFocus,
    onReply,
    onAddReaction,
    onCloseReactions,
  }: MessageRowItemProps) => {
    const waveformBars = useMemo(() => {
      if (item.type !== 'voice' || !item.voiceMessage?.waveform) return null;
      if (!isFocused && !isPlaying) return null;
      return item.voiceMessage.waveform.map((height, idx) => (
        <Animated.View
          key={idx}
          style={[
            styles.waveformBar,
            {
              height: height * 20,
              backgroundColor: isPlaying
                ? (isMyMessage ? '#fff' : Colors.light.tint)
                : (isMyMessage ? '#ffffff80' : '#00000040'),
            },
          ]}
        />
      ));
    }, [item.type, item.voiceMessage?.waveform, isPlaying, isMyMessage]);

    const reactionNodes = useMemo(() => {
      if (item.reactions.length === 0) return null;
      if (!isFocused && !isReactionOpen) return null;
      return (
        <View style={styles.reactionsContainer}>
          {item.reactions.map((reaction, idx) => (
            <View key={idx} style={styles.reactionBubble}>
              <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
            </View>
          ))}
        </View>
      );
    }, [item.reactions, isFocused, isReactionOpen]);

    return (
      <View style={styles.messageContainer}>
        <Pressable
          onLongPress={() => onLongPress(item.id)}
          onPress={() => {
            onFocus(item.id);
            if (item.type === 'voice') {
              onToggleVoice(item.id);
            }
          }}
          style={[
            styles.messageBubbleContainer,
            isMyMessage ? styles.myMessageContainer : styles.theirMessageContainer,
          ]}
        >
          {showAvatar && (
            <Image
              source={{ uri: userAvatar }}
              style={styles.messageAvatar}
            />
          )}

          <View style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessageBubble : styles.theirMessageBubble,
            item.type === 'mood_sticker' && styles.stickerBubble,
            item.type === 'voice' && styles.voiceBubble,
            item.type === 'image' && styles.imageBubble,
          ]}>
            {item.replyTo && (
              <View style={styles.replyIndicator}>
                <View style={styles.replyLine} />
                <Text style={styles.replyText} numberOfLines={1}>
                  {item.replyTo.type === 'text' ? item.replyTo.text :
                   item.replyTo.type === 'voice' ? 'Voice message' :
                   item.replyTo.type === 'image' ? 'Photo' : 'Sticker'}
                </Text>
              </View>
            )}

            {item.type === 'text' ? (
              <Text style={[
                styles.messageText,
                isMyMessage ? styles.myMessageText : styles.theirMessageText,
              ]}>
                {item.text}
              </Text>
            ) : item.type === 'voice' ? (
              <View style={styles.voiceMessageContainer}>
                <TouchableOpacity
                  style={[styles.voicePlayButton, { backgroundColor: isMyMessage ? '#fff' : Colors.light.tint }]}
                  onPress={() => onToggleVoice(item.id)}
                >
                  <MaterialCommunityIcons
                    name={isPlaying ? 'pause' : 'play'}
                    size={16}
                    color={isMyMessage ? Colors.light.tint : '#fff'}
                  />
                </TouchableOpacity>

                <View style={styles.voiceWaveform}>
                  {waveformBars}
                </View>

                <Text style={[styles.voiceDuration, { color: isMyMessage ? '#fff' : '#666' }]}>
                  {Math.floor(item.voiceMessage?.duration || 0)}s
                </Text>
              </View>
            ) : item.type === 'image' ? (
              <View style={styles.imageMessageContainer}>
                <Image source={{ uri: item.imageUrl }} style={styles.messageImage} />
                {item.text && (
                  <Text style={[
                    styles.imageCaption,
                    isMyMessage ? styles.myMessageText : styles.theirMessageText,
                  ]}>
                    {item.text}
                  </Text>
                )}
              </View>
            ) : (
              <View style={[styles.moodStickerContainer, { backgroundColor: item.sticker?.color + '20' }]}>
                <Text style={styles.moodStickerEmoji}>{item.sticker?.emoji}</Text>
                <Text style={[styles.moodStickerName, { color: item.sticker?.color }]}>
                  {item.sticker?.name}
                </Text>
              </View>
            )}

            {reactionNodes}
          </View>
        </Pressable>

        <View style={[
          styles.messageInfo,
          isMyMessage ? styles.myMessageInfo : styles.theirMessageInfo,
        ]}>
          <Text style={[
            styles.messageTime,
            isMyMessage ? styles.myMessageTime : styles.theirMessageTime,
          ]}>
            {timeLabel}
          </Text>

          {isMyMessage && (
            <View style={styles.messageStatus}>
              {item.status === 'sending' && (
                <MaterialCommunityIcons name="clock-outline" size={12} color="#9ca3af" />
              )}
              {item.status === 'sent' && (
                <MaterialCommunityIcons name="check" size={12} color="#9ca3af" />
              )}
              {item.status === 'delivered' && (
                <MaterialCommunityIcons name="check-all" size={12} color="#9ca3af" />
              )}
              {item.status === 'read' && (
                <MaterialCommunityIcons name="check-all" size={12} color="#00e676" />
              )}
            </View>
          )}
        </View>

        {isReactionOpen && (
          <View style={[
            styles.quickReactionsContainer,
            isMyMessage ? styles.quickReactionsRight : styles.quickReactionsLeft,
          ]}>
            <TouchableOpacity
              style={styles.replyButton}
              onPress={() => {
                onReply(item);
                onCloseReactions();
              }}
            >
              <MaterialCommunityIcons name="reply" size={16} color="#6b7280" />
            </TouchableOpacity>
            {QUICK_REACTIONS.map((emoji, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.quickReactionButton}
                onPress={() => onAddReaction(item.id, emoji)}
              >
                <Text style={styles.quickReactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.isMyMessage === next.isMyMessage &&
    prev.showAvatar === next.showAvatar &&
    prev.isPlaying === next.isPlaying &&
    prev.isReactionOpen === next.isReactionOpen &&
    prev.timeLabel === next.timeLabel &&
    prev.userAvatar === next.userAvatar
);

export default function ConversationScreen() {
  const { user } = useAuth();
  const fontsLoaded = useAppFonts();
  const params = useLocalSearchParams();
  
  // Get conversation data from params
  const conversationId = params.id as string;
  const userName = params.userName as string;
  const userAvatar = params.userAvatar as string;
  const initialOnline = params.isOnline === 'true';
  const lastSeenParam = params.lastSeen;
  const initialLastSeen =
    typeof lastSeenParam === 'string' ? new Date(lastSeenParam) : null;
  
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [peerOnline, setPeerOnline] = useState(initialOnline);
  const [peerLastSeen, setPeerLastSeen] = useState<Date | null>(initialLastSeen);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [showMoodStickers, setShowMoodStickers] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageType | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [oldestTimestamp, setOldestTimestamp] = useState<Date | null>(null);
  
  const messagesRef = useRef<MessageType[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const typingAnimation = useRef(new Animated.Value(0)).current;
  const recordingAnimation = useRef(new Animated.Value(0)).current;
  const voiceButtonScale = useRef(new Animated.Value(1)).current;
  const reconnectToastOpacity = useRef(new Animated.Value(0)).current;
  const reconnectPendingRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceChannelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const hasAutoScrolledRef = useRef(false);
  const keyboardVisibleRef = useRef(false);
  const listMetricsRef = useRef({
    contentHeight: 0,
    layoutHeight: 0,
    offsetY: 0,
  });
  const wasAtBottomRef = useRef(true);
  const lastLoadTriggerRef = useRef(0);
  const scrollRequestRef = useRef<number | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      return {
        id: row.id,
        text: row.text,
        senderId: row.sender_id,
        timestamp: new Date(row.created_at),
        type: 'text',
        reactions: [],
        status,
      };
    },
    [user?.id]
  );

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

  const fetchMessages = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    const { data, error } = await supabase
      .from('messages')
      .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${conversationId}),and(sender_id.eq.${conversationId},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.log('[chat] fetch messages error', error);
      setMessages([]);
      return;
    }

    const mapped: MessageType[] = (data || []).map((row: MessageRow) =>
      mapRowToMessage(row)
    );

    const ordered = mapped.reverse();
    setMessages(ordered);
    setHasMore((data || []).length === PAGE_SIZE);
    setOldestTimestamp(ordered[0]?.timestamp ?? null);

    await supabase
      .from('messages')
      .update({ delivered_at: new Date().toISOString() })
      .eq('receiver_id', user.id)
      .eq('sender_id', conversationId)
      .is('delivered_at', null);

    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', user.id)
      .eq('sender_id', conversationId)
      .eq('is_read', false);
  }, [conversationId, mapRowToMessage, user?.id]);

  const loadEarlier = useCallback(async () => {
    if (!user?.id || !conversationId || loadingEarlier || !oldestTimestamp) return;
    setLoadingEarlier(true);
    shouldAutoScrollRef.current = false;
    wasAtBottomRef.current = false;
    const { data, error } = await supabase
      .from('messages')
      .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${conversationId}),and(sender_id.eq.${conversationId},receiver_id.eq.${user.id})`
      )
      .lt('created_at', oldestTimestamp.toISOString())
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.log('[chat] load earlier error', error);
      setLoadingEarlier(false);
      return;
    }

    const mapped: MessageType[] = (data || []).map((row: MessageRow) =>
      mapRowToMessage(row)
    );

    const ordered = mapped.reverse();
    if (ordered.length > 0) {
      setMessages((prev) => {
        const existing = new Set(prev.map((msg) => msg.id));
        const merged = ordered.filter((msg) => !existing.has(msg.id));
        return [...merged, ...prev];
      });
      setOldestTimestamp(ordered[0]?.timestamp ?? oldestTimestamp);
    }
    setHasMore((data || []).length === PAGE_SIZE);
    setLoadingEarlier(false);
  }, [conversationId, loadingEarlier, mapRowToMessage, oldestTimestamp, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void fetchMessages();
    }, [fetchMessages])
  );

  useEffect(() => {
    if (!user?.id) return;
    const handleRealtimeStatus = (status: string) => {
      if (status === 'SUBSCRIBED') {
        if (reconnectPendingRef.current) {
          reconnectPendingRef.current = false;
          triggerReconnectToast();
        }
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reconnectPendingRef.current = true;
      }
    };

    const inboxChannel = supabase
      .channel(`messages:inbox:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (row.sender_id !== conversationId) return;
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === row.id)) return prev;
            return [...prev, mapRowToMessage(row)];
          });
          void supabase
            .from('messages')
            .update({ delivered_at: new Date().toISOString() })
            .eq('id', row.id)
            .eq('receiver_id', user.id)
            .is('delivered_at', null);
          void supabase
            .from('messages')
            .update({ is_read: true })
            .eq('id', row.id)
            .eq('receiver_id', user.id);
        }
      )
      .subscribe(handleRealtimeStatus);

    const sentChannel = supabase
      .channel(`messages:sent:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (row.receiver_id !== conversationId) return;
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === row.id)) return prev;
            const tempIndex = prev.findIndex(
              (msg) =>
                msg.status === 'sending' &&
                msg.senderId === user.id &&
                msg.text === row.text
            );
            const nextMessage = mapRowToMessage(row);
            if (tempIndex >= 0) {
              const next = [...prev];
              next[tempIndex] = nextMessage;
              return next;
            }
            return [...prev, nextMessage];
          });
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
          if (row.receiver_id !== conversationId) return;
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== row.id) return msg;
              if (row.is_read) {
                return { ...msg, status: 'read', readAt: new Date() };
              }
              if (row.delivered_at) {
                return { ...msg, status: 'delivered' };
              }
              return msg;
            })
          );
        }
      )
      .subscribe(handleRealtimeStatus);

    return () => {
      supabase.removeChannel(inboxChannel);
      supabase.removeChannel(sentChannel);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [conversationId, mapRowToMessage, triggerReconnectToast, user?.id]);

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    const presenceRoom = [user.id, conversationId].sort().join(':');
    const presenceChannel = supabase.channel(`presence:chat:${presenceRoom}`, {
      config: {
        presence: { key: user.id },
      },
    });
    presenceChannelRef.current = presenceChannel;

    const syncPeerPresence = () => {
      const state = presenceChannel.presenceState();
      const peer = (state as any)[conversationId] as Array<{ typing?: boolean }> | undefined;
      setPeerOnline(Boolean(peer && peer.length > 0));
      setIsTyping(Boolean(peer?.some((p) => p.typing)));
    };

    presenceChannel
      .on('presence', { event: 'sync' }, syncPeerPresence)
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key === conversationId) {
          setPeerLastSeen(null);
          syncPeerPresence();
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key === conversationId) {
          setPeerOnline(false);
          setIsTyping(false);
          setPeerLastSeen(new Date());
        }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.senderId !== conversationId) return;
        setIsTyping(Boolean(payload.typing));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void presenceChannel.track({ onlineAt: new Date().toISOString(), typing: false });
        }
      });

    return () => {
      presenceChannelRef.current = null;
      presenceChannel.unsubscribe();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, user?.id]);

  const markAsRead = useCallback(
    async (messageId: string) => {
      if (!user?.id || !conversationId) return;
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === messageId && msg.senderId !== user.id) {
            return { ...msg, status: 'read', readAt: new Date() };
          }
          return msg;
        })
      );
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('id', messageId)
        .eq('receiver_id', user.id);
      if (error) {
        console.log('[chat] markAsRead error', error);
      }
    },
    [conversationId, user?.id]
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
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }, []);

  const updateTyping = useCallback(
    (text: string) => {
      const channel = presenceChannelRef.current;
      if (!channel || !user?.id) return;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (text.trim().length === 0) {
        void channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { senderId: user.id, typing: false },
        });
        return;
      }
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: user.id, typing: true },
      });
      typingTimeoutRef.current = setTimeout(() => {
        void channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { senderId: user.id, typing: false },
        });
      }, 1500);
    },
    [user?.id]
  );

  const handleInputChange = (text: string) => {
    setInputText(text);
    updateTyping(text);
  };

  const sendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !user?.id || !conversationId) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: MessageType = {
      id: tempId,
      text: trimmed,
      senderId: user.id,
      timestamp: new Date(),
      type: 'text',
      reactions: [],
      status: 'sending',
      replyTo: replyingTo || undefined,
    };

    setMessages((prev) => [...prev, optimistic]);
    setInputText('');
    updateTyping('');
    setReplyingTo(null);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        text: trimmed,
        sender_id: user.id,
        receiver_id: conversationId,
        is_read: false,
      })
      .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at')
      .single();

    if (error || !data) {
      console.log('[chat] send message error', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'sent' } : msg
        )
      );
    } else {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? {
                id: data.id,
                text: data.text,
                senderId: data.sender_id,
                timestamp: new Date(data.created_at),
                type: 'text',
                reactions: [],
                status: data.is_read
                  ? 'read'
                  : data.delivered_at
                  ? 'delivered'
                  : 'sent',
              }
            : msg
        )
      );
    }

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMoodSticker = (_sticker: (typeof MOOD_STICKERS)[number]) => {
    Alert.alert('Coming soon', 'Stickers are not available yet.');
    setShowMoodStickers(false);
  };

  const addReaction = useCallback((messageId: string, emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const existingReaction = msg.reactions.find(r => r.userId === user?.id);
        if (existingReaction) {
          return {
            ...msg,
            reactions: msg.reactions.map(r => 
              r.userId === user?.id ? { ...r, emoji } : r
            )
          };
        } else {
          return {
            ...msg,
            reactions: [...msg.reactions, { userId: user?.id || '', emoji }]
          };
        }
      }
      return msg;
    }));
    setShowReactions(null);
  }, [user?.id]);

  const startVoiceRecording = async () => {
    Alert.alert('Coming soon', 'Voice messages are not available yet.');
  };

  const stopVoiceRecording = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    recordingAnimation.stopAnimation();
    recordingAnimation.setValue(0);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleVoicePlayback = useCallback((messageId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (playingVoiceId === messageId) {
      setPlayingVoiceId(null);
    } else {
      setPlayingVoiceId(messageId);
      const message = messagesRef.current.find(m => m.id === messageId);
      if (message?.voiceMessage) {
        setTimeout(() => {
          setPlayingVoiceId(null);
        }, message.voiceMessage.duration * 1000);
      }
    }
  }, [playingVoiceId]);

  const pickImage = async () => {
    Alert.alert('Coming soon', 'Photo messages are not available yet.');
    setShowImagePicker(false);
  };

  const replyToMessage = useCallback((message: MessageType) => {
    setReplyingTo(message);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const handleLongPress = useCallback((messageId: string) => {
    setShowReactions(messageId);
  }, []);

  const renderTypingIndicator = () => {
    if (!isTyping) return null;

    return (
      <View style={styles.typingContainer}>
        <Image 
          source={{ uri: userAvatar }} 
          style={styles.typingAvatar} 
        />
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

  const handleScroll = (event: any) => {
    if (!hasAutoScrolledRef.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    listMetricsRef.current = {
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
      offsetY: contentOffset.y,
    };
    const distanceToBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const paddingToBottom = keyboardVisibleRef.current ? 200 : 60;
    shouldAutoScrollRef.current =
      distanceToBottom <= paddingToBottom;
    wasAtBottomRef.current = distanceToBottom <= paddingToBottom;

    if (contentOffset.y <= 24 && hasMore && !loadingEarlier) {
      const now = Date.now();
      if (now - lastLoadTriggerRef.current > 800) {
        lastLoadTriggerRef.current = now;
        loadEarlier();
      }
    }
  };

  const getDistanceToBottom = useCallback(() => {
    const { contentHeight, layoutHeight, offsetY } = listMetricsRef.current;
    return Math.max(0, contentHeight - (offsetY + layoutHeight));
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    if (!hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;
      shouldAutoScrollRef.current = true;
      InteractionManager.runAfterInteractions(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
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
    InteractionManager.runAfterInteractions(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = () => {
      keyboardVisibleRef.current = true;
      if (getDistanceToBottom() <= 200) {
        shouldAutoScrollRef.current = true;
        InteractionManager.runAfterInteractions(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        });
      }
    };
    const onHide = () => {
      keyboardVisibleRef.current = false;
      if (getDistanceToBottom() <= 60) {
        shouldAutoScrollRef.current = true;
        InteractionManager.runAfterInteractions(() => {
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

  const maybeScrollToEnd = useCallback((animated: boolean) => {
    if (!flatListRef.current) return;
    if (scrollRequestRef.current !== null) {
      cancelAnimationFrame(scrollRequestRef.current);
    }
    scrollRequestRef.current = requestAnimationFrame(() => {
      scrollRequestRef.current = null;
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const clearFocus = useCallback(() => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    setFocusedMessageId(null);
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    setShowReactions(null);
    clearFocus();
  }, [clearFocus]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: MessageType }> }) => {
      viewableItems.forEach(({ item }) => {
        if (item.senderId !== (user?.id || '') && item.status !== 'read') {
          markAsRead(item.id);
        }
      });
    },
    [markAsRead, user?.id]
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: MessageType; index: number }) => {
      const isMyMessage = item.senderId === (user?.id || '');
      const prevSenderId = messagesRef.current[index - 1]?.senderId;
      const showAvatar = !isMyMessage && (index === 0 || prevSenderId !== item.senderId);
      const isPlaying = playingVoiceId === item.id;
      const isReactionOpen = showReactions === item.id;
      const isFocused = focusedMessageId === item.id;
      const timeLabel = formatTime(item.timestamp);

      return (
        <MessageRowItem
          item={item}
          isMyMessage={isMyMessage}
          showAvatar={showAvatar}
          isPlaying={isPlaying}
          isReactionOpen={isReactionOpen}
          isFocused={isFocused}
          timeLabel={timeLabel}
          userAvatar={userAvatar}
          onLongPress={handleLongPress}
          onToggleVoice={toggleVoicePlayback}
          onFocus={(messageId) => {
            setFocusedMessageId(messageId);
            if (focusTimerRef.current) {
              clearTimeout(focusTimerRef.current);
            }
            focusTimerRef.current = setTimeout(() => {
              setFocusedMessageId(null);
              focusTimerRef.current = null;
            }, 2500);
          }}
          onReply={replyToMessage}
          onAddReaction={addReaction}
          onCloseReactions={() => setShowReactions(null)}
        />
      );
    },
    [
      focusedMessageId,
      playingVoiceId,
      showReactions,
      user?.id,
      userAvatar,
      handleLongPress,
      toggleVoicePlayback,
      replyToMessage,
      addReaction,
      formatTime,
    ]
  );

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
    };
  }, []);

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

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  const renderMoodStickersPanel = () => {
    if (!showMoodStickers) return null;

    const categories = [...new Set(MOOD_STICKERS.map(s => s.category))];

    return (
      <View style={styles.moodStickersPanel}>
        <View style={styles.moodStickerHeader}>
          <Text style={styles.moodStickerTitle}>Mood Stickers</Text>
          <TouchableOpacity onPress={() => setShowMoodStickers(false)}>
            <MaterialCommunityIcons name="close" size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>
        
        {categories.map(category => (
          <View key={category} style={styles.stickerCategory}>
            <Text style={styles.categoryTitle}>
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Text>
            <View style={styles.stickersGrid}>
              {MOOD_STICKERS.filter(s => s.category === category).map((sticker, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.stickerButton, { backgroundColor: Colors.light.tint + '15' }]}
                  onPress={() => sendMoodSticker(sticker)}
                >
                  <Text style={styles.stickerEmoji}>{sticker.emoji}</Text>
                  <Text style={[styles.stickerName, { color: Colors.light.tint }]}>
                    {sticker.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
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
          <MaterialCommunityIcons name="wifi" size={14} color="#fff" />
          <Text style={styles.reconnectToastText}>Reconnected</Text>
        </Animated.View>
      </View>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => {
            if (router.canGoBack?.()) {
              router.back();
            } else {
              router.replace('/(tabs)/explore');
            }
          }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        
        <View style={styles.headerProfile}>
          <View style={styles.avatarContainer}>
            <Image 
              source={{ uri: userAvatar }} 
              style={styles.headerAvatar} 
            />
            {peerOnline && (
              <View style={styles.onlineIndicator} />
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{userName}</Text>
            <Text style={styles.headerStatus}>
              {peerOnline
                ? 'Active now'
                : peerLastSeen
                ? `Last seen ${formatLastSeen(peerLastSeen)}`
                : 'Last seen recently'}
            </Text>
          </View>
        </View>
        
        <TouchableOpacity style={styles.moreButton}>
          <MaterialCommunityIcons name="dots-vertical" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView 
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          ListHeaderComponent={renderLoadEarlier}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={(_, height) => {
            listMetricsRef.current.contentHeight = height;
            const paddingToBottom = keyboardVisibleRef.current ? 200 : 60;
            if (
              shouldAutoScrollRef.current ||
              wasAtBottomRef.current ||
              getDistanceToBottom() <= paddingToBottom
            ) {
              maybeScrollToEnd(true);
            }
          }}
          onLayout={(event) => {
            listMetricsRef.current.layoutHeight = event.nativeEvent.layout.height;
            wasAtBottomRef.current = true;
            if (shouldAutoScrollRef.current) {
              maybeScrollToEnd(false);
            }
          }}
          onScrollBeginDrag={onScrollBeginDrag}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{
            itemVisiblePercentThreshold: 50,
          }}
        />
        
        {renderTypingIndicator()}
        {renderMoodStickersPanel()}

        {/* Reply Preview */}
        {replyingTo && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewContent}>
              <MaterialCommunityIcons name="reply" size={16} color={Colors.light.tint} />
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                Replying to: {replyingTo.type === 'text' ? replyingTo.text : 
                            replyingTo.type === 'voice' ? 'Voice message' :
                            replyingTo.type === 'image' ? 'Photo' : 'Sticker'}
              </Text>
            </View>
            <TouchableOpacity onPress={cancelReply} style={styles.cancelReplyButton}>
              <MaterialCommunityIcons name="close" size={16} color="#6b7280" />
            </TouchableOpacity>
          </View>
        )}

        {/* Enhanced Input Area */}
        <View style={styles.inputContainer}>
          {/* Left Actions */}
          <View style={styles.inputLeftActions}>
            <TouchableOpacity 
              style={styles.inputActionButton}
              onPress={() => Alert.alert('Coming soon', 'Photo messages are not available yet.')}
            >
              <MaterialCommunityIcons name="camera" size={22} color="#6b7280" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.inputActionButton}
              onPress={() => Alert.alert('Coming soon', 'Stickers are not available yet.')}
            >
              <MaterialCommunityIcons 
                name="emoticon-happy" 
                size={22} 
                color={showMoodStickers ? Colors.light.tint : '#6b7280'} 
              />
            </TouchableOpacity>
          </View>
          
          {/* Text Input */}
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={handleInputChange}
            placeholder={replyingTo ? "Reply..." : "Type a message..."}
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={500}
          />
          
          {/* Right Actions */}
          <View style={styles.inputRightActions}>
            {/* Voice Recording Button */}
            {!inputText.trim() && (
              <Animated.View style={{ transform: [{ scale: voiceButtonScale }] }}>
                <Pressable
                  style={[
                    styles.voiceButton,
                    isRecording && styles.voiceButtonRecording,
                  ]}
                  onPressIn={startVoiceRecording}
                  onPressOut={stopVoiceRecording}
                >
                  <Animated.View
                    style={[
                      styles.voiceButtonInner,
                      {
                        opacity: recordingAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0.3],
                        }),
                      },
                    ]}
                  >
                    <MaterialCommunityIcons 
                      name={isRecording ? "stop" : "microphone"} 
                      size={20} 
                      color="#fff" 
                    />
                  </Animated.View>
                  
                  {isRecording && (
                    <View style={styles.recordingIndicator}>
                      <Text style={styles.recordingText}>
                        {recordingDuration.toFixed(1)}s
                      </Text>
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            )}
            
            {/* Send Button */}
            {inputText.trim() && (
              <TouchableOpacity 
                style={styles.sendButtonActive}
                onPress={sendMessage}
              >
                <MaterialCommunityIcons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Image Picker Actions */}
        {showImagePicker && (
          <View style={styles.imagePickerActions}>
            <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
              <MaterialCommunityIcons name="image" size={24} color={Colors.light.tint} />
              <Text style={styles.imagePickerText}>Gallery</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.imagePickerButton} 
              onPress={() => {
                Alert.alert('Camera', 'Camera feature coming soon!');
              }}
            >
              <MaterialCommunityIcons name="camera" size={24} color={Colors.light.tint} />
              <Text style={styles.imagePickerText}>Camera</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.imagePickerButton}
              onPress={() => setShowImagePicker(false)}
            >
              <MaterialCommunityIcons name="close" size={24} color="#ef4444" />
              <Text style={[styles.imagePickerText, { color: '#ef4444' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// [Include all the same styles from the original chat screen...]
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerProfile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#fff',
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
  },
  headerStatus: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    marginTop: 1,
  },
  moreButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },

  // Chat Container
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  loadEarlierContainer: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  loadEarlierButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  loadEarlierText: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'Manrope_500Medium',
  },
  loadEarlierSpacer: {
    height: 4,
  },

  // Messages
  messageContainer: {
    marginBottom: 20,
    position: 'relative',
  },
  messageBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
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
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: screenWidth * 0.75,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    position: 'relative',
  },
  myMessageBubble: {
    backgroundColor: Colors.light.tint,
    borderBottomRightRadius: 6,
    shadowColor: Colors.light.tint,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  theirMessageBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  stickerBubble: {
    backgroundColor: 'transparent',
    padding: 8,
    shadowOpacity: 0.1,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Manrope_400Regular',
  },
  myMessageText: {
    color: '#fff',
  },
  theirMessageText: {
    color: '#111827',
  },
  messageTime: {
    fontSize: 11,
    fontFamily: 'Manrope_400Regular',
    color: '#9ca3af',
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
    borderColor: Colors.light.tint + '30',
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
  },

  // Reactions
  reactionsContainer: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: -8,
    right: 8,
    gap: 4,
  },
  reactionBubble: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  reactionEmoji: {
    fontSize: 12,
  },

  // Quick Reactions
  quickReactionsContainer: {
    position: 'absolute',
    top: -50,
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  quickReactionsLeft: {
    left: 36,
  },
  quickReactionsRight: {
    right: 4,
  },
  quickReactionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  quickReactionEmoji: {
    fontSize: 16,
  },

  // Typing Indicator
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  typingAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 4,
  },
  typingBubble: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9ca3af',
  },

  // Mood Stickers Panel
  moodStickersPanel: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
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
    borderBottomColor: '#f3f4f6',
  },
  moodStickerTitle: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
  },
  stickerCategory: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  categoryTitle: {
    fontSize: 14,
    fontFamily: 'Archivo_700Bold',
    color: '#6b7280',
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
  },
  stickerEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  stickerName: {
    fontSize: 10,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },

  // Input Area
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 12,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#111827',
    maxHeight: 100,
  },
  sendButtonActive: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  voiceMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 160,
  },
  voicePlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
  voiceDuration: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
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
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
  imageCaption: {
    padding: 12,
    paddingTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },

  // Reply Features
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  replyLine: {
    width: 3,
    height: 20,
    backgroundColor: '#fff',
    borderRadius: 2,
    marginRight: 8,
    opacity: 0.6,
  },
  replyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#fff',
    opacity: 0.8,
    fontStyle: 'italic',
  },
  replyPreview: {
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
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
    color: '#6b7280',
  },
  cancelReplyButton: {
    padding: 4,
  },
  replyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    marginRight: 8,
  },

  // Enhanced Input Area
  inputLeftActions: {
    flexDirection: 'row',
    gap: 8,
  },
  inputRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Voice Recording
  voiceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  voiceButtonRecording: {
    backgroundColor: '#ef4444',
  },
  voiceButtonInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingIndicator: {
    position: 'absolute',
    top: -25,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recordingText: {
    fontSize: 12,
    fontFamily: 'Archivo_700Bold',
    color: '#ef4444',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },

  // Image Picker Actions
  imagePickerActions: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  imagePickerButton: {
    alignItems: 'center',
    gap: 4,
  },
  imagePickerText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
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
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  reconnectToastText: {
    fontSize: 12,
    fontFamily: 'Manrope_500Medium',
    color: '#fff',
  },
});
