import { DiasporaVerification } from "@/components/DiasporaVerification";
import PhotoGallery from "@/components/PhotoGallery";
import ProfileEditModal from "@/components/ProfileEditModal";
import { VerificationBadge } from "@/components/VerificationBadge";
import { VerificationNudgeCard } from "@/components/VerificationNudgeCard";
import { VerificationNotifications } from "@/components/VerificationNotifications";
import ProfileVideoModal from "@/components/ProfileVideoModal";
import { Colors } from "@/constants/theme";
import { useColorScheme, useColorSchemePreference } from "@/hooks/use-color-scheme";
import { useVerificationStatus } from "@/hooks/use-verification-status";
import { useAuth } from "@/lib/auth-context";
import { canAccessAdminTools } from "@/lib/internal-tools";
import { readCache, writeCache } from "@/lib/persisted-cache";
import { getProfileInitials, getProfilePlaceholderPalette, hasProfileImage } from "@/lib/profile-placeholders";
import {
  DEFAULT_GUESS_REVEAL_POLICY,
  normalizeGuessText,
  sanitizeGuessOptions,
  shuffleOptions,
} from "@/lib/prompts/guess-prompts";
import { supabase } from "@/lib/supabase";
import { isTrustedAuthCallbackUrl } from "@/lib/auth-callback";
import type { GuessMode, ProfilePromptAnswer, PromptType } from "@/types/user-profile";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Clipboard from "expo-clipboard";
import { makeRedirectUri } from "expo-auth-session";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  ImageBackground,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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

type DistanceUnit = 'auto' | 'km' | 'mi';

type NotificationPrefs = {
  push_enabled: boolean;
  inapp_enabled: boolean;
  messages: boolean;
  message_reactions: boolean;
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

const DELETE_SOFT_OFFRAMP_OPTIONS: Array<{
  id: DeleteAlternativeAction;
  title: string;
  description: string;
}> = [
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

// Settings menu items
const SETTINGS_MENU_ITEMS = [
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
    title: 'Dating Preferences',
    icon: 'heart',
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
  const hasTribe = !!(profile.tribe || '').trim();
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
    { label: 'Add your tribe or ethnicity', ok: hasTribe },
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
  const { refreshStatus } = useVerificationStatus(profile?.id);
  const { preference: themePreference, setPreference: setThemePreference } = useColorSchemePreference();
  
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
  
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [identitiesLoading, setIdentitiesLoading] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [identityMessage, setIdentityMessage] = useState('');
  const [identityError, setIdentityError] = useState('');
  const [showRecoveryRequestModal, setShowRecoveryRequestModal] = useState(false);
  const [recoveryCurrentMethod, setRecoveryCurrentMethod] = useState<string>('email');
  const [recoveryPreviousMethod, setRecoveryPreviousMethod] = useState<string>('google');
  const [recoveryContactEmail, setRecoveryContactEmail] = useState('');
  const [recoveryPreviousEmail, setRecoveryPreviousEmail] = useState('');
  const [recoveryNote, setRecoveryNote] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
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
  const promptsCacheKey = useMemo(
    () => (cacheProfileId ? `cache:profile_prompts:v2:${cacheProfileId}` : null),
    [cacheProfileId],
  );
  const interestsCacheKey = useMemo(
    () => (cacheProfileId ? `cache:profile_interests:v1:${cacheProfileId}` : null),
    [cacheProfileId],
  );
  const photosCacheKey = useMemo(
    () => (cacheProfileId ? `cache:profile_photos:v1:${cacheProfileId}` : null),
    [cacheProfileId],
  );
  const verificationNudgeDismissedKey = useMemo(
    () => (cacheProfileId ? `${VERIFICATION_NUDGE_DISMISSED_KEY_PREFIX}:${cacheProfileId}` : null),
    [cacheProfileId],
  );
  const cacheLoadedRef = useRef<{ prompts: boolean; interests: boolean; photos: boolean }>({
    prompts: false,
    interests: false,
    photos: false,
  });
  const [isVerificationModalVisible, setIsVerificationModalVisible] = useState(false);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('auto');
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    push_enabled: true,
    inapp_enabled: true,
    messages: true,
    message_reactions: true,
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
  const [matchQuality, setMatchQuality] = useState<number | null>(null);
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

  const handleCopyDevSessionToken = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        Alert.alert('Session error', error.message);
        return;
      }

      const accessToken = data.session?.access_token ?? null;
      const authUserId = data.session?.user?.id ?? user?.id ?? null;
      const profileId = profile?.id ?? null;

      if (!accessToken) {
        Alert.alert('No active session', 'No access token found for the current signed-in session.');
        return;
      }

      const debugPayload = [
        `ACCESS_TOKEN=${accessToken}`,
        `AUTH_USER_ID=${authUserId ?? ''}`,
        `PROFILE_ID=${profileId ?? ''}`,
      ].join('\n');

      await Clipboard.setStringAsync(debugPayload);
      Alert.alert(
        'Session copied',
        `Copied access token, auth user id, and profile id.\n\nAuth user: ${authUserId ?? 'unknown'}\nProfile: ${profileId ?? 'unknown'}`,
      );
    } catch (error: any) {
      Alert.alert('Copy failed', error?.message || 'Unable to read the current session.');
    }
  }, [profile?.id, user?.id]);

  const progressSubtitle = useMemo(() => {
    if (profileCompletion.percent >= 100) return "Profile complete";
    if (profileCompletion.percent >= 80) return "Strong presence";
    if (profileCompletion.percent >= 50) return "Shaping your presence";
    return "Start with your best details";
  }, [profileCompletion.percent]);

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
      console.log('Profile manually refreshed');
    } catch (error) {
      console.error('Error refreshing profile:', error);
    } finally {
      setRefreshing(false);
    }
  };

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

  // Cached-first hydration for profile sub-data (prompts/interests/photos).
  useEffect(() => {
    if (promptsCacheKey && !cacheLoadedRef.current.prompts) {
      cacheLoadedRef.current.prompts = true;
      void (async () => {
        const cached = await readCache<typeof promptAnswers>(promptsCacheKey, 30 * 60_000);
        if (cached && Array.isArray(cached) && cached.length > 0 && promptAnswers.length === 0) {
          applyPromptAnswers(cached as any);
        }
      })();
    }
    if (interestsCacheKey && !cacheLoadedRef.current.interests) {
      cacheLoadedRef.current.interests = true;
      void (async () => {
        const cached = await readCache<string[]>(interestsCacheKey, 30 * 60_000);
        if (cached && Array.isArray(cached) && cached.length > 0) {
          setUserInterests((prev) => (prev.length === 0 ? cached : prev));
        }
      })();
    }
    if (photosCacheKey && !cacheLoadedRef.current.photos) {
      cacheLoadedRef.current.photos = true;
      void (async () => {
        const cached = await readCache<string[]>(photosCacheKey, 30 * 60_000);
        if (cached && Array.isArray(cached) && cached.length > 0) {
          setUserPhotos((prev) => (prev.length === 0 ? cached : prev));
        }
      })();
    }
  }, [applyPromptAnswers, interestsCacheKey, photosCacheKey, promptsCacheKey, promptAnswers.length]);

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
      if (promptsCacheKey) void writeCache(promptsCacheKey, rows);
    } finally {
      setPromptsLoading(false);
    }
  }, [applyPromptAnswers, profile?.id, promptsCacheKey]);

  // Fetch user interests from profile_interests table
  const fetchUserInterests = async () => {
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
      if (interestsCacheKey) void writeCache(interestsCacheKey, interests);
    } catch (error) {
      console.error('Error fetching user interests:', error);
    } finally {
      setLoadingInterests(false);
    }
  };

  // Load user photos from profile and storage
  const loadUserPhotos = async () => {
    if (!user?.id) return;
    
    try {
      // First check if photos exist in profile.photos field
      const profilePhotos = (profile as any)?.photos || [];
      if (profilePhotos.length > 0) {
        setUserPhotos(profilePhotos);
        if (photosCacheKey) void writeCache(photosCacheKey, profilePhotos);
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
        
        setUserPhotos(photoUrls);
        if (photosCacheKey) void writeCache(photosCacheKey, photoUrls);
      }
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  };

  const fetchProfileStats = useCallback(async () => {
    if (!profile?.id || !user?.id) {
      setLikesCount(0);
      setMatchesCount(0);
      setChatsCount(0);
      setMatchQuality(null);
      return;
    }

    try {
      // Likes are stored as incoming intent requests (keyed by profiles.id).
      const { data: intents, error: intentsError } = await supabase
        .from('intent_requests')
        .select('id,type,status,expires_at')
        .eq('recipient_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(300);

      if (intentsError || !intents) {
        setLikesCount(0);
      } else {
        const now = Date.now();
        const actionable = (intents as any[]).filter((row) => {
          const ts = typeof row?.expires_at === 'string' ? Date.parse(row.expires_at) : NaN;
          return Number.isNaN(ts) ? true : ts >= now;
        });
        setLikesCount(actionable.filter((row) => row?.type === 'like_with_note').length);
      }
    } catch {
      setLikesCount(0);
    }

    try {
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('id,user1_id,user2_id,status')
        .eq('status', 'ACCEPTED')
        .or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`)
        .limit(500);

      if (matchesError || !matches) {
        setMatchesCount(0);
        setMatchQuality(null);
      } else {
        const rows = matches as any[];
        const otherIds = Array.from(
          new Set(
            rows
              .map((m) => (m.user1_id === profile.id ? m.user2_id : m.user1_id))
              .filter((v): v is string => typeof v === 'string' && v.length > 0),
          ),
        );
        setMatchesCount(otherIds.length);

        if (otherIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            // `compatibility` column does not exist in current schema; use `ai_score` as a proxy.
            .select('id,ai_score')
            .in('id', otherIds);
          if (profilesError || !profilesData) {
            setMatchQuality(null);
          } else {
            const scores = (profilesData as any[])
              .map((p) => (typeof p?.ai_score === 'number' ? p.ai_score : null))
              .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
            if (scores.length > 0) {
              const avg = scores.reduce((sum, v) => sum + v, 0) / scores.length;
              setMatchQuality(Math.max(0, Math.min(100, Math.round(avg))));
            } else {
              setMatchQuality(null);
            }
          }
        } else {
          setMatchQuality(null);
        }
      }
    } catch {
      setMatchesCount(0);
      setMatchQuality(null);
    }

    try {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('sender_id,receiver_id')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(500);

      if (messagesError || !messages) {
        setChatsCount(0);
      } else {
        const convoIds = new Set<string>();
        (messages as any[]).forEach((m) => {
          const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
          if (typeof otherId === 'string' && otherId.length > 0) convoIds.add(otherId);
        });
        setChatsCount(convoIds.size);
      }
    } catch {
      setChatsCount(0);
    }
  }, [profile?.id, user?.id]);

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
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // Load user interests and photos when component mounts or profile changes
  useEffect(() => {
    if (profile && user?.id) {
      fetchUserInterests();
      loadUserPhotos();
      loadPromptAnswers();
      void fetchProfileStats();
    }
  }, [profile, user?.id, loadPromptAnswers, fetchProfileStats]);

  const loadNotificationPrefs = useCallback(async () => {
    if (!user?.id) return;
    setNotificationPrefsLoaded(false);
    const { data, error } = await supabase
      .from('notification_prefs')
      .select(
        'push_enabled,inapp_enabled,messages,message_reactions,reactions,likes,superlikes,matches,moments,verification,announcements,preview_text,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_tz',
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
      setNotificationPrefs({
        push_enabled: Boolean(data.push_enabled),
        inapp_enabled: Boolean(data.inapp_enabled),
        messages: Boolean(data.messages),
        message_reactions: Boolean(data.message_reactions),
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
      });
    }
    setNotificationPrefsLoaded(true);
  }, [user?.id]);

  useEffect(() => {
    void loadNotificationPrefs();
  }, [loadNotificationPrefs]);

  // Check if returning from full preview and should enter preview mode
  useEffect(() => {
    if (params.returnToPreview === 'true') {
      setIsPreviewMode(true);
      // Clear the parameter to avoid re-triggering
      router.replace('/(tabs)/profile');
    }
  }, [params.returnToPreview]);

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
    if (linkedProviders.length < 2) {
      Alert.alert(
        'Before you sign out',
        'Link Google or Apple so you always come back to the same Betweener account.',
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
    if (isPreviewMode) return; // Don't allow changes in preview mode

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
    if (isPreviewMode || !profile?.id) return;
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
    if (isPreviewMode || !profile?.id) return;
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
      if (isPreviewMode || !profile?.id || !promptRowId) return;
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
    [isPreviewMode, loadPromptAnswers, profile?.id],
  );

  const togglePreviewMode = () => {
    setIsPreviewMode(!isPreviewMode);
  };

  const openPromptEditor = useCallback(() => {
    if (isPreviewMode) return;
    setShowPromptEditor(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, promptEditorYRef.current - 24),
          animated: true,
        });
      }, 80);
    });
  }, [isPreviewMode]);

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
          location: profile.region || profile.location || '',
          avatar_url: profile.avatar_url,
          photos: (profile as any).photos,
          occupation: (profile as any).occupation,
          education: (profile as any).education,
          bio: profile.bio,
          tribe: (profile as any).tribe,
          religion: (profile as any).religion,
          distance: profile.region || '',
          interests: (profile as any).interests,
          is_active: true,
          compatibility: compatPct,
          verified: !!(profile as any).verification_level,
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
    const toValue = showSettingsDropdown ? 0 : 1;
    
    setShowSettingsDropdown(!showSettingsDropdown);
    
    Animated.parallel([
      Animated.timing(dropdownAnim, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleSettingsItemPress = (itemId: string) => {
    toggleSettingsDropdown();
    
    if (itemId === 'logout') {
      handleSignOut();
    } else if (itemId === 'admin') {
      if (!canSeeAdminTools) return;
      router.push('/admin');
    } else if (itemId === 'email') {
      openEmailAccountModal();
    } else if (itemId === 'notifications') {
      setShowNotificationsModal(true);
    } else if (itemId === 'privacy') {
      router.push('/trust-center');
    } else if (itemId === 'help') {
      router.push('/support-center');
    } else if (itemId === 'premium') {
      router.push('/premium-plans');
    } else {
      // Handle other settings navigation
      console.log(`Navigate to ${itemId}`);
    }
  };

  const openEmailAccountModal = useCallback(() => {
    setEmailMessage('');
    setEmailError('');
    setIdentityMessage('');
    setIdentityError('');
    setEmailInput(user?.email ?? '');
    setShowEmailModal(true);
  }, [user?.email]);

  const openRecoveryRequestModal = useCallback(() => {
    setRecoveryError('');
    setRecoveryMessage('');
    setRecoveryCurrentMethod(linkedProviders.includes('google') ? 'google' : 'email');
    setRecoveryPreviousMethod(linkedProviders.includes('apple') ? 'apple' : 'google');
    setRecoveryContactEmail(user?.email ?? '');
    setRecoveryPreviousEmail('');
    setRecoveryNote('');
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

  const loadLinkedIdentities = useCallback(async () => {
    if (!user?.id) {
      setLinkedProviders([]);
      return;
    }
    setIdentitiesLoading(true);
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) {
        setIdentityError(error.message);
        return;
      }
      const providers = Array.from(
        new Set(
          (data?.identities ?? [])
            .map((identity) => String(identity.provider || '').toLowerCase())
            .filter(Boolean),
        ),
      );
      setLinkedProviders(providers);
    } catch (error: any) {
      setIdentityError(error?.message ?? 'Unable to load sign-in methods.');
    } finally {
      setIdentitiesLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!showEmailModal || !user?.id) return;
    void loadLinkedIdentities();
  }, [loadLinkedIdentities, showEmailModal, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLinkedProviders([]);
      setLinkedMethodsBannerDismissed(false);
      return;
    }
    void loadLinkedIdentities();
  }, [loadLinkedIdentities, user?.id]);

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

  const shouldShowLinkedMethodsBanner =
    !isPreviewMode &&
    !linkedMethodsBannerDismissed &&
    !identitiesLoading &&
    linkedProviders.length < 2;

  const finishIdentityCallback = useCallback(async (url: string) => {
    if (!isTrustedAuthCallbackUrl(url)) {
      throw new Error("Untrusted auth callback.");
    }

    const merged: AuthCallbackParams = {};
    mergeAuthParamsFromUrl(merged, url);

    const code = merged.code;
    const accessToken = merged.access_token;
    const refreshToken = merged.refresh_token;

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
    if (code === 'identity_already_exists') {
      return `This ${providerLabel} account is already linked to another Betweener account.`;
    }
    if (code === 'identity_not_found') {
      return `${providerLabel} could not be linked right now. Please try again.`;
    }
    return error?.message ?? `Unable to link ${providerLabel}.`;
  }, []);

  const handleLinkGoogle = useCallback(async () => {
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
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url && isTrustedAuthCallbackUrl(result.url)) {
        await finishIdentityCallback(result.url);
        await waitForSession(4000);
        await loadLinkedIdentities();
        setIdentityMessage('Google is now linked to this Betweener account.');
      }
    } catch (error: any) {
      setIdentityError(formatIdentityLinkError(error, 'Google'));
    } finally {
      setLinkingProvider(null);
    }
  }, [finishIdentityCallback, formatIdentityLinkError, getOAuthRedirectUrl, loadLinkedIdentities, waitForSession]);

  const handleLinkApple = useCallback(async () => {
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
      await loadLinkedIdentities();
      setIdentityMessage('Apple is now linked to this Betweener account.');
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
  }, [formatIdentityLinkError, loadLinkedIdentities, waitForSession]);

  const handleSubmitRecoveryRequest = useCallback(async () => {
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
          setNotificationPrefs((current) => ({
            ...current,
            ...returnedPrefs,
          }));
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
    [primaryDeleteReason, refreshProfile],
  );

  const submitDeleteAccount = useCallback(async () => {
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

      if (error || !(data as any)?.success) {
        throw error ?? new Error('Unable to delete your account right now.');
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
  }, [deleteFeedback, deleteReasonKeys, signOut]);

  const confirmDeleteAccount = useCallback(() => {
    if (deleteReasonKeys.length === 0) {
      setDeleteError('Select at least one reason before deleting your account.');
      return;
    }

    Alert.alert(
      'Close your account permanently?',
      'This permanently closes your Betweener account, removes access, and hides your profile right away. This action cannot be undone.',
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
      if (!user?.id) return;
      const { error } = await supabase
        .from('notification_prefs')
        .upsert(
          {
            user_id: user.id,
            ...next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      if (error) {
        console.log('[profile] notification prefs update error', error);
      }
    },
    [user?.id],
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

  const heroImageUri =
    userPhotos[0]
    || profile?.avatar_url
    || '';
  const avatarImageUri =
    profile?.avatar_url
    || userPhotos[0]
    || '';
  const heroVideoSource =
    (profile as any)?.profile_video
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

  const locationPartsRaw = [
    (profile as any)?.city,
    profile?.region,
    profile?.location,
    (profile as any)?.current_country,
  ]
    .map((part: string | undefined) => (part || '').trim())
    .filter(Boolean);
  const locationParts = locationPartsRaw.filter((part, index, arr) => {
    const key = part.toLowerCase();
    return arr.findIndex((p) => p.toLowerCase() === key) === index;
  });
  const locationDisplay = locationParts.length
    ? locationParts.join(', ')
    : 'Location not set';
  const verificationLevel =
    (profile as any)?.verification_level
    ?? (profile as any)?.verificationLevel
    ?? ((profile as any)?.verified ? 1 : 0);
  useEffect(() => {
    let active = true;

    if (!verificationNudgeDismissedKey || verificationLevel !== 1) {
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
  }, [verificationLevel, verificationNudgeDismissedKey]);

  const dismissVerificationNudge = useCallback(async () => {
    setVerificationNudgeDismissed(true);
    if (!verificationNudgeDismissedKey) return;
    try {
      await AsyncStorage.setItem(verificationNudgeDismissedKey, '1');
    } catch {
      // Best-effort dismissal persistence only.
    }
  }, [verificationNudgeDismissedKey]);
  const isOnlineNow = !!(profile as any)?.online;
  const isActiveNow = !!(profile as any)?.is_active || !!(profile as any)?.isActiveNow;
  const showPresence = isOnlineNow || isActiveNow;
  const presenceLabel = isOnlineNow ? 'Online' : 'Active now';
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
      if (source.startsWith('http')) {
        if (mounted) setHeroVideoUrl(source);
        return;
      }
      const { data, error } = await supabase.storage
        .from('profile-videos')
        .createSignedUrl(source, 3600);
      if (!mounted) return;
      if (error || !data?.signedUrl) {
        setHeroVideoUrl(null);
        return;
      }
      setHeroVideoUrl(data.signedUrl);
    };
    void resolveHeroVideo();
    return () => {
      mounted = false;
    };
  }, [heroVideoSource]);

  const HeroVideo = ({ uri }: { uri: string }) => {
    const player = useVideoPlayer(uri, (p) => {
      p.loop = true;
      p.muted = true;
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


  const closeDropdown = () => {
    if (showSettingsDropdown) {
      toggleSettingsDropdown();
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
      {Boolean(profile?.id) && <VerificationNotifications />}
      
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
            {isPreviewMode ? 'Profile Preview' : 'My Profile'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={[styles.previewButton, isPreviewMode && styles.previewButtonActive]} 
            onPress={togglePreviewMode}
          >
            <MaterialCommunityIcons 
              name={isPreviewMode ? "eye-off" : "eye"} 
              size={20} 
              color={isPreviewMode ? '#fff' : theme.tint} 
            />
            <Text style={[styles.previewButtonText, isPreviewMode && styles.previewButtonTextActive, { color: isPreviewMode ? '#fff' : theme.tint }]}>
              {isPreviewMode ? 'Edit' : 'Preview'}
            </Text>
          </TouchableOpacity>
          
          {!isPreviewMode && (
            <>
              {__DEV__ && (
                <>
                  <TouchableOpacity
                    style={styles.devButton}
                    onPress={handleCopyDevSessionToken}
                    accessibilityLabel="Copy current session token (dev)"
                  >
                    <Text style={styles.devButtonText}>TOK</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.devButton}
                    onPress={() => router.push("/(auth)/onboarding?variant=ghana")}
                    accessibilityLabel="Open Ghana onboarding (dev)"
                  >
                    <Text style={styles.devButtonText}>GH</Text>
                  </TouchableOpacity>
                </>
              )}
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
            </>
          )}
        </View>
      </Animated.View>

      {/* Settings Dropdown Overlay */}
      {showSettingsDropdown && (
        <>
          <Animated.View 
            style={[
              styles.dropdownBackdrop,
              {
                opacity: backdropAnim,
              }
            ]}
          >
            <TouchableOpacity 
              style={styles.backdropTouchable}
              onPress={closeDropdown}
              activeOpacity={1}
            />
          </Animated.View>
          
          <Animated.View
            style={[
              styles.settingsDropdown,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              {
                opacity: dropdownAnim,
                transform: [
                  {
                    translateY: dropdownAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-10, 0],
                    }),
                  },
                  {
                    scale: dropdownAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.95, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.themeSection}>
              <Text style={[styles.themeLabel, { color: theme.textMuted }]}>Theme</Text>
              <View style={styles.themePillRow}>
                {([
                  { id: 'light', label: 'Light' },
                  { id: 'dark', label: 'Dark' },
                  { id: 'system', label: 'System' },
                ] as const).map((option) => {
                  const active = themePreference === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.themePill,
                        { backgroundColor: theme.background, borderColor: theme.outline },
                        active && { backgroundColor: theme.tint + '20', borderColor: theme.tint },
                      ]}
                      onPress={() => setThemePreference(option.id)}
                    >
                      <Text
                        style={[
                          styles.themePillText,
                          { color: theme.text },
                          active && { color: theme.tint },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={[styles.dropdownDivider, { backgroundColor: theme.outline }]} />
            </View>

            {SETTINGS_MENU_ITEMS.filter((item) => {
              if (item.adminOnly) return canSeeAdminTools;
              return true;
            }).map((item) => {
              if (item.type === 'divider') {
                return <View key={item.id} style={styles.dropdownDivider} />;
              }
              
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.dropdownItem,
                        { backgroundColor: theme.background },
                        item.id === 'logout' && { backgroundColor: theme.tint + '15' }
                  ]}
                  onPress={() => handleSettingsItemPress(item.id)}
                >
                  <MaterialCommunityIcons 
                    name={item.icon as any} 
                    size={20} 
                    color={item.color} 
                  />
                  <Text 
                    style={[
                      styles.dropdownItemText,
                      { color: theme.text },
                      item.id === 'logout' && { color: theme.tint }
                    ]}
                  >
                    {item.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        </>
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
          <Text style={[styles.linkedMethodsBannerTitle, { color: theme.text }]}>Add another sign-in method</Text>
          <Text style={[styles.linkedMethodsBannerBody, { color: theme.textMuted }]}>
            Link Google or Apple so you always come back to the same Betweener account.
          </Text>
          <View style={styles.linkedMethodsBannerActions}>
            <TouchableOpacity
              onPress={openEmailAccountModal}
              style={[styles.linkedMethodsBannerPrimary, { backgroundColor: theme.tint }]}
            >
              <Text style={styles.linkedMethodsBannerPrimaryText}>Link now</Text>
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
        visible={showNotificationsModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={styles.notificationModalBackdrop}>
          <View
            style={[
              styles.notificationModalCard,
              styles.cardShadow,
              { backgroundColor: theme.background, borderColor: theme.outline },
            ]}
          >
            <View style={styles.notificationModalHeader}>
              <Text style={[styles.notificationModalTitle, { color: theme.text }]}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotificationsModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.notificationModalContent}>
              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Core</Text>
                <NotificationToggle
                  label="Messages"
                  value={notificationPrefs.messages}
                  onValueChange={(val) => updateNotificationPref('messages', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Message reactions"
                  value={notificationPrefs.message_reactions}
                  onValueChange={(val) => updateNotificationPref('message_reactions', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Reactions"
                  value={notificationPrefs.reactions}
                  onValueChange={(val) => updateNotificationPref('reactions', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Likes"
                  value={notificationPrefs.likes}
                  onValueChange={(val) => updateNotificationPref('likes', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Superlikes"
                  value={notificationPrefs.superlikes}
                  onValueChange={(val) => updateNotificationPref('superlikes', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Matches"
                  value={notificationPrefs.matches}
                  onValueChange={(val) => updateNotificationPref('matches', val)}
                  theme={theme}
                />
              </View>

              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Control</Text>
                <NotificationToggle
                  label="Push notifications"
                  value={notificationPrefs.push_enabled}
                  onValueChange={(val) => updateNotificationPref('push_enabled', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="In-app notifications"
                  value={notificationPrefs.inapp_enabled}
                  onValueChange={(val) => updateNotificationPref('inapp_enabled', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Preview message text"
                  value={notificationPrefs.preview_text}
                  onValueChange={(val) => updateNotificationPref('preview_text', val)}
                  theme={theme}
                />
              </View>

              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Quiet hours</Text>
                <NotificationToggle
                  label="Silence pushes"
                  value={notificationPrefs.quiet_hours_enabled}
                  onValueChange={(val) =>
                    updateQuietHours(val, notificationPrefs.quiet_hours_start, notificationPrefs.quiet_hours_end)
                  }
                  theme={theme}
                />
                {notificationPrefs.quiet_hours_enabled ? (
                  <>
                    <Text style={[styles.quietHoursHint, { color: theme.textMuted }]}>
                      {`Window: ${quietHoursLabel(notificationPrefs.quiet_hours_start)}-${quietHoursLabel(notificationPrefs.quiet_hours_end)}`}
                    </Text>
                    {quietHoursPreview ? (
                      <Text style={[styles.quietHoursHint, { color: theme.textMuted }]}>
                        {quietHoursPreview}
                      </Text>
                    ) : null}
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
                ) : null}
              </View>

              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Optional</Text>
                <NotificationToggle
                  label="Moments"
                  value={notificationPrefs.moments}
                  onValueChange={(val) => updateNotificationPref('moments', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Verification updates"
                  value={notificationPrefs.verification}
                  onValueChange={(val) => updateNotificationPref('verification', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Announcements"
                  value={notificationPrefs.announcements}
                  onValueChange={(val) => updateNotificationPref('announcements', val)}
                  theme={theme}
                />
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
            <Text style={[styles.emailModalBody, { color: theme.textMuted }]}>
              Update the email you use to sign in. We'll send a confirmation link to your new email.
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
                { backgroundColor: theme.tint, opacity: emailSaving ? 0.6 : 1 },
              ]}
              onPress={handleEmailUpdate}
              disabled={emailSaving}
            >
              <Text style={styles.emailSaveText}>{emailSaving ? 'Sending...' : 'Send confirmation'}</Text>
            </TouchableOpacity>
            <View style={[styles.emailAccountDivider, { backgroundColor: theme.outline }]} />
            <View style={styles.identitySection}>
              <Text style={[styles.identitySectionTitle, { color: theme.text }]}>Linked sign-in methods</Text>
              <Text style={[styles.identitySectionBody, { color: theme.textMuted }]}>
                Add another sign-in method so Google and Apple always open the same Betweener account.
              </Text>

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
                      {linkedProviders.includes('google') ? 'Linked to this account' : 'Not linked yet'}
                    </Text>
                  </View>
                </View>
                {linkedProviders.includes('google') ? (
                  <View style={[styles.identityStatusPill, { backgroundColor: theme.tint + '18', borderColor: theme.tint }]}>
                    <Text style={[styles.identityStatusText, { color: theme.tint }]}>Linked</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleLinkGoogle}
                    disabled={identitiesLoading || linkingProvider !== null}
                    style={[
                      styles.identityLinkButton,
                      {
                        backgroundColor: theme.tint,
                        opacity: identitiesLoading || linkingProvider !== null ? 0.65 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.identityLinkButtonText}>
                      {linkingProvider === 'google' ? 'Linking...' : 'Link Google'}
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
                        {linkedProviders.includes('apple') ? 'Linked to this account' : 'Not linked yet'}
                      </Text>
                    </View>
                  </View>
                  {linkedProviders.includes('apple') ? (
                    <View style={[styles.identityStatusPill, { backgroundColor: theme.tint + '18', borderColor: theme.tint }]}>
                      <Text style={[styles.identityStatusText, { color: theme.tint }]}>Linked</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={handleLinkApple}
                      disabled={identitiesLoading || linkingProvider !== null}
                      style={[
                        styles.identityLinkButton,
                        {
                          backgroundColor: theme.tint,
                          opacity: identitiesLoading || linkingProvider !== null ? 0.65 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.identityLinkButtonText}>
                        {linkingProvider === 'apple' ? 'Linking...' : 'Link Apple'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}

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
                    If Apple, Google, or email opened the wrong Betweener account, send a recovery request for support review.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={openRecoveryRequestModal}
                  style={[styles.recoveryCardButton, { backgroundColor: theme.tint }]}
                >
                  <Text style={styles.recoveryCardButtonText}>Recover account access</Text>
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
                    style={[styles.accountDeletionButton, { borderColor: '#ef4444', backgroundColor: theme.background }]}
                  >
                    <Text style={styles.accountDeletionButtonText}>Leave now</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.accountDeletionFootnote, { color: theme.textMuted }]}>
                  We'll offer calmer options before anything is closed permanently.
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
              styles.cardShadow,
              { backgroundColor: theme.background, borderColor: theme.outline },
            ]}
          >
            <View style={styles.emailModalHeader}>
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
                { backgroundColor: theme.tint, opacity: recoverySubmitting ? 0.6 : 1 },
              ]}
              onPress={handleSubmitRecoveryRequest}
              disabled={recoverySubmitting}
            >
              <Text style={styles.emailSaveText}>{recoverySubmitting ? 'Sending...' : 'Send recovery request'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Preview Mode Banner */}
      {isPreviewMode && (
        <View style={[styles.previewBanner, { backgroundColor: theme.tint + '15', borderBottomColor: theme.outline }]}>
          <MaterialCommunityIcons name="eye" size={16} color={theme.tint} />
          <View style={styles.previewBannerContent}>
            <Text style={styles.previewBannerText}>
              This is how others see your profile
            </Text>
            <TouchableOpacity style={styles.fullPreviewButton} onPress={openFullPreview}>
              <Text style={styles.fullPreviewButtonText}>View Full Preview</Text>
              <MaterialCommunityIcons name="arrow-right" size={14} color={theme.tint} />
            </TouchableOpacity>
          </View>
        </View>
      )}

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
                  {!isPreviewMode && (
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
                  )}
                </View>
              </View>
            ) : (
              hasHeroImage ? (
                <ImageBackground
                  source={{ uri: heroImageUri }}
                  style={styles.heroImage}
                  imageStyle={styles.heroImageStyle}
                >
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
                    {!isPreviewMode && (
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
                    )}
                  </View>
                </ImageBackground>
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
                    {!isPreviewMode && (
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
                    )}
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
                  <Image
                    source={{ uri: avatarImageUri }}
                    style={[styles.avatar, { borderColor: theme.background }]}
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
            {!isPreviewMode && (
              <TouchableOpacity
                style={styles.editAvatarButton}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons name="camera" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.heroNameRow}>
            <Text style={[styles.profileName, { color: theme.text }]}>
              {displayName}
              {displayAge ? `, ${displayAge}` : ""}
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
            <Text style={[styles.locationText, { color: theme.textMuted }]}>
              {locationDisplay}
            </Text>
          </View>

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
          {!isPreviewMode && verificationLevel === 1 && !verificationNudgeDismissed ? (
            <VerificationNudgeCard
              theme={theme}
              onPress={() => setIsVerificationModalVisible(true)}
              onSecondaryPress={dismissVerificationNudge}
            />
          ) : null}
          {!isPreviewMode ? (
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
          ) : null}

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
                {!isPreviewMode ? (
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
                ) : null}
              </View>
              <Text style={[styles.featuredPromptTitle, { color: theme.text }]}>
                {featuredPrompt.title}
              </Text>
              {featuredPrompt.meta ? (
                <Text style={[styles.promptMetaText, { color: theme.textMuted }]}>
                  {featuredPrompt.meta}
                </Text>
              ) : null}
              <Text style={[styles.featuredPromptAnswer, { color: theme.text }]}>
                {featuredPrompt.answer}
              </Text>
            </View>
          ) : !isPreviewMode && !promptsLoading ? (
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
                  <Text style={[styles.detailText, { color: theme.text }]}>Looking for {(profile as any).looking_for}</Text>
                </View>
              </View>
            )}

            {/* DIASPORA: Location Information */}
            {Boolean((profile as any)?.current_country) && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="map-marker" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>
                    {`Currently in ${(profile as any).current_country || 'Unknown'}${(profile as any).current_country === 'Ghana' ? ' (GH)' : ''}`}
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
                  <Text style={[styles.detailText, { color: theme.text }]}>Exercises {(profile as any).exercise_frequency}</Text>
                </View>
              </View>
            )}

            {/* Smoking and Drinking Row */}
            <View style={styles.detailRow}>
              {Boolean((profile as any)?.smoking) && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="smoking-off" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Smoking: {(profile as any).smoking}</Text>
                </View>
              )}
              {Boolean((profile as any)?.drinking) && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="glass-cocktail" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Drinking: {(profile as any).drinking}</Text>
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

        {/* Quick Stats - Hidden in preview mode */}
        {!isPreviewMode && (
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
        )}

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
            {!isPreviewMode && (
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons name="plus" size={20} color={Colors.light.tint} />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {hasGalleryMedia ? (
            <PhotoGallery
              photos={userPhotos}
              introVideoUrl={heroVideoUrl}
              introVideoThumbnail={heroVideoThumbnail || avatarImageUri}
              onOpenVideo={() => setIntroVideoOpen(true)}
              canEdit={!isPreviewMode}
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
              {!isPreviewMode ? (
                <TouchableOpacity
                  style={[styles.emptyFeatureButton, { backgroundColor: theme.tint }]}
                  onPress={() => setShowEditModal(true)}
                >
                  <Text style={styles.emptyFeatureButtonText}>Add media</Text>
                </TouchableOpacity>
              ) : null}
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
              {!isPreviewMode && (
                <TouchableOpacity 
                  style={[styles.editButton, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
                  onPress={() => setShowEditModal(true)}
                >
                  <MaterialCommunityIcons name="pencil" size={16} color={theme.tint} />
                  <Text style={[styles.editButtonText, { color: theme.tint }]}>Edit</Text>
                </TouchableOpacity>
              )}
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

        {(showPromptEditor || extraPrompts.length > 0 || (!featuredPrompt && !isPreviewMode) || promptsLoading) ? (
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
              {!isPreviewMode ? (
                <TouchableOpacity
                  style={[styles.editButton, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
                  onPress={() => setShowPromptEditor((prev) => !prev)}
                >
                  <MaterialCommunityIcons name="comment-quote-outline" size={16} color={theme.tint} />
                  <Text style={[styles.editButtonText, { color: theme.tint }]}>
                    {showPromptEditor ? 'Hide' : 'Manage'}
                  </Text>
                </TouchableOpacity>
              ) : null}
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
                      {!isPreviewMode ? (
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
                      ) : null}
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
            {!isPreviewMode && (
              <TouchableOpacity 
                style={[styles.editButton, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons name="pencil" size={16} color={theme.tint} />
                <Text style={[styles.editButtonText, { color: theme.tint }]}>Edit</Text>
              </TouchableOpacity>
            )}
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
                {!isPreviewMode ? (
                  <TouchableOpacity
                    style={[styles.emptyFeatureButton, { backgroundColor: theme.tint }]}
                    onPress={() => setShowEditModal(true)}
                  >
                    <Text style={styles.emptyFeatureButtonText}>Add interests</Text>
                  </TouchableOpacity>
                ) : null}
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

        {/* Action Buttons - Only show in preview mode */}
        {isPreviewMode && (
          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.actionButton}>
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.infoButton}>
              <MaterialCommunityIcons name="information" size={24} color={Colors.light.tint} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.likeButton}>
              <MaterialCommunityIcons name="heart" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}



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
          onSave={async () => {
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
    </SafeAreaView>
  );
}

function NotificationToggle({
  label,
  value,
  onValueChange,
  theme,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  theme: typeof Colors.light;
}) {
  return (
    <View style={styles.notificationToggleRow}>
      <Text style={[styles.notificationToggleLabel, { color: theme.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.outline, true: theme.tint }}
        thumbColor={Colors.light.background}
      />
    </View>
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
    gap: 12,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    gap: 6,
  },
  previewButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  previewButtonText: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.light.tint,
  },
  previewButtonTextActive: {
    color: '#fff',
  },
  devButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.light.tint,
    backgroundColor: 'transparent',
  },
  devButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.tint,
    letterSpacing: 0.4,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  
  // Preview Banner
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: 1,
  },
  previewBannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewBannerText: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.light.tint,
  },
  fullPreviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fullPreviewButtonText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.light.tint,
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
    gap: 10,
    marginTop: 14,
  },
  heroInlineVerificationBadge: {
    transform: [{ translateY: 1 }],
    marginHorizontal: 2,
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
    gap: 6,
    marginLeft: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  presenceText: {
    fontSize: 12,
    fontWeight: '700',
  },
  profileName: {
    fontSize: 29,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  locationText: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
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
  
  // Preview Actions
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 24,
    backgroundColor: '#fff',
    gap: 24,
    marginBottom: 8,
  },
  actionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  infoButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  likeButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  
  // Settings Dropdown
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    zIndex: 998,
  },
  backdropTouchable: {
    flex: 1,
  },
  settingsDropdown: {
    position: 'absolute',
    top: 80,
    right: 20,
    backgroundColor: 'transparent',
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 200,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 14,
    zIndex: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dropdownItemText: {
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
    color: '#374151',
    flex: 1,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 4,
    marginHorizontal: 12,
  },
  themeSection: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  themeLabel: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  themePillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  themePillText: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    color: '#111827',
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
  notificationSection: {
    marginBottom: 18,
  },
  notificationSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  notificationToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  notificationToggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  notificationLoading: {
    fontSize: 12,
    marginTop: 8,
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
  identityLinkButtonText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
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
