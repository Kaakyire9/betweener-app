import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Audio, Video } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from 'expo-haptics';
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
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
  Modal,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PinchGestureHandler, State } from "react-native-gesture-handler";

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const ATTACHMENT_SHEET_HEIGHT = 240;
const CHAT_MEDIA_BUCKET = 'chat-media';

// Message type definition
type MessageType = {
  id: string;
  text: string;
  senderId: string;
  timestamp: Date;
  type: 'text' | 'voice' | 'image' | 'mood_sticker' | 'video' | 'document';
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
    audioPath?: string;
  };
  imageUrl?: string;
  videoUrl?: string;
  document?: {
    name: string;
    url: string;
    sizeLabel?: string | null;
    typeLabel?: string | null;
  };
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
  message_type?: MessageType['type'];
  audio_path?: string | null;
  audio_duration?: number | null;
  audio_waveform?: number[] | string | null;
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

const DEFAULT_VOICE_WAVEFORM = [0.2, 0.5, 0.35, 0.6, 0.28, 0.72, 0.44, 0.68, 0.3, 0.55, 0.4, 0.65];
const VIDEO_TEXT_PREFIX = '\u{1F3A5} Video';
const DOCUMENT_TEXT_PREFIX = '\u{1F4CE}';

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
  imageSize?: { width: number; height: number };
  videoSize?: { width: number; height: number };
  theme: typeof Colors.light;
  isDark: boolean;
  styles: ReturnType<typeof createStyles>;
  onLongPress: (messageId: string) => void;
  onToggleVoice: (messageId: string) => void;
  onFocus: (messageId: string) => void;
  onReply: (message: MessageType) => void;
  onAddReaction: (messageId: string, emoji: string) => void;
  onCloseReactions: () => void;
  onViewImage: (url: string) => void;
  onViewVideo: (url: string) => void;
  onVideoSize: (url: string, width: number, height: number) => void;
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
    imageSize,
    videoSize,
    theme,
    isDark,
    styles,
    onLongPress,
    onToggleVoice,
    onFocus,
    onReply,
    onAddReaction,
    onCloseReactions,
    onViewImage,
    onViewVideo,
    onVideoSize,
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
                ? (isMyMessage ? Colors.light.background : theme.tint)
                : (isMyMessage ? withAlpha(Colors.light.background, 0.5) : withAlpha(theme.text, isDark ? 0.35 : 0.25)),
            },
          ]}
        />
      ));
    }, [item.type, item.voiceMessage?.waveform, isPlaying, isMyMessage, isDark, theme.text, theme.tint]);

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

    const documentMeta = useMemo(() => {
      if (item.type !== 'document') return null;
      const parts = [item.document?.sizeLabel, item.document?.typeLabel].filter(Boolean);
      return parts.length ? parts.join(' | ') : null;
    }, [item.type, item.document?.sizeLabel, item.document?.typeLabel]);

    return (
      <View style={styles.messageContainer}>
        <Pressable
          onLongPress={() => onLongPress(item.id)}
          onPress={() => {
            onFocus(item.id);
            if (item.type === 'voice') {
              onToggleVoice(item.id);
            }
            if (item.type === 'image' && item.imageUrl) {
              onViewImage(item.imageUrl);
            }
            if (item.type === 'video' && item.videoUrl) {
              onViewVideo(item.videoUrl);
            }
            if (item.type === 'document' && item.document?.url) {
              Linking.openURL(item.document.url);
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
            item.type === 'video' && styles.videoBubble,
            item.type === 'document' && styles.documentBubble,
          ]}>
            {item.replyTo && (
              <View style={styles.replyIndicator}>
                <View style={styles.replyLine} />
                <Text style={styles.replyText} numberOfLines={1}>
                  {item.replyTo.type === 'text' ? item.replyTo.text :
                   item.replyTo.type === 'voice' ? 'Voice message' :
                   item.replyTo.type === 'image' ? 'Photo' :
                   item.replyTo.type === 'video' ? 'Video' :
                   item.replyTo.type === 'document' ? 'Document' : 'Sticker'}
                </Text>
              </View>
            )}

            {item.type === 'text' ? (
              <View style={styles.textWithMeta}>
                <Text style={[
                  styles.messageText,
                  isMyMessage ? styles.myMessageText : styles.theirMessageText,
                ]}>
                  {item.text}
                </Text>
                <View style={styles.inlineMetaRow} pointerEvents="none">
                  <Text
                    style={[
                      styles.messageMetaText,
                      isMyMessage ? styles.messageMetaTextMy : styles.messageMetaTextTheir,
                    ]}
                  >
                    {timeLabel}
                  </Text>
                  {isMyMessage && (
                    <MaterialCommunityIcons
                      name={item.status === 'read' ? 'check-all' : item.status === 'delivered' ? 'check-all' : item.status === 'sent' ? 'check' : 'clock-outline'}
                      size={12}
                      color={item.status === 'read' ? theme.secondary : withAlpha(Colors.light.background, 0.8)}
                      style={styles.inlineMetaIcon}
                    />
                  )}
                </View>
              </View>
            ) : item.type === 'voice' ? (
              <View style={styles.voiceMessageContainer}>
                <TouchableOpacity
                  style={[styles.voicePlayButton, { backgroundColor: isMyMessage ? Colors.light.background : theme.tint }]}
                  onPress={() => onToggleVoice(item.id)}
                >
                  <MaterialCommunityIcons
                    name={isPlaying ? 'pause' : 'play'}
                    size={16}
                    color={isMyMessage ? theme.tint : Colors.light.background}
                  />
                </TouchableOpacity>

                <View style={styles.voiceWaveform}>
                  {waveformBars}
                </View>

                <Text style={[styles.voiceDuration, { color: isMyMessage ? Colors.light.background : theme.textMuted }]}>
                  {Math.floor(item.voiceMessage?.duration || 0)}s
                </Text>
              </View>
              ) : item.type === 'image' ? (
                <View style={styles.imageMessageContainer}>
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={[
                      styles.messageImage,
                      imageSize ? { width: imageSize.width, height: imageSize.height } : null,
                    ]}
                  />
                  {item.text && (
                    <Text style={[
                      styles.imageCaption,
                      isMyMessage ? styles.myMessageText : styles.theirMessageText,
                    ]}>
                      {item.text}
                    </Text>
                  )}
                </View>
              ) : item.type === 'video' ? (
                <View style={styles.videoMessageContainer}>
                  {item.videoUrl && (
                    <View style={styles.videoPreviewWrap}>
                      <Video
                        source={{ uri: item.videoUrl }}
                        style={[
                          styles.messageVideo,
                          videoSize ? { width: videoSize.width, height: videoSize.height } : null,
                        ]}
                        resizeMode="cover"
                        shouldPlay={false}
                        isMuted
                        useNativeControls={false}
                        onReadyForDisplay={(event: any) => {
                          if (videoSize || !item.videoUrl) return;
                          const naturalSize = event?.naturalSize || (event as any)?.status?.naturalSize;
                          if (naturalSize?.width && naturalSize?.height) {
                            let { width, height, orientation } = naturalSize;
                            if (orientation === 'portrait' && width > height) {
                              [width, height] = [height, width];
                            }
                            if (orientation === 'landscape' && height > width) {
                              [width, height] = [height, width];
                            }
                            onVideoSize(item.videoUrl, width, height);
                          }
                        }}
                      />
                      <View style={styles.videoOverlay}>
                        <MaterialCommunityIcons name="play-circle" size={34} color={Colors.light.background} />
                      </View>
                    </View>
                  )}
                  {item.text && (
                    <Text style={[
                      styles.imageCaption,
                      isMyMessage ? styles.myMessageText : styles.theirMessageText,
                    ]}>
                      {item.text}
                    </Text>
                  )}
                </View>
              ) : item.type === 'document' ? (
                <View style={styles.documentMessageContainer}>
                  <View
                    style={[
                      styles.documentIcon,
                      { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.2) : withAlpha(theme.tint, 0.15) },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="file-document-outline"
                      size={18}
                      color={isMyMessage ? Colors.light.background : theme.tint}
                    />
                  </View>
                  <View style={styles.documentInfo}>
                    <Text
                      style={[
                        styles.documentName,
                        { color: isMyMessage ? Colors.light.background : theme.text },
                      ]}
                      numberOfLines={1}
                    >
                      {item.document?.name || 'Document'}
                    </Text>
                    <Text style={[styles.documentHint, { color: isMyMessage ? withAlpha(Colors.light.background, 0.7) : theme.textMuted }]}>
                      {documentMeta || 'Tap to open'}
                    </Text>
                  </View>
                </View>
              ) : item.type === 'mood_sticker' ? (
                <View style={[styles.moodStickerContainer, { backgroundColor: withAlpha(item.sticker?.color || theme.tint, 0.12) }]}>
                  <Text style={styles.moodStickerEmoji}>{item.sticker?.emoji}</Text>
                  <Text style={[styles.moodStickerName, { color: item.sticker?.color || theme.tint }]}>
                    {item.sticker?.name}
                  </Text>
                </View>
              ) : null}

            {item.type !== 'text' && (
              <View
                style={[
                  styles.messageMetaRow,
                  isMyMessage ? styles.messageMetaRight : styles.messageMetaLeft,
                ]}
                pointerEvents="none"
              >
                <Text
                  style={[
                    styles.messageMetaText,
                    isMyMessage ? styles.messageMetaTextMy : styles.messageMetaTextTheir,
                  ]}
                >
                  {timeLabel}
                </Text>
                {isMyMessage && (
                  <MaterialCommunityIcons
                    name={item.status === 'read' ? 'check-all' : item.status === 'delivered' ? 'check-all' : item.status === 'sent' ? 'check' : 'clock-outline'}
                    size={12}
                    color={item.status === 'read' ? theme.secondary : withAlpha(Colors.light.background, 0.8)}
                    style={styles.messageMetaIcon}
                  />
                )}
              </View>
            )}

            {reactionNodes}

            <View
              pointerEvents="none"
              style={[
                styles.bubbleTail,
                isMyMessage ? styles.bubbleTailRight : styles.bubbleTailLeft,
                {
                  backgroundColor: isMyMessage ? theme.tint : theme.backgroundSubtle,
                  borderWidth: isMyMessage ? 0.5 : 1,
                  borderColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.15)
                    : withAlpha(theme.text, isDark ? 0.14 : 0.08),
                },
              ]}
            />
          </View>
        </Pressable>

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
              <MaterialCommunityIcons name="reply" size={16} color={theme.textMuted} />
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
    prev.userAvatar === next.userAvatar &&
    prev.imageSize?.width === next.imageSize?.width &&
    prev.imageSize?.height === next.imageSize?.height &&
    prev.videoSize?.width === next.videoSize?.width &&
    prev.videoSize?.height === next.videoSize?.height
);

export default function ConversationScreen() {
  const { user } = useAuth();
  const fontsLoaded = useAppFonts();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
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
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [inputBarHeight, setInputBarHeight] = useState(0);
  const [replyingTo, setReplyingTo] = useState<MessageType | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [oldestTimestamp, setOldestTimestamp] = useState<Date | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const [videoViewerUrl, setVideoViewerUrl] = useState<string | null>(null);
  const [imageSizes, setImageSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [videoSizes, setVideoSizes] = useState<Record<string, { width: number; height: number }>>({});
  
  const messagesRef = useRef<MessageType[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const imageScaleBase = useRef(new Animated.Value(1)).current;
  const imagePinchScale = useRef(new Animated.Value(1)).current;
  const imageScaleRef = useRef(1);
  const imageScale = useMemo(
    () => Animated.multiply(imageScaleBase, imagePinchScale),
    [imagePinchScale, imageScaleBase]
  );
  const typingAnimation = useRef(new Animated.Value(0)).current;
  const recordingAnimation = useRef(new Animated.Value(0)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingPulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const voiceButtonScale = useRef(new Animated.Value(1)).current;
  const voiceSoundRef = useRef<Audio.Sound | null>(null);
  const inputRef = useRef<TextInput>(null);
  const reconnectToastOpacity = useRef(new Animated.Value(0)).current;
  const attachmentAnim = useRef(new Animated.Value(0)).current;
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
  const jumpVisibleRef = useRef(false);

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
      const messageType = (row.message_type ?? 'text') as MessageType['type'];
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

      let resolvedType = messageType;
      if (messageType === 'image') {
        const [firstLine, ...rest] = messageText.split('\n');
        imageUrl = firstLine || undefined;
        messageText = rest.join('\n');
      } else if (messageType === 'video') {
        const [firstLine, ...rest] = messageText.split('\n');
        videoUrl = firstLine || undefined;
        messageText = rest.join('\n');
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
        if (url) {
          resolvedType = 'document';
          documentUrl = url;
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



      return {
        id: row.id,
        text: messageText,
        senderId: row.sender_id,
        timestamp: new Date(row.created_at),
        type: resolvedType,
        reactions: [],
        status,
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
      };
    },
    [user?.id]
  );

  const uploadChatMedia = useCallback(async ({
    uri,
    fileName,
    contentType,
  }: {
    uri: string;
    fileName: string;
    contentType: string;
  }) => {
    const filePath = `${user?.id ?? 'anon'}/${Date.now()}-${fileName}`;
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const { error: uploadError } = await supabase
      .storage
      .from(CHAT_MEDIA_BUCKET)
      .upload(filePath, uint8Array, { contentType, upsert: true });
    if (uploadError) {
      console.log('[chat] upload media error', uploadError);
      throw uploadError;
    }
    const { data } = supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .getPublicUrl(filePath);
    return data.publicUrl;
  }, [user?.id]);

  const sendAttachmentText = useCallback(async (text: string) => {
    if (!text.trim() || !user?.id || !conversationId) return;
    const tempId = `temp-attachment-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text,
        senderId: user.id,
        timestamp: new Date(),
        type: 'text',
        reactions: [],
        status: 'sending',
      },
    ]);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        text,
        sender_id: user.id,
        receiver_id: conversationId,
        is_read: false,
        message_type: 'text',
      })
      .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,audio_path,audio_duration,audio_waveform')
      .single();

    if (error || !data) {
      console.log('[chat] send attachment text error', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'sent' } : msg
        )
      );
    } else {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg
        )
      );
    }
  }, [conversationId, mapRowToMessage, user?.id]);

  const sendImageAttachment = useCallback(async (imageUrl: string) => {
    if (!user?.id || !conversationId) return;
    const tempId = `temp-image-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text: '',
        senderId: user.id,
        timestamp: new Date(),
        type: 'image',
        reactions: [],
        status: 'sending',
        imageUrl,
      },
    ]);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        text: imageUrl,
        sender_id: user.id,
        receiver_id: conversationId,
        is_read: false,
        message_type: 'image',
      })
      .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,audio_path,audio_duration,audio_waveform')
      .single();

    if (error || !data) {
      console.log('[chat] send image error', error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    } else {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg
        )
      );
    }
  }, [conversationId, mapRowToMessage, user?.id]);

  const sendVideoAttachment = useCallback(async (videoUrl: string) => {
    if (!user?.id || !conversationId) return;
    const tempId = `temp-video-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text: '',
        senderId: user.id,
        timestamp: new Date(),
        type: 'video',
        reactions: [],
        status: 'sending',
        videoUrl,
      },
    ]);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        text: videoUrl,
        sender_id: user.id,
        receiver_id: conversationId,
        is_read: false,
        message_type: 'video',
      })
      .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,audio_path,audio_duration,audio_waveform')
      .single();

    if (error || !data) {
      console.log('[chat] send video error', error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    } else {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg
        )
      );
    }
  }, [conversationId, mapRowToMessage, user?.id]);

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

  const openAttachmentSheet = useCallback(() => {
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
  }, [attachmentAnim]);

  const handleInputFocus = useCallback(() => {
    if (showImagePicker) {
      closeAttachmentSheet();
    }
  }, [closeAttachmentSheet, showImagePicker]);

  const fetchMessages = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    const { data, error } = await supabase
      .from('messages')
      .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,audio_path,audio_duration,audio_waveform')
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
      .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,audio_path,audio_duration,audio_waveform')
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
            const rowType = row.message_type ?? 'text';
            const tempIndex = prev.findIndex((msg) => {
              if (msg.status !== 'sending' || msg.senderId !== user.id) return false;
              if (rowType === 'voice') {
                return msg.type === 'voice';
              }
              return msg.text === row.text;
            });
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
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
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
        message_type: 'text',
      })
      .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,audio_path,audio_duration,audio_waveform')
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

  const stopRecordingTimer = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }, []);

  const startRecordingTimer = useCallback(() => {
    stopRecordingTimer();
    recordingIntervalRef.current = setInterval(async () => {
      const recording = recordingRef.current;
      if (!recording) return;
      const status = await recording.getStatusAsync();
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
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingDuration(0);
    recordingRef.current = null;
  }, [stopRecordingPulse, stopRecordingTimer]);

  const startVoiceRecording = async () => {
    if (isRecording || isUploadingVoice) return;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone access', 'Enable microphone access to record voice messages.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      setIsRecordingPaused(false);
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

  const pauseVoiceRecording = useCallback(async () => {
    if (!recordingRef.current || !isRecording || isRecordingPaused) return;
    try {
      await recordingRef.current.pauseAsync();
      setIsRecordingPaused(true);
      stopRecordingTimer();
      stopRecordingPulse();
    } catch (error) {
      console.log('[chat] pause recording error', error);
    }
  }, [isRecording, isRecordingPaused, stopRecordingPulse, stopRecordingTimer]);

  const resumeVoiceRecording = useCallback(async () => {
    if (!recordingRef.current || !isRecording || !isRecordingPaused) return;
    try {
      await recordingRef.current.startAsync();
      setIsRecordingPaused(false);
      startRecordingTimer();
      startRecordingPulse();
    } catch (error) {
      console.log('[chat] resume recording error', error);
    }
  }, [isRecording, isRecordingPaused, startRecordingPulse, startRecordingTimer]);

  const discardVoiceRecording = useCallback(async () => {
    if (!isRecording) return;
    try {
      const recording = recordingRef.current;
      if (recording) {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (uri) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch (error) {
      console.log('[chat] discard recording error', error);
    } finally {
      resetRecordingState();
    }
  }, [isRecording, resetRecordingState]);

  const sendVoiceRecording = useCallback(async () => {
    if (!recordingRef.current || !user?.id || !conversationId || isUploadingVoice) return;
    setIsUploadingVoice(true);
    const recording = recordingRef.current;
    let uri: string | null = null;
    let durationSeconds = recordingDuration;
    try {
      const status = await recording.getStatusAsync();
      if (typeof status.durationMillis === 'number') {
        durationSeconds = Math.max(durationSeconds, status.durationMillis / 1000);
      }
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
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
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
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
        },
      },
    ]);

    try {
      const extension = uri.split('.').pop()?.toLowerCase() || 'm4a';
      const fileName = `voice-${Date.now()}.${extension}`;
      const filePath = `${user.id}/${fileName}`;
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
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('voice-messages')
        .upload(filePath, uint8Array, { contentType, upsert: true });

      if (uploadError) {
        console.log('[chat] upload voice error', uploadError);
        Alert.alert('Voice message', 'Upload failed. Please try again.');
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        setIsUploadingVoice(false);
        return;
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          text: '',
          sender_id: user.id,
          receiver_id: conversationId,
          is_read: false,
          message_type: 'voice',
          audio_path: uploadData?.path ?? filePath,
          audio_duration: durationSeconds,
          audio_waveform: waveform,
        })
        .select('id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,audio_path,audio_duration,audio_waveform')
        .single();

      if (error || !data) {
        console.log('[chat] send voice error', error);
        Alert.alert('Voice message', 'Could not send. Please try again.');
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg
          )
        );
      }
    } catch (error) {
      console.log('[chat] voice message error', error);
      Alert.alert('Voice message', 'Something went wrong. Please try again.');
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    } finally {
      setIsUploadingVoice(false);
    }
  }, [conversationId, isUploadingVoice, mapRowToMessage, recordingDuration, resetRecordingState, user?.id]);

  const stopVoicePlayback = useCallback(async () => {
    if (!voiceSoundRef.current) {
      setPlayingVoiceId(null);
      return;
    }
    try {
      await voiceSoundRef.current.stopAsync();
      await voiceSoundRef.current.unloadAsync();
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
    const { data, error } = await supabase
      .storage
      .from('voice-messages')
      .createSignedUrl(audioPath, 3600);
    if (error || !data?.signedUrl) {
      console.log('[chat] signed url error', error);
      Alert.alert('Voice message', 'Unable to load this audio.');
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: data.signedUrl },
        { shouldPlay: true }
      );
      voiceSoundRef.current = sound;
      setPlayingVoiceId(messageId);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          stopVoicePlayback();
        }
      });
    } catch (error) {
      console.log('[chat] playback error', error);
      Alert.alert('Voice message', 'Playback failed.');
    }
  }, [playingVoiceId, stopVoicePlayback]);

  const handleCameraPress = useCallback(async () => {
    const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
    if (!cameraStatus.granted) {
      Alert.alert('Camera access', 'Enable camera access to take photos or videos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      videoMaxDuration: 30,
    });
    if (result.canceled) return;
    closeAttachmentSheet();
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    try {
      const fileName = asset.fileName ?? asset.uri.split('/').pop() ?? `camera-${Date.now()}`;
      const contentType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const publicUrl = await uploadChatMedia({ uri: asset.uri, fileName, contentType });
      if (asset.type === 'image') {
        await sendImageAttachment(publicUrl);
      } else {
        await sendVideoAttachment(publicUrl);
      }
    } catch (error) {
      Alert.alert('Attachment', 'Unable to upload this file.');
    }
  }, [closeAttachmentSheet, sendImageAttachment, sendVideoAttachment, uploadChatMedia]);

  const handleLibraryPress = useCallback(async () => {
    const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libraryStatus.granted) {
      Alert.alert('Photos access', 'Enable photo access to share media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
    });
    if (result.canceled) return;
    closeAttachmentSheet();
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    try {
      const fileName = asset.fileName ?? asset.uri.split('/').pop() ?? `library-${Date.now()}`;
      const contentType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const publicUrl = await uploadChatMedia({ uri: asset.uri, fileName, contentType });
      if (asset.type === 'image') {
        await sendImageAttachment(publicUrl);
      } else {
        await sendVideoAttachment(publicUrl);
      }
    } catch (error) {
      Alert.alert('Attachment', 'Unable to upload this file.');
    }
  }, [closeAttachmentSheet, sendImageAttachment, sendVideoAttachment, uploadChatMedia]);

  const handleDocumentPress = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    closeAttachmentSheet();
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    try {
      const fileName = asset.name ?? asset.uri.split('/').pop() ?? `file-${Date.now()}`;
      const contentType = asset.mimeType ?? 'application/octet-stream';
      const publicUrl = await uploadChatMedia({ uri: asset.uri, fileName, contentType });
      const sizeLabel = formatFileSize(asset.size);
      const typeLabel = getFileTypeLabel(contentType, fileName);
      const labelParts = [fileName, sizeLabel, typeLabel].filter(Boolean);
      await sendAttachmentText(`${DOCUMENT_TEXT_PREFIX} ${labelParts.join(' | ')}\n${publicUrl}`);
    } catch (error) {
      Alert.alert('Attachment', 'Unable to upload this file.');
    }
  }, [closeAttachmentSheet, sendAttachmentText, uploadChatMedia]);

  const handleLocationPress = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Location', 'Enable location access to share your location.');
      return;
    }
    closeAttachmentSheet();
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = position.coords;
    const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
    const label = [place?.city, place?.region].filter(Boolean).join(', ');
    const safeLabel = label || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    await sendAttachmentText(`📍 ${safeLabel}\nhttps://maps.google.com/?q=${latitude},${longitude}`);
  }, [closeAttachmentSheet, sendAttachmentText]);

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
    updateJumpToBottomVisibility(distanceToBottom);

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

  const updateJumpToBottomVisibility = useCallback((distanceToBottom: number) => {
    const threshold = keyboardVisibleRef.current ? 240 : 120;
    const shouldShow = distanceToBottom > threshold;
    if (shouldShow !== jumpVisibleRef.current) {
      jumpVisibleRef.current = shouldShow;
      setShowJumpToBottom(shouldShow);
    }
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

    const onShow = (event: any) => {
      keyboardVisibleRef.current = true;
      const inset =
        Platform.OS === 'ios' ? event?.endCoordinates?.height ?? 0 : 0;
      setKeyboardInset(inset);
      if (getDistanceToBottom() <= 200) {
        shouldAutoScrollRef.current = true;
        InteractionManager.runAfterInteractions(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        });
      }
    };
    const onHide = () => {
      keyboardVisibleRef.current = false;
      setKeyboardInset(0);
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
    if (jumpVisibleRef.current) {
      jumpVisibleRef.current = false;
      setShowJumpToBottom(false);
    }
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

  useEffect(() => {
    const maxWidth = Math.min(screenWidth * 0.72, 340);
    const minHeight = 180;
    const maxHeight = 420;
    const pending: string[] = [];
    messages.forEach((msg) => {
      if (msg.type === 'image' && msg.imageUrl && !imageSizes[msg.imageUrl]) {
        pending.push(msg.imageUrl);
      }
    });
    if (pending.length === 0) return;
    pending.forEach((url) => {
      Image.getSize(
        url,
        (width, height) => {
          if (!width || !height) return;
          const ratio = height / width;
          const scaledHeight = Math.round(maxWidth * ratio);
          const clampedHeight = Math.max(minHeight, Math.min(maxHeight, scaledHeight));
          setImageSizes((prev) =>
            prev[url] ? prev : { ...prev, [url]: { width: maxWidth, height: clampedHeight } }
          );
        },
        () => {
          setImageSizes((prev) =>
            prev[url] ? prev : { ...prev, [url]: { width: maxWidth, height: 240 } }
          );
        }
      );
    });
  }, [imageSizes, messages]);

  const handleVideoSize = useCallback((url: string, width: number, height: number) => {
    if (!url || !width || !height) return;
    const maxWidth = Math.min(screenWidth * 0.72, 340);
    const minHeight = 180;
    const maxHeight = 420;
    const ratio = height / width;
    const scaledHeight = Math.round(maxWidth * ratio);
    const clampedHeight = Math.max(minHeight, Math.min(maxHeight, scaledHeight));
    setVideoSizes((prev) =>
      prev[url] ? prev : { ...prev, [url]: { width: maxWidth, height: clampedHeight } }
    );
  }, []);

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
      const imageSize = item.type === 'image' && item.imageUrl ? imageSizes[item.imageUrl] : undefined;
      const videoSize = item.type === 'video' && item.videoUrl ? videoSizes[item.videoUrl] : undefined;

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
          imageSize={imageSize}
          videoSize={videoSize}
          theme={theme}
          isDark={isDark}
          styles={styles}
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
          onViewImage={setImageViewerUrl}
          onViewVideo={setVideoViewerUrl}
          onVideoSize={handleVideoSize}
        />
      );
    },
    [
      focusedMessageId,
      playingVoiceId,
      showReactions,
      user?.id,
      userAvatar,
      theme,
      isDark,
      imageSizes,
      videoSizes,
      handleLongPress,
      toggleVoicePlayback,
      replyToMessage,
      addReaction,
      formatTime,
      handleVideoSize,
    ]
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
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      if (voiceSoundRef.current) {
        voiceSoundRef.current.stopAsync().catch(() => {});
        voiceSoundRef.current.unloadAsync().catch(() => {});
        voiceSoundRef.current = null;
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

  const handleGoBack = useCallback(() => {
    router.replace('/(tabs)/chat');
  }, []);

  const handleViewProfile = useCallback(() => {
    if (!conversationId) return;
    router.push({
      pathname: '/profile-view',
      params: { profileId: conversationId },
    });
  }, [conversationId]);

  const handleFilterMedia = useCallback(() => {
    Alert.alert('Filter media', 'Filtering photos and videos in this chat is coming soon.');
  }, []);

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
            <MaterialCommunityIcons name="close" size={24} color={theme.textMuted} />
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
          <MaterialCommunityIcons name="wifi" size={14} color={Colors.light.background} />
          <Text style={styles.reconnectToastText}>Reconnected</Text>
        </Animated.View>
      </View>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
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

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleViewProfile}>
            <MaterialCommunityIcons name="account-outline" size={22} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleFilterMedia}>
            <MaterialCommunityIcons name="filter-variant" size={22} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <MaterialCommunityIcons name="dots-vertical" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

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
            style={styles.imageViewerClose}
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
            <Video
              source={{ uri: videoViewerUrl }}
              style={styles.videoViewer}
              resizeMode="contain"
              useNativeControls
              shouldPlay
            />
          )}
          <TouchableOpacity
            style={styles.imageViewerClose}
            onPress={closeVideoViewer}
          >
            <MaterialCommunityIcons name="close" size={20} color={Colors.light.background} />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Messages */}
      <KeyboardAvoidingView 
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {showJumpToBottom && (
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
            updateJumpToBottomVisibility(getDistanceToBottom());
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
            updateJumpToBottomVisibility(getDistanceToBottom());
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
              <MaterialCommunityIcons name="reply" size={16} color={theme.tint} />
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                Replying to: {replyingTo.type === 'text' ? replyingTo.text : 
                            replyingTo.type === 'voice' ? 'Voice message' :
                            replyingTo.type === 'image' ? 'Photo' : 'Sticker'}
              </Text>
            </View>
            <TouchableOpacity onPress={cancelReply} style={styles.cancelReplyButton}>
              <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Enhanced Input Area */}
        <View style={[styles.inputContainer, showImagePicker && styles.inputContainerRaised]}>
          {/* Left Actions */}
          <View style={styles.inputLeftActions}>
            <TouchableOpacity 
              style={styles.inputActionButton}
              onPress={() => {
                if (showImagePicker) {
                  closeAttachmentSheet();
                  requestAnimationFrame(() => inputRef.current?.focus());
                } else {
                  openAttachmentSheet();
                }
              }}
            >
              <MaterialCommunityIcons
                name={showImagePicker ? "keyboard-outline" : "plus"}
                size={22}
                color={theme.textMuted}
              />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.inputActionButton}
              onPress={() => Alert.alert('Coming soon', 'Stickers are not available yet.')}
            >
              <MaterialCommunityIcons 
                name="emoticon-happy" 
                size={22} 
                color={showMoodStickers ? theme.tint : theme.textMuted} 
              />
            </TouchableOpacity>
          </View>
          
          {/* Text Input */}
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={inputText}
            onChangeText={handleInputChange}
            onFocus={handleInputFocus}
            placeholder={isRecording ? "Recording voice..." : replyingTo ? "Reply..." : "Type a message..."}
            placeholderTextColor={withAlpha(theme.textMuted, 0.7)}
            multiline
            maxLength={500}
            editable={!isRecording}
          />
          
          {/* Right Actions */}
          <View style={styles.inputRightActions}>
            {/* Voice Recording Button */}
            {!inputText.trim() && !isRecording && (
              <Animated.View style={{ transform: [{ scale: voiceButtonScale }] }}>
                <Pressable
                  style={[
                    styles.voiceButton,
                  ]}
                  onPress={startVoiceRecording}
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
                      name="microphone"
                      size={20} 
                      color={Colors.light.background} 
                    />
                  </Animated.View>
                </Pressable>
              </Animated.View>
            )}

            {!inputText.trim() && isRecording && (
              <View style={styles.recordingControls}>
                <TouchableOpacity
                  style={[styles.recordingControlButton, styles.recordingControlDanger]}
                  onPress={discardVoiceRecording}
                  disabled={isUploadingVoice}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={Colors.light.background} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.recordingControlButton, styles.recordingControlPause]}
                  onPress={isRecordingPaused ? resumeVoiceRecording : pauseVoiceRecording}
                  disabled={isUploadingVoice}
                >
                  <MaterialCommunityIcons
                    name={isRecordingPaused ? "play" : "pause"}
                    size={18}
                    color={Colors.light.background}
                  />
                </TouchableOpacity>

                <View style={styles.recordingTimerPill}>
                  <Text style={styles.recordingTimerText}>
                    {Math.floor(recordingDuration / 60)}:{`${Math.floor(recordingDuration % 60)}`.padStart(2, '0')}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.recordingControlButton,
                    styles.recordingControlSend,
                    isUploadingVoice && styles.recordingControlDisabled,
                  ]}
                  onPress={sendVoiceRecording}
                  disabled={isUploadingVoice}
                >
                  <MaterialCommunityIcons name="send" size={16} color={Colors.light.background} />
                </TouchableOpacity>
              </View>
            )}
            
            {/* Send Button */}
            {inputText.trim() && (
              <TouchableOpacity 
                style={styles.sendButtonActive}
                onPress={sendMessage}
              >
                <MaterialCommunityIcons name="send" size={20} color={Colors.light.background} />
              </TouchableOpacity>
            )}
          </View>
        </View>

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
                      outputRange: [ATTACHMENT_SHEET_HEIGHT, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.imagePickerHeader}>
              <Text style={styles.imagePickerTitle}>Share</Text>
              <TouchableOpacity
                style={styles.imagePickerClose}
                onPress={closeAttachmentSheet}
              >
                <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.imagePickerGrid}>
              <TouchableOpacity
                style={styles.imagePickerOption}
                onPress={handleCameraPress}
              >
                <View style={styles.imagePickerIcon}>
                  <MaterialCommunityIcons name="camera-outline" size={22} color={theme.tint} />
                </View>
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
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// [Include all the same styles from the original chat screen...]
const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 3,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
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
      backgroundColor: theme.secondary,
      borderWidth: 2,
      borderColor: theme.background,
    },
    headerInfo: {
      flex: 1,
    },
    headerName: {
      fontSize: 16,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: theme.text,
    },
    headerStatus: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 1,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 12,
      gap: 8,
    },
    actionButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.backgroundSubtle,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Chat Container
    chatContainer: {
      flex: 1,
      backgroundColor: theme.background,
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
      marginBottom: 16,
      position: 'relative',
    },
    messageBubbleContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 2,
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
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      position: 'relative',
    },
    textWithMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
    },
    inlineMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 4,
    },
    inlineMetaIcon: {
      marginLeft: 2,
    },
    myMessageBubble: {
      backgroundColor: theme.tint,
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 1,
      borderWidth: 0.5,
      borderColor: withAlpha(Colors.light.background, 0.15),
    },
    theirMessageBubble: {
      backgroundColor: theme.backgroundSubtle,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 0,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    bubbleTail: {
      position: 'absolute',
      bottom: 6,
      width: 12,
      height: 12,
      transform: [{ rotate: '45deg' }],
      borderRadius: 2,
    },
    bubbleTailRight: {
      right: -4,
    },
    bubbleTailLeft: {
      left: -4,
    },
    stickerBubble: {
      backgroundColor: 'transparent',
      padding: 8,
      shadowOpacity: 0.1,
    },
    messageText: {
      fontSize: 14.5,
      lineHeight: 19,
      fontFamily: 'Manrope_400Regular',
    },
    myMessageText: {
      color: Colors.light.background,
    },
    theirMessageText: {
      color: theme.text,
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
      color: withAlpha(Colors.light.background, 0.8),
    },
    messageMetaTextTheir: {
      color: theme.textMuted,
    },
    messageMetaIcon: {
      marginLeft: 2,
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

    // Reactions
    reactionsContainer: {
      flexDirection: 'row',
      position: 'absolute',
      bottom: -8,
      right: 8,
      gap: 4,
    },
    reactionBubble: {
      backgroundColor: theme.background,
      borderRadius: 12,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    reactionEmoji: {
      fontSize: 12,
      color: theme.text,
    },

    // Quick Reactions
    quickReactionsContainer: {
      position: 'absolute',
      top: -50,
      backgroundColor: theme.background,
      borderRadius: 25,
      paddingHorizontal: 8,
      paddingVertical: 8,
      flexDirection: 'row',
      gap: 4,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.12),
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
      backgroundColor: theme.backgroundSubtle,
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
      backgroundColor: theme.background,
      borderRadius: 20,
      borderBottomLeftRadius: 6,
      paddingHorizontal: 16,
      paddingVertical: 12,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
    },
    typingDots: {
      flexDirection: 'row',
      gap: 4,
    },
    typingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.textMuted,
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
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.background,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
      gap: 12,
    },
    inputContainerRaised: {
      marginBottom: ATTACHMENT_SHEET_HEIGHT,
    },
    textInput: {
      flex: 1,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      fontFamily: 'Manrope_400Regular',
      color: theme.text,
      maxHeight: 100,
    },
    sendButtonActive: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.tint,
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
      width: Math.min(screenWidth * 0.72, 340),
      height: Math.min(screenWidth * 0.62, 300),
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
      height: Math.min(screenWidth * 0.62, 300),
      borderRadius: 14,
      backgroundColor: theme.backgroundSubtle,
    },
    videoOverlay: {
      position: 'absolute',
      inset: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.18)',
    },
    documentBubble: {
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    documentMessageContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 180,
      maxWidth: screenWidth * 0.6,
    },
    documentIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    documentInfo: {
      flex: 1,
      gap: 2,
    },
    documentName: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
    },
    documentHint: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
    },
    imageCaption: {
      padding: 12,
      paddingTop: 8,
      fontSize: 14,
      lineHeight: 20,
      color: theme.text,
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
    imageViewerClose: {
      position: 'absolute',
      top: 24,
      right: 20,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
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
      backgroundColor: theme.backgroundSubtle,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Voice Recording
    voiceButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.tint,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
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

    // Attachment Sheet
    attachmentSheet: {
      backgroundColor: theme.background,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
      gap: 12,
      height: ATTACHMENT_SHEET_HEIGHT,
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
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.backgroundSubtle,
      alignItems: 'center',
      justifyContent: 'center',
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
      backgroundColor: theme.backgroundSubtle,
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
  });

