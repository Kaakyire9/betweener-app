import { Colors } from '@/constants/theme';
import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useVerificationStatus } from '@/hooks/use-verification-status';
import { requestAndSavePreciseLocation } from '@/hooks/useLocationPreference';
import { useAuth } from '@/lib/auth-context';
import {
  findCountryByCode,
  findCountryByLabel,
  getPrioritizedCountries,
  type CountryOption,
} from '@/lib/location/countries';
import { isLegacyGhanaLocalityForeignKeyError } from '@/lib/location/locality-errors';
import {
  getCountryPolicyMessage,
  shouldManageProfileCountry,
} from '@/lib/location/country-lock';
import {
  isKnownGhanaRegionLabel,
  normalizeLocationValue,
} from '@/lib/location/location-display';
import { normalizeGhanaCityTownValue, type GhanaCityTownSuggestion } from '@/lib/location/ghana-locality-shared';
import {
  getRegionSearchExamples,
  getSuggestedLocalities,
  readRecentGhanaLocalities,
  saveRecentGhanaLocality,
} from '@/lib/location/location-intelligence';
import { searchGhanaLocalities } from '@/lib/location/search-ghana-localities';
import { isLikelyNetworkError } from '@/lib/network';
import {
  PREMIUM_ONBOARDING_GHANA_REGIONS,
  PREMIUM_ONBOARDING_INTERESTS,
  PREMIUM_ONBOARDING_INTENTS,
  PREMIUM_ONBOARDING_OCCUPATIONS,
} from '@/lib/onboarding/premium-onboarding.config';
import {
  drainOfflineMutationQueue,
  enqueueProfileInterestsUpdateMutation,
  enqueueProfileMediaSyncMutation,
} from '@/lib/offline/mutation-queue';
import { readMeProfileSnapshot, writeMeProfileSnapshot } from '@/lib/offline/me-store';
import { cacheOfflineVideo, getOfflineVideoUri } from '@/lib/offline/video-store';
import { showOpenSettingsPrompt } from '@/lib/permission-prompts';
import {
  isLocalMediaUri,
  normalizeLocalMediaUri,
  normalizeGalleryPhotoList,
  normalizeProfilePhotoUri,
} from '@/lib/profile/media';
import {
  appendGalleryMedia,
  MAX_PROFILE_GALLERY_ITEMS,
  moveGalleryMedia,
  promoteGalleryMediaToHero,
  removeGalleryMediaAt,
  resolveProfileMediaDraft,
} from '@/lib/profile/media-studio';
import {
  GHANA_ROOT_OPTIONS,
  GLOBAL_ROOT_OPTIONS,
  ROOTS_VISIBILITY_OPTIONS,
} from '@/lib/profile/roots-options';
import { RELIGION_LABELS, formatReligionLabel, isReligionEnumError, normalizeReligionForProfile } from '@/lib/profile/religion';
import { getProfileInitials } from '@/lib/profile-placeholders';
import { buildProfileLocationUpdate } from '@/lib/profile/profile-location-update';
import { moderatePublicProfileText } from '@/lib/profile-guard';
import { usesGhanaOnboardingExperience } from '@/lib/profile/onboarding-experience';
import { type ResponsiveMetrics, useResponsiveMetrics } from '@/lib/responsive';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetch as fetchNetInfo } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Video as VideoCompressor, getRealPath } from 'react-native-compressor';
import {
    ActivityIndicator,
    Alert,
    DeviceEventEmitter,
    FlatList,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProfileMediaFrameSheet from './profile/ProfileMediaFrameSheet';
import ProfileMediaStudioSection from './profile/ProfileMediaStudioSection';
import GhanaOnboardingProfileSections from './profile/GhanaOnboardingProfileSections';
import TrustVerificationCompactCard from './profile/TrustVerificationCompactCard';

const DISTANCE_UNIT_KEY = 'distance_unit';
const DISTANCE_UNIT_EVENT = 'distance_unit_changed';

type DistanceUnit = 'auto' | 'km' | 'mi';
type GhanaLocalityPickerRow =
  | { type: 'section'; id: string; title: string }
  | { type: 'action'; id: string; label: string; body: string }
  | { type: 'empty'; id: string; title: string; body: string }
  | { type: 'locality'; id: string; item: GhanaCityTownSuggestion };

const MAX_PROFILE_VIDEO_DURATION_MS = 30_000;
// Keep this aligned with the Supabase Storage bucket max object size for `profile-videos`.
// We preflight locally to avoid long uploads that will fail server-side.
const MAX_PROFILE_VIDEO_BYTES = 25 * 1024 * 1024; // 25MB
const COMPRESS_TARGET_MAX_SIZE = 720; // 720p-ish (max height portrait / max width landscape)
const COMPRESS_WHEN_OVER_BYTES = 8 * 1024 * 1024; // 8MB (premium "fast upload" threshold)

const DISTANCE_UNIT_OPTIONS: { value: DistanceUnit; label: string; subtitle?: string }[] = [
  { value: 'auto', label: 'Auto', subtitle: 'Recommended' },
  { value: 'km', label: 'Kilometers' },
  { value: 'mi', label: 'Miles' },
];

// Predefined options for profile fields
const HEIGHT_OPTIONS = [
  "4'10\"", "4'11\"", "5'0\"", "5'1\"", "5'2\"", "5'3\"", "5'4\"", "5'5\"", 
  "5'6\"", "5'7\"", "5'8\"", "5'9\"", "5'10\"", "5'11\"", "6'0\"", "6'1\"", 
  "6'2\"", "6'3\"", "6'4\"", "6'5\"", "6'6\"", "Other"
];

const ONBOARDING_OCCUPATION_OPTIONS = [...PREMIUM_ONBOARDING_OCCUPATIONS, 'Other'];

const EDUCATION_OPTIONS = [
  "High School", "Some College", "Bachelor's Degree", "Master's Degree", 
  "PhD", "Trade School", "University of Ghana", "KNUST", "UCC", "UPSA",
  "Ashesi University", "Central University", "Valley View University", "Other"
];

const LEGACY_LOOKING_FOR_OPTIONS = [
  'Long-term relationship', 'Short-term dating', 'Friendship', 'Networking',
  'Marriage', 'Casual dating', "Let's see what happens", 'Life partner', 'Other',
];
const LOOKING_FOR_OPTIONS = Array.from(new Set([
  ...PREMIUM_ONBOARDING_INTENTS.map((intent) => intent.value),
  ...LEGACY_LOOKING_FOR_OPTIONS,
]));
const formatRelationshipIntent = (value: string) =>
  PREMIUM_ONBOARDING_INTENTS.find((intent) => intent.value === value)?.label ?? value;

const GENDER_OPTIONS = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
  { label: 'Other', value: 'OTHER' },
];

// HIGH PRIORITY: Lifestyle options
const EXERCISE_FREQUENCY_OPTIONS = [
  "Daily", "Weekly", "Occasionally", "Never", "Other"
];

const SMOKING_OPTIONS = [
  "Never", "Socially", "Regularly", "Trying to Quit", "Other"
];

const DRINKING_OPTIONS = [
  "Never", "Socially", "Regularly", "Occasionally", "Other"
];

// HIGH PRIORITY: Family options
const HAS_CHILDREN_OPTIONS = [
  "No", "Yes - living with me", "Yes - not living with me", "Other"
];

const WANTS_CHILDREN_OPTIONS = [
  "Definitely", "Probably", "Not Sure", "Probably Not", "Never", "Other"
];

// HIGH PRIORITY: Personality options
const PERSONALITY_TYPE_OPTIONS = [
  "Introvert", "Extrovert", "Ambivert", "Not Sure", "Other"
];

const LOVE_LANGUAGE_OPTIONS = [
  "Words of Affirmation", "Quality Time", "Physical Touch", "Acts of Service", "Gifts", "Other"
];

// HIGH PRIORITY: Living situation options
const LIVING_SITUATION_OPTIONS = [
  "Own Place", "Rent Alone", "Roommates", "With Family", "Student Housing", "Other"
];

const PETS_OPTIONS = [
  "No Pets", "Dog Lover", "Cat Lover", "Other Pets", "Allergic to Pets", "Other"
];

// Ghana-specific regions and tribes
const GHANA_REGIONS_OPTIONS = [...PREMIUM_ONBOARDING_GHANA_REGIONS, 'Other'];

const RELIGION_OPTIONS = RELIGION_LABELS;
const LEGACY_ROOTS_VISIBILITY_FALLBACK = 'HIDDEN';

const isRootsVisibilityConstraintError = (error: unknown) => {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '').toLowerCase();
  return code === '23514' && message.includes('profiles_roots_visibility_check');
};

// HIGH PRIORITY: Ghana-focused languages
const GHANA_LANGUAGES_OPTIONS = [
  "English",
  "Twi",
  "Ga",
  "Ewe",
  "Fante",
  "Hausa",
  "Dagbani",
  "Gonja",
  "Nzema",
  "Kasem",
  "Dagaare",
  "French",
  "Arabic",
  "Other",
];

// Global languages (lighter, broader list)
const GLOBAL_LANGUAGES_OPTIONS = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Dutch",
  "Swedish",
  "Norwegian",
  "Arabic",
  "Hindi",
  "Chinese",
  "Japanese",
  "Korean",
  "Yoruba",
  "Igbo",
  "Swahili",
  "Other",
];

const withAlpha = (hex: string | undefined | null, alpha: number) => {
  if (!hex) {
    return `rgba(0,0,0,${Math.max(0, Math.min(1, alpha))})`;
  }
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const normalizeLanguages = (items?: string[]) =>
  Array.from(
    new Set(
      (items ?? [])
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  );

const normalizeRoots = (items?: string[]) =>
  Array.from(
    new Set(
      (items ?? [])
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  );

const normalizedString = (value: unknown) => String(value ?? '').trim();
const sameString = (left: unknown, right: unknown) => normalizedString(left) === normalizedString(right);
const sameNumber = (left: unknown, right: unknown) => Number(left ?? 0) === Number(right ?? 0);
const sameStringArray = (left: unknown, right: unknown) => {
  const normalize = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((item) => normalizedString(item))
          .filter(Boolean)
          .sort()
      : [];
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
};

const toFlagEmoji = (countryCode?: string | null) => {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...code.split('').map((char) => 127397 + char.charCodeAt(0)));
};

const PROFILE_MEDIA_STAGING_FOLDER = 'betweener-profile-media';
const HERO_CROP_ASPECT_RATIO = 16 / 9;
const AVATAR_CROP_ASPECT_RATIO = 1;

const inferMediaUploadMeta = (
  uri: string,
  fallbackPrefix: string,
  fallbackContentType: string,
) => {
  const cleanUri = uri.split('?')[0] || uri;
  const rawName = cleanUri.split('/').pop() || `${fallbackPrefix}-${Date.now()}`;
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '-');
  const ext = (safeName.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const contentType =
    ext === 'png'
      ? 'image/png'
      : ext === 'webp'
        ? 'image/webp'
        : ext === 'heic' || ext === 'heif'
          ? 'image/heic'
          : ext === 'mov'
            ? 'video/quicktime'
            : ext === 'mp4' || ext === 'm4v'
              ? 'video/mp4'
              : fallbackContentType;
  const fileName = safeName.includes('.')
    ? safeName
    : `${safeName}.${contentType.includes('video') ? 'mp4' : 'jpg'}`;
  return { localUri: uri, fileName, contentType };
};

const getProfileMediaStagingDirectory = () => {
  const root = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
  return root ? `${root}${PROFILE_MEDIA_STAGING_FOLDER}/` : '';
};

const persistProfileMediaUri = async (
  uri: string,
  fallbackPrefix: string,
  fallbackContentType: string,
) => {
  const normalizedUri = normalizeLocalMediaUri(uri);
  if (!isLocalMediaUri(normalizedUri)) return normalizedUri;
  if (normalizedUri.includes(`/${PROFILE_MEDIA_STAGING_FOLDER}/`)) return normalizedUri;

  const directory = getProfileMediaStagingDirectory();
  if (!directory) return normalizedUri;

  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const meta = inferMediaUploadMeta(normalizedUri, fallbackPrefix, fallbackContentType);
    const targetUri = `${directory}${Date.now()}-${meta.fileName}`;
    await FileSystem.copyAsync({ from: normalizedUri, to: targetUri });
    return targetUri;
  } catch {
    return normalizedUri;
  }
};

const prepareReadableProfileMediaUri = async (
  uri: string,
  fallbackPrefix: string,
  fallbackContentType: string,
) => {
  if (isLocalMediaUri(uri)) return uri;

  const directory = getProfileMediaStagingDirectory();
  if (!directory) {
    throw new Error('Profile media staging directory is unavailable');
  }

  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const meta = inferMediaUploadMeta(uri, fallbackPrefix, fallbackContentType);
  const targetUri = `${directory}readable-${Date.now()}-${meta.fileName}`;
  const result = await FileSystem.downloadAsync(uri, targetUri);

  if (!result?.uri) {
    throw new Error('Failed to prepare readable profile media');
  }

  return result.uri;
};

const getImageDimensions = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      reject,
    );
  });

const buildAspectCropRect = (
  width: number,
  height: number,
  aspectRatio: number,
  focusX: number,
  focusY: number,
) => {
  if (width <= 0 || height <= 0) {
    return { originX: 0, originY: 0, width: 1, height: 1 };
  }

  const currentRatio = width / height;
  if (currentRatio > aspectRatio) {
    const cropWidth = Math.max(1, Math.round(height * aspectRatio));
    const availableX = Math.max(0, width - cropWidth);
    const originX = Math.max(0, Math.min(availableX, Math.round(availableX * focusX)));
    return {
      originX,
      originY: 0,
      width: cropWidth,
      height,
    };
  }

  const cropHeight = Math.max(1, Math.round(width / aspectRatio));
  const availableY = Math.max(0, height - cropHeight);
  const originY = Math.max(0, Math.min(availableY, Math.round(availableY * focusY)));
  return {
    originX: 0,
    originY,
    width,
    height: cropHeight,
  };
};

interface ProfileEditModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (updatedProfile: any) => void;
  onOpenVerification?: () => void;
}

type FieldPickerProps = {
  title: string;
  options: string[];
  visible: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  currentValue: string;
  styles: ReturnType<typeof createStyles>;
  tintColor: string;
  formatOption?: (value: string) => string;
};

const FieldPicker = ({
  title,
  options,
  visible,
  onClose,
  onSelect,
  currentValue,
  styles,
  tintColor,
  formatOption = (value) => value,
}: FieldPickerProps) => (
  <Modal
    visible={visible}
    animationType="slide"
    presentationStyle="pageSheet"
    onRequestClose={onClose}
  >
    <SafeAreaView style={styles.pickerContainer}>
      <View style={styles.pickerHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.pickerCancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.pickerTitle}>{title}</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={options}
        keyExtractor={(item) => item}
        style={styles.pickerList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.pickerItem,
              currentValue === item && styles.pickerItemSelected,
            ]}
            onPress={() => {
              onSelect(item);
              onClose();
            }}
          >
            <Text
              style={[
                styles.pickerItemText,
                currentValue === item && styles.pickerItemTextSelected,
              ]}
            >
              {formatOption(item)}
            </Text>
            {currentValue === item ? (
              <MaterialCommunityIcons name="check" size={20} color={tintColor} />
            ) : null}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  </Modal>
);

export default function ProfileEditModal({ visible, onClose, onSave, onOpenVerification }: ProfileEditModalProps) {
  const { user, profile, updateProfile, refreshProfile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const responsive = useResponsiveMetrics();
  const styles = useMemo(() => createStyles(theme, isDark, responsive), [theme, isDark, responsive]);
  const { status: verificationStatus } = useVerificationStatus(profile?.user_id);
  const isGhanaProfile = useMemo(() => {
    const currentCountry = (profile as any)?.current_country;
    const countryCode = (profile as any)?.current_country_code;
    const region = (profile as any)?.region;
    if (countryCode === 'GH') return true;
    if (currentCountry && currentCountry.toLowerCase().includes('ghana')) return true;
    if (region && GHANA_REGIONS_OPTIONS.includes(region)) return true;
    return false;
  }, [profile]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [mediaStudioBusy, setMediaStudioBusy] = useState(false);
  const [mediaFrameRequest, setMediaFrameRequest] = useState<{
    slot: 'avatar' | 'hero';
    index: number;
    sourceUri: string;
  } | null>(null);
  const [videoUploadStage, setVideoUploadStage] = useState<string | null>(null);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [countryVerificationBusy, setCountryVerificationBusy] = useState(false);
  
  // Original dropdown states
  const [showHeightPicker, setShowHeightPicker] = useState(false);
  const [showOccupationPicker, setShowOccupationPicker] = useState(false);
  const [showEducationPicker, setShowEducationPicker] = useState(false);
  const [showLookingForPicker, setShowLookingForPicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showReligionPicker, setShowReligionPicker] = useState(false);
  
  // HIGH PRIORITY picker visibility states
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showSmokingPicker, setShowSmokingPicker] = useState(false);
  const [showDrinkingPicker, setShowDrinkingPicker] = useState(false);
  const [showHasChildrenPicker, setShowHasChildrenPicker] = useState(false);
  const [showWantsChildrenPicker, setShowWantsChildrenPicker] = useState(false);
  const [showPersonalityPicker, setShowPersonalityPicker] = useState(false);
  const [showLoveLanguagePicker, setShowLoveLanguagePicker] = useState(false);
  const [showLivingSituationPicker, setShowLivingSituationPicker] = useState(false);
  const [showPetsPicker, setShowPetsPicker] = useState(false);
  const [showLanguagesPicker, setShowLanguagesPicker] = useState(false);
  const [showGhanaCityTownPicker, setShowGhanaCityTownPicker] = useState(false);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countryPickerTarget, setCountryPickerTarget] = useState<'current' | 'origin'>('current');
  const [countrySearch, setCountrySearch] = useState('');
  const [ghanaCityTownSearch, setGhanaCityTownSearch] = useState('');
  const [ghanaCityTownSuggestions, setGhanaCityTownSuggestions] = useState<GhanaCityTownSuggestion[]>([]);
  const [ghanaCityTownDefaults, setGhanaCityTownDefaults] = useState<GhanaCityTownSuggestion[]>([]);
  const [ghanaCityTownRecent, setGhanaCityTownRecent] = useState<GhanaCityTownSuggestion[]>([]);
  const [ghanaCityTownLoading, setGhanaCityTownLoading] = useState(false);
  const [ghanaCityTownInitializing, setGhanaCityTownInitializing] = useState(false);
  
  // Original custom input states
  const [customHeight, setCustomHeight] = useState('');
  const [customOccupation, setCustomOccupation] = useState('');
  const [customEducation, setCustomEducation] = useState('');
  const [customLookingFor, setCustomLookingFor] = useState('');
  const [customRegion, setCustomRegion] = useState('');
  
  // HIGH PRIORITY custom input states
  const [customExercise, setCustomExercise] = useState('');
  const [customSmoking, setCustomSmoking] = useState('');
  const [customDrinking, setCustomDrinking] = useState('');
  const [customHasChildren, setCustomHasChildren] = useState('');
  const [customWantsChildren, setCustomWantsChildren] = useState('');
  const [customPersonality, setCustomPersonality] = useState('');
  const [customLoveLanguage, setCustomLoveLanguage] = useState('');
  const [customLivingSituation, setCustomLivingSituation] = useState('');
  const [customPets, setCustomPets] = useState('');
  const [customLanguage, setCustomLanguage] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('auto');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'error' | 'success' | null>(null);
  
  // Interests states
  const [availableInterests, setAvailableInterests] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [showInterestsPicker, setShowInterestsPicker] = useState(false);
  const [loadingInterests, setLoadingInterests] = useState(false);
  const initialSelectedInterestsRef = useRef<string[]>([]);

  const closeNestedPickers = useCallback(() => {
    setShowHeightPicker(false);
    setShowOccupationPicker(false);
    setShowEducationPicker(false);
    setShowLookingForPicker(false);
    setShowRegionPicker(false);
    setShowReligionPicker(false);
    setShowExercisePicker(false);
    setShowSmokingPicker(false);
    setShowDrinkingPicker(false);
    setShowHasChildrenPicker(false);
    setShowWantsChildrenPicker(false);
    setShowPersonalityPicker(false);
    setShowLoveLanguagePicker(false);
    setShowLivingSituationPicker(false);
    setShowPetsPicker(false);
    setShowLanguagesPicker(false);
    setShowGhanaCityTownPicker(false);
    setShowInterestsPicker(false);
    setCountryModalVisible(false);
    setCountrySearch('');
    setGhanaCityTownSearch('');
  }, []);

  const closeProfileEditor = useCallback(() => {
    closeNestedPickers();
    onClose();
  }, [closeNestedPickers, onClose]);
  
  // Form state
  const [formData, setFormData] = useState({
      full_name: '',
      bio: '',
      gender: '',
      age: '',
      min_age_interest: '18',
      max_age_interest: '35',
      city: '',
      locality_geoname_id: null as number | null,
      locality_district: '',
      locality_admin1_code: '',
      locality_provider: null as string | null,
      latitude: null as number | null,
      longitude: null as number | null,
      location_precision: 'COUNTRY',
      region: '',
      tribe: '',
      roots: [] as string[],
      roots_note: '',
      roots_visibility: 'VISIBLE',
      religion: '',
    current_country: '',
    current_country_code: '',
    origin_country: '',
    origin_country_code: '',
    occupation: '',
    education: '',
    height: '',
    looking_for: '',
      avatar_url: '',
      hero_image_url: '',
      photos: [] as string[],
      profile_video: '',
      matchmaking_mode: false,
      discoverable_in_vibes: true,
      // HIGH PRIORITY fields
      exercise_frequency: '',
    smoking: '',
    drinking: '',
    has_children: '',
    wants_children: '',
    personality_type: '',
    love_language: '',
    living_situation: '',
    pets: '',
    languages_spoken: [] as string[],
    // DIASPORA fields (read-only status, editable details only)
    years_in_diaspora: 0,
    last_ghana_visit: '',
    future_ghana_plans: '',
  });
  const selectedCurrentCountry = useMemo(
    () => findCountryByCode(formData.current_country_code) ?? findCountryByLabel(formData.current_country),
    [formData.current_country, formData.current_country_code],
  );
  const selectedOriginCountry = useMemo(
    () => findCountryByCode(formData.origin_country_code) ?? findCountryByLabel(formData.origin_country),
    [formData.origin_country, formData.origin_country_code],
  );
  const countryPickerData = useMemo(
    () => getPrioritizedCountries(countrySearch),
    [countrySearch],
  );
  const selectedCurrentCountryFlag = selectedCurrentCountry ? toFlagEmoji(selectedCurrentCountry.code) : '';
  const selectedOriginCountryFlag = selectedOriginCountry ? toFlagEmoji(selectedOriginCountry.code) : '';
  const countryLockPolicy = (profile as any)?.country_lock_policy;
  const isCountryManaged = shouldManageProfileCountry(profile as any);
  const isGhanaOnboardingExperience = usesGhanaOnboardingExperience(profile as any);
  const countryPolicyMessage = getCountryPolicyMessage(countryLockPolicy)
    || (isCountryManaged
      ? 'Your current country is protected. Use precise location to securely verify a move.'
      : '');
  const effectiveCountryCode = selectedCurrentCountry?.code || formData.current_country_code || (profile as any)?.current_country_code || '';
  const effectiveCountryLabel = selectedCurrentCountry?.label || formData.current_country || (profile as any)?.current_country || '';
  const effectiveRegion = formData.region || profile?.region || '';
  const formIsGhanaProfile = useMemo(() => {
    if (String(effectiveCountryCode).trim().toUpperCase() === 'GH') return true;
    if (String(effectiveCountryLabel).trim().toLowerCase().includes('ghana')) return true;
    if (effectiveRegion && GHANA_REGIONS_OPTIONS.includes(effectiveRegion)) return true;
    return false;
  }, [effectiveCountryCode, effectiveCountryLabel, effectiveRegion]);
  const showLegacyCoreFields = false;
  const ghanaCityTownPlaceholder = useMemo(() => {
    const examples = getRegionSearchExamples(formData.region);
    return examples.length > 0
      ? `Search ${examples.join(', ')}...`
      : 'Search city or town';
  }, [formData.region]);
  const ghanaCityTownSuggested = useMemo(
    () =>
      getSuggestedLocalities({
        region: formData.region,
        recent: ghanaCityTownRecent,
        defaults: ghanaCityTownDefaults,
        limit: 6,
      }),
    [formData.region, ghanaCityTownDefaults, ghanaCityTownRecent],
  );
  const ghanaCityTownPreview = useMemo(
    () => ghanaCityTownDefaults.slice(0, 20),
    [ghanaCityTownDefaults],
  );

  useEffect(() => {
    if (!showGhanaCityTownPicker || !formIsGhanaProfile || !formData.region) {
      setGhanaCityTownDefaults([]);
      setGhanaCityTownRecent([]);
      setGhanaCityTownInitializing(false);
      return;
    }

    const startedAt = Date.now();
    let active = true;
    setGhanaCityTownInitializing(true);

    void Promise.all([
      readRecentGhanaLocalities(formData.region),
      searchGhanaLocalities({
        region: formData.region,
        limit: 24,
      }),
    ])
      .then(([nextRecent, nextDefaults]) => {
        if (!active) return;
        setGhanaCityTownRecent(nextRecent);
        setGhanaCityTownDefaults(nextDefaults);
      })
      .finally(() => {
        if (!active) return;
        const remainingMs = Math.max(0, 120 - (Date.now() - startedAt));
        setTimeout(() => {
          if (active) setGhanaCityTownInitializing(false);
        }, remainingMs);
      });

    return () => {
      active = false;
      setGhanaCityTownInitializing(false);
    };
  }, [formData.region, formIsGhanaProfile, showGhanaCityTownPicker]);

  useEffect(() => {
    if (!showGhanaCityTownPicker || !formIsGhanaProfile || !formData.region) {
      setGhanaCityTownSuggestions([]);
      setGhanaCityTownLoading(false);
      return;
    }

    if (ghanaCityTownSearch.trim().length > 0 && ghanaCityTownSearch.trim().length < 2) {
      setGhanaCityTownSuggestions([]);
      setGhanaCityTownLoading(false);
      return;
    }

    let active = true;
    const timeout = setTimeout(async () => {
      setGhanaCityTownLoading(true);
      const nextSuggestions = await searchGhanaLocalities({
        region: formData.region,
        query: ghanaCityTownSearch,
        limit: 24,
      });
      if (!active) return;
      setGhanaCityTownSuggestions(nextSuggestions);
      setGhanaCityTownLoading(false);
    }, 220);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [formData.region, formIsGhanaProfile, ghanaCityTownSearch, showGhanaCityTownPicker]);
  const ghanaCityTownRows = useMemo<GhanaLocalityPickerRow[]>(() => {
    if (!showGhanaCityTownPicker) return [];

    const query = ghanaCityTownSearch.trim();
    const hasQuery = query.length >= 2;
    const rows: GhanaLocalityPickerRow[] = [];
    const seen = new Set<string>();
    const pushLocality = (item: GhanaCityTownSuggestion) => {
      const id =
        item.geonameId != null
          ? `locality:${item.geonameId}`
          : `locality:${item.region}:${item.name}:${item.district || 'none'}`;
      if (seen.has(id)) return;
      seen.add(id);
      rows.push({ type: 'locality', id, item });
    };

    if (!hasQuery) {
      if (ghanaCityTownRecent.length > 0) {
        rows.push({ type: 'section', id: 'section:recent', title: 'Recent' });
        ghanaCityTownRecent.forEach(pushLocality);
      }

      if (ghanaCityTownSuggested.length > 0) {
        rows.push({
          type: 'section',
          id: 'section:suggested',
          title: `Suggested in ${formData.region}`,
        });
        ghanaCityTownSuggested.forEach(pushLocality);
      }

      if (ghanaCityTownPreview.length > 0) {
        rows.push({ type: 'section', id: 'section:preview', title: 'All places' });
        ghanaCityTownPreview.forEach(pushLocality);
      }

      if (rows.length === 0 && !ghanaCityTownInitializing) {
        rows.push({
          type: 'empty',
          id: 'empty:initial',
          title: 'Places are taking a moment to load',
          body: 'You can keep the region only, or try a search in a second.',
        });
      }
    } else if (ghanaCityTownSuggestions.length > 0) {
      rows.push({ type: 'section', id: 'section:results', title: 'Search results' });
      ghanaCityTownSuggestions.forEach(pushLocality);
    } else if (!ghanaCityTownLoading) {
      rows.push({
        type: 'empty',
        id: 'empty:results',
        title: 'No town matched that search',
        body: 'Try a broader spelling, or continue with the region only.',
      });
    }

    rows.push({
      type: 'action',
      id: 'action:region-only',
      label: `Continue with ${formData.region} only`,
      body: 'City stays optional.',
    });

    return rows;
  }, [
    formData.region,
    ghanaCityTownInitializing,
    ghanaCityTownLoading,
    ghanaCityTownPreview,
    ghanaCityTownRecent,
    ghanaCityTownSearch,
    ghanaCityTownSuggested,
    ghanaCityTownSuggestions,
    showGhanaCityTownPicker,
  ]);
  const languagesOptions = formIsGhanaProfile
    ? GHANA_LANGUAGES_OPTIONS
    : GLOBAL_LANGUAGES_OPTIONS;
  const displayLanguages = useMemo(() => {
    const base =
      formData?.languages_spoken && formData.languages_spoken.length > 0
        ? formData.languages_spoken
        : selectedLanguages;
    return normalizeLanguages(base);
  }, [formData?.languages_spoken, selectedLanguages]);
  const avatarInitials = useMemo(
    () => getProfileInitials(formData.full_name || profile?.full_name || user?.email || null),
    [formData.full_name, profile?.full_name, user?.email],
  );
  const mediaDraft = useMemo(
    () =>
      resolveProfileMediaDraft({
        avatarUrl: formData.avatar_url,
        heroImageUrl: formData.hero_image_url,
        photos: formData.photos,
        profileVideoUrl: formData.profile_video,
      }),
    [formData.avatar_url, formData.hero_image_url, formData.photos, formData.profile_video],
  );
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const verificationLevel =
    (profile as any)?.verification_level
    ?? (profile as any)?.verificationLevel
    ?? ((profile as any)?.verified ? 1 : 0);
  const verificationCallout = useMemo(() => {
    if (verificationStatus.loading) {
      return {
        title: 'Checking trust status',
        subtitle: 'Refreshing your verification status and review progress.',
        action: 'Open',
        icon: 'shield-refresh-outline' as const,
      };
    }

    if (verificationStatus.hasPendingRequest) {
      return {
        title: 'In review',
        subtitle: 'Your latest verification is under review.',
        action: 'Status',
        icon: 'progress-clock' as const,
      };
    }

    if (verificationStatus.freshReviewRequired) {
      return {
        title: 'Fresh check requested',
        subtitle: verificationStatus.freshReviewReason
          ? `${verificationStatus.freshReviewReason} Your badge stays in place.`
          : 'A quick trust refresh was requested. Your badge stays in place.',
        action: 'Refresh',
        icon: 'shield-refresh-outline' as const,
      };
    }

    if (verificationLevel > 0) {
      return {
        title: verificationLevel >= 2 ? 'Trust confirmed' : 'Verified profile',
        subtitle: verificationLevel >= 2
          ? 'Your profile is verified.'
          : 'Your profile has a trust signal.',
        action: verificationLevel >= 2 ? 'Details' : 'Add more',
        icon: 'shield-check-outline' as const,
      };
    }

    if (verificationStatus.hasRejection) {
      return {
        title: 'Needs another try',
        subtitle: verificationStatus.rejectionReason
          ? verificationStatus.rejectionReason
          : 'One of your submissions was rejected.',
        action: 'Resubmit',
        icon: 'alert-circle-outline' as const,
      };
    }

    return {
      title: 'Give matches more confidence',
      subtitle: 'Verify privately and add a visible badge to your profile.',
      action: 'Start',
      icon: 'shield-plus-outline' as const,
    };
  }, [verificationLevel, verificationStatus]);

  // Load current profile data when modal opens
  const hydratedFromProfileRef = useRef(false);
  const agePreferenceTouchedRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      hydratedFromProfileRef.current = false;
      agePreferenceTouchedRef.current = false;
      closeNestedPickers();
      return;
    }

    // Only hydrate once per open so background refreshes don't clobber in-progress edits.
    if (visible && profile && !hydratedFromProfileRef.current) {
      hydratedFromProfileRef.current = true;
      agePreferenceTouchedRef.current = false;
      setStatusMessage(null);
      setStatusTone(null);
      const normalizedLanguages = normalizeLanguages(
        (profile as any).languages_spoken || []
      );
      const normalizedRoots = normalizeRoots(
        Array.isArray((profile as any).roots) && (profile as any).roots.length > 0
          ? (profile as any).roots
          : (profile as any).tribe
            ? [(profile as any).tribe]
            : []
      );
      const filteredLanguages = normalizedLanguages.filter(
        (lang) => languagesOptions.includes(lang) || lang === 'Other'
      );
      const normalizedAvatarUrl = normalizeProfilePhotoUri(profile.avatar_url);
      const normalizedPhotos = normalizeGalleryPhotoList((profile as any).photos, normalizedAvatarUrl);
      const normalizedHeroImageUrl = normalizeProfilePhotoUri((profile as any).hero_image_url);
      const normalizedProfileVideoUrl = normalizeLocalMediaUri(
        (profile as any).profile_video || (profile as any).profileVideo || '',
      );
      setFormData({
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        gender: ((profile as any).gender || '').toString().trim().toUpperCase(),
        age: profile.age?.toString() || '',
        min_age_interest: String((profile as any).min_age_interest ?? (isGhanaProfile ? 24 : 18)),
        max_age_interest: String((profile as any).max_age_interest ?? (isGhanaProfile ? 34 : 35)),
        city: profile.city || '',
        locality_geoname_id: (profile as any).locality_geoname_id ?? null,
        locality_district: (profile as any).locality_district || '',
        locality_admin1_code: (profile as any).locality_admin1_code || '',
        locality_provider: (profile as any).locality_provider || null,
        latitude: (profile as any).latitude ?? null,
        longitude: (profile as any).longitude ?? null,
        location_precision: (profile as any).location_precision || 'COUNTRY',
        region: profile.region || '',
        tribe: (profile as any).tribe || '',
        roots: normalizedRoots,
        roots_note: (profile as any).roots_note || '',
        roots_visibility: String((profile as any).roots_visibility || 'VISIBLE').toUpperCase(),
        religion: formatReligionLabel((profile as any).religion || ''),
        current_country: (profile as any).current_country || '',
        current_country_code: (profile as any).current_country_code || '',
        origin_country: (profile as any).origin_country || '',
        origin_country_code: (profile as any).origin_country_code || '',
        occupation: (profile as any).occupation || '',
        education: (profile as any).education || '',
        height: (profile as any).height || '',
          looking_for: (profile as any).looking_for || '',
          avatar_url: normalizedAvatarUrl,
          hero_image_url: normalizedHeroImageUrl,
          photos: normalizedPhotos,
          profile_video: normalizedProfileVideoUrl,
          matchmaking_mode: Boolean((profile as any).matchmaking_mode),
          discoverable_in_vibes: (profile as any).discoverable_in_vibes ?? true,
          // HIGH PRIORITY fields
        exercise_frequency: (profile as any).exercise_frequency || '',
        smoking: (profile as any).smoking || '',
        drinking: (profile as any).drinking || '',
        has_children: (profile as any).has_children || '',
        wants_children: (profile as any).wants_children || '',
        personality_type: (profile as any).personality_type || '',
        love_language: (profile as any).love_language || '',
        living_situation: (profile as any).living_situation || '',
        pets: (profile as any).pets || '',
        languages_spoken: filteredLanguages,
        // DIASPORA fields (preserve existing, don't override status)
        years_in_diaspora: (profile as any).years_in_diaspora || 0,
        last_ghana_visit: (profile as any).last_ghana_visit || '',
        future_ghana_plans: (profile as any).future_ghana_plans || '',
      });
      // Set selected languages for multi-select
      setSelectedLanguages(filteredLanguages);
    }
  }, [closeNestedPickers, visible, profile]);

  useEffect(() => {
    if (!visible) return;
    const profileId = (profile as any)?.id || user?.id;
    if (!profileId) return;
    let cancelled = false;
    void (async () => {
      const snapshot = await readMeProfileSnapshot(profileId);
      if (cancelled || !snapshot) return;
      const cachedAvatarUrl = normalizeProfilePhotoUri(snapshot.avatarUrl);
      const cachedHeroImageUrl = normalizeProfilePhotoUri(snapshot.heroImageUrl);
      const cachedPhotos = normalizeGalleryPhotoList(snapshot.photos, cachedAvatarUrl);
      const cachedProfileVideo = normalizeLocalMediaUri(snapshot.profileVideo);
      setFormData((prev) => ({
        ...prev,
        photos: prev.photos.length > 0 ? normalizeGalleryPhotoList(prev.photos, prev.avatar_url) : cachedPhotos,
        avatar_url: prev.avatar_url || cachedAvatarUrl || '',
        hero_image_url: prev.hero_image_url || cachedHeroImageUrl || '',
        profile_video:
          prev.profile_video ||
          cachedProfileVideo,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, user?.id, visible]);

  useEffect(() => {
    let mounted = true;

    const resolvePreviewVideo = async () => {
      const source = normalizeLocalMediaUri(formData.profile_video);
      if (!source) {
        if (mounted) setPreviewVideoUrl(null);
        return;
      }

      if (isLocalMediaUri(source)) {
        if (mounted) setPreviewVideoUrl(source);
        return;
      }

      if (source.startsWith('http')) {
        if (mounted) setPreviewVideoUrl(source);
        void cacheOfflineVideo(source, source);
        return;
      }

      const cachedLocal = await getOfflineVideoUri(source);

      const { data, error } = await supabase.storage
        .from('profile-videos')
        .createSignedUrl(source, 3600);

      if (!mounted) return;
      if (error || !data?.signedUrl) {
        setPreviewVideoUrl(cachedLocal || null);
        return;
      }

      setPreviewVideoUrl(data.signedUrl);
      void cacheOfflineVideo(source, data.signedUrl);
    };

    void resolvePreviewVideo();

    return () => {
      mounted = false;
    };
  }, [formData.profile_video]);

  // One-time side loads per open (avoid clobbering edits if profile refreshes while modal is open).
  useEffect(() => {
    if (!visible) return;

    fetchAvailableInterests();
    fetchUserInterests();

    const loadDistanceUnit = async () => {
      try {
        const stored = await AsyncStorage.getItem(DISTANCE_UNIT_KEY);
        if (stored === 'auto' || stored === 'km' || stored === 'mi') {
          setDistanceUnit(stored);
        } else {
          setDistanceUnit('auto');
        }
      } catch {}
    };
    void loadDistanceUnit();
  }, [visible]);

  const handleInputChange = (
    field: string,
    value: string | string[] | number | null | boolean,
  ) => {
    if (field === 'min_age_interest' || field === 'max_age_interest') {
      agePreferenceTouchedRef.current = true;
    }
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const selectCountry = (country: CountryOption) => {
    setFormData((prev) =>
      countryPickerTarget === 'origin'
        ? {
            ...prev,
            origin_country: country.label,
            origin_country_code: country.code,
            ...(prev.origin_country !== country.label ? { roots: [], roots_note: '', tribe: '' } : {}),
          }
        : {
            ...prev,
            current_country: country.label,
            current_country_code: country.code,
            ...(prev.current_country !== country.label
              ? { region: '', city: '', locality_geoname_id: null, locality_district: '', locality_admin1_code: '', locality_provider: null, latitude: null, longitude: null, location_precision: 'COUNTRY' }
              : {}),
          },
    );
    setCountrySearch('');
    setCountryModalVisible(false);
  };

  const handleRootToggle = (value: string) => {
    setFormData((prev) => {
      const current = normalizeRoots(prev.roots);
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return {
        ...prev,
        roots: next,
        tribe: next[0] || '',
      };
    });
  };

  const isOfflineNow = async () => {
    try {
      const state = await fetchNetInfo();
      return state.isConnected === false || state.isInternetReachable === false;
    } catch {
      return false;
    }
  };

  const getSnapshotProfileId = () => (profile as any)?.id || user?.id || null;
  const persistMeMediaSnapshot = (patch: {
    avatarUrl?: string | null;
    heroImageUrl?: string | null;
    photos?: string[];
    profileVideo?: string | null;
  }) => {
    const snapshotProfileId = getSnapshotProfileId();
    if (!snapshotProfileId) return;
    void writeMeProfileSnapshot(snapshotProfileId, patch);
  };

  const persistDraftSnapshot = (nextMedia: {
    avatar_url?: string | null;
    hero_image_url?: string | null;
    photos?: string[];
    profile_video?: string | null;
  }) => {
    const nextDraft = resolveProfileMediaDraft({
      avatarUrl: nextMedia.avatar_url,
      heroImageUrl: nextMedia.hero_image_url,
      photos: nextMedia.photos,
      profileVideoUrl: nextMedia.profile_video,
    });
    persistMeMediaSnapshot({
      avatarUrl: nextDraft.avatarUrl || null,
      heroImageUrl: nextDraft.heroImageUrl || null,
      photos: nextDraft.gallery,
      profileVideo: nextDraft.profileVideoUrl || null,
    });
  };

  const stageImageOffline = async (uri: string, isAvatar: boolean) => {
    const stableUri = await persistProfileMediaUri(uri, isAvatar ? 'profile-avatar' : 'profile-photo', 'image/jpeg');
    if (isAvatar) {
      setFormData(prev => {
        const nextPhotos = normalizeGalleryPhotoList(prev.photos, stableUri);
        const nextState = {
          ...prev,
          avatar_url: stableUri,
          photos: nextPhotos,
        };
        persistDraftSnapshot(nextState);
        return nextState;
      });
    } else {
      setFormData(prev => {
        const nextPhotos = normalizeGalleryPhotoList([...prev.photos, stableUri], prev.avatar_url);
        const nextState = {
          ...prev,
          photos: nextPhotos,
        };
        persistDraftSnapshot(nextState);
        return nextState;
      });
    }
    Alert.alert('Photo staged', 'Photo added here. Tap Save to apply it to your profile.');
  };

  const stageGalleryBatch = async (uris: string[]) => {
    const stagedUris = (
      await Promise.all(
        uris.map((uri) => persistProfileMediaUri(uri, 'profile-photo', 'image/jpeg')),
      )
    ).filter(Boolean);
    if (stagedUris.length === 0) return;

    let promotedToAvatar = false;
    setFormData((prev) => {
      const shouldSeedAvatar = !prev.avatar_url && stagedUris.length > 0;
      const nextAvatar = shouldSeedAvatar ? stagedUris[0] : prev.avatar_url;
      const nextPhotos = appendGalleryMedia(
        prev.photos,
        shouldSeedAvatar ? stagedUris.slice(1) : stagedUris,
        nextAvatar,
      );
      promotedToAvatar = shouldSeedAvatar;
      const nextState = {
        ...prev,
        avatar_url: nextAvatar,
        photos: nextPhotos,
      };
      persistDraftSnapshot(nextState);
      return nextState;
    });
    Alert.alert(
      'Media staged',
      promotedToAvatar
        ? `We used the first imported photo as your avatar and staged the rest in your gallery. You can reshuffle everything below before saving.`
        : `${stagedUris.length} photo${stagedUris.length === 1 ? '' : 's'} added to your gallery studio. Tap Save when the story feels right.`,
    );
  };

  const createDerivedSlotMedia = async (
    uri: string,
    slot: 'avatar' | 'hero',
    focus?: { x: number; y: number },
  ) => {
    const readableUri = await prepareReadableProfileMediaUri(
      uri,
      slot === 'avatar' ? 'profile-avatar-source' : 'profile-hero-source',
      'image/jpeg',
    );
    const { width, height } = await getImageDimensions(readableUri);
    const defaultFocus =
      slot === 'avatar'
        ? { x: 0.5, y: 0.5 }
        : { x: 0.5, y: height > width ? 0.24 : 0.38 };
    const cropRect =
      slot === 'avatar'
        ? buildAspectCropRect(width, height, AVATAR_CROP_ASPECT_RATIO, focus?.x ?? defaultFocus.x, focus?.y ?? defaultFocus.y)
        : buildAspectCropRect(width, height, HERO_CROP_ASPECT_RATIO, focus?.x ?? defaultFocus.x, focus?.y ?? defaultFocus.y);
    const result = await manipulateAsync(
      readableUri,
      [{ crop: cropRect }],
      {
        compress: 0.92,
        format: SaveFormat.JPEG,
      },
    );
    return persistProfileMediaUri(
      result.uri,
      slot === 'avatar' ? 'profile-avatar-derived' : 'profile-hero-derived',
      'image/jpeg',
    );
  };

  const stageAvatarFromFocus = async (
    index: number,
    focus?: { x: number; y: number },
  ) => {
    const sourceUri = normalizeProfilePhotoUri(formData.photos[index]);
    if (!sourceUri) return;
    try {
      setMediaStudioBusy(true);
      const derivedAvatarUrl = await createDerivedSlotMedia(sourceUri, 'avatar', focus);
      setFormData((prev) => {
        const nextState = {
          ...prev,
          avatar_url: derivedAvatarUrl,
        };
        persistDraftSnapshot(nextState);
        return nextState;
      });
      Alert.alert('Avatar refined', 'A square avatar crop is staged. Save when it feels right.');
    } catch (error) {
      console.error('Error refining avatar media:', error);
      Alert.alert('Refine failed', 'We could not prepare that avatar crop right now.');
    } finally {
      setMediaStudioBusy(false);
    }
  };

  const stageHeroFromFocus = async (
    index: number,
    focus?: { x: number; y: number },
  ) => {
    const sourceUri = normalizeProfilePhotoUri(formData.photos[index]);
    if (!sourceUri) return;
    try {
      setMediaStudioBusy(true);
      const derivedHeroUrl = await createDerivedSlotMedia(sourceUri, 'hero', focus);
      setFormData((prev) => {
        const nextPhotos = promoteGalleryMediaToHero(prev.photos, index);
        const nextState = {
          ...prev,
          hero_image_url: derivedHeroUrl,
          photos: nextPhotos,
        };
        persistDraftSnapshot(nextState);
        return nextState;
      });
      Alert.alert('Hero refined', 'A wider hero crop is staged and the source scene is moved to the front.');
    } catch (error) {
      console.error('Error refining hero media:', error);
      Alert.alert('Refine failed', 'We could not prepare that hero crop right now.');
    } finally {
      setMediaStudioBusy(false);
    }
  };

  const openMediaFrame = (slot: 'avatar' | 'hero', index: number) => {
    const sourceUri = normalizeProfilePhotoUri(formData.photos[index]);
    if (!sourceUri) return;
    setMediaFrameRequest({ slot, index, sourceUri });
  };

  const handleFrameConfirm = async (focus: { x: number; y: number }) => {
    if (!mediaFrameRequest) return;
    const current = mediaFrameRequest;
    setMediaFrameRequest(null);
    if (current.slot === 'avatar') {
      await stageAvatarFromFocus(current.index, focus);
      return;
    }
    await stageHeroFromFocus(current.index, focus);
  };

  const moveGalleryPhoto = (fromIndex: number, toIndex: number) => {
    setFormData((prev) => {
      const nextPhotos = moveGalleryMedia(prev.photos, fromIndex, toIndex);
      const nextState = {
        ...prev,
        photos: nextPhotos,
      };
      persistDraftSnapshot(nextState);
      return nextState;
    });
  };

  const stageVideoOffline = async (uri: string) => {
    const stableUri = await persistProfileMediaUri(uri, 'profile-video', 'video/mp4');
    setFormData(prev => {
      const nextState = {
        ...prev,
        profile_video: stableUri,
      };
      persistDraftSnapshot(nextState);
      return nextState;
    });
    Alert.alert('Video staged', 'Video added here. Tap Save to apply it to your profile.');
  };

  const resolveProfileId = async (): Promise<string | null> => {
    const pid = (profile as any)?.id as string | undefined;
    if (pid) return pid;
    if (!user?.id) return null;

    // Fallback for edge cases where the auth context hasn't loaded profile yet.
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) return null;
    return (data as any)?.id ?? null;
  };

  const verifyCountryWithPreciseLocation = async () => {
    const pid = await resolveProfileId();
    if (!pid || countryVerificationBusy) return;

    setCountryVerificationBusy(true);
    try {
      const result = await requestAndSavePreciseLocation(pid);
      if (!result.ok) {
        Alert.alert(
          'Country verification unavailable',
          'error' in result ? result.error : 'Please try again.',
        );
        return;
      }

      hydratedFromProfileRef.current = false;
      await refreshProfile();
      const verification = result.verification;
      const title = verification?.status === 'pending'
        ? 'First location check confirmed'
        : verification?.status === 'verified'
          ? 'Country verified'
          : 'Location refreshed';
      Alert.alert(
        title,
        verification?.message
          || 'Your current country and city were refreshed from your device location.',
      );
    } finally {
      setCountryVerificationBusy(false);
    }
  };

  const persistDiscoverableInVibes = async (next: boolean) => {
    setVisibilitySaving(true);
    try {
      const pid = await resolveProfileId();
      if (!pid) throw new Error('Profile not loaded');
      console.log('[ProfileEditModal] persistDiscoverableInVibes:start', { pid, next });
      const { data, error } = await supabase
        .from('profiles')
        .update({ discoverable_in_vibes: next })
        .eq('id', pid)
        .select('id, discoverable_in_vibes, profile_completed, matchmaking_mode')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No profile row updated (RLS or id mismatch)');
      console.log('[ProfileEditModal] persistDiscoverableInVibes:ok', data);

      // Ensure the UI reflects server-side triggers (profile_completed guard, matchmaking_mode, etc).
      await refreshProfile();
    } catch (e) {
      console.error('Failed to persist discoverable_in_vibes', e);
      // Revert optimistic UI if the server refused the change.
      setFormData((prev) => ({ ...prev, discoverable_in_vibes: !next }));
    } finally {
      setVisibilitySaving(false);
    }
  };

  const persistMatchmakingMode = async (next: boolean) => {
    setVisibilitySaving(true);
    try {
      const pid = await resolveProfileId();
      if (!pid) throw new Error('Profile not loaded');

      // Preserve current UX: enabling matchmaking hides you; disabling shows you.
      const nextDiscoverable = next ? false : true;

      console.log('[ProfileEditModal] persistMatchmakingMode:start', {
        pid,
        next,
        nextDiscoverable,
      });

      const { data, error } = await supabase
        .from('profiles')
        .update({
          matchmaking_mode: next,
          discoverable_in_vibes: nextDiscoverable,
        })
        .eq('id', pid)
        .select('id, matchmaking_mode, discoverable_in_vibes, profile_completed')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('No profile row updated (RLS or id mismatch)');

      console.log('[ProfileEditModal] persistMatchmakingMode:ok', data);

      setFormData((prev) => ({
        ...prev,
        matchmaking_mode: Boolean((data as any).matchmaking_mode),
        discoverable_in_vibes: Boolean((data as any).discoverable_in_vibes),
      }));

      await refreshProfile();
    } catch (e) {
      console.error('Failed to persist matchmaking_mode', e);
      // Revert optimistic UI if the server refused the change.
      setFormData((prev) => ({
        ...prev,
        matchmaking_mode: !next,
        discoverable_in_vibes: next ? true : false,
      }));
    } finally {
      setVisibilitySaving(false);
    }
  };

  // Load user's current interests from profile_interests table
  const fetchUserInterests = async () => {
    const pid = await resolveProfileId();
    if (!pid) return;
    
    try {
      const { data, error } = await supabase
        .from('profile_interests')
        .select(`
          interests (
            name
          )
        `)
        .eq('profile_id', pid);
      
      if (error) throw error;
      
      const userInterests = data?.map(item => (item as any).interests.name) || [];
      setSelectedInterests(userInterests);
      initialSelectedInterestsRef.current = userInterests;
    } catch (error) {
      console.error('Error fetching user interests:', error);
    }
  };

  // Save user interests to profile_interests table
  const saveUserInterests = async (interests: string[]) => {
    const pid = await resolveProfileId();
    if (!pid) return { queued: false };

    const normalizedNext = normalizeLanguages(interests).sort();
    const normalizedCurrent = normalizeLanguages(initialSelectedInterestsRef.current).sort();
    if (JSON.stringify(normalizedNext) === JSON.stringify(normalizedCurrent)) {
      return { queued: false };
    }
    
    try {
      let profileInterests: { profile_id: string; interest_id: string }[] = [];
      if (interests.length > 0) {
        const { data: interestData, error: interestError } = await supabase
          .from('interests')
          .select('id, name')
          .in('name', interests);
        if (interestError) throw interestError;

        if ((interestData?.length ?? 0) !== interests.length) {
          throw new Error('The interest catalog is still syncing. Please try again shortly.');
        }
        profileInterests = interestData?.map(interest => ({
          profile_id: pid,
          interest_id: interest.id,
        })) || [];
      }

      const { error: deleteError } = await supabase
        .from('profile_interests')
        .delete()
        .eq('profile_id', pid);
      if (deleteError) throw deleteError;

      if (profileInterests.length > 0) {
        const { error: insertError } = await supabase
          .from('profile_interests')
          .insert(profileInterests);
        if (insertError) throw insertError;
      }
      return { queued: false };
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('Interests update queued offline', error);
        }
        await enqueueProfileInterestsUpdateMutation({
          profileId: pid,
          interests,
        });
        return { queued: true };
      }
      console.error('Error saving user interests:', error);
      throw error;
    }
  };

  // Fetch available interests from database
  const fetchAvailableInterests = async () => {
    try {
      setLoadingInterests(true);
      const { data, error } = await supabase
        .from('interests')
        .select('name')
        .order('name');
      
      if (error) throw error;
      
      const interestNames = data?.map(item => item.name) || [];
      setAvailableInterests(Array.from(new Set([...PREMIUM_ONBOARDING_INTERESTS, ...interestNames])));
    } catch (error) {
      console.error('Error fetching interests:', error);
      // Fallback to default interests
      setAvailableInterests([...PREMIUM_ONBOARDING_INTERESTS]);
    } finally {
      setLoadingInterests(false);
    }
  };

  const pickImage = async (isAvatar: boolean = false) => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showOpenSettingsPrompt(
          'Photos access',
          'Turn on photo access in Settings so Betweener can upload your profile photos.',
        );
        return;
      }

      // Show action sheet for camera or gallery
      Alert.alert(
        'Select Photo',
        isAvatar
          ? 'Choose how you want to set your profile photo.'
          : 'Choose how you want to build your gallery. Library import can bring in multiple photos at once.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Camera', onPress: () => openCamera(isAvatar) },
          { text: isAvatar ? 'Gallery' : 'Gallery (multi-select)', onPress: () => openGallery(isAvatar) },
        ]
      );
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to request permissions');
    }
  };

  const openCamera = async (isAvatar: boolean) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showOpenSettingsPrompt(
          'Camera access',
          'Turn on camera access in Settings so Betweener can take your profile photos.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: isAvatar ? [1, 1] : [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await handleImageUpload(result.assets[0].uri, isAvatar);
      }
    } catch (error) {
      console.error('Error opening camera:', error);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  const openGallery = async (isAvatar: boolean) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: isAvatar,
        allowsMultipleSelection: !isAvatar,
        selectionLimit: isAvatar
          ? 1
          : Math.max(1, MAX_PROFILE_GALLERY_ITEMS - formData.photos.length),
        aspect: isAvatar ? [1, 1] : [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        if (isAvatar) {
          await handleImageUpload(result.assets[0].uri, true);
        } else {
          await stageGalleryBatch(result.assets.map((asset) => asset.uri).filter(Boolean));
        }
      }
    } catch (error) {
      console.error('Error opening gallery:', error);
      Alert.alert('Error', 'Failed to open gallery');
    }
  };

  const handleImageUpload = async (uri: string, isAvatar: boolean) => {
    try {
      setUploading(true);
      await stageImageOffline(uri, isAvatar);
    } catch (error) {
      console.error('Error uploading image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';
      Alert.alert('Error', `Upload failed: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };

  const openVideoLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showOpenSettingsPrompt(
        'Videos access',
        'Turn on photo library access in Settings so Betweener can upload your profile videos.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'videos',
      videoMaxDuration: 30,
      // Video editing/trim support is inconsistent across picker apps, especially on Android.
      // We optimize the selected file ourselves before upload instead of relying on the picker UI.
      allowsEditing: Platform.OS === 'ios',
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });

    if (!result.canceled && result.assets[0]) {
      await handleVideoUpload(result.assets[0]);
    }
  };

  const openVideoCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showOpenSettingsPrompt(
        'Camera access',
        'Turn on camera access in Settings so Betweener can record your profile video.',
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'videos',
      videoMaxDuration: 30,
      allowsEditing: Platform.OS === 'ios',
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });

    if (!result.canceled && result.assets[0]) {
      await handleVideoUpload(result.assets[0]);
    }
  };

  const pickProfileVideo = async () => {
    try {
      Alert.alert(
        'Add intro video',
        'Record a fresh 30-second clip, or choose one from your library. Betweener will optimize it before upload.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Record optimized clip', onPress: () => void openVideoCamera() },
          { text: 'Choose from library', onPress: () => void openVideoLibrary() },
        ]
      );
    } catch (error) {
      console.error('Error picking video:', error);
      Alert.alert('Error', 'Failed to pick video');
    }
  };

  const handleVideoUpload = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      setVideoUploading(true);
      setVideoUploadProgress(null);
      setVideoUploadStage('Preparing video...');

      if (!user?.id) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      if (await isOfflineNow()) {
        await stageVideoOffline(asset.uri);
        return;
      }

      let uri = asset.uri;

      // Enforce 30s max (library pickers may ignore `videoMaxDuration`).
      if (typeof asset.duration === 'number' && asset.duration > MAX_PROFILE_VIDEO_DURATION_MS) {
        const seconds = Math.round(asset.duration / 1000);
        Alert.alert(
          'Video too long',
          `Your video is ${seconds}s. Please trim it to 30 seconds or less and try again.`,
          [
            { text: 'OK' },
            { text: 'Record optimized clip', onPress: () => void openVideoCamera() },
          ]
        );
        return;
      }

      // Normalize Android content:// URIs into a real path when possible.
      // (Some native compressors require file:// paths.)
      try {
        if (Platform.OS === 'android' && uri.startsWith('content://')) {
          const resolved = await getRealPath(uri, 'video');
          if (typeof resolved === 'string' && resolved.length > 0) uri = resolved;
        }
      } catch {}

      // Supabase Storage buckets can enforce a max object size; preflight locally to avoid long uploads.
      // Even if trimming works, some devices still produce huge files (e.g. 4K HDR).
      let originalSizeBytes: number | null = null;
      try {
        const sizeFromPicker = typeof asset.fileSize === 'number' ? asset.fileSize : null;
        const info = sizeFromPicker == null ? await FileSystem.getInfoAsync(uri) : null;
        const size =
          sizeFromPicker != null
            ? sizeFromPicker
            : info && (info as any).exists && typeof (info as any).size === 'number'
              ? Number((info as any).size)
              : null;
        originalSizeBytes = size;
      } catch {
        // If we can't read size (platform URI quirks), proceed and let the upload error surface.
      }

      // Premium: compress on-device when needed and show progress.
      // Note: react-native-compressor requires a dev-client / EAS build (not Expo Go).
      let uploadUri = uri;
      const shouldTryCompression =
        originalSizeBytes == null ||
        originalSizeBytes > COMPRESS_WHEN_OVER_BYTES ||
        originalSizeBytes > MAX_PROFILE_VIDEO_BYTES;

      if (shouldTryCompression) {
        setVideoUploadStage('Optimizing video...');
        setVideoUploadProgress(0);
        try {
          const compressed = await VideoCompressor.compress(
            uri,
            {
              compressionMethod: 'auto',
              maxSize: COMPRESS_TARGET_MAX_SIZE,
              // If originalSizeBytes is null, this still allows compression.
              // Unit is MB per library docs.
              minimumFileSizeForCompress: 0,
            },
            (progress) => {
              if (typeof progress === 'number') {
                setVideoUploadProgress(Math.max(0, Math.min(1, progress)));
              }
            }
          );

          if (typeof compressed === 'string' && compressed.length > 0) {
            uploadUri = compressed;
          }
        } catch (compressError) {
          console.warn('Video compression failed, falling back to original.', compressError);
          uploadUri = uri;
        }
      }

      // Final size gate (after optional compression).
      try {
        const info = await FileSystem.getInfoAsync(uploadUri);
        const size =
          info && (info as any).exists && typeof (info as any).size === 'number'
            ? Number((info as any).size)
            : null;
        if (size != null && size > MAX_PROFILE_VIDEO_BYTES) {
          const mb = (size / (1024 * 1024)).toFixed(1);
          Alert.alert(
            'Video too large',
            `We optimized the clip, but it is still ${mb}MB. Record a fresh 30-second clip in the app or choose a smaller library video.`,
            [
              { text: 'Choose another' },
              { text: 'Record optimized clip', onPress: () => void openVideoCamera() },
            ]
          );
          return;
        }
      } catch {}

      setVideoUploadStage('Staging video...');
      setVideoUploadProgress(1);
      await stageVideoOffline(uploadUri);
      Alert.alert('Video ready', 'Your intro video is staged. Tap Save to apply it everywhere.');
    } catch (error) {
      console.error('Error uploading video:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload video';
      Alert.alert('Error', `Upload failed: ${errorMessage}`);
    } finally {
      setVideoUploading(false);
      setVideoUploadStage(null);
      setVideoUploadProgress(null);
    }
  };

  const removeProfileVideo = () => {
    Alert.alert(
      'Remove Video',
      'Are you sure you want to remove your profile video?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setFormData(prev => {
              const nextState = {
                ...prev,
                profile_video: '',
              };
              persistDraftSnapshot(nextState);
              return nextState;
            });
          },
        },
      ],
    );
  };

  const removePhoto = (index: number) => {
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setFormData(prev => {
              const nextPhotos = normalizeGalleryPhotoList(
                removeGalleryMediaAt(prev.photos, index),
                prev.avatar_url,
              );
              const nextState = {
                ...prev,
                hero_image_url:
                  normalizeProfilePhotoUri(prev.hero_image_url) === normalizeProfilePhotoUri(prev.photos[index])
                    ? normalizeProfilePhotoUri(nextPhotos[0]) || normalizeProfilePhotoUri(prev.avatar_url) || ''
                    : prev.hero_image_url,
                photos: nextPhotos
              };
              persistDraftSnapshot(nextState);
              return nextState;
            });
          }
        }
      ]
    );
  };

  const handleSave = async () => {
    try {
      setLoading(true);

      // Validate required fields
      if (!formData.full_name.trim()) {
        Alert.alert('Error', 'Please enter your name');
        return;
      }

      if (!formData.bio.trim()) {
        Alert.alert('Error', 'Please add a bio');
        return;
      }

      // Fast feedback only. The same content is authoritatively checked in the
      // database before it can be published.
      const publicTextCheck = moderatePublicProfileText([
        formData.full_name,
        formData.bio,
        formData.occupation,
        formData.education,
        formData.looking_for,
        formData.roots_note,
        formData.future_ghana_plans,
      ].filter(Boolean).join(' '));
      if (!publicTextCheck.allowed) {
        Alert.alert(
          'Keep your profile personal',
          "For your safety, contact details, external links and promotional content can't appear on public profiles. You can exchange contact information privately once you've connected.",
        );
        return;
      }

      const interestsChanged = JSON.stringify(normalizeLanguages(selectedInterests).sort()) !==
        JSON.stringify(normalizeLanguages(initialSelectedInterestsRef.current).sort());
      if (interestsChanged && (selectedInterests.length < 3 || selectedInterests.length > 5)) {
        Alert.alert('Choose 3–5 interests', 'Keep the same focused interest mix used during onboarding.');
        return;
      }

      const minAgeInterest = Number.parseInt(String(formData.min_age_interest || '').trim(), 10);
      const maxAgeInterest = Number.parseInt(String(formData.max_age_interest || '').trim(), 10);
      if (
        Number.isNaN(minAgeInterest) ||
        Number.isNaN(maxAgeInterest) ||
        minAgeInterest < 18 ||
        maxAgeInterest < 18 ||
        minAgeInterest > 99 ||
        maxAgeInterest > 99
      ) {
        Alert.alert('Error', 'Preferred age range must stay between 18 and 99.');
        return;
      }
      if (minAgeInterest > maxAgeInterest) {
        Alert.alert('Error', 'Preferred max age must be greater than or equal to preferred min age.');
        return;
      }

      // Prepare update data (preserve required fields to avoid NOT NULL constraint violations)
      const normalizedRoots = normalizeRoots(formData.roots);
      const rootsNote = formData.roots_note ? formData.roots_note.trim() : '';
      const sanitizedPhotos = normalizeGalleryPhotoList(formData.photos, formData.avatar_url);
      const resolvedHeroImageUrl =
        resolveProfileMediaDraft({
          avatarUrl: formData.avatar_url,
          heroImageUrl: formData.hero_image_url,
          photos: sanitizedPhotos,
          profileVideoUrl: formData.profile_video,
        }).heroImageUrl || null;
      const hasLocalAvatar = isLocalMediaUri(formData.avatar_url);
      const hasLocalHeroImage = isLocalMediaUri(resolvedHeroImageUrl);
      const localPhotos = sanitizedPhotos.filter((photo) => isLocalMediaUri(photo));
      const hasLocalVideo = isLocalMediaUri(formData.profile_video);
      const remotePhotos = sanitizedPhotos.filter((photo) => !isLocalMediaUri(photo));
      const mediaSyncPayload =
        user?.id && (hasLocalAvatar || hasLocalHeroImage || localPhotos.length > 0 || hasLocalVideo)
          ? {
              userId: user.id,
              avatar: hasLocalAvatar
                ? inferMediaUploadMeta(formData.avatar_url, 'profile-avatar', 'image/jpeg')
                : null,
              hero: hasLocalHeroImage
                ? inferMediaUploadMeta(resolvedHeroImageUrl || '', 'profile-hero', 'image/jpeg')
                : null,
              heroImageUrl: resolvedHeroImageUrl,
              photos: localPhotos.length > 0 ? sanitizedPhotos : null,
              photoItems: localPhotos.map((photo, index) =>
                inferMediaUploadMeta(photo, `profile-photo-${index + 1}`, 'image/jpeg'),
              ),
              video: hasLocalVideo
                ? {
                    ...inferMediaUploadMeta(formData.profile_video, 'profile-video', 'video/mp4'),
                    previousPath: (profile as any)?.profile_video ?? null,
                  }
                : null,
              updatedAt: new Date().toISOString(),
            }
          : null;

      const updateData: any = {
        full_name: formData.full_name.trim(),
        bio: formData.bio.trim(),
        avatar_url: hasLocalAvatar ? ((profile as any)?.avatar_url ?? null) : formData.avatar_url,
        hero_image_url: hasLocalHeroImage
          ? ((profile as any)?.hero_image_url ?? null)
          : resolvedHeroImageUrl,
        photos: remotePhotos,
        profile_video: hasLocalVideo
          ? ((profile as any)?.profile_video ?? null)
          : formData.profile_video && formData.profile_video.trim()
            ? formData.profile_video.trim()
            : null,
        // Preserve existing required fields to avoid null constraint violations
        gender: String(formData.gender || profile?.gender || 'OTHER').trim().toUpperCase(),
        age: profile?.age || 18,
        region: profile?.region || '',
        tribe: normalizedRoots[0] ?? (profile as any)?.tribe ?? null,
        roots: normalizedRoots.length > 0 ? normalizedRoots : ((profile as any)?.tribe ? [(profile as any).tribe] : null),
        roots_note: rootsNote || null,
        roots_visibility: String(formData.roots_visibility || 'VISIBLE').toUpperCase(),
        religion: normalizeReligionForProfile(formData.religion || (profile as any)?.religion || 'OTHER'),
        min_age_interest: minAgeInterest,
        max_age_interest: maxAgeInterest,
      };

      if (agePreferenceTouchedRef.current) {
        updateData.age_preference_confirmed_at = new Date().toISOString();
      }

      // Only include optional fields if they have values
      if (formData.age && formData.age.trim()) {
        updateData.age = parseInt(formData.age);
      }
      const existingCountry = normalizeLocationValue((profile as any)?.current_country);
      const existingCountryCode = normalizeLocationValue((profile as any)?.current_country_code).toUpperCase();
      const selectedCurrentCountryOption =
        findCountryByCode(formData.current_country_code) ?? findCountryByLabel(formData.current_country);
      const managedCountryCode =
        normalizedString((profile as any)?.current_country_code).toUpperCase()
        || normalizedString(formData.current_country_code).toUpperCase();
      const managedCountryOption = findCountryByCode(managedCountryCode);
      const regionValue = formData.region ? formData.region.trim() : '';
      const cityValue = formData.city ? formData.city.trim() : '';
      const localityDistrictValue =
        typeof formData.locality_district === 'string' ? formData.locality_district.trim() : '';
      const localityGeonameIdValue =
        typeof formData.locality_geoname_id === 'number' && Number.isFinite(formData.locality_geoname_id)
          ? formData.locality_geoname_id
          : null;
      const resolvedCurrentCountry =
        isCountryManaged
          ? normalizedString((profile as any)?.current_country)
            || managedCountryOption?.label
            || normalizedString(formData.current_country)
            || (isGhanaOnboardingExperience ? 'Ghana' : '')
          :
        selectedCurrentCountryOption?.label ||
        normalizedString(formData.current_country) ||
        existingCountry ||
        (isGhanaProfile || isKnownGhanaRegionLabel(formData.region) ? 'Ghana' : '');
      const resolvedCurrentCountryCode =
        isCountryManaged
          ? managedCountryCode || (isGhanaOnboardingExperience ? 'GH' : '')
          :
        selectedCurrentCountryOption?.code ||
        normalizedString(formData.current_country_code).toUpperCase() ||
        existingCountryCode ||
        (resolvedCurrentCountry.toLowerCase() === 'ghana' ? 'GH' : '');
      if (regionValue && !resolvedCurrentCountry) {
        Alert.alert(
          'Current country required',
          'Select your current country before saving your city or region.',
        );
        setCountryPickerTarget('current');
        setCountryModalVisible(true);
        return;
      }
      if (isGhanaProfile && cityValue && !regionValue) {
        Alert.alert(
          'Region required',
          'Select your region before saving your city or town.',
        );
        setShowRegionPicker(true);
        return;
      }
      updateData.current_country = resolvedCurrentCountry || null;
      updateData.current_country_code = resolvedCurrentCountryCode || null;
      if (cityValue || regionValue || resolvedCurrentCountry) {
        Object.assign(updateData, buildProfileLocationUpdate({
          city: cityValue,
          region: regionValue,
          country: resolvedCurrentCountry,
          localityGeonameId: localityGeonameIdValue,
          localityDistrict: localityDistrictValue,
          localityAdmin1Code: formData.locality_admin1_code,
          localityProvider: formData.locality_provider,
          latitude: formData.latitude,
          longitude: formData.longitude,
        }));
        const previousRegion = profile?.region ? profile.region.trim() : '';
        const previousCity = profile?.city ? profile.city.trim() : '';
        const previousCountryCode = normalizeLocationValue((profile as any)?.current_country_code).toUpperCase();
        if (
          regionValue !== previousRegion ||
          cityValue !== previousCity ||
          resolvedCurrentCountryCode !== previousCountryCode
        ) {
          updateData.location_updated_at = new Date().toISOString();
        }
      }
      const selectedOriginCountryOption =
        findCountryByCode(formData.origin_country_code) ?? findCountryByLabel(formData.origin_country);
      const explicitOriginCountry =
        isGhanaOnboardingExperience
          ? 'Ghana'
          :
        selectedOriginCountryOption?.label || normalizedString(formData.origin_country);
      const explicitOriginCountryCode =
        isGhanaOnboardingExperience
          ? 'GH'
          :
        selectedOriginCountryOption?.code || normalizedString(formData.origin_country_code).toUpperCase();
      if (explicitOriginCountry) {
        updateData.origin_country = explicitOriginCountry;
        updateData.origin_country_code = explicitOriginCountryCode || null;
        updateData.origin_country_source = 'explicit';
      } else if (resolvedCurrentCountryCode === 'GH' || resolvedCurrentCountry.toLowerCase() === 'ghana') {
        updateData.origin_country = 'Ghana';
        updateData.origin_country_code = 'GH';
        updateData.origin_country_source = 'residence_backfill';
      } else {
        updateData.origin_country = null;
        updateData.origin_country_code = null;
        updateData.origin_country_source = 'unknown';
      }
      if (formData.occupation && formData.occupation.trim()) {
        updateData.occupation = formData.occupation.trim();
      }
      if (formData.education && formData.education.trim()) {
        updateData.education = formData.education.trim();
      }
      if (formData.height && formData.height.trim()) {
        updateData.height = formData.height.trim();
      }
      if (formData.looking_for && formData.looking_for.trim()) {
        updateData.looking_for = formData.looking_for.trim();
      }
      
      // HIGH PRIORITY fields
      if (formData.exercise_frequency && formData.exercise_frequency.trim()) {
        updateData.exercise_frequency = formData.exercise_frequency.trim();
      }
      if (formData.smoking && formData.smoking.trim()) {
        updateData.smoking = formData.smoking.trim();
      }
      if (formData.drinking && formData.drinking.trim()) {
        updateData.drinking = formData.drinking.trim();
      }
      if (formData.has_children && formData.has_children.trim()) {
        updateData.has_children = formData.has_children.trim();
      }
      if (formData.wants_children && formData.wants_children.trim()) {
        updateData.wants_children = formData.wants_children.trim();
      }
      if (formData.personality_type && formData.personality_type.trim()) {
        updateData.personality_type = formData.personality_type.trim();
      }
      if (formData.love_language && formData.love_language.trim()) {
        updateData.love_language = formData.love_language.trim();
      }
      if (formData.living_situation && formData.living_situation.trim()) {
        updateData.living_situation = formData.living_situation.trim();
      }
      if (formData.pets && formData.pets.trim()) {
        updateData.pets = formData.pets.trim();
      }
      if (formData.languages_spoken && formData.languages_spoken.length > 0) {
        updateData.languages_spoken = formData.languages_spoken;
      }
      
      // DIASPORA fields (enabled after migration)
      if (formData.years_in_diaspora > 0) {
        updateData.years_in_diaspora = formData.years_in_diaspora;
      }
      if (formData.last_ghana_visit && formData.last_ghana_visit.trim()) {
        updateData.last_ghana_visit = formData.last_ghana_visit.trim();
      }
      if (formData.future_ghana_plans && formData.future_ghana_plans.trim()) {
        updateData.future_ghana_plans = formData.future_ghana_plans.trim();
      }

      const hasProfileFieldChanges =
        !sameString(updateData.full_name, profile?.full_name) ||
        !sameString(updateData.bio, profile?.bio) ||
        !sameString(updateData.gender, (profile as any)?.gender) ||
        !sameString(updateData.hero_image_url, (profile as any)?.hero_image_url) ||
        !sameNumber(updateData.age, profile?.age) ||
        !sameString(updateData.city, profile?.city) ||
        !sameString(updateData.region, profile?.region) ||
        !sameString(updateData.tribe, (profile as any)?.tribe) ||
        !sameStringArray(updateData.roots, (profile as any)?.roots) ||
        !sameString(updateData.roots_note, (profile as any)?.roots_note) ||
        !sameString(updateData.roots_visibility, (profile as any)?.roots_visibility || 'VISIBLE') ||
        !sameString(updateData.religion, (profile as any)?.religion) ||
        !sameString(updateData.current_country, (profile as any)?.current_country) ||
        !sameString(updateData.current_country_code, (profile as any)?.current_country_code) ||
        !sameString(updateData.origin_country, (profile as any)?.origin_country) ||
        !sameString(updateData.origin_country_code, (profile as any)?.origin_country_code) ||
        !sameString(updateData.origin_country_source, (profile as any)?.origin_country_source || 'unknown') ||
        !sameString(updateData.occupation, (profile as any)?.occupation) ||
        !sameString(updateData.education, (profile as any)?.education) ||
        !sameString(updateData.height, (profile as any)?.height) ||
        !sameString(updateData.looking_for, (profile as any)?.looking_for) ||
        !sameString(updateData.exercise_frequency, (profile as any)?.exercise_frequency) ||
        !sameString(updateData.smoking, (profile as any)?.smoking) ||
        !sameString(updateData.drinking, (profile as any)?.drinking) ||
        !sameString(updateData.has_children, (profile as any)?.has_children) ||
        !sameString(updateData.wants_children, (profile as any)?.wants_children) ||
        !sameString(updateData.personality_type, (profile as any)?.personality_type) ||
        !sameString(updateData.love_language, (profile as any)?.love_language) ||
        !sameString(updateData.living_situation, (profile as any)?.living_situation) ||
        !sameString(updateData.pets, (profile as any)?.pets) ||
        !sameStringArray(updateData.languages_spoken, (profile as any)?.languages_spoken) ||
        !sameNumber(updateData.years_in_diaspora, (profile as any)?.years_in_diaspora) ||
        !sameString(updateData.last_ghana_visit, (profile as any)?.last_ghana_visit) ||
        !sameString(updateData.future_ghana_plans, (profile as any)?.future_ghana_plans);
      
      // Update profile using auth context (this will refresh the UI automatically)
      let saveResult: { error: Error | null; queued?: boolean } = { error: null, queued: false };
      let error: Error | null = null;
      if (hasProfileFieldChanges || !mediaSyncPayload) {
        saveResult = await updateProfile(updateData);
        error = saveResult.error;
      }

      if (
        error &&
        updateData.age_preference_confirmed_at &&
        String((error as any)?.code ?? '').toUpperCase() === 'PGRST204' &&
        String((error as any)?.message ?? '').toLowerCase().includes('age_preference_confirmed_at')
      ) {
        console.warn('[profile-edit] age_preference_confirmation_column_not_deployed');
        delete updateData.age_preference_confirmed_at;
        saveResult = await updateProfile(updateData);
        ({ error } = saveResult);
      }

      if (
        error &&
        resolvedCurrentCountryCode !== 'GH' &&
        updateData.locality_geoname_id != null &&
        isLegacyGhanaLocalityForeignKeyError(error)
      ) {
        // Compatibility for a staggered deployment where the client supports
        // worldwide GeoNames IDs but the legacy Ghana-only FK still exists.
        console.warn('[profile-edit] legacy_ghana_locality_fk_fallback');
        Object.assign(updateData, {
          locality_geoname_id: null,
          locality_admin1_code: null,
          locality_provider: null,
        });
        saveResult = await updateProfile(updateData);
        ({ error } = saveResult);
      }

      if (
        error &&
        updateData.roots_visibility === 'MATCHES_ONLY' &&
        isRootsVisibilityConstraintError(error)
      ) {
        console.warn('[profile-edit] roots_visibility_matches_only_not_supported');
        const fallbackUpdateData = {
          ...updateData,
          roots_visibility: LEGACY_ROOTS_VISIBILITY_FALLBACK,
        };
        saveResult = await updateProfile(fallbackUpdateData);
        ({ error } = saveResult);
      }

      if (error && updateData.religion !== 'OTHER' && isReligionEnumError(error)) {
        console.warn('[profile-edit] religion_enum_value_not_supported');
        saveResult = await updateProfile({ ...updateData, religion: 'OTHER' });
        ({ error } = saveResult);
      }

      if (error) {
        if ((error as any).code === 'PROFILE_CONTENT_NOT_ALLOWED') {
          setStatusTone('error');
          setStatusMessage('Please update your About section. Contact details, external promotion and solicitation cannot appear on public profiles.');
          return;
        }
        if ((error as any).code === '23505') {
          setStatusTone('error');
          setStatusMessage(
            'This phone number is already linked to another account. Please sign in or use a different number.'
          );
          return;
        }
        if ((error as any).code === '23514') {
          setStatusTone('error');
          setStatusMessage('Please verify your phone number before updating your profile.');
          return;
        }
        console.error('Profile update error:', error);
        throw error;
      }

      try {
        await AsyncStorage.setItem(DISTANCE_UNIT_KEY, distanceUnit);
        DeviceEventEmitter.emit(DISTANCE_UNIT_EVENT, distanceUnit);
      } catch (storageError) {
        console.error('Error saving distance unit:', storageError);
      }

      // Save interests separately through profile_interests table
      const interestsResult = await saveUserInterests(selectedInterests);
      let mediaSyncPending = false;
      if (mediaSyncPayload) {
        await enqueueProfileMediaSyncMutation(mediaSyncPayload);
        if (!(await isOfflineNow())) {
          try {
            await drainOfflineMutationQueue();
            await refreshProfile();
          } catch {
            mediaSyncPending = true;
          }
        } else {
          mediaSyncPending = true;
        }
      }

      const queued = saveResult.queued === true || interestsResult.queued === true || mediaSyncPending;
      agePreferenceTouchedRef.current = false;
      initialSelectedInterestsRef.current = selectedInterests;
      const snapshotProfileId = getSnapshotProfileId();
      if (snapshotProfileId) {
        void writeMeProfileSnapshot(snapshotProfileId, {
          avatarUrl: formData.avatar_url || null,
          heroImageUrl: resolvedHeroImageUrl,
          photos: sanitizedPhotos,
          profileVideo: formData.profile_video || null,
        });
      }
      Alert.alert(
        queued ? 'Saved' : 'Success',
        queued
          ? 'Your profile is updated here. Some media may still finish syncing in the background.'
          : 'Profile updated successfully!',
      );
      onSave({
        ...updateData,
        __displayAvatarUrl: formData.avatar_url || null,
        __displayHeroImageUrl: resolvedHeroImageUrl,
        __displayPhotos: sanitizedPhotos,
        __displayProfileVideo: formData.profile_video || null,
        __interests: selectedInterests,
        __offlineQueued: queued,
      });
      onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
      setStatusTone('error');
      setStatusMessage('Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeProfileEditor}
    >
      <SafeAreaView style={styles.container}>
        <BlurViewSafe intensity={34} tint={isDark ? 'dark' : 'light'} style={styles.shell}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={closeProfileEditor}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSave} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color={theme.tint} />
              ) : (
                <Text style={styles.saveButton}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {statusMessage && (
            <View
              style={[
                styles.statusBanner,
                statusTone === 'error' ? styles.statusBannerError : styles.statusBannerSuccess,
              ]}
            >
              <MaterialCommunityIcons
                name={statusTone === 'error' ? 'alert-circle' : 'check-circle'}
                size={18}
                color={statusTone === 'error' ? theme.danger : theme.tint}
              />
              <Text
                style={[
                  styles.statusBannerText,
                  statusTone === 'error' ? styles.statusBannerTextError : styles.statusBannerTextSuccess,
                ]}
              >
                {statusMessage}
              </Text>
            </View>
          )}

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <ProfileMediaStudioSection
            theme={theme}
            isDark={isDark}
            draft={mediaDraft}
            previewVideoUrl={previewVideoUrl}
            profileInitials={avatarInitials}
            uploading={uploading || mediaStudioBusy}
            videoUploading={videoUploading || mediaStudioBusy}
            onPickAvatar={() => void pickImage(true)}
            onPickGallery={() => void pickImage(false)}
            onPickVideo={() => void pickProfileVideo()}
            onRemoveVideo={removeProfileVideo}
            onRefineHero={(index) => openMediaFrame('hero', index)}
            onRefineAvatar={(index) => openMediaFrame('avatar', index)}
            onMoveLeft={(index) => moveGalleryPhoto(index, index - 1)}
            onMoveRight={(index) => moveGalleryPhoto(index, index + 1)}
            onRemovePhoto={removePhoto}
          />

          <TrustVerificationCompactCard
            theme={theme}
            verificationLevel={verificationLevel}
            verificationCallout={verificationCallout}
            onPress={onOpenVerification}
          />

          {/* Basic Info */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={18}
                  color={theme.accent}
                  style={styles.sectionIcon}
                />
              </View>
              <Text style={styles.sectionTitle}>Basic Information</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.textInput}
                value={formData.full_name}
                onChangeText={(text) => handleInputChange('full_name', text)}
                placeholder="Enter your full name"
                maxLength={50}
              />
            </View>

            {showLegacyCoreFields ? <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Bio *</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={formData.bio}
                onChangeText={(text) => handleInputChange('bio', text)}
                placeholder="Tell us about yourself..."
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={styles.characterCount}>{formData.bio.length}/500</Text>
            </View> : null}

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Gender</Text>
              <View style={styles.optionChipRow}>
                {GENDER_OPTIONS.map((option) => {
                  const selected = formData.gender === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.optionChip,
                        selected && styles.optionChipSelected,
                      ]}
                      onPress={() => handleInputChange('gender', option.value)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          selected && styles.optionChipTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Age</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.age}
                  onChangeText={(text) => handleInputChange('age', text)}
                  placeholder="25"
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Height</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowHeightPicker(true)}
                >
                  <Text style={[
                    formData.height ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.height || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                
                {formData.height === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customHeight}
                    onChangeText={setCustomHeight}
                    placeholder="Enter your height"
                    maxLength={10}
                    onBlur={() => {
                      if (customHeight.trim()) {
                        handleInputChange('height', customHeight.trim());
                      }
                    }}
                  />
                )}
              </View>
            </View>

            {showLegacyCoreFields ? <>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Current Country</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => {
                  if (isCountryManaged) return;
                  setCountryPickerTarget('current');
                  setCountryModalVisible(true);
                }}
                disabled={isCountryManaged}
              >
                <View style={styles.countrySelectValue}>
                  <Text style={[styles.countryFlagText, !selectedCurrentCountryFlag && styles.countryFlagPlaceholder]}>
                    {selectedCurrentCountryFlag || '--'}
                  </Text>
                  <View style={styles.countrySelectCopy}>
                    <Text
                      style={[
                        formData.current_country
                          ? styles.selectButtonText
                          : styles.selectButtonPlaceholder,
                      ]}
                    >
                      {formData.current_country || 'Select current country'}
                    </Text>
                    <Text style={styles.countryMetaText}>
                      {selectedCurrentCountry
                        ? `${selectedCurrentCountry.dial} • ${selectedCurrentCountry.code}`
                        : 'Used for local matching first'}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              {isCountryManaged ? (
                <Text style={styles.fieldHelperText}>
                  {countryPolicyMessage}
                </Text>
              ) : null}
              {isCountryManaged ? (
                <TouchableOpacity
                  style={[styles.countryVerificationButton, countryVerificationBusy && styles.disabledSelectButton]}
                  onPress={verifyCountryWithPreciseLocation}
                  disabled={countryVerificationBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Verify current country with precise location"
                >
                  {countryVerificationBusy ? (
                    <ActivityIndicator size="small" color={theme.tint} />
                  ) : (
                    <MaterialCommunityIcons name="crosshairs-gps" size={18} color={theme.tint} />
                  )}
                  <Text style={styles.countryVerificationButtonText}>
                    {countryVerificationBusy ? 'Checking secure location…' : 'Verify a move with precise location'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Origin Country (Optional)</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => {
                  if (isGhanaOnboardingExperience) return;
                  setCountryPickerTarget('origin');
                  setCountryModalVisible(true);
                }}
                disabled={isGhanaOnboardingExperience}
              >
                <View style={styles.countrySelectValue}>
                  <Text style={[styles.countryFlagText, !selectedOriginCountryFlag && styles.countryFlagPlaceholder]}>
                    {selectedOriginCountryFlag || '--'}
                  </Text>
                  <View style={styles.countrySelectCopy}>
                    <Text
                      style={[
                        formData.origin_country
                          ? styles.selectButtonText
                          : styles.selectButtonPlaceholder,
                      ]}
                    >
                      {formData.origin_country || 'Select origin country'}
                    </Text>
                    <Text style={styles.countryMetaText}>
                      {selectedOriginCountry
                        ? `${selectedOriginCountry.dial} • ${selectedOriginCountry.code}`
                        : 'Used for diaspora affinity'}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              <Text style={styles.fieldHelperText}>
                {isGhanaOnboardingExperience
                  ? 'Your Ghana roots stay anchored here even when your verified current country changes.'
                  : 'This is where your roots are from, not necessarily where you live now.'}
              </Text>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>
                {formIsGhanaProfile ? 'Region' : 'City or Region'}
              </Text>
              {formIsGhanaProfile ? (
                <>
                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => setShowRegionPicker(true)}
                  >
                    <Text
                      style={[
                        formData.region
                          ? styles.selectButtonText
                          : styles.selectButtonPlaceholder,
                      ]}
                    >
                      {formData.region || 'Select region'}
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-down"
                      size={20}
                      color={theme.textMuted}
                    />
                  </TouchableOpacity>
                  {formData.region === 'Other' && (
                    <TextInput
                      style={[styles.textInput, { marginTop: 8 }]}
                      value={customRegion}
                      onChangeText={setCustomRegion}
                      placeholder="Enter your region"
                      maxLength={100}
                      onBlur={() => {
                        if (customRegion.trim()) {
                          handleInputChange('region', customRegion.trim());
                        }
                      }}
                    />
                  )}
                </>
              ) : (
                <TextInput
                  style={styles.textInput}
                  value={formData.region}
                  onChangeText={(text) => handleInputChange('region', text)}
                  placeholder="City or region"
                  maxLength={100}
                />
              )}
            </View>

            {formIsGhanaProfile ? (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>City or Town (Optional)</Text>
                <TouchableOpacity
                  style={[
                    styles.selectButton,
                    formData.city && styles.selectButtonSelected,
                    !formData.region && styles.disabledSelectButton,
                  ]}
                  disabled={!formData.region}
                  onPress={() => {
                    if (!formData.region) return;
                    setGhanaCityTownSearch('');
                    setGhanaCityTownInitializing(true);
                    setShowGhanaCityTownPicker(true);
                  }}
                >
                  <View style={styles.citySelectValueWrap}>
                    <Text
                      style={[
                        formData.city
                          ? styles.selectButtonText
                          : styles.selectButtonPlaceholder,
                      ]}
                    >
                      {formData.city || 'Choose a Ghana city or town'}
                    </Text>
                    {formData.city && formData.locality_district ? (
                      <Text style={styles.citySelectMetaText} numberOfLines={1}>
                        {formData.locality_district}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.citySelectActions}>
                    {formData.city ? (
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={(event) => {
                          event.stopPropagation();
                          handleInputChange('city', '');
                          handleInputChange('locality_geoname_id', null);
                          handleInputChange('locality_district', '');
                        }}
                      >
                        <MaterialCommunityIcons
                          name="close-circle-outline"
                          size={18}
                          color={theme.textMuted}
                        />
                      </TouchableOpacity>
                    ) : null}
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={formData.city ? theme.tint : theme.textMuted}
                    />
                  </View>
                </TouchableOpacity>
                <Text style={styles.fieldHelperText}>
                  {formData.region
                    ? 'Helps your profile feel more locally relevant.'
                    : 'Select your region first, then optionally add your city or town.'}
                </Text>
                {!formData.city && formData.region ? (
                  <Text style={styles.subtleFieldNote}>You can leave this blank and keep the region only.</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Religion</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowReligionPicker(true)}
              >
                <Text
                  style={[
                    formData.religion
                      ? styles.selectButtonText
                      : styles.selectButtonPlaceholder,
                  ]}
                >
                  {formatReligionLabel(formData.religion) || 'Select religion'}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={20}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Roots</Text>
              <Text style={styles.toggleHelper}>
                {isGhanaProfile
                  ? 'Choose the communities, cultures, or identities that feel part of your story.'
                  : 'Pick one or more roots or identities that matter to you culturally.'}
              </Text>
              <View style={[styles.optionChipRow, { marginTop: 10 }]}>
                {(isGhanaProfile ? GHANA_ROOT_OPTIONS : GLOBAL_ROOT_OPTIONS).map((option) => {
                  const selected = formData.roots.includes(option);
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.optionChip, selected && styles.optionChipSelected]}
                      onPress={() => handleRootToggle(option)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={[styles.textInput, { marginTop: 12 }]}
                value={formData.roots_note}
                onChangeText={(text) => handleInputChange('roots_note', text)}
                placeholder={isGhanaProfile ? "Tell us more, if you'd like" : 'Optional: describe how you identify'}
                maxLength={120}
              />
              {isGhanaProfile ? (
                <Text style={[styles.toggleHelper, { marginTop: 8 }]}>
                  You can add a specific group, family story, or cultural connection.
                </Text>
              ) : null}
              <View style={{ marginTop: 12, gap: 10 }}>
                {ROOTS_VISIBILITY_OPTIONS.map((option) => {
                  const active = formData.roots_visibility === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={styles.toggleRow}
                      onPress={() => handleInputChange('roots_visibility', option.value)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.toggleTextCol}>
                        <Text style={styles.toggleLabel}>{option.label}</Text>
                        <Text style={styles.toggleSub}>{option.subtitle}</Text>
                      </View>
                      <View style={[styles.togglePill, active && styles.togglePillActive]}>
                        <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                          {active ? 'On' : 'Off'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            </> : null}
          </View>

          <GhanaOnboardingProfileSections
              formData={formData}
              styles={styles}
              theme={theme}
              isGhana={isGhanaOnboardingExperience}
              countryManaged={isCountryManaged}
              countryPolicyMessage={countryPolicyMessage}
              countryVerificationBusy={countryVerificationBusy}
              onVerifyCountry={verifyCountryWithPreciseLocation}
              dark={isDark}
              selectedInterests={selectedInterests}
              loadingInterests={loadingInterests}
              customOccupation={customOccupation}
              setCustomOccupation={setCustomOccupation}
              handleInputChange={handleInputChange}
              handleRootToggle={handleRootToggle}
              setShowOccupationPicker={setShowOccupationPicker}
              setShowRegionPicker={setShowRegionPicker}
              openCurrentCountryPicker={() => {
                setCountryPickerTarget('current');
                setCountryModalVisible(true);
              }}
              openOriginCountryPicker={() => {
                setCountryPickerTarget('origin');
                setCountryModalVisible(true);
              }}
              openCityPicker={() => {
                if (!formData.region) return;
                setGhanaCityTownSearch('');
                setGhanaCityTownInitializing(true);
                setShowGhanaCityTownPicker(true);
              }}
              clearCity={() => {
                handleInputChange('city', '');
                handleInputChange('locality_geoname_id', null);
                handleInputChange('locality_district', '');
              }}
              setShowReligionPicker={setShowReligionPicker}
              setShowInterestsPicker={setShowInterestsPicker}
          />

          <View style={styles.ghanaAdditionalIntro}>
              <Text style={styles.ghanaCoreIntroEyebrow}>MORE ABOUT YOU</Text>
              <Text style={styles.ghanaAdditionalTitle}>Optional details for deeper compatibility</Text>
              <Text style={styles.ghanaCoreIntroBody}>Add only what feels useful. Your core profile story is already above.</Text>
          </View>

          {/* Professional Info */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <MaterialCommunityIcons
                  name="briefcase-outline"
                  size={18}
                  color={theme.accent}
                  style={styles.sectionIcon}
                />
              </View>
              <Text style={styles.sectionTitle}>{formIsGhanaProfile ? 'Education' : 'Professional'}</Text>
            </View>
            
            {showLegacyCoreFields ? <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Occupation</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowOccupationPicker(true)}
              >
                <Text style={[
                  formData.occupation ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {formData.occupation || 'Select your occupation'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              
              {formData.occupation === 'Other' && (
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={customOccupation}
                  onChangeText={setCustomOccupation}
                  placeholder="Enter your occupation"
                  maxLength={100}
                  onBlur={() => {
                    if (customOccupation.trim()) {
                      handleInputChange('occupation', customOccupation.trim());
                    }
                  }}
                />
              )}
            </View> : null}

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Education</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowEducationPicker(true)}
              >
                <Text style={[
                  formData.education ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {formData.education || 'Select your education'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              
              {formData.education === 'Other' && (
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={customEducation}
                  onChangeText={setCustomEducation}
                  placeholder="Enter your education"
                  maxLength={100}
                  onBlur={() => {
                    if (customEducation.trim()) {
                      handleInputChange('education', customEducation.trim());
                    }
                  }}
                />
              )}
            </View>
          </View>

          {/* Dating Preferences */}
          {showLegacyCoreFields ? <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <MaterialCommunityIcons
                  name="heart-outline"
                  size={18}
                  color={theme.accent}
                  style={styles.sectionIcon}
                />
              </View>
              <Text style={styles.sectionTitle}>Dating Preferences</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Looking For</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowLookingForPicker(true)}
              >
                <Text style={[
                  formData.looking_for ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {formData.looking_for ? formatRelationshipIntent(formData.looking_for) : 'What are you looking for?'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              
              {formData.looking_for === 'Other' && (
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={customLookingFor}
                  onChangeText={setCustomLookingFor}
                  placeholder="What are you looking for?"
                  maxLength={100}
                  onBlur={() => {
                    if (customLookingFor.trim()) {
                      handleInputChange('looking_for', customLookingFor.trim());
                    }
                  }}
                />
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Preferred Age Range</Text>
              <Text style={styles.fieldHelperText}>
                This is your real discovery preference. Vibes starts from this saved range.
              </Text>
              <View style={styles.row}>
                <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.ageMetaLabel}>Min age</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formData.min_age_interest}
                    onChangeText={(text) => handleInputChange('min_age_interest', text.replace(/[^0-9]/g, ''))}
                    placeholder="18"
                    keyboardType="numeric"
                    maxLength={2}
                  />
                </View>

                <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.ageMetaLabel}>Max age</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formData.max_age_interest}
                    onChangeText={(text) => handleInputChange('max_age_interest', text.replace(/[^0-9]/g, ''))}
                    placeholder="35"
                    keyboardType="numeric"
                    maxLength={2}
                  />
                </View>
              </View>
            </View>
          </View> : null}

          {/* Matchmaking & Visibility */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <MaterialCommunityIcons
                  name="account-group"
                  size={18}
                  color={theme.accent}
                  style={styles.sectionIcon}
                />
              </View>
              <Text style={styles.sectionTitle}>Matchmaking & Visibility</Text>
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleLabel}>Matchmaking mode</Text>
                <Text style={styles.toggleSub}>
                  Help friends find matches. Your profile stays private in Vibes.
                </Text>
              </View>
              <TouchableOpacity
                disabled={visibilitySaving}
                onPress={() => {
                  const next = !formData.matchmaking_mode;
                  const nextDiscoverable = next ? false : true;
                  setFormData((prev) => ({
                    ...prev,
                    matchmaking_mode: next,
                    discoverable_in_vibes: nextDiscoverable,
                  }));
                  void persistMatchmakingMode(next);
                }}
                style={[
                  styles.togglePill,
                  formData.matchmaking_mode ? styles.togglePillActive : null,
                  visibilitySaving ? styles.togglePillDisabled : null,
                ]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    formData.matchmaking_mode ? styles.toggleTextActive : null,
                    visibilitySaving ? styles.toggleTextDisabled : null,
                  ]}
                >
                  {visibilitySaving ? 'Saving...' : formData.matchmaking_mode ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleLabel}>Visible in Vibes</Text>
                <Text style={styles.toggleSub}>
                  Show your profile in Vibes discovery.
                </Text>
              </View>
              <TouchableOpacity
                disabled={formData.matchmaking_mode || visibilitySaving}
                onPress={() => {
                  const next = !formData.discoverable_in_vibes;
                  setFormData((prev) => ({ ...prev, discoverable_in_vibes: next }));
                  void persistDiscoverableInVibes(next);
                }}
                style={[
                  styles.togglePill,
                  formData.discoverable_in_vibes ? styles.togglePillActive : null,
                  (formData.matchmaking_mode || visibilitySaving) ? styles.togglePillDisabled : null,
                ]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    formData.discoverable_in_vibes ? styles.toggleTextActive : null,
                    (formData.matchmaking_mode || visibilitySaving) ? styles.toggleTextDisabled : null,
                  ]}
                >
                  {formData.matchmaking_mode
                    ? 'Hidden'
                    : visibilitySaving
                      ? 'Saving...'
                    : formData.discoverable_in_vibes
                      ? 'On'
                      : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.toggleHelper}>
              Matchmaking mode hides you from Vibes while you help others connect.
            </Text>
          </View>

          {/* Lifestyle */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <MaterialCommunityIcons
                  name="sprout"
                  size={18}
                  color={theme.accent}
                  style={styles.sectionIcon}
                />
              </View>
              <Text style={styles.sectionTitle}>Lifestyle</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Exercise Frequency</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowExercisePicker(true)}
              >
                <Text style={[
                  formData.exercise_frequency ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {formData.exercise_frequency || 'How often do you exercise?'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              
              {formData.exercise_frequency === 'Other' && (
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={customExercise}
                  onChangeText={setCustomExercise}
                  placeholder="Enter your exercise frequency"
                  maxLength={50}
                  onBlur={() => {
                    if (customExercise.trim()) {
                      handleInputChange('exercise_frequency', customExercise.trim());
                    }
                  }}
                />
              )}
            </View>

            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Smoking</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowSmokingPicker(true)}
                >
                  <Text style={[
                    formData.smoking ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.smoking || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                
                {formData.smoking === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customSmoking}
                    onChangeText={setCustomSmoking}
                    placeholder="Smoking habits"
                    maxLength={50}
                    onBlur={() => {
                      if (customSmoking.trim()) {
                        handleInputChange('smoking', customSmoking.trim());
                      }
                    }}
                  />
                )}
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Drinking</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowDrinkingPicker(true)}
                >
                  <Text style={[
                    formData.drinking ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.drinking || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                
                {formData.drinking === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customDrinking}
                    onChangeText={setCustomDrinking}
                    placeholder="Drinking habits"
                    maxLength={50}
                    onBlur={() => {
                      if (customDrinking.trim()) {
                        handleInputChange('drinking', customDrinking.trim());
                      }
                    }}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Family & Relationship */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <MaterialCommunityIcons
                  name="account-heart-outline"
                  size={18}
                  color={theme.accent}
                  style={styles.sectionIcon}
                />
              </View>
              <Text style={styles.sectionTitle}>Family & Relationship</Text>
            </View>
            
            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Have Children</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowHasChildrenPicker(true)}
                >
                  <Text style={[
                    formData.has_children ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.has_children || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                
                {formData.has_children === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customHasChildren}
                    onChangeText={setCustomHasChildren}
                    placeholder="Children status"
                    maxLength={50}
                    onBlur={() => {
                      if (customHasChildren.trim()) {
                        handleInputChange('has_children', customHasChildren.trim());
                      }
                    }}
                  />
                )}
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Want Children</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowWantsChildrenPicker(true)}
                >
                  <Text style={[
                    formData.wants_children ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.wants_children || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                
                {formData.wants_children === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customWantsChildren}
                    onChangeText={setCustomWantsChildren}
                    placeholder="Future children"
                    maxLength={50}
                    onBlur={() => {
                      if (customWantsChildren.trim()) {
                        handleInputChange('wants_children', customWantsChildren.trim());
                      }
                    }}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Personality & Vibes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personality & Vibes</Text>
            
            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Personality</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowPersonalityPicker(true)}
                >
                  <Text style={[
                    formData.personality_type ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.personality_type || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                
                {formData.personality_type === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customPersonality}
                    onChangeText={setCustomPersonality}
                    placeholder="Personality type"
                    maxLength={50}
                    onBlur={() => {
                      if (customPersonality.trim()) {
                        handleInputChange('personality_type', customPersonality.trim());
                      }
                    }}
                  />
                )}
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Love Language</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowLoveLanguagePicker(true)}
                >
                  <Text style={[
                    formData.love_language ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.love_language || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                
                {formData.love_language === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customLoveLanguage}
                    onChangeText={setCustomLoveLanguage}
                    placeholder="Love language"
                    maxLength={50}
                    onBlur={() => {
                      if (customLoveLanguage.trim()) {
                        handleInputChange('love_language', customLoveLanguage.trim());
                      }
                    }}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Living Situation & Preferences */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Living & Preferences</Text>
            
            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Living Situation</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowLivingSituationPicker(true)}
                >
                  <Text style={[
                    formData.living_situation ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.living_situation || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                
                {formData.living_situation === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customLivingSituation}
                    onChangeText={setCustomLivingSituation}
                    placeholder="Living situation"
                    maxLength={50}
                    onBlur={() => {
                      if (customLivingSituation.trim()) {
                        handleInputChange('living_situation', customLivingSituation.trim());
                      }
                    }}
                  />
                )}
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Pets</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowPetsPicker(true)}
                >
                  <Text style={[
                    formData.pets ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.pets || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                
                {formData.pets === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customPets}
                    onChangeText={setCustomPets}
                    placeholder="Pet preference"
                    maxLength={50}
                    onBlur={() => {
                      if (customPets.trim()) {
                        handleInputChange('pets', customPets.trim());
                      }
                    }}
                  />
                )}
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Languages Spoken</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowLanguagesPicker(true)}
              >
                <Text style={[
                  displayLanguages.length > 0 ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {displayLanguages.length > 0 
                    ? displayLanguages.length === 1 
                      ? displayLanguages[0]
                      : `${displayLanguages.length} languages selected`
                    : 'Select languages'
                  }
                </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              
              {displayLanguages.includes('Other') && (
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={customLanguage}
                  onChangeText={setCustomLanguage}
                  placeholder="Enter other language"
                  maxLength={50}
                  onBlur={() => {
                    if (customLanguage.trim()) {
                      const updatedLanguages = normalizeLanguages(
                        selectedLanguages.map((lang) =>
                          lang === 'Other' ? customLanguage.trim() : lang
                        )
                      );
                      setSelectedLanguages(updatedLanguages);
                      handleInputChange('languages_spoken', updatedLanguages);
                    }
                  }}
                />
              )}
            </View>
          </View>

          {/* Interests Section */}
          {showLegacyCoreFields ? <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <MaterialCommunityIcons
                  name="star-outline"
                  size={18}
                  color={theme.accent}
                  style={styles.sectionIcon}
                />
              </View>
              <Text style={styles.sectionTitle}>Interests & Hobbies</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Select Your Interests</Text>
              {formIsGhanaProfile ? (
                <Text style={styles.fieldHelperText}>Choose 3–5 interests, matching your onboarding profile.</Text>
              ) : null}
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowInterestsPicker(true)}
                disabled={loadingInterests}
              >
                <Text style={[
                  selectedInterests.length > 0 ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {loadingInterests 
                    ? 'Loading interests...'
                    : selectedInterests.length > 0 
                      ? selectedInterests.length === 1 
                        ? selectedInterests[0]
                        : `${selectedInterests.length}${formIsGhanaProfile ? ' / 5' : ''} interests selected`
                      : 'Choose your interests'
                  }
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Selected Interests Preview */}
            {selectedInterests.length > 0 && (
              <View style={styles.interestsPreview}>
                {selectedInterests.map((interest, index) => (
                  <View key={index} style={styles.interestTag}>
                    <Text style={styles.interestText}>{interest}</Text>
                    <TouchableOpacity
                      style={styles.removeInterestButton}
                      onPress={() => {
                        const updated = selectedInterests.filter(i => i !== interest);
                        setSelectedInterests(updated);
                      }}
                    >
                      <MaterialCommunityIcons name="close" size={12} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View> : null}

          {/* Distance Unit Section */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <MaterialCommunityIcons
                  name="map-marker-radius-outline"
                  size={18}
                  color={theme.accent}
                  style={styles.sectionIcon}
                />
              </View>
              <Text style={styles.sectionTitle}>Distance Unit</Text>
            </View>
            <View style={styles.distanceUnitGroup}>
              {DISTANCE_UNIT_OPTIONS.map((option) => {
                const selected = distanceUnit === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.distanceUnitRow}
                    onPress={() => setDistanceUnit(option.value)}
                  >
                    <View style={[styles.distanceUnitOuter, selected && styles.distanceUnitOuterSelected]}>
                      {selected && <View style={styles.distanceUnitInner} />}
                    </View>
                    <View style={styles.distanceUnitText}>
                      <Text style={styles.distanceUnitLabel}>{option.label}</Text>
                      {option.subtitle ? <Text style={styles.distanceUnitSubtitle}>{option.subtitle}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Diaspora section removed for cleaner edit experience */}

            <View style={{ height: 50 }} />
          </ScrollView>

          {/* Upload Progress */}
          {(uploading || videoUploading || mediaStudioBusy) && (
            <View style={styles.uploadingOverlay}>
              <View style={styles.uploadingContainer}>
                <ActivityIndicator size="large" color={theme.tint} />
                <Text style={styles.uploadingText}>
                  {mediaStudioBusy
                    ? 'Preparing your premium media framing...'
                    : videoUploading
                    ? `${videoUploadStage || 'Uploading video...'}${
                        typeof videoUploadProgress === 'number'
                          ? ` ${Math.round(videoUploadProgress * 100)}%`
                          : ''
                      }`
                    : 'Uploading photo...'}
                </Text>
              </View>
            </View>
          )}
        </BlurViewSafe>
      </SafeAreaView>

      <ProfileMediaFrameSheet
        visible={Boolean(mediaFrameRequest)}
        theme={theme}
        isDark={isDark}
        sourceUri={mediaFrameRequest?.sourceUri ?? null}
        slot={mediaFrameRequest?.slot ?? null}
        onClose={() => setMediaFrameRequest(null)}
        onConfirm={(focus) => void handleFrameConfirm(focus)}
      />

      {/* Height Picker */}
      <FieldPicker
        title="Select Height"
        options={HEIGHT_OPTIONS}
        visible={showHeightPicker}
        onClose={() => setShowHeightPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomHeight('');
          }
          handleInputChange('height', value);
        }}
        currentValue={formData.height}
        styles={styles}
        tintColor={theme.tint}
      />

      <Modal
        visible={countryModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCountryModalVisible(false)}
      >
        <SafeAreaView style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setCountryModalVisible(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>
              {countryPickerTarget === 'origin' ? 'Origin Country' : 'Current Country'}
            </Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.countrySearchWrap}>
            <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
            <TextInput
              value={countrySearch}
              onChangeText={setCountrySearch}
              placeholder="Search country or code"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              style={styles.countrySearchInput}
            />
          </View>

          <FlatList
            data={countryPickerData}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            style={styles.pickerList}
            renderItem={({ item }) => {
              const selectedCode =
                countryPickerTarget === 'origin'
                  ? selectedOriginCountry?.code
                  : selectedCurrentCountry?.code;
              const isSelected = selectedCode === item.code;
              return (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    isSelected && styles.pickerItemSelected,
                  ]}
                  onPress={() => selectCountry(item)}
                >
                  <View style={styles.countryPickerRow}>
                    <Text style={styles.countryPickerFlag}>{toFlagEmoji(item.code) || '--'}</Text>
                    <View style={styles.countryPickerCopy}>
                      <Text
                        style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Text style={styles.countryPickerMeta}>{`${item.dial} • ${item.code}`}</Text>
                    </View>
                  </View>
                  {isSelected ? (
                    <MaterialCommunityIcons name="check" size={20} color={theme.tint} />
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showGhanaCityTownPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowGhanaCityTownPicker(false)}
      >
        <SafeAreaView style={[styles.pickerContainer, { backgroundColor: theme.background }]}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowGhanaCityTownPicker(false)}>
              <Text style={styles.pickerCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>City or Town</Text>
            <View style={{ minWidth: 52 }} />
          </View>

          <View style={styles.locationPickerIntro}>
            <Text style={styles.locationPickerLead}>
              {`Where are you based in ${formData.region}?`}
            </Text>
            <Text style={styles.locationPickerSupport}>City stays optional.</Text>
          </View>

          <View style={styles.countrySearchWrap}>
            <MaterialCommunityIcons
              name="magnify"
              size={20}
              color={theme.textMuted}
            />
            <TextInput
              style={styles.countrySearchInput}
              value={ghanaCityTownSearch}
              onChangeText={setGhanaCityTownSearch}
              placeholder={ghanaCityTownPlaceholder}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
            />
            {ghanaCityTownLoading ? (
              <ActivityIndicator size="small" color={theme.tint} />
            ) : null}
          </View>

          <FlatList
            data={ghanaCityTownRows}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.pickerList}
            contentContainerStyle={styles.locationPickerListContent}
            ListEmptyComponent={
              ghanaCityTownInitializing ? (
                <View style={styles.emptyStateWrap}>
                  <ActivityIndicator size="small" color={theme.tint} />
                  <Text style={styles.emptyStateTitle}>Loading places...</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    Pulling localities for {formData.region}.
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              if (item.type === 'section') {
                return (
                  <Text style={styles.locationPickerSectionTitle}>{item.title}</Text>
                );
              }

              if (item.type === 'empty') {
                return (
                  <View style={styles.emptyStateWrap}>
                    <Text style={styles.emptyStateTitle}>{item.title}</Text>
                    <Text style={styles.emptyStateSubtitle}>{item.body}</Text>
                  </View>
                );
              }

              if (item.type === 'action') {
                return (
                  <TouchableOpacity
                    style={styles.locationPickerQuietAction}
                    onPress={() => {
                      handleInputChange('city', '');
                      handleInputChange('locality_geoname_id', null);
                      handleInputChange('locality_district', '');
                      setGhanaCityTownSearch('');
                      setShowGhanaCityTownPicker(false);
                    }}
                  >
                    <View style={styles.countryPickerCopy}>
                      <Text style={styles.locationPickerQuietActionText}>{item.label}</Text>
                      <Text style={styles.countryPickerMeta}>{item.body}</Text>
                    </View>
                    {!formData.city ? (
                      <MaterialCommunityIcons name="check" size={20} color={theme.tint} />
                    ) : (
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={theme.textMuted}
                      />
                    )}
                  </TouchableOpacity>
                );
              }

              const normalizedSelected = normalizeGhanaCityTownValue(formData.city).toLowerCase();
              const isSelected =
                (formData.locality_geoname_id != null &&
                  item.item.geonameId != null &&
                  formData.locality_geoname_id === item.item.geonameId) ||
                (!formData.locality_geoname_id &&
                  normalizedSelected === item.item.name.toLowerCase());
              return (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    isSelected && styles.pickerItemSelected,
                  ]}
                  onPress={async () => {
                    handleInputChange('city', normalizeGhanaCityTownValue(item.item.name));
                    handleInputChange('locality_geoname_id', item.item.geonameId ?? null);
                    handleInputChange('locality_district', item.item.district ?? '');
                    await saveRecentGhanaLocality(item.item);
                    const nextRecent = await readRecentGhanaLocalities(formData.region);
                    setGhanaCityTownRecent(nextRecent);
                    setGhanaCityTownSearch('');
                    setShowGhanaCityTownPicker(false);
                  }}
                >
                  <View style={styles.countryPickerCopy}>
                    <Text
                      style={[
                        styles.pickerItemText,
                        isSelected && styles.pickerItemTextSelected,
                      ]}
                    >
                      {item.item.name}
                    </Text>
                    <Text style={styles.countryPickerMeta}>
                      {item.item.district || item.item.region}
                    </Text>
                  </View>
                  {isSelected ? (
                    <MaterialCommunityIcons name="check" size={20} color={theme.tint} />
                  ) : (
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={theme.textMuted}
                    />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* Ghana Region Picker */}
      {formIsGhanaProfile && (
        <FieldPicker
          title="Select Region"
          options={GHANA_REGIONS_OPTIONS}
          visible={showRegionPicker}
          onClose={() => setShowRegionPicker(false)}
          onSelect={(value) => {
            if (value === 'Other') {
              setCustomRegion('');
            }
            if (formData.region !== value && formData.city) {
              handleInputChange('city', '');
              handleInputChange('locality_geoname_id', null);
              handleInputChange('locality_district', '');
            }
            handleInputChange('region', value);
          }}
          currentValue={formData.region}
          styles={styles}
          tintColor={theme.tint}
        />
      )}

      {/* Religion Picker */}
      <FieldPicker
        title="Select Religion"
        options={RELIGION_OPTIONS}
        visible={showReligionPicker}
        onClose={() => setShowReligionPicker(false)}
        onSelect={(value) => handleInputChange('religion', value)}
        currentValue={formatReligionLabel(formData.religion)}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Occupation Picker */}
      <FieldPicker
        title="Select Occupation"
        options={ONBOARDING_OCCUPATION_OPTIONS}
        visible={showOccupationPicker}
        onClose={() => setShowOccupationPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomOccupation('');
          }
          handleInputChange('occupation', value);
        }}
        currentValue={formData.occupation}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Education Picker */}
      <FieldPicker
        title="Select Education"
        options={EDUCATION_OPTIONS}
        visible={showEducationPicker}
        onClose={() => setShowEducationPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomEducation('');
          }
          handleInputChange('education', value);
        }}
        currentValue={formData.education}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Looking For Picker */}
      <FieldPicker
        title="What are you looking for?"
        options={LOOKING_FOR_OPTIONS}
        visible={showLookingForPicker}
        onClose={() => setShowLookingForPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomLookingFor('');
          }
          handleInputChange('looking_for', value);
        }}
        currentValue={formData.looking_for}
        formatOption={formatRelationshipIntent}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* HIGH PRIORITY Pickers */}
      
      {/* Exercise Frequency Picker */}
      <FieldPicker
        title="Exercise Frequency"
        options={EXERCISE_FREQUENCY_OPTIONS}
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomExercise('');
          }
          handleInputChange('exercise_frequency', value);
        }}
        currentValue={formData.exercise_frequency}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Smoking Picker */}
      <FieldPicker
        title="Smoking Habits"
        options={SMOKING_OPTIONS}
        visible={showSmokingPicker}
        onClose={() => setShowSmokingPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomSmoking('');
          }
          handleInputChange('smoking', value);
        }}
        currentValue={formData.smoking}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Drinking Picker */}
      <FieldPicker
        title="Drinking Habits"
        options={DRINKING_OPTIONS}
        visible={showDrinkingPicker}
        onClose={() => setShowDrinkingPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomDrinking('');
          }
          handleInputChange('drinking', value);
        }}
        currentValue={formData.drinking}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Has Children Picker */}
      <FieldPicker
        title="Do you have children?"
        options={HAS_CHILDREN_OPTIONS}
        visible={showHasChildrenPicker}
        onClose={() => setShowHasChildrenPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomHasChildren('');
          }
          handleInputChange('has_children', value);
        }}
        currentValue={formData.has_children}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Wants Children Picker */}
      <FieldPicker
        title="Do you want children?"
        options={WANTS_CHILDREN_OPTIONS}
        visible={showWantsChildrenPicker}
        onClose={() => setShowWantsChildrenPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomWantsChildren('');
          }
          handleInputChange('wants_children', value);
        }}
        currentValue={formData.wants_children}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Personality Type Picker */}
      <FieldPicker
        title="Personality Type"
        options={PERSONALITY_TYPE_OPTIONS}
        visible={showPersonalityPicker}
        onClose={() => setShowPersonalityPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomPersonality('');
          }
          handleInputChange('personality_type', value);
        }}
        currentValue={formData.personality_type}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Love Language Picker */}
      <FieldPicker
        title="Love Language"
        options={LOVE_LANGUAGE_OPTIONS}
        visible={showLoveLanguagePicker}
        onClose={() => setShowLoveLanguagePicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomLoveLanguage('');
          }
          handleInputChange('love_language', value);
        }}
        currentValue={formData.love_language}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Living Situation Picker */}
      <FieldPicker
        title="Living Situation"
        options={LIVING_SITUATION_OPTIONS}
        visible={showLivingSituationPicker}
        onClose={() => setShowLivingSituationPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomLivingSituation('');
          }
          handleInputChange('living_situation', value);
        }}
        currentValue={formData.living_situation}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Pets Picker */}
      <FieldPicker
        title="Pet Preference"
        options={PETS_OPTIONS}
        visible={showPetsPicker}
        onClose={() => setShowPetsPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomPets('');
          }
          handleInputChange('pets', value);
        }}
        currentValue={formData.pets}
        styles={styles}
        tintColor={theme.tint}
      />

      {/* Languages Multi-Select Picker */}
      <Modal
        visible={showLanguagesPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLanguagesPicker(false)}
      >
        <SafeAreaView style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowLanguagesPicker(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Languages Spoken</Text>
            <TouchableOpacity onPress={() => {
              const cleaned = normalizeLanguages(selectedLanguages);
              handleInputChange('languages_spoken', cleaned);
              setSelectedLanguages(cleaned);
              setShowLanguagesPicker(false);
            }}>
              <Text style={styles.saveButton}>Done</Text>
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={languagesOptions}
            keyExtractor={(item) => item}
            style={styles.pickerList}
            renderItem={({ item }) => {
              const isSelected = selectedLanguages.includes(item);
              return (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    isSelected && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    const next = isSelected
                      ? selectedLanguages.filter((lang) => lang !== item)
                      : normalizeLanguages([...selectedLanguages, item]);
                    setSelectedLanguages(next);
                    setFormData((prev) => ({ ...prev, languages_spoken: next }));
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    isSelected && styles.pickerItemTextSelected
                  ]}>
                    {item}
                  </Text>
                  {isSelected && (
                    <MaterialCommunityIcons name="check" size={20} color={theme.tint} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* Interests Multi-Select Picker */}
      <Modal
        visible={showInterestsPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInterestsPicker(false)}
      >
        <SafeAreaView style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowInterestsPicker(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Select Interests</Text>
            <TouchableOpacity onPress={() => {
              setShowInterestsPicker(false);
            }}>
              <Text style={styles.saveButton}>Done</Text>
            </TouchableOpacity>
          </View>
          
          {loadingInterests ? (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="large" color={theme.tint} />
              <Text style={styles.uploadingText}>Loading interests...</Text>
            </View>
          ) : (
            <FlatList
              data={availableInterests}
              keyExtractor={(item) => item}
              style={styles.pickerList}
              renderItem={({ item }) => {
                const isSelected = selectedInterests.includes(item);
                return (
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      isSelected && styles.pickerItemSelected
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedInterests(prev => prev.filter(interest => interest !== item));
                      } else {
                        if (selectedInterests.length >= 5) {
                          Alert.alert('Interest mix full', 'Remove one interest before choosing another.');
                          return;
                        }
                        setSelectedInterests(prev => [...prev, item]);
                      }
                    }}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      isSelected && styles.pickerItemTextSelected
                    ]}>
                      {item}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons name="check" size={20} color={theme.tint} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean, responsive: ResponsiveMetrics) => {
  const pageGutter = responsive.horizontalGutter;
  const sectionPadding = responsive.space(18, { min: 15, max: 20 });
  const sectionMargin = responsive.compactWidth ? 12 : 16;
  const controlPaddingX = responsive.space(16, { min: 14, max: 18 });
  const controlPaddingY = responsive.space(12, { min: 10, max: 14 });
  const headerPaddingY = responsive.compactHeight ? 12 : 16;
  const avatarSize = responsive.compactHeight ? 92 : 100;
  const avatarPlaceholderSize = responsive.compactHeight ? 102 : 112;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(7,30,34,0.96)' : 'rgba(244,236,226,0.96)',
    },
    shell: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(7,30,34,0.82)' : 'rgba(255,249,243,0.88)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: pageGutter,
      paddingVertical: headerPaddingY,
      backgroundColor: withAlpha(theme.background, isDark ? 0.52 : 0.64),
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
    },
    title: {
      fontSize: responsive.font(18, { min: 17, max: 20 }),
      fontWeight: '700',
      letterSpacing: 0.2,
      color: theme.text,
    },
    cancelButton: {
      fontSize: responsive.font(16, { min: 15, max: 17 }),
      color: theme.textMuted,
    },
    saveButton: {
      fontSize: responsive.font(16, { min: 15, max: 17 }),
      fontWeight: '600',
      color: theme.tint,
    },
    content: {
      flex: 1,
      paddingTop: 6,
    },
    tokens: {
      ink: { color: theme.text },
      muted: { color: theme.textMuted },
      accent: { color: theme.tint },
    } as any,
    ghanaCoreShell: { marginHorizontal: sectionMargin, marginBottom: 8 },
    ghanaCoreIntro: {
      paddingHorizontal: 6,
      paddingVertical: 18,
    },
    ghanaCoreIntroEyebrow: { color: theme.tint, fontSize: 10, letterSpacing: 1.7, fontFamily: 'Manrope_700Bold', marginBottom: 8 },
    ghanaCoreIntroTitle: { color: theme.text, fontSize: responsive.font(25, { min: 22, max: 28 }), lineHeight: 31, fontFamily: 'PlayfairDisplay_700Bold', maxWidth: 360 },
    ghanaCoreIntroBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium', marginTop: 8, maxWidth: 380 },
    ghanaAdditionalIntro: { marginHorizontal: sectionMargin, paddingHorizontal: 6, paddingTop: 20, paddingBottom: 14 },
    ghanaAdditionalTitle: { color: theme.text, fontSize: 20, lineHeight: 25, fontFamily: 'PlayfairDisplay_700Bold' },
    ghanaCoreSection: {
      backgroundColor: isDark ? 'rgba(22,27,31,0.88)' : 'rgba(255,251,246,0.92)',
      borderRadius: 24,
      padding: sectionPadding,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(82,56,43,0.08)',
      shadowColor: isDark ? '#000000' : '#8B5CFF',
      shadowOpacity: isDark ? 0.18 : 0.07,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
    },
    ghanaCoreSectionExpanded: {
      borderColor: withAlpha(theme.tint, isDark ? 0.3 : 0.16),
      shadowOpacity: isDark ? 0.22 : 0.1,
      shadowRadius: 22,
    },
    ghanaChapterHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 54 },
    ghanaChapterEyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 },
    ghanaChapterStatus: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: withAlpha(theme.text, 0.05) },
    ghanaChapterStatusComplete: { backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.08) },
    ghanaChapterStatusText: { color: theme.textMuted, fontSize: 8, fontFamily: 'Manrope_600SemiBold' },
    ghanaChapterStatusTextComplete: { color: theme.tint },
    ghanaChapterSummary: { color: theme.textMuted, fontSize: 10, lineHeight: 14, fontFamily: 'Manrope_500Medium', marginTop: 3 },
    ghanaChapterContent: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: withAlpha(theme.text, isDark ? 0.12 : 0.06) },
    ghanaCoreHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 15 },
    ghanaCoreIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(theme.tint, isDark ? 0.2 : 0.09), borderWidth: 1, borderColor: withAlpha(theme.tint, 0.16) },
    ghanaCoreHeadingCopy: { flex: 1 },
    ghanaCoreEyebrow: { color: theme.tint, fontSize: 9, letterSpacing: 1.35, fontFamily: 'Manrope_700Bold', marginBottom: 2 },
    ghanaCoreTitle: { color: theme.text, fontSize: 18, lineHeight: 23, fontFamily: 'PlayfairDisplay_700Bold' },
    ghanaCoreBody: { color: theme.textMuted, fontSize: 11, lineHeight: 16, fontFamily: 'Manrope_500Medium', marginBottom: 12 },
    ghanaPremiumSelect: { minHeight: 54, borderRadius: 17, borderWidth: 1, borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.09), backgroundColor: withAlpha(theme.background, isDark ? 0.5 : 0.72), paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    ghanaPremiumSelectText: { flex: 1, color: theme.text, fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
    ghanaPremiumTextArea: { minHeight: 116, borderRadius: 18 },
    ghanaLocationCountryCard: { minHeight: 58, borderRadius: 18, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: withAlpha(theme.tint, isDark ? 0.13 : 0.06), borderWidth: 1, borderColor: withAlpha(theme.tint, 0.12), marginBottom: 10 },
    ghanaCountryFlag: { fontSize: 23 },
    ghanaLocationLabel: { color: theme.text, fontSize: 14, fontFamily: 'Manrope_700Bold' },
    ghanaLocationMeta: { color: theme.textMuted, fontSize: 10, lineHeight: 14, fontFamily: 'Manrope_500Medium', marginTop: 1 },
    ghanaVisibilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
    ghanaVisibilityChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: withAlpha(theme.text, 0.1), backgroundColor: withAlpha(theme.background, 0.6) },
    ghanaVisibilityChipSelected: { backgroundColor: theme.tint, borderColor: theme.tint },
    ghanaVisibilityText: { color: theme.textMuted, fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
    ghanaVisibilityTextSelected: { color: '#FFFFFF' },
    ghanaSelectedInterests: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
    ghanaInterestChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.08), borderWidth: 1, borderColor: withAlpha(theme.tint, 0.14) },
    ghanaInterestText: { color: theme.text, fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
    ghanaIntentCard: { minHeight: 72, borderRadius: 18, borderWidth: 1, borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08), backgroundColor: withAlpha(theme.background, isDark ? 0.5 : 0.72), padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
    ghanaIntentCardSelected: { backgroundColor: theme.tint, borderColor: theme.tint },
    ghanaIntentIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(theme.tint, 0.1) },
    ghanaIntentIconSelected: { backgroundColor: 'rgba(255,255,255,0.16)' },
    ghanaIntentTitle: { color: theme.text, fontSize: 13, fontFamily: 'Manrope_700Bold', marginBottom: 2 },
    ghanaIntentTitleSelected: { color: '#FFFFFF' },
    ghanaIntentBody: { color: theme.textMuted, fontSize: 10, lineHeight: 14, fontFamily: 'Manrope_500Medium' },
    ghanaIntentBodySelected: { color: 'rgba(255,255,255,0.78)' },
    ageRangeHero: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 17, backgroundColor: withAlpha(theme.tint, isDark ? 0.15 : 0.07), marginBottom: 11 },
    ageRangeHeroIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(theme.tint, 0.12) },
    ageRangeHeroCopy: { flex: 1 },
    ageRangeEyebrow: { color: theme.tint, fontSize: 8, letterSpacing: 1.1, fontFamily: 'Manrope_700Bold' },
    ageRangeHeroValue: { color: theme.text, fontSize: 21, fontFamily: 'PlayfairDisplay_700Bold' },
    ageRangeYearsPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: withAlpha(theme.background, 0.7) },
    ageRangeYearsText: { color: theme.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
    ageSliderCard: { borderRadius: 18, borderWidth: 1, borderColor: withAlpha(theme.text, 0.08), backgroundColor: withAlpha(theme.background, 0.7), paddingVertical: 16 },
    ageSliderLayout: { width: '100%' },
    ageSliderTrackArea: { height: 54, position: 'relative', justifyContent: 'center' },
    ageSliderTrack: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: withAlpha(theme.text, 0.12) },
    ageSliderFill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: theme.tint },
    ageSliderBubble: { position: 'absolute', top: -8, width: 48, alignItems: 'center', paddingVertical: 4, borderRadius: 9, backgroundColor: theme.text },
    ageSliderBubbleText: { color: theme.background, fontSize: 10, fontFamily: 'Manrope_700Bold' },
    ageSliderThumb: { position: 'absolute', top: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, borderWidth: 2, borderColor: theme.tint, shadowColor: theme.tint, shadowOpacity: 0.2, shadowRadius: 7, elevation: 3 },
    ageSliderThumbActive: { transform: [{ scale: 1.08 }] },
    ageSliderThumbCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.tint },
    ageSliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    ageSliderLabel: { color: theme.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
    ageRangeQuickRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
    ageRangeQuickButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.06) },
    ageRangeQuickText: { color: theme.tint, fontSize: 9, fontFamily: 'Manrope_700Bold' },
    ageRangeReassurance: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11 },
    ageRangeReassuranceText: { flex: 1, color: theme.textMuted, fontSize: 10, lineHeight: 14, fontFamily: 'Manrope_500Medium' },
    section: {
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.72 : 0.84),
      paddingHorizontal: sectionPadding,
      paddingVertical: sectionPadding,
      marginBottom: responsive.space(12, { min: 10, max: 14 }),
      marginHorizontal: sectionMargin,
      borderWidth: 1,
      borderRadius: 18,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.05),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.16 : 0.08,
      shadowRadius: 14,
      elevation: 3,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: responsive.space(8, { min: 6, max: 10 }),
      flexShrink: 1,
      marginBottom: responsive.space(12, { min: 10, max: 14 }),
    },
    sectionIcon: {
      marginTop: 1,
    },
    sectionIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.accent, isDark ? 0.2 : 0.14),
      borderWidth: 1,
      borderColor: withAlpha(theme.accent, isDark ? 0.45 : 0.3),
      shadowColor: theme.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.35 : 0.22,
      shadowRadius: 10,
      elevation: 6,
    },
    sectionTitle: {
      fontSize: responsive.font(16, { min: 15, max: 18 }),
      fontWeight: '700',
      letterSpacing: 0.2,
      color: theme.text,
      lineHeight: 20,
    },
    avatarContainer: {
      alignItems: 'center',
      position: 'relative',
    },
    avatar: {
      width: avatarSize,
      height: avatarSize,
      borderRadius: avatarSize / 2,
      borderWidth: 3,
      borderColor: withAlpha(theme.text, isDark ? 0.25 : 0.12),
    },
    avatarPlaceholder: {
      width: avatarPlaceholderSize,
      height: avatarPlaceholderSize,
      borderRadius: avatarPlaceholderSize / 2,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.28 : 0.16,
      shadowRadius: 18,
      elevation: 8,
    },
    avatarPlaceholderInitials: {
      fontSize: responsive.font(30, { min: 27, max: 32 }),
      fontFamily: 'PlayfairDisplay_700Bold',
      color: theme.text,
      letterSpacing: 1.2,
    },
    avatarPlaceholderCaption: {
      marginTop: 4,
      fontSize: 10,
      lineHeight: 13,
      textAlign: 'center',
      color: theme.textMuted,
      fontFamily: 'Manrope_500Medium',
    },
    editAvatarButton: {
      position: 'absolute',
      bottom: 0,
      right: 6,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.tint,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: theme.background,
    },
    inputContainer: {
      marginBottom: responsive.space(16, { min: 13, max: 18 }),
    },
    inputLabel: {
      fontSize: responsive.font(13, { min: 12, max: 14 }),
      fontWeight: '600',
      color: withAlpha(theme.text, isDark ? 0.72 : 0.58),
      marginBottom: 8,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: responsive.space(12, { min: 10, max: 14 }),
      paddingVertical: responsive.space(10, { min: 8, max: 12 }),
    },
    toggleTextCol: {
      flex: 1,
    },
    toggleLabel: {
      fontSize: responsive.font(14, { min: 13, max: 15 }),
      fontWeight: '600',
      color: theme.text,
    },
    toggleSub: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 16,
      color: theme.textMuted,
    },
    togglePill: {
      minWidth: 64,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.background, isDark ? 0.75 : 0.9),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.22 : 0.14),
    },
    togglePillActive: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.24 : 0.16),
      borderColor: withAlpha(theme.tint, isDark ? 0.5 : 0.38),
    },
    togglePillDisabled: {
      opacity: 0.6,
    },
    toggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textMuted,
      letterSpacing: 0.2,
    },
    toggleTextActive: {
      color: theme.tint,
    },
    toggleTextDisabled: {
      color: theme.textMuted,
    },
    toggleHelper: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 16,
      color: theme.textMuted,
    },
    textInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      minHeight: 52,
      fontSize: 16,
      color: theme.text,
      backgroundColor: withAlpha(theme.background, isDark ? 0.7 : 0.95),
    },
    textArea: {
      height: 100,
      textAlignVertical: 'top',
    },
    characterCount: {
      fontSize: 12,
      color: theme.textMuted,
      textAlign: 'right',
      marginTop: 4,
    },
    row: {
      flexDirection: 'row',
    },
    optionChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    optionChip: {
      minWidth: 92,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      backgroundColor: withAlpha(theme.background, isDark ? 0.7 : 0.95),
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionChipSelected: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.22 : 0.14),
      borderColor: withAlpha(theme.tint, isDark ? 0.46 : 0.32),
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.22 : 0.12,
      shadowRadius: 16,
      elevation: 4,
    },
    optionChipText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.textMuted,
    },
    optionChipTextSelected: {
      color: theme.tint,
    },
    addPhotoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: withAlpha(theme.background, isDark ? 0.7 : 0.95),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    },
    addPhotoText: {
      fontSize: 14,
      marginLeft: 4,
      color: theme.text,
    },
    photoHint: {
      fontSize: 12,
      color: theme.textMuted,
      marginBottom: 16,
    },
    videoGuidanceCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.18),
      marginBottom: 14,
    },
    videoGuidanceText: {
      flex: 1,
      color: theme.text,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: 'Manrope_500Medium',
    },
    photosGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    photoContainer: {
      position: 'relative',
      width: 80,
      height: 100,
      borderRadius: 8,
      overflow: 'hidden',
    },
    photo: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    photoFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.4 : 0.12),
    },
    videoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: withAlpha(theme.background, isDark ? 0.7 : 0.95),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    videoThumb: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: withAlpha(theme.background, isDark ? 0.24 : 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    videoPreview: {
      width: '100%',
      height: '100%',
    },
    videoMeta: { marginLeft: 12, flex: 1 },
    videoTitle: { color: theme.text, fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
    videoSub: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
    videoRemove: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.background, isDark ? 0.24 : 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoEmpty: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      backgroundColor: withAlpha(theme.background, isDark ? 0.7 : 0.95),
    },
    videoEmptyText: { marginLeft: 8, color: theme.textMuted, fontSize: 13 },
    removePhotoButton: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: withAlpha(theme.background, isDark ? 0.7 : 0.45),
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyPhotoSlot: {
      width: 80,
      height: 100,
      borderRadius: 8,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 2,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
    },
    uploadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: withAlpha(theme.background, isDark ? 0.8 : 0.5),
      justifyContent: 'center',
      alignItems: 'center',
    },
    uploadingContainer: {
      backgroundColor: theme.background,
      paddingHorizontal: responsive.space(24, { min: 20, max: 28 }),
      paddingVertical: responsive.space(20, { min: 16, max: 22 }),
      borderRadius: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
    },
    uploadingText: {
      fontSize: responsive.font(16, { min: 15, max: 17 }),
      color: theme.text,
      marginTop: 12,
    },
    
    // Picker Styles
    pickerContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: pageGutter,
      paddingVertical: headerPaddingY,
      backgroundColor: theme.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
    },
    pickerCancel: {
      fontSize: responsive.font(16, { min: 15, max: 17 }),
      color: theme.textMuted,
    },
    pickerTitle: {
      fontSize: responsive.font(18, { min: 17, max: 20 }),
      fontWeight: '600',
      color: theme.text,
    },
    pickerList: {
      flex: 1,
    },
    pickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: pageGutter,
      paddingVertical: responsive.space(16, { min: 14, max: 18 }),
      backgroundColor: theme.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.12 : 0.1),
    },
    pickerItemSelected: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
    },
    pickerItemText: {
      fontSize: responsive.font(16, { min: 15, max: 17 }),
      color: theme.text,
    },
    pickerItemTextSelected: {
      color: theme.tint,
      fontWeight: '600',
    },
    selectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      borderRadius: 16,
      paddingHorizontal: controlPaddingX,
      paddingVertical: controlPaddingY,
      minHeight: responsive.minTapTarget + 8,
      backgroundColor: withAlpha(theme.background, isDark ? 0.7 : 0.95),
    },
    selectButtonSelected: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.22),
    },
    disabledSelectButton: {
      opacity: 0.56,
    },
    selectButtonText: {
      fontSize: responsive.font(16, { min: 15, max: 17 }),
      color: theme.text,
    },
    selectButtonPlaceholder: {
      fontSize: responsive.font(16, { min: 15, max: 17 }),
      color: theme.textMuted,
    },
    fieldHelperText: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 16,
      color: theme.textMuted,
    },
    countryVerificationButton: {
      marginTop: 10,
      minHeight: responsive.minTapTarget,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.tint, isDark ? 0.42 : 0.28),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.07),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    countryVerificationButtonText: {
      color: theme.tint,
      fontSize: responsive.font(14, { min: 13, max: 15 }),
      fontWeight: '700',
    },
    ageMetaLabel: {
      marginBottom: 8,
      fontSize: 12,
      lineHeight: 16,
      color: theme.textMuted,
      fontWeight: '600',
    },
    countrySelectValue: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 12,
    },
    countrySelectCopy: {
      flex: 1,
    },
    countryFlagText: {
      width: 28,
      fontSize: responsive.font(18, { min: 17, max: 19 }),
      marginRight: 10,
      color: theme.text,
    },
    countryFlagPlaceholder: {
      color: theme.textMuted,
    },
    countryMetaText: {
      marginTop: 2,
      fontSize: 12,
      color: theme.textMuted,
    },
    citySelectValueWrap: {
      flex: 1,
      marginRight: 12,
    },
    citySelectMetaText: {
      marginTop: 2,
      fontSize: 12,
      color: theme.textMuted,
    },
    citySelectActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    subtleFieldNote: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 16,
      color: theme.textMuted,
    },
    countrySearchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: pageGutter,
      paddingTop: responsive.space(12, { min: 10, max: 14 }),
      paddingBottom: responsive.space(8, { min: 6, max: 10 }),
    },
    countrySearchInput: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 46,
      fontSize: 15,
      color: theme.text,
      backgroundColor: withAlpha(theme.background, isDark ? 0.7 : 0.95),
    },
    locationPickerIntro: {
      paddingHorizontal: pageGutter,
      paddingTop: responsive.space(12, { min: 10, max: 14 }),
      paddingBottom: responsive.space(8, { min: 6, max: 10 }),
    },
    locationPickerLead: {
      fontSize: responsive.font(24, { min: 22, max: 26 }),
      lineHeight: responsive.font(30, { min: 28, max: 32 }),
      fontFamily: 'PPEditorialNew_Italic',
      color: theme.text,
    },
    locationPickerSupport: {
      marginTop: 4,
      fontSize: responsive.font(14, { min: 13, max: 15 }),
      color: theme.textMuted,
    },
    locationPickerListContent: {
      paddingBottom: responsive.space(24, { min: 20, max: 28 }),
    },
    locationPickerSectionTitle: {
      paddingHorizontal: pageGutter,
      paddingTop: responsive.space(18, { min: 16, max: 22 }),
      paddingBottom: responsive.space(8, { min: 6, max: 10 }),
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: theme.textMuted,
    },
    locationPickerQuietAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: pageGutter,
      marginTop: responsive.space(14, { min: 12, max: 16 }),
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.12),
      backgroundColor: withAlpha(theme.background, isDark ? 0.75 : 0.96),
    },
    locationPickerQuietActionText: {
      fontSize: responsive.font(15, { min: 14, max: 16 }),
      color: theme.text,
      fontWeight: '600',
    },
    countryPickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 12,
    },
    countryPickerFlag: {
      width: 28,
      fontSize: responsive.font(18, { min: 17, max: 19 }),
      color: theme.text,
      marginRight: 12,
    },
    countryPickerCopy: {
      flex: 1,
    },
      countryPickerMeta: {
        marginTop: 2,
        fontSize: 12,
        color: theme.textMuted,
      },
      emptyStateWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: pageGutter,
        paddingVertical: responsive.space(28, { min: 24, max: 34 }),
      },
      emptyStateTitle: {
        fontSize: responsive.font(16, { min: 15, max: 17 }),
        fontFamily: 'Manrope_700Bold',
        color: theme.text,
        textAlign: 'center',
      },
      emptyStateSubtitle: {
        marginTop: 6,
        fontSize: responsive.font(13, { min: 12, max: 14 }),
        lineHeight: responsive.font(18, { min: 16, max: 19 }),
        color: theme.textMuted,
        textAlign: 'center',
      },
      
      // Interests styles
      interestsPreview: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: responsive.space(8, { min: 6, max: 10 }),
      marginTop: responsive.space(12, { min: 10, max: 14 }),
    },
    interestTag: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: withAlpha(theme.accent, isDark ? 0.2 : 0.12),
      borderColor: withAlpha(theme.accent, isDark ? 0.4 : 0.3),
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: responsive.space(12, { min: 10, max: 14 }),
      paddingVertical: responsive.space(6, { min: 5, max: 8 }),
    },
    interestText: {
      fontSize: responsive.font(14, { min: 13, max: 15 }),
      color: theme.text,
      fontWeight: '500',
    },
    removeInterestButton: {
      marginLeft: 6,
      padding: 2,
    },
    distanceUnitGroup: {
      gap: responsive.space(12, { min: 10, max: 14 }),
    },
    distanceUnitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: controlPaddingY,
      paddingHorizontal: responsive.space(12, { min: 10, max: 14 }),
      borderRadius: 16,
      backgroundColor: theme.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    distanceUnitOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: withAlpha(theme.text, isDark ? 0.26 : 0.16),
      alignItems: 'center',
      justifyContent: 'center',
    },
    distanceUnitOuterSelected: {
      borderColor: theme.tint,
    },
    distanceUnitInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.tint,
    },
    distanceUnitText: {
      flex: 1,
      marginLeft: 12,
    },
    distanceUnitLabel: {
      fontSize: responsive.font(16, { min: 15, max: 17 }),
      fontFamily: 'Manrope_600SemiBold',
      color: theme.text,
    },
    distanceUnitSubtitle: {
      fontSize: responsive.font(12, { min: 12, max: 13 }),
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
      marginTop: 2,
    },
    statusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: responsive.space(8, { min: 6, max: 10 }),
      paddingHorizontal: responsive.space(14, { min: 12, max: 16 }),
      paddingVertical: responsive.space(10, { min: 8, max: 12 }),
      borderRadius: 12,
      borderWidth: 1,
      marginTop: 12,
    },
    statusBannerError: {
      backgroundColor: withAlpha(theme.danger, isDark ? 0.18 : 0.12),
      borderColor: withAlpha(theme.danger, isDark ? 0.45 : 0.28),
    },
    statusBannerSuccess: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
      borderColor: withAlpha(theme.tint, isDark ? 0.45 : 0.28),
    },
    statusBannerText: {
      flex: 1,
      fontSize: responsive.font(13, { min: 12, max: 14 }),
      fontFamily: 'Manrope_500Medium',
      color: theme.text,
    },
    statusBannerTextError: {
      color: theme.danger,
    },
    statusBannerTextSuccess: {
      color: theme.tint,
    },
    statusDisplay: {
      padding: responsive.space(16, { min: 14, max: 18 }),
      backgroundColor: theme.backgroundSubtle,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statusText: {
      fontSize: responsive.font(16, { min: 15, max: 17 }),
      fontFamily: 'Archivo_600SemiBold',
      color: theme.text,
      marginBottom: 4,
    },
    statusSubtext: {
      fontSize: responsive.font(14, { min: 13, max: 15 }),
      fontFamily: 'Manrope_400Regular',
      color: theme.textMuted,
    },
  });
};
