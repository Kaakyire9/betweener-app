import type * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export const ATTACHMENT_SHEET_MIN_HEIGHT = 300;
export const ATTACHMENT_SHEET_MAX_HEIGHT = 420;
export const ATTACHMENT_SHEET_SCREEN_RATIO = 0.46;
export const CHAT_MEDIA_BUCKET = 'chat-media';
export const LOCATION_TEXT_PREFIX = '\u{1F4CD}';
export const LOCATION_LIVE_PREFIX = 'LIVE:';
export const CHAT_BUBBLE_TAIL_PATH =
  'M1.2 2.4 C3.6 2.1 6.9 3.1 9.6 5.1 C12.1 6.9 13.7 9.3 14.2 12.2 C11.4 11.3 8.5 11.8 5.3 13.7 C2.9 12.6 1.4 10.6 1.1 7.9 Z';
export const DATE_PLAN_TEXT_PREFIX = 'date_plan::';
export const GOOGLE_MAPS_NATIVE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
export const GOOGLE_MAPS_WEB_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY || GOOGLE_MAPS_NATIVE_API_KEY;
export const GOOGLE_MAPS_MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID;
export const LIVE_LOCATION_PRESETS = [15, 60, 480] as const;

export const FALLBACK_BETWEENER_DATE_PICKS = [
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

export const CONCIERGE_SERVICE_OPTIONS = [
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

export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'other', label: 'Other' },
] as const;

export const BLOCKED_AVATAR_SOURCE = require('../assets/images/circle-logo.png');
export const BLOCKED_BY_ME = 'blocked_by_me';
export const BLOCKED_BY_THEM = 'blocked_me';
export const HEADER_HINT_STORAGE_KEY = 'chat_header_longpress_hint_v1';
export const CHAT_PREFS_STORAGE_KEY = 'chat_header_prefs_v1';
export const CHAT_SAFETY_SEEN_KEY = 'chat_safety_seen_v2';
export const LEGACY_MESSAGE_SELECT_FIELDS =
  'id,client_message_id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,audio_path,audio_duration,audio_waveform,deleted_for_all,deleted_at,deleted_by,edited_at,reply_to_message_id,is_view_once,encrypted_media,encrypted_media_path,encrypted_key_sender,encrypted_key_receiver,encrypted_key_nonce,encrypted_media_nonce,encrypted_media_alg,encrypted_media_mime,encrypted_media_size,storage_path';
export const MESSAGE_SELECT_FIELDS = `${LEGACY_MESSAGE_SELECT_FIELDS},media_items,media_expected_count`;

export const MAP_STYLE_LIGHT = [
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

export const MAP_STYLE_DARK = [
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

export const PICKER_MEDIA_TYPES_ALL: ImagePicker.MediaType[] = ['images', 'videos'];
export const DURABLE_CHAT_OUTBOX_MAX_ATTEMPTS = 48;
export const LOCAL_CHAT_OPERATION_TIMEOUT_MS = Platform.OS === 'ios' ? 1200 : 3000;
export const QUICK_REACTIONS = ['❤️', '😂', '😍', '👍', '🔥', '👏'];
export const DEFAULT_VOICE_WAVEFORM = [0.2, 0.5, 0.35, 0.6, 0.28, 0.72, 0.44, 0.68, 0.3, 0.55, 0.4, 0.65];
export const VIDEO_TEXT_PREFIX = '🎥 Video';
export const DOCUMENT_TEXT_PREFIX = '📎';
export const PAGE_SIZE = 60;
