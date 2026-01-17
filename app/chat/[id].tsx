import MomentViewer from "@/components/MomentViewer";
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useMoments } from "@/hooks/useMoments";
import { useAuth } from "@/lib/auth-context";
import { decryptMediaBytes, encryptMediaBytes, getOrCreateDeviceKeypair } from "@/lib/e2ee";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { Audio } from "expo-av";
import { BlurView } from "expo-blur";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import type { ComponentProps, ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Easing,
    FlatList,
    Image,
    InteractionManager,
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
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { encodeBase64 } from "tweetnacl-util";

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const ATTACHMENT_SHEET_HEIGHT = 300;
const LOCATION_SHEET_HEIGHT = 360;
const CHAT_MEDIA_BUCKET = 'chat-media';
const LOCATION_TEXT_PREFIX = '\u{1F4CD}';
const LOCATION_LIVE_PREFIX = 'LIVE:';
const GOOGLE_MAPS_NATIVE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_WEB_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY || GOOGLE_MAPS_NATIVE_API_KEY;
const GOOGLE_MAPS_MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID;
const LOCATION_PREVIEW_WIDTH = Math.min(screenWidth * 0.72, 320);
const LOCATION_PREVIEW_HEIGHT = 180;
const LIVE_LOCATION_PRESETS = [15, 60, 480] as const;
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
const MESSAGE_SELECT_FIELDS = 'id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,audio_path,audio_duration,audio_waveform,deleted_for_all,deleted_at,deleted_by,edited_at,reply_to_message_id,is_view_once,encrypted_media,encrypted_media_path,encrypted_key_sender,encrypted_key_receiver,encrypted_key_nonce,encrypted_media_nonce,encrypted_media_alg,encrypted_media_mime,encrypted_media_size';
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
// Use new mediaTypes array form (MediaTypeOptions is deprecated)
const getPickerMediaTypesAll = (): ImagePicker.MediaType[] => ['images', 'videos'];

// Message type definition
type MessageType = {
  id: string;
  text: string;
  senderId: string;
  timestamp: Date;
  type: 'text' | 'voice' | 'image' | 'mood_sticker' | 'video' | 'document' | 'location';
  isViewOnce?: boolean;
  encryptedMedia?: boolean;
  encryptedMediaPath?: string | null;
  encryptedKeySender?: string | null;
  encryptedKeyReceiver?: string | null;
  encryptedKeyNonce?: string | null;
  encryptedMediaNonce?: string | null;
  encryptedMediaAlg?: string | null;
  encryptedMediaMime?: string | null;
  encryptedMediaSize?: number | null;
  reactions: { userId: string; emoji: string; }[];
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  readAt?: Date;
  deletedForAll?: boolean;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  editedAt?: Date | null;
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
  location?: {
    lat: number;
    lng: number;
    label: string;
    address?: string;
    mapUrl?: string;
    mapLink?: string;
    live?: boolean;
    expiresAt?: Date | null;
  };
  replyToId?: string | null;
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
};

type MessageEditRow = {
  id: string;
  message_id: string;
  editor_user_id: string;
  previous_text: string;
  created_at: string;
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

const STICKER_COLORS = {
  mood: '#f59e0b',
  energy: '#f97316',
  heart: '#f43f5e',
  celebration: '#38bdf8',
};

// Mood stickers with color themes
const MOOD_STICKERS = [
  { emoji: '\u{1F60A}', name: 'Happy', category: 'mood', color: STICKER_COLORS.mood },
  { emoji: '\u{1F970}', name: 'Loved', category: 'mood', color: STICKER_COLORS.mood },
  { emoji: '\u{1F929}', name: 'Excited', category: 'mood', color: STICKER_COLORS.mood },
  { emoji: '\u{1F60E}', name: 'Cool', category: 'mood', color: STICKER_COLORS.mood },
  { emoji: '\u{1F979}', name: 'Adorable', category: 'mood', color: STICKER_COLORS.mood },
  { emoji: '\u{1F4AA}', name: 'Motivated', category: 'energy', color: STICKER_COLORS.energy },
  { emoji: '\u{1F525}', name: 'Fire', category: 'energy', color: STICKER_COLORS.energy },
  { emoji: '\u26A1', name: 'Electric', category: 'energy', color: STICKER_COLORS.energy },
  { emoji: '\u2728', name: 'Sparkle', category: 'energy', color: STICKER_COLORS.energy },
  { emoji: '\u2B50', name: 'Star', category: 'energy', color: STICKER_COLORS.energy },
  { emoji: '\u2764\uFE0F', name: 'Love', category: 'heart', color: STICKER_COLORS.heart },
  { emoji: '\u{1F495}', name: 'Hearts', category: 'heart', color: STICKER_COLORS.heart },
  { emoji: '\u{1F496}', name: 'Sparkling Heart', category: 'heart', color: STICKER_COLORS.heart },
  { emoji: '\u{1F339}', name: 'Rose', category: 'heart', color: STICKER_COLORS.heart },
  { emoji: '\u{1F973}', name: 'Party', category: 'celebration', color: STICKER_COLORS.celebration },
  { emoji: '\u{1F389}', name: 'Confetti', category: 'celebration', color: STICKER_COLORS.celebration },
  { emoji: '\u{1F64C}', name: 'Celebrate', category: 'celebration', color: STICKER_COLORS.celebration },
  { emoji: '\u{1F388}', name: 'Balloon', category: 'celebration', color: STICKER_COLORS.celebration },
];

const DEFAULT_VOICE_WAVEFORM = [0.2, 0.5, 0.35, 0.6, 0.28, 0.72, 0.44, 0.68, 0.3, 0.55, 0.4, 0.65];
const VIDEO_TEXT_PREFIX = '\u{1F3A5} Video';
const DOCUMENT_TEXT_PREFIX = '\u{1F4CE}';
const STICKER_TEXT_PREFIX = 'sticker::';
const buildMapsLink = (lat: number, lng: number) =>
  `https://maps.google.com/?q=${lat},${lng}`;

const buildStickerPayload = (sticker: (typeof MOOD_STICKERS)[number]) =>
  `${STICKER_TEXT_PREFIX}${JSON.stringify({
    emoji: sticker.emoji,
    name: sticker.name,
    color: sticker.color,
    category: sticker.category,
  })}`;

const parseStickerPayload = (text: string) => {
  if (!text) return null;
  if (!text.startsWith(STICKER_TEXT_PREFIX)) return null;
  try {
    const raw = text.slice(STICKER_TEXT_PREFIX.length);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.emoji !== 'string') return null;
    return {
      emoji: parsed.emoji,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'Sticker',
      color: typeof parsed.color === 'string' ? parsed.color : STICKER_COLORS.mood,
    };
  } catch (error) {
    console.log('[chat] sticker parse error', error);
    return null;
  }
};

const parseStickerFallback = (text: string) => {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const [emoji, ...rest] = trimmed.split(' ');
  if (!emoji) return null;
  const name = rest.join(' ').trim() || 'Sticker';
  return {
    emoji,
    name,
    color: STICKER_COLORS.mood,
  };
};

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

type MessageRowItemProps = {
  item: MessageType;
  isMyMessage: boolean;
  showAvatar: boolean;
  isPlaying: boolean;
  isReactionOpen: boolean;
  isFocused: boolean;
  focusToken: number;
  timeLabel: string;
  userAvatar: string;
  currentUserId: string;
  peerName: string;
  imageSize?: { width: number; height: number };
  videoSize?: { width: number; height: number };
  theme: typeof Colors.light;
  isDark: boolean;
  styles: ReturnType<typeof createStyles>;
  onLongPress: (messageId: string) => void;
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
  onVideoSize: (url: string, width: number, height: number) => void;
  onOpenDocument: (doc?: MessageType['document']) => void;
  onOpenLocation: (message: MessageType) => void;
  onStopLiveShare: (messageId: string) => void;
  onOpenViewOnce: (message: MessageType) => void;
  viewOnceViewedByMe: boolean;
  viewOnceViewedByPeer: boolean;
  highlightQuery?: string;
  onHighlightPress?: (messageId: string) => void;
  now?: number | null;
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

type VideoPreviewProps = {
  url: string;
  size?: { width: number; height: number };
  styles: ReturnType<typeof createStyles>;
  onSize: (width: number, height: number) => void;
};

type ReplyMeta = {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  preview: string;
  time: string;
  canJump: boolean;
};

const VideoPreview = ({ url, size, styles, onSize }: VideoPreviewProps) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.muted = true;
  });

  useEffect(() => {
    try {
      player.pause();
    } catch {}
  }, [player]);

  useEffect(() => {
    if (!url || size) return;

    const handleSize = (width?: number, height?: number) => {
      if (!width || !height) return;
      onSize(width, height);
    };

    const trackSub = player.addListener('videoTrackChange', ({ videoTrack }) => {
      handleSize(videoTrack?.size?.width, videoTrack?.size?.height);
    });

    const sourceSub = player.addListener('sourceLoad', ({ availableVideoTracks }) => {
      const track = availableVideoTracks?.[0];
      handleSize(track?.size?.width, track?.size?.height);
    });

    return () => {
      trackSub.remove();
      sourceSub.remove();
    };
  }, [player, size, onSize, url]);

  return (
    <View style={styles.videoPreviewWrap}>
      <VideoView
        player={player}
        style={[
          styles.messageVideo,
          size ? { width: size.width, height: size.height } : null,
        ]}
        contentFit="cover"
        nativeControls={false}
      />
      <View style={styles.videoOverlay}>
        <MaterialCommunityIcons name="play-circle" size={34} color={Colors.light.background} />
      </View>
    </View>
  );
};

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
    isPlaying,
    isReactionOpen,
    isFocused,
    focusToken,
    timeLabel,
    userAvatar,
    currentUserId,
    peerName,
    imageSize,
    videoSize,
    theme,
    isDark,
    styles,
    onLongPress,
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
    onVideoSize,
    onOpenDocument,
    onOpenLocation,
    onStopLiveShare,
    onOpenViewOnce,
    viewOnceViewedByMe,
    viewOnceViewedByPeer,
    highlightQuery,
    onHighlightPress,
    now,
  }: MessageRowItemProps) => {
    const focusPulse = useRef(new Animated.Value(0)).current;
    const accent = isMyMessage ? Colors.light.background : theme.tint;
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
    const rowSpotlightStyle = useMemo(() => ({
      opacity: focusPulse,
    }) as const, [focusPulse]);
    const rowTintStyle = useMemo(() => ({
      backgroundColor: withAlpha(accent, isMyMessage ? 0.06 : isDark ? 0.08 : 0.04),
    }) as const, [accent, isDark, isMyMessage]);
    const rowVignetteColor = useMemo(
      () => withAlpha(theme.text, isDark ? 0.22 : 0.1),
      [isDark, theme.text]
    );

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
        <Pressable
          style={[
            styles.reactionSummary,
            isMyMessage ? styles.reactionSummaryRight : styles.reactionSummaryLeft,
          ]}
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
      );
    }, [item.deletedForAll, item.reactions, isMyMessage, onOpenReactionSheet, styles]);

    const documentMeta = useMemo(() => {
      if (item.type !== 'document') return null;
      const parts = [item.document?.sizeLabel, item.document?.typeLabel].filter(Boolean);
      return parts.length ? parts.join(' | ') : null;
    }, [item.type, item.document?.sizeLabel, item.document?.typeLabel]);

    const canEdit = useMemo(
      () =>
        isMyMessage &&
        item.type === 'text' &&
        !item.deletedForAll &&
        !item.id.startsWith('temp-'),
      [isMyMessage, item.deletedForAll, item.id, item.type]
    );

    const showEdited = Boolean(item.editedAt) && !item.deletedForAll;
    const isEncryptedViewOnce = Boolean(
      item.isViewOnce && item.encryptedMedia && (item.type === 'image' || item.type === 'video')
    );
    const canOpenViewOnce = !isMyMessage && !viewOnceViewedByMe && isEncryptedViewOnce;
    const mediaLabel = item.type === 'video' ? 'video' : 'photo';
    const viewOnceTitle = isMyMessage
      ? viewOnceViewedByPeer
        ? 'Opened'
        : 'View once'
      : viewOnceViewedByMe
      ? 'Viewed'
      : 'View once';
    const viewOnceSubtitle = '';

    const locationRemaining = useMemo(() => {
      if (item.type !== 'location' || !item.location?.live) return null;
      const nowValue = typeof now === 'number' ? now : Date.now();
      return formatRemainingTime(item.location.expiresAt, nowValue);
    }, [item.location?.expiresAt, item.location?.live, item.type, now]);

    const locationIsActive = useMemo(() => {
      if (item.type !== 'location' || !item.location?.live || !item.location?.expiresAt) return false;
      const nowValue = typeof now === 'number' ? now : Date.now();
      return item.location.expiresAt.getTime() > nowValue;
    }, [item.location?.expiresAt, item.location?.live, item.type, now]);

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
        voice: 'microphone-outline',
        image: 'image-outline',
        video: 'video-outline',
        document: 'file-document-outline',
        location: 'map-marker-outline',
        mood_sticker: 'emoticon-happy-outline',
      };
      let preview = '';
      switch (item.replyTo.type) {
        case 'text':
          preview = item.replyTo.text || 'Message';
          break;
        case 'voice':
          preview = 'Voice message';
          break;
        case 'image':
          preview = 'Photo';
          break;
        case 'video':
          preview = 'Video';
          break;
        case 'document':
          preview = item.replyTo.document?.name || 'Document';
          break;
        case 'location':
          preview = item.replyTo.location?.label ? `Location: ${item.replyTo.location.label}` : 'Location';
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
        };
      }
      return {
        icon: iconMap[item.replyTo.type],
        label: item.replyTo.senderId === currentUserId ? 'You' : peerName || 'User',
        preview,
        time: replyTime,
        canJump: true,
      };
    }, [currentUserId, item.replyTo, item.replyToId, peerName]);

    const handleVideoSize = useCallback(
      (width: number, height: number) => {
        if (!item.videoUrl) return;
        onVideoSize(item.videoUrl, width, height);
      },
      [item.videoUrl, onVideoSize]
    );

    const messageTextNode = useMemo(() => {
      const text = item.text || '';
      if (!text) return null;
      const baseStyle = [
        styles.messageText,
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

    return (
      <View style={styles.messageContainer}>
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
        <Pressable
          onLongPress={() => onLongPress(item.id)}
          delayLongPress={600}
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
              onOpenDocument(item.document);
            }
            if (item.type === 'location' && item.location) {
              onOpenLocation(item);
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
            item.deletedForAll && styles.deletedMessageBubble,
            item.type === 'mood_sticker' && styles.stickerBubble,
            item.type === 'voice' && styles.voiceBubble,
            item.type === 'image' && !isEncryptedViewOnce && styles.imageBubble,
            item.type === 'video' && !isEncryptedViewOnce && styles.videoBubble,
            item.type === 'document' && styles.documentBubble,
            item.type === 'location' && styles.locationBubble,
          ]}>
            {isFocused ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.messageFocusSpotlight, focusPulseStyle]}
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
                <View style={styles.replyChipContent}>
                  <View style={styles.replyChipHeader}>
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
                    numberOfLines={1}
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
                  style={styles.inlineMetaRow}
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
                    styles.viewOnceInlineLabel,
                  ]}
                >
                  {viewOnceTitle}
                </Text>
              </Pressable>
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
                    <VideoPreview
                      url={item.videoUrl}
                      size={videoSize}
                      styles={styles}
                      onSize={handleVideoSize}
                    />
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
              ) : item.type === 'location' ? (
                <View style={styles.locationMessageContainer}>
                  {item.location?.mapUrl ? (
                    <Image
                      source={{ uri: item.location.mapUrl }}
                      style={styles.locationMapImage}
                    />
                  ) : (
                    <View style={styles.locationMapPlaceholder}>
                      <MaterialCommunityIcons name="map-outline" size={28} color={theme.textMuted} />
                      <Text style={[styles.locationPlaceholderText, { color: theme.textMuted }]}>
                        Map preview
                      </Text>
                    </View>
                  )}
                  <View style={styles.locationInfoRow}>
                    <View style={[styles.locationIconBadge, { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.15) : withAlpha(theme.tint, 0.14) }]}>
                      <MaterialCommunityIcons
                        name={item.location?.live ? "map-marker-radius-outline" : "map-marker-outline"}
                        size={16}
                        color={isMyMessage ? Colors.light.background : theme.tint}
                      />
                    </View>
                    <View style={styles.locationTextBlock}>
                      <Text
                        style={[
                          styles.locationLabelText,
                          { color: isMyMessage ? Colors.light.background : theme.text },
                        ]}
                        numberOfLines={1}
                      >
                        {item.location?.label || 'Shared location'}
                      </Text>
                      {item.location?.address ? (
                        <Text
                          style={[
                            styles.locationAddressText,
                            { color: isMyMessage ? withAlpha(Colors.light.background, 0.75) : theme.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {item.location.address}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.locationRouteRow}>
                    <MaterialCommunityIcons
                      name="navigation-variant-outline"
                      size={12}
                      color={isMyMessage ? withAlpha(Colors.light.background, 0.8) : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.locationRouteText,
                        { color: isMyMessage ? withAlpha(Colors.light.background, 0.8) : theme.textMuted },
                      ]}
                    >
                      Tap for directions
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={14}
                      color={isMyMessage ? withAlpha(Colors.light.background, 0.8) : theme.textMuted}
                    />
                  </View>
                  {item.location?.live && (
                    <View style={styles.locationLiveRow}>
                      <View style={[styles.locationLiveBadge, { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.18) : withAlpha(theme.secondary, 0.18) }]}>
                        <Text
                          style={[
                            styles.locationLiveBadgeText,
                            { color: isMyMessage ? Colors.light.background : theme.secondary },
                          ]}
                        >
                          Live
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.locationLiveText,
                          { color: isMyMessage ? withAlpha(Colors.light.background, 0.8) : theme.textMuted },
                        ]}
                      >
                        {locationRemaining || 'Live'}
                      </Text>
                      {isMyMessage && locationIsActive && (
                        <TouchableOpacity
                          style={[
                            styles.locationStopButton,
                            { borderColor: isMyMessage ? withAlpha(Colors.light.background, 0.45) : withAlpha(theme.text, 0.2) },
                          ]}
                          onPress={(event) => {
                            if (event?.stopPropagation) {
                              event.stopPropagation();
                            }
                            onStopLiveShare(item.id);
                          }}
                        >
                          <Text
                            style={[
                              styles.locationStopText,
                              { color: isMyMessage ? Colors.light.background : theme.text },
                            ]}
                          >
                            Stop sharing
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
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
                  backgroundColor: item.deletedForAll
                    ? withAlpha(theme.backgroundSubtle, isDark ? 0.6 : 0.85)
                    : isMyMessage
                    ? theme.tint
                    : theme.backgroundSubtle,
                  borderWidth: item.deletedForAll ? 1 : isMyMessage ? 0.5 : 1,
                  borderColor: item.deletedForAll
                    ? withAlpha(theme.text, isDark ? 0.2 : 0.12)
                    : isMyMessage
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
            {!item.deletedForAll && (
              <>
                {QUICK_REACTIONS.map((emoji, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.quickReactionButton}
                    onPress={() => onAddReaction(item.id, emoji)}
                  >
                    <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {isReactionOpen && !item.deletedForAll && (
          <View
            style={[
              styles.messageActionRow,
              isMyMessage ? styles.messageActionRowRight : styles.messageActionRowLeft,
            ]}
          >
            <TouchableOpacity
              style={styles.messageActionPill}
              onPress={() => {
                onReply(item);
                onCloseReactions();
              }}
            >
              <MaterialCommunityIcons name="reply" size={14} color={theme.text} />
              <Text style={styles.messageActionPillLabel}>Reply</Text>
            </TouchableOpacity>
            {!item.isViewOnce && (
              <TouchableOpacity
                style={styles.messageActionPill}
                onPress={() => {
                  onCopyMessage(item);
                  onCloseReactions();
                }}
              >
                <MaterialCommunityIcons name="content-copy" size={14} color={theme.text} />
                <Text style={styles.messageActionPillLabel}>Copy</Text>
              </TouchableOpacity>
            )}
            {canEdit ? (
              <TouchableOpacity
                style={styles.messageActionPill}
                onPress={() => {
                  onEditMessage(item);
                  onCloseReactions();
                }}
              >
                <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.text} />
                <Text style={styles.messageActionPillLabel}>Edit</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.messageActionPill}
              onPress={() => {
                onTogglePin(item, isActionPinned);
                onCloseReactions();
              }}
            >
              <MaterialCommunityIcons
                name={isActionPinned ? "pin-off-outline" : "pin-outline"}
                size={14}
                color={theme.text}
              />
              <Text style={styles.messageActionPillLabel}>
                {isActionPinned ? 'Unpin' : 'Pin'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.messageActionPill, styles.messageActionPillDanger]}
              onPress={() => {
                onDeleteMessage(item);
                onCloseReactions();
              }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={14} color={theme.danger} />
              <Text style={[styles.messageActionPillLabel, styles.messageActionPillLabelDanger]}>
                Delete
              </Text>
            </TouchableOpacity>
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
    prev.isFocused === next.isFocused &&
    prev.focusToken === next.focusToken &&
    prev.isActionPinned === next.isActionPinned &&
    prev.onOpenReactionSheet === next.onOpenReactionSheet &&
    prev.onEditMessage === next.onEditMessage &&
    prev.onOpenEditHistory === next.onOpenEditHistory &&
    prev.onOpenViewOnce === next.onOpenViewOnce &&
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
    prev.videoSize?.width === next.videoSize?.width &&
    prev.videoSize?.height === next.videoSize?.height &&
    prev.now === next.now
);

export default function ConversationScreen() {
  const { user, profile } = useAuth();
  const fontsLoaded = useAppFonts();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const params = useLocalSearchParams();
  const hasPlacesKey = Boolean(GOOGLE_MAPS_WEB_API_KEY);
  
  // Get conversation data from params
  const conversationId = params.id as string;
  const userName = params.userName as string;
  const userAvatar = params.userAvatar as string;
  const initialOnline = params.isOnline === 'true';
  const lastSeenParam = params.lastSeen;
  const initialLastSeen =
    typeof lastSeenParam === 'string' ? new Date(lastSeenParam) : null;

  const { momentUsers } = useMoments({
    currentUserId: user?.id,
    currentUserProfile: profile
      ? { full_name: profile.full_name, avatar_url: profile.avatar_url }
      : null,
  });

  const momentUsersWithContent = useMemo(
    () => momentUsers.filter((entry) => entry.moments.length > 0),
    [momentUsers]
  );

  const peerHasMoment = useMemo(() => {
    if (!conversationId) return false;
    const peer = momentUsers.find((entry) => entry.userId === conversationId);
    return (peer?.moments.length ?? 0) > 0;
  }, [conversationId, momentUsers]);

  const peerMomentUser = useMemo(
    () => momentUsersWithContent.find((entry) => entry.userId === conversationId) ?? null,
    [conversationId, momentUsersWithContent]
  );
  
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [peerOnline, setPeerOnline] = useState(initialOnline);
  const [peerLastSeen, setPeerLastSeen] = useState<Date | null>(initialLastSeen);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [messageActionsVisible, setMessageActionsVisible] = useState(false);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReasonId, setReportReasonId] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [blockStatus, setBlockStatus] = useState<string | null>(null);
  const [showMoodStickers, setShowMoodStickers] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [inputBarHeight, setInputBarHeight] = useState(0);
  const [replyingTo, setReplyingTo] = useState<MessageType | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageType | null>(null);
  const [viewOnceMode, setViewOnceMode] = useState(false);
  const [viewOnceStatus, setViewOnceStatus] = useState<Record<string, { viewedByMe: boolean; viewedByPeer: boolean }>>({});
  const [viewOnceModalMessage, setViewOnceModalMessage] = useState<MessageType | null>(null);
  const [viewOnceMediaUri, setViewOnceMediaUri] = useState<string | null>(null);
  const [viewOnceDecrypting, setViewOnceDecrypting] = useState(false);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [oldestTimestamp, setOldestTimestamp] = useState<Date | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const [videoViewerUrl, setVideoViewerUrl] = useState<string | null>(null);
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(null);
  const [imageSizes, setImageSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [videoSizes, setVideoSizes] = useState<Record<string, { width: number; height: number }>>({});
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
  const [momentViewerVisible, setMomentViewerVisible] = useState(false);
  const [momentViewerUserId, setMomentViewerUserId] = useState<string | null>(null);
  const [showHeaderHint, setShowHeaderHint] = useState(false);
  const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
  const [chatSearchVisible, setChatSearchVisible] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [mediaHubVisible, setMediaHubVisible] = useState(false);
  const [mediaTab, setMediaTab] = useState<'media' | 'links' | 'docs'>('media');
  const [clearChatLoading, setClearChatLoading] = useState(false);
  const [isChatMuted, setIsChatMuted] = useState(false);
  const [isChatPinned, setIsChatPinned] = useState(false);
  const [chatPrefsLoaded, setChatPrefsLoaded] = useState(false);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>([]);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [pinnedMessageMap, setPinnedMessageMap] = useState<Record<string, MessageType>>({});
  const [pinnedSheetVisible, setPinnedSheetVisible] = useState(false);
  const [pinnedBannerExpanded, setPinnedBannerExpanded] = useState(false);
  const [editHistoryVisible, setEditHistoryVisible] = useState(false);
  const [editHistoryMessage, setEditHistoryMessage] = useState<MessageType | null>(null);
  const [editHistoryEntries, setEditHistoryEntries] = useState<MessageEditRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [reactionSheetVisible, setReactionSheetVisible] = useState(false);
  const [reactionSheetMessageId, setReactionSheetMessageId] = useState<string | null>(null);
  const [reactionSheetEmoji, setReactionSheetEmoji] = useState<string | null>(null);
  const [reactionProfiles, setReactionProfiles] = useState<Record<string, { name: string; avatar?: string | null }>>({});
  const [reactionProfilesLoading, setReactionProfilesLoading] = useState(false);
  const showLocationLoading = locationLoading && !currentCoords && !locationError;
  
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
  const mapRef = useRef<MapView>(null);
  const inputRef = useRef<TextInput>(null);
  const reconnectToastOpacity = useRef(new Animated.Value(0)).current;
  const momentPulse = useRef(new Animated.Value(0)).current;
  const momentPulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const headerHintOpacity = useRef(new Animated.Value(0)).current;
  const headerHintDismissedRef = useRef(false);
  const hiddenMessageIdsRef = useRef<Set<string>>(new Set());
  const pinnedMessageIdsRef = useRef<Set<string>>(new Set());
  const attachmentAnim = useRef(new Animated.Value(0)).current;
  const locationSheetAnim = useRef(new Animated.Value(0)).current;
  const pinnedBannerAnim = useRef(new Animated.Value(0)).current;
  const reconnectPendingRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceChannelRef = useRef<any>(null);
  const typingListChannelRef = useRef<any>(null);
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
  const jumpSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpVisibleRef = useRef(false);
  const suppressSuggestionRef = useRef(false);
  const viewOnceStatusRef = useRef(viewOnceStatus);
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

  const isBlockedByMe = blockStatus === BLOCKED_BY_ME;
  const isBlockedByThem = blockStatus === BLOCKED_BY_THEM;
  const isChatBlocked = isBlockedByMe || isBlockedByThem;
  const showMoments = peerHasMoment && !isChatBlocked;
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

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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


  useEffect(() => {
    let isMounted = true;
    if (!conversationId) return;
    setChatPrefsLoaded(false);
    const loadPrefs = async () => {
      let localMuted = false;
      let localPinned = false;
      try {
        const raw = await AsyncStorage.getItem(CHAT_PREFS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const prefs = parsed?.[conversationId] ?? {};
        localMuted = Boolean(prefs.muted);
        localPinned = Boolean(prefs.pinned);
      } catch {
        localMuted = false;
        localPinned = false;
      }

      if (user?.id) {
        const { data, error } = await supabase
          .from('chat_prefs')
          .select('muted,pinned')
          .eq('user_id', user.id)
          .eq('peer_id', conversationId)
          .maybeSingle();
        if (!isMounted) return;
        if (!error && data) {
          setIsChatMuted(Boolean(data.muted));
          setIsChatPinned(Boolean(data.pinned));
          try {
            const raw = await AsyncStorage.getItem(CHAT_PREFS_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            parsed[conversationId] = {
              muted: Boolean(data.muted),
              pinned: Boolean(data.pinned),
            };
            await AsyncStorage.setItem(CHAT_PREFS_STORAGE_KEY, JSON.stringify(parsed));
          } catch {
            // Ignore persistence errors.
          }
        } else {
          setIsChatMuted(localMuted);
          setIsChatPinned(localPinned);
        }
      } else {
        if (!isMounted) return;
        setIsChatMuted(localMuted);
        setIsChatPinned(localPinned);
      }

      if (isMounted) setChatPrefsLoaded(true);
    };
    void loadPrefs();
    return () => {
      isMounted = false;
    };
  }, [conversationId, user?.id]);

  const fetchHiddenMessages = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    const { data, error } = await supabase
      .from('message_hides')
      .select('message_id')
      .eq('user_id', user.id)
      .eq('peer_id', conversationId);
    if (error) {
      console.log('[chat] fetch hidden messages error', error);
      return;
    }
    const ids = (data || []).map((row: { message_id: string }) => row.message_id);
    updateHiddenMessageIds(ids);
  }, [conversationId, updateHiddenMessageIds, user?.id]);

  const syncMessageReactions = useCallback(async (messageIds: string[]) => {
    if (!user?.id || messageIds.length === 0) return;
    const uniqueIds = Array.from(new Set(messageIds)).filter(Boolean);
    if (uniqueIds.length === 0) return;
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id,user_id,emoji,created_at')
      .in('message_id', uniqueIds);
    if (error) {
      console.log('[chat] fetch reactions error', error);
      return;
    }
    const grouped = new Map<string, MessageType['reactions']>();
    (data || []).forEach((row: ReactionRow) => {
      if (!row.message_id || !row.user_id || !row.emoji) return;
      const existing = grouped.get(row.message_id) ?? [];
      const index = existing.findIndex((reaction) => reaction.userId === row.user_id);
      const nextReaction = { userId: row.user_id, emoji: row.emoji };
      if (index >= 0) {
        existing[index] = nextReaction;
        grouped.set(row.message_id, [...existing]);
      } else {
        grouped.set(row.message_id, [...existing, nextReaction]);
      }
    });
    const idSet = new Set(uniqueIds);
    setMessages((prev) =>
      prev.map((msg) =>
        idSet.has(msg.id) ? { ...msg, reactions: grouped.get(msg.id) ?? [] } : msg
      )
    );
  }, [user?.id]);

  const syncViewOnceStatus = useCallback(async (messageIds: string[]) => {
    if (!user?.id || !conversationId || messageIds.length === 0) return;
    const uniqueIds = Array.from(new Set(messageIds)).filter(Boolean);
    if (uniqueIds.length === 0) return;
    const { data, error } = await supabase
      .from('message_views')
      .select('message_id,viewer_id')
      .in('message_id', uniqueIds);
    if (error) {
      console.log('[chat] fetch view-once status error', error);
      return;
    }
    setViewOnceStatus((prev) => {
      const next = { ...prev };
      uniqueIds.forEach((id) => {
        next[id] = { viewedByMe: false, viewedByPeer: false };
      });
      (data || []).forEach((row: any) => {
        if (!row?.message_id || !row?.viewer_id) return;
        const current = next[row.message_id] ?? { viewedByMe: false, viewedByPeer: false };
        if (row.viewer_id === user.id) {
          current.viewedByMe = true;
        }
        if (row.viewer_id === conversationId) {
          current.viewedByPeer = true;
        }
        next[row.message_id] = current;
      });
      return next;
    });
  }, [conversationId, user?.id]);

  const applyReactionUpdate = useCallback((row: ReactionRow, mode: 'upsert' | 'delete') => {
    if (!row?.message_id || !row.user_id) return;
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== row.message_id) return msg;
        const reactions = msg.reactions ?? [];
        if (mode === 'delete') {
          return {
            ...msg,
            reactions: reactions.filter((reaction) => reaction.userId !== row.user_id),
          };
        }
        const index = reactions.findIndex((reaction) => reaction.userId === row.user_id);
        if (index >= 0) {
          const next = [...reactions];
          next[index] = { userId: row.user_id, emoji: row.emoji };
          return { ...msg, reactions: next };
        }
        return { ...msg, reactions: [...reactions, { userId: row.user_id, emoji: row.emoji }] };
      })
    );
  }, []);

  const fetchBlockStatus = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    const { data, error } = await supabase
      .from('blocks')
      .select('blocker_id,blocked_id')
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${conversationId}),and(blocker_id.eq.${conversationId},blocked_id.eq.${user.id})`
      );
    if (error) {
      console.log('[chat] fetch block status error', error);
      setBlockStatus(null);
      return;
    }
    const rows = (data || []) as Array<{ blocker_id: string; blocked_id: string }>;
    if (rows.length === 0) {
      setBlockStatus(null);
      return;
    }
    const blockedByMe = rows.some((row) => row.blocker_id === user.id);
    const blockedByThem = rows.some((row) => row.blocker_id === conversationId);
    setBlockStatus(blockedByMe ? BLOCKED_BY_ME : blockedByThem ? BLOCKED_BY_THEM : null);
  }, [conversationId, user?.id]);

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    const channel = supabase
      .channel(`message_hides:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_hides',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { message_id: string; peer_id?: string | null };
          if (row.peer_id && row.peer_id !== conversationId) return;
          const nextSet = new Set(hiddenMessageIdsRef.current);
          nextSet.add(row.message_id);
          updateHiddenMessageIds(Array.from(nextSet));
          setMessages((prev) => prev.filter((msg) => msg.id !== row.message_id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, updateHiddenMessageIds, user?.id]);

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    const channel = supabase
      .channel(`blocks:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'blocks',
          filter: `blocker_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { blocker_id: string; blocked_id: string };
          if (row.blocked_id !== conversationId) return;
          setBlockStatus(BLOCKED_BY_ME);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'blocks',
          filter: `blocked_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { blocker_id: string; blocked_id: string };
          if (row.blocker_id !== conversationId) return;
          setBlockStatus(BLOCKED_BY_THEM);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'blocks',
          filter: `blocker_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.old as { blocker_id: string; blocked_id: string };
          if (row.blocked_id !== conversationId) return;
          void fetchBlockStatus();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'blocks',
          filter: `blocked_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.old as { blocker_id: string; blocked_id: string };
          if (row.blocker_id !== conversationId) return;
          void fetchBlockStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchBlockStatus, user?.id]);

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    const channel = supabase
      .channel(`chat_prefs:${user.id}:${conversationId}`)
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
          if (!row || row.peer_id !== conversationId) return;
          if (typeof row.muted === 'boolean') setIsChatMuted(row.muted);
          if (typeof row.pinned === 'boolean') setIsChatPinned(row.pinned);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id || !conversationId) return () => {};
      const intervalMs = isChatBlocked ? 5000 : 15000;
      const interval = setInterval(() => {
        void fetchBlockStatus();
      }, intervalMs);
      return () => {
        clearInterval(interval);
      };
    }, [conversationId, fetchBlockStatus, isChatBlocked, user?.id])
  );

  useEffect(() => {
    if (hiddenMessageIds.length === 0) return;
    setMessages((prev) => prev.filter((msg) => !hiddenMessageIdsRef.current.has(msg.id)));
  }, [hiddenMessageIds]);

  useEffect(() => {
    if (!chatPrefsLoaded || !conversationId) return;
    const persistPrefs = async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_PREFS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[conversationId] = {
          muted: isChatMuted,
          pinned: isChatPinned,
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
            muted: isChatMuted,
            pinned: isChatPinned,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,peer_id' },
        );
      if (error) {
        console.log('[chat] chat prefs upsert error', error);
      }
    };
    void persistPrefs();
  }, [chatPrefsLoaded, conversationId, isChatMuted, isChatPinned, user?.id]);

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
    if (fontsLoaded) {
      void maybeShowHint();
    }
    return () => {
      isMounted = false;
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [fontsLoaded, headerHintOpacity]);

  useEffect(() => {
    if (!peerHasMoment) {
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
  }, [momentPulse, peerHasMoment]);

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
      let location: MessageType['location'] | undefined;
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
            imageUrl = firstLine || undefined;
            messageText = rest.join('\n');
          }
        } else if (messageType === 'video') {
          if (!encryptedMedia) {
            const [firstLine, ...rest] = messageText.split('\n');
            videoUrl = firstLine || undefined;
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
        if (
          messageType === 'mood_sticker' ||
          messageText.startsWith(STICKER_TEXT_PREFIX)
        ) {
          const parsedSticker = parseStickerPayload(messageText) ?? parseStickerFallback(messageText);
          if (parsedSticker) {
            resolvedType = 'mood_sticker';
            sticker = parsedSticker;
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
        sticker = undefined;
      }

      return {
        id: row.id,
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
        replyToId,
        sticker,
      };
    },
    [user?.id]
  );

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
    return messages.find((msg) => msg.id === locationViewerMessageId) ?? null;
  }, [locationViewerMessageId, messages]);

  const actionMessage = useMemo(() => {
    if (!actionMessageId) return null;
    return messages.find((msg) => msg.id === actionMessageId) ?? null;
  }, [actionMessageId, messages]);

  const isActionPinned = useMemo(() => {
    if (!actionMessage) return false;
    return pinnedMessageIds.includes(actionMessage.id);
  }, [actionMessage, pinnedMessageIds]);

  const canEditAction = useMemo(() => {
    if (!actionMessage || !user?.id) return false;
    return (
      actionMessage.senderId === user.id &&
      actionMessage.type === 'text' &&
      !actionMessage.deletedForAll &&
      !actionMessage.id.startsWith('temp-')
    );
  }, [actionMessage, user?.id]);

  const reactionSheetMessage = useMemo(() => {
    if (!reactionSheetMessageId) return null;
    return messages.find((msg) => msg.id === reactionSheetMessageId) ?? null;
  }, [messages, reactionSheetMessageId]);

  const reactionSummary = useMemo(() => {
    if (!reactionSheetMessage) return [];
    const counts = new Map<string, number>();
    reactionSheetMessage.reactions.forEach((reaction) => {
      counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  }, [reactionSheetMessage]);

  const reactionSheetList = useMemo(() => {
    if (!reactionSheetMessage) return [];
    const list = reactionSheetMessage.reactions;
    if (!reactionSheetEmoji) return list;
    return list.filter((reaction) => reaction.emoji === reactionSheetEmoji);
  }, [reactionSheetEmoji, reactionSheetMessage]);

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

  useEffect(() => {
    if (!locationModalVisible || currentCoords) return;
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
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!isActive) return;
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCurrentCoords(coords);
        if (!selectedPlace) {
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
  }, [currentCoords, locationModalVisible]);

  useEffect(() => {
    if (!locationModalVisible || !currentCoords) return;
    void fetchNearbyPlaces(currentCoords);
  }, [currentCoords, fetchNearbyPlaces, locationModalVisible]);

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
    if (!sessionData.session) {
      throw new Error('unauthenticated_storage');
    }
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
    return { publicUrl: data.publicUrl, filePath };
  }, [user?.id]);

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
    const filePath = `${user?.id ?? 'anon'}/${Date.now()}-${fileName}`;
    const { error: uploadError } = await supabase
      .storage
      .from(CHAT_MEDIA_BUCKET)
      .upload(filePath, bytes, { contentType, upsert: true });
    if (uploadError) {
      console.log('[chat] upload encrypted media error', uploadError);
      throw uploadError;
    }
    return filePath;
  }, [user?.id]);

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

  const sendAttachmentText = useCallback(async (text: string) => {
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
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
        replyToId: replyingTo?.id ?? null,
        replyTo: replyingTo || undefined,
      },
    ]);
    setReplyingTo(null);
    setViewOnceMode(false);
    setEditingMessage(null);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        text,
        sender_id: user.id,
        receiver_id: conversationId,
        is_read: false,
        message_type: 'text',
        reply_to_message_id: replyingTo?.id ?? null,
      })
      .select(MESSAGE_SELECT_FIELDS)
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
        linkReplies(
          prev.map((msg) =>
            msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg
          )
        )
      );
    }
  }, [conversationId, isBlockedByMe, isChatBlocked, linkReplies, mapRowToMessage, replyingTo, user?.id]);

  const sendImageAttachment = useCallback(async ({
    imageUrl,
    isViewOnce = false,
    encryptedPayload,
    encryptedPath,
    mimeType,
    size,
  }: {
    imageUrl?: string;
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
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text: imageUrl ?? '',
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
        replyToId: replyingTo?.id ?? null,
        replyTo: replyingTo || undefined,
      },
    ]);
    setReplyingTo(null);
    setEditingMessage(null);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        text: imageUrl ?? '',
        sender_id: user.id,
        receiver_id: conversationId,
        is_read: false,
        message_type: 'image',
        reply_to_message_id: replyingTo?.id ?? null,
        is_view_once: isViewOnce,
        encrypted_media: Boolean(encryptedPayload),
        encrypted_media_path: encryptedPath ?? null,
        encrypted_key_sender: encryptedPayload?.encryptedKeySender ?? null,
        encrypted_key_receiver: encryptedPayload?.encryptedKeyReceiver ?? null,
        encrypted_key_nonce: encryptedPayload?.encryptedKeyNonce ?? null,
        encrypted_media_nonce: encryptedPayload?.encryptedMediaNonce ?? null,
        encrypted_media_alg: encryptedPayload ? 'nacl-secretbox' : null,
        encrypted_media_mime: mimeType ?? null,
        encrypted_media_size: size ?? null,
      })
      .select(MESSAGE_SELECT_FIELDS)
      .single();

    if (error || !data) {
      console.log('[chat] send image error', error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    } else {
      setMessages((prev) =>
        linkReplies(
          prev.map((msg) =>
            msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg
          )
        )
      );
    }
  }, [conversationId, isBlockedByMe, isChatBlocked, linkReplies, mapRowToMessage, replyingTo, user?.id]);

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
    const optimistic: MessageType = {
      id: tempId,
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
    setMessages((prev) => [...prev, optimistic]);
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
          sender_id: user.id,
          receiver_id: conversationId,
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
        setMessages((prev) =>
          linkReplies(
            prev.map((msg) => (msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg))
          )
        );
      }
    } catch (err) {
      console.log('[chat] encrypted view-once error', err);
      Alert.alert('View once', 'Unable to send encrypted media.');
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    }
  }, [conversationId, ensureViewOnceKeys, isBlockedByMe, isChatBlocked, linkReplies, mapRowToMessage, replyingTo, uploadEncryptedChatMedia, user?.id]);

  const sendVideoAttachment = useCallback(async ({
    videoUrl,
    isViewOnce = false,
    encryptedPayload,
    encryptedPath,
    mimeType,
    size,
  }: {
    videoUrl?: string;
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
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text: videoUrl ?? '',
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
        replyToId: replyingTo?.id ?? null,
        replyTo: replyingTo || undefined,
      },
    ]);
    setReplyingTo(null);
    setEditingMessage(null);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        text: videoUrl ?? '',
        sender_id: user.id,
        receiver_id: conversationId,
        is_read: false,
        message_type: 'video',
        reply_to_message_id: replyingTo?.id ?? null,
        is_view_once: isViewOnce,
        encrypted_media: Boolean(encryptedPayload),
        encrypted_media_path: encryptedPath ?? null,
        encrypted_key_sender: encryptedPayload?.encryptedKeySender ?? null,
        encrypted_key_receiver: encryptedPayload?.encryptedKeyReceiver ?? null,
        encrypted_key_nonce: encryptedPayload?.encryptedKeyNonce ?? null,
        encrypted_media_nonce: encryptedPayload?.encryptedMediaNonce ?? null,
        encrypted_media_alg: encryptedPayload ? 'nacl-secretbox' : null,
        encrypted_media_mime: mimeType ?? null,
        encrypted_media_size: size ?? null,
      })
      .select(MESSAGE_SELECT_FIELDS)
      .single();

    if (error || !data) {
      console.log('[chat] send video error', error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    } else {
      setMessages((prev) =>
        linkReplies(
          prev.map((msg) =>
            msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg
          )
        )
      );
    }
  }, [conversationId, isBlockedByMe, isChatBlocked, linkReplies, mapRowToMessage, replyingTo, user?.id]);

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
    if (!user?.id || !conversationId) return null;
    const tempId = `temp-location-${Date.now()}`;
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
    setReplyingTo(null);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        text,
        sender_id: user.id,
        receiver_id: conversationId,
        is_read: false,
        message_type: 'location',
        reply_to_message_id: replyingTo?.id ?? null,
      })
      .select(MESSAGE_SELECT_FIELDS)
      .single();

    if (error || !data) {
      console.log('[chat] send location error', error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      return null;
    }

    setMessages((prev) =>
      linkReplies(
        prev.map((msg) =>
          msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg
        )
      )
    );
    return data.id as string;
  }, [conversationId, isBlockedByMe, isChatBlocked, linkReplies, mapRowToMessage, replyingTo, user?.id]);

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
    const { error } = await supabase
      .from('messages')
      .update({ text })
      .eq('id', messageId);
    if (error) {
      console.log('[chat] live location update error', error);
    }
  }, []);

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
    if (!selectedPlace) {
      setLocationError('Choose a place to share.');
      return;
    }
    const expiresAt = new Date(Date.now() + liveDurationMinutes * 60000);
    const payload = {
      lat: selectedPlace.lat,
      lng: selectedPlace.lng,
      label: selectedPlace.name,
      address: selectedPlace.address,
      live: true,
      expiresAt,
    };
    closeLocationModal();
    const messageId = await sendLocationMessage(payload);
    if (messageId) {
      void startLiveLocationUpdates({
        messageId,
        expiresAt,
        label: selectedPlace.name,
        address: selectedPlace.address,
      });
    }
  }, [closeLocationModal, liveDurationMinutes, selectedPlace, sendLocationMessage, startLiveLocationUpdates]);

  const handleInputFocus = useCallback(() => {
    if (showImagePicker) {
      closeAttachmentSheet();
    }
  }, [closeAttachmentSheet, showImagePicker]);

  const fetchMessages = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT_FIELDS)
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

    const hiddenSet = hiddenMessageIdsRef.current;
    const mapped: MessageType[] = (data || []).map((row: MessageRow) =>
      mapRowToMessage(row)
    ).filter((msg) => !hiddenSet.has(msg.id));

    const ordered = mapped.reverse();
    const linked = linkReplies(ordered);
    setMessages(linked);
    void syncMessageReactions(linked.map((msg) => msg.id));
    const viewOnceIds = linked.filter((msg) => msg.isViewOnce).map((msg) => msg.id);
    void syncViewOnceStatus(viewOnceIds);
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
  }, [conversationId, isBlockedByMe, isChatBlocked, linkReplies, mapRowToMessage, syncMessageReactions, syncViewOnceStatus, user?.id]);

  const loadEarlier = useCallback(async () => {
    if (!user?.id || !conversationId || loadingEarlier || !oldestTimestamp) return;
    setLoadingEarlier(true);
    shouldAutoScrollRef.current = false;
    wasAtBottomRef.current = false;
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT_FIELDS)
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

    const hiddenSet = hiddenMessageIdsRef.current;
    const mapped: MessageType[] = (data || []).map((row: MessageRow) =>
      mapRowToMessage(row)
    ).filter((msg) => !hiddenSet.has(msg.id));

    const ordered = mapped.reverse();
      if (ordered.length > 0) {
        setMessages((prev) => {
          const existing = new Set(prev.map((msg) => msg.id));
          const merged = ordered.filter((msg) => !existing.has(msg.id));
          return linkReplies([...merged, ...prev]);
        });
        void syncMessageReactions(ordered.map((msg) => msg.id));
        const viewOnceIds = ordered.filter((msg) => msg.isViewOnce).map((msg) => msg.id);
        void syncViewOnceStatus(viewOnceIds);
        setOldestTimestamp(ordered[0]?.timestamp ?? oldestTimestamp);
      }
    setHasMore((data || []).length === PAGE_SIZE);
    setLoadingEarlier(false);
  }, [conversationId, linkReplies, loadingEarlier, mapRowToMessage, oldestTimestamp, syncMessageReactions, syncViewOnceStatus, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await fetchHiddenMessages();
        await fetchBlockStatus();
        await fetchPinnedMessages();
        await fetchMessages();
      })();
    }, [fetchBlockStatus, fetchHiddenMessages, fetchMessages, fetchPinnedMessages])
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
            if (hiddenMessageIdsRef.current.has(row.id)) return prev;
            if (prev.some((msg) => msg.id === row.id)) return prev;
            return linkReplies([...prev, mapRowToMessage(row)]);
          });
          if (!hiddenMessageIdsRef.current.has(row.id)) {
            void syncMessageReactions([row.id]);
            if (row.is_view_once) {
              void syncViewOnceStatus([row.id]);
            }
          }
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
          if (row.sender_id !== conversationId) return;
          if (hiddenMessageIdsRef.current.has(row.id)) return;
          const nextMessage = mapRowToMessage(row);
          setMessages((prev) =>
            linkReplies(
              prev.map((msg) =>
                msg.id === row.id
                  ? { ...nextMessage, reactions: msg.reactions }
                  : msg
              )
            )
          );
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
            if (hiddenMessageIdsRef.current.has(row.id)) return prev;
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
              return linkReplies(next);
            }
            return linkReplies([...prev, nextMessage]);
          });
          if (!hiddenMessageIdsRef.current.has(row.id)) {
            void syncMessageReactions([row.id]);
            if (row.is_view_once) {
              void syncViewOnceStatus([row.id]);
            }
          }
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
          if (hiddenMessageIdsRef.current.has(row.id)) return;
          const nextMessage = mapRowToMessage(row);
          setMessages((prev) =>
            linkReplies(
              prev.map((msg) =>
                msg.id === row.id
                  ? { ...nextMessage, reactions: msg.reactions }
                  : msg
              )
            )
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
  }, [conversationId, linkReplies, mapRowToMessage, syncMessageReactions, syncViewOnceStatus, triggerReconnectToast, user?.id]);

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    const channel = supabase
      .channel(`message_reactions:${conversationId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          const row = payload.new as ReactionRow;
          if (!messagesRef.current.some((msg) => msg.id === row.message_id)) return;
          applyReactionUpdate(row, 'upsert');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          const row = payload.new as ReactionRow;
          if (!messagesRef.current.some((msg) => msg.id === row.message_id)) return;
          applyReactionUpdate(row, 'upsert');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          const row = payload.old as ReactionRow;
          if (!messagesRef.current.some((msg) => msg.id === row.message_id)) return;
          applyReactionUpdate(row, 'delete');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyReactionUpdate, conversationId, user?.id]);

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    const channel = supabase
      .channel(`message_views:${conversationId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_views',
        },
        (payload) => {
          const row = payload.new as { message_id: string; viewer_id: string };
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id]);

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

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    const typingListChannel = supabase.channel(`typing:chatlist:${conversationId}`, {
      config: {
        broadcast: { self: false },
      },
    });
    typingListChannelRef.current = typingListChannel;
    typingListChannel.subscribe();

    return () => {
      typingListChannelRef.current = null;
      typingListChannel.unsubscribe();
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
      case 'image':
        return 'image-outline';
      case 'video':
        return 'video-outline';
      case 'voice':
        return 'microphone-outline';
      case 'document':
        return 'file-document-outline';
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

  const openPinnedSheet = useCallback(() => {
    if (pinnedMessageCount === 0) return;
    setPinnedSheetVisible(true);
  }, [pinnedMessageCount]);

  const closePinnedSheet = useCallback(() => {
    setPinnedSheetVisible(false);
  }, []);


  const openReactionSheet = useCallback((message: MessageType) => {
    setReactionSheetMessageId(message.id);
    setReactionSheetEmoji(null);
    setReactionSheetVisible(true);
  }, []);

  const closeReactionSheet = useCallback(() => {
    setReactionSheetVisible(false);
    setReactionSheetMessageId(null);
    setReactionSheetEmoji(null);
  }, []);

  const searchResults = useMemo(() => {
    const query = chatSearchQuery.trim().toLowerCase();
    if (!query) return [];
    return messages.filter((msg) => {
      if (msg.deletedForAll) return false;
      if (msg.type !== 'text') return false;
      return (msg.text || '').toLowerCase().includes(query);
    });
  }, [chatSearchQuery, messages]);

  const matchMessageIds = useMemo(() => searchResults.map((result) => result.id), [searchResults]);

  const mediaItems = useMemo(() => {
    return messages
      .filter((msg) => !msg.deletedForAll && (msg.type === 'image' || msg.type === 'video'))
      .map((msg) => ({
        id: msg.id,
        type: msg.type as 'image' | 'video',
        url: msg.type === 'image' ? msg.imageUrl : msg.videoUrl,
        timestamp: msg.timestamp,
      }))
      .filter((item) => Boolean(item.url));
  }, [messages]);

  const linkItems = useMemo(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const items: Array<{ id: string; url: string; timestamp: Date; snippet: string }> = [];
    messages.forEach((msg) => {
      if (msg.deletedForAll || msg.type !== 'text' || !msg.text) return;
      const matches = msg.text.match(urlRegex);
      if (!matches) return;
      matches.forEach((url) => {
        items.push({
          id: msg.id,
          url,
          timestamp: msg.timestamp,
          snippet: msg.text,
        });
      });
    });
    return items;
  }, [messages]);

  const docItems = useMemo(() => {
    return messages
      .filter((msg) => !msg.deletedForAll && msg.type === 'document' && msg.document?.url)
      .map((msg) => ({
        id: msg.id,
        name: msg.document?.name || 'Document',
        url: msg.document?.url || '',
        typeLabel: msg.document?.typeLabel || null,
        sizeLabel: msg.document?.sizeLabel || null,
        timestamp: msg.timestamp,
      }))
      .filter((item) => Boolean(item.url));
  }, [messages]);

  const jumpToNextMatch = useCallback(
    (messageId: string) => {
      if (matchMessageIds.length === 0) return;
      const index = matchMessageIds.indexOf(messageId);
      const nextId = matchMessageIds[(index + 1) % matchMessageIds.length] || matchMessageIds[0];
      jumpToMessage(nextId);
    },
    [jumpToMessage, matchMessageIds]
  );

  const updateTyping = useCallback(
    (text: string) => {
      if (isChatBlocked) return;
      if (!user?.id) return;
      const presenceChannel = presenceChannelRef.current;
      const listChannel = typingListChannelRef.current;
      if (!presenceChannel && !listChannel) return;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      const sendTypingStatus = (typing: boolean) => {
        if (presenceChannel) {
          void presenceChannel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { senderId: user.id, typing },
          });
        }
        if (listChannel) {
          void listChannel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { senderId: user.id, typing },
          });
        }
      };
      if (text.trim().length === 0) {
        sendTypingStatus(false);
        return;
      }
      sendTypingStatus(true);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(false);
      }, 1500);
    },
    [isChatBlocked, user?.id]
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
      prev.map((msg) =>
        msg.id === targetId
          ? { ...msg, text: trimmed, editedAt: optimisticEditedAt }
          : msg
      )
    );
    setEditingMessage(null);
    setInputText('');
    updateTyping('');

    const { data, error } = await supabase.rpc('edit_message', {
      message_id: targetId,
      new_text: trimmed,
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
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === mapped.id
          ? { ...msg, text: mapped.text, editedAt: mapped.editedAt ?? optimisticEditedAt }
          : msg
      )
    );
  }, [editingMessage, fetchMessages, inputText, mapRowToMessage, updateTyping, user?.id]);

  const sendMessage = async () => {
    if (editingMessage) {
      await submitEditMessage();
      return;
    }
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    const trimmed = inputText.trim();
    if (!trimmed || !user?.id || !conversationId) return;
    const nextType: MessageType['type'] = 'text';
    const tempId = `temp-${Date.now()}`;
    const optimistic: MessageType = {
      id: tempId,
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
    setInputText('');
    updateTyping('');
    setReplyingTo(null);
    setEditingMessage(null);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        text: trimmed,
        sender_id: user.id,
        receiver_id: conversationId,
        is_read: false,
        message_type: 'text',
        reply_to_message_id: replyingTo?.id ?? null,
      })
      .select(MESSAGE_SELECT_FIELDS)
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
        linkReplies(
          prev.map((msg) => {
            if (msg.id !== tempId) return msg;
            const mapped = mapRowToMessage(data as MessageRow);
            return {
              ...mapped,
              replyToId: msg.replyToId ?? mapped.replyToId ?? null,
              replyTo: msg.replyTo ?? mapped.replyTo,
            };
          })
        )
      );
    }

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMoodSticker = useCallback(async (sticker: (typeof MOOD_STICKERS)[number]) => {
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
    if (!user?.id || !conversationId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const tempId = `temp-sticker-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text: sticker.name,
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
      },
    ]);
    setShowMoodStickers(false);
    setReplyingTo(null);
    setEditingMessage(null);
    setViewOnceMode(false);

    const payload = buildStickerPayload(sticker);
    const { data, error } = await supabase
      .from('messages')
      .insert({
        text: payload,
        sender_id: user.id,
        receiver_id: conversationId,
        is_read: false,
        message_type: 'mood_sticker',
        reply_to_message_id: replyingTo?.id ?? null,
      })
      .select(MESSAGE_SELECT_FIELDS)
      .single();

    if (error || !data) {
      console.log('[chat] send sticker error', error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      Alert.alert('Sticker failed', 'Unable to send this sticker right now.');
      return;
    }

    setMessages((prev) =>
      linkReplies(
        prev.map((msg) =>
          msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg
        )
      )
    );
  }, [conversationId, isBlockedByMe, isChatBlocked, linkReplies, mapRowToMessage, replyingTo, user?.id]);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const previousReactions =
      messagesRef.current.find((msg) => msg.id === messageId)?.reactions ?? [];
    const existingReaction = previousReactions.find((reaction) => reaction.userId === user.id);
    const shouldRemove = existingReaction?.emoji === emoji;

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        if (shouldRemove) {
          return {
            ...msg,
            reactions: msg.reactions.filter((reaction) => reaction.userId !== user.id),
          };
        }
        if (existingReaction) {
          return {
            ...msg,
            reactions: msg.reactions.map((reaction) =>
              reaction.userId === user.id ? { ...reaction, emoji } : reaction
            ),
          };
        }
        return {
          ...msg,
          reactions: [...msg.reactions, { userId: user.id, emoji }],
        };
      })
    );
    setShowReactions(null);

    if (shouldRemove) {
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id);
      if (error) {
        console.log('[chat] remove reaction error', error);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, reactions: previousReactions } : msg
          )
        );
        Alert.alert('Reaction', 'Unable to remove your reaction right now.');
      }
      return;
    }

    const { error } = await supabase
      .from('message_reactions')
      .upsert(
        {
          message_id: messageId,
          user_id: user.id,
          emoji,
        },
        { onConflict: 'message_id,user_id' }
      );

    if (error) {
      console.log('[chat] add reaction error', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, reactions: previousReactions } : msg
        )
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
    if (isChatBlocked) {
      Alert.alert('Messaging unavailable', isBlockedByMe ? 'Unblock to send messages.' : 'You can\'t message this user.');
      return;
    }
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
        replyToId: replyingTo?.id ?? null,
        replyTo: replyingTo || undefined,
      },
    ]);
    setReplyingTo(null);

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
        reply_to_message_id: replyingTo?.id ?? null,
      })
        .select(MESSAGE_SELECT_FIELDS)
        .single();

      if (error || !data) {
        console.log('[chat] send voice error', error);
        Alert.alert('Voice message', 'Could not send. Please try again.');
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      } else {
        setMessages((prev) =>
          linkReplies(
            prev.map((msg) =>
              msg.id === tempId ? mapRowToMessage(data as MessageRow) : msg
            )
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
  }, [conversationId, isUploadingVoice, linkReplies, mapRowToMessage, recordingDuration, replyingTo, resetRecordingState, user?.id]);

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
      mediaTypes: getPickerMediaTypesAll(),
      quality: 0.85,
      videoMaxDuration: 30,
    });
    if (result.canceled) return;
    closeAttachmentSheet();
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    try {
      const fallbackName = asset.fileName ?? asset.uri.split('/').pop() ?? `camera-${Date.now()}`;
      const baseContentType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const normalized =
        asset.type === 'image'
          ? await normalizeHeicImage(asset, fallbackName)
          : { uri: asset.uri, fileName: fallbackName, contentType: baseContentType };

      if (viewOnceMode) {
        await sendEncryptedMediaAttachment({
          uri: normalized.uri,
          fileName: normalized.fileName,
          contentType: normalized.contentType,
          kind: asset.type === 'video' ? 'video' : 'image',
        });
      } else {
        const { publicUrl } = await uploadChatMedia({
          uri: normalized.uri,
          fileName: normalized.fileName,
          contentType: normalized.contentType,
        });
        if (asset.type === 'image') {
          await sendImageAttachment({ imageUrl: publicUrl });
        } else {
          await sendVideoAttachment({ videoUrl: publicUrl });
        }
      }
    } catch (error) {
      Alert.alert('Attachment', 'Unable to upload this file.');
    }
  }, [closeAttachmentSheet, sendEncryptedMediaAttachment, sendImageAttachment, sendVideoAttachment, uploadChatMedia, viewOnceMode]);

  const handleLibraryPress = useCallback(async () => {
    const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libraryStatus.granted) {
      Alert.alert('Photos access', 'Enable photo access to share media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: getPickerMediaTypesAll(),
      quality: 0.85,
    });
    if (result.canceled) return;
    closeAttachmentSheet();
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    try {
      const fallbackName = asset.fileName ?? asset.uri.split('/').pop() ?? `library-${Date.now()}`;
      const baseContentType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const normalized =
        asset.type === 'image'
          ? await normalizeHeicImage(asset, fallbackName)
          : { uri: asset.uri, fileName: fallbackName, contentType: baseContentType };

      if (viewOnceMode) {
        await sendEncryptedMediaAttachment({
          uri: normalized.uri,
          fileName: normalized.fileName,
          contentType: normalized.contentType,
          kind: asset.type === 'video' ? 'video' : 'image',
        });
      } else {
        const { publicUrl } = await uploadChatMedia({
          uri: normalized.uri,
          fileName: normalized.fileName,
          contentType: normalized.contentType,
        });
        if (asset.type === 'image') {
          await sendImageAttachment({ imageUrl: publicUrl });
        } else {
          await sendVideoAttachment({ videoUrl: publicUrl });
        }
      }
    } catch (error) {
      Alert.alert('Attachment', 'Unable to upload this file.');
    }
  }, [closeAttachmentSheet, sendEncryptedMediaAttachment, sendImageAttachment, sendVideoAttachment, uploadChatMedia, viewOnceMode]);

  const handleDocumentPress = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    closeAttachmentSheet();
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    try {
      const fileName = asset.name ?? asset.uri.split('/').pop() ?? `file-${Date.now()}`;
      const contentType = asset.mimeType ?? 'application/octet-stream';
      const { publicUrl } = await uploadChatMedia({ uri: asset.uri, fileName, contentType });
      const sizeLabel = formatFileSize(asset.size);
      const typeLabel = getFileTypeLabel(contentType, fileName);
      const labelParts = [fileName, sizeLabel, typeLabel].filter(Boolean);
      await sendAttachmentText(`${DOCUMENT_TEXT_PREFIX} ${labelParts.join(' | ')}\n${publicUrl}`);
    } catch (error) {
      Alert.alert('Attachment', 'Unable to upload this file.');
    }
  }, [closeAttachmentSheet, sendAttachmentText, uploadChatMedia]);

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

  const openEditHistory = useCallback(async (message: MessageType) => {
    if (!message.editedAt) return;
    setEditHistoryMessage(message);
    setEditHistoryVisible(true);
    setEditHistoryEntries([]);
    setEditHistoryLoading(true);
    const { data, error } = await supabase
      .from('message_edits')
      .select('id,message_id,editor_user_id,previous_text,created_at')
      .eq('message_id', message.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.log('[chat] edit history error', error);
      setEditHistoryEntries([]);
      setEditHistoryLoading(false);
      return;
    }
    setEditHistoryEntries((data || []) as MessageEditRow[]);
    setEditHistoryLoading(false);
  }, []);

  const closeEditHistory = useCallback(() => {
    setEditHistoryVisible(false);
    setEditHistoryMessage(null);
    setEditHistoryEntries([]);
  }, []);

  const markViewOnceSeen = useCallback(async (message: MessageType) => {
    if (!user?.id) return;
    if (message.senderId === user.id) return;
    if (!message.isViewOnce) return;
    const current = viewOnceStatusRef.current[message.id];
    if (current?.viewedByMe) return;
    setViewOnceStatus((prev) => ({
      ...prev,
      [message.id]: {
        viewedByMe: true,
        viewedByPeer: prev[message.id]?.viewedByPeer ?? false,
      },
    }));
    const { error } = await supabase
      .from('message_views')
      .upsert(
        {
          message_id: message.id,
          viewer_id: user.id,
        },
        { onConflict: 'message_id,viewer_id' }
      );
    if (error) {
      console.log('[chat] mark view-once error', error);
    }
  }, [user?.id]);

  const closeViewOnceMessage = useCallback(async () => {
    if (!viewOnceModalMessage) return;
    const message = viewOnceModalMessage;
    setViewOnceModalMessage(null);
    setViewOnceDecrypting(false);
    if (viewOnceMediaUri) {
      try {
        await FileSystem.deleteAsync(viewOnceMediaUri, { idempotent: true });
      } catch (error) {
        console.log('[chat] view-once cleanup error', error);
      }
    }
    setViewOnceMediaUri(null);
    await markViewOnceSeen(message);
  }, [markViewOnceSeen, viewOnceMediaUri, viewOnceModalMessage]);

  const openViewOnceMessage = useCallback(async (message: MessageType) => {
    if (!user?.id) return;
    if (!message.isViewOnce || !message.encryptedMedia) return;
    if (message.senderId === user.id) return;
    if (viewOnceStatusRef.current[message.id]?.viewedByMe) return;
    if (!message.encryptedMediaPath || !message.encryptedKeyReceiver || !message.encryptedKeyNonce || !message.encryptedMediaNonce) {
      Alert.alert('View once', 'Missing decryption info.');
      return;
    }
    setViewOnceModalMessage(message);
    setViewOnceDecrypting(true);

    try {
      const keypair = await ensureOwnKeypair();
      if (!keypair) {
        throw new Error('missing_keypair');
      }
      const senderPublicKey = await fetchPeerPublicKey();
      if (!senderPublicKey) {
        throw new Error('missing_sender_key');
      }
      const { data: signed, error: signedError } = await supabase
        .storage
        .from(CHAT_MEDIA_BUCKET)
        .createSignedUrl(message.encryptedMediaPath, 120);
      if (signedError || !signed?.signedUrl) {
        console.log('[view-once] signed url error', signedError);
        throw new Error('signed_url');
      }
      const res = await fetch(signed.signedUrl);
      const buf = await res.arrayBuffer();
      const cipherBytes = new Uint8Array(buf);
      const plaintext = await decryptMediaBytes({
        cipherBytes,
        mediaNonceB64: message.encryptedMediaNonce,
        keyNonceB64: message.encryptedKeyNonce,
        encryptedKeyB64: message.encryptedKeyReceiver,
        senderPublicKeyB64: senderPublicKey,
        receiverSecretKeyB64: keypair.secretKeyB64,
      });
      cipherBytes.fill(0);
      if (!plaintext) {
        throw new Error('decrypt_failed');
      }

      const isVideo = message.type === 'video' || (message.encryptedMediaMime || '').includes('video');
      const ext = isVideo ? 'mp4' : 'jpg';
      const tempPath = `${FileSystem.cacheDirectory ?? ''}viewonce-${message.id}.${ext}`;
      const base64 = encodeBase64(plaintext);
      plaintext.fill(0);
      await FileSystem.writeAsStringAsync(tempPath, base64, {
        encoding: FileSystem.EncodingType?.Base64 ?? 'base64',
      });

      setViewOnceMediaUri(tempPath);
    } catch (error) {
      console.log('[view-once] open error', error);
      Alert.alert('View once', 'Unable to open media.');
      setViewOnceModalMessage(null);
      setViewOnceMediaUri(null);
    } finally {
      setViewOnceDecrypting(false);
    }
  }, [ensureOwnKeypair, fetchPeerPublicKey, user?.id]);

  const openMessageActions = useCallback((message: MessageType) => {
    setActionMessageId(message.id);
    setMessageActionsVisible(true);
    setShowReactions(null);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const triggerActionHaptic = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    Haptics.impactAsync(style).catch(() => {});
  }, []);

  const closeMessageActions = useCallback(() => {
    setMessageActionsVisible(false);
    setActionMessageId(null);
  }, []);

  const handleLongPress = useCallback((messageId: string) => {
    const target = messagesRef.current.find((msg) => msg.id === messageId);
    if (!target) return;
    setShowReactions((prev) => (prev === messageId ? null : messageId));
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const renderTypingIndicator = () => {
    if (!isTyping || isChatBlocked) return null;

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
      setVideoViewerUrl(url);
      return;
    }
    const isPdf = typeLabel === 'pdf' || ext === 'pdf';
    const isText = typeLabel === 'txt' || ext === 'txt' || ext === 'text';
    const previewUrl = isPdf || isText
      ? url
      : `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
    setDocumentViewerUrl(previewUrl);
  }, [setImageViewerUrl, setVideoViewerUrl]);

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

  const dismissHeaderHint = useCallback(() => {
    headerHintDismissedRef.current = true;
    void AsyncStorage.setItem(HEADER_HINT_STORAGE_KEY, '1');
    if (!showHeaderHint) return;
    Animated.timing(headerHintOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowHeaderHint(false);
    });
  }, [headerHintOpacity, showHeaderHint]);

  const handleHeaderPress = useCallback(() => {
    if (!conversationId || isChatBlocked) return;
    dismissHeaderHint();
    if (peerHasMoment) {
      setMomentViewerUserId(conversationId);
      setMomentViewerVisible(true);
      return;
    }
    handleViewProfile();
  }, [conversationId, dismissHeaderHint, handleViewProfile, isChatBlocked, peerHasMoment]);

  const handleCloseMomentViewer = useCallback(() => {
    setMomentViewerVisible(false);
    setMomentViewerUserId(null);
  }, []);

  const hideMessageForMe = useCallback(async (message: MessageType) => {
    if (!user?.id || !conversationId) return;
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

    const { error } = await supabase.from('message_hides').insert({
      message_id: message.id,
      user_id: user.id,
      peer_id: conversationId,
    });

    if (error) {
      console.log('[chat] hide message error', error);
      Alert.alert('Hide message', 'Unable to hide this message right now.');
      await fetchHiddenMessages();
      await fetchMessages();
    }
  }, [closeMessageActions, conversationId, fetchHiddenMessages, fetchMessages, updateHiddenMessageIds, user?.id]);

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
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === message.id
          ? {
              ...msg,
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
            }
          : msg
      )
    );

    const { error } = await supabase
      .from('messages')
      .update({
        deleted_for_all: true,
        deleted_at: deletedAt.toISOString(),
        deleted_by: user.id,
      })
      .eq('id', message.id)
      .eq('sender_id', user.id);

    if (error) {
      console.log('[chat] delete message error', error);
      Alert.alert('Delete message', 'Unable to delete this message for everyone.');
      await fetchMessages();
    }
  }, [closeMessageActions, fetchMessages, user?.id]);

  const confirmDeleteForEveryone = useCallback((message: MessageType) => {
    closeMessageActions();
    Alert.alert(
      'Delete for everyone?',
      'This message will be replaced with \"Message deleted\" for both of you.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMessageForEveryone(message) },
      ]
    );
  }, [closeMessageActions, deleteMessageForEveryone]);

  const pinMessage = useCallback(async (message: MessageType) => {
    if (!user?.id || !conversationId) return;
    if (message.id.startsWith('temp-')) return;
    const nextSet = new Set(pinnedMessageIdsRef.current);
    nextSet.add(message.id);
    updatePinnedMessageIds(Array.from(nextSet));
    const { error } = await supabase.from('message_pins').insert({
      message_id: message.id,
      user_id: user.id,
      peer_id: conversationId,
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
    const nextSet = new Set(pinnedMessageIdsRef.current);
    nextSet.delete(message.id);
    updatePinnedMessageIds(Array.from(nextSet));
    const { error } = await supabase
      .from('message_pins')
      .delete()
      .eq('message_id', message.id)
      .eq('user_id', user.id);
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

  const togglePinnedBanner = useCallback(() => {
    if (pinnedMessageCount === 0) return;
    setPinnedBannerExpanded((prev) => !prev);
  }, [pinnedMessageCount]);

  const handlePinnedJump = useCallback(() => {
    if (!primaryPinnedMessage) return;
    jumpToMessage(primaryPinnedMessage.id);
    setPinnedBannerExpanded(false);
  }, [jumpToMessage, primaryPinnedMessage]);

  const handlePinnedUnpin = useCallback(() => {
    if (!primaryPinnedMessage) return;
    void unpinMessage(primaryPinnedMessage);
    setPinnedBannerExpanded(false);
  }, [primaryPinnedMessage, unpinMessage]);

  const handlePinnedSeeAll = useCallback(() => {
    openPinnedSheet();
    setPinnedBannerExpanded(false);
  }, [openPinnedSheet]);

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
      .select('user_id,full_name,avatar_url')
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
              name: row.full_name || 'Unknown',
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
      const isMyMessage = item.senderId === (user?.id || '');
      const prevMessage = messagesRef.current[index - 1];
      const prevSenderId = prevMessage?.senderId;
      const showAvatar = !isMyMessage && !isChatBlocked && (index === 0 || prevSenderId !== item.senderId);
      const isPlaying = playingVoiceId === item.id;
      const isReactionOpen = showReactions === item.id;
      const isFocused = focusedMessageId === item.id;
      const isActionPinned = pinnedMessageIds.includes(item.id);
      const timeLabel = formatTime(item.timestamp);
      const showDateSeparator = !prevMessage || !isSameDay(prevMessage.timestamp, item.timestamp);
      const imageSize = item.type === 'image' && item.imageUrl ? imageSizes[item.imageUrl] : undefined;
      const videoSize = item.type === 'video' && item.videoUrl ? videoSizes[item.videoUrl] : undefined;
      const now = item.type === 'location' ? nowTick : null;
      const viewOnceState = viewOnceStatus[item.id];
      const viewOnceViewedByMe = viewOnceState?.viewedByMe ?? false;
      const viewOnceViewedByPeer = viewOnceState?.viewedByPeer ?? false;

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
            isPlaying={isPlaying}
            isReactionOpen={isReactionOpen}
            isFocused={isFocused}
            focusToken={isFocused ? focusTick : 0}
            timeLabel={timeLabel}
            userAvatar={userAvatar}
            currentUserId={user?.id || ''}
            peerName={userName}
            imageSize={imageSize}
            videoSize={videoSize}
            theme={theme}
            isDark={isDark}
            styles={styles}
            onLongPress={handleLongPress}
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
            onViewImage={setImageViewerUrl}
            onViewVideo={setVideoViewerUrl}
            onVideoSize={handleVideoSize}
            onOpenDocument={handleOpenDocument}
            onOpenLocation={openLocationViewer}
            onStopLiveShare={stopLiveSharing}
            onOpenViewOnce={openViewOnceMessage}
            viewOnceViewedByMe={viewOnceViewedByMe}
            viewOnceViewedByPeer={viewOnceViewedByPeer}
            highlightQuery={chatSearchQuery}
            onHighlightPress={chatSearchQuery.trim() ? jumpToNextMatch : undefined}
            now={now}
          />
        </View>
      );
    },
    [
      focusedMessageId,
      focusTick,
      playingVoiceId,
      showReactions,
      user?.id,
      userAvatar,
      userName,
      theme,
      isDark,
      imageSizes,
      videoSizes,
      isChatBlocked,
      handleLongPress,
      toggleVoicePlayback,
      replyToMessage,
      startEditMessage,
      addReaction,
      isSameDay,
      formatDayLabel,
      formatTime,
      chatSearchQuery,
      chatSearchVisible,
      handleVideoSize,
      handleOpenDocument,
      openLocationViewer,
      stopLiveSharing,
      viewOnceStatus,
      openViewOnceMessage,
      handleCopyMessage,
      handleToggleMessagePin,
      handleDeleteAction,
      openReactionSheet,
      openEditHistory,
      jumpToMessage,
      jumpToNextMatch,
      nowTick,
      focusMessage,
      pinnedMessageIds,
    ]
  );

  const openReportModal = useCallback(() => {
    setReportModalVisible(true);
  }, []);

  const closeReportModal = useCallback(() => {
    setReportModalVisible(false);
    setReportReasonId(null);
    setReportDetails('');
    setReportSubmitting(false);
  }, []);

  const submitReport = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    if (!reportReasonId) {
      Alert.alert('Report user', 'Select a reason to continue.');
      return;
    }
    setReportSubmitting(true);
    const reasonLabel =
      REPORT_REASONS.find((reason) => reason.id === reportReasonId)?.label ?? reportReasonId;
    const details = reportDetails.trim();
    const reason = details ? `${reasonLabel}: ${details}` : reasonLabel;

    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_id: conversationId,
      reason,
    });

    if (error) {
      console.log('[chat] report user error', error);
      Alert.alert('Report user', 'Unable to send this report right now.');
      setReportSubmitting(false);
      return;
    }

    setReportSubmitting(false);
    closeReportModal();
    Alert.alert('Report sent', 'Thanks for letting us know.');
  }, [closeReportModal, conversationId, reportDetails, reportReasonId, user?.id]);

  const blockUser = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    const { error } = await supabase
      .from('blocks')
      .insert({ blocker_id: user.id, blocked_id: conversationId });

    if (error) {
      if (error.code === '23505') {
        Alert.alert('Blocked', 'This user is already blocked.');
        router.replace('/(tabs)/chat');
        return;
      }
      console.log('[chat] block user error', error);
      Alert.alert('Block user', 'Unable to block this user right now.');
      return;
    }

    setBlockStatus(BLOCKED_BY_ME);
    Alert.alert('Blocked', 'This user has been blocked.');
    router.replace('/(tabs)/chat');
  }, [conversationId, user?.id]);

  const unblockUser = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', conversationId);
    if (error) {
      console.log('[chat] unblock user error', error);
      Alert.alert('Unblock user', 'Unable to unblock this user right now.');
      return;
    }
    setBlockStatus(null);
    Alert.alert('Unblocked', 'You can message each other again.');
  }, [conversationId, user?.id]);

  const confirmUnblockUser = useCallback(() => {
    Alert.alert(
      'Unblock user?',
      'You will be able to message each other again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', style: 'default', onPress: () => void unblockUser() },
      ]
    );
  }, [unblockUser]);

  const handleCloseHeaderMenu = useCallback(() => {
    setHeaderMenuVisible(false);
  }, []);

  const closeChatSearch = useCallback(() => {
    setChatSearchVisible(false);
  }, []);

  const closeMediaHub = useCallback(() => {
    setMediaHubVisible(false);
  }, []);

  const handleFilterMedia = useCallback(() => {
    setMediaTab('media');
    setMediaHubVisible(true);
  }, []);

  const handleSearchInChat = useCallback(() => {
    setChatSearchQuery('');
    setChatSearchVisible(true);
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsChatMuted((prev) => !prev);
  }, []);

  const handleTogglePin = useCallback(() => {
    setIsChatPinned((prev) => !prev);
  }, []);

  const clearChatForMe = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    setClearChatLoading(true);
    const currentIds = messagesRef.current
      .map((msg) => msg.id)
      .filter((id) => !id.startsWith('temp-'));
    const hiddenSet = hiddenMessageIdsRef.current;
    const idsToHide = currentIds.filter((id) => !hiddenSet.has(id));
    if (idsToHide.length === 0) {
      setMessages([]);
      setHasMore(false);
      setOldestTimestamp(null);
      setClearChatLoading(false);
      return;
    }
    const nextSet = new Set(hiddenSet);
    idsToHide.forEach((id) => nextSet.add(id));
    updateHiddenMessageIds(Array.from(nextSet));
    setMessages([]);
    setHasMore(false);
    setOldestTimestamp(null);

    try {
      const batchSize = 200;
      for (let i = 0; i < idsToHide.length; i += batchSize) {
        const slice = idsToHide.slice(i, i + batchSize);
        const rows = slice.map((id) => ({
          message_id: id,
          user_id: user.id,
          peer_id: conversationId,
        }));
        const { error } = await supabase.from('message_hides').insert(rows);
        if (error) throw error;
      }
    } catch (error) {
      console.log('[chat] clear chat error', error);
      Alert.alert('Clear chat', 'Unable to clear this chat right now.');
      await fetchHiddenMessages();
      await fetchMessages();
    } finally {
      setClearChatLoading(false);
    }
  }, [conversationId, fetchHiddenMessages, fetchMessages, updateHiddenMessageIds, user?.id]);

  const handleClearChat = useCallback(() => {
    Alert.alert(
      'Clear chat?',
      'This removes the chat history for you only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => void clearChatForMe(),
        },
      ]
    );
  }, [clearChatForMe]);

  const handleOpenMediaItem = useCallback(
    (item: { type: 'image' | 'video'; url?: string | null }) => {
      if (!item.url) return;
      closeMediaHub();
      if (item.type === 'image') {
        setImageViewerUrl(item.url);
      } else {
        setVideoViewerUrl(item.url);
      }
    },
    [closeMediaHub]
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

  const handleBlockUser = useCallback(() => {
    if (!conversationId) return;
    Alert.alert(
      'Block user',
      'They will no longer be able to message you and you will no longer see them.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => void blockUser() },
      ]
    );
  }, [blockUser, conversationId]);

  const handleReportUser = useCallback(() => {
    if (!conversationId) return;
    openReportModal();
  }, [conversationId, openReportModal]);

  const handleHeaderLongPress = useCallback(() => {
    dismissHeaderHint();
    Haptics.selectionAsync().catch(() => {});
    setHeaderMenuVisible(true);
  }, [dismissHeaderHint]);

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

  const MenuCard = ({
    title,
    icon,
    onPress,
    wide,
    destructive,
    badgeLabel,
  }: {
    title: string;
    icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
    onPress: () => void;
    wide?: boolean;
    destructive?: boolean;
    badgeLabel?: string | null;
  }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const colors: [string, string] = destructive
      ? ['#fecaca', '#fee2e2']
      : [
          withAlpha(theme.tint, isDark ? 0.32 : 0.2),
          withAlpha(theme.accent, isDark ? 0.28 : 0.18),
        ];

    const handlePressIn = () => {
      Animated.timing(scale, {
        toValue: 0.97,
        duration: 90,
        useNativeDriver: true,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(scale, {
        toValue: 1,
        speed: 20,
        bounciness: 6,
        useNativeDriver: true,
      }).start();
    };

    return (
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Animated.View
          style={[
            styles.headerMenuCard,
            wide && styles.headerMenuCardWide,
            destructive && styles.headerMenuCardDestructive,
            { transform: [{ scale }] },
          ]}
        >
          <LinearGradient colors={colors} style={styles.headerMenuIconWrap}>
            <MaterialCommunityIcons
              name={icon}
              size={18}
              color={destructive ? '#b91c1c' : theme.tint}
            />
          </LinearGradient>
          <View style={styles.headerMenuCardTextRow}>
            <Text
              style={[
                styles.headerMenuCardText,
                destructive && styles.headerMenuCardTextDestructive,
              ]}
              numberOfLines={2}
            >
              {title}
            </Text>
            {badgeLabel ? (
              <View style={styles.headerMenuBadge}>
                <Text style={styles.headerMenuBadgeText}>{badgeLabel}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </Pressable>
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
                  <Image
                    source={isChatBlocked ? BLOCKED_AVATAR_SOURCE : { uri: userAvatar }}
                    style={styles.headerAvatar}
                  />
                </View>
              </LinearGradient>
            ) : (
              <View style={styles.avatarRing}>
                <View style={styles.avatarInner}>
                  <Image
                    source={isChatBlocked ? BLOCKED_AVATAR_SOURCE : { uri: userAvatar }}
                    style={styles.headerAvatar}
                  />
                </View>
              </View>
            )}
            {!isChatBlocked && peerOnline && (
              <View style={styles.onlineIndicator} />
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{userName}</Text>
            <Text style={styles.headerStatus}>
              {isChatBlocked
                ? isBlockedByMe
                  ? 'Blocked'
                  : 'Unavailable'
                : peerOnline
                ? 'Active now'
                : peerLastSeen
                ? `Last seen ${formatLastSeen(peerLastSeen)}`
                : 'Last seen recently'}
            </Text>
          </View>
        </TouchableOpacity>

        
      </View>
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
          <Text style={styles.headerHintText}>Long-press header for options</Text>
        </Animated.View>
      ) : null}
      <Modal
        transparent
        visible={headerMenuVisible}
        animationType="fade"
        onRequestClose={handleCloseHeaderMenu}
      >
        <Pressable style={styles.headerMenuBackdrop} onPress={handleCloseHeaderMenu} />
        <View style={styles.headerMenuSheet}>
          <BlurView
            intensity={32}
            tint={isDark ? 'dark' : 'light'}
            style={styles.headerMenuBlur}
          />
          <View style={styles.headerMenuContent}>
            <Text style={styles.headerMenuTitle}>Chat options</Text>
            <Text style={styles.headerMenuSectionLabel}>Quick</Text>
            <View style={styles.headerMenuGrid}>
              <MenuCard
                title="View profile"
                icon="account-outline"
                onPress={() => {
                  handleCloseHeaderMenu();
                  handleViewProfile();
                }}
              />
              <MenuCard
                title="Search in chat"
                icon="magnify"
                onPress={() => {
                  handleCloseHeaderMenu();
                  handleSearchInChat();
                }}
              />
              <MenuCard
                title="Media, links & docs"
                icon="image-multiple-outline"
                wide
                onPress={() => {
                  handleCloseHeaderMenu();
                  handleFilterMedia();
                }}
              />
            </View>
            <Text style={styles.headerMenuSectionLabel}>Controls</Text>
            <View style={styles.headerMenuGrid}>
              <MenuCard
                title={isChatMuted ? 'Unmute chat' : 'Mute chat'}
                icon={isChatMuted ? 'volume-high' : 'volume-off'}
                badgeLabel={isChatMuted ? 'On' : null}
                onPress={() => {
                  handleCloseHeaderMenu();
                  handleToggleMute();
                }}
              />
              <MenuCard
                title={isChatPinned ? 'Unpin chat' : 'Pin chat'}
                icon={isChatPinned ? 'pin-off-outline' : 'pin-outline'}
                badgeLabel={isChatPinned ? 'On' : null}
                onPress={() => {
                  handleCloseHeaderMenu();
                  handleTogglePin();
                }}
              />
            </View>
            <Text style={styles.headerMenuSectionLabel}>Safety</Text>
            <View style={styles.headerMenuGrid}>
              <MenuCard
                title={clearChatLoading ? 'Clearing...' : 'Clear chat'}
                icon="trash-can-outline"
                destructive
                onPress={() => {
                  if (clearChatLoading) return;
                  handleCloseHeaderMenu();
                  handleClearChat();
                }}
                badgeLabel={clearChatLoading ? 'Working' : null}
              />
              <MenuCard
                title={isBlockedByMe ? 'Unblock user' : 'Block user'}
                icon="block-helper"
                destructive
                onPress={() => {
                  handleCloseHeaderMenu();
                  if (isBlockedByMe) {
                    confirmUnblockUser();
                  } else {
                    handleBlockUser();
                  }
                }}
              />
              <MenuCard
                title="Report user"
                icon="alert-octagon-outline"
                destructive
                onPress={() => {
                  handleCloseHeaderMenu();
                  handleReportUser();
                }}
              />
            </View>
          </View>
          <TouchableOpacity
            style={[styles.headerMenuItem, styles.headerMenuCancel]}
            onPress={handleCloseHeaderMenu}
          >
            <Text style={styles.headerMenuCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
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
        <Pressable style={styles.reactionSheetBackdrop} onPress={closeReactionSheet} />
        <View style={styles.reactionSheet}>
          <BlurView
            intensity={32}
            tint={isDark ? 'dark' : 'light'}
            style={styles.reactionSheetBlur}
          />
          <View style={styles.reactionSheetHeader}>
            <View>
              <Text style={styles.reactionSheetTitle}>Reactions</Text>
              <Text style={styles.reactionSheetCount}>
                {reactionSheetMessage?.reactions.length ?? 0} total
              </Text>
            </View>
            <TouchableOpacity onPress={closeReactionSheet} style={styles.reactionSheetClose}>
              <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.reactionSheetPills}
          >
            <Pressable
              style={[
                styles.reactionSheetPill,
                reactionSheetEmoji === null && styles.reactionSheetPillActive,
              ]}
              onPress={() => setReactionSheetEmoji(null)}
            >
              <Text
                style={[
                  styles.reactionSheetPillText,
                  reactionSheetEmoji === null && styles.reactionSheetPillTextActive,
                ]}
              >
                All
              </Text>
            </Pressable>
            {reactionSummary.map((summary) => (
              <Pressable
                key={summary.emoji}
                style={[
                  styles.reactionSheetPill,
                  reactionSheetEmoji === summary.emoji && styles.reactionSheetPillActive,
                ]}
                onPress={() => setReactionSheetEmoji(summary.emoji)}
              >
                <Text style={styles.reactionSheetPillEmoji}>{summary.emoji}</Text>
                <Text
                  style={[
                    styles.reactionSheetPillText,
                    reactionSheetEmoji === summary.emoji && styles.reactionSheetPillTextActive,
                  ]}
                >
                  {summary.count}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView contentContainerStyle={styles.reactionSheetList}>
            {reactionSheetMessage && reactionSheetList.length === 0 ? (
              <Text style={styles.reactionSheetEmpty}>No reactions yet.</Text>
            ) : (
              reactionSheetList.map((reaction) => {
                const profileEntry = reactionProfiles[reaction.userId];
                const label =
                  reaction.userId === user?.id
                    ? 'You'
                    : profileEntry?.name || 'Unknown';
                const avatarSource =
                  reaction.userId === user?.id
                    ? profile?.avatar_url
                    : profileEntry?.avatar;
                return (
                  <View key={`${reaction.userId}-${reaction.emoji}`} style={styles.reactionSheetRow}>
                    <Image
                      source={avatarSource ? { uri: avatarSource } : BLOCKED_AVATAR_SOURCE}
                      style={styles.reactionSheetAvatar}
                    />
                    <Text style={styles.reactionSheetName}>{label}</Text>
                    <Text style={styles.reactionSheetEmoji}>{reaction.emoji}</Text>
                  </View>
                );
              })
            )}
            {reactionProfilesLoading ? (
              <Text style={styles.reactionSheetHint}>Loading profiles…</Text>
            ) : null}
          </ScrollView>
        </View>
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
                    onPress={() => {
                      closeChatSearch();
                      jumpToMessage(result.id);
                    }}
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
                          <Image source={{ uri: item.url }} style={styles.mediaTileImage} />
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

      <Modal
        transparent
        visible={messageActionsVisible}
        animationType="fade"
        onRequestClose={closeMessageActions}
      >
        <Pressable style={styles.messageActionBackdrop} onPress={closeMessageActions} />
        <View style={styles.messageActionSheet}>
          <BlurView
            intensity={34}
            tint={isDark ? 'dark' : 'light'}
            style={styles.messageActionBlur}
          />
          <View style={styles.messageActionContent}>
            <Text style={styles.messageActionTitle}>Message options</Text>
            {actionMessage ? (
              <>
                <TouchableOpacity
                  style={styles.messageActionCard}
                  onPress={() => {
                    triggerActionHaptic(Haptics.ImpactFeedbackStyle.Light);
                    closeMessageActions();
                    replyToMessage(actionMessage);
                  }}
                >
                  <View style={styles.messageActionIcon}>
                    <MaterialCommunityIcons name="reply" size={22} color={theme.text} />
                  </View>
                  <View style={styles.messageActionText}>
                    <Text style={styles.messageActionLabel}>Reply</Text>
                    <Text style={styles.messageActionHint}>Respond to this message.</Text>
                  </View>
                </TouchableOpacity>

                {canEditAction ? (
                  <TouchableOpacity
                    style={styles.messageActionCard}
                    onPress={() => {
                      triggerActionHaptic(Haptics.ImpactFeedbackStyle.Medium);
                      closeMessageActions();
                      startEditMessage(actionMessage);
                    }}
                  >
                    <View style={styles.messageActionIcon}>
                      <MaterialCommunityIcons name="pencil-outline" size={22} color={theme.text} />
                    </View>
                    <View style={styles.messageActionText}>
                      <Text style={styles.messageActionLabel}>Edit message</Text>
                      <Text style={styles.messageActionHint}>Update the text in place.</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                {!actionMessage.isViewOnce ? (
                  <TouchableOpacity
                    style={styles.messageActionCard}
                    onPress={() => {
                      triggerActionHaptic(Haptics.ImpactFeedbackStyle.Light);
                      closeMessageActions();
                      void handleCopyMessage(actionMessage);
                    }}
                  >
                    <View style={styles.messageActionIcon}>
                      <MaterialCommunityIcons name="content-copy" size={22} color={theme.text} />
                    </View>
                    <View style={styles.messageActionText}>
                      <Text style={styles.messageActionLabel}>Copy</Text>
                      <Text style={styles.messageActionHint}>Copy to clipboard.</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                {actionMessage.editedAt ? (
                  <TouchableOpacity
                    style={styles.messageActionCard}
                    onPress={() => {
                      triggerActionHaptic(Haptics.ImpactFeedbackStyle.Light);
                      closeMessageActions();
                      void openEditHistory(actionMessage);
                    }}
                  >
                    <View style={styles.messageActionIcon}>
                      <MaterialCommunityIcons name="history" size={22} color={theme.text} />
                    </View>
                    <View style={styles.messageActionText}>
                      <Text style={styles.messageActionLabel}>View edit history</Text>
                      <Text style={styles.messageActionHint}>See previous versions.</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={styles.messageActionCard}
                  onPress={() => {
                    triggerActionHaptic(Haptics.ImpactFeedbackStyle.Medium);
                    closeMessageActions();
                    if (isActionPinned) {
                      void unpinMessage(actionMessage);
                    } else {
                      void pinMessage(actionMessage);
                    }
                  }}
                >
                  <View style={styles.messageActionIcon}>
                    <MaterialCommunityIcons name="pin-outline" size={22} color={theme.text} />
                  </View>
                  <View style={styles.messageActionText}>
                    <Text style={styles.messageActionLabel}>
                      {isActionPinned ? 'Unpin message' : 'Pin message'}
                    </Text>
                    <Text style={styles.messageActionHint}>
                      {isActionPinned ? 'Remove this pin.' : 'Keep it at the top for you.'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.messageActionCard}
                  onPress={() => {
                    triggerActionHaptic(Haptics.ImpactFeedbackStyle.Light);
                    closeMessageActions();
                    handleToggleMute();
                  }}
                >
                  <View style={styles.messageActionIcon}>
                    <MaterialCommunityIcons
                      name={isChatMuted ? 'volume-high' : 'volume-off'}
                      size={22}
                      color={theme.text}
                    />
                  </View>
                  <View style={styles.messageActionText}>
                    <Text style={styles.messageActionLabel}>
                      {isChatMuted ? 'Unmute chat' : 'Mute chat'}
                    </Text>
                    <Text style={styles.messageActionHint}>Silence notifications for this chat.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.messageActionCard, styles.messageActionDanger]}
                  onPress={() => {
                    triggerActionHaptic(Haptics.ImpactFeedbackStyle.Heavy);
                    closeMessageActions();
                    handleDeleteAction(actionMessage);
                  }}
                >
                  <View style={[styles.messageActionIcon, styles.messageActionIconDanger]}>
                    <MaterialCommunityIcons name="trash-can-outline" size={22} color={Colors.light.background} />
                  </View>
                  <View style={styles.messageActionText}>
                    <Text style={[styles.messageActionLabel, styles.messageActionLabelDanger]}>
                      Delete
                    </Text>
                    <Text style={styles.messageActionHint}>Remove this message.</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.messageActionCancel}
            onPress={closeMessageActions}
          >
            <Text style={styles.messageActionCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

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
            <Text style={styles.reportTitle}>Report {userName}</Text>
            <Text style={styles.reportSubtitle}>
              Help us understand what happened.
            </Text>
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
                <Text style={styles.reportSubmitText}>Send report</Text>
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
            <VideoViewer
              url={videoViewerUrl}
              visible={Boolean(videoViewerUrl)}
              styles={styles}
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
            style={styles.imageViewerClose}
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
                showsPointsOfInterest
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
            showsPointsOfInterest
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
          onClose={handleCloseMomentViewer}
        />
      ) : null}

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
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            const offset = Math.max(0, averageItemLength * index);
            flatListRef.current?.scrollToOffset({ offset, animated: true });
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
            }, 250);
          }}
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

        {editingMessage && (
          <View style={styles.editPreview}>
            <View style={styles.editPreviewContent}>
              <View style={styles.editPreviewBadge}>
                <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.tint} />
              </View>
              <Text style={styles.editPreviewText} numberOfLines={1}>
                Editing: {editingMessage.text || 'Message'}
              </Text>
            </View>
            <TouchableOpacity onPress={cancelEdit} style={styles.cancelEditButton}>
              <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {isChatBlocked ? (
          <View style={styles.blockedInput}>
            <MaterialCommunityIcons name="block-helper" size={16} color={theme.textMuted} />
            <Text style={styles.blockedInputText}>
              {isBlockedByMe ? 'You blocked this user.' : 'Messaging is unavailable.'}
            </Text>
            {isBlockedByMe ? (
              <TouchableOpacity style={styles.blockedInputAction} onPress={confirmUnblockUser}>
                <Text style={styles.blockedInputActionText}>Unblock</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <>
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
                  onPress={() => {
                    if (showImagePicker) {
                      closeAttachmentSheet();
                    }
                    setShowMoodStickers((prev) => !prev);
                  }}
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
                    style={[
                      styles.sendButtonActive,
                    ]}
                    onPress={sendMessage}
                  >
                    <MaterialCommunityIcons name="send" size={20} color={Colors.light.background} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        )}

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
      flexShrink: 1,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
    headerMenuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withAlpha(Colors.dark.background, 0.55),
    },
    headerMenuSheet: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.background, isDark ? 0.78 : 0.94),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      overflow: 'hidden',
      shadowColor: Colors.dark.background,
      shadowOpacity: 0.16,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    headerMenuBlur: {
      ...StyleSheet.absoluteFillObject,
    },
    headerMenuContent: {
      paddingTop: 12,
      paddingBottom: 8,
    },
    headerMenuTitle: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      paddingHorizontal: 12,
      paddingBottom: 6,
    },
    headerMenuSectionLabel: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      paddingHorizontal: 12,
      paddingBottom: 6,
    },
    headerMenuGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      paddingHorizontal: 12,
      paddingBottom: 10,
    },
    headerMenuCard: {
      width: '48%',
      minHeight: 60,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      shadowColor: Colors.dark.background,
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    headerMenuCardWide: {
      width: '100%',
    },
    headerMenuCardDestructive: {
      backgroundColor: withAlpha('#ef4444', isDark ? 0.12 : 0.08),
      borderColor: withAlpha('#ef4444', isDark ? 0.35 : 0.2),
    },
    headerMenuIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.22 : 0.14),
    },
    headerMenuCardTextRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    headerMenuCardText: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
      flexShrink: 1,
    },
    headerMenuCardTextDestructive: {
      color: '#ef4444',
    },
    headerMenuBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.32 : 0.2),
    },
    headerMenuBadgeText: {
      fontSize: 10,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.2,
    },
    headerMenuDivider: {
      height: 1,
      marginHorizontal: 12,
      marginVertical: 4,
      backgroundColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
    },
    headerMenuItem: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 12,
    },
    headerMenuCancel: {
      marginTop: 4,
      backgroundColor: theme.backgroundSubtle,
    },
    headerMenuCancelText: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
      textAlign: 'center',
    },
    searchBackdrop: {
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.92)',
    },
    viewOnceFullScreen: {
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
    daySeparator: {
      alignSelf: 'center',
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      marginBottom: 12,
      marginTop: 2,
    },
    daySeparatorText: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.2,
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
      ...StyleSheet.absoluteFillObject,
    },
    messageRowSpotlightTint: {
      ...StyleSheet.absoluteFillObject,
    },
    messageRowVignetteVertical: {
      ...StyleSheet.absoluteFillObject,
    },
    messageRowVignetteHorizontal: {
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
    },
    messageFocusSpotlightTint: {
      ...StyleSheet.absoluteFillObject,
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
    deletedMessageBubble: {
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.6 : 0.85),
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
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
      color: withAlpha(Colors.light.background, 0.8),
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
      color: withAlpha(Colors.light.background, 0.75),
    },
    messageMetaEditedTheir: {
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
      flexDirection: 'row',
      alignItems: 'center',
      position: 'absolute',
      bottom: -14,
      gap: 6,
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
    reactionSummaryLeft: {
      left: 8,
    },
    reactionSummaryRight: {
      right: 8,
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
    messageActionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      rowGap: 6,
      marginTop: 6,
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
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      gap: 6,
    },
    messageActionPillDanger: {
      backgroundColor: withAlpha(theme.danger, 0.12),
      borderColor: withAlpha(theme.danger, 0.3),
    },
    messageActionPillLabel: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
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
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.background,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
      gap: 12,
    },
    blockedInput: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: theme.background,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
    },
    blockedInputText: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    blockedInputAction: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    blockedInputActionText: {
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: Colors.light.background,
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
    // Location Messages
    locationBubble: {
      padding: 10,
      width: LOCATION_PREVIEW_WIDTH + 20,
    },
    locationMessageContainer: {
      gap: 10,
    },
    locationMapImage: {
      width: LOCATION_PREVIEW_WIDTH,
      height: LOCATION_PREVIEW_HEIGHT,
      borderRadius: 12,
      backgroundColor: theme.backgroundSubtle,
    },
    locationMapPlaceholder: {
      width: LOCATION_PREVIEW_WIDTH,
      height: LOCATION_PREVIEW_HEIGHT,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      backgroundColor: theme.backgroundSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
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
      marginLeft: 36,
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
    documentViewer: {
      width: screenWidth,
      height: screenHeight * 0.8,
      backgroundColor: Colors.light.background,
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
      ...StyleSheet.absoluteFillObject,
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
      ...StyleSheet.absoluteFillObject,
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
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 14,
      marginBottom: 8,
      borderWidth: 1,
    },
    replyChipMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.14),
      borderColor: withAlpha(Colors.light.background, 0.3),
    },
    replyChipTheir: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    },
    replyChipLine: {
      width: 2,
      height: 28,
      borderRadius: 2,
    },
    replyChipLineMy: {
      backgroundColor: withAlpha(Colors.light.background, 0.7),
    },
    replyChipLineTheir: {
      backgroundColor: withAlpha(theme.text, 0.35),
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
      backgroundColor: withAlpha(Colors.light.background, 0.2),
    },
    replyChipIconWrapTheir: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
    },
    replyChipLabel: {
      flexShrink: 1,
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    replyChipLabelMy: {
      color: Colors.light.background,
    },
    replyChipTime: {
      marginLeft: 'auto',
      fontSize: 10,
      fontFamily: 'Manrope_500Medium',
      color: theme.textMuted,
    },
    replyChipTimeMy: {
      color: withAlpha(Colors.light.background, 0.7),
    },
    replyChipPreview: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
    replyChipPreviewMy: {
      color: withAlpha(Colors.light.background, 0.85),
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
    viewOnceAttachmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.08 : 0.06),
    },
    viewOnceAttachmentRowActive: {
      borderColor: withAlpha(theme.tint, 0.4),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
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
      backgroundColor: theme.backgroundSubtle,
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
      backgroundColor: theme.backgroundSubtle,
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
  });




