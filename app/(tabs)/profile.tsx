import { DiasporaVerification } from "@/components/DiasporaVerification";
import GiftArtwork from "@/components/gifts/GiftArtwork";
import GiftRevealSheet from "@/components/gifts/GiftRevealSheet";
import { useInbox, markSystemInboxItemsRead } from '@/hooks/useInbox';
import OfflineImage from "@/components/media/OfflineImage";
import PhotoGallery from "@/components/PhotoGallery";
import PremiumSyncNotice from "@/components/profile/PremiumSyncNotice";
import ProfileEditModal from "@/components/ProfileEditModal";
import { VerificationBadge } from "@/components/VerificationBadge";
import { PremiumPlanBadge } from "@/components/PremiumPlanBadge";
import { VerificationNudgeCard } from "@/components/VerificationNudgeCard";
import { VerificationNotifications } from "@/components/VerificationNotifications";
import ProfileVideoModal from "@/components/ProfileVideoModal";
import { Colors } from "@/constants/theme";
import { useColorScheme, useColorSchemePreference } from "@/hooks/use-color-scheme";
import { usePremiumOfflineQueueStatus } from "@/hooks/usePremiumOfflineQueueStatus";
import { useVerificationStatus } from "@/hooks/use-verification-status";
import { useAuth } from "@/lib/auth-context";
import { logProfileGiftEvent } from "@/lib/gifts/events";
import { canAccessAdminTools } from "@/lib/internal-tools";
import { getNonChatInboxActivityItems } from "@/lib/inbox/badge-groups";
import { buildLocationDisplay } from "@/lib/location/location-display";
import { usePremiumState } from "@/hooks/use-premium-state";
import { getSafeRemoteImageUri, getUserFacingDisplayName } from "@/lib/profile/display-name";
import {
  migrateLegacyMeProfileSnapshot,
  readMeProfileSnapshot,
  writeMeProfileSnapshot,
  type MeAccountDraftsSnapshot,
  type MeAccountSnapshot,
  type MeProfileStatsSnapshot,
} from "@/lib/offline/me-store";
import { cacheOfflineVideo, getOfflineVideoUri } from "@/lib/offline/video-store";
import {
  readProfileInsightsSnapshotState,
  updateProfileInsightsSnapshot,
  type OfflineProfileInsightsGiftItem,
} from "@/lib/offline/profile-insights-store";
import {
  enqueueProfileGiftRevealMutation,
  enqueueNotificationPrefsUpdateMutation,
  getOfflineMutationQueueSnapshot,
  getPendingProfileMediaSyncMutation,
  subscribeToOfflineMutationEvents,
} from "@/lib/offline/mutation-queue";
import { isLikelyNetworkError } from "@/lib/network";
import { isLocalMediaUri, normalizeProfilePhotoList, normalizeProfilePhotoUri } from "@/lib/profile/media";
import { getPresenceDisplay } from "@/lib/presence";
import { formatReligionLabel } from "@/lib/profile/religion";
import { getProfileInitials, getProfilePlaceholderPalette, hasProfileImage } from "@/lib/profile-placeholders";
import {
  DEFAULT_GUESS_REVEAL_POLICY,
  normalizeGuessText,
  sanitizeGuessOptions,
  shuffleOptions,
} from "@/lib/prompts/guess-prompts";
import { supabase } from "@/lib/supabase";
import {
  clearPendingIdentityLink,
  isTrustedAuthCallbackUrl,
  markPendingIdentityLink,
} from "@/lib/auth-callback";
import type { GuessMode, ProfilePromptAnswer, PromptType } from "@/types/user-profile";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from "@react-native-community/netinfo";
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";

const DISTANCE_UNIT_KEY = 'distance_unit';
const LINKED_METHODS_BANNER_DISMISSED_KEY = 'linked_methods_banner_dismissed_v1';
const VERIFICATION_NUDGE_DISMISSED_KEY_PREFIX = 'verification_nudge_dismissed_v1';
type AuthCallbackParams = Record<string, string | undefined>;

const mergeAuthParamsFromUrl = (target: AuthCallbackParams, url: string) => {
  try {
    const parsed = Linking.parse(url);
    const query = parsed.queryParams ?? {};
    Object.entries(query).forEach(([key, value]) => {
      if (typeof value === 'string') target[key] = value;
      else if (Array.isArray(value) && typeof value[0] === 'string') target[key] = value[0];
    });
  } catch {
    // ignore malformed urls
  }

  if (url.includes('#')) {
    const fragment = url.split('#')[1] || '';
    const params = new URLSearchParams(fragment);
    params.forEach((value, key) => {
      target[key] = value;
    });
  }
};

const formatProfileDetailValue = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const HeroVideo = ({ uri }: { uri: string }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.keepScreenOnWhilePlaying = false;
    try {
      p.play();
    } catch {}
  });

  useEffect(() => {
    try {
      player.play();
    } catch {}
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  return (
    <VideoView
      style={StyleSheet.absoluteFillObject}
      player={player}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

type DistanceUnit = 'auto' | 'km' | 'mi';

type NotificationPrefs = {
  push_enabled: boolean;
  inapp_enabled: boolean;
  messages: boolean;
  message_reactions: boolean;
  profile_interest: boolean;
  reactions: boolean;
  likes: boolean;
  superlikes: boolean;
  matches: boolean;
  moments: boolean;
  verification: boolean;
  announcements: boolean;
  preview_text: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_tz: string;
};

type ReceivedGiftItem = {
  id: string;
  senderId: string;
  senderProfileId?: string | null;
  senderName: string;
  senderAvatar?: string | null;
  senderGender?: string | null;
  giftType: string;
  createdAt: string;
  openedAt?: string | null;
  revealedAt?: string | null;
  archivedAt?: string | null;
};

const mapOfflineInsightGiftToReceivedGift = (
  gift: OfflineProfileInsightsGiftItem,
): ReceivedGiftItem => ({
  id: gift.id,
  senderId: gift.senderProfileId ?? gift.id,
  senderProfileId: gift.senderProfileId ?? null,
  senderName: gift.senderName,
  senderAvatar: gift.senderAvatar ?? null,
  senderGender: gift.senderGender ?? null,
  giftType: gift.giftType,
  createdAt: gift.createdAt,
  openedAt: gift.openedAt ?? null,
  revealedAt: gift.revealedAt ?? null,
  archivedAt: gift.archivedAt ?? null,
});

const normalizeGiftType = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || '';
};

const GIFT_SYSTEM_ENTITY_TYPES = ['profile_gift_revealed', 'profile_gift_archived'];

const normalizeMeProfileStatsSnapshot = (
  stats: Partial<MeProfileStatsSnapshot>,
): MeProfileStatsSnapshot => ({
  likesCount: Math.max(0, Number(stats.likesCount) || 0),
  matchesCount: Math.max(0, Number(stats.matchesCount) || 0),
  chatsCount: Math.max(0, Number(stats.chatsCount) || 0),
  matchQuality: typeof stats.matchQuality === 'number' && Number.isFinite(stats.matchQuality)
    ? Math.max(0, Math.min(100, Math.round(stats.matchQuality)))
    : null,
});

const mergeUniqueMediaUris = (...groups: (string[] | null | undefined)[]) =>
  Array.from(
    new Set(
      groups
        .flatMap((group) => group ?? [])
        .map((item) => normalizeProfilePhotoUri(item))
      .filter(Boolean),
    ),
  );

const sanitizeLinkedProviderList = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => String(item || '').trim().toLowerCase())
            .filter((item) => item === 'email' || item === 'google' || item === 'apple'),
        ),
      )
    : [];

const formatMembershipDate = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

const formatRelativeSignalTime = (value?: string | null) => {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '';
  const diffMs = Math.max(0, Date.now() - parsed);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatMembershipDate(value) ?? '';
};

const stringListEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const DISTANCE_UNIT_OPTIONS: { value: DistanceUnit; label: string; subtitle?: string }[] = [
  { value: 'auto', label: 'Auto', subtitle: 'Recommended' },
  { value: 'km', label: 'Kilometers' },
  { value: 'mi', label: 'Miles' },
];

const ACCOUNT_RECOVERY_METHOD_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'google', label: 'Google' },
  { value: 'apple', label: 'Apple' },
  { value: 'magic_link', label: 'Magic link' },
  { value: 'other', label: 'Other' },
] as const;

const RECOVERY_PROVIDER_LABELS: Record<string, string> = {
  email: 'Email',
  google: 'Google',
  apple: 'Apple',
  password_backup: 'Password backup',
};

const RECOVERY_PROVIDER_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  email: 'email-outline',
  google: 'google',
  apple: 'apple',
  password_backup: 'form-textbox-password',
};

const ACCOUNT_DELETION_REASON_OPTIONS = [
  {
    value: 'not_enough_matches',
    section: 'Product fit',
    label: 'Not enough quality matches',
    description: 'You are not seeing the kind of people or chemistry you hoped for.',
  },
  {
    value: 'not_feeling_safe',
    section: 'Trust & safety',
    label: 'I do not feel safe',
    description: 'Trust, moderation, or comfort has not felt strong enough.',
  },
  {
    value: 'taking_a_break',
    section: 'Product fit',
    label: 'I am taking a break',
    description: 'You want time away from dating or social discovery for now.',
  },
  {
    value: 'met_someone',
    section: 'Product fit',
    label: 'I met someone',
    description: 'You no longer need Betweener at the moment.',
  },
  {
    value: 'too_many_notifications',
    section: 'Product fit',
    label: 'Too many notifications',
    description: 'The app feels too noisy or demanding.',
  },
  {
    value: 'too_expensive',
    section: 'Product fit',
    label: 'It feels too expensive',
    description: 'Premium value does not feel worth the cost right now.',
  },
  {
    value: 'technical_issues',
    section: 'Product fit',
    label: 'Technical issues',
    description: 'Bugs, speed, or reliability are getting in the way.',
  },
  {
    value: 'privacy_concerns',
    section: 'Trust & safety',
    label: 'Privacy concerns',
    description: 'You are not comfortable with how your data or profile is handled.',
  },
  {
    value: 'not_for_me',
    section: 'Product fit',
    label: 'Betweener is not for me',
    description: 'The product or experience is not the right fit.',
  },
  {
    value: 'other',
    section: 'Other',
    label: 'Other',
    description: 'Something else is making you leave.',
  },
] as const;

type DeleteReasonOption = (typeof ACCOUNT_DELETION_REASON_OPTIONS)[number];
type DeleteReasonKey = DeleteReasonOption['value'];
type DeleteAlternativeAction = 'take_break' | 'quiet_notifications' | 'hide_profile';
type LinkedIdentity = {
  id: string;
  user_id: string;
  identity_id: string;
  provider: string;
};

const DELETE_SOFT_OFFRAMP_OPTIONS: {
  id: DeleteAlternativeAction;
  title: string;
  description: string;
}[] = [
  {
    id: 'take_break',
    title: 'Take a break',
    description: 'Hide your profile and quiet the app for now.',
  },
  {
    id: 'quiet_notifications',
    title: 'Reduce notifications',
    description: 'Keep your account, but make Betweener quieter.',
  },
  {
    id: 'hide_profile',
    title: 'Hide my profile',
    description: 'Step out of discovery without closing your account.',
  },
];

const DELETE_REASON_PRIORITY: DeleteReasonKey[] = [
  'not_feeling_safe',
  'privacy_concerns',
  'taking_a_break',
  'too_many_notifications',
  'met_someone',
  'not_enough_matches',
  'technical_issues',
  'too_expensive',
  'not_for_me',
  'other',
];

const DELETE_REASON_SUGGESTIONS: Partial<
  Record<
    DeleteReasonKey,
    {
      title: string;
      description: string;
      cta: string;
      action: DeleteAlternativeAction;
    }
  >
> = {
  not_feeling_safe: {
    title: 'Hide your profile right away',
    description: 'Step out of discovery first, then decide later if full deletion is still right.',
    cta: 'Hide profile now',
    action: 'hide_profile',
  },
  privacy_concerns: {
    title: 'Step back without disappearing fully',
    description: 'Hide your profile now and keep the option to return with more control.',
    cta: 'Hide profile now',
    action: 'hide_profile',
  },
  taking_a_break: {
    title: 'Take a quieter break instead',
    description: 'Pause your visibility and soften the noise without closing the door completely.',
    cta: 'Take a break instead',
    action: 'take_break',
  },
  too_many_notifications: {
    title: 'Keep your account, lose the noise',
    description: 'Quiet the app first. You may not need to leave entirely.',
    cta: 'Reduce notifications',
    action: 'quiet_notifications',
  },
  met_someone: {
    title: 'Keep the door open',
    description: 'Step back gracefully for now without permanently deleting your Betweener account.',
    cta: 'Take a break instead',
    action: 'take_break',
  },
  not_enough_matches: {
    title: 'Pause visibility while you reset',
    description: 'Hide your profile for now and return when you want fresher momentum.',
    cta: 'Hide profile instead',
    action: 'hide_profile',
  },
  technical_issues: {
    title: 'Step back while issues settle',
    description: 'Hide your profile for now instead of closing your account for good.',
    cta: 'Hide profile instead',
    action: 'hide_profile',
  },
  too_expensive: {
    title: 'Keep your place without staying visible',
    description: 'Hide your profile first so you can come back later without starting over.',
    cta: 'Hide profile instead',
    action: 'hide_profile',
  },
  not_for_me: {
    title: 'Step back before you decide',
    description: 'Hide your profile for now and leave the door open while you think it through.',
    cta: 'Hide profile instead',
    action: 'hide_profile',
  },
  other: {
    title: 'A calmer off-ramp exists',
    description: 'If you just need distance, you can step back without fully closing your account.',
    cta: 'Take a break instead',
    action: 'take_break',
  },
};

const QUIET_HOURS_PRESETS = [
  { id: 'late', label: '22:00-08:00', start: '22:00:00', end: '08:00:00' },
  { id: 'night', label: '23:00-07:00', start: '23:00:00', end: '07:00:00' },
  { id: 'deep', label: '00:00-06:00', start: '00:00:00', end: '06:00:00' },
];

const NOTIFICATION_CORE_OPTIONS = [
  { key: 'messages', label: 'Messages', body: 'Keep the main connection thread alive.', icon: 'message-text-outline' },
  { key: 'message_reactions', label: 'Message reactions', body: 'See the small signals inside chat.', icon: 'sticker-emoji' },
  { key: 'reactions', label: 'Reactions', body: 'Catch quick responses across the app.', icon: 'heart-outline' },
  { key: 'likes', label: 'Likes', body: 'Know when interest lands on your profile.', icon: 'cards-heart-outline' },
  { key: 'superlikes', label: 'Signals', body: 'Know when someone noticed something specific.', icon: 'broadcast' },
  { key: 'matches', label: 'Matches', body: 'Do not miss a fresh mutual opening.', icon: 'account-heart-outline' },
] as const;

const NOTIFICATION_CONTROL_OPTIONS = [
  { key: 'push_enabled', label: 'Push notifications', body: 'Allow Betweener to reach you outside the app.', icon: 'bell-ring-outline' },
  { key: 'inapp_enabled', label: 'In-app notifications', body: 'Keep activity visible while you are inside.', icon: 'gesture-tap-button' },
  { key: 'preview_text', label: 'Preview message text', body: 'Show message content directly in alerts.', icon: 'text-box-search-outline' },
] as const;

const NOTIFICATION_OPTIONAL_OPTIONS = [
  { key: 'profile_interest', label: 'Profile interest', body: 'Control who can surface curiosity, revisits, and saves around your profile.', icon: 'account-search-outline' },
  { key: 'moments', label: 'Moments', body: 'Stay close to comments and reactions on your posts.', icon: 'image-multiple-outline' },
  { key: 'verification', label: 'Verification updates', body: 'Get trust and review progress privately.', icon: 'shield-check-outline' },
  { key: 'announcements', label: 'Announcements', body: 'Hear about meaningful product changes and releases.', icon: 'bullhorn-outline' },
] as const;

// Settings menu items
const SETTINGS_MENU_ITEMS = [
  {
    id: 'appearance',
    title: 'Appearance',
    icon: 'theme-light-dark',
    color: Colors.light.tint
  },
  {
    id: 'notifications',
    title: 'Notifications',
    icon: 'bell',
    color: Colors.light.tint
  },
  {
    id: 'email',
    title: 'Email & Account',
    icon: 'email-outline',
    color: Colors.light.tint
  },
  {
    id: 'privacy',
    title: 'Privacy & Safety',
    icon: 'shield-check',
    color: Colors.light.tint
  },
  {
    id: 'preferences',
    title: 'Relationship Compass',
    icon: 'compass-outline',
    color: Colors.light.tint
  },
  {
    id: 'premium',
    title: 'Premium Plans',
    icon: 'crown-outline',
    color: '#D4A017'
  },
  {
    id: 'help',
    title: 'Help & Support',
    icon: 'help-circle',
    color: Colors.light.tint
  },
  {
    id: 'admin',
    title: 'Admin Dashboard',
    icon: 'shield-account',
    color: '#FF9800',
    adminOnly: true
  },
  {
    id: 'divider',
    type: 'divider'
  },
  {
    id: 'logout',
    title: 'Sign Out',
    icon: 'logout',
    color: '#ef4444'
  }
];

// Interactive prompts for profile
const PROFILE_PROMPTS = [
  {
    id: 'two_truths_lie',
    title: 'Two truths and a lie',
    responses: [
      'I speak three languages',
      'I once met a celebrity',
      'I can cook jollof rice perfectly'
    ]
  },
  {
    id: 'week_goal',
    title: 'This week I want to...',
    responses: [
      'Try a new restaurant',
      'Learn something new',
      'Connect with old friends'
    ]
  }
];

const PROFILE_COMPLETION_MIN_INTERESTS = 3;
const BIO_MIN_PUBLIC_CHARS = 20;
const LOOKING_FOR_MIN_CHARS = 10;

const computeProfileCompletion = (
  profile: any,
  interests: string[],
  promptCount: number,
  photoCount: number,
) => {
  if (!profile) {
    return { percent: 0, missing: [] as string[] };
  }

  const hasName = !!(profile.full_name || '').trim();
  const hasAge = typeof profile.age === 'number' && profile.age >= 18;
  const hasGender = !!(profile.gender || '').toString().trim();
  const hasBio = (profile.bio || '').trim().length >= BIO_MIN_PUBLIC_CHARS;
  const hasRegion = !!(profile.region || '').trim();
  const hasRoots =
    (Array.isArray((profile as any).roots) && (profile as any).roots.filter(Boolean).length > 0)
    || !!(profile.tribe || '').trim();
  const hasOccupation = !!(profile.occupation || '').trim();
  const hasEducation = !!(profile.education || '').trim();
  const hasIntent = (profile.looking_for || '').trim().length >= LOOKING_FOR_MIN_CHARS;
  const hasExercise = !!(profile.exercise_frequency || '').trim();
  const hasSmoking = !!(profile.smoking || '').trim();
  const hasDrinking = !!(profile.drinking || '').trim();
  const hasChildren = !!(profile.has_children || '').trim();
  const wantsChildren = !!(profile.wants_children || '').trim();
  const hasPersonality = !!(profile.personality_type || '').trim();
  const hasLoveLanguage = !!(profile.love_language || '').trim();
  const hasLivingSituation = !!(profile.living_situation || '').trim();
  const hasPets = !!(profile.pets || '').trim();
  const hasLanguages =
    Array.isArray(profile.languages_spoken) && profile.languages_spoken.filter(Boolean).length > 0;
  const hasInterests = Array.isArray(interests) && interests.length >= PROFILE_COMPLETION_MIN_INTERESTS;
  const hasPhotos = photoCount >= 2 || (Array.isArray(profile.photos) && profile.photos.filter(Boolean).length >= 2);
  const hasAvatar = !!(profile.avatar_url || '').trim();
  const hasVideo = !!(profile.profile_video || '').trim();
  const hasHeight = !!(profile.height || '').trim();
  const hasPrompts = promptCount > 0;

  const checks: { label: string; ok: boolean }[] = [
    { label: 'Add your name', ok: hasName },
    { label: 'Add your age', ok: hasAge },
    { label: 'Add your gender', ok: hasGender },
    { label: 'Share a little about you', ok: hasBio },
    { label: 'Add your region', ok: hasRegion },
    { label: 'Add your roots or ethnicity', ok: hasRoots },
    { label: 'Add your occupation', ok: hasOccupation },
    { label: 'Add your education', ok: hasEducation },
    { label: "Express what you're here for", ok: hasIntent },
    { label: 'Add exercise frequency', ok: hasExercise },
    { label: 'Add smoking preference', ok: hasSmoking },
    { label: 'Add drinking preference', ok: hasDrinking },
    { label: 'Add children status', ok: hasChildren },
    { label: 'Add family plans', ok: wantsChildren },
    { label: 'Add personality type', ok: hasPersonality },
    { label: 'Add love language', ok: hasLoveLanguage },
    { label: 'Add living situation', ok: hasLivingSituation },
    { label: 'Add pets preference', ok: hasPets },
    { label: 'Add languages spoken', ok: hasLanguages },
    { label: 'Add your interests', ok: hasInterests },
    { label: 'Add at least 2 photos', ok: hasPhotos },
    { label: 'Add a profile photo', ok: hasAvatar },
    { label: 'Add a profile video', ok: hasVideo },
    { label: 'Add your height', ok: hasHeight },
    { label: 'Answer a prompt', ok: hasPrompts },
  ];

  const total = checks.length || 1;
  const earned = checks.reduce((sum, c) => sum + (c.ok ? 1 : 0), 0);
  const percent = Math.max(0, Math.min(100, Math.round((earned / total) * 100)));
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);

  return { percent, missing };
};

export default function ProfileScreen() {
  WebBrowser.maybeCompleteAuthSession();
  const { signOut, user, profile, refreshProfile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const params = useLocalSearchParams();
  const { status: verificationStatus, refreshStatus } = useVerificationStatus(profile?.user_id);
  const { preference: themePreference, setPreference: setThemePreference } = useColorSchemePreference();
  const { currentPlan, currentPlanEndsAt } = usePremiumState();
  const premiumQueue = usePremiumOfflineQueueStatus();
  
  const [selectedPrompts, setSelectedPrompts] = useState<Record<string, number>>({
    two_truths_lie: 0,
    week_goal: 1,
    vibe_song: 2
  });
  const [promptAnswers, setPromptAnswers] = useState<ProfilePromptAnswer[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptComposerMode, setPromptComposerMode] = useState<PromptType>('standard');
  const [customPromptTitle, setCustomPromptTitle] = useState('');
  const [customPromptAnswer, setCustomPromptAnswer] = useState('');
  const [customPromptSaving, setCustomPromptSaving] = useState(false);
  const [guessPromptTitle, setGuessPromptTitle] = useState('');
  const [guessPromptAnswer, setGuessPromptAnswer] = useState('');
  const [guessPromptHint, setGuessPromptHint] = useState('');
  const [guessPromptMode, setGuessPromptMode] = useState<GuessMode>('multiple_choice');
  const [guessPromptOptions, setGuessPromptOptions] = useState(['', '', '']);
  const [guessPromptSaving, setGuessPromptSaving] = useState(false);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
  const guessPromptSanitizedOptions = useMemo(
    () => sanitizeGuessOptions(guessPromptOptions, guessPromptAnswer),
    [guessPromptAnswer, guessPromptOptions],
  );
  const guessPromptPreviewOptions = useMemo(() => {
    if (guessPromptMode !== 'multiple_choice') return [];
    const answer = guessPromptAnswer.trim();
    const wrongOptions = guessPromptSanitizedOptions.filter(
      (option) => normalizeGuessText(option) !== normalizeGuessText(answer),
    );
    return [answer, ...wrongOptions].filter(Boolean).slice(0, 4);
  }, [guessPromptAnswer, guessPromptMode, guessPromptSanitizedOptions]);
  const canSaveGuessPrompt = Boolean(
    guessPromptTitle.trim() &&
      guessPromptAnswer.trim() &&
      !guessPromptSaving &&
      (guessPromptMode !== 'multiple_choice' || guessPromptSanitizedOptions.length >= 2),
  );
  
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordBackupInput, setPasswordBackupInput] = useState('');
  const [passwordBackupConfirm, setPasswordBackupConfirm] = useState('');
  const [passwordBackupSaving, setPasswordBackupSaving] = useState(false);
  const [passwordBackupMessage, setPasswordBackupMessage] = useState('');
  const [passwordBackupError, setPasswordBackupError] = useState('');
  const [hasPasswordBackup, setHasPasswordBackup] = useState(false);
  const [showPasswordBackupEditor, setShowPasswordBackupEditor] = useState(false);
  const [linkedIdentities, setLinkedIdentities] = useState<LinkedIdentity[]>([]);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [disconnectedProviders, setDisconnectedProviders] = useState<string[]>([]);
  const [identitiesLoading, setIdentitiesLoading] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);
  const [identityMessage, setIdentityMessage] = useState('');
  const [identityError, setIdentityError] = useState('');
  const [identitySuccessSheet, setIdentitySuccessSheet] = useState<{
    provider: 'google' | 'apple';
    title: string;
    body: string;
  } | null>(null);
  const [showRecoveryRequestModal, setShowRecoveryRequestModal] = useState(false);
  const [recoveryCurrentMethod, setRecoveryCurrentMethod] = useState<string>('email');
  const [recoveryPreviousMethod, setRecoveryPreviousMethod] = useState<string>('google');
  const [recoveryContactEmail, setRecoveryContactEmail] = useState('');
  const [recoveryPreviousEmail, setRecoveryPreviousEmail] = useState('');
  const [recoveryNote, setRecoveryNote] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [accountNetworkReady, setAccountNetworkReady] = useState(true);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteReasonKeys, setDeleteReasonKeys] = useState<string[]>([]);
  const [deleteFeedback, setDeleteFeedback] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAlternativeMessage, setDeleteAlternativeMessage] = useState('');
  const [deleteAlternativeAction, setDeleteAlternativeAction] = useState<DeleteAlternativeAction | null>(null);
  const [linkedMethodsBannerDismissed, setLinkedMethodsBannerDismissed] = useState(false);
  const [verificationNudgeDismissed, setVerificationNudgeDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [loadingInterests, setLoadingInterests] = useState(false);
  const [userPhotos, setUserPhotos] = useState<string[]>([]);
  const [displayAvatarUrl, setDisplayAvatarUrl] = useState<string | null>(null);
  const [displayProfileVideo, setDisplayProfileVideo] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const promptEditorYRef = useRef(0);
  const deleteReasonSections = useMemo(() => {
    const grouped = new Map<string, DeleteReasonOption[]>();
    for (const option of ACCOUNT_DELETION_REASON_OPTIONS) {
      const current = grouped.get(option.section) ?? [];
      grouped.set(option.section, [...current, option]);
    }
    return Array.from(grouped.entries());
  }, []);
  const primaryDeleteReason = useMemo<DeleteReasonKey | null>(() => {
    for (const reasonKey of DELETE_REASON_PRIORITY) {
      if (deleteReasonKeys.includes(reasonKey)) return reasonKey;
    }
    return deleteReasonKeys[0] as DeleteReasonKey | undefined ?? null;
  }, [deleteReasonKeys]);
  const deleteReasonSuggestion = useMemo(
    () => (primaryDeleteReason ? DELETE_REASON_SUGGESTIONS[primaryDeleteReason] ?? null : null),
    [primaryDeleteReason],
  );

  const cacheProfileId = profile?.id ?? user?.id ?? null;
  const verificationNudgeDismissedKey = useMemo(
    () => (cacheProfileId ? `${VERIFICATION_NUDGE_DISMISSED_KEY_PREFIX}:${cacheProfileId}` : null),
    [cacheProfileId],
  );
  const cacheLoadedRef = useRef<Record<string, true>>({});
  const [isVerificationModalVisible, setIsVerificationModalVisible] = useState(false);

  useEffect(() => {
    const metadata =
      user?.user_metadata && typeof user.user_metadata === 'object'
        ? (user.user_metadata as Record<string, unknown>)
        : null;
    setHasPasswordBackup(Boolean(metadata?.has_password_backup));
  }, [user?.id, user?.user_metadata]);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('auto');
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    push_enabled: true,
    inapp_enabled: true,
    messages: true,
    message_reactions: true,
    profile_interest: true,
    reactions: true,
    likes: true,
    superlikes: true,
    matches: true,
    moments: true,
    verification: true,
    announcements: false,
    preview_text: true,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '08:00:00',
    quiet_hours_tz: 'UTC',
  });
  const [notificationPrefsLoaded, setNotificationPrefsLoaded] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [matchesCount, setMatchesCount] = useState(0);
  const [chatsCount, setChatsCount] = useState(0);
  const [receivedGifts, setReceivedGifts] = useState<ReceivedGiftItem[]>([]);
  const [selectedReceivedGift, setSelectedReceivedGift] = useState<ReceivedGiftItem | null>(null);
  const [matchQuality, setMatchQuality] = useState<number | null>(null);
  const [profileSyncPending, setProfileSyncPending] = useState(false);
  const [profileSyncFailed, setProfileSyncFailed] = useState(false);
  const profileStatsRef = useRef<MeProfileStatsSnapshot>({
    likesCount: 0,
    matchesCount: 0,
    chatsCount: 0,
    matchQuality: null,
  });
  const profileCompletion = useMemo(
    () => computeProfileCompletion(profile, userInterests, promptAnswers.length, userPhotos.length),
    [profile, promptAnswers.length, userInterests, userPhotos.length],
  );
  const progressAnim = useRef(new Animated.Value(profileCompletion.percent)).current;
  const progressGlowAnim = useRef(new Animated.Value(0)).current;
  const progressAnimatedOnceRef = useRef(false);
  const prevProgressRef = useRef(profileCompletion.percent);
  const [rewardText, setRewardText] = useState<string | null>(null);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const canSeeAdminTools = canAccessAdminTools(user?.email ?? null);
  const { items: inboxItems, freshness: inboxFreshness } = useInbox(user?.id ?? null);
  const visibleReceivedGifts = useMemo(
    () => receivedGifts.filter((gift) => !gift.revealedAt && !gift.archivedAt),
    [receivedGifts],
  );
  const visibleReceivedGiftsCount = visibleReceivedGifts.length;
  const profileActivityItems = useMemo(
    () => getNonChatInboxActivityItems(inboxItems),
    [inboxItems],
  );
  const trustedProfileActivityBadgeCount = inboxFreshness.hasFreshServerData
    ? profileActivityItems.length
    : 0;
  const insightsBadgeCount = trustedProfileActivityBadgeCount > 0
    ? trustedProfileActivityBadgeCount
    : visibleReceivedGiftsCount;

  const progressSubtitle = useMemo(() => {
    if (profileCompletion.percent >= 100) return "Profile complete";
    if (profileCompletion.percent >= 80) return "Strong presence";
    if (profileCompletion.percent >= 50) return "Shaping your presence";
    return "Start with your best details";
  }, [profileCompletion.percent]);

  const openReceivedGiftReveal = useCallback(async (gift: ReceivedGiftItem) => {
    if (user?.id) {
      void markSystemInboxItemsRead(user.id, GIFT_SYSTEM_ENTITY_TYPES);
    }
    const revealedAt = new Date().toISOString();
    const previousGifts = receivedGifts;
    const nextGiftOptimistic: ReceivedGiftItem = {
      ...gift,
      openedAt: gift.openedAt ?? revealedAt,
      revealedAt: gift.revealedAt ?? revealedAt,
    };
    const optimisticGifts = receivedGifts.map((row) =>
      row.id === nextGiftOptimistic.id ? nextGiftOptimistic : row,
    );

    setReceivedGifts(optimisticGifts);
    if (profile?.id) {
      void updateProfileInsightsSnapshot(profile.id, (current) => {
        if (!current) return current;
        const nextArchive = current.giftArchive.map((row) =>
          row.id === nextGiftOptimistic.id
            ? {
                ...row,
                openedAt: nextGiftOptimistic.openedAt ?? row.openedAt ?? null,
                revealedAt: nextGiftOptimistic.revealedAt ?? row.revealedAt ?? null,
                archivedAt: nextGiftOptimistic.archivedAt ?? row.archivedAt ?? null,
              }
            : row,
        );
        return {
          ...current,
          giftSummary: {
            ...current.giftSummary,
            waitingCount: nextArchive.filter((row) => !row.revealedAt && !row.archivedAt).length,
          },
          giftArchive: nextArchive,
        };
      });
    }

    const { data, error } = await supabase.rpc('rpc_reveal_profile_gift' as any, {
      p_gift_id: gift.id,
    });

    if (error) {
      if (isLikelyNetworkError(error)) {
        await enqueueProfileGiftRevealMutation({ giftId: gift.id });
        setSelectedReceivedGift(nextGiftOptimistic);
        return;
      }
      console.error('Error revealing gift:', error);
      setReceivedGifts(previousGifts);
      if (profile?.id) {
        void updateProfileInsightsSnapshot(profile.id, (current) => {
          if (!current) return current;
          return {
            ...current,
            giftSummary: {
              ...current.giftSummary,
              waitingCount: previousGifts.filter((row) => !row.revealedAt && !row.archivedAt).length,
            },
            giftArchive: previousGifts,
          };
        });
      }
      Alert.alert('Unable to open gift', 'Please try again.');
      return;
    }

    const nextGift: ReceivedGiftItem = {
      ...nextGiftOptimistic,
      openedAt:
        typeof (data as any)?.opened_at === 'string' ? (data as any).opened_at : (nextGiftOptimistic.openedAt ?? null),
      revealedAt:
        typeof (data as any)?.revealed_at === 'string' ? (data as any).revealed_at : (nextGiftOptimistic.revealedAt ?? null),
      archivedAt:
        typeof (data as any)?.archived_at === 'string' ? (data as any).archived_at : (nextGiftOptimistic.archivedAt ?? null),
    };

    setReceivedGifts((prev) =>
      prev.map((row) => (row.id === nextGift.id ? nextGift : row)),
    );
    if (profile?.id) {
      void updateProfileInsightsSnapshot(profile.id, (current) => {
        if (!current) return current;
        const nextArchive = current.giftArchive.map((row) =>
          row.id === nextGift.id
            ? {
                ...row,
                openedAt: nextGift.openedAt ?? row.openedAt ?? null,
                revealedAt: nextGift.revealedAt ?? row.revealedAt ?? null,
                archivedAt: nextGift.archivedAt ?? row.archivedAt ?? null,
              }
            : row,
        );
        return {
          ...current,
          giftSummary: {
            ...current.giftSummary,
            waitingCount: nextArchive.filter((row) => !row.revealedAt && !row.archivedAt).length,
          },
          giftArchive: nextArchive,
        };
      });
    }
    setSelectedReceivedGift(nextGift);
  }, [profile?.id, receivedGifts]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const cachedInsights = await readProfileInsightsSnapshotState(profile.id);
        if (cancelled) return;

        if (!cachedInsights.data?.giftArchive?.length) return;
        setReceivedGifts((current) =>
          current.length === 0
            ? cachedInsights.data!.giftArchive
                .slice(0, 8)
                .map(mapOfflineInsightGiftToReceivedGift)
            : current,
        );
      } catch {
        // Ignore cached snapshot read failures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const nextPrompt = useMemo(() => {
    const missing = profileCompletion.missing;
    if (!missing.length) return null;
    const first = missing[0];
    if (first === "Share a little about you") return "Next: Share a little about you";
    if (first === "Express what you're here for") return "Next: Express what you're here for";
    if (first === "Add at least 2 photos") return "Next: Add your best photos";
    if (first === "Add a profile photo") return "Next: Add your profile photo";
    if (first === "Answer a prompt") return "Next: Add your voice";
    return `Next: ${first}`;
  }, [profileCompletion.missing]);

  useEffect(() => {
    if (!progressAnimatedOnceRef.current) {
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: profileCompletion.percent,
        duration: 720,
        delay: 180,
        useNativeDriver: false,
      }).start(() => {
        progressAnimatedOnceRef.current = true;
      });
      if (progressTrackWidth > 0) {
        progressGlowAnim.setValue(0);
        Animated.timing(progressGlowAnim, {
          toValue: 1,
          duration: 1100,
          delay: 220,
          useNativeDriver: true,
        }).start();
      }
    } else {
      Animated.timing(progressAnim, {
        toValue: profileCompletion.percent,
        duration: 520,
        useNativeDriver: false,
      }).start();
    }

    if (profileCompletion.percent > prevProgressRef.current) {
      prevProgressRef.current = profileCompletion.percent;
      setRewardText("That adds depth");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      const timer = setTimeout(() => setRewardText(null), 900);
      return () => clearTimeout(timer);
    }
    prevProgressRef.current = profileCompletion.percent;
    return undefined;
  }, [profileCompletion.percent, progressAnim, progressGlowAnim, progressTrackWidth]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
      await fetchUserInterests();
      await loadPromptAnswers();
      await loadUserPhotos();
      await fetchProfileStats();
      await fetchReceivedGifts();
      console.log('Profile manually refreshed');
    } catch (error) {
      console.error('Error refreshing profile:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const refreshProfileSyncState = useCallback(async () => {
    const snapshot = await getOfflineMutationQueueSnapshot();
    const isProfileMutation = (item: { kind: string }) =>
      item.kind === 'profile_update' ||
      item.kind === 'profile_interests_update' ||
      item.kind === 'profile_media_sync';
    setProfileSyncPending(snapshot.pending.some(isProfileMutation));
    setProfileSyncFailed(snapshot.failed.some(isProfileMutation));
  }, []);

  useEffect(() => {
    void refreshProfileSyncState();
    return subscribeToOfflineMutationEvents((event) => {
      if (
        event.mutation.kind === 'profile_update' ||
        event.mutation.kind === 'profile_interests_update' ||
        event.mutation.kind === 'profile_media_sync'
      ) {
        void refreshProfileSyncState();
        if (event.type === 'completed') {
          void refreshProfile();
        }
      }
    });
  }, [refreshProfile, refreshProfileSyncState]);

  const applyPromptAnswers = useCallback(
    (rows: ProfilePromptAnswer[]) => {
      setPromptAnswers(rows);
      setSelectedPrompts((prev) => {
        const nextSelected: Record<string, number> = { ...prev };
        rows.forEach((row) => {
          const prompt = PROFILE_PROMPTS.find((p) => p.id === row.promptKey);
          if (!prompt) return;
          const idx = prompt.responses.findIndex((r) => r === row.answer);
          if (idx >= 0) nextSelected[row.promptKey || prompt.id] = idx;
        });
        return nextSelected;
      });
    },
    [],
  );

  const applyProfileStatsSnapshot = useCallback((stats: Partial<MeProfileStatsSnapshot>) => {
    const next = normalizeMeProfileStatsSnapshot(stats);
    profileStatsRef.current = next;
    setLikesCount(next.likesCount);
    setMatchesCount(next.matchesCount);
    setChatsCount(next.chatsCount);
    setMatchQuality(next.matchQuality);
  }, []);

  const writeMeSnapshot = useCallback(
    (patch: Parameters<typeof writeMeProfileSnapshot>[1]) => {
      if (!cacheProfileId) return;
      void writeMeProfileSnapshot(cacheProfileId, patch);
    },
    [cacheProfileId],
  );

  const persistAccountSnapshot = useCallback(
    (patch: Partial<MeAccountSnapshot>) => {
      writeMeSnapshot({
        accountSnapshot: {
          email: user?.email ?? null,
          linkedProviders,
          disconnectedProviders,
          hasPasswordBackup,
          ...patch,
        },
      });
    },
    [disconnectedProviders, hasPasswordBackup, linkedProviders, user?.email, writeMeSnapshot],
  );

  const persistAccountDrafts = useCallback(
    (patch: Partial<MeAccountDraftsSnapshot>) => {
      writeMeSnapshot({
        accountDrafts: {
          emailInput,
          recoveryCurrentMethod,
          recoveryPreviousMethod,
          recoveryContactEmail,
          recoveryPreviousEmail,
          recoveryNote,
          ...patch,
        },
      });
    },
    [
      emailInput,
      recoveryContactEmail,
      recoveryCurrentMethod,
      recoveryNote,
      recoveryPreviousEmail,
      recoveryPreviousMethod,
      writeMeSnapshot,
    ],
  );

  const guardAccountAction = useCallback(
    (label: string) => {
      if (accountNetworkReady) return true;
      Alert.alert('Connection required', `${label} needs a live connection before it can continue.`);
      return false;
    },
    [accountNetworkReady],
  );

  const commitProfileStatsSnapshot = useCallback(
    (stats: Partial<MeProfileStatsSnapshot>) => {
      const next = normalizeMeProfileStatsSnapshot(stats);
      applyProfileStatsSnapshot(next);
      writeMeSnapshot({ stats: next });
    },
    [applyProfileStatsSnapshot, writeMeSnapshot],
  );

  // Durable cached-first hydration for Me tab sub-data.
  useEffect(() => {
    if (!cacheProfileId || cacheLoadedRef.current[cacheProfileId]) return;
    cacheLoadedRef.current[cacheProfileId] = true;
    let cancelled = false;
    void (async () => {
      const cached =
        (await readMeProfileSnapshot(cacheProfileId)) ??
        (await migrateLegacyMeProfileSnapshot(cacheProfileId));
      if (cancelled || !cached) return;
      if (Array.isArray(cached.promptAnswers) && cached.promptAnswers.length > 0 && promptAnswers.length === 0) {
        applyPromptAnswers(cached.promptAnswers as any);
      }
      if (Array.isArray(cached.interests) && cached.interests.length > 0) {
        setUserInterests((prev) => (prev.length === 0 ? (cached.interests as string[]) : prev));
      }
      if (Array.isArray(cached.photos) && cached.photos.length > 0) {
        setUserPhotos((prev) => (prev.length === 0 ? normalizeProfilePhotoList(cached.photos) : prev));
      }
      if (cached.avatarUrl) {
        setDisplayAvatarUrl(normalizeProfilePhotoUri(cached.avatarUrl));
      }
      if (cached.profileVideo) {
        setDisplayProfileVideo(String(cached.profileVideo));
      }
      if (cached.stats) {
        applyProfileStatsSnapshot(cached.stats);
      }
      if (cached.notificationPrefs) {
        setNotificationPrefs((prev) => ({ ...prev, ...(cached.notificationPrefs as Partial<NotificationPrefs>) }));
        setNotificationPrefsLoaded(true);
      }
      if (cached.accountSnapshot) {
        if (cached.accountSnapshot.email && !emailInput) {
          setEmailInput(String(cached.accountSnapshot.email));
        }
        const cachedLinked = sanitizeLinkedProviderList(cached.accountSnapshot.linkedProviders);
        const cachedDisconnected = sanitizeLinkedProviderList(cached.accountSnapshot.disconnectedProviders);
        if (cachedLinked.length > 0) {
          setLinkedProviders((prev) => (prev.length === 0 ? cachedLinked : prev));
        }
        if (cachedDisconnected.length > 0) {
          setDisconnectedProviders((prev) => (prev.length === 0 ? cachedDisconnected : prev));
        }
        if (typeof cached.accountSnapshot.hasPasswordBackup === 'boolean') {
          setHasPasswordBackup((prev) => (prev ? prev : cached.accountSnapshot?.hasPasswordBackup ?? false));
        }
      }
      if (cached.accountDrafts) {
        if (cached.accountDrafts.emailInput && !emailInput) {
          setEmailInput(cached.accountDrafts.emailInput);
        }
        if (cached.accountDrafts.recoveryCurrentMethod) {
          setRecoveryCurrentMethod((prev) => prev || cached.accountDrafts?.recoveryCurrentMethod || 'email');
        }
        if (cached.accountDrafts.recoveryPreviousMethod) {
          setRecoveryPreviousMethod((prev) => prev || cached.accountDrafts?.recoveryPreviousMethod || 'google');
        }
        if (cached.accountDrafts.recoveryContactEmail && !recoveryContactEmail) {
          setRecoveryContactEmail(cached.accountDrafts.recoveryContactEmail);
        }
        if (cached.accountDrafts.recoveryPreviousEmail && !recoveryPreviousEmail) {
          setRecoveryPreviousEmail(cached.accountDrafts.recoveryPreviousEmail);
        }
        if (cached.accountDrafts.recoveryNote && !recoveryNote) {
          setRecoveryNote(cached.accountDrafts.recoveryNote);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    applyProfileStatsSnapshot,
    applyPromptAnswers,
    cacheProfileId,
    emailInput,
    promptAnswers.length,
    recoveryContactEmail,
    recoveryNote,
    recoveryPreviousEmail,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = await fetchNetInfo();
      if (!cancelled) {
        setAccountNetworkReady(Boolean(state.isConnected) && state.isInternetReachable !== false);
      }
    })();
    const unsubscribe = addNetInfoListener((state) => {
      setAccountNetworkReady(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!cacheProfileId) return;
    persistAccountSnapshot({});
  }, [cacheProfileId, disconnectedProviders, hasPasswordBackup, linkedProviders, persistAccountSnapshot, user?.email]);

  useEffect(() => {
    if (!cacheProfileId) return;
    persistAccountDrafts({});
  }, [
    cacheProfileId,
    emailInput,
    persistAccountDrafts,
    recoveryContactEmail,
    recoveryCurrentMethod,
    recoveryNote,
    recoveryPreviousEmail,
    recoveryPreviousMethod,
  ]);

  useEffect(() => {
    if (!cacheProfileId) return;
    const stablePhotos = normalizeProfilePhotoList((profile as any)?.photos || []);
    const stableAvatarUrl = normalizeProfilePhotoUri(profile?.avatar_url);
    const stableProfileVideo = String(
      (profile as any)?.profile_video || (profile as any)?.profileVideo || ''
    ).trim();
    if (!stableAvatarUrl && stablePhotos.length === 0 && !stableProfileVideo) return;
    let cancelled = false;
    void (async () => {
      const pendingMedia = user?.id ? await getPendingProfileMediaSyncMutation(user.id) : null;
      if (cancelled) return;
      writeMeSnapshot({
        avatarUrl:
          pendingMedia?.payload.avatar?.localUri
            ? pendingMedia.payload.avatar.localUri
            : (stableAvatarUrl || null),
        photos:
          pendingMedia?.payload.photos?.length
            ? mergeUniqueMediaUris(stablePhotos, pendingMedia.payload.photos)
            : stablePhotos,
        profileVideo:
          pendingMedia?.payload.video?.localUri
            ? pendingMedia.payload.video.localUri
            : (stableProfileVideo || null),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    cacheProfileId,
    profile?.avatar_url,
    (profile as any)?.profile_video,
    (profile as any)?.profileVideo,
    JSON.stringify((profile as any)?.photos || []),
    user?.id,
    writeMeSnapshot,
  ]);

  const loadPromptAnswers = useCallback(async () => {
    if (!profile?.id) {
      setPromptAnswers([]);
      setPromptsLoading(false);
      return;
    }
    setPromptsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profile_prompts')
        .select('id,prompt_key,prompt_title,prompt_type,answer,guess_mode,guess_options,hint_text,normalized_answer,reveal_policy,created_at')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) {
        console.log('[profile] prompt fetch error', error);
        return;
      }
      const rows = ((data || []) as any[]).map((row) => ({
        id: row.id,
        promptKey: row.prompt_key || undefined,
        promptTitle: row.prompt_title || null,
        answer: row.answer || '',
        promptType: row.prompt_type || 'standard',
        guessMode: row.guess_mode || null,
        guessOptions: Array.isArray(row.guess_options)
          ? row.guess_options.filter((item: unknown) => typeof item === 'string')
          : null,
        hintText: row.hint_text || null,
        normalizedAnswer: row.normalized_answer || null,
        revealPolicy: row.reveal_policy || DEFAULT_GUESS_REVEAL_POLICY,
        createdAt: row.created_at || undefined,
      })) as ProfilePromptAnswer[];
      applyPromptAnswers(rows);
      writeMeSnapshot({ promptAnswers: rows });
    } finally {
      setPromptsLoading(false);
    }
  }, [applyPromptAnswers, profile?.id, writeMeSnapshot]);

  // Fetch user interests from profile_interests table
  const fetchUserInterests = useCallback(async () => {
    const pid = profile?.id ?? null;
    if (!pid) return;

    try {
      setLoadingInterests(true);
      const { data, error } = await supabase
        .from('profile_interests')
        .select(`
          interests (
            name
          )
        `)
        .eq('profile_id', pid);

      if (error) return;

      const interests = data?.map(item => (item as any).interests.name) || [];
      setUserInterests(interests);
      writeMeSnapshot({ interests });
    } catch (error) {
      console.error('Error fetching user interests:', error);
    } finally {
      setLoadingInterests(false);
    }
  }, [profile?.id, writeMeSnapshot]);

  // Load user photos from profile and storage
  const loadUserPhotos = useCallback(async () => {
    if (!user?.id) return;

    try {
      const pendingMedia = await getPendingProfileMediaSyncMutation(user.id);
      const pendingPhotos = normalizeProfilePhotoList(pendingMedia?.payload.photos || []);

      // First check if photos exist in profile.photos field
      const profilePhotos = normalizeProfilePhotoList((profile as any)?.photos || []);
      if (profilePhotos.length > 0) {
        const nextPhotos = mergeUniqueMediaUris(profilePhotos, pendingPhotos);
        setUserPhotos(nextPhotos);
        writeMeSnapshot({ photos: nextPhotos });
        return;
      }

      // If no photos in profile, check storage folder
      const { data: files, error } = await supabase.storage
        .from('profile-photos')
        .list(`${user.id}/`, {
          limit: 10,
          sortBy: { column: 'created_at', order: 'asc' }
        });

      if (error) {
        console.error('Error loading photos:', error);
        return;
      }

      if (files && files.length > 0) {
        // Get public URLs for the photos
        const photoUrls = files
          .filter(file => file.name !== '.emptyFolderPlaceholder')
          .map(file => {
            const { data } = supabase.storage
              .from('profile-photos')
              .getPublicUrl(`${user.id}/${file.name}`);
            return data.publicUrl;
          });

        const nextPhotos = mergeUniqueMediaUris(photoUrls, pendingPhotos);
        setUserPhotos(nextPhotos);
        writeMeSnapshot({ photos: nextPhotos });
        return;
      }

      if (pendingPhotos.length > 0) {
        setUserPhotos(pendingPhotos);
        writeMeSnapshot({ photos: pendingPhotos });
      }
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  }, [
    profile?.id,
    JSON.stringify((profile as any)?.photos || []),
    user?.id,
    writeMeSnapshot,
  ]);

  const fetchProfileStats = useCallback(async () => {
    if (!profile?.id || !user?.id) {
      commitProfileStatsSnapshot({
        likesCount: 0,
        matchesCount: 0,
        chatsCount: 0,
        matchQuality: null,
      });
      return;
    }

    const nextStats: MeProfileStatsSnapshot = { ...profileStatsRef.current };

    try {
      // Likes are stored as incoming intent requests (keyed by profiles.id).
      const { data: intents, error: intentsError } = await supabase
        .from('intent_requests')
        .select('id,type,status,expires_at')
        .eq('recipient_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(300);

      if (!intentsError && intents) {
        const now = Date.now();
        const actionable = (intents as any[]).filter((row) => {
          const ts = typeof row?.expires_at === 'string' ? Date.parse(row.expires_at) : NaN;
          return Number.isNaN(ts) ? true : ts >= now;
        });
        nextStats.likesCount = actionable.filter((row) => row?.type === 'like_with_note').length;
      }
    } catch {
      // Keep the last durable count while offline.
    }

    try {
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('id,user1_id,user2_id,status')
        .eq('status', 'ACCEPTED')
        .or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`)
        .limit(500);

      if (!matchesError && matches) {
        const rows = matches as any[];
        const otherIds = Array.from(
          new Set(
            rows
              .map((m) => (m.user1_id === profile.id ? m.user2_id : m.user1_id))
              .filter((v): v is string => typeof v === 'string' && v.length > 0),
          ),
        );
        nextStats.matchesCount = otherIds.length;
        nextStats.matchQuality = null;

        if (otherIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            // `compatibility` column does not exist in current schema; use `ai_score` as a proxy.
            .select('id,ai_score')
            .in('id', otherIds);
          if (profilesError || !profilesData) {
            nextStats.matchQuality = profileStatsRef.current.matchQuality;
          } else {
            const scores = (profilesData as any[])
              .map((p) => (typeof p?.ai_score === 'number' ? p.ai_score : null))
              .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
            if (scores.length > 0) {
              const avg = scores.reduce((sum, v) => sum + v, 0) / scores.length;
              nextStats.matchQuality = Math.max(0, Math.min(100, Math.round(avg)));
            }
          }
        }
      }
    } catch {
      // Keep the last durable match summary while offline.
    }

    try {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('sender_id,receiver_id')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!messagesError && messages) {
        const convoIds = new Set<string>();
        (messages as any[]).forEach((m) => {
          const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
          if (typeof otherId === 'string' && otherId.length > 0) convoIds.add(otherId);
        });
        nextStats.chatsCount = convoIds.size;
      }
    } catch {
      // Keep the last durable chat count while offline.
    }

    commitProfileStatsSnapshot(nextStats);
  }, [commitProfileStatsSnapshot, profile?.id, user?.id]);

  const fetchReceivedGifts = useCallback(async () => {
    if (!profile?.id) {
      setReceivedGifts([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profile_gifts')
        .select('id,sender_id,sender_profile_id,sender_display_name,sender_avatar_url,sender_gender,gift_type,created_at,opened_at,revealed_at,archived_at,sender_profile:profiles!profile_gifts_sender_profile_id_fkey(id,full_name,username,avatar_url,gender,account_state,deleted_at)')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) throw error;

      const rows = (data || []) as {
        id: string;
        sender_id: string;
        sender_profile_id?: string | null;
        sender_display_name?: string | null;
        sender_avatar_url?: string | null;
        sender_gender?: string | null;
        sender_profile?: {
          id?: string | null;
          full_name?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          gender?: string | null;
          account_state?: string | null;
          deleted_at?: string | null;
        } | null;
        gift_type: string;
        created_at: string;
        opened_at?: string | null;
        revealed_at?: string | null;
        archived_at?: string | null;
      }[];

      const unresolvedSenderIds = Array.from(
        new Set(
          rows
            .filter((row) => {
              const snapshotName = String(row.sender_display_name || '').trim().toLowerCase();
              return snapshotName.length === 0 || snapshotName === 'someone';
            })
            .map((row) => String(row.sender_id || '').trim())
            .filter(Boolean),
        ),
      );

      let fallbackSenderProfilesByUserId = new Map<string, {
        id?: string | null;
        full_name?: string | null;
        username?: string | null;
        avatar_url?: string | null;
        gender?: string | null;
        account_state?: string | null;
        deleted_at?: string | null;
      }>();

      if (unresolvedSenderIds.length > 0) {
        const { data: senderProfiles, error: senderProfilesError } = await supabase
          .from('profiles')
          .select('id,user_id,full_name,username,avatar_url,gender,account_state,deleted_at')
          .in('user_id', unresolvedSenderIds);

        if (senderProfilesError) {
          console.error('Error hydrating fallback gift sender profiles:', senderProfilesError);
        } else {
          fallbackSenderProfilesByUserId = new Map(
            ((senderProfiles || []) as any[]).map((item) => [String(item.user_id), item]),
          );
        }
      }

      setReceivedGifts(rows.map((row) => {
        const relationSenderProfile = Array.isArray((row as any).sender_profile)
          ? (row as any).sender_profile[0] ?? null
          : (row as any).sender_profile ?? null;
        const senderProfile =
          relationSenderProfile ??
          fallbackSenderProfilesByUserId.get(String(row.sender_id || '').trim()) ??
          null;
        const snapshotName = String(row.sender_display_name || '').trim();
        const senderName =
          snapshotName.length > 0 && snapshotName.toLowerCase() !== 'someone'
            ? snapshotName
            : getUserFacingDisplayName(senderProfile, 'New admirer');

        return {
          id: row.id,
          senderId: row.sender_id,
          senderProfileId: row.sender_profile_id ?? senderProfile?.id ?? null,
          senderName,
          senderAvatar: getSafeRemoteImageUri(row.sender_avatar_url ?? senderProfile?.avatar_url ?? null),
          senderGender: row.sender_gender ?? senderProfile?.gender ?? null,
          giftType: normalizeGiftType(row.gift_type),
          createdAt: row.created_at,
          openedAt: row.opened_at ?? null,
          revealedAt: row.revealed_at ?? null,
          archivedAt: row.archived_at ?? null,
        };
      }));
    } catch (error) {
      if (!isLikelyNetworkError(error)) {
        console.warn('Error loading received gifts:', error);
      }
    }
  }, [profile?.id]);

  // Remove photo function
  const removePhoto = async (index: number) => {
    if (!user?.id || index < 0 || index >= userPhotos.length) return;
    
    try {
      const photoToRemove = userPhotos[index];
      
      // Remove from local state immediately for better UX
      const updatedPhotos = userPhotos.filter((_, i) => i !== index);
      setUserPhotos(updatedPhotos);
      
      // If photo is from storage, remove from storage
      if (photoToRemove.includes('profile-photos')) {
        // Extract filename from URL
        const urlParts = photoToRemove.split('/');
        const fileName = urlParts[urlParts.length - 1];
        
        const { error } = await supabase.storage
          .from('profile-photos')
          .remove([`${user.id}/${fileName}`]);
          
        if (error) {
          console.error('Error removing photo from storage:', error);
          // Revert local state on error
          setUserPhotos(userPhotos);
          return;
        }
      }
      
      // Update profile.photos field if it exists
      if ((profile as any)?.photos) {
        const { error } = await supabase
          .from('profiles')
          .update({ photos: updatedPhotos })
          .eq('id', profile.id);
          
        if (error) {
          console.error('Error updating profile photos:', error);
        }
      }
      
      console.log('Photo removed successfully');
    } catch (error) {
      console.error('Error removing photo:', error);
      // Revert local state on error
      loadUserPhotos();
    }
  };
  
  // Animation values
  const scrollY = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Load user interests and photos when component mounts or profile changes
  useEffect(() => {
    if (profile?.id && user?.id) {
      fetchUserInterests();
      loadUserPhotos();
      loadPromptAnswers();
      void fetchProfileStats();
      void fetchReceivedGifts();
    }
  }, [fetchProfileStats, fetchReceivedGifts, fetchUserInterests, loadPromptAnswers, loadUserPhotos, profile?.id, user?.id]);

  const loadNotificationPrefs = useCallback(async () => {
    if (!user?.id) return;
    setNotificationPrefsLoaded(false);
    const { data, error } = await supabase
      .from('notification_prefs')
      .select(
        'push_enabled,inapp_enabled,messages,message_reactions,profile_interest,reactions,likes,superlikes,matches,moments,verification,announcements,preview_text,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_tz',
      )
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.log('[profile] notification prefs error', error);
      setNotificationPrefsLoaded(true);
      return;
    }
    if (data) {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const nextPrefs = {
        push_enabled: Boolean(data.push_enabled),
        inapp_enabled: Boolean(data.inapp_enabled),
        messages: Boolean(data.messages),
        message_reactions: Boolean(data.message_reactions),
        profile_interest: (data as any)?.profile_interest !== false,
        reactions: Boolean(data.reactions),
        likes: Boolean(data.likes),
        superlikes: Boolean(data.superlikes),
        matches: Boolean(data.matches),
        moments: Boolean(data.moments),
        verification: Boolean(data.verification),
        announcements: Boolean(data.announcements),
        preview_text: Boolean(data.preview_text),
        quiet_hours_enabled: Boolean(data.quiet_hours_enabled),
        quiet_hours_start: data.quiet_hours_start ?? '22:00:00',
        quiet_hours_end: data.quiet_hours_end ?? '08:00:00',
        quiet_hours_tz: data.quiet_hours_tz ?? localTz,
      };
      setNotificationPrefs(nextPrefs);
      writeMeSnapshot({ notificationPrefs: nextPrefs as unknown as Record<string, unknown> });
    }
    setNotificationPrefsLoaded(true);
  }, [user?.id, writeMeSnapshot]);

  useEffect(() => {
    void loadNotificationPrefs();
  }, [loadNotificationPrefs]);

  useEffect(() => {
    if (params.openVerification === 'true') {
      setIsVerificationModalVisible(true);
      router.replace('/(tabs)/profile');
    }
  }, [params.openVerification]);

  const loadDistanceUnit = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(DISTANCE_UNIT_KEY);
      if (stored === 'auto' || stored === 'km' || stored === 'mi') {
        setDistanceUnit(stored);
      } else {
        setDistanceUnit('auto');
      }
    } catch {}
  }, []);

  useEffect(() => {
    void loadDistanceUnit();
  }, [loadDistanceUnit]);

  useEffect(() => {
    if (!showEditModal) {
      void loadDistanceUnit();
    }
  }, [showEditModal, loadDistanceUnit]);

  const handleSignOut = async () => {
    if (isHighRiskOAuthOnlyAccount) {
      Alert.alert(
        'This account still has one fragile way back in',
        `Right now you rely only on ${highRiskProviderLabel}. If ${highRiskProviderLabel} opens the wrong Betweener account later, recovery becomes slower and more manual. Add a password backup or another provider before you sign out.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Secure now',
            onPress: openEmailAccountModal,
          },
          {
            text: 'I understand',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Sign out anyway?',
                `You can still sign out, but this account will keep depending on ${highRiskProviderLabel} alone until you add a backup route.`,
                [
                  {
                    text: 'Cancel',
                    style: 'cancel',
                  },
                  {
                    text: 'Sign out anyway',
                    style: 'destructive',
                    onPress: () => {
                      void signOut();
                    },
                  },
                ],
              );
            },
          },
        ],
      );
      return;
    }

    if (!hasRecoveryBackup) {
      Alert.alert(
        'Before you sign out',
        'Add a backup sign-in method or password backup first so this account is easy to restore if the wrong identity opens later.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Link now',
            onPress: openEmailAccountModal,
          },
          {
            text: 'Sign out anyway',
            style: 'destructive',
            onPress: () => {
              void signOut();
            },
          },
        ],
      );
      return;
    }
    await signOut();
  };

  const handlePromptSelect = async (promptId: string, index: number) => {
    const prompt = PROFILE_PROMPTS.find((p) => p.id === promptId);
    const answer = prompt?.responses?.[index];
    if (!prompt || !answer) return;

    setSelectedPrompts((prev) => ({
      ...prev,
      [promptId]: index,
    }));

    // Add slight animation feedback
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.98,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    if (!profile?.id) return;
    const { error } = await supabase.from('profile_prompts').insert({
      profile_id: profile.id,
      prompt_key: prompt.id,
      prompt_title: prompt.title,
      answer,
    });
    if (error) {
      console.log('[profile] prompt insert error', error);
      return;
    }
    void loadPromptAnswers();
  };

  const saveCustomPrompt = async () => {
    if (!profile?.id) return;
    const title = customPromptTitle.trim();
    const answer = customPromptAnswer.trim();
    if (!title || !answer) return;
    setCustomPromptSaving(true);
    const { error } = await supabase.from('profile_prompts').insert({
      profile_id: profile.id,
      prompt_key: 'custom',
      prompt_title: title,
      answer,
    });
    setCustomPromptSaving(false);
    if (error) {
      console.log('[profile] custom prompt insert error', error);
      return;
    }
    setCustomPromptTitle('');
    setCustomPromptAnswer('');
    void loadPromptAnswers();
  };

  const resetGuessPromptComposer = useCallback(() => {
    setGuessPromptTitle('');
    setGuessPromptAnswer('');
    setGuessPromptHint('');
    setGuessPromptMode('multiple_choice');
    setGuessPromptOptions(['', '', '']);
  }, []);

  const saveGuessPrompt = async () => {
    if (!profile?.id) return;
    const title = guessPromptTitle.trim();
    const answer = guessPromptAnswer.trim();
    if (!title || !answer) return;

    const options =
      guessPromptMode === 'multiple_choice'
        ? shuffleOptions(guessPromptSanitizedOptions)
        : null;

    if (guessPromptMode === 'multiple_choice' && (!options || options.length < 2)) return;

    setGuessPromptSaving(true);
    try {
      const existingGuessIds = promptAnswers
        .filter((row) => row.promptType === 'guess')
        .map((row) => row.id)
        .filter(Boolean);

      if (existingGuessIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('profile_prompts')
          .delete()
          .eq('profile_id', profile.id)
          .in('id', existingGuessIds);
        if (deleteError) {
          console.log('[profile] guess prompt cleanup error', deleteError);
          return;
        }
      }

      const { error } = await supabase.from('profile_prompts').insert({
        profile_id: profile.id,
        prompt_key: 'guess',
        prompt_title: title,
        prompt_type: 'guess',
        answer,
        guess_mode: guessPromptMode,
        guess_options: options,
        hint_text: guessPromptHint.trim() || null,
        normalized_answer: normalizeGuessText(answer),
        reveal_policy: DEFAULT_GUESS_REVEAL_POLICY,
      });

      if (error) {
        console.log('[profile] guess prompt insert error', error);
        return;
      }

      resetGuessPromptComposer();
      void loadPromptAnswers();
    } finally {
      setGuessPromptSaving(false);
    }
  };

  const deletePrompt = useCallback(
    async (promptRowId: string) => {
      if (!profile?.id || !promptRowId) return;
      setDeletingPromptId(promptRowId);
      try {
        const { error } = await supabase
          .from('profile_prompts')
          .delete()
          .eq('profile_id', profile.id)
          .eq('id', promptRowId);
        if (error) {
          console.log('[profile] prompt delete error', error);
          return;
        }
        void loadPromptAnswers();
      } finally {
        setDeletingPromptId(null);
      }
    },
    [loadPromptAnswers, profile?.id],
  );

  const handlePreviewPress = useCallback(() => {
    openFullPreview();
  }, []);

  const openPromptEditor = useCallback(() => {
    setShowPromptEditor(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, promptEditorYRef.current - 24),
          animated: true,
        });
      }, 80);
    });
  }, []);

  const openFullPreview = () => {
    // Navigate to the full profile view screen in preview mode
    const params: Record<string, any> = { 
      profileId: profile?.id || 'preview',
      isPreview: 'true',
    };
    try {
      if (profile) {
        const compatPct = 100;
        const fallback = {
          id: profile.id,
          name: profile.full_name || profile.id,
          age: profile.age,
          location: profile.location || profile.region || '',
          city: (profile as any).city,
          region: profile.region || '',
          avatar_url: profile.avatar_url,
          photos: (profile as any).photos,
          occupation: (profile as any).occupation,
          education: (profile as any).education,
          bio: profile.bio,
          tribe: (profile as any).tribe,
          roots: (profile as any).roots,
          roots_note: (profile as any).roots_note,
          roots_visibility: (profile as any).roots_visibility,
          religion: (profile as any).religion,
          distance: '',
          interests: (profile as any).interests,
          last_active: (profile as any).last_active ?? (profile as any).lastActive ?? null,
          is_active: getPresenceDisplay((profile as any).last_active ?? (profile as any).lastActive).showPresence,
          compatibility: compatPct,
          verified: !!(profile as any).verification_level,
          current_country: (profile as any).current_country,
          current_country_code: (profile as any).current_country_code,
        };
        params.fallbackProfile = encodeURIComponent(JSON.stringify(fallback));
      }
    } catch {}

    router.push({
      pathname: '/profile-view',
      params,
    });
  };

  const toggleSettingsDropdown = () => {
    setShowSettingsDropdown((current) => !current);
  };

  const handleSettingsItemPress = (itemId: string) => {
    setShowSettingsDropdown(false);
    
    if (itemId === 'logout') {
      handleSignOut();
    } else if (itemId === 'appearance') {
      setShowAppearanceModal(true);
    } else if (itemId === 'admin') {
      if (!canSeeAdminTools) return;
      router.push('/admin');
    } else if (itemId === 'email') {
      openEmailAccountModal();
    } else if (itemId === 'notifications') {
      setShowNotificationsModal(true);
    } else if (itemId === 'privacy') {
      router.push('/trust-center');
    } else if (itemId === 'preferences') {
      router.push('/relationship-compass');
    } else if (itemId === 'help') {
      router.push('/support-center');
    } else if (itemId === 'premium') {
      router.push('/premium-plans');
    } else {
      // Handle other settings navigation
      console.log(`Navigate to ${itemId}`);
    }
  };

  const handleThemeChoice = useCallback(
    (value: 'light' | 'dark' | 'system') => {
      setThemePreference(value);
      void Haptics.selectionAsync().catch(() => undefined);
    },
    [setThemePreference],
  );

  const openEmailAccountModal = useCallback(() => {
    setEmailMessage('');
    setEmailError('');
    setIdentityMessage('');
    setIdentityError('');
    setPasswordBackupInput('');
    setPasswordBackupConfirm('');
    setPasswordBackupMessage('');
    setPasswordBackupError('');
    setEmailInput((current) => current || user?.email || '');
    setShowEmailModal(true);
  }, [user?.email]);

  const openRecoveryRequestModal = useCallback(() => {
    setRecoveryError('');
    setRecoveryMessage('');
    setRecoveryCurrentMethod((current) => current || (linkedProviders.includes('google') ? 'google' : 'email'));
    setRecoveryPreviousMethod((current) => current || (linkedProviders.includes('apple') ? 'apple' : 'google'));
    setRecoveryContactEmail((current) => current || user?.email || '');
    setShowRecoveryRequestModal(true);
  }, [linkedProviders, user?.email]);

  const openDeleteAccountModal = useCallback(() => {
    setDeleteError('');
    setDeleteFeedback('');
    setDeleteReasonKeys([]);
    setDeleteAlternativeMessage('');
    setDeleteAlternativeAction(null);
    setShowEmailModal(false);
    setShowDeleteAccountModal(true);
  }, []);

  const handleEmailUpdate = async () => {
    if (!guardAccountAction('Changing your email')) return;
    const trimmed = emailInput.trim().toLowerCase();
    setEmailError('');
    setEmailMessage('');
    if (!trimmed) {
      setEmailError('Please enter an email address.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    try {
      setEmailSaving(true);
      const { error } = await supabase.auth.updateUser(
        { email: trimmed },
        { emailRedirectTo: 'https://getbetweener.com/auth/callback' },
      );
      if (error) {
        setEmailError(error.message);
        return;
      }
      setEmailMessage('Check your new email to confirm the change.');
    } catch (error: any) {
      setEmailError(error?.message ?? 'Unable to update email.');
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePasswordBackupSave = async () => {
    if (!guardAccountAction('Saving a password backup')) return;
    setPasswordBackupError('');
    setPasswordBackupMessage('');
    setIdentityError('');

    if (!user?.email) {
      setPasswordBackupError('Add an email address first so this account has a stable recovery destination.');
      return;
    }

    if (passwordBackupInput.length < 8) {
      setPasswordBackupError('Use at least 8 characters for the backup password.');
      return;
    }

    if (passwordBackupInput !== passwordBackupConfirm) {
      setPasswordBackupError('The password confirmation does not match.');
      return;
    }

    try {
      setPasswordBackupSaving(true);
      const metadata =
        user?.user_metadata && typeof user.user_metadata === 'object'
          ? (user.user_metadata as Record<string, unknown>)
          : {};
      const { data, error } = await supabase.auth.updateUser({
        password: passwordBackupInput,
        data: {
          ...metadata,
          has_password_backup: true,
          recovery_backup_updated_at: new Date().toISOString(),
        },
      });
      if (error) {
        setPasswordBackupError(error.message);
        return;
      }

      setHasPasswordBackup(
        Boolean((data.user?.user_metadata as Record<string, unknown> | undefined)?.has_password_backup ?? true),
      );
      setPasswordBackupInput('');
      setPasswordBackupConfirm('');
      setShowPasswordBackupEditor(false);
      setPasswordBackupMessage('Password backup is ready. This account can now be restored with email + password too.');
      setIdentityMessage('Password backup added to this Betweener account.');
    } catch (error: any) {
      setPasswordBackupError(error?.message ?? 'Unable to save the password backup right now.');
    } finally {
      setPasswordBackupSaving(false);
    }
  };

  const getOAuthRedirectUrl = useCallback(
    () =>
      makeRedirectUri({
        scheme: 'betweenerapp',
        path: 'auth/callback',
      }),
    [],
  );

  const waitForSession = useCallback(async (timeoutMs = 9000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }, []);

  const getUserIdentitySnapshot = useCallback(async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) {
      throw error;
    }

    const identities = (data?.identities ?? [])
      .map((identity) => ({
        id: String(identity.id || '').trim(),
        user_id: String(identity.user_id || '').trim(),
        identity_id: String(identity.identity_id || '').trim(),
        provider: String(identity.provider || '').trim().toLowerCase(),
      }))
      .filter((identity) => identity.id && identity.user_id && identity.identity_id && identity.provider);

    const providers = Array.from(new Set(identities.map((identity) => identity.provider).filter(Boolean)));
    return { identities, providers };
  }, []);

  const waitForProviderIdentity = useCallback(
    async (provider: 'google' | 'apple', timeoutMs = 5000) => {
      const startedAt = Date.now();
      let latestProviders: string[] = [];
      while (Date.now() - startedAt < timeoutMs) {
        const { providers } = await getUserIdentitySnapshot();
        latestProviders = providers;
        if (providers.includes(provider)) {
          return providers;
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      return latestProviders;
    },
    [getUserIdentitySnapshot],
  );

  const loadDisconnectedProviders = useCallback(async () => {
    if (!user?.id) {
      setDisconnectedProviders([]);
      return [];
    }

    try {
      const { data, error } = await supabase.rpc('rpc_get_disconnected_signin_providers' as any);
      if (error) {
        throw error;
      }
      const providers = Array.isArray(data)
        ? data
            .map((value) => String(value || '').trim().toLowerCase())
            .filter((value) => value === 'google' || value === 'apple')
        : [];
      setDisconnectedProviders((current) => (stringListEqual(current, providers) ? current : providers));
      return providers;
    } catch (error: any) {
      if (isLikelyNetworkError(error)) {
        return [];
      }
      setIdentityError(error?.message ?? 'Unable to load sign-in methods.');
      return [];
    }
  }, [user?.id]);

  const loadLinkedIdentities = useCallback(async () => {
    if (!user?.id) {
      setLinkedIdentities([]);
      setLinkedProviders([]);
      return;
    }
    setIdentitiesLoading(true);
    try {
      const { identities, providers } = await getUserIdentitySnapshot();
      setLinkedIdentities((current) => {
        if (
          current.length === identities.length &&
          current.every((identity, index) =>
            identity.id === identities[index]?.id &&
            identity.user_id === identities[index]?.user_id &&
            identity.identity_id === identities[index]?.identity_id &&
            identity.provider === identities[index]?.provider,
          )
        ) {
          return current;
        }
        return identities;
      });
      setLinkedProviders((current) => (stringListEqual(current, providers) ? current : providers));
    } catch (error: any) {
      if (isLikelyNetworkError(error)) {
        return;
      }
      setIdentityError(error?.message ?? 'Unable to load sign-in methods.');
    } finally {
      setIdentitiesLoading(false);
    }
  }, [getUserIdentitySnapshot, user?.id]);

  useEffect(() => {
    if (!showEmailModal || !user?.id) return;
    void loadLinkedIdentities();
    void loadDisconnectedProviders();
  }, [loadDisconnectedProviders, loadLinkedIdentities, showEmailModal, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLinkedProviders([]);
      setDisconnectedProviders([]);
      setLinkedMethodsBannerDismissed(false);
      return;
    }
    void loadLinkedIdentities();
    void loadDisconnectedProviders();
  }, [loadDisconnectedProviders, loadLinkedIdentities, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLinkedMethodsBannerDismissed(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${LINKED_METHODS_BANNER_DISMISSED_KEY}:${user.id}`);
        if (!cancelled) {
          setLinkedMethodsBannerDismissed(raw === '1');
        }
      } catch {
        if (!cancelled) setLinkedMethodsBannerDismissed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const dismissLinkedMethodsBanner = useCallback(async () => {
    setLinkedMethodsBannerDismissed(true);
    if (!user?.id) return;
    try {
      await AsyncStorage.setItem(`${LINKED_METHODS_BANNER_DISMISSED_KEY}:${user.id}`, '1');
    } catch {
      // ignore cache failures
    }
  }, [user?.id]);

  const effectiveLinkedProviders = useMemo(
    () => linkedProviders.filter((provider) => !disconnectedProviders.includes(provider)),
    [disconnectedProviders, linkedProviders],
  );

  const normalizedLinkedRecoveryMethods = useMemo(() => {
    const methods = new Set<string>();
    effectiveLinkedProviders.forEach((provider) => {
      const normalized = String(provider || '').trim().toLowerCase();
      if (normalized === 'email' || normalized === 'google' || normalized === 'apple') {
        methods.add(normalized);
      }
    });
    return Array.from(methods);
  }, [effectiveLinkedProviders]);

  const recoveryMethodPills = useMemo(() => {
    const methods = [...normalizedLinkedRecoveryMethods];
    if (hasPasswordBackup) methods.push('password_backup');
    return methods;
  }, [hasPasswordBackup, normalizedLinkedRecoveryMethods]);

  const isHighRiskOAuthOnlyAccount = useMemo(
    () =>
      !hasPasswordBackup &&
      normalizedLinkedRecoveryMethods.length === 1 &&
      (normalizedLinkedRecoveryMethods[0] === 'google' || normalizedLinkedRecoveryMethods[0] === 'apple'),
    [hasPasswordBackup, normalizedLinkedRecoveryMethods],
  );

  const highRiskProviderLabel = useMemo(() => {
    if (!isHighRiskOAuthOnlyAccount) return 'this sign-in method';
    return RECOVERY_PROVIDER_LABELS[normalizedLinkedRecoveryMethods[0]] ?? 'this sign-in method';
  }, [isHighRiskOAuthOnlyAccount, normalizedLinkedRecoveryMethods]);

  const hasRecoveryBackup =
    normalizedLinkedRecoveryMethods.length >= 2 ||
    hasPasswordBackup;

  const findLinkedIdentity = useCallback(
    (provider: string) =>
      linkedIdentities.find(
        (identity) => String(identity.provider || '').trim().toLowerCase() === String(provider || '').trim().toLowerCase(),
      ) ?? null,
    [linkedIdentities],
  );

  const showProviderSuccess = useCallback(
    (provider: 'google' | 'apple', action: 'linked' | 'reconnected') => {
      const providerLabel = RECOVERY_PROVIDER_LABELS[provider] ?? provider;
      setIdentitySuccessSheet({
        provider,
        title: `${providerLabel} ${action}`,
        body:
          action === 'linked'
            ? `${providerLabel} is now a trusted sign-in route for this Betweener account.`
            : `${providerLabel} can now be used as a trusted sign-in route for this Betweener account again.`,
      });
    },
    [],
  );

  const canSafelyUnlinkProvider = useCallback(
    (provider: string) => {
      const normalized = String(provider || '').trim().toLowerCase();
      if (normalized !== 'google' && normalized !== 'apple') return false;
      const remainingLinkedMethods = normalizedLinkedRecoveryMethods.filter((method) => method !== normalized);
      return remainingLinkedMethods.length > 0 || hasPasswordBackup;
    },
    [hasPasswordBackup, normalizedLinkedRecoveryMethods],
  );

  const recoveryStrength = useMemo(() => {
    if (normalizedLinkedRecoveryMethods.length >= 2 && hasPasswordBackup) {
      return {
        label: 'Strong',
        tone: '#0f766e',
        body: 'This account has more than one trusted way back in if the wrong identity opens first.',
      };
    }
    if (hasRecoveryBackup) {
      return {
        label: 'Protected',
        tone: '#0f766e',
        body: 'You have a backup recovery route. One more method would make restoration even safer.',
      };
    }
    return {
      label: 'Vulnerable',
      tone: '#b45309',
      body: 'Right now one broken sign-in route could strand this account. Add a provider or a password backup.',
    };
  }, [hasPasswordBackup, hasRecoveryBackup, normalizedLinkedRecoveryMethods.length]);

  const shouldShowLinkedMethodsBanner =
    !linkedMethodsBannerDismissed &&
    !identitiesLoading &&
    !hasRecoveryBackup;

  const finishIdentityCallback = useCallback(async (url: string) => {
    if (!isTrustedAuthCallbackUrl(url)) {
      throw new Error("Untrusted auth callback.");
    }

    const merged: AuthCallbackParams = {};
    mergeAuthParamsFromUrl(merged, url);

    const code = merged.code;
    const accessToken = merged.access_token;
    const refreshToken = merged.refresh_token;
    const callbackError = merged.error;
    const callbackErrorDescription = merged.error_description;

    if (callbackError || callbackErrorDescription) {
      throw new Error(
        decodeURIComponent(callbackErrorDescription || callbackError || "Provider linking was cancelled.")
          .replace(/\+/g, " "),
      );
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return;
    }

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    }
  }, []);

  const formatIdentityLinkError = useCallback((error: any, providerLabel: string) => {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('manual linking') && message.includes('disabled')) {
      return `${providerLabel} linking is not enabled on Betweener auth yet. Enable Manual Linking in Supabase Authentication settings, then try again.`;
    }
    if (code === 'identity_already_exists') {
      return `This ${providerLabel} account is already linked to another Betweener account.`;
    }
    if (code === 'identity_not_found') {
      return `${providerLabel} could not be linked right now. Please try again.`;
    }
    return error?.message ?? `Unable to link ${providerLabel}.`;
  }, []);

  const handleLinkGoogle = useCallback(async () => {
    if (!guardAccountAction('Linking Google')) return;
    setIdentityError('');
    setIdentityMessage('');
    setLinkingProvider('google');
    try {
      const redirectTo = getOAuthRedirectUrl();
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo },
      });
      if (error || !data?.url) {
        throw error ?? new Error('Unable to start Google linking.');
      }
      await markPendingIdentityLink('google');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url && isTrustedAuthCallbackUrl(result.url)) {
        await finishIdentityCallback(result.url);
      }

      await waitForSession(4000);
      const providers = await waitForProviderIdentity('google');
      if (providers.includes('google')) {
        await supabase.rpc('rpc_clear_signin_provider_disconnected' as any, { p_provider: 'google' });
        setLinkedProviders(providers);
        await loadDisconnectedProviders();
        setIdentityMessage('Google is now linked to this Betweener account.');
        showProviderSuccess('google', 'linked');
      }
    } catch (error: any) {
      setIdentityError(formatIdentityLinkError(error, 'Google'));
    } finally {
      await clearPendingIdentityLink().catch(() => {});
      setLinkingProvider(null);
    }
  }, [finishIdentityCallback, formatIdentityLinkError, getOAuthRedirectUrl, guardAccountAction, loadDisconnectedProviders, showProviderSuccess, waitForSession, waitForProviderIdentity]);

  const handleLinkApple = useCallback(async () => {
    if (!guardAccountAction('Linking Apple')) return;
    if (Platform.OS !== 'ios') return;
    setIdentityError('');
    setIdentityMessage('');
    setLinkingProvider('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('Apple sign-in failed to return a token.');
      }
      const { error } = await supabase.auth.linkIdentity({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      await waitForSession(4000);
      await supabase.rpc('rpc_clear_signin_provider_disconnected' as any, { p_provider: 'apple' });
      await loadLinkedIdentities();
      await loadDisconnectedProviders();
      setIdentityMessage('Apple is now linked to this Betweener account.');
      showProviderSuccess('apple', 'linked');
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('canceled') || message.toLowerCase().includes('cancelled')) {
        setLinkingProvider(null);
        return;
      }
      setIdentityError(formatIdentityLinkError(error, 'Apple'));
    } finally {
      setLinkingProvider(null);
    }
  }, [formatIdentityLinkError, guardAccountAction, loadDisconnectedProviders, loadLinkedIdentities, showProviderSuccess, waitForSession]);

  const handleUnlinkProvider = useCallback(
    (provider: 'google' | 'apple') => {
      if (!guardAccountAction(`Disconnecting ${RECOVERY_PROVIDER_LABELS[provider] ?? provider}`)) return;
      const providerLabel = RECOVERY_PROVIDER_LABELS[provider] ?? provider;
      const linkedIdentity = findLinkedIdentity(provider);

      if (!linkedIdentity) {
        setIdentityError(`${providerLabel} is not currently linked to this account.`);
        return;
      }

      if (!canSafelyUnlinkProvider(provider)) {
        Alert.alert(
          `Keep ${providerLabel} linked for now`,
          'Add another sign-in method or a password backup before disconnecting this provider so this account stays recoverable.',
        );
        return;
      }

      Alert.alert(
        `Disconnect ${providerLabel}?`,
        `${providerLabel} will stop being an active Betweener sign-in option. Your other recovery methods will stay available.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setIdentityError('');
                setIdentityMessage('');
                setUnlinkingProvider(provider);
                try {
                  const { error: registryError } = await supabase.rpc('rpc_mark_signin_provider_disconnected' as any, {
                    p_provider: provider,
                  });
                  if (registryError) throw registryError;

                  const { error } = await supabase.auth.unlinkIdentity(linkedIdentity);
                  if (error) {
                    // Keep the Betweener-side disconnect registry even if the underlying
                    // provider unlink is a no-op or immediately relinks later.
                    console.log('[profile] unlinkIdentity warning', error);
                  }

                  await waitForSession(4000);
                  await loadLinkedIdentities();
                  await loadDisconnectedProviders();

                  setIdentityMessage(
                    `${providerLabel} has been disconnected for Betweener. Future ${providerLabel} sign-ins will be refused until you reconnect it here.`,
                  );
                } catch (error: any) {
                  setIdentityError(error?.message ?? `Unable to disconnect ${providerLabel} right now.`);
                } finally {
                  setUnlinkingProvider(null);
                }
              })();
            },
          },
        ],
      );
    },
    [canSafelyUnlinkProvider, findLinkedIdentity, guardAccountAction, loadDisconnectedProviders, loadLinkedIdentities, waitForSession],
  );

  const handleReconnectProvider = useCallback(
    async (provider: 'google' | 'apple') => {
      if (!guardAccountAction(`Reconnecting ${RECOVERY_PROVIDER_LABELS[provider] ?? provider}`)) return;
      const providerLabel = RECOVERY_PROVIDER_LABELS[provider] ?? provider;
      setIdentityError('');
      setIdentityMessage('');

      const isStillLinkedUnderneath = linkedProviders.includes(provider);
      if (isStillLinkedUnderneath) {
        setLinkingProvider(provider);
        try {
          const { error } = await supabase.rpc('rpc_clear_signin_provider_disconnected' as any, {
            p_provider: provider,
          });
          if (error) throw error;
          await loadDisconnectedProviders();
          setIdentityMessage(`${providerLabel} can be used to sign in to this Betweener account again.`);
          showProviderSuccess(provider, 'reconnected');
        } catch (error: any) {
          setIdentityError(error?.message ?? `Unable to reconnect ${providerLabel} right now.`);
        } finally {
          setLinkingProvider(null);
        }
        return;
      }

      if (provider === 'google') {
        await handleLinkGoogle();
        return;
      }

      if (provider === 'apple') {
        await handleLinkApple();
      }
    },
    [guardAccountAction, handleLinkApple, handleLinkGoogle, linkedProviders, loadDisconnectedProviders, showProviderSuccess],
  );

  const handleSubmitRecoveryRequest = useCallback(async () => {
    if (!guardAccountAction('Submitting account recovery')) return;
    setRecoveryError('');
    setRecoveryMessage('');

    if (!recoveryContactEmail.trim()) {
      setRecoveryError('Add a contact email so support can reach you.');
      return;
    }

    if (!recoveryNote.trim()) {
      setRecoveryError('Tell us what happened so support can investigate the duplicate account.');
      return;
    }

    setRecoverySubmitting(true);
    try {
      const { data, error } = await supabase.rpc('rpc_request_account_recovery', {
        p_current_sign_in_method: recoveryCurrentMethod,
        p_previous_sign_in_method: recoveryPreviousMethod,
        p_contact_email: recoveryContactEmail.trim(),
        p_previous_account_email: recoveryPreviousEmail.trim() || null,
        p_note: recoveryNote.trim(),
        p_evidence: {
          linked_providers: linkedProviders,
          current_email: user?.email ?? null,
        },
      });
      if (error || !data) {
        throw error ?? new Error('Unable to submit the recovery request.');
      }
      setRecoveryMessage('Recovery request sent. Support will review and help reconnect the right account.');
      setRecoverySubmitting(false);
      setShowRecoveryRequestModal(false);
      setIdentityMessage('Recovery request sent to support.');
    } catch (error: any) {
      setRecoverySubmitting(false);
      setRecoveryError(error?.message ?? 'Unable to submit the recovery request.');
    }
  }, [
    linkedProviders,
    recoveryContactEmail,
    recoveryCurrentMethod,
    recoveryNote,
    recoveryPreviousEmail,
    recoveryPreviousMethod,
    guardAccountAction,
    user?.email,
  ]);

  const toggleDeleteReason = useCallback((reasonKey: string) => {
    setDeleteError('');
    setDeleteAlternativeMessage('');
    setDeleteReasonKeys((current) =>
      current.includes(reasonKey)
        ? current.filter((item) => item !== reasonKey)
        : [...current, reasonKey],
    );
  }, []);

  const applyDeleteAlternative = useCallback(
    async (action: DeleteAlternativeAction) => {
      if (!guardAccountAction('Changing account retention settings')) return;
      setDeleteError('');
      setDeleteAlternativeMessage('');
      setDeleteAlternativeAction(action);
      try {
        const triggerReason = primaryDeleteReason ?? null;
        const { data, error } = await supabase.functions.invoke('account-retention-action', {
          body: {
            action,
            triggerReason,
          },
        });

        if (error || !(data as any)?.success) {
          throw error ?? new Error('Unable to apply that change right now.');
        }

        const returnedPrefs = (data as any)?.notificationPrefs;
        if (returnedPrefs && typeof returnedPrefs === 'object') {
          setNotificationPrefs((current) => {
            const next = {
              ...current,
              ...returnedPrefs,
            };
            writeMeSnapshot({ notificationPrefs: next as unknown as Record<string, unknown> });
            return next;
          });
        }

        if ((data as any)?.profileState) {
          await refreshProfile();
        }

        setDeleteAlternativeMessage(
          String((data as any)?.message || 'Your account settings were updated.')
        );
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          // ignore haptics failures
        }
      } catch (error: any) {
        setDeleteError(error?.message ?? 'Unable to apply that change right now.');
      } finally {
        setDeleteAlternativeAction(null);
      }
    },
    [guardAccountAction, primaryDeleteReason, refreshProfile, writeMeSnapshot],
  );

  const readFunctionErrorMessage = useCallback(async (error: any, fallback: string) => {
    try {
      const response = error?.context;
      if (response && typeof response.clone === 'function') {
        const body = await response.clone().json();
        if (typeof body?.error === 'string' && body.error.trim()) {
          return body.error.trim();
        }
      }
    } catch {
      // ignore malformed function error bodies
    }
    return error?.message ?? fallback;
  }, []);

  const submitDeleteAccount = useCallback(async () => {
    if (!guardAccountAction('Deleting your account')) return;
    setDeleteError('');
    if (deleteReasonKeys.length === 0) {
      setDeleteError('Select at least one reason before deleting your account.');
      return;
    }

    setDeletingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: {
          reasonKeys: deleteReasonKeys,
          feedback: deleteFeedback.trim() || null,
        },
      });

      if (error) {
        throw new Error(await readFunctionErrorMessage(error, 'Unable to delete your account right now.'));
      }

      if (!(data as any)?.success) {
        throw new Error(
          typeof (data as any)?.error === 'string' && (data as any).error.trim()
            ? (data as any).error.trim()
            : 'Unable to delete your account right now.',
        );
      }

      setShowDeleteAccountModal(false);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // ignore haptics failures
      }
      await signOut();
      router.replace('/(auth)/welcome');
      Alert.alert(
        'Account deleted',
        'Your Betweener account has been deleted. Some safety or legal records may be retained where required.',
      );
    } catch (error: any) {
      setDeleteError(error?.message ?? 'Unable to delete your account right now.');
    } finally {
      setDeletingAccount(false);
    }
  }, [deleteFeedback, deleteReasonKeys, guardAccountAction, readFunctionErrorMessage, signOut]);

  const confirmDeleteAccount = useCallback(() => {
    if (deleteReasonKeys.length === 0) {
      setDeleteError('Select at least one reason before deleting your account.');
      return;
    }

    Alert.alert(
      'Close your account permanently?',
      'This permanently closes your Betweener account, removes access, and hides your profile right away. This action cannot be undone. If you have an active App Store subscription, you must cancel it separately in Apple subscription settings.',
      [
        { text: 'Keep the door open', style: 'cancel' },
        {
          text: 'Close permanently',
          style: 'destructive',
          onPress: () => {
            void submitDeleteAccount();
          },
        },
      ],
    );
  }, [deleteReasonKeys.length, submitDeleteAccount]);

  const persistNotificationPrefs = useCallback(
    async (next: NotificationPrefs) => {
      setNotificationPrefs(next);
      writeMeSnapshot({ notificationPrefs: next as unknown as Record<string, unknown> });
      if (!user?.id) return;
      const updatedAt = new Date().toISOString();
      try {
        const { error } = await supabase
          .from('notification_prefs')
          .upsert(
            {
              user_id: user.id,
              ...next,
              updated_at: updatedAt,
            },
            { onConflict: 'user_id' },
          );
        if (error) throw error;
      } catch (error) {
        if (isLikelyNetworkError(error)) {
          if (__DEV__) {
            console.warn('[profile] notification prefs queued offline', error);
          }
          await enqueueNotificationPrefsUpdateMutation({
            userId: user.id,
            prefs: next as Record<string, boolean | string>,
            updatedAt,
          });
          return;
        }
        console.log('[profile] notification prefs update error', error);
      }
    },
    [user?.id, writeMeSnapshot],
  );

  const updateNotificationPref = useCallback(
    async (key: keyof NotificationPrefs, value: boolean) => {
      const next = { ...notificationPrefs, [key]: value };
      await persistNotificationPrefs(next);
    },
    [notificationPrefs, persistNotificationPrefs],
  );

  const updateQuietHours = useCallback(
    async (enabled: boolean, start: string, end: string) => {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const next = {
        ...notificationPrefs,
        quiet_hours_enabled: enabled,
        quiet_hours_start: start,
        quiet_hours_end: end,
        quiet_hours_tz: localTz,
      };
      await persistNotificationPrefs(next);
    },
    [notificationPrefs, persistNotificationPrefs],
  );

  const quietHoursLabel = useCallback((value: string) => value.slice(0, 5), []);

  const activeQuietPreset = useMemo(() => {
    return QUIET_HOURS_PRESETS.find(
      (preset) =>
        preset.start === notificationPrefs.quiet_hours_start
        && preset.end === notificationPrefs.quiet_hours_end,
    );
  }, [notificationPrefs.quiet_hours_end, notificationPrefs.quiet_hours_start]);

  const quietHoursPreview = useMemo(() => {
    if (!notificationPrefs.quiet_hours_enabled) return null;
    const tzLabel = notificationPrefs.quiet_hours_tz || 'UTC';
    return `Quiet hours use ${tzLabel} time`;
  }, [notificationPrefs.quiet_hours_enabled, notificationPrefs.quiet_hours_tz]);

  const normalizedProfileAvatar = normalizeProfilePhotoUri(profile?.avatar_url);
  const normalizedDisplayAvatar = normalizeProfilePhotoUri(displayAvatarUrl);
  const heroImageUri =
    userPhotos[0]
    || normalizedDisplayAvatar
    || normalizedProfileAvatar
    || '';
  const avatarImageUri =
    normalizedDisplayAvatar
    || normalizedProfileAvatar
    || userPhotos[0]
    || '';
  const heroVideoSource =
    displayProfileVideo
    || (profile as any)?.profile_video
    || (profile as any)?.profileVideo
    || '';
  const heroVideoThumbnail =
    (profile as any)?.profile_video_thumbnail
    || (profile as any)?.profileVideoThumbnail
    || null;
  const displayName =
    profile?.full_name
    || (profile as any)?.name
    || 'Your Name';
  const profileInitials = getProfileInitials(displayName, 'B');
  const placeholderPalette = getProfilePlaceholderPalette(user?.id || profile?.id || displayName);
  const hasHeroImage = hasProfileImage(heroImageUri);
  const hasAvatarImage = hasProfileImage(avatarImageUri);
  const displayAge = profile?.age ? String(profile.age) : '';
  const rawBio = (profile?.bio || '').trim();
  const defaultHookLines = [
    'Here for something intentional, not rushed.',
    'Calm energy, deep conversations, good laughs.',
    'I value presence, honesty, and real connection.',
  ];
  const userIdSeed = user?.id || profile?.id || '';
  const hookIndex = userIdSeed
    ? Array.from(userIdSeed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % defaultHookLines.length
    : new Date().getDate() % defaultHookLines.length;
  const isPlaceholderBio =
    rawBio.length < 8 ||
    /^(i'?m|im)\s+(a|an|the)\s+/i.test(rawBio) ||
    /(developer|engineer|founder|ceo|entrepreneur|student)\b/i.test(rawBio);
  const useDefaultBio = !rawBio || isPlaceholderBio;
  const displayBio = useDefaultBio ? defaultHookLines[hookIndex] : rawBio;

  const locationPresentation = buildLocationDisplay(profile as Record<string, any>, { surface: 'profile' });
  const locationDisplay = locationPresentation.withFlag || 'Location not set';
  const personalPremiumPlan = currentPlan === 'FREE' ? null : currentPlan;
  const verificationLevel =
    (profile as any)?.verification_level
    ?? (profile as any)?.verificationLevel
    ?? ((profile as any)?.verified ? 1 : 0);
  const hasPendingVerificationRequest =
    verificationStatus.hasPendingRequest || Boolean(verificationStatus.pendingRequest);
  const showPendingVerificationNudge =
    !verificationStatus.loading && hasPendingVerificationRequest;
  const showInviteVerificationNudge =
    !verificationStatus.loading
    && !hasPendingVerificationRequest
    && verificationLevel === 1
    && !verificationNudgeDismissed;
  useEffect(() => {
    let active = true;

    if (!verificationNudgeDismissedKey || verificationLevel !== 1 || hasPendingVerificationRequest) {
      setVerificationNudgeDismissed(false);
      return () => {
        active = false;
      };
    }

    AsyncStorage.getItem(verificationNudgeDismissedKey)
      .then((value) => {
        if (active) {
          setVerificationNudgeDismissed(value === '1');
        }
      })
      .catch(() => {
        if (active) {
          setVerificationNudgeDismissed(false);
        }
      });

    return () => {
      active = false;
    };
  }, [hasPendingVerificationRequest, verificationLevel, verificationNudgeDismissedKey]);

  const dismissVerificationNudge = useCallback(async () => {
    setVerificationNudgeDismissed(true);
    if (!verificationNudgeDismissedKey) return;
    try {
      await AsyncStorage.setItem(verificationNudgeDismissedKey, '1');
    } catch {
      // Best-effort dismissal persistence only.
    }
  }, [verificationNudgeDismissedKey]);
  const presence = getPresenceDisplay((profile as any)?.last_active ?? (profile as any)?.lastActive);
  const showPresence = presence.showPresence;
  const presenceLabel = presence.label;
  const premiumExpiryReminder = useMemo(() => {
    if (currentPlan === 'FREE' || !currentPlanEndsAt) return null;
    const endsAtTs = Date.parse(currentPlanEndsAt);
    if (Number.isNaN(endsAtTs)) return null;
    const diffMs = endsAtTs - Date.now();
    const diffDays = Math.ceil(diffMs / 86400000);
    if (diffDays < 0 || diffDays > 7) return null;

    const formattedEndsAt = formatMembershipDate(currentPlanEndsAt);
    return {
      title: diffDays <= 1 ? `${currentPlan} renews within 24 hours` : `${currentPlan} renews in ${diffDays} days`,
      body: formattedEndsAt
        ? `Review your membership before ${formattedEndsAt} so your premium signals stay uninterrupted.`
        : 'Review your membership so your premium signals stay uninterrupted.',
    };
  }, [currentPlan, currentPlanEndsAt]);
  const aboutMeText = rawBio || 'Add a few lines about you.';
  const showAboutCard = !!rawBio && rawBio !== displayBio;
  const qualityLabel = useMemo(() => {
    if (typeof matchQuality !== 'number') return 'Fresh';
    if (matchQuality >= 75) return 'Strong';
    if (matchQuality >= 55) return 'Warm';
    if (matchQuality >= 35) return 'Building';
    return 'Fresh';
  }, [matchQuality]);
  const hasGalleryMedia = userPhotos.length > 0 || !!heroVideoSource;
  const promptHighlights = useMemo(
    () =>
      promptAnswers
        .map((row) => {
          const prompt = PROFILE_PROMPTS.find((p) => p.id === row.promptKey);
          const isGuess = row.promptType === 'guess';
          return {
            id: row.id,
            title: row.promptTitle || prompt?.title || 'Prompt',
            answer: isGuess ? `Answer: ${row.answer}` : row.answer,
            eyebrow: isGuess ? 'Guess prompt' : 'Featured prompt',
            meta:
              isGuess && row.guessMode
                ? row.guessMode === 'multiple_choice'
                  ? 'Multiple choice'
                  : 'Type your guess'
                : null,
            promptType: row.promptType || 'standard',
          };
        })
        .slice(0, 2),
    [promptAnswers],
  );
  const featuredPrompt = promptHighlights[0] ?? null;
  const extraPrompts = promptHighlights.slice(1);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [heroVideoUrl, setHeroVideoUrl] = useState<string | null>(null);
  const [introVideoOpen, setIntroVideoOpen] = useState(false);

  const timeStringToDate = useCallback((value: string) => {
    const [hour = '0', minute = '0'] = value.split(':');
    const date = new Date();
    date.setHours(Number(hour));
    date.setMinutes(Number(minute));
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  }, []);

  const dateToTimeString = useCallback((value: Date) => {
    const hh = value.getHours().toString().padStart(2, '0');
    const mm = value.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}:00`;
  }, []);

  const handleStartChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS !== 'ios') {
        setShowStartPicker(false);
      }
      if (event.type === 'dismissed' || !selected) return;
      void updateQuietHours(
        true,
        dateToTimeString(selected),
        notificationPrefs.quiet_hours_end,
      );
    },
    [dateToTimeString, notificationPrefs.quiet_hours_end, updateQuietHours],
  );

  const handleEndChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS !== 'ios') {
        setShowEndPicker(false);
      }
      if (event.type === 'dismissed' || !selected) return;
      void updateQuietHours(
        true,
        notificationPrefs.quiet_hours_start,
        dateToTimeString(selected),
      );
    },
    [dateToTimeString, notificationPrefs.quiet_hours_start, updateQuietHours],
  );

  useEffect(() => {
    let mounted = true;
    const resolveHeroVideo = async () => {
      const source = heroVideoSource;
      if (!source) {
        if (mounted) setHeroVideoUrl(null);
        return;
      }
      if (isLocalMediaUri(source)) {
        if (mounted) setHeroVideoUrl(source);
        return;
      }
      const cachedLocal = await getOfflineVideoUri(source);
      if (cachedLocal && mounted) {
        setHeroVideoUrl(cachedLocal);
      }
      if (source.startsWith('http')) {
        if (!cachedLocal && mounted) {
          setHeroVideoUrl(source);
        }
        const downloaded = await cacheOfflineVideo(source, source);
        if (mounted && downloaded) {
          setHeroVideoUrl(downloaded);
        }
        return;
      }
      const { data, error } = await supabase.storage
        .from('profile-videos')
        .createSignedUrl(source, 3600);
      if (!mounted) return;
      if (error || !data?.signedUrl) {
        if (!cachedLocal) {
          setHeroVideoUrl(null);
        }
        return;
      }
      if (!cachedLocal) {
        setHeroVideoUrl(data.signedUrl);
      }
      const downloaded = await cacheOfflineVideo(source, data.signedUrl);
      if (mounted && downloaded) {
        setHeroVideoUrl(downloaded);
      }
    };
    void resolveHeroVideo();
    return () => {
      mounted = false;
    };
  }, [heroVideoSource]);

  const closeDropdown = () => {
    if (showSettingsDropdown) {
      setShowSettingsDropdown(false);
    }
  };

  // Header animation based on scroll
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.8],
    extrapolate: 'clamp',
  });

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -10],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Verification Notifications */}
      {Boolean(profile?.id) && (
        <VerificationNotifications onOpenVerification={() => setIsVerificationModalVisible(true)} />
      )}
      
      {/* Animated Header */}
      <Animated.View
        style={[
          styles.header,
          {
            backgroundColor: theme.background,
            borderBottomColor: theme.outline,
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            My Profile
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.previewButton}
            onPress={() => router.push('/profile-insights')}
            accessibilityRole="button"
            accessibilityLabel="Open Profile Insights"
          >
            <MaterialCommunityIcons
              name="chart-timeline-variant-shimmer"
              size={18}
              color={theme.accent}
            />
            <Text style={[styles.previewButtonText, { color: theme.accent }]}>
              Insights
            </Text>
            {insightsBadgeCount > 0 ? (
              <View
                style={[
                  styles.previewButtonBadge,
                  {
                    backgroundColor: isDark ? 'rgba(20, 184, 166, 0.18)' : `${theme.tint}18`,
                    borderColor: isDark ? 'rgba(20, 184, 166, 0.28)' : `${theme.tint}2E`,
                  },
                ]}
              >
                <Text style={[styles.previewButtonBadgeText, { color: theme.accent }]}>
                  {insightsBadgeCount > 9 ? '9+' : insightsBadgeCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.insightsButton}
            onPress={handlePreviewPress}
            accessibilityRole="button"
            accessibilityLabel="Open profile preview"
          >
            <MaterialCommunityIcons 
              name="eye"
              size={18} 
              color={theme.tint}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingsButton, showSettingsDropdown && styles.settingsButtonActive]}
            onPress={toggleSettingsDropdown}
          >
            <MaterialCommunityIcons
              name={showSettingsDropdown ? "close" : "cog"}
              size={24}
              color={showSettingsDropdown ? '#fff' : theme.tint}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Settings Sheet */}
      {showSettingsDropdown && (
        <Modal
          visible={showSettingsDropdown}
          animationType="fade"
          transparent
          onRequestClose={closeDropdown}
        >
          <View style={styles.notificationModalBackdrop}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={closeDropdown}
              style={StyleSheet.absoluteFill}
            />

            <View
              style={[
                styles.settingsSheet,
                styles.cardShadow,
                { backgroundColor: theme.background, borderColor: theme.outline },
              ]}
            >
              <View style={styles.notificationModalHeader}>
                <View style={styles.appearanceHeaderCopy}>
                  <Text style={[styles.notificationModalTitle, { color: theme.text }]}>Settings</Text>
                  <Text style={[styles.appearanceHeaderBody, { color: theme.textMuted }]}>
                    Adjust the parts of Betweener that shape your account, privacy, and experience.
                  </Text>
                </View>
                <TouchableOpacity onPress={closeDropdown}>
                  <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.settingsSheetContent}
              >
                {SETTINGS_MENU_ITEMS.filter((item) => {
                  if (item.adminOnly) return canSeeAdminTools;
                  return true;
                }).map((item) => {
                  if (item.type === 'divider') {
                    return <View key={item.id} style={[styles.dropdownDivider, { backgroundColor: theme.outline }]} />;
                  }

                  const helperText =
                    item.id === 'appearance'
                      ? 'Switch light, dark, or follow your device.'
                      : item.id === 'notifications'
                        ? 'Choose what reaches you and when.'
                        : item.id === 'email'
                          ? 'Manage sign-in methods and recovery.'
                          : item.id === 'privacy'
                            ? 'Safety tools, blocks, and trust controls.'
                            : item.id === 'preferences'
                              ? 'Guide who enters your dating room.'
                              : item.id === 'premium'
                                ? 'Review plans, pricing, and benefits.'
                                : item.id === 'help'
                                  ? 'Support, answers, and product guidance.'
                                  : item.id === 'admin'
                                    ? 'Internal moderation and operations tools.'
                                    : item.id === 'logout'
                                      ? 'Sign out of this account on this device.'
                                      : '';

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.settingsSheetItem,
                        { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                        item.id === 'logout' && { backgroundColor: theme.tint + '10', borderColor: theme.tint + '30' },
                      ]}
                      activeOpacity={0.9}
                      onPress={() => handleSettingsItemPress(item.id)}
                    >
                      <View style={[styles.settingsSheetIcon, { backgroundColor: theme.background }]}>
                        <MaterialCommunityIcons
                          name={item.icon as any}
                          size={18}
                          color={item.id === 'logout' ? theme.tint : item.color}
                        />
                      </View>
                      <View style={styles.settingsSheetCopy}>
                        <Text
                          style={[
                            styles.settingsSheetTitle,
                            { color: item.id === 'logout' ? theme.tint : theme.text },
                          ]}
                        >
                          {item.title}
                        </Text>
                        <Text style={[styles.settingsSheetBody, { color: theme.textMuted }]}>{helperText}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {shouldShowLinkedMethodsBanner ? (
        <View
          style={[
            styles.linkedMethodsBanner,
            styles.cardShadowSoft,
            { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
          ]}
        >
          <View style={styles.linkedMethodsBannerHeader}>
            <View style={[styles.linkedMethodsBannerIconWrap, { backgroundColor: theme.tint + '18' }]}>
              <MaterialCommunityIcons name="shield-check-outline" size={18} color={theme.tint} />
            </View>
            <TouchableOpacity onPress={() => void dismissLinkedMethodsBanner()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
            </TouchableOpacity>
            </View>
          <Text style={[styles.linkedMethodsBannerTitle, { color: theme.text }]}>
            {isHighRiskOAuthOnlyAccount ? 'Do not leave this OAuth-only' : 'Secure this account'}
          </Text>
          <Text style={[styles.linkedMethodsBannerBody, { color: theme.textMuted }]}>
            {isHighRiskOAuthOnlyAccount
              ? `Right now ${highRiskProviderLabel} is the only trusted way back in. Add a password backup or another provider before you sign out.`
              : 'Add a second recovery route before you sign out. Google, Apple, or a password backup can stop a duplicate-account dead end later.'}
          </Text>
          <View style={styles.linkedMethodsBannerActions}>
            <TouchableOpacity
              onPress={openEmailAccountModal}
              style={[styles.linkedMethodsBannerPrimary, { backgroundColor: theme.tint }]}
            >
              <Text style={styles.linkedMethodsBannerPrimaryText}>Secure now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void dismissLinkedMethodsBanner()}
              style={[styles.linkedMethodsBannerSecondary, { borderColor: theme.outline, backgroundColor: theme.background }]}
            >
              <Text style={[styles.linkedMethodsBannerSecondaryText, { color: theme.textMuted }]}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Modal
        visible={showAppearanceModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowAppearanceModal(false)}
      >
        <View style={styles.notificationModalBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowAppearanceModal(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.notificationModalCard,
              styles.cardShadow,
              { backgroundColor: theme.background, borderColor: theme.outline },
            ]}
          >
            <View style={styles.notificationModalHeader}>
              <View style={styles.appearanceHeaderCopy}>
                <Text style={[styles.notificationModalTitle, { color: theme.text }]}>Appearance</Text>
                <Text style={[styles.appearanceHeaderBody, { color: theme.textMuted }]}>
                  Choose how Betweener should feel when you open it.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowAppearanceModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.appearancePreviewCard,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(18,53,53,0.96)', 'rgba(15,26,26,0.98)']
                    : ['#F7EFE4', '#E8F8F5', '#FFF6D8']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.appearancePreviewGradient}
              >
                <Text style={[styles.appearancePreviewEyebrow, { color: isDark ? '#F5D36B' : '#946A08' }]}>
                  Betweener mood
                </Text>
                <Text style={[styles.appearancePreviewTitle, { color: theme.text }]}>
                  {themePreference === 'system' ? 'Following your device' : themePreference === 'dark' ? 'Dark mode is active' : 'Light mode is active'}
                </Text>
                <Text style={[styles.appearancePreviewBody, { color: theme.textMuted }]}>
                  {themePreference === 'system'
                    ? `Right now your device is using ${colorScheme}. Betweener will follow automatically.`
                    : 'Your choice applies across the app immediately.'}
                </Text>
                <View style={styles.appearancePreviewChipRow}>
                  <View
                    style={[
                      styles.appearancePreviewChip,
                      { backgroundColor: theme.background, borderColor: theme.outline },
                    ]}
                  >
                    <MaterialCommunityIcons name="theme-light-dark" size={13} color={theme.tint} />
                    <Text style={[styles.appearancePreviewChipText, { color: theme.text }]}>
                      {themePreference === 'system' ? 'Follow device' : themePreference === 'dark' ? 'Dark mode' : 'Light mode'}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            <View style={styles.appearanceOptionList}>
              {([
                {
                  id: 'light',
                  title: 'Light',
                  body: 'Warm, bright, and polished across Betweener.',
                  icon: 'white-balance-sunny',
                },
                {
                  id: 'dark',
                  title: 'Dark',
                  body: 'Calmer at night and stronger around photos and media.',
                  icon: 'weather-night',
                },
                {
                  id: 'system',
                  title: 'Follow device',
                  body: 'Stay aligned with your phone automatically.',
                  icon: 'cellphone-cog',
                },
              ] as const).map((option) => {
                const active = themePreference === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.appearanceOptionCard,
                      { backgroundColor: theme.backgroundSubtle, borderColor: active ? theme.tint : theme.outline },
                      active && [styles.cardShadowSoft, { shadowColor: theme.tint }],
                    ]}
                    activeOpacity={0.9}
                    onPress={() => handleThemeChoice(option.id)}
                  >
                    <View
                      style={[
                        styles.appearanceOptionIcon,
                        { backgroundColor: active ? `${theme.tint}18` : theme.background },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={option.icon}
                        size={18}
                        color={active ? theme.tint : theme.textMuted}
                      />
                    </View>
                    <View style={styles.appearanceOptionCopy}>
                      <View style={styles.appearanceOptionTitleRow}>
                        <Text style={[styles.appearanceOptionTitle, { color: theme.text }]}>{option.title}</Text>
                        {active ? (
                          <View
                            style={[
                              styles.appearanceActivePill,
                              { backgroundColor: `${theme.tint}14`, borderColor: `${theme.tint}3a` },
                            ]}
                          >
                            <Text style={[styles.appearanceActivePillText, { color: theme.tint }]}>Active</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.appearanceOptionBody, { color: theme.textMuted }]}>{option.body}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showNotificationsModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={styles.notificationModalBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowNotificationsModal(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.notificationModalCard,
              styles.cardShadow,
              styles.notificationStudioCard,
              { backgroundColor: theme.background, borderColor: theme.outline },
            ]}
          >
            <View style={styles.notificationModalHeader}>
              <View style={styles.appearanceHeaderCopy}>
                <Text style={[styles.notificationModalTitle, { color: theme.text }]}>Notifications</Text>
                <Text style={[styles.appearanceHeaderBody, { color: theme.textMuted }]}>
                  Shape the signal you want Betweener to carry, surface, or keep quiet.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowNotificationsModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.notificationStudioContent} showsVerticalScrollIndicator={false}>
              <View
                style={[
                  styles.notificationHeroCard,
                  { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                ]}
              >
                <LinearGradient
                  colors={
                    isDark
                      ? ['rgba(18,53,53,0.96)', 'rgba(27,32,27,0.98)', 'rgba(58,46,18,0.94)']
                      : ['#FFF6E8', '#E8F8F5', '#FFF1D2']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.notificationHeroGradient}
                >
                  <View style={styles.notificationHeroArtwork} pointerEvents="none">
                    <View style={[styles.notificationHeroRingLarge, { borderColor: isDark ? 'rgba(245,211,107,0.16)' : 'rgba(15,118,110,0.12)' }]} />
                    <View style={[styles.notificationHeroRingSmall, { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,118,110,0.1)' }]} />
                    <View style={[styles.notificationHeroPulseDot, { backgroundColor: isDark ? '#F5D36B' : '#0F766E' }]} />
                    <View style={[styles.notificationHeroOrbitDot, { backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,118,110,0.18)' }]} />
                  </View>
                  <Text style={[styles.notificationHeroEyebrow, { color: isDark ? '#F5D36B' : '#946A08' }]}>
                    Private signal room
                  </Text>
                  <Text style={[styles.notificationHeroTitle, { color: theme.text }]}>
                    {notificationPrefs.push_enabled ? 'You are fully reachable' : 'Signals stay mostly inside the app'}
                  </Text>
                  <Text style={[styles.notificationHeroBody, { color: theme.textMuted }]}>
                    {notificationPrefs.quiet_hours_enabled
                      ? `Quiet hours protect ${quietHoursLabel(notificationPrefs.quiet_hours_start)}-${quietHoursLabel(notificationPrefs.quiet_hours_end)}.`
                      : 'You can soften nights with quiet hours whenever you want.'}
                  </Text>
                  <View style={styles.notificationHeroChipRow}>
                    <View style={[styles.notificationHeroChip, { backgroundColor: theme.background, borderColor: theme.outline }]}>
                      <MaterialCommunityIcons name="bell-ring-outline" size={13} color={theme.tint} />
                      <Text style={[styles.notificationHeroChipText, { color: theme.text }]}>
                        {notificationPrefs.push_enabled ? 'Push on' : 'Push off'}
                      </Text>
                    </View>
                    <View style={[styles.notificationHeroChip, { backgroundColor: theme.background, borderColor: theme.outline }]}>
                      <MaterialCommunityIcons name="theme-light-dark" size={13} color={theme.tint} />
                      <Text style={[styles.notificationHeroChipText, { color: theme.text }]}>
                        {notificationPrefs.preview_text ? 'Preview visible' : 'Preview hidden'}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Core signals</Text>
                <View style={styles.notificationCardGrid}>
                  {NOTIFICATION_CORE_OPTIONS.map((item) => (
                    <NotificationToggle
                      key={item.key}
                      label={item.label}
                      description={item.body}
                      icon={item.icon}
                      value={notificationPrefs[item.key]}
                      onValueChange={(val) => updateNotificationPref(item.key, val)}
                      theme={theme}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Control room</Text>
                <View style={styles.notificationCardGrid}>
                  {NOTIFICATION_CONTROL_OPTIONS.map((item) => (
                    <NotificationToggle
                      key={item.key}
                      label={item.label}
                      description={item.body}
                      icon={item.icon}
                      value={notificationPrefs[item.key]}
                      onValueChange={(val) => updateNotificationPref(item.key, val)}
                      theme={theme}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Quiet hours</Text>
                <View
                  style={[
                    styles.quietHoursStudioCard,
                    { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                  ]}
                >
                  <NotificationToggle
                    label="Silence pushes"
                    description="Hold alerts back when the day should go still."
                    icon="weather-night"
                    value={notificationPrefs.quiet_hours_enabled}
                    onValueChange={(val) =>
                      updateQuietHours(val, notificationPrefs.quiet_hours_start, notificationPrefs.quiet_hours_end)
                    }
                    theme={theme}
                  />
                  {notificationPrefs.quiet_hours_enabled ? (
                    <>
                      <View style={styles.quietHoursSummaryRow}>
                        <View style={[styles.quietHoursSummaryPill, { backgroundColor: theme.background, borderColor: theme.outline }]}>
                          <MaterialCommunityIcons name="clock-time-four-outline" size={13} color={theme.tint} />
                          <Text style={[styles.quietHoursSummaryText, { color: theme.text }]}>
                            {`${quietHoursLabel(notificationPrefs.quiet_hours_start)}-${quietHoursLabel(notificationPrefs.quiet_hours_end)}`}
                          </Text>
                        </View>
                        {quietHoursPreview ? (
                          <Text style={[styles.quietHoursSummaryMeta, { color: theme.textMuted }]}>{quietHoursPreview}</Text>
                        ) : null}
                      </View>
                      <View style={styles.quietHoursPills}>
                        {QUIET_HOURS_PRESETS.map((preset) => {
                          const active = activeQuietPreset?.id === preset.id;
                          return (
                            <TouchableOpacity
                              key={preset.id}
                              style={[
                                styles.quietHoursPill,
                                { backgroundColor: theme.background, borderColor: theme.outline },
                                active && { backgroundColor: theme.tint, borderColor: theme.tint },
                              ]}
                              onPress={() => updateQuietHours(true, preset.start, preset.end)}
                            >
                              <Text
                                style={[
                                  styles.quietHoursPillText,
                                  { color: theme.text },
                                  active && { color: '#fff' },
                                ]}
                              >
                                {preset.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={styles.quietHoursCustomRow}>
                        <TouchableOpacity
                          style={[
                            styles.quietHoursInput,
                            { borderColor: theme.outline, backgroundColor: theme.background },
                          ]}
                          onPress={() => setShowStartPicker(true)}
                        >
                          <Text style={[styles.quietHoursInputText, { color: theme.text }]}>
                            {quietHoursLabel(notificationPrefs.quiet_hours_start)}
                          </Text>
                        </TouchableOpacity>
                        <Text style={[styles.quietHoursDash, { color: theme.textMuted }]}>to</Text>
                        <TouchableOpacity
                          style={[
                            styles.quietHoursInput,
                            { borderColor: theme.outline, backgroundColor: theme.background },
                          ]}
                          onPress={() => setShowEndPicker(true)}
                        >
                          <Text style={[styles.quietHoursInputText, { color: theme.text }]}>
                            {quietHoursLabel(notificationPrefs.quiet_hours_end)}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {showStartPicker ? (
                        <DateTimePicker
                          mode="time"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          value={timeStringToDate(notificationPrefs.quiet_hours_start)}
                          onChange={handleStartChange}
                        />
                      ) : null}
                      {showEndPicker ? (
                        <DateTimePicker
                          mode="time"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          value={timeStringToDate(notificationPrefs.quiet_hours_end)}
                          onChange={handleEndChange}
                        />
                      ) : null}
                    </>
                  ) : (
                    <Text style={[styles.quietHoursSummaryMeta, { color: theme.textMuted }]}>
                      Quiet hours are off. Betweener can still respect your push and preview choices above.
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Optional signals</Text>
                <View style={styles.notificationCardGrid}>
                  {NOTIFICATION_OPTIONAL_OPTIONS.map((item) => (
                    <NotificationToggle
                      key={item.key}
                      label={item.label}
                      description={item.body}
                      icon={item.icon}
                      value={notificationPrefs[item.key]}
                      onValueChange={(val) => updateNotificationPref(item.key, val)}
                      theme={theme}
                    />
                  ))}
                </View>
              </View>

              {!notificationPrefsLoaded ? (
                <Text style={[styles.notificationLoading, { color: theme.textMuted }]}>Loading preferences...</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEmailModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEmailModal(false)}
      >
        <View style={styles.emailModalBackdrop}>
          <View
            style={[
              styles.emailModalCard,
              styles.deleteModalCard,
              styles.cardShadow,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <View style={styles.emailModalHeader}>
              <Text style={[styles.emailModalTitle, { color: theme.text }]}>Email & Account</Text>
              <TouchableOpacity onPress={() => setShowEmailModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.emailModalScroll}
              contentContainerStyle={styles.emailModalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
            {!accountNetworkReady ? (
              <View style={[styles.accountOfflineNotice, { backgroundColor: `${theme.tint}12`, borderColor: `${theme.tint}33` }]}>
                <MaterialCommunityIcons name="wifi-off" size={16} color={theme.tint} />
                <Text style={[styles.accountOfflineNoticeText, { color: theme.text }]}>
                  Account state is readable offline. Security actions need a live connection before they can continue.
                </Text>
              </View>
            ) : null}
            <Text style={[styles.emailModalBody, { color: theme.textMuted }]}>
              Update the email you use to sign in. We&apos;ll send a confirmation link to your new email.
            </Text>
            <TextInput
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="you@example.com"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[
                styles.emailInput,
                { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
              ]}
            />
            {emailError ? (
              <Text style={[styles.emailError, { color: '#ef4444' }]}>{emailError}</Text>
            ) : null}
            {emailMessage ? (
              <Text style={[styles.emailMessage, { color: theme.tint }]}>{emailMessage}</Text>
            ) : null}
            <TouchableOpacity
              style={[
                styles.emailSaveButton,
                { backgroundColor: theme.tint, opacity: emailSaving || !accountNetworkReady ? 0.6 : 1 },
              ]}
              onPress={handleEmailUpdate}
              disabled={emailSaving || !accountNetworkReady}
            >
              <Text style={styles.emailSaveText}>
                {emailSaving ? 'Sending...' : accountNetworkReady ? 'Send confirmation' : 'Requires connection'}
              </Text>
            </TouchableOpacity>
            <View style={[styles.emailAccountDivider, { backgroundColor: theme.outline }]} />
            {identitySuccessSheet ? (
              <View style={[styles.identitySuccessInlineCard, { backgroundColor: theme.background, borderColor: `${theme.tint}33` }]}>
                <LinearGradient
                  colors={[`${theme.tint}20`, `${theme.accent}14`, 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.identitySuccessInlineGlow}
                  pointerEvents="none"
                />
                <View style={styles.identitySuccessInlineHeader}>
                  <View style={[styles.identitySuccessInlineIconHalo, { backgroundColor: `${theme.tint}18`, borderColor: `${theme.tint}40` }]}>
                    <LinearGradient
                      colors={[theme.tint, theme.accent]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.identitySuccessInlineIconCore}
                    >
                      <MaterialCommunityIcons
                        name={identitySuccessSheet.provider === 'google' ? 'google' : 'apple'}
                        size={20}
                        color="#FFFFFF"
                      />
                    </LinearGradient>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIdentitySuccessSheet(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.identitySuccessInlineEyebrow, { color: theme.tint }]}>SIGN-IN METHOD SECURED</Text>
                <Text style={[styles.identitySuccessInlineTitle, { color: theme.text }]}>
                  {identitySuccessSheet.title}
                </Text>
                <Text style={[styles.identitySuccessInlineBody, { color: theme.textMuted }]}>
                  {identitySuccessSheet.body}
                </Text>
              </View>
            ) : null}
            <View style={styles.identitySection}>
              <Text style={[styles.identitySectionTitle, { color: theme.text }]}>Linked sign-in methods</Text>
              <Text style={[styles.identitySectionBody, { color: theme.textMuted }]}>
                Keep one primary sign-in route and at least one backup route so Betweener can always restore the right account.
              </Text>

              <View
                style={[
                  styles.recoveryStrengthCard,
                  { backgroundColor: theme.background, borderColor: theme.outline },
                ]}
              >
                <View style={styles.recoveryStrengthHeader}>
                  <View style={styles.recoveryStrengthCopy}>
                    <Text style={[styles.recoveryStrengthTitle, { color: theme.text }]}>Recovery strength</Text>
                    <Text style={[styles.recoveryStrengthBody, { color: theme.textMuted }]}>
                      {recoveryStrength.body}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.recoveryStrengthPill,
                      { backgroundColor: `${recoveryStrength.tone}14`, borderColor: `${recoveryStrength.tone}33` },
                    ]}
                  >
                    <Text style={[styles.recoveryStrengthPillText, { color: recoveryStrength.tone }]}>
                      {recoveryStrength.label}
                    </Text>
                  </View>
                </View>
                <View style={styles.recoveryStrengthMethods}>
                  {recoveryMethodPills.map((method) => (
                    <View
                      key={method}
                      style={[
                        styles.recoveryStrengthMethodPill,
                        { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={RECOVERY_PROVIDER_ICONS[method] ?? 'shield-check-outline'}
                        size={13}
                        color={theme.tint}
                      />
                      <Text style={[styles.recoveryStrengthMethodText, { color: theme.text }]}>
                        {RECOVERY_PROVIDER_LABELS[method] ?? method}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View
                style={[
                  styles.identityMethodCard,
                  { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                ]}
              >
                <View style={styles.identityMethodMeta}>
                  <View style={[styles.identityMethodIcon, { backgroundColor: theme.background }]}>
                    <MaterialCommunityIcons name="email-outline" size={18} color={theme.tint} />
                  </View>
                  <View style={styles.identityMethodTextWrap}>
                    <Text style={[styles.identityMethodTitle, { color: theme.text }]}>Email</Text>
                    <Text style={[styles.identityMethodSubtitle, { color: theme.textMuted }]}>
                      {user?.email || 'No email on file'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.identityStatusPill, { backgroundColor: theme.tint + '18', borderColor: theme.tint }]}>
                  <Text style={[styles.identityStatusText, { color: theme.tint }]}>Primary</Text>
                </View>
              </View>

              <View
                style={[
                  styles.identityMethodCard,
                  { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                ]}
              >
                <View style={styles.identityMethodMeta}>
                  <View style={[styles.identityMethodIcon, { backgroundColor: theme.background }]}>
                    <MaterialCommunityIcons name="google" size={18} color="#EA4335" />
                  </View>
                  <View style={styles.identityMethodTextWrap}>
                    <Text style={[styles.identityMethodTitle, { color: theme.text }]}>Google</Text>
                    <Text style={[styles.identityMethodSubtitle, { color: theme.textMuted }]}>
                      {disconnectedProviders.includes('google')
                        ? 'Disconnected for Betweener'
                        : linkedProviders.includes('google')
                          ? 'Linked to this account'
                          : 'Not linked yet'}
                    </Text>
                  </View>
                </View>
                {disconnectedProviders.includes('google') ? (
                  <View style={styles.identityActions}>
                    <View style={[styles.identityStatusPill, { backgroundColor: '#ef444418', borderColor: '#ef4444' }]}>
                      <Text style={[styles.identityStatusText, { color: '#ef4444' }]}>Disconnected</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => void handleReconnectProvider('google')}
                      disabled={identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady}
                      style={[
                        styles.identityLinkButton,
                        {
                          backgroundColor: theme.tint,
                            opacity: identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady ? 0.65 : 1,
                          },
                        ]}
                    >
                      <Text style={styles.identityLinkButtonText}>
                        {linkingProvider === 'google' ? 'Reconnecting...' : accountNetworkReady ? 'Reconnect' : 'Requires connection'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : linkedProviders.includes('google') ? (
                  <View style={styles.identityActions}>
                    <View style={[styles.identityStatusPill, { backgroundColor: theme.tint + '18', borderColor: theme.tint }]}>
                      <Text style={[styles.identityStatusText, { color: theme.tint }]}>Linked</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleUnlinkProvider('google')}
                      disabled={identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady}
                      style={[
                        styles.identityUnlinkButton,
                        {
                          borderColor: '#ef4444',
                          opacity: identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.identityUnlinkButtonText}>
                        {unlinkingProvider === 'google' ? 'Disconnecting...' : accountNetworkReady ? 'Disconnect' : 'Requires connection'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleLinkGoogle}
                    disabled={identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady}
                    style={[
                      styles.identityLinkButton,
                      {
                        backgroundColor: theme.tint,
                        opacity: identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady ? 0.65 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.identityLinkButtonText}>
                      {linkingProvider === 'google' ? 'Linking...' : accountNetworkReady ? 'Link Google' : 'Requires connection'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {Platform.OS === 'ios' ? (
                <View
                  style={[
                    styles.identityMethodCard,
                    { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                  ]}
                >
                  <View style={styles.identityMethodMeta}>
                    <View style={[styles.identityMethodIcon, { backgroundColor: theme.background }]}>
                      <MaterialCommunityIcons name="apple" size={18} color={theme.text} />
                    </View>
                    <View style={styles.identityMethodTextWrap}>
                      <Text style={[styles.identityMethodTitle, { color: theme.text }]}>Apple</Text>
                      <Text style={[styles.identityMethodSubtitle, { color: theme.textMuted }]}>
                        {disconnectedProviders.includes('apple')
                          ? 'Disconnected for Betweener'
                          : linkedProviders.includes('apple')
                            ? 'Linked to this account'
                            : 'Not linked yet'}
                      </Text>
                    </View>
                  </View>
                  {disconnectedProviders.includes('apple') ? (
                    <View style={styles.identityActions}>
                      <View style={[styles.identityStatusPill, { backgroundColor: '#ef444418', borderColor: '#ef4444' }]}>
                        <Text style={[styles.identityStatusText, { color: '#ef4444' }]}>Disconnected</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => void handleReconnectProvider('apple')}
                        disabled={identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady}
                        style={[
                          styles.identityLinkButton,
                          {
                            backgroundColor: theme.tint,
                            opacity: identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady ? 0.65 : 1,
                          },
                        ]}
                      >
                        <Text style={styles.identityLinkButtonText}>
                          {linkingProvider === 'apple' ? 'Reconnecting...' : accountNetworkReady ? 'Reconnect' : 'Requires connection'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : linkedProviders.includes('apple') ? (
                    <View style={styles.identityActions}>
                      <View style={[styles.identityStatusPill, { backgroundColor: theme.tint + '18', borderColor: theme.tint }]}>
                        <Text style={[styles.identityStatusText, { color: theme.tint }]}>Linked</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleUnlinkProvider('apple')}
                        disabled={identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady}
                        style={[
                          styles.identityUnlinkButton,
                          {
                            borderColor: '#ef4444',
                            opacity: identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady ? 0.6 : 1,
                          },
                        ]}
                      >
                        <Text style={styles.identityUnlinkButtonText}>
                          {unlinkingProvider === 'apple' ? 'Disconnecting...' : accountNetworkReady ? 'Disconnect' : 'Requires connection'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={handleLinkApple}
                      disabled={identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady}
                      style={[
                        styles.identityLinkButton,
                        {
                          backgroundColor: theme.tint,
                          opacity: identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady ? 0.65 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.identityLinkButtonText}>
                        {linkingProvider === 'apple' ? 'Linking...' : accountNetworkReady ? 'Link Apple' : 'Requires connection'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}

              <Text style={[styles.identitySupportText, { color: theme.textMuted }]}>
                Disconnect Google or Apple here any time, as long as another sign-in method or password backup remains on the account.
              </Text>

              <View
                style={[
                  styles.passwordBackupCard,
                  { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                ]}
              >
                <View style={styles.recoveryCardCopy}>
                  <View style={styles.passwordBackupTitleRow}>
                    <Text style={[styles.recoveryCardTitle, { color: theme.text }]}>Password backup</Text>
                    {hasPasswordBackup ? (
                      <View style={[styles.identityStatusPill, { backgroundColor: theme.tint + '18', borderColor: theme.tint }]}>
                        <Text style={[styles.identityStatusText, { color: theme.tint }]}>Ready</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.recoveryCardBody, { color: theme.textMuted }]}>
                    {hasPasswordBackup
                      ? 'A password-based recovery route is already attached to this account. Refresh it any time you want a stronger fallback.'
                      : 'Set a private backup password so email can restore this account even if Apple or Google opens the wrong profile first.'}
                  </Text>
                </View>
                <View style={styles.passwordBackupActions}>
                  <TouchableOpacity
                    onPress={() => setShowPasswordBackupEditor((current) => !current)}
                    style={[
                      styles.passwordBackupSecondaryButton,
                      { borderColor: theme.outline, backgroundColor: theme.background },
                    ]}
                  >
                    <Text style={[styles.passwordBackupSecondaryText, { color: theme.text }]}>
                      {showPasswordBackupEditor
                        ? 'Hide password setup'
                        : hasPasswordBackup
                          ? 'Refresh password backup'
                          : 'Set up password backup'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {showPasswordBackupEditor ? (
                  <View style={styles.passwordBackupEditor}>
                    <TextInput
                      value={passwordBackupInput}
                      onChangeText={setPasswordBackupInput}
                      placeholder="Create backup password"
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      style={[
                        styles.emailInput,
                        { color: theme.text, borderColor: theme.outline, backgroundColor: theme.background },
                      ]}
                    />
                    <TextInput
                      value={passwordBackupConfirm}
                      onChangeText={setPasswordBackupConfirm}
                      placeholder="Confirm backup password"
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      style={[
                        styles.emailInput,
                        { color: theme.text, borderColor: theme.outline, backgroundColor: theme.background },
                      ]}
                    />
                    {passwordBackupError ? (
                      <Text style={[styles.identityError, { color: '#ef4444' }]}>{passwordBackupError}</Text>
                    ) : null}
                    {passwordBackupMessage ? (
                      <Text style={[styles.identityMessage, { color: theme.tint }]}>{passwordBackupMessage}</Text>
                    ) : null}
                    <TouchableOpacity
                      onPress={handlePasswordBackupSave}
                      disabled={passwordBackupSaving || !user?.email || !accountNetworkReady}
                      style={[
                        styles.passwordBackupButton,
                        { backgroundColor: theme.tint, opacity: passwordBackupSaving || !user?.email || !accountNetworkReady ? 0.65 : 1 },
                      ]}
                    >
                      <Text style={styles.identityLinkButtonText}>
                        {passwordBackupSaving ? 'Saving...' : accountNetworkReady ? 'Save password backup' : 'Requires connection'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : passwordBackupMessage ? (
                  <Text style={[styles.identityMessage, { color: theme.tint }]}>{passwordBackupMessage}</Text>
                ) : null}
              </View>

              {identityError ? (
                <Text style={[styles.identityError, { color: '#ef4444' }]}>{identityError}</Text>
              ) : null}
              {identityMessage ? (
                <Text style={[styles.identityMessage, { color: theme.tint }]}>{identityMessage}</Text>
              ) : null}
              {identitiesLoading ? (
                <Text style={[styles.identityLoading, { color: theme.textMuted }]}>Checking sign-in methods...</Text>
              ) : null}

              <View style={[styles.recoveryCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                <View style={styles.recoveryCardCopy}>
                  <Text style={[styles.recoveryCardTitle, { color: theme.text }]}>Having trouble with another sign-in method?</Text>
                  <Text style={[styles.recoveryCardBody, { color: theme.textMuted }]}>
                    If Apple, Google, or email still opens the wrong Betweener account, the automatic recovery flow will try first. This support request stays here as the final safety net.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={openRecoveryRequestModal}
                  disabled={!accountNetworkReady}
                  style={[styles.recoveryCardButton, { backgroundColor: theme.tint, opacity: accountNetworkReady ? 1 : 0.65 }]}
                >
                  <Text style={styles.recoveryCardButtonText}>
                    {accountNetworkReady ? 'Recover account access' : 'Requires connection'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.accountDeletionCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                <View style={styles.accountDeletionHeaderRow}>
                  <View style={styles.accountDeletionCopy}>
                    <Text style={[styles.recoveryCardTitle, { color: theme.text }]}>Leave Betweener</Text>
                    <Text style={[styles.recoveryCardBody, { color: theme.textMuted }]}>
                      Tell us why you are leaving, then choose whether to step back or close this account permanently.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={openDeleteAccountModal}
                    disabled={!accountNetworkReady}
                    style={[styles.accountDeletionButton, { borderColor: '#ef4444', backgroundColor: theme.background, opacity: accountNetworkReady ? 1 : 0.6 }]}
                  >
                    <Text style={styles.accountDeletionButtonText}>{accountNetworkReady ? 'Leave now' : 'Requires connection'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.accountDeletionFootnote, { color: theme.textMuted }]}>
                  We&apos;ll offer calmer options before anything is closed permanently.
                </Text>
              </View>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDeleteAccountModal}
        animationType="fade"
        transparent
        onRequestClose={() => (!deletingAccount ? setShowDeleteAccountModal(false) : null)}
      >
        <View style={[styles.emailModalBackdrop, styles.deleteModalBackdrop]}>
          <View
            style={[
              styles.emailModalCard,
              styles.deleteModalCard,
              styles.cardShadow,
              { backgroundColor: theme.background, borderColor: theme.outline },
            ]}
          >
            <View
              style={styles.emailModalHeader}
            >
              <Text style={[styles.emailModalTitle, { color: theme.text }]}>Delete account</Text>
              <TouchableOpacity disabled={deletingAccount} onPress={() => setShowDeleteAccountModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.deleteModalScroll}
              contentContainerStyle={styles.deleteModalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets
              contentInset={{ bottom: Platform.OS === 'ios' ? 28 : 20 }}
              scrollIndicatorInsets={{ bottom: Platform.OS === 'ios' ? 28 : 20 }}
            >
              <Text style={[styles.deleteEyebrow, { color: theme.tint }]}>Before you leave Betweener</Text>
              <Text style={[styles.emailModalBody, { color: theme.textMuted }]}>
                Step back for now, or close your account fully if you still want to leave.
              </Text>

              <View style={[styles.deleteAlternativePanel, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                <View style={styles.deleteAlternativePanelCopy}>
                  <Text style={[styles.deleteAlternativePanelTitle, { color: theme.text }]}>A calmer option first</Text>
                  <Text style={[styles.deleteAlternativePanelBody, { color: theme.textMuted }]}>
                    Step back, quiet the app, or leave fully if you still want to.
                  </Text>
                </View>
                <View style={styles.deleteAlternativeActions}>
                  {DELETE_SOFT_OFFRAMP_OPTIONS.map((option) => {
                    const pending = deleteAlternativeAction === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        disabled={deletingAccount || deleteAlternativeAction !== null}
                        onPress={() => {
                          void applyDeleteAlternative(option.id);
                        }}
                        style={[
                          styles.deleteAlternativeButton,
                          {
                            backgroundColor: theme.background,
                            borderColor: theme.outline,
                            opacity: deletingAccount || deleteAlternativeAction !== null ? 0.7 : 1,
                          },
                        ]}
                      >
                        <View style={styles.deleteAlternativeButtonTextWrap}>
                          <Text style={[styles.deleteAlternativeButtonTitle, { color: theme.text }]}>
                            {pending ? 'Applying...' : option.title}
                          </Text>
                          <Text style={[styles.deleteAlternativeButtonBody, { color: theme.textMuted }]}>
                            {option.description}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {deleteAlternativeMessage ? (
                  <View style={[styles.deleteAlternativeMessageCard, { backgroundColor: theme.tint + '12', borderColor: theme.tint + '60' }]}>
                    <Text style={[styles.deleteAlternativeMessageText, { color: theme.text }]}>
                      {deleteAlternativeMessage}
                    </Text>
                  </View>
                ) : null}
              </View>

              {deleteReasonSuggestion ? (
                <View style={[styles.deleteSuggestionCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                  <View style={styles.deleteSuggestionCopy}>
                    <Text style={[styles.deleteSuggestionLabel, { color: theme.tint }]}>Suggested instead</Text>
                    <Text style={[styles.deleteSuggestionTitle, { color: theme.text }]}>{deleteReasonSuggestion.title}</Text>
                    <Text style={[styles.deleteSuggestionBody, { color: theme.textMuted }]}>
                      {deleteReasonSuggestion.description}
                    </Text>
                  </View>
                  <TouchableOpacity
                    disabled={deletingAccount || deleteAlternativeAction !== null}
                    onPress={() => {
                      void applyDeleteAlternative(deleteReasonSuggestion.action);
                    }}
                    style={[
                      styles.deleteSuggestionButton,
                      {
                        backgroundColor: theme.tint,
                        opacity: deletingAccount || deleteAlternativeAction !== null ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.deleteSuggestionButtonText}>{deleteReasonSuggestion.cta}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.deleteReasonList}>
                {deleteReasonSections.map(([section, options]) => (
                  <View key={section} style={styles.deleteReasonSection}>
                    <Text style={[styles.deleteSectionLabel, { color: theme.textMuted }]}>{section}</Text>
                    <View style={styles.deleteReasonSectionRows}>
                      {options.map((option) => {
                        const selected = deleteReasonKeys.includes(option.value);
                        return (
                          <TouchableOpacity
                            key={option.value}
                            onPress={() => toggleDeleteReason(option.value)}
                            style={[
                              styles.deleteReasonRow,
                              selected && styles.deleteReasonRowSelected,
                              {
                                backgroundColor: selected ? theme.tint + '12' : theme.backgroundSubtle,
                                borderColor: selected ? theme.tint + '88' : theme.outline,
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.deleteReasonAccent,
                                { backgroundColor: theme.tint, opacity: selected ? 1 : 0 },
                              ]}
                            />
                            <View
                              style={[
                                styles.deleteReasonCheck,
                                {
                                  backgroundColor: selected ? theme.tint + '22' : theme.background,
                                  borderColor: selected ? theme.tint : theme.outline,
                                },
                              ]}
                            >
                              {selected ? (
                                <View style={[styles.deleteReasonCheckDot, { backgroundColor: theme.tint }]} />
                              ) : null}
                            </View>
                            <View style={styles.deleteReasonCopy}>
                              <View style={styles.deleteReasonTitleRow}>
                                <Text style={[styles.deleteReasonTitle, { color: theme.text }]}>{option.label}</Text>
                                {selected ? (
                                  <View style={[styles.deleteReasonSelectedPill, { backgroundColor: theme.tint + '16', borderColor: theme.tint + '55' }]}>
                                    <Text style={[styles.deleteReasonSelectedText, { color: theme.tint }]}>Selected</Text>
                                  </View>
                                ) : null}
                              </View>
                              {selected ? (
                                <Text style={[styles.deleteReasonDescription, { color: theme.textMuted }]}>{option.description}</Text>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>

              <Text style={[styles.recoveryFieldLabel, { color: theme.text }]}>Anything else you want us to know? (optional)</Text>
              <TextInput
                value={deleteFeedback}
                onChangeText={setDeleteFeedback}
                placeholder="Optional feedback"
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={1000}
                scrollEnabled
                style={[
                  styles.deleteFeedbackInput,
                  { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
                ]}
              />

              {deleteError ? (
                <Text style={[styles.emailError, { color: '#ef4444' }]}>{deleteError}</Text>
              ) : null}

              <View style={[styles.deleteFooterCard, { backgroundColor: theme.background, borderColor: theme.outline }]}>
                <View style={styles.deleteFooterCopy}>
                  <Text style={[styles.deleteFooterTitle, { color: theme.text }]}>Close my account permanently</Text>
                  <Text style={[styles.deleteFooterBody, { color: theme.textMuted }]}>
                    This removes access and closes your place in Betweener right away. If you may come back later, step back instead.
                  </Text>
                  <Text style={[styles.deleteFooterBody, { color: theme.textMuted }]}>
                    Active App Store subscriptions are managed by Apple and must be cancelled separately in Apple subscription settings.
                  </Text>
                </View>
                <View style={styles.deleteActionRow}>
                  <TouchableOpacity
                    disabled={deletingAccount}
                    onPress={() => setShowDeleteAccountModal(false)}
                    style={[styles.deleteCancelButton, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
                  >
                    <Text style={[styles.deleteCancelButtonText, { color: theme.text }]}>Keep the door open</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={deletingAccount}
                    onPress={confirmDeleteAccount}
                    style={[styles.deleteConfirmButton, { backgroundColor: '#C65263', opacity: deletingAccount ? 0.65 : 1 }]}
                  >
                    <Text style={styles.deleteConfirmButtonText}>
                      {deletingAccount ? 'Closing...' : 'Close permanently'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRecoveryRequestModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowRecoveryRequestModal(false)}
      >
        <View style={styles.emailModalBackdrop}>
          <View
            style={[
              styles.emailModalCard,
              styles.cardShadow,
              { backgroundColor: theme.background, borderColor: theme.outline },
            ]}
          >
            <View style={styles.emailModalHeader}>
              <Text style={[styles.emailModalTitle, { color: theme.text }]}>Recover account access</Text>
              <TouchableOpacity onPress={() => setShowRecoveryRequestModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.emailModalBody, { color: theme.textMuted }]}>
              Tell support which sign-in method opened the wrong account and which one you used before. We will review it before any account merge.
            </Text>
            {!accountNetworkReady ? (
              <View style={[styles.accountOfflineNotice, { backgroundColor: `${theme.tint}12`, borderColor: `${theme.tint}33` }]}>
                <MaterialCommunityIcons name="wifi-off" size={16} color={theme.tint} />
                <Text style={[styles.accountOfflineNoticeText, { color: theme.text }]}>
                  Recovery drafts stay here locally. Final submit requires a live connection.
                </Text>
              </View>
            ) : null}

            <View style={styles.recoveryFieldGroup}>
              <Text style={[styles.recoveryFieldLabel, { color: theme.text }]}>How did you sign in now?</Text>
              <View style={styles.recoveryChoiceRow}>
                {ACCOUNT_RECOVERY_METHOD_OPTIONS.map((option) => {
                  const active = recoveryCurrentMethod === option.value;
                  return (
                    <TouchableOpacity
                      key={`current:${option.value}`}
                      onPress={() => setRecoveryCurrentMethod(option.value)}
                      style={[
                        styles.recoveryChoicePill,
                        {
                          backgroundColor: active ? theme.tint : theme.backgroundSubtle,
                          borderColor: active ? theme.tint : theme.outline,
                        },
                      ]}
                    >
                      <Text style={[styles.recoveryChoiceText, { color: active ? '#fff' : theme.text }]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.recoveryFieldGroup}>
              <Text style={[styles.recoveryFieldLabel, { color: theme.text }]}>Which method do you want us to recover?</Text>
              <View style={styles.recoveryChoiceRow}>
                {ACCOUNT_RECOVERY_METHOD_OPTIONS.map((option) => {
                  const active = recoveryPreviousMethod === option.value;
                  return (
                    <TouchableOpacity
                      key={`previous:${option.value}`}
                      onPress={() => setRecoveryPreviousMethod(option.value)}
                      style={[
                        styles.recoveryChoicePill,
                        {
                          backgroundColor: active ? theme.tint : theme.backgroundSubtle,
                          borderColor: active ? theme.tint : theme.outline,
                        },
                      ]}
                    >
                      <Text style={[styles.recoveryChoiceText, { color: active ? '#fff' : theme.text }]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TextInput
              value={recoveryContactEmail}
              onChangeText={setRecoveryContactEmail}
              placeholder="Best contact email"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[
                styles.emailInput,
                { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
              ]}
            />

            <TextInput
              value={recoveryPreviousEmail}
              onChangeText={setRecoveryPreviousEmail}
              placeholder="Previous account email, if you know it"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[
                styles.emailInput,
                { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
              ]}
            />

            <TextInput
              value={recoveryNote}
              onChangeText={setRecoveryNote}
              placeholder="What happened? Example: Google created a fresh account but my real profile is under Apple."
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
              style={[
                styles.recoveryTextArea,
                { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
              ]}
            />

            {recoveryError ? (
              <Text style={[styles.identityError, { color: '#ef4444' }]}>{recoveryError}</Text>
            ) : null}
            {recoveryMessage ? (
              <Text style={[styles.identityMessage, { color: theme.tint }]}>{recoveryMessage}</Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.emailSaveButton,
                { backgroundColor: theme.tint, opacity: recoverySubmitting || !accountNetworkReady ? 0.6 : 1 },
              ]}
              onPress={handleSubmitRecoveryRequest}
              disabled={recoverySubmitting || !accountNetworkReady}
            >
              <Text style={styles.emailSaveText}>
                {recoverySubmitting ? 'Sending...' : accountNetworkReady ? 'Send recovery request' : 'Requires connection'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Animated.ScrollView
        ref={scrollViewRef}
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        onTouchStart={closeDropdown}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.light.tint}
            colors={[Colors.light.tint]}
          />
        }
      >
        {/* Profile Header Section */}
        <View style={[styles.profileHeader, { backgroundColor: theme.background }]}>
          <View
            style={[
              styles.heroCard,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            {heroVideoUrl ? (
              <View style={styles.heroImage}>
                <HeroVideo uri={heroVideoUrl} />
                <View style={styles.heroTint} />
                <LinearGradient
                  colors={["rgba(0,0,0,0.35)", "transparent"]}
                  style={styles.heroTopGradient}
                />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.55)"]}
                  style={styles.heroBottomGradient}
                />
                <View style={styles.heroVignette} pointerEvents="none" />
                <View style={styles.heroInnerStroke} pointerEvents="none" />
                <View style={styles.heroGrain} pointerEvents="none" />
                <View style={styles.heroTopRow}>
                  <TouchableOpacity
                    style={[
                      styles.heroEditButton,
                      {
                        backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)",
                        borderColor: theme.outline,
                      },
                    ]}
                    onPress={() => setShowEditModal(true)}
                  >
                    <MaterialCommunityIcons name="pencil" size={16} color={theme.text} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              hasHeroImage ? (
                <View style={styles.heroImage}>
                  <OfflineImage
                    uri={heroImageUri}
                    style={styles.heroImage}
                    containerStyle={styles.heroImage}
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.heroTint} />
                  <LinearGradient
                    colors={["rgba(0,0,0,0.35)", "transparent"]}
                    style={styles.heroTopGradient}
                  />
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.55)"]}
                    style={styles.heroBottomGradient}
                  />
                  <View style={styles.heroVignette} pointerEvents="none" />
                  <View style={styles.heroInnerStroke} pointerEvents="none" />
                  <View style={styles.heroGrain} pointerEvents="none" />
                  <View style={styles.heroTopRow}>
                    <TouchableOpacity
                      style={[
                        styles.heroEditButton,
                        {
                          backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)",
                          borderColor: theme.outline,
                        },
                      ]}
                      onPress={() => setShowEditModal(true)}
                    >
                      <MaterialCommunityIcons name="pencil" size={16} color={theme.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <LinearGradient
                  colors={[placeholderPalette.start, placeholderPalette.end]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroImage}
                >
                  <View style={styles.heroTint} />
                  <View style={styles.heroVignette} pointerEvents="none" />
                  <View style={styles.heroInnerStroke} pointerEvents="none" />
                  <View style={styles.heroGrain} pointerEvents="none" />
                  <View style={styles.heroTopRow}>
                    <TouchableOpacity
                      style={[
                        styles.heroEditButton,
                        {
                          backgroundColor: "rgba(255,255,255,0.14)",
                          borderColor: "rgba(255,255,255,0.24)",
                        },
                      ]}
                      onPress={() => setShowEditModal(true)}
                    >
                      <MaterialCommunityIcons name="pencil" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.heroPlaceholderContent}>
                    <Text style={styles.heroPlaceholderEyebrow}>Premium presence starts here</Text>
                    <Text style={styles.heroPlaceholderInitials}>{profileInitials}</Text>
                    <Text style={styles.heroPlaceholderTitle}>Add a portrait that feels like you</Text>
                    <Text style={styles.heroPlaceholderSubtitle}>
                      Strong first photos lift trust, reply rates, and overall profile quality.
                    </Text>
                  </View>
                </LinearGradient>
              )
            )}
          </View>

          <View style={styles.heroAvatarWrap}>
            <View style={styles.heroAvatarGlow} />
            <LinearGradient
              colors={[theme.tint, theme.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={[styles.avatarInner, { backgroundColor: theme.background }]}>
                {hasAvatarImage ? (
                  <OfflineImage
                    uri={avatarImageUri}
                    style={[styles.avatar, { borderColor: theme.background }]}
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <LinearGradient
                    colors={[placeholderPalette.start, placeholderPalette.end]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.avatar, styles.avatarPlaceholder]}
                  >
                    <Text style={styles.avatarPlaceholderInitials}>{profileInitials}</Text>
                  </LinearGradient>
                )}
              </View>
            </LinearGradient>
            <TouchableOpacity
              style={styles.editAvatarButton}
              onPress={() => setShowEditModal(true)}
            >
              <MaterialCommunityIcons name="camera" size={14} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.heroNameRow}>
            <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={2}>
              {displayName}
              {displayAge ? ` · ${displayAge}` : ""}
            </Text>
            {verificationLevel > 0 ? (
              <VerificationBadge
                level={verificationLevel}
                size="small"
                variant="betweener"
                style={styles.heroInlineVerificationBadge}
              />
            ) : null}
            {showPresence ? (
              <View
                style={[
                  styles.presenceBadge,
                  { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                ]}
              >
                <View style={[styles.presenceDot, { backgroundColor: theme.tint }]} />
                <Text style={[styles.presenceText, { color: theme.textMuted }]}>
                  {presenceLabel}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.heroLocationRow}>
            <MaterialCommunityIcons name="map-marker" size={16} color={theme.tint} />
            <Text style={[styles.locationText, { color: theme.textMuted }]} numberOfLines={1}>
              {locationDisplay}
            </Text>
            {personalPremiumPlan ? (
              <PremiumPlanBadge
                plan={personalPremiumPlan}
                style={styles.heroPremiumBadgeInline}
              />
            ) : null}
          </View>

          {premiumExpiryReminder ? (
            <View
              style={[
                styles.premiumReminderCard,
                {
                  backgroundColor: isDark ? 'rgba(24, 40, 46, 0.92)' : theme.backgroundSubtle,
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : theme.outline,
                },
              ]}
            >
              <View style={styles.premiumReminderCopy}>
                <Text style={[styles.premiumReminderTitle, { color: theme.text }]}>
                  {premiumExpiryReminder.title}
                </Text>
                <Text style={[styles.premiumReminderBody, { color: theme.textMuted }]}>
                  {premiumExpiryReminder.body}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.premiumReminderAction,
                  { borderColor: theme.outline, backgroundColor: theme.background },
                ]}
                onPress={() => router.push('/premium-plans')}
              >
                <Text style={[styles.premiumReminderActionText, { color: theme.tint }]}>Review</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {premiumQueue.visible ? (
            <PremiumSyncNotice
              theme={theme}
              isDark={isDark}
              title={premiumQueue.title}
              message={premiumQueue.message}
              failedCount={premiumQueue.failedCount}
              pendingCount={premiumQueue.pendingCount}
              onPress={() => {
                if (premiumQueue.hasFailed) {
                  void premiumQueue.retryFailed();
                  return;
                }
                router.push('/sync-activity');
              }}
            />
          ) : null}

          {visibleReceivedGiftsCount > 0 ? (
            <View
              style={[
                styles.receivedGiftsCard,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <View style={styles.receivedGiftsHeader}>
                <View style={styles.receivedGiftsHeaderCopy}>
                  <Text style={[styles.receivedGiftsEyebrow, { color: theme.tint }]}>
                    Gifted signals
                  </Text>
                  <Text style={[styles.receivedGiftsTitle, { color: theme.text }]}>
                    {visibleReceivedGiftsCount === 1 ? 'A premium surprise is waiting' : 'Premium surprises are waiting'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.receivedGiftsCountPill,
                    {
                      backgroundColor: isDark ? 'rgba(20, 184, 166, 0.12)' : `${theme.tint}14`,
                      borderColor: isDark ? 'rgba(20, 184, 166, 0.22)' : `${theme.tint}24`,
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="gift-outline" size={14} color={theme.tint} />
                  <Text style={[styles.receivedGiftsCountText, { color: theme.tint }]}>
                    {visibleReceivedGiftsCount}
                  </Text>
                </View>
              </View>

              <View style={styles.receivedGiftsList}>
                {visibleReceivedGifts.map((gift) => {
                  return (
                    <TouchableOpacity
                      key={gift.id}
                      style={[
                        styles.receivedGiftRow,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : theme.background,
                          borderColor: theme.outline,
                        },
                      ]}
                      activeOpacity={0.9}
                      onPress={() => openReceivedGiftReveal(gift)}
                    >
                      <View style={styles.receivedGiftSender}>
                        {gift.senderAvatar ? (
                          <OfflineImage
                            uri={gift.senderAvatar}
                            style={styles.receivedGiftAvatar}
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <View
                            style={[
                              styles.receivedGiftAvatarFallback,
                              { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : `${theme.tint}18` },
                            ]}
                          >
                            <Text style={[styles.receivedGiftAvatarInitials, { color: theme.text }]}>
                              {gift.senderName.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.receivedGiftCopy}>
                          <Text style={[styles.receivedGiftSenderName, { color: theme.text }]} numberOfLines={1}>
                            {gift.senderName}
                          </Text>
                          <Text style={[styles.receivedGiftMessage, { color: theme.text }]}>
                            sent you something special
                          </Text>
                          <Text style={[styles.receivedGiftTimestamp, { color: theme.textMuted }]}>
                            {formatRelativeSignalTime(gift.createdAt)}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.receivedGiftTypePill,
                          {
                            backgroundColor: isDark ? 'rgba(46,214,194,0.10)' : `${theme.tint}0D`,
                            borderColor: isDark ? 'rgba(46,214,194,0.24)' : `${theme.tint}24`,
                          },
                        ]}
                      >
                        <GiftArtwork giftType={gift.giftType} size={44} animate={false} />
                        <View style={styles.receivedGiftTypeCopy}>
                          <Text style={[styles.receivedGiftTypeText, { color: theme.text }]}>
                            Gift waiting
                          </Text>
                          <Text style={[styles.receivedGiftTypeHint, { color: theme.textMuted }]}>
                            Tap to reveal
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.receivedGiftsAction, { borderColor: theme.outline, backgroundColor: theme.background }]}
                activeOpacity={0.86}
                onPress={() => router.push('/profile-insights')}
              >
                <Text style={[styles.receivedGiftsActionText, { color: theme.tint }]}>
                  Open in Insights
                </Text>
                <MaterialCommunityIcons name="arrow-right" size={14} color={theme.tint} />
              </TouchableOpacity>
            </View>
          ) : null}

          {profileSyncPending || profileSyncFailed ? (
            <View
              style={[
                styles.profileSyncBanner,
                {
                  backgroundColor: profileSyncFailed ? "rgba(239, 68, 68, 0.12)" : "rgba(20, 184, 166, 0.12)",
                  borderColor: profileSyncFailed ? "rgba(239, 68, 68, 0.32)" : "rgba(20, 184, 166, 0.32)",
                },
              ]}
            >
              <MaterialCommunityIcons
                name={profileSyncFailed ? "cloud-alert-outline" : "cloud-sync-outline"}
                size={16}
                color={profileSyncFailed ? "#F87171" : theme.tint}
              />
              <Text style={[styles.profileSyncText, { color: theme.textMuted }]}>
                {profileSyncFailed
                  ? "Some profile edits need your attention when you're back online."
                  : "Profile edits saved here. Syncing when your connection returns."}
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.heroBioCard,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <Text style={[styles.bio, { color: theme.text }]}>
              {displayBio}
            </Text>
          </View>
          {showPendingVerificationNudge ? (
            <VerificationNudgeCard
              theme={theme}
              mode="pending"
              onPress={() => setIsVerificationModalVisible(true)}
            />
          ) : null}
          {showInviteVerificationNudge ? (
            <VerificationNudgeCard
              theme={theme}
              onPress={() => setIsVerificationModalVisible(true)}
              onSecondaryPress={dismissVerificationNudge}
            />
          ) : null}
          <View
            style={[
              styles.progressCard,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
              <View style={styles.progressTopRow}>
                <View>
                  <Text style={[styles.progressTitle, { color: theme.text }]}>
                    Profile progress
                  </Text>
                  <Text style={[styles.progressSub, { color: theme.textMuted }]}>
                    {rewardText ?? progressSubtitle}
                  </Text>
                </View>
                <View style={styles.progressPctWrap}>
                  <Text style={[styles.progressPct, { color: theme.text }]}>
                    {profileCompletion.percent}%
                  </Text>
                </View>
              </View>
              <View
                style={[styles.progressTrack, { backgroundColor: theme.outline }]}
                onLayout={(event) => {
                  const width = event.nativeEvent.layout.width;
                  if (width && width !== progressTrackWidth) {
                    setProgressTrackWidth(width);
                  }
                }}
              >
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 100],
                        outputRange: ["0%", "100%"],
                      }),
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[theme.tint, theme.accent]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.progressFillGradient}
                  />
                </Animated.View>
                {progressTrackWidth > 0 && !progressAnimatedOnceRef.current ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.progressGlow,
                      {
                        transform: [
                          {
                            translateX: progressGlowAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [-60, progressTrackWidth + 60],
                            }),
                          },
                        ],
                        opacity: progressGlowAnim.interpolate({
                          inputRange: [0, 0.1, 0.6, 1],
                          outputRange: [0, 0.35, 0.22, 0],
                        }),
                      },
                    ]}
                  />
                ) : null}
              </View>
              {profileCompletion.percent < 100 ? (
                <Text style={[styles.progressHelper, { color: theme.textMuted }]}>
                  A few thoughtful details make the whole profile feel stronger.
                </Text>
              ) : (
                <Text style={[styles.progressHelper, { color: theme.textMuted }]}>
                  {"You're all set."}
                </Text>
              )}
              {nextPrompt ? (
                <TouchableOpacity
                  style={styles.progressHintRow}
                  activeOpacity={0.7}
                  onPress={() => setShowEditModal(true)}
                >
                  <MaterialCommunityIcons name="star-four-points" size={14} color={theme.accent} />
                  <Text
                    style={[styles.progressHint, { color: theme.textMuted }]}
                    numberOfLines={1}
                  >
                    {nextPrompt}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={14} color={theme.textMuted} />
                </TouchableOpacity>
              ) : null}
          </View>

          {featuredPrompt ? (
            <View
              style={[
                styles.featuredPromptCard,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <View style={styles.featuredPromptHeader}>
                <Text style={[styles.featuredPromptEyebrow, { color: theme.tint }]}>
                  {featuredPrompt.eyebrow}
                </Text>
                <View style={styles.promptHeaderActions}>
                  <TouchableOpacity
                    style={[styles.promptActionButton, { borderColor: theme.outline }]}
                    onPress={() => {
                      setPromptComposerMode(featuredPrompt.promptType === 'guess' ? 'guess' : 'standard');
                      openPromptEditor();
                    }}
                  >
                    <MaterialCommunityIcons name="pencil" size={14} color={theme.tint} />
                    <Text style={[styles.promptActionText, { color: theme.tint }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.promptRemoveButton, { borderColor: theme.outline }]}
                    onPress={() => void deletePrompt(featuredPrompt.id)}
                    disabled={deletingPromptId === featuredPrompt.id}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={14} color={theme.textMuted} />
                    <Text style={[styles.promptRemoveText, { color: theme.textMuted }]}>
                      {deletingPromptId === featuredPrompt.id ? 'Removing' : 'Remove'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.featuredPromptTitle, { color: theme.text }]}>
                {featuredPrompt.title}
              </Text>
              <>
                {featuredPrompt.meta ? (
                  <Text style={[styles.promptMetaText, { color: theme.textMuted }]}>
                    {featuredPrompt.meta}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.featuredPromptAnswer,
                    { color: theme.text },
                  ]}
                >
                  {featuredPrompt.answer}
                </Text>
              </>
            </View>
          ) : !promptsLoading ? (
            <View
              style={[
                styles.featuredPromptCard,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <Text style={[styles.featuredPromptEyebrow, { color: theme.tint }]}>
                Add your voice
              </Text>
              <Text style={[styles.featuredPromptTitle, { color: theme.text }]}>
                One good prompt makes the profile memorable.
              </Text>
              <Text style={[styles.featuredPromptAnswer, { color: theme.textMuted }]}>
                Share a thought, a value, or a line that feels unmistakably like you.
              </Text>
              <TouchableOpacity
                style={[styles.inlinePromptCta, { backgroundColor: theme.tint }]}
                onPress={() => {
                  setPromptComposerMode('standard');
                  openPromptEditor();
                }}
              >
                <Text style={styles.inlinePromptCtaText}>Answer a prompt</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Profile Details */}
          <View style={styles.profileDetails}>
            {/* Age and Height Row */}
            <View style={styles.detailRow}>
              {typeof profile?.age === 'number' && profile.age > 0 && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="cake-variant" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{profile?.age ? `${profile.age} years old` : "Age not set"}</Text>
                </View>
              )}
              {Boolean((profile as any)?.height) && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="human-male-height" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Height: {(profile as any).height}</Text>
                </View>
              )}
            </View>

            {Boolean((profile as any)?.kids) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="baby-face-outline" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Kids: {(profile as any).kids}</Text>
                </View>
              </View>
            )}

            {Boolean((profile as any)?.family_plans) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="home-heart" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Family Plans: {(profile as any).family_plans}</Text>
                </View>
              </View>
            )}

            {(Boolean((profile as any)?.religion) || Boolean((profile as any)?.tribe)) && (
              <View style={styles.detailRow}>
                {Boolean((profile as any)?.religion) && (
                  <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                    <MaterialCommunityIcons name="shield-check" size={16} color={theme.tint} />
                    <Text style={[styles.detailText, { color: theme.text }]}>
                      Faith: {formatReligionLabel((profile as any).religion)}
                    </Text>
                  </View>
                )}
                {Boolean((profile as any)?.tribe) && (
                  <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                    <MaterialCommunityIcons name="star-four-points" size={16} color={theme.tint} />
                    <Text style={[styles.detailText, { color: theme.text }]}>
                      Heritage: {(profile as any).tribe}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Occupation */}
            {Boolean((profile as any)?.occupation) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="briefcase" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).occupation}</Text>
                </View>
              </View>
            )}

            {/* Education */}
            {Boolean((profile as any)?.education) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="school" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).education}</Text>
                </View>
              </View>
            )}

            {/* Looking For */}
            {Boolean((profile as any)?.looking_for) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="heart-outline" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>
                    Looking for {formatProfileDetailValue((profile as any).looking_for)}
                  </Text>
                </View>
              </View>
            )}

            {/* DIASPORA: Location Information */}
            {Boolean(locationPresentation.withFlag) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="map-marker" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>
                    {`Currently in ${locationPresentation.withFlag}`}
                  </Text>
                </View>
              </View>
            )}

            {/* Years in Diaspora */}
            {typeof (profile as any)?.years_in_diaspora === 'number' && (profile as any).years_in_diaspora > 0 && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="calendar" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{profile?.years_in_diaspora ? `${profile.years_in_diaspora} years abroad` : "New diaspora member"}</Text>
                </View>
              </View>
            )}

            {/* Future Ghana Plans */}
            {Boolean((profile as any)?.future_ghana_plans) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="compass" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).future_ghana_plans}</Text>
                </View>
              </View>
            )}

            {/* HIGH PRIORITY: Lifestyle Fields */}
            {Boolean((profile as any)?.exercise_frequency) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="dumbbell" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>
                    Exercise: {formatProfileDetailValue((profile as any).exercise_frequency)}
                  </Text>
                </View>
              </View>
            )}

            {/* Smoking and Drinking Row */}
            <View style={styles.detailRow}>
              {Boolean((profile as any)?.smoking) && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="smoking-off" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Smoking: {formatProfileDetailValue((profile as any).smoking)}</Text>
                </View>
              )}
              {Boolean((profile as any)?.drinking) && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="glass-cocktail" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Drinking: {formatProfileDetailValue((profile as any).drinking)}</Text>
                </View>
              )}
            </View>

            {/* HIGH PRIORITY: Family Fields */}
            {/* Children Row */}
            <View style={styles.detailRow}>
              {Boolean((profile as any)?.has_children) && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="baby" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Children: {(profile as any).has_children}</Text>
                </View>
              )}
              {Boolean((profile as any)?.wants_children) && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="heart-plus" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Wants: {(profile as any).wants_children}</Text>
                </View>
              )}
            </View>

            {/* HIGH PRIORITY: Personality Fields */}
            {Boolean((profile as any)?.personality_type) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="account-circle" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).personality_type}</Text>
                </View>
              </View>
            )}

            {Boolean((profile as any)?.love_language) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="heart-multiple" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Love Language: {(profile as any).love_language}</Text>
                </View>
              </View>
            )}

            {/* HIGH PRIORITY: Living Situation Fields */}
            {/* Living and Pets Row */}
            <View style={styles.detailRow}>
              {Boolean((profile as any)?.living_situation) && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="home" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).living_situation}</Text>
                </View>
              )}
              {Boolean((profile as any)?.pets) && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="paw" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).pets}</Text>
                </View>
              )}
            </View>

            {/* HIGH PRIORITY: Languages */}
            {Array.isArray((profile as any)?.languages_spoken) && (profile as any).languages_spoken.length > 0 && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="translate" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>
                    {`Languages: ${(profile as any).languages_spoken?.join(', ') || 'Not specified'}`}
                  </Text>
                </View>
              </View>
            )}
          </View>

        </View>

        <View
          style={[
            styles.statsContainer,
            styles.cardShadow,
            { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline, borderWidth: 1, borderRadius: 18 },
          ]}
        >
            <View style={styles.statsHighlight}>
              <LinearGradient
                colors={[theme.tint, theme.accent, "transparent"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.statsHighlightLine}
              />
            </View>
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/intent?type=like_with_note')}
            >
              <Text style={[styles.statNumber, { color: theme.text }]}>{likesCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>Likes</Text>
            </TouchableOpacity>
            <View style={[styles.statDivider, { backgroundColor: theme.outline }]} />
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/chat?focus=matches')}
            >
              <Text style={[styles.statNumber, { color: theme.text }]}>{matchesCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>Matches</Text>
            </TouchableOpacity>
            <View style={[styles.statDivider, { backgroundColor: theme.outline }]} />
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/chat')}
            >
              <Text style={[styles.statNumber, { color: theme.text }]}>{chatsCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>Chats</Text>
            </TouchableOpacity>
            <View style={[styles.statDivider, { backgroundColor: theme.outline }]} />
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/intent')}
            >
              <Text
                style={[
                  styles.statNumber,
                  styles.statWord,
                  { color: theme.text },
                ]}
              >
                {qualityLabel}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>Quality</Text>
            </TouchableOpacity>
            <Text style={[styles.statsHint, { color: theme.textMuted }]}>
              Tap a tile to jump in
            </Text>
        </View>

        {/* Photo Gallery Section */}
        <View
          style={[
            styles.section,
            styles.sectionCard,
            styles.cardShadowSoft,
            { marginBottom: 0, paddingBottom: 10, backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Gallery
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowEditModal(true)}
            >
              <MaterialCommunityIcons name="plus" size={20} color={Colors.light.tint} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
          
          {hasGalleryMedia ? (
            <PhotoGallery
              photos={userPhotos}
              introVideoUrl={heroVideoUrl}
              introVideoThumbnail={heroVideoThumbnail || avatarImageUri}
              onOpenVideo={() => setIntroVideoOpen(true)}
              canEdit
              onAddPhoto={() => setShowEditModal(true)}
              onRemovePhoto={removePhoto}
            />
          ) : (
            <View
              style={[
                styles.emptyFeatureCard,
                styles.galleryEmptyCard,
                { backgroundColor: theme.background, borderColor: theme.outline },
              ]}
            >
              <View style={[styles.emptyFeatureIconWrap, { backgroundColor: theme.backgroundSubtle }]}>
                <MaterialCommunityIcons name="image-plus" size={22} color={theme.tint} />
              </View>
              <Text style={[styles.emptyFeatureTitle, { color: theme.text }]}>Your gallery is still quiet</Text>
              <Text style={[styles.emptyFeatureSubtitle, { color: theme.textMuted }]}>
                Add a few photos or an intro video so your profile feels complete, real, and easy to trust.
              </Text>
              <TouchableOpacity
                style={[styles.emptyFeatureButton, { backgroundColor: theme.tint }]}
                onPress={() => setShowEditModal(true)}
              >
                <Text style={styles.emptyFeatureButtonText}>Add media</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <ProfileVideoModal
          visible={introVideoOpen}
          videoUrl={heroVideoUrl ?? undefined}
          onClose={() => setIntroVideoOpen(false)}
        />

        {showAboutCard ? (
          <View
            style={[
              styles.section,
              styles.sectionCard,
              styles.cardShadowSoft,
              { paddingTop: 5, backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                About Me
              </Text>
              <TouchableOpacity
                style={[styles.editButton, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons name="pencil" size={16} color={theme.tint} />
                <Text style={[styles.editButtonText, { color: theme.tint }]}>Edit</Text>
              </TouchableOpacity>
            </View>

            {showAboutCard ? (
              <View
                style={[
                  styles.aboutCard,
                  { backgroundColor: theme.background, borderColor: theme.outline },
                ]}
              >
                <Text
                  style={[
                    styles.aboutText,
                    { color: rawBio ? theme.text : theme.textMuted },
                  ]}
                >
                  {aboutMeText}
                </Text>
              </View>
            ) : null}

          </View>
        ) : null}

        {(showPromptEditor || extraPrompts.length > 0 || !featuredPrompt || promptsLoading) ? (
          <View
            style={[
              styles.section,
              styles.sectionCard,
              styles.cardShadowSoft,
              { paddingTop: 5, backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
            onLayout={(event) => {
              promptEditorYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Prompts</Text>
              <TouchableOpacity
                style={[styles.editButton, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
                onPress={() => setShowPromptEditor((prev) => !prev)}
              >
                <MaterialCommunityIcons name="comment-quote-outline" size={16} color={theme.tint} />
                <Text style={[styles.editButtonText, { color: theme.tint }]}>
                  {showPromptEditor ? 'Hide' : 'Manage'}
                </Text>
              </TouchableOpacity>
            </View>

            {showPromptEditor ? (
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <View
                  style={[
                    styles.promptCard,
                    styles.cardShadowSoft,
                    { backgroundColor: theme.background, borderColor: theme.outline },
                  ]}
                >
                  <Text style={[styles.promptTitle, { color: theme.text }]}>
                    Add a prompt
                  </Text>
                  <View style={styles.promptComposerTabs}>
                    <TouchableOpacity
                      onPress={() => setPromptComposerMode('standard')}
                      style={[
                        styles.promptComposerTab,
                        {
                          backgroundColor:
                            promptComposerMode === 'standard' ? theme.tint : theme.backgroundSubtle,
                          borderColor: promptComposerMode === 'standard' ? theme.tint : theme.outline,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.promptComposerTabText,
                          { color: promptComposerMode === 'standard' ? '#fff' : theme.textMuted },
                        ]}
                      >
                        Standard
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setPromptComposerMode('guess')}
                      style={[
                        styles.promptComposerTab,
                        {
                          backgroundColor:
                            promptComposerMode === 'guess' ? theme.tint : theme.backgroundSubtle,
                          borderColor: promptComposerMode === 'guess' ? theme.tint : theme.outline,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.promptComposerTabText,
                          { color: promptComposerMode === 'guess' ? '#fff' : theme.textMuted },
                        ]}
                      >
                        Guess
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {promptComposerMode === 'standard' ? (
                    <View style={styles.customPromptGroup}>
                      <TextInput
                        value={customPromptTitle}
                        onChangeText={setCustomPromptTitle}
                        placeholder="Write your question..."
                        placeholderTextColor={theme.textMuted}
                        style={[
                          styles.customPromptInput,
                          { color: theme.text, borderColor: theme.outline },
                        ]}
                      />
                      <TextInput
                        value={customPromptAnswer}
                        onChangeText={setCustomPromptAnswer}
                        placeholder="Your answer..."
                        placeholderTextColor={theme.textMuted}
                        style={[
                          styles.customPromptInput,
                          styles.customPromptAnswer,
                          { color: theme.text, borderColor: theme.outline },
                        ]}
                        multiline
                      />
                      <TouchableOpacity
                        onPress={saveCustomPrompt}
                        disabled={!customPromptTitle.trim() || !customPromptAnswer.trim() || customPromptSaving}
                        style={[
                          styles.customPromptSave,
                          {
                            backgroundColor: customPromptTitle.trim() && customPromptAnswer.trim()
                              ? theme.tint
                              : theme.outline,
                          },
                        ]}
                      >
                        <Text style={styles.customPromptSaveText}>
                          {customPromptSaving ? 'Saving...' : 'Save prompt'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.customPromptGroup}>
                      <Text style={[styles.promptHelperText, { color: theme.textMuted }]}>
                        People get one playful guess before starting the conversation.
                      </Text>
                      <View style={styles.guessPromptTips}>
                        <Text style={[styles.guessPromptTip, { color: theme.textMuted }]}>
                          Keep the hint short so the challenge stays clean.
                        </Text>
                        <Text style={[styles.guessPromptTip, { color: theme.textMuted }]}>
                          If you use multiple choice, make the wrong answers believable.
                        </Text>
                        <Text style={[styles.guessPromptTip, { color: theme.textMuted }]}>
                          Pick something fun to guess, not something impossible.
                        </Text>
                      </View>
                      <TextInput
                        value={guessPromptTitle}
                        onChangeText={setGuessPromptTitle}
                        placeholder="Ask something playful..."
                        placeholderTextColor={theme.textMuted}
                        style={[
                          styles.customPromptInput,
                          { color: theme.text, borderColor: theme.outline },
                        ]}
                      />
                      <TextInput
                        value={guessPromptAnswer}
                        onChangeText={setGuessPromptAnswer}
                        placeholder="Correct answer"
                        placeholderTextColor={theme.textMuted}
                        style={[
                          styles.customPromptInput,
                          { color: theme.text, borderColor: theme.outline },
                        ]}
                      />
                      <View style={styles.promptComposerTabs}>
                        <TouchableOpacity
                          onPress={() => setGuessPromptMode('multiple_choice')}
                          style={[
                            styles.promptComposerTab,
                            {
                              backgroundColor:
                                guessPromptMode === 'multiple_choice' ? theme.accent : theme.backgroundSubtle,
                              borderColor:
                                guessPromptMode === 'multiple_choice' ? theme.accent : theme.outline,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.promptComposerTabText,
                              { color: guessPromptMode === 'multiple_choice' ? '#fff' : theme.textMuted },
                            ]}
                          >
                            Multiple choice
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setGuessPromptMode('free_text')}
                          style={[
                            styles.promptComposerTab,
                            {
                              backgroundColor: guessPromptMode === 'free_text' ? theme.accent : theme.backgroundSubtle,
                              borderColor: guessPromptMode === 'free_text' ? theme.accent : theme.outline,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.promptComposerTabText,
                              { color: guessPromptMode === 'free_text' ? '#fff' : theme.textMuted },
                            ]}
                          >
                            Type a guess
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {guessPromptMode === 'multiple_choice' ? (
                        <View style={styles.guessOptionsGroup}>
                          {guessPromptOptions.map((value, index) => (
                            <TextInput
                              key={`guess-option-${index}`}
                              value={value}
                              onChangeText={(next) =>
                                setGuessPromptOptions((prev) =>
                                  prev.map((item, itemIndex) => (itemIndex === index ? next : item)),
                                )
                              }
                              placeholder={`Wrong option ${index + 1}`}
                              placeholderTextColor={theme.textMuted}
                              style={[
                                styles.customPromptInput,
                                { color: theme.text, borderColor: theme.outline },
                              ]}
                            />
                          ))}
                        </View>
                      ) : null}
                      <TextInput
                        value={guessPromptHint}
                        onChangeText={setGuessPromptHint}
                        placeholder="Short hint for the viewer"
                        placeholderTextColor={theme.textMuted}
                        style={[
                          styles.customPromptInput,
                          { color: theme.text, borderColor: theme.outline },
                        ]}
                      />
                      <View
                        style={[
                          styles.guessPreviewCard,
                          { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                        ]}
                      >
                        <Text style={[styles.guessPreviewEyebrow, { color: theme.tint }]}>
                          Viewer preview
                        </Text>
                        <Text style={[styles.guessPreviewTitle, { color: theme.text }]}>
                          {guessPromptTitle.trim() || 'Your guess prompt will show here'}
                        </Text>
                        <View style={styles.guessPreviewMetaRow}>
                          <View
                            style={[
                              styles.guessPreviewMetaPill,
                              { backgroundColor: theme.background, borderColor: theme.outline },
                            ]}
                          >
                            <MaterialCommunityIcons
                              name="gamepad-variant-outline"
                              size={14}
                              color={theme.tint}
                            />
                            <Text style={[styles.guessPreviewMetaText, { color: theme.textMuted }]}>
                              {guessPromptMode === 'multiple_choice' ? '1 prompt challenge' : 'One clean guess'}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.guessPreviewHint, { color: theme.textMuted }]}>
                          {guessPromptHint.trim()
                            ? `Hint: ${guessPromptHint.trim()}`
                            : 'Add a short hint so the viewer has a fair shot.'}
                        </Text>
                        {guessPromptMode === 'multiple_choice' ? (
                          <View style={styles.guessPreviewOptions}>
                            {guessPromptPreviewOptions.length > 0 ? (
                              guessPromptPreviewOptions.map((option, index) => (
                                <View
                                  key={`guess-preview-${index}`}
                                  style={[
                                    styles.guessPreviewOption,
                                    { backgroundColor: theme.background, borderColor: theme.outline },
                                  ]}
                                >
                                  <Text style={[styles.guessPreviewOptionText, { color: theme.text }]}>
                                    {option}
                                  </Text>
                                </View>
                              ))
                            ) : (
                              <View
                                style={[
                                  styles.guessPreviewOption,
                                  { backgroundColor: theme.background, borderColor: theme.outline },
                                ]}
                              >
                                <Text style={[styles.guessPreviewOptionText, { color: theme.textMuted }]}>
                                  Add a correct answer and believable wrong options
                                </Text>
                              </View>
                            )}
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.guessPreviewOption,
                              { backgroundColor: theme.background, borderColor: theme.outline },
                            ]}
                          >
                            <Text
                              style={[
                                styles.guessPreviewOptionText,
                                { color: guessPromptAnswer.trim() ? theme.text : theme.textMuted },
                              ]}
                            >
                              {guessPromptAnswer.trim() ? 'Type your guess' : 'Viewer types one guess here'}
                            </Text>
                          </View>
                        )}
                        <Text style={[styles.guessPreviewFooter, { color: theme.textMuted }]}>
                          Correct answer stays hidden until they play.
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={saveGuessPrompt}
                        disabled={!canSaveGuessPrompt}
                        style={[
                          styles.customPromptSave,
                          {
                            backgroundColor: canSaveGuessPrompt
                              ? theme.tint
                              : theme.outline,
                          },
                        ]}
                      >
                      <Text style={styles.customPromptSaveText}>
                          {guessPromptSaving ? 'Saving...' : 'Save mini-game prompt'}
                      </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                {PROFILE_PROMPTS.map((prompt) => (
                  <View
                    key={prompt.id}
                    style={[
                      styles.promptCard,
                      styles.cardShadowSoft,
                      { backgroundColor: theme.background, borderColor: theme.outline },
                    ]}
                  >
                    <Text style={[styles.promptTitle, { color: theme.text }]}>{prompt.title}</Text>
                    <View style={styles.promptOptions}>
                      {prompt.responses.map((response, index) => {
                        const selected = selectedPrompts[prompt.id] === index;
                        return (
                          <TouchableOpacity
                            key={index}
                            style={[
                              styles.promptOption,
                              { backgroundColor: theme.background, borderColor: theme.outline },
                              selected && { backgroundColor: theme.tint, borderColor: theme.tint },
                            ]}
                            onPress={() => handlePromptSelect(prompt.id, index)}
                          >
                            <Text
                              style={[
                                styles.promptOptionText,
                                { color: theme.text },
                                selected && styles.promptOptionTextSelected,
                              ]}
                            >
                              {response}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </Animated.View>
            ) : promptsLoading ? (
              <Text style={[styles.promptEmptyText, { color: theme.textMuted }]}>Loading prompts...</Text>
            ) : extraPrompts.length ? (
              <View style={styles.promptHighlights}>
                {extraPrompts.map((prompt) => (
                  <View
                    key={prompt.id}
                    style={[
                      styles.promptHighlightCard,
                      { backgroundColor: theme.background, borderColor: theme.outline },
                    ]}
                  >
                    <View style={styles.promptHighlightTopRow}>
                      <Text style={[styles.promptHighlightTitle, { color: theme.textMuted }]}>
                        {prompt.title}
                      </Text>
                      <TouchableOpacity
                        style={[styles.promptRemoveIconButton, { borderColor: theme.outline }]}
                        onPress={() => void deletePrompt(prompt.id)}
                        disabled={deletingPromptId === prompt.id}
                      >
                        <MaterialCommunityIcons
                          name="trash-can-outline"
                          size={14}
                          color={theme.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                    {prompt.meta ? (
                      <Text style={[styles.promptMetaText, { color: theme.textMuted }]}>
                        {prompt.meta}
                      </Text>
                    ) : null}
                    <Text style={[styles.promptHighlightAnswer, { color: theme.text }]}>
                      {prompt.answer}
                    </Text>
                  </View>
                ))}
              </View>
            ) : !featuredPrompt ? (
              <View
                style={[
                  styles.emptyFeatureCard,
                  { backgroundColor: theme.background, borderColor: theme.outline },
                ]}
              >
                <View style={[styles.emptyFeatureIconWrap, { backgroundColor: theme.backgroundSubtle }]}>
                  <MaterialCommunityIcons name="comment-quote-outline" size={20} color={theme.tint} />
                </View>
                <Text style={[styles.emptyFeatureTitle, { color: theme.text }]}>Give people something to remember</Text>
                <Text style={[styles.emptyFeatureSubtitle, { color: theme.textMuted }]}>
                  One thoughtful answer gives your profile warmth, voice, and much better recall.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Interests Section */}
        <View
          style={[
            styles.section,
            styles.sectionCard,
            styles.cardShadowSoft,
            { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Interests
            </Text>
            <TouchableOpacity
              style={[styles.editButton, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
              onPress={() => setShowEditModal(true)}
            >
              <MaterialCommunityIcons name="pencil" size={16} color={theme.tint} />
              <Text style={[styles.editButtonText, { color: theme.tint }]}>Edit</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.interestsContainer}>
            {loadingInterests ? (
              <Text style={styles.noInterestsText}>Loading interests...</Text>
            ) : userInterests.length > 0 ? (
              userInterests.map((interest: string, index: number) => (
                <View key={index} style={[styles.interestTag, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <Text style={[styles.interestText, { color: theme.text }]}>{interest}</Text>
                </View>
              ))
            ) : (
              <View
                style={[
                  styles.emptyFeatureCard,
                  { backgroundColor: theme.background, borderColor: theme.outline },
                ]}
              >
                <View style={[styles.emptyFeatureIconWrap, { backgroundColor: theme.backgroundSubtle }]}>
                  <MaterialCommunityIcons name="star-four-points" size={20} color={theme.tint} />
                </View>
                <Text style={[styles.emptyFeatureTitle, { color: theme.text }]}>Interests help the right people stop scrolling</Text>
                <Text style={[styles.emptyFeatureSubtitle, { color: theme.textMuted }]}>
                  Add a few interests so your matches can spot shared energy faster.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyFeatureButton, { backgroundColor: theme.tint }]}
                  onPress={() => setShowEditModal(true)}
                >
                  <Text style={styles.emptyFeatureButtonText}>Add interests</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Distance Unit Section */}
        <View
          style={[
            styles.section,
            styles.sectionCard,
            styles.cardShadowSoft,
            { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Distance Unit
            </Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.textMuted }]}>Current</Text>
            <Text style={[styles.settingValue, { color: theme.text }] }>
              {(() => {
                const selected = DISTANCE_UNIT_OPTIONS.find((option) => option.value === distanceUnit);
                if (!selected) return 'Auto (Recommended)';
                return selected.subtitle ? `${selected.label} (${selected.subtitle})` : selected.label;
              })()}
            </Text>
          </View>
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </Animated.ScrollView>

      {/* Profile Edit Modal */}
      {showEditModal && (
        <ProfileEditModal
          visible={showEditModal}
          onClose={() => setShowEditModal(false)}
          onOpenVerification={() => {
            setShowEditModal(false);
            setIsVerificationModalVisible(true);
          }}
          onSave={async (updatedProfile) => {
            if (Array.isArray(updatedProfile?.__interests)) {
              setUserInterests(updatedProfile.__interests);
              writeMeSnapshot({ interests: updatedProfile.__interests });
            }
            if (Array.isArray(updatedProfile?.__displayPhotos)) {
              setUserPhotos(updatedProfile.__displayPhotos);
              writeMeSnapshot({
                avatarUrl: updatedProfile.__displayAvatarUrl ?? null,
                photos: updatedProfile.__displayPhotos,
                profileVideo: updatedProfile.__displayProfileVideo ?? null,
              });
            }
            if (updatedProfile?.__offlineQueued) {
              setProfileSyncPending(true);
              setProfileSyncFailed(false);
              setShowEditModal(false);
              return;
            }
            // Force refresh the profile to ensure UI is updated
            setRefreshing(true);
            try {
              await refreshProfile(); // This will update the profile state
              await loadUserPhotos(); // Reload photos after profile update
              console.log('Profile refreshed after save');
            } catch (error) {
              console.error('Error refreshing profile:', error);
            } finally {
              setRefreshing(false);
              setShowEditModal(false);
            }
          }}
        />
      )}

      {/* Diaspora Verification Modal */}
      {isVerificationModalVisible && (
        <DiasporaVerification
          visible={isVerificationModalVisible}
          onClose={() => {
            setIsVerificationModalVisible(false);
            refreshStatus();
          }}
          profile={profile}
          onVerificationUpdate={() => {
            // Refresh profile to show updated verification level
            refreshProfile();
            refreshStatus();
          }}
        />
      )}
        <GiftRevealSheet
          visible={Boolean(selectedReceivedGift)}
          senderAvatar={selectedReceivedGift?.senderAvatar ?? null}
          senderName={selectedReceivedGift?.senderName ?? 'Gift signal'}
          senderGender={selectedReceivedGift?.senderGender ?? null}
          giftType={selectedReceivedGift?.giftType}
          timeLabel={
            selectedReceivedGift
              ? formatRelativeSignalTime(
                  selectedReceivedGift.revealedAt ?? selectedReceivedGift.createdAt,
                )
              : ''
          }
          onClose={() => setSelectedReceivedGift(null)}
        onViewProfile={
          selectedReceivedGift?.senderProfileId
            ? () => {
                const nextGift = selectedReceivedGift;
                void logProfileGiftEvent({
                  giftId: nextGift.id,
                  eventType: 'sender_profile_opened',
                  metadata: { surface: 'me_profile' },
                });
                const nextProfileId = nextGift.senderProfileId;
                setSelectedReceivedGift(null);
                router.push({ pathname: '/profile-view', params: { profileId: String(nextProfileId) } });
              }
            : undefined
        }
      />
    </SafeAreaView>
  );
}

function NotificationToggle({
  label,
  description,
  icon,
  value,
  onValueChange,
  theme,
}: {
  label: string;
  description: string;
  icon: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  theme: typeof Colors.light;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => onValueChange(!value)}
      style={[
        styles.notificationToggleCard,
        { backgroundColor: theme.backgroundSubtle, borderColor: value ? theme.tint : theme.outline },
      ]}
    >
      <View style={[styles.notificationToggleIcon, { backgroundColor: value ? `${theme.tint}18` : theme.background }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={value ? theme.tint : theme.textMuted} />
      </View>
      <View style={styles.notificationToggleCopy}>
        <View style={styles.notificationToggleTitleRow}>
          <Text style={[styles.notificationToggleLabel, { color: theme.text }]}>{label}</Text>
        </View>
        <Text style={[styles.notificationToggleDescription, { color: theme.textMuted }]}>{description}</Text>
      </View>
      <View
        style={[
          styles.notificationToggleControl,
          {
            backgroundColor: value ? `${theme.tint}14` : theme.background,
            borderColor: value ? `${theme.tint}3a` : theme.outline,
          },
        ]}
      >
        <Text style={[styles.notificationToggleControlText, { color: value ? theme.tint : theme.textMuted }]}>
          {value ? 'Live' : 'Mute'}
        </Text>
        <View
          style={[
            styles.notificationToggleControlTrack,
            { backgroundColor: value ? theme.tint : theme.outline },
          ]}
        >
          <View
            style={[
              styles.notificationToggleControlThumb,
              value ? styles.notificationToggleControlThumbOn : styles.notificationToggleControlThumbOff,
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#111827',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    gap: 6,
  },
  previewButtonBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButtonBadgeText: {
    fontSize: 10,
    lineHeight: 10,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 0.2,
  },
  previewButtonText: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.light.tint,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  settingsButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  
  // Scroll View
  scrollView: {
    flex: 1,
  },
  
  // Profile Header
  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    marginBottom: 8,
  },
  heroCard: {
    width: '100%',
    height: 232,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  heroImage: {
    flex: 1,
  },
  heroImageStyle: {
    borderRadius: 24,
  },
  heroTopGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 96,
  },
  heroBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  heroVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  heroInnerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  heroGrain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  heroPlaceholderContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  heroPlaceholderEyebrow: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.78)',
    marginBottom: 10,
  },
  heroPlaceholderInitials: {
    fontSize: 62,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: 2,
    color: '#fff',
  },
  heroPlaceholderTitle: {
    marginTop: 10,
    fontSize: 22,
    fontFamily: 'PlayfairDisplay_600SemiBold',
    color: '#fff',
    textAlign: 'center',
  },
  heroPlaceholderSubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Manrope_500Medium',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  heroEditButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroAvatarWrap: {
    marginTop: -42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarGlow: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: 'rgba(255,255,255,0.52)',
    shadowColor: '#a78bfa',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 8,
  },
  avatarRing: {
    padding: 3,
    borderRadius: 45,
  },
  avatarInner: {
    padding: 2,
    borderRadius: 41,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderInitials: {
    fontSize: 30,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#fff',
    letterSpacing: 1.4,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: -2,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  heroInlineVerificationBadge: {
    transform: [{ translateY: 1 }],
    marginHorizontal: 1,
  },
  heroVerificationButton: {
    width: '100%',
    marginTop: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroVerificationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroVerificationCopy: {
    flex: 1,
    gap: 2,
  },
  heroVerificationTitle: {
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  heroVerificationSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: 'Manrope_500Medium',
  },
  heroVerificationAction: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  heroVerificationActionText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  presenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  presenceDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  presenceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  profileName: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '88%',
    fontSize: 28,
    lineHeight: 33,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  locationText: {
    flexShrink: 1,
    fontSize: 12.5,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
  },
  heroPremiumBadgeInline: {
    marginLeft: 2,
  },
  premiumReminderCard: {
    width: '100%',
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  premiumReminderCopy: {
    flex: 1,
    gap: 3,
  },
  premiumReminderTitle: {
    fontSize: 12.5,
    fontFamily: 'Manrope_700Bold',
  },
  premiumReminderBody: {
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: 'Manrope_500Medium',
  },
  premiumReminderAction: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  premiumReminderActionText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
  },
  receivedGiftsCard: {
    width: '100%',
    marginTop: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  receivedGiftsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  receivedGiftsHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  receivedGiftsEyebrow: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  receivedGiftsTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Manrope_700Bold',
  },
  receivedGiftsCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  receivedGiftsCountText: {
    fontSize: 12,
    fontFamily: 'Archivo_700Bold',
  },
  receivedGiftsList: {
    gap: 10,
  },
  receivedGiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  receivedGiftSender: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  receivedGiftAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  receivedGiftAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receivedGiftAvatarInitials: {
    fontSize: 14,
    fontFamily: 'Manrope_800ExtraBold',
  },
  receivedGiftCopy: {
    flex: 1,
    minWidth: 0,
  },
  receivedGiftSenderName: {
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
  },
  receivedGiftMessage: {
    marginTop: 2,
    fontSize: 12.5,
    fontFamily: 'Manrope_700Bold',
  },
  receivedGiftTimestamp: {
    marginTop: 2,
    fontSize: 11.5,
    fontFamily: 'Manrope_500Medium',
  },
  receivedGiftTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  receivedGiftTypeCopy: {
    minWidth: 0,
  },
  receivedGiftTypeText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
  },
  receivedGiftTypeHint: {
    marginTop: 1,
    fontSize: 10.5,
    fontFamily: 'Manrope_600SemiBold',
  },
  receivedGiftsAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  receivedGiftsActionText: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
  },
  profileSyncBanner: {
    width: '100%',
    marginTop: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileSyncText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_600SemiBold',
  },
  heroBioCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  bio: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  featuredPromptCard: {
    marginTop: 12,
    width: '100%',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  featuredPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  promptHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featuredPromptEyebrow: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  featuredPromptTitle: {
    fontSize: 17,
    fontFamily: 'PlayfairDisplay_600SemiBold',
    lineHeight: 22,
  },
  promptMetaText: {
    marginTop: 6,
    fontSize: 11.5,
    fontFamily: 'Manrope_500Medium',
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  featuredPromptAnswer: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    lineHeight: 22,
    letterSpacing: 0.15,
  },
  inlinePromptCta: {
    alignSelf: 'flex-start',
    marginTop: 14,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  inlinePromptCtaText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  promptRemoveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  promptRemoveText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.2,
  },
  progressCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 15,
    paddingVertical: 10,
    width: '100%',
  },
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  progressTitle: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.2,
  },
  progressSub: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
  },
  progressPctWrap: {
    minWidth: 54,
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  progressPct: {
    fontSize: 15,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 0.2,
  },
  progressTrack: {
    marginTop: 8,
    height: 9,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: 9,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFillGradient: {
    flex: 1,
  },
  progressGlow: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    width: 60,
    borderRadius: 999,
    backgroundColor: 'rgba(183,153,255,0.45)',
  },
  progressHintRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressHelper: {
    marginTop: 7,
    fontSize: 11.5,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 15,
  },
  progressHint: {
    fontSize: 12,
    fontFamily: 'Manrope_500Medium',
    flexShrink: 1,
  },
  insightsSection: {
    width: '100%',
    marginTop: 24,
  },
  insightsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  insightsEyebrow: {
    fontSize: 10,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 1.4,
  },
  insightsTitle: {
    marginTop: 4,
    fontSize: 22,
    lineHeight: 27,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  insightsList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
  },
  insightsRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  insightsRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightsRowCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 12,
  },
  insightsRowTitle: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
  insightsRowBody: {
    marginTop: 3,
    fontSize: 11,
    fontFamily: 'Manrope_500Medium',
  },
  // Stats
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    paddingVertical: 18,
    marginBottom: 8,
  },
  statsHighlight: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
    height: 2,
  },
  statsHighlightLine: {
    height: 2,
    borderRadius: 999,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 22,
    fontFamily: 'Archivo_700Bold',
    color: Colors.light.tint,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  statWord: {
    fontSize: 18,
    letterSpacing: 0.2,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsHint: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: 'Manrope_400Regular',
    letterSpacing: 0.2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  
  // Sections
  section: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 12,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'PlayfairDisplay_600SemiBold',
    color: '#111827',
  },
  aboutCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  aboutText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  promptHighlights: {
    marginTop: 12,
    gap: 10,
  },
  promptActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  promptActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  promptActionText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.2,
  },
  promptHighlightCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  promptHighlightTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  promptHighlightTitle: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.4,
  },
  promptHighlightAnswer: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    lineHeight: 21,
  },
  promptRemoveIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFeatureCard: {
    marginTop: 12,
    alignSelf: 'stretch',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyFeatureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyFeatureTitle: {
    fontSize: 15,
    fontFamily: 'Archivo_600SemiBold',
    textAlign: 'center',
  },
  emptyFeatureSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  emptyFeatureButton: {
    marginTop: 14,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyFeatureButtonText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.2,
  },
  promptEmptyText: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    letterSpacing: 0.2,
  },
  customPromptGroup: {
    marginTop: 8,
    gap: 10,
  },
  promptComposerTabs: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  promptComposerTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  promptComposerTabText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.2,
  },
  promptHelperText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  guessPromptTips: {
    gap: 6,
  },
  guessPromptTip: {
    fontSize: 11.5,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
    letterSpacing: 0.15,
  },
  guessOptionsGroup: {
    gap: 10,
  },
  guessPreviewCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  guessPreviewEyebrow: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  guessPreviewTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Archivo_600SemiBold',
  },
  guessPreviewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guessPreviewMetaPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  guessPreviewMetaText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.2,
  },
  guessPreviewHint: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Manrope_400Regular',
    letterSpacing: 0.2,
  },
  guessPreviewOptions: {
    gap: 8,
  },
  guessPreviewOption: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  guessPreviewOptionText: {
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    lineHeight: 18,
  },
  guessPreviewFooter: {
    fontSize: 11.5,
    lineHeight: 17,
    fontFamily: 'Manrope_400Regular',
    letterSpacing: 0.15,
  },
  customPromptInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
  },
  customPromptAnswer: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  customPromptSave: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  customPromptSaveText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.2,
  },
  
  // Buttons
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
    marginLeft: 4,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  editButtonText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
    marginLeft: 4,
  },
  
  // Photo Gallery
  photoGallery: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  addPhotoCard: {
    width: 120,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addPhotoText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    marginTop: 8,
  },
  galleryEmptyCard: {
    marginHorizontal: 20,
  },
  photoCard: {
    position: 'relative',
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  deletePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Prompts
  promptCard: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  promptTitle: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    marginBottom: 12,
  },
  promptOptions: {
    gap: 8,
  },
  promptOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  promptOptionSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  promptOptionPreview: {
    opacity: 0.8,
  },
  promptOptionText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#374151',
  },
  promptOptionTextSelected: {
    color: '#fff',
    fontFamily: 'Archivo_700Bold',
  },
  
  // Interests
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestTag: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  interestText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
  },
  noInterestsText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  
  // Distance Unit
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardShadow: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
  cardShadowSoft: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 8,
  },
  settingLabel: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: '#6b7280',
  },
  settingValue: {
    fontSize: 16,
    fontFamily: 'Manrope_600SemiBold',
    color: '#111827',
  },
  
  // Settings sheet
  settingsSheet: {
    borderWidth: 1,
    borderRadius: 22,
    maxHeight: '82%',
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  settingsSheetContent: {
    gap: 10,
    paddingBottom: 8,
  },
  settingsSheetItem: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsSheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsSheetCopy: {
    flex: 1,
    gap: 3,
  },
  settingsSheetTitle: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
  settingsSheetBody: {
    fontSize: 11.75,
    lineHeight: 16,
    fontFamily: 'Manrope_400Regular',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 4,
    marginHorizontal: 12,
  },
  appearanceHeaderCopy: {
    flex: 1,
    paddingRight: 12,
  },
  appearanceHeaderBody: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_400Regular',
  },
  appearancePreviewCard: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
  },
  appearancePreviewGradient: {
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  appearancePreviewEyebrow: {
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  appearancePreviewTitle: {
    marginTop: 6,
    fontSize: 17,
    fontFamily: 'Archivo_600SemiBold',
  },
  appearancePreviewBody: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_400Regular',
  },
  appearancePreviewChipRow: {
    marginTop: 12,
    flexDirection: 'row',
  },
  appearancePreviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  appearancePreviewChipText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
  },
  appearanceOptionList: {
    gap: 10,
  },
  appearanceOptionCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appearanceOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appearanceOptionCopy: {
    flex: 1,
    gap: 4,
  },
  appearanceOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  appearanceOptionTitle: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    flex: 1,
  },
  appearanceOptionBody: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_400Regular',
  },
  appearanceActivePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  appearanceActivePillText: {
    fontSize: 10.5,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  
  // Profile Details Styles
  profileDetails: {
    marginTop: 16,
    gap: 8,
    width: '100%',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 2,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    flexBasis: '48%',
    flexGrow: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  detailText: {
    fontSize: 13.5,
    color: '#475569',
    fontFamily: 'Manrope_500Medium',
  },
  closeAdminButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
    zIndex: 1000,
  },
  notificationModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  notificationModalCard: {
    borderWidth: 1,
    borderRadius: 18,
    maxHeight: '80%',
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  notificationStudioCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  notificationModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  notificationModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  notificationModalContent: {
    paddingBottom: 12,
  },
  notificationStudioContent: {
    gap: 18,
    paddingBottom: 12,
  },
  notificationHeroCard: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  notificationHeroGradient: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    overflow: 'hidden',
  },
  notificationHeroArtwork: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationHeroRingLarge: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
  },
  notificationHeroRingSmall: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
  },
  notificationHeroPulseDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    top: 18,
    right: 18,
  },
  notificationHeroOrbitDot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
    bottom: 18,
    left: 16,
  },
  notificationHeroEyebrow: {
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  notificationHeroTitle: {
    marginTop: 6,
    fontSize: 18,
    fontFamily: 'Archivo_600SemiBold',
  },
  notificationHeroBody: {
    marginTop: 5,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_400Regular',
  },
  notificationHeroChipRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  notificationHeroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  notificationHeroChipText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
  },
  notificationSection: {
    gap: 14,
  },
  notificationSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  notificationCardGrid: {
    gap: 12,
  },
  notificationToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  notificationToggleIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationToggleCopy: {
    flex: 1,
    gap: 3,
  },
  notificationToggleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationToggleLabel: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  notificationToggleDescription: {
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: 'Manrope_400Regular',
  },
  notificationToggleControl: {
    minWidth: 80,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 7,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 5,
  },
  notificationToggleControlText: {
    fontSize: 10.5,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.25,
  },
  notificationToggleControlTrack: {
    width: 40,
    height: 22,
    borderRadius: 999,
    paddingHorizontal: 3,
    justifyContent: 'center',
  },
  notificationToggleControlThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  notificationToggleControlThumbOn: {
    alignSelf: 'flex-end',
  },
  notificationToggleControlThumbOff: {
    alignSelf: 'flex-start',
  },
  notificationLoading: {
    fontSize: 12,
    marginTop: 8,
  },
  quietHoursStudioCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  quietHoursSummaryRow: {
    gap: 8,
  },
  quietHoursSummaryPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  quietHoursSummaryText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
  },
  quietHoursSummaryMeta: {
    fontSize: 11.75,
    lineHeight: 17,
    fontFamily: 'Manrope_400Regular',
  },
  linkedMethodsBanner: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linkedMethodsBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  linkedMethodsBannerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedMethodsBannerTitle: {
    fontSize: 16,
    fontFamily: 'Archivo_600SemiBold',
  },
  linkedMethodsBannerBody: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_400Regular',
  },
  linkedMethodsBannerActions: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linkedMethodsBannerPrimary: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  linkedMethodsBannerPrimaryText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  linkedMethodsBannerSecondary: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  linkedMethodsBannerSecondaryText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.2,
  },
  emailModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 32,
  },
  deleteModalBackdrop: {
    justifyContent: 'flex-start',
    paddingTop: 52,
    paddingBottom: 20,
  },
  emailModalCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  emailModalScroll: {
    marginTop: 2,
  },
  emailModalScrollContent: {
    gap: 12,
    paddingBottom: 4,
  },
  emailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  emailModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  emailModalBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  accountOfflineNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 14,
  },
  accountOfflineNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_500Medium',
  },
  emailInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
  },
  emailError: {
    fontSize: 12,
    marginTop: 10,
  },
  emailMessage: {
    fontSize: 12,
    marginTop: 10,
  },
  emailSaveButton: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  emailSaveText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  emailAccountDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 18,
    marginBottom: 18,
  },
  identitySection: {
    gap: 10,
  },
  identitySectionTitle: {
    fontSize: 15,
    fontFamily: 'Archivo_600SemiBold',
  },
  identitySectionBody: {
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_400Regular',
  },
  recoveryStrengthCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  recoveryStrengthHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  recoveryStrengthCopy: {
    flex: 1,
    gap: 4,
  },
  recoveryStrengthTitle: {
    fontSize: 13.5,
    fontFamily: 'Archivo_600SemiBold',
  },
  recoveryStrengthBody: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_400Regular',
  },
  recoveryStrengthPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recoveryStrengthPillText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  recoveryStrengthMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recoveryStrengthMethodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  recoveryStrengthMethodText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_600SemiBold',
  },
  identityMethodCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  identityMethodMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  identityMethodIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityMethodTextWrap: {
    flex: 1,
    gap: 2,
  },
  identityMethodTitle: {
    fontSize: 13.5,
    fontFamily: 'Manrope_700Bold',
  },
  identityMethodSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_400Regular',
  },
  identityStatusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  identityStatusText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  identityLinkButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  identityActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  identityUnlinkButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  identityUnlinkButtonText: {
    color: '#ef4444',
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  identityLinkButtonText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  identitySupportText: {
    fontSize: 11.5,
    lineHeight: 17,
    fontFamily: 'Manrope_400Regular',
  },
  identityError: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_500Medium',
  },
  identityMessage: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_500Medium',
  },
  identitySuccessInlineCard: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    gap: 7,
  },
  identitySuccessInlineGlow: {
    position: 'absolute',
    top: -28,
    left: -24,
    right: -24,
    height: 116,
  },
  identitySuccessInlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  identitySuccessInlineIconHalo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identitySuccessInlineIconCore: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identitySuccessInlineEyebrow: {
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 1.4,
    marginTop: 4,
  },
  identitySuccessInlineTitle: {
    fontSize: 23,
    lineHeight: 28,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  identitySuccessInlineBody: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Manrope_500Medium',
  },
  identityLoading: {
    fontSize: 11.5,
    fontFamily: 'Manrope_400Regular',
  },
  recoveryCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    marginTop: 4,
  },
  recoveryCardCopy: {
    gap: 4,
  },
  passwordBackupCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  passwordBackupActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  passwordBackupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  passwordBackupSecondaryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  passwordBackupSecondaryText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.2,
  },
  passwordBackupEditor: {
    gap: 10,
  },
  passwordBackupButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  recoveryCardTitle: {
    fontSize: 13.5,
    fontFamily: 'Archivo_600SemiBold',
  },
  recoveryCardBody: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_400Regular',
  },
  recoveryCardButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  recoveryCardButtonText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  accountDeletionCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  accountDeletionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  accountDeletionCopy: {
    flex: 1,
    gap: 4,
  },
  accountDeletionButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  accountDeletionFootnote: {
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: 'Manrope_500Medium',
  },
  accountDeletionButtonText: {
    color: '#ef4444',
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  recoveryFieldGroup: {
    gap: 8,
    marginTop: 4,
  },
  recoveryFieldLabel: {
    fontSize: 12.5,
    fontFamily: 'Manrope_700Bold',
  },
  recoveryChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recoveryChoicePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recoveryChoiceText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
  },
  recoveryTextArea: {
    minHeight: 110,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginTop: 12,
    fontFamily: 'Manrope_500Medium',
  },
  deleteModalCard: {
    maxHeight: '70%',
    paddingTop: 16,
    paddingBottom: 14,
  },
  deleteModalScroll: {
    marginTop: 4,
  },
  deleteModalScrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  deleteEyebrow: {
    fontSize: 11.5,
    fontFamily: 'Archivo_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  deleteAlternativePanel: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 8,
  },
  deleteAlternativePanelCopy: {
    gap: 2,
  },
  deleteAlternativePanelTitle: {
    fontSize: 13,
    fontFamily: 'Archivo_600SemiBold',
  },
  deleteAlternativePanelBody: {
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: 'Manrope_400Regular',
  },
  deleteAlternativeActions: {
    gap: 5,
  },
  deleteAlternativeButton: {
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minHeight: 0,
  },
  deleteAlternativeButtonTextWrap: {
    gap: 2,
  },
  deleteAlternativeButtonTitle: {
    fontSize: 12.5,
    fontFamily: 'Manrope_700Bold',
  },
  deleteAlternativeButtonBody: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Manrope_400Regular',
  },
  deleteAlternativeMessageCard: {
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deleteAlternativeMessageText: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_600SemiBold',
  },
  deleteSuggestionCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  deleteSuggestionCopy: {
    gap: 4,
  },
  deleteSuggestionLabel: {
    fontSize: 11.25,
    fontFamily: 'Archivo_600SemiBold',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  deleteSuggestionTitle: {
    fontSize: 13.5,
    fontFamily: 'Archivo_600SemiBold',
  },
  deleteSuggestionBody: {
    fontSize: 11.75,
    lineHeight: 16,
    fontFamily: 'Manrope_400Regular',
  },
  deleteSuggestionButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  deleteSuggestionButtonText: {
    color: '#fff',
    fontSize: 12.5,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  deleteReasonList: {
    gap: 10,
  },
  deleteReasonSection: {
    gap: 5,
  },
  deleteSectionLabel: {
    fontSize: 11.5,
    fontFamily: 'Archivo_600SemiBold',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  deleteReasonSectionRows: {
    gap: 6,
  },
  deleteReasonRow: {
    position: 'relative',
    borderWidth: 1,
    borderRadius: 15,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteReasonRowSelected: {
    shadowColor: '#11C5C6',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  deleteReasonAccent: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 4,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  deleteReasonCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteReasonCheckDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  deleteReasonCopy: {
    flex: 1,
    gap: 3,
  },
  deleteReasonTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  deleteReasonTitle: {
    fontSize: 13.25,
    fontFamily: 'Manrope_700Bold',
    flex: 1,
  },
  deleteReasonSelectedPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deleteReasonSelectedText: {
    fontSize: 10.5,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  deleteReasonDescription: {
    fontSize: 11.75,
    lineHeight: 15,
    fontFamily: 'Manrope_400Regular',
  },
  deleteFeedbackInput: {
    minHeight: 84,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    textAlignVertical: 'top',
  },
  deleteActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  deleteFooterCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 8,
  },
  deleteFooterCopy: {
    gap: 2,
  },
  deleteFooterTitle: {
    fontSize: 13,
    fontFamily: 'Archivo_600SemiBold',
  },
  deleteFooterBody: {
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: 'Manrope_400Regular',
  },
  deleteCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteCancelButtonText: {
    fontSize: 13.5,
    fontFamily: 'Manrope_700Bold',
  },
  deleteConfirmButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: '#C65263',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  deleteConfirmButtonText: {
    color: '#fff',
    fontSize: 13.5,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  quietHoursHint: {
    fontSize: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  quietHoursPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quietHoursPill: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  quietHoursPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  quietHoursCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  quietHoursInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietHoursInputText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  quietHoursDash: {
    fontSize: 12,
    fontWeight: '600',
  },
});
