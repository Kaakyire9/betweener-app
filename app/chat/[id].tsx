import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
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

// Mock messages with advanced features
const MOCK_MESSAGES: MessageType[] = [
  {
    id: '1',
    text: 'Hey! Nice to match with you 😊',
    senderId: '2',
    timestamp: new Date(Date.now() - 3600000),
    type: 'text',
    reactions: [],
    status: 'read',
    readAt: new Date(Date.now() - 3550000),
  },
  {
    id: '2',
    text: 'Hi! Your profile caught my eye, especially your love for art 🎨',
    senderId: '1',
    timestamp: new Date(Date.now() - 3500000),
    type: 'text',
    reactions: [{ userId: '2', emoji: '❤️' }],
  },
  {
    id: '3',
    text: 'Thank you! I saw you\'re into fitness. That\'s awesome!',
    senderId: '2',
    timestamp: new Date(Date.now() - 3400000),
    type: 'text',
    reactions: [],
  },
  {
    id: '4',
    text: '',
    senderId: '1',
    timestamp: new Date(Date.now() - 3300000),
    type: 'mood_sticker',
    sticker: {
      emoji: '💪',
      color: Colors.light.tint,
      name: 'Motivated',
    },
    reactions: [{ userId: '2', emoji: '😂' }],
  },
  {
    id: '5',
    text: 'Haha I love that! Want to grab coffee sometime?',
    senderId: '2',
    timestamp: new Date(Date.now() - 3200000),
    type: 'text',
    reactions: [],
  },
  {
    id: '6',
    text: 'I\'d love that! How about this weekend?',
    senderId: '1',
    timestamp: new Date(Date.now() - 3100000),
    type: 'text',
    reactions: [{ userId: '2', emoji: '🔥' }],
    status: 'read',
    readAt: new Date(Date.now() - 3050000),
  },
  {
    id: '7',
    text: '',
    senderId: '2',
    timestamp: new Date(Date.now() - 3000000),
    type: 'voice',
    voiceMessage: {
      duration: 8.5,
      waveform: [0.2, 0.6, 0.3, 0.8, 0.4, 0.9, 0.2, 0.7, 0.5, 0.3, 0.6, 0.8, 0.1, 0.4, 0.7],
      isPlaying: false,
    },
    reactions: [],
    status: 'delivered',
  },
  {
    id: '8',
    text: 'Here\'s a photo from my morning hike! 🏔️',
    senderId: '1',
    timestamp: new Date(Date.now() - 2900000),
    type: 'image',
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=600&fit=crop',
    reactions: [{ userId: '2', emoji: '😍' }],
    status: 'sent',
  },
];

// Quick reactions
const QUICK_REACTIONS = ['❤️', '😂', '👍', '🔥', '😍', '👏'];

// Mood stickers with color themes
const MOOD_STICKERS = [
  { emoji: '😊', name: 'Happy', category: 'mood' },
  { emoji: '😍', name: 'Loved', category: 'mood' },
  { emoji: '🤗', name: 'Excited', category: 'mood' },
  { emoji: '😎', name: 'Cool', category: 'mood' },
  { emoji: '🥰', name: 'Adorable', category: 'mood' },
  { emoji: '💪', name: 'Motivated', category: 'energy' },
  { emoji: '🔥', name: 'Fire', category: 'energy' },
  { emoji: '⚡', name: 'Electric', category: 'energy' },
  { emoji: '✨', name: 'Sparkle', category: 'energy' },
  { emoji: '🌟', name: 'Star', category: 'energy' },
  { emoji: '❤️', name: 'Love', category: 'heart' },
  { emoji: '💕', name: 'Hearts', category: 'heart' },
  { emoji: '💖', name: 'Sparkling Heart', category: 'heart' },
  { emoji: '🌹', name: 'Rose', category: 'heart' },
  { emoji: '🎉', name: 'Party', category: 'celebration' },
  { emoji: '🎊', name: 'Confetti', category: 'celebration' },
  { emoji: '🥳', name: 'Celebrate', category: 'celebration' },
  { emoji: '🎈', name: 'Balloon', category: 'celebration' },
];

export default function ConversationScreen() {
  const { profile } = useAuth();
  const fontsLoaded = useAppFonts();
  const params = useLocalSearchParams();
  
  // Get conversation data from params
  const conversationId = params.id as string;
  const userName = params.userName as string;
  const userAvatar = params.userAvatar as string;
  const isOnline = params.isOnline === 'true';
  
  const [messages, setMessages] = useState<MessageType[]>(MOCK_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [showMoodStickers, setShowMoodStickers] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageType | null>(null);
  
  const flatListRef = useRef<FlatList>(null);
  const typingAnimation = useRef(new Animated.Value(0)).current;
  const recordingAnimation = useRef(new Animated.Value(0)).current;
  const voiceButtonScale = useRef(new Animated.Value(1)).current;

  const markAsRead = useCallback((messageId: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && msg.senderId !== (profile?.id || '1')) {
        return { ...msg, status: 'read', readAt: new Date() };
      }
      return msg;
    }));
  }, [profile?.id]);

  useEffect(() => {
    // Simulate typing indicator animation
    if (isTyping) {
      Animated.loop(
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
      ).start();
    }

    // Stop typing after 3 seconds
    const timer = setTimeout(() => {
      setIsTyping(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const sendMessage = () => {
    if (inputText.trim()) {
      const newMessage: MessageType = {
        id: Date.now().toString(),
        text: inputText.trim(),
        senderId: profile?.id || '1',
        timestamp: new Date(),
        type: 'text',
        reactions: [],
        status: 'sent',
        replyTo: replyingTo || undefined,
      };
      
      setMessages(prev => [...prev, newMessage]);
      setInputText('');
      setReplyingTo(null);
      
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const sendMoodSticker = (sticker: typeof MOOD_STICKERS[0]) => {
    const newMessage: MessageType = {
      id: Date.now().toString(),
      text: '',
      senderId: profile?.id || '1',
      timestamp: new Date(),
      type: 'mood_sticker',
      sticker: {
        emoji: sticker.emoji,
        color: Colors.light.tint,
        name: sticker.name,
      },
      reactions: [],
      status: 'sent',
    };
    
    setMessages(prev => [...prev, newMessage]);
    setShowMoodStickers(false);
    
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const addReaction = (messageId: string, emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const existingReaction = msg.reactions.find(r => r.userId === profile?.id);
        if (existingReaction) {
          return {
            ...msg,
            reactions: msg.reactions.map(r => 
              r.userId === profile?.id ? { ...r, emoji } : r
            )
          };
        } else {
          return {
            ...msg,
            reactions: [...msg.reactions, { userId: profile?.id || '1', emoji }]
          };
        }
      }
      return msg;
    }));
    setShowReactions(null);
  };

  const startVoiceRecording = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsRecording(true);
      setRecordingDuration(0);
      
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(recordingAnimation, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      const timer = setInterval(() => {
        setRecordingDuration(prev => prev + 0.1);
      }, 100);
      
      setTimeout(() => {
        clearInterval(timer);
        stopVoiceRecording();
      }, 8500);
      
    } catch (error) {
      Alert.alert('Error', 'Could not start recording');
    }
  };

  const stopVoiceRecording = async () => {
    setIsRecording(false);
    recordingAnimation.stopAnimation();
    recordingAnimation.setValue(0);
    
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const voiceMessage: MessageType = {
      id: Date.now().toString(),
      text: '',
      senderId: profile?.id || '1',
      timestamp: new Date(),
      type: 'voice',
      voiceMessage: {
        duration: recordingDuration,
        waveform: Array.from({ length: 15 }, () => Math.random()),
        isPlaying: false,
      },
      reactions: [],
      status: 'sent',
    };
    
    setMessages(prev => [...prev, voiceMessage]);
    setRecordingDuration(0);
    
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const toggleVoicePlayback = (messageId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (playingVoiceId === messageId) {
      setPlayingVoiceId(null);
    } else {
      setPlayingVoiceId(messageId);
      const message = messages.find(m => m.id === messageId);
      if (message?.voiceMessage) {
        setTimeout(() => {
          setPlayingVoiceId(null);
        }, message.voiceMessage.duration * 1000);
      }
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const imageMessage: MessageType = {
          id: Date.now().toString(),
          text: inputText.trim() || '',
          senderId: profile?.id || '1',
          timestamp: new Date(),
          type: 'image',
          imageUrl: result.assets[0].uri,
          reactions: [],
          status: 'sent',
        };
        
        setMessages(prev => [...prev, imageMessage]);
        setInputText('');
        setShowImagePicker(false);
        
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not pick image');
    }
  };

  const replyToMessage = (message: MessageType) => {
    setReplyingTo(message);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const handleLongPress = (messageId: string) => {
    setSelectedMessage(messageId);
    setShowReactions(messageId);
  };

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

  const renderMessage = ({ item, index }: { item: MessageType, index: number }) => {
    const isMyMessage = item.senderId === (profile?.id || '1');
    const showAvatar = !isMyMessage && (index === 0 || messages[index - 1]?.senderId !== item.senderId);

    return (
      <View style={styles.messageContainer}>
        <Pressable
          onLongPress={() => handleLongPress(item.id)}
          onPress={() => {
            if (item.type === 'voice') {
              toggleVoicePlayback(item.id);
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
            {/* Reply indicator */}
            {item.replyTo && (
              <View style={styles.replyIndicator}>
                <View style={styles.replyLine} />
                <Text style={styles.replyText} numberOfLines={1}>
                  {item.replyTo.type === 'text' ? item.replyTo.text : 
                   item.replyTo.type === 'voice' ? '🎵 Voice message' :
                   item.replyTo.type === 'image' ? '📷 Photo' : '😊 Sticker'}
                </Text>
              </View>
            )}

            {/* Message content */}
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
                  onPress={() => toggleVoicePlayback(item.id)}
                >
                  <MaterialCommunityIcons 
                    name={playingVoiceId === item.id ? 'pause' : 'play'} 
                    size={16} 
                    color={isMyMessage ? Colors.light.tint : '#fff'} 
                  />
                </TouchableOpacity>
                
                <View style={styles.voiceWaveform}>
                  {item.voiceMessage?.waveform.map((height, idx) => (
                    <Animated.View
                      key={idx}
                      style={[
                        styles.waveformBar,
                        {
                          height: height * 20,
                          backgroundColor: playingVoiceId === item.id ? 
                            (isMyMessage ? '#fff' : Colors.light.tint) : 
                            (isMyMessage ? '#ffffff80' : '#00000040'),
                        },
                      ]}
                    />
                  ))}
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
            
            {/* Reactions */}
            {item.reactions.length > 0 && (
              <View style={styles.reactionsContainer}>
                {item.reactions.map((reaction, idx) => (
                  <View key={idx} style={styles.reactionBubble}>
                    <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                  </View>
                ))}
              </View>
            )}
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
            {formatTime(item.timestamp)}
          </Text>
          
          {/* Message status for my messages */}
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
                <MaterialCommunityIcons name="check-all" size={12} color={Colors.light.tint} />
              )}
            </View>
          )}
        </View>

        {/* Enhanced Quick Reactions Popup */}
        {showReactions === item.id && (
          <View style={[
            styles.quickReactionsContainer,
            isMyMessage ? styles.quickReactionsRight : styles.quickReactionsLeft,
          ]}>
            <TouchableOpacity
              style={styles.replyButton}
              onPress={() => {
                replyToMessage(item);
                setShowReactions(null);
              }}
            >
              <MaterialCommunityIcons name="reply" size={16} color="#6b7280" />
            </TouchableOpacity>
            {QUICK_REACTIONS.map((emoji, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.quickReactionButton}
                onPress={() => addReaction(item.id, emoji)}
              >
                <Text style={styles.quickReactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

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
            {isOnline && (
              <View style={styles.onlineIndicator} />
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{userName}</Text>
            <Text style={styles.headerStatus}>
              {isOnline ? 'Active now' : 'Last seen recently'}
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
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => setShowReactions(null)}
          onViewableItemsChanged={({ viewableItems }) => {
            viewableItems.forEach(({ item }) => {
              if (item.senderId !== (profile?.id || '1') && item.status !== 'read') {
                markAsRead(item.id);
              }
            });
          }}
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
              onPress={() => setShowImagePicker(!showImagePicker)}
            >
              <MaterialCommunityIcons name="camera" size={22} color="#6b7280" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.inputActionButton}
              onPress={() => setShowMoodStickers(!showMoodStickers)}
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
            onChangeText={setInputText}
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
});
