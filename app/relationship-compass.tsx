import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePremiumState } from "@/hooks/use-premium-state";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_RELATIONSHIP_COMPASS,
  RelationshipCompass,
  applyDefaults,
  deriveCompassSummary,
  getPreviewTone,
  mapCompassIntentionToLookingFor,
  mapToDiscoveryFilters,
  type CompassFlex,
  type CompassWeight,
} from "@/lib/relationship-compass";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  FadeInDown,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const VIBES_FILTERS_KEY = "vibes_filters_v2";
const COMPASS_REFRESH_MS = 24 * 60 * 60 * 1000;
const COMPASS_NOTIFICATION_STORAGE_PREFIX = "relationship_compass_notification";

type Option = {
  id: string;
  title: string;
  body: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>["name"];
};

type CompassPreviewProfile = {
  id: string;
  user_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  photos: string[] | null;
  looking_for: string | null;
  current_country: string | null;
  current_country_code: string | null;
  city: string | null;
  location: string | null;
  region: string | null;
  religion: string | null;
  gender: string | null;
  has_children: string | null;
  wants_children: string | null;
  verification_level: number | null;
};

type PositionedPreviewProfile = CompassPreviewProfile & {
  score: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
};

const INTENTIONS: Option[] = [
  { id: "serious", title: "Serious dating", body: "Clear interest, real effort, no drifting.", icon: "compass-outline" },
  { id: "long_term", title: "Long-term relationship", body: "Build toward something steady.", icon: "infinity" },
  { id: "marriage", title: "Marriage-minded", body: "Dating with a future in view.", icon: "ring" },
  { id: "open", title: "Open to see where it goes", body: "Room for chemistry and surprise.", icon: "star-outline" },
];

const PACES: Option[] = [
  { id: "slow", title: "Slow & intentional", body: "Trust first, then momentum.", icon: "timer-sand" },
  { id: "balanced", title: "Balanced", body: "Warm conversation with real direction.", icon: "scale-balance" },
  { id: "chemistry", title: "Chemistry first", body: "Let spark lead, then clarify.", icon: "lightning-bolt-outline" },
  { id: "meet_soon", title: "Ready to meet soon", body: "If it feels right, move with pace.", icon: "calendar-heart" },
];

const GEOGRAPHY: Option[] = [
  { id: "nearby", title: "Nearby only", body: "Keep things easy to act on.", icon: "map-marker-radius-outline" },
  { id: "same_city", title: "Same city preferred", body: "A little room, still realistic.", icon: "city-variant-outline" },
  { id: "uk", title: "Open across UK", body: "Wider if the alignment is strong.", icon: "train" },
  { id: "ghana_diaspora", title: "Open to Ghana + diaspora", body: "Home, abroad, and the bridge between.", icon: "earth" },
  { id: "long_distance", title: "Open to long distance", body: "Distance can be worth it for the right person.", icon: "airplane" },
];

const PRIORITIES: { key: keyof RelationshipCompass["priorities"]; label: string; body: string }[] = [
  { key: "religion", label: "Religion", body: "Faith, values, and spiritual rhythm." },
  { key: "family", label: "Family goals", body: "Children, home, and long-term shape." },
  { key: "lifestyle", label: "Lifestyle", body: "Daily habits and social energy." },
  { key: "interests", label: "Interests", body: "Shared taste, hobbies, and curiosity." },
  { key: "education", label: "Education", body: "Learning style and ambition." },
  { key: "career", label: "Career", body: "Drive, stability, and work rhythm." },
];

const FLEXIBILITY: { key: keyof RelationshipCompass["flexibility"]; label: string; body: string }[] = [
  { key: "religion", label: "Religion", body: "Strong standards are welcome. So is room for surprise." },
  { key: "children", label: "Children", body: "Clarify where family alignment matters most." },
  { key: "verified", label: "Verified members", body: "Choose how strongly trust signals should shape discovery." },
];

const RADIUS_STEPS = [25, 50, 80, 150, 300];
const COMPASS_SIZE = 292;
const COMPASS_CENTER = COMPASS_SIZE / 2;
const AVATAR_BASE_SIZE = 36;

const withAlpha = (hex: string, alpha: number) => {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex;
  const safe = hex.replace("#", "");
  if (safe.length !== 6) return hex;
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const weightLabels: Record<CompassWeight, string> = {
  essential: "Essential",
  nice: "Nice",
  open: "Open",
};

const flexLabels: Record<CompassFlex, string> = {
  must: "Must",
  prefer: "Prefer",
  open: "Open",
};

const stableHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1000003;
  }
  return hash;
};

const getCompassReminderStorageKey = (userId: string) =>
  `${COMPASS_NOTIFICATION_STORAGE_PREFIX}:${userId}`;

const cancelRelationshipCompassReminder = async (userId?: string | null) => {
  if (!userId) return;
  try {
    const storageKey = getCompassReminderStorageKey(userId);
    const existingId = await AsyncStorage.getItem(storageKey);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
      await AsyncStorage.removeItem(storageKey);
    }
  } catch {
    // best-effort only
  }
};

const getPreviewAvatar = (profile: CompassPreviewProfile) =>
  profile.avatar_url || profile.photos?.find((photo) => typeof photo === "string" && photo.trim()) || null;

const getPreviewInitials = (name?: string | null) => {
  const parts = String(name || "B")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "B";
};

const hasSavedCompassValue = (value: unknown) =>
  Boolean(value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0);

const getCompassUpdatedAt = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const raw = (value as { updatedAt?: unknown }).updatedAt;
  return typeof raw === "string" && raw.trim() ? raw : null;
};

const getCompassProfileLimit = (plan: string | null | undefined) => {
  if (plan === "GOLD") return 9;
  if (plan === "SILVER") return 6;
  return 3;
};

const getOppositeGender = (gender: unknown) => {
  const normalized = String(gender || "").trim().toUpperCase();
  if (normalized === "MALE") return "FEMALE";
  if (normalized === "FEMALE") return "MALE";
  return null;
};

const textIncludes = (value: string | null | undefined, needles: string[]) => {
  const normalized = String(value || "").toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
};

const scorePreviewProfile = (
  candidate: CompassPreviewProfile,
  compass: RelationshipCompass,
  viewerProfile: any,
) => {
  let score = 0.42 + (stableHash(candidate.id) % 18) / 100;

  if (compass.intention === "marriage" && textIncludes(candidate.looking_for, ["marriage", "serious", "long"])) score += 0.18;
  if (compass.intention === "long_term" && textIncludes(candidate.looking_for, ["long", "serious", "partner"])) score += 0.16;
  if (compass.intention === "serious" && textIncludes(candidate.looking_for, ["serious", "long", "marriage"])) score += 0.14;
  if (compass.intention === "open" && textIncludes(candidate.looking_for, ["see", "casual", "friend", "open"])) score += 0.08;

  if (compass.pace === "slow" && textIncludes(candidate.looking_for, ["serious", "long", "marriage"])) score += 0.08;
  if (compass.pace === "chemistry" || compass.pace === "meet_soon") score += (stableHash(candidate.id + compass.pace) % 10) / 100;

  const viewerCity = String(viewerProfile?.city || viewerProfile?.location || "").toLowerCase();
  const candidateCity = String(candidate.city || candidate.location || "").toLowerCase();
  const viewerCountry = String(viewerProfile?.current_country_code || viewerProfile?.current_country || "").toLowerCase();
  const candidateCountry = String(candidate.current_country_code || candidate.current_country || "").toLowerCase();
  if ((compass.geography.mode === "nearby" || compass.geography.mode === "same_city") && viewerCity && candidateCity.includes(viewerCity.split(",")[0] ?? "")) {
    score += 0.16;
  }
  if (compass.geography.mode === "uk" && candidateCountry.includes("gb")) score += 0.16;
  if (compass.geography.mode === "ghana_diaspora" && (candidateCountry.includes("gh") || candidateCountry === viewerCountry)) score += 0.15;
  if (compass.geography.mode === "long_distance") score += 0.08;
  if (compass.geography.city?.trim() && candidateCity.includes(compass.geography.city.trim().toLowerCase())) score += 0.2;

  const sameReligion = viewerProfile?.religion && candidate.religion === viewerProfile.religion;
  if (sameReligion && compass.priorities.religion !== "open") score += compass.priorities.religion === "essential" ? 0.16 : 0.08;
  if (!sameReligion && compass.flexibility.religion === "must") score -= 0.22;

  const sameChildrenDirection =
    viewerProfile?.wants_children &&
    candidate.wants_children &&
    String(viewerProfile.wants_children).toLowerCase() === String(candidate.wants_children).toLowerCase();
  if (sameChildrenDirection && compass.priorities.family !== "open") score += compass.priorities.family === "essential" ? 0.12 : 0.06;
  if (!sameChildrenDirection && compass.flexibility.children === "must") score -= 0.16;

  const verified = (candidate.verification_level ?? 0) > 0;
  if (verified && compass.flexibility.verified !== "open") score += compass.flexibility.verified === "must" ? 0.16 : 0.08;
  if (!verified && compass.flexibility.verified === "must") score -= 0.26;

  return Math.max(0.08, Math.min(0.98, score));
};

const positionPreviewProfiles = (
  candidates: CompassPreviewProfile[],
  compass: RelationshipCompass,
  viewerProfile: any,
  limit: number,
): PositionedPreviewProfile[] => {
  const directionOffset = ((stableHash(`${compass.intention}:${compass.pace}:${compass.geography.mode}`) % 360) * Math.PI) / 180;
  const scoredCandidates = candidates
    .map((candidate) => ({
      candidate,
      score: scorePreviewProfile(candidate, compass, viewerProfile),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(12, limit)));

  const count = Math.max(scoredCandidates.length, 1);
  return scoredCandidates.map(({ candidate, score }, index) => {
    const orbit = index < 4 ? 58 : index < 8 ? 88 : 112;
    const angleJitter = (((stableHash(`${candidate.id}:${compass.pace}`) % 18) - 9) * Math.PI) / 180;
    const angle = (index / count) * Math.PI * 2 + directionOffset + angleJitter;
    const radius = Math.max(50, orbit - score * 8 + ((stableHash(candidate.id) % 9) - 4));
    const size = AVATAR_BASE_SIZE + Math.round(score * 10);
    return {
      ...candidate,
      score,
      size,
      opacity: 0.5 + score * 0.48,
      x: COMPASS_CENTER + Math.cos(angle) * radius - size / 2,
      y: COMPASS_CENTER + Math.sin(angle) * radius - size / 2,
    };
  });
};

function CompassChoiceCard({
  option,
  selected,
  onPress,
  isDark,
  styles,
}: {
  option: Option;
  selected: boolean;
  onPress: () => void;
  isDark: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const scale = useSharedValue(selected ? 1 : 0.98);
  useEffect(() => {
    scale.value = withTiming(selected ? 1 : 0.98, { duration: 180 });
  }, [scale, selected]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle} layout={Layout.springify().damping(18).stiffness(160)}>
      <Pressable
        onPress={onPress}
        style={[styles.choiceCard, selected && styles.choiceCardSelected]}
      >
        <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}>
          <MaterialCommunityIcons name={option.icon} size={18} color={selected ? "#EFFFFB" : isDark ? "#8CE4DA" : "#0F766E"} />
        </View>
        <View style={styles.choiceCopy}>
          <Text style={[styles.choiceTitle, selected && styles.choiceTitleSelected]}>{option.title}</Text>
          <Text style={styles.choiceBody}>{option.body}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function SegmentedSelector<T extends string>({
  value,
  options,
  onChange,
  selectedColor,
  styles,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
  selectedColor: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.segmented}>
      {(Object.keys(options) as T[]).map((key) => {
        const selected = value === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected, selected && { color: selectedColor }]}>{options[key]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CompassAvatar({
  profile,
  onPress,
  isDark,
  styles,
}: {
  profile: PositionedPreviewProfile;
  onPress: () => void;
  isDark: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const innerSize = Math.max(24, profile.size - 4);
  const avatarUri = imageFailed ? null : getPreviewAvatar(profile);
  const alignmentGlow = Math.max(0, Math.min(1, (profile.score - 0.68) / 0.24));
  const tokenColors = isDark
    ? ["#0F766E", "#155E75", "#7C3AED", "#14532D", "#7C2D12", "#9F1239"]
    : ["#0F766E", "#155E75", "#92400E", "#7C3AED", "#166534", "#9F1239"];
  const tokenColor = tokenColors[stableHash(profile.id) % tokenColors.length] ?? "#0F766E";
  const x = useSharedValue(profile.x);
  const y = useSharedValue(profile.y);
  const scale = useSharedValue(0.92 + profile.score * 0.18);
  const opacity = useSharedValue(profile.opacity);

  useEffect(() => {
    x.value = withTiming(profile.x, { duration: 520 });
    y.value = withTiming(profile.y, { duration: 520 });
    scale.value = withTiming(0.92 + profile.score * 0.18, { duration: 520 });
    opacity.value = withTiming(profile.opacity, { duration: 420 });
  }, [opacity, profile.opacity, profile.score, profile.x, profile.y, scale, x, y]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ] as any,
  }));

  return (
    <Animated.View
      style={[
        styles.compassAvatarShell,
        {
          width: profile.size,
          height: profile.size,
          borderRadius: profile.size / 2,
          borderColor:
            alignmentGlow > 0.1
              ? `rgba(245,211,107,${0.38 + alignmentGlow * 0.5})`
              : "rgba(0,128,128,0.28)",
          backgroundColor:
            alignmentGlow > 0.1
              ? `rgba(245,211,107,${0.2 + alignmentGlow * 0.18})`
              : "rgba(255,255,255,0.9)",
          shadowColor: alignmentGlow > 0.1 ? "#F5D36B" : "#0F766E",
          shadowOpacity: alignmentGlow > 0.1 ? 0.28 + alignmentGlow * 0.18 : 0.22,
          shadowRadius: alignmentGlow > 0.1 ? 12 + alignmentGlow * 8 : 10,
        },
        animatedStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={[
          styles.compassAvatarPressable,
          { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
        ]}
      >
        <View
          style={[
            styles.compassAvatarMask,
            { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
          ]}
        >
          {avatarUri ? (
          <Image
              source={{ uri: avatarUri }}
              style={[
                styles.compassAvatarImage,
                { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
              ]}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <LinearGradient
              colors={[tokenColor, "#102C2B"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.compassAvatarToken,
                { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
              ]}
            >
              <Text
                style={[
                  styles.compassAvatarInitials,
                  { fontSize: innerSize > 34 ? 12 : 10 },
                ]}
              >
                {getPreviewInitials(profile.full_name)}
              </Text>
            </LinearGradient>
          )}
        </View>
      </Pressable>
      {alignmentGlow > 0.55 ? <View pointerEvents="none" style={styles.compassAvatarSignalDot} /> : null}
    </Animated.View>
  );
}

function CompassPreview({
  profiles,
  loading,
  active,
  emptyTitle,
  emptyBody,
  onOpenProfile,
  isDark,
  styles,
}: {
  profiles: PositionedPreviewProfile[];
  loading: boolean;
  active: boolean;
  emptyTitle: string;
  emptyBody: string;
  onOpenProfile: (profileId: string) => void;
  isDark: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.compassPreviewWrap}>
      <View style={styles.compassRingOuter} />
      <View style={styles.compassRingMiddle} />
      <View style={styles.compassRingInner} />
      <View style={styles.compassNeedleVertical} />
      <View style={styles.compassNeedleHorizontal} />
      <View style={styles.compassCenter}>
        <MaterialCommunityIcons name="compass" size={22} color="#EFFFFB" />
      </View>
      {active && profiles.length > 0 ? (
        profiles.map((profile) => (
          <CompassAvatar
            key={profile.id}
            profile={profile}
            isDark={isDark}
            styles={styles}
            onPress={() => onOpenProfile(profile.id)}
          />
        ))
      ) : (
        <View style={styles.compassEmptyState}>
          <MaterialCommunityIcons name="heart-outline" size={18} color="#0F766E" />
          <Text style={styles.compassEmptyTitle}>{emptyTitle}</Text>
          <Text style={styles.compassEmptyBody}>{emptyBody}</Text>
        </View>
      )}
      {loading && active ? (
        <View style={styles.compassLoading}>
          <ActivityIndicator size="small" color="#0F766E" />
        </View>
      ) : null}
    </View>
  );
}

export default function RelationshipCompassScreen() {
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? "light") === "dark";
  const theme = Colors[colorScheme ?? "light"];
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, refreshProfile } = useAuth();
  const { currentPlan } = usePremiumState();
  const storedCompass = (profile as any)?.relationship_compass;
  const viewerTargetGender = useMemo(() => getOppositeGender((profile as any)?.gender), [profile]);
  const compassProfileLimit = useMemo(() => getCompassProfileLimit(currentPlan), [currentPlan]);
  const [compass, setCompass] = useState<RelationshipCompass>(() =>
    applyDefaults(storedCompass),
  );
  const [previewProfiles, setPreviewProfiles] = useState<CompassPreviewProfile[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);
  const [hasActivatedCompass, setHasActivatedCompass] = useState(() => hasSavedCompassValue(storedCompass));
  const [savedAt, setSavedAt] = useState<string | null>(() => getCompassUpdatedAt(storedCompass));
  const summaryChips = useMemo(() => deriveCompassSummary(compass).split(" • ").filter(Boolean).slice(0, 4), [compass]);
  const previewTone = useMemo(() => getPreviewTone(compass), [compass]);
  const discoveryPreview = useMemo(() => mapToDiscoveryFilters(compass), [compass]);
  const refreshRemainingMs = savedAt ? new Date(savedAt).getTime() + COMPASS_REFRESH_MS - Date.now() : 0;
  const canRefreshCompass = hasActivatedCompass && (!savedAt || refreshRemainingMs <= 0);
  const refreshLabel = canRefreshCompass
    ? "Refresh compass"
    : `Refresh in ${Math.max(1, Math.ceil(refreshRemainingMs / (60 * 60 * 1000)))}h`;
  const compassEmptyTitle = !hasActivatedCompass
    ? "Love Compass appears here"
    : viewerTargetGender
      ? "No Compass faces yet"
      : "Complete your dating direction";
  const compassEmptyBody = !hasActivatedCompass
    ? "Choose your lens, then find your direction."
    : viewerTargetGender
      ? "Refresh later or loosen your lens to open the field."
      : "Add your gender on your profile so Betweener does not guess your dating pool.";
  const upgradeCompassCopy =
    hasActivatedCompass && currentPlan === "SILVER"
      ? "Gold expands your Love Compass to 9 curated profiles daily."
      : hasActivatedCompass && currentPlan === "FREE"
        ? "Silver unlocks 6 curated profiles. Gold expands it to 9."
        : null;
  const positionedProfiles = useMemo(
    () => (hasActivatedCompass ? positionPreviewProfiles(previewProfiles, compass, profile, compassProfileLimit) : []),
    [compass, compassProfileLimit, hasActivatedCompass, previewProfiles, profile],
  );

  useEffect(() => {
    const nextSaved = hasSavedCompassValue(storedCompass);
    setHasActivatedCompass(nextSaved);
    setSavedAt(getCompassUpdatedAt(storedCompass));
    setCompass(applyDefaults(storedCompass));
  }, [storedCompass]);

  useEffect(() => {
    const viewerUserId = profile?.user_id ? String(profile.user_id) : null;
    void cancelRelationshipCompassReminder(viewerUserId);
  }, [profile?.user_id]);

  useEffect(() => {
    if (!profile?.id) return;
    if (!viewerTargetGender) {
      setPreviewProfiles([]);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const loadPreviewProfiles = async () => {
      const [matchesRes, profilesRes] = await Promise.all([
        supabase
          .from("matches")
          .select("user1_id,user2_id,status")
          .in("status", ["PENDING", "ACCEPTED"])
          .or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`),
        supabase
          .from("profiles")
          .select("id,user_id,full_name,avatar_url,photos,looking_for,current_country,current_country_code,city,location,region,religion,gender,has_children,wants_children,verification_level")
          .neq("id", profile.id)
          .neq("user_id", profile.user_id)
          .eq("gender", viewerTargetGender)
          .eq("discoverable_in_vibes", true)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("last_active", { ascending: false, nullsFirst: false })
          .limit(24),
      ]);

      if (cancelled) return;
      setPreviewLoading(false);
      if (profilesRes.error || !profilesRes.data) return;

      const excludedProfileIds = new Set<string>();
      (matchesRes.data || []).forEach((row: any) => {
        const left = row?.user1_id ? String(row.user1_id) : null;
        const right = row?.user2_id ? String(row.user2_id) : null;
        if (!left || !right) return;
        const other = left === String(profile.id) ? right : right === String(profile.id) ? left : null;
        if (other) excludedProfileIds.add(other);
      });

      const nextProfiles = (profilesRes.data as CompassPreviewProfile[]).filter(
        (candidate) => !excludedProfileIds.has(String(candidate.id)),
      );
      setPreviewProfiles(nextProfiles);
    };
    void loadPreviewProfiles();
    return () => {
      cancelled = true;
    };
  }, [previewRefreshNonce, profile?.id, profile?.user_id, viewerTargetGender]);

  useEffect(() => {
    if (!celebrating) return;
    const timeout = setTimeout(() => setCelebrating(false), 2200);
    return () => clearTimeout(timeout);
  }, [celebrating]);

  const updateCompass = (updater: (current: RelationshipCompass) => RelationshipCompass) => {
    setCompass((current) => updater(current));
    Haptics.selectionAsync().catch(() => {});
  };

  const saveCompass = async () => {
    setSaving(true);
    const compassFilters = mapToDiscoveryFilters(compass);
    const nowIso = new Date().toISOString();
    const nextCompass = { ...compass, updatedAt: nowIso };
    const { error } = await updateProfile({
      relationship_compass: nextCompass as any,
      looking_for: mapCompassIntentionToLookingFor(compass.intention),
    } as any);
    setSaving(false);
    if (error) {
      Alert.alert("Relationship Compass", "Unable to update your dating lens right now.");
      return;
    }
    if (profile?.id) {
      const vibesFilters = {
        verifiedOnly: Boolean(compassFilters.verifiedOnly),
        hasVideoOnly: false,
        activeOnly: false,
        distanceFilterKm: typeof compassFilters.distanceFilterKm === "number" ? compassFilters.distanceFilterKm : null,
        minAge: 18,
        maxAge: 60,
        religionFilter: null,
        minVibeScore: null,
        minSharedInterests: typeof compassFilters.minSharedInterests === "number" ? compassFilters.minSharedInterests : 0,
        locationQuery: typeof compassFilters.locationQuery === "string" ? compassFilters.locationQuery : "",
      };
      await AsyncStorage.setItem(`${VIBES_FILTERS_KEY}:${profile.id}`, JSON.stringify(vibesFilters)).catch(() => {});
    }
    await refreshProfile();
    setCompass(nextCompass);
    setHasActivatedCompass(true);
    setSavedAt(nowIso);
    setCelebrating(true);
    setPreviewRefreshNonce((current) => current + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const resetCompass = () => {
    Haptics.selectionAsync().catch(() => {});
    setCompass(DEFAULT_RELATIONSHIP_COMPASS);
    setExpanded(false);
  };

  const refreshCompass = async () => {
    if (!hasActivatedCompass) return;
    if (!canRefreshCompass) {
      Haptics.selectionAsync().catch(() => {});
      Alert.alert("Love Compass", `${refreshLabel}. Your current direction is still fresh.`);
      return;
    }
    const nowIso = new Date().toISOString();
    const nextCompass = { ...compass, updatedAt: nowIso };
    const { error } = await updateProfile({ relationship_compass: nextCompass as any } as any);
    if (error) {
      Alert.alert("Love Compass", "Unable to refresh your compass right now.");
      return;
    }
    setCompass(nextCompass);
    setSavedAt(nowIso);
    setPreviewRefreshNonce((current) => current + 1);
    await refreshProfile();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const openPreviewProfile = (profileId: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: "/profile-view", params: { profileId } });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 212 + Math.max(insets.bottom, 10) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={styles.topLabel}>Betweener lens</Text>
        </View>

        <Animated.View entering={FadeInDown.duration(420)} style={styles.hero}>
          <LinearGradient
            colors={isDark ? ["#123535", "#172422", "#2D2410"] : ["#F7EFE4", "#E8F8F5", "#FFF6D8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <Text style={styles.heroEyebrow}>Signature feature</Text>
            <Text style={styles.heroTitle}>Relationship Compass</Text>
            <Text style={styles.heroSubtitle}>
              Shape the kind of connection you want Betweener to bring closer without swiping through noise.
            </Text>
            <CompassPreview
              profiles={positionedProfiles}
              loading={previewLoading}
              active={hasActivatedCompass}
              emptyTitle={compassEmptyTitle}
              emptyBody={compassEmptyBody}
              isDark={isDark}
              styles={styles}
              onOpenProfile={openPreviewProfile}
            />
            {celebrating ? (
              <Animated.View entering={FadeInDown.duration(260)} style={styles.celebrationCard}>
                <MaterialCommunityIcons name="star-four-points-outline" size={18} color="#F5D36B" />
                <View style={styles.celebrationCopy}>
                  <Text style={styles.celebrationTitle}>Direction found</Text>
                  <Text style={styles.celebrationBody}>Your Love Compass is ready. Tap a face for details and make the move.</Text>
                </View>
              </Animated.View>
            ) : null}
            <Animated.View layout={Layout.springify().damping(18)} style={styles.summaryChipRow}>
              {summaryChips.map((chip, index) => (
                <View key={`${chip}-${index}`} style={[styles.summaryChip, index === 0 && styles.summaryChipAccent]}>
                  {index === 0 ? <MaterialCommunityIcons name="compass-outline" size={14} color={theme.tint} /> : null}
                  <Text style={styles.summaryChipText}>{chip}</Text>
                </View>
              ))}
            </Animated.View>
            {hasActivatedCompass ? (
              <View style={styles.compassGuideRow}>
                <View style={styles.compassGuideCopy}>
                  <Text style={styles.compassGuideTitle}>Tap for details and make the move.</Text>
                  <Text style={styles.compassGuideBody}>
                    {compassProfileLimit} curated profiles per day. Refreshes every 24 hours.
                  </Text>
                </View>
                <Pressable onPress={refreshCompass} style={[styles.refreshButton, !canRefreshCompass && styles.refreshButtonDisabled]}>
                  <Text style={[styles.refreshButtonText, !canRefreshCompass && styles.refreshButtonTextDisabled]}>{refreshLabel}</Text>
                </Pressable>
              </View>
            ) : null}
            {upgradeCompassCopy ? (
              <Pressable
                onPress={() => router.push("/premium-plans")}
                style={styles.compassUpgradeCard}
              >
                <MaterialCommunityIcons name="crown-outline" size={16} color="#946A08" />
                <Text style={styles.compassUpgradeText}>{upgradeCompassCopy}</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#946A08" />
              </Pressable>
            ) : null}
          </LinearGradient>
        </Animated.View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionKicker}>Intention</Text>
          <Text style={styles.sectionTitle}>What are you open to?</Text>
          <Text style={styles.sectionMicrocopy}>
            Give Betweener a clear sense of where your heart is leaning.
          </Text>
          <View style={styles.choiceGrid}>
            {INTENTIONS.map((option) => (
              <CompassChoiceCard
                key={option.id}
                option={option}
                selected={compass.intention === option.id}
                isDark={isDark}
                styles={styles}
                onPress={() => updateCompass((current) => ({ ...current, intention: option.id }))}
              />
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionKicker}>Your pace</Text>
          <Text style={styles.sectionTitle}>How do you like things to unfold?</Text>
          <Text style={styles.sectionMicrocopy}>
            Some people want sparks fast. Others want something steady.
          </Text>
          <View style={styles.choiceGrid}>
            {PACES.map((option) => (
              <CompassChoiceCard
                key={option.id}
                option={option}
                selected={compass.pace === option.id}
                isDark={isDark}
                styles={styles}
                onPress={() => updateCompass((current) => ({ ...current, pace: option.id }))}
              />
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionKicker}>Geography</Text>
          <Text style={styles.sectionTitle}>How wide should your dating world feel?</Text>
          <Text style={styles.sectionMicrocopy}>
            Choose what feels realistic, exciting, or worth exploring.
          </Text>
          <View style={styles.choiceGrid}>
            {GEOGRAPHY.map((option) => (
              <CompassChoiceCard
                key={option.id}
                option={option}
                selected={compass.geography.mode === option.id}
                isDark={isDark}
                styles={styles}
                onPress={() =>
                  updateCompass((current) => ({
                    ...current,
                    geography: { ...current.geography, mode: option.id },
                  }))
                }
              />
            ))}
          </View>
          <View style={styles.radiusCard}>
            <Text style={styles.inlineLabel}>Distance comfort</Text>
            <View style={styles.radiusRow}>
              {RADIUS_STEPS.map((radius) => {
                const selected = compass.geography.radius === radius;
                return (
                  <Pressable
                    key={radius}
                    style={[styles.radiusPill, selected && styles.radiusPillSelected]}
                    onPress={() =>
                      updateCompass((current) => ({
                        ...current,
                        geography: { ...current.geography, radius },
                      }))
                    }
                  >
                    <Text style={[styles.radiusText, selected && styles.radiusTextSelected]}>{radius}km</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={compass.geography.city}
              onChangeText={(city) => setCompass((current) => ({ ...current, geography: { ...current.geography, city } }))}
              placeholder="Optional city that feels close to your real life"
              placeholderTextColor={theme.textMuted}
              style={styles.cityInput}
            />
          </View>
        </View>

        <Pressable
          onPress={() => {
            setExpanded((current) => !current);
            Haptics.selectionAsync().catch(() => {});
          }}
          style={styles.refineButton}
        >
          <Text style={styles.refineText}>{expanded ? "Keep it simple" : "Refine deeper"}</Text>
          <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#EFFFFB" />
        </Pressable>

        {expanded ? (
          <Animated.View entering={FadeInDown.duration(360)} layout={Layout.springify().damping(18)} style={styles.expandedStack}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionKicker}>What matters most</Text>
              <Text style={styles.sectionTitle}>Weight the signals quietly.</Text>
              <Text style={styles.sectionMicrocopy}>
                This is not a checklist. It tells Betweener where alignment matters.
              </Text>
              {PRIORITIES.map((item) => (
                <View key={item.key} style={styles.weightRow}>
                  <View style={styles.weightCopy}>
                    <Text style={styles.weightLabel}>{item.label}</Text>
                    <Text style={styles.weightBody}>{item.body}</Text>
                  </View>
                  <SegmentedSelector
                    value={compass.priorities[item.key]}
                    options={weightLabels}
                    selectedColor={theme.tint}
                    styles={styles}
                    onChange={(value) =>
                      updateCompass((current) => ({
                        ...current,
                        priorities: { ...current.priorities, [item.key]: value },
                      }))
                    }
                  />
                </View>
              ))}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionKicker}>Flexibility</Text>
              <Text style={styles.sectionTitle}>Set standards without closing the room.</Text>
              <Text style={styles.sectionMicrocopy}>
                Strong standards are welcome. So is room for surprise.
              </Text>
              {FLEXIBILITY.map((item) => (
                <View key={item.key} style={styles.weightRow}>
                  <View style={styles.weightCopy}>
                    <Text style={styles.weightLabel}>{item.label}</Text>
                    <Text style={styles.weightBody}>{item.body}</Text>
                  </View>
                  <SegmentedSelector
                    value={compass.flexibility[item.key]}
                    options={flexLabels}
                    selectedColor={theme.tint}
                    styles={styles}
                    onChange={(value) =>
                      updateCompass((current) => ({
                        ...current,
                        flexibility: { ...current.flexibility, [item.key]: value },
                      }))
                    }
                  />
                </View>
              ))}
            </View>
          </Animated.View>
        ) : null}

        <View style={styles.previewCard}>
          <Text style={styles.previewEyebrow}>Lens preview</Text>
          <Text style={styles.previewTitle}>{previewTone}</Text>
          <Text style={styles.previewBody}>
            {hasActivatedCompass
              ? "This field now reflects your lens. Tap a face when the direction feels right."
              : Object.keys(discoveryPreview).length > 0
                ? "Save your lens to reveal a small field of people aligned with this direction."
                : "Save your lens to turn this from intention into a living Love Compass."}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { bottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.footerCopy}>
          <Text style={styles.footerTitle}>{hasActivatedCompass ? "Your direction is set for today" : previewTone}</Text>
          <Text style={styles.footerBody}>
            {hasActivatedCompass
              ? "Reset gently or refine the lens before the next field refresh."
              : "Expect fewer, stronger matches when your lens gets tighter."}
          </Text>
        </View>
        <View style={styles.footerActions}>
          <Pressable onPress={resetCompass} style={styles.secondaryButton} disabled={saving}>
            <Text style={styles.secondaryText}>Reset gently</Text>
          </Pressable>
          <Pressable onPress={saveCompass} style={styles.primaryButton} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#EFFFFB" />
            ) : (
              <Text style={styles.primaryText}>{hasActivatedCompass ? "Update my lens" : "Find my direction"}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 190,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 6,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: isDark ? withAlpha("#ffffff", 0.08) : withAlpha("#ffffff", 0.42),
    borderWidth: 1,
    borderColor: isDark ? withAlpha("#ffffff", 0.08) : withAlpha(theme.text, 0.06),
  },
  topLabel: {
    color: theme.textMuted,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    fontSize: 11,
  },
  hero: {
    borderRadius: 32,
    overflow: "hidden",
    marginBottom: 18,
  },
  heroGradient: {
    padding: 22,
    minHeight: 472,
    justifyContent: "flex-end",
    borderWidth: 1,
    borderColor: isDark ? withAlpha(theme.secondary, 0.18) : withAlpha(theme.tint, 0.18),
  },
  heroEyebrow: {
    color: isDark ? "#F5D36B" : "#946A08",
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontSize: 11,
    marginBottom: 10,
  },
  heroTitle: {
    color: theme.text,
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 40,
    lineHeight: 45,
  },
  heroSubtitle: {
    color: theme.textMuted,
    fontFamily: "Manrope_500Medium",
    lineHeight: 21,
    fontSize: 14,
    marginTop: 10,
    marginBottom: 18,
  },
  summaryChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: isDark ? withAlpha(theme.background, 0.58) : withAlpha("#ffffff", 0.72),
    borderWidth: 1,
    borderColor: isDark ? withAlpha(theme.secondary, 0.24) : withAlpha(theme.tint, 0.18),
  },
  summaryChipAccent: {
    backgroundColor: isDark ? withAlpha(theme.tint, 0.16) : withAlpha(theme.tint, 0.1),
    borderColor: isDark ? withAlpha(theme.secondary, 0.34) : withAlpha(theme.tint, 0.24),
  },
  summaryChipText: {
    flexShrink: 1,
    color: isDark ? theme.text : "#173231",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 12,
  },
  compassPreviewWrap: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignSelf: "center",
    position: "relative",
    overflow: "hidden",
    marginBottom: 18,
  },
  compassRingOuter: {
    position: "absolute",
    left: 8,
    top: 8,
    right: 8,
    bottom: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: isDark ? withAlpha(theme.secondary, 0.2) : withAlpha(theme.tint, 0.18),
    backgroundColor: isDark ? withAlpha("#ffffff", 0.06) : withAlpha("#ffffff", 0.18),
  },
  compassRingMiddle: {
    position: "absolute",
    left: 44,
    top: 44,
    right: 44,
    bottom: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: isDark ? withAlpha(theme.secondary, 0.26) : withAlpha(theme.tint, 0.2),
  },
  compassRingInner: {
    position: "absolute",
    left: 94,
    top: 94,
    right: 94,
    bottom: 94,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(234,179,8,0.35)",
    backgroundColor: isDark ? withAlpha("#F5D36B", 0.08) : "rgba(255,246,216,0.22)",
  },
  compassNeedleVertical: {
    position: "absolute",
    left: COMPASS_CENTER - 0.5,
    top: 18,
    bottom: 18,
    width: 1,
    backgroundColor: isDark ? withAlpha(theme.secondary, 0.2) : withAlpha("#0F766E", 0.18),
  },
  compassNeedleHorizontal: {
    position: "absolute",
    top: COMPASS_CENTER - 0.5,
    left: 18,
    right: 18,
    height: 1,
    backgroundColor: isDark ? withAlpha(theme.secondary, 0.2) : withAlpha("#0F766E", 0.18),
  },
  compassCenter: {
    position: "absolute",
    left: COMPASS_CENTER - 22,
    top: COMPASS_CENTER - 22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.86)",
    zIndex: 9,
  },
  compassEmptyState: {
    position: "absolute",
    left: 56,
    right: 56,
    top: COMPASS_CENTER - 44,
    minHeight: 88,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: isDark ? withAlpha(theme.background, 0.76) : withAlpha("#ffffff", 0.72),
    borderWidth: 1,
    borderColor: isDark ? withAlpha(theme.secondary, 0.24) : withAlpha(theme.tint, 0.18),
    zIndex: 10,
  },
  compassEmptyTitle: {
    color: theme.text,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  compassEmptyBody: {
    color: theme.textMuted,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
    textAlign: "center",
  },
  compassAvatarShell: {
    position: "absolute",
    left: 0,
    top: 0,
    padding: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(0,128,128,0.28)",
    shadowColor: "#0F766E",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    zIndex: 7,
  },
  compassAvatarPressable: {
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F8F5",
  },
  compassAvatarMask: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F8F5",
  },
  compassAvatarImage: {
    backgroundColor: "#E8F8F5",
  },
  compassAvatarSignalDot: {
    position: "absolute",
    right: 3,
    top: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#F5D36B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.86)",
  },
  compassAvatarToken: {
    alignItems: "center",
    justifyContent: "center",
  },
  compassAvatarInitials: {
    color: "#EFFFFB",
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 0.3,
  },
  compassLoading: {
    position: "absolute",
    left: COMPASS_CENTER - 18,
    top: COMPASS_CENTER + 34,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: isDark ? withAlpha(theme.background, 0.8) : withAlpha("#ffffff", 0.72),
  },
  celebrationCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: isDark ? withAlpha("#102C2B", 0.96) : withAlpha("#102C2B", 0.92),
    borderWidth: 1,
    borderColor: "rgba(245,211,107,0.36)",
  },
  celebrationCopy: {
    flex: 1,
  },
  celebrationTitle: {
    color: "#EFFFFB",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 14,
  },
  celebrationBody: {
    color: "#B6DAD5",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  compassGuideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    borderRadius: 24,
    padding: 12,
    backgroundColor: isDark ? withAlpha(theme.background, 0.52) : withAlpha("#ffffff", 0.58),
    borderWidth: 1,
    borderColor: isDark ? withAlpha(theme.secondary, 0.24) : withAlpha(theme.tint, 0.18),
  },
  compassGuideCopy: {
    flex: 1,
  },
  compassGuideTitle: {
    color: theme.text,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 12,
  },
  compassGuideBody: {
    color: theme.textMuted,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    marginTop: 3,
  },
  refreshButton: {
    borderRadius: 999,
    minWidth: 108,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: isDark ? withAlpha(theme.tint, 0.2) : "#0F766E",
    borderWidth: 1,
    borderColor: isDark ? withAlpha(theme.secondary, 0.34) : withAlpha(theme.tint, 0.24),
  },
  refreshButtonDisabled: {
    backgroundColor: isDark ? withAlpha("#F5D36B", 0.08) : withAlpha("#F5D36B", 0.14),
    borderColor: withAlpha("#F5D36B", 0.28),
  },
  refreshButtonText: {
    color: "#EFFFFB",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 11,
  },
  refreshButtonTextDisabled: {
    color: isDark ? "#F2D680" : "#7A5C08",
  },
  compassUpgradeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: isDark ? withAlpha("#F5D36B", 0.1) : "rgba(255,246,216,0.74)",
    borderWidth: 1,
    borderColor: "rgba(245,211,107,0.48)",
  },
  compassUpgradeText: {
    flex: 1,
    color: "#6F4E04",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 11,
    lineHeight: 15,
  },
  sectionCard: {
    borderRadius: 26,
    padding: 16,
    marginBottom: 14,
    backgroundColor: isDark ? withAlpha(theme.backgroundSubtle, 0.96) : withAlpha(theme.backgroundSubtle, 0.94),
    borderWidth: 1,
    borderColor: isDark ? withAlpha("#ffffff", 0.06) : withAlpha(theme.text, 0.1),
  },
  sectionKicker: {
    color: theme.tint,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: theme.text,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 20,
    marginTop: 6,
  },
  sectionMicrocopy: {
    color: theme.textMuted,
    fontFamily: "Manrope_500Medium",
    lineHeight: 19,
    fontSize: 13,
    marginTop: 6,
    marginBottom: 12,
  },
  choiceGrid: {
    gap: 10,
  },
  choiceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    padding: 13,
    backgroundColor: isDark ? withAlpha("#ffffff", 0.04) : withAlpha("#ffffff", 0.58),
    borderWidth: 1,
    borderColor: isDark ? withAlpha("#ffffff", 0.08) : withAlpha(theme.text, 0.1),
  },
  choiceCardSelected: {
    backgroundColor: isDark ? withAlpha(theme.tint, 0.18) : withAlpha(theme.tint, 0.13),
    borderColor: isDark ? withAlpha(theme.secondary, 0.56) : withAlpha(theme.tint, 0.46),
    shadowColor: theme.tint,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  choiceIcon: {
    width: 38,
    height: 38,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: isDark ? withAlpha(theme.tint, 0.14) : withAlpha(theme.tint, 0.1),
  },
  choiceIconSelected: {
    backgroundColor: theme.tint,
  },
  choiceCopy: {
    flex: 1,
    gap: 3,
  },
  choiceTitle: {
    color: theme.text,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 14,
  },
  choiceTitleSelected: {
    color: isDark ? "#E8F0ED" : "#063D3D",
  },
  choiceBody: {
    color: theme.textMuted,
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
  },
  radiusCard: {
    marginTop: 12,
    borderRadius: 20,
    padding: 12,
    backgroundColor: isDark ? withAlpha("#ffffff", 0.03) : withAlpha("#ffffff", 0.48),
  },
  inlineLabel: {
    color: theme.text,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 13,
    marginBottom: 10,
  },
  radiusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  radiusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: isDark ? withAlpha("#ffffff", 0.06) : withAlpha(theme.text, 0.06),
  },
  radiusPillSelected: {
    backgroundColor: theme.tint,
  },
  radiusText: {
    color: theme.textMuted,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 12,
  },
  radiusTextSelected: {
    color: "#EFFFFB",
  },
  cityInput: {
    marginTop: 12,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: theme.text,
    fontFamily: "Manrope_600SemiBold",
    backgroundColor: isDark ? withAlpha("#ffffff", 0.05) : withAlpha("#ffffff", 0.68),
    borderWidth: 1,
    borderColor: isDark ? withAlpha("#ffffff", 0.08) : withAlpha(theme.text, 0.1),
  },
  refineButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: theme.tint,
    marginVertical: 6,
  },
  refineText: {
    color: "#EFFFFB",
    fontFamily: "Manrope_800ExtraBold",
  },
  expandedStack: {
    gap: 0,
  },
  weightRow: {
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: isDark ? withAlpha("#ffffff", 0.06) : withAlpha(theme.text, 0.08),
  },
  weightCopy: {
    gap: 3,
  },
  weightLabel: {
    color: theme.text,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 14,
  },
  weightBody: {
    color: theme.textMuted,
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
  },
  segmented: {
    flexDirection: "row",
    borderRadius: 15,
    backgroundColor: isDark ? withAlpha("#ffffff", 0.05) : withAlpha(theme.text, 0.06),
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 9,
  },
  segmentSelected: {
    backgroundColor: isDark ? withAlpha(theme.background, 0.88) : "#F8F4EA",
    shadowColor: theme.text,
    shadowOpacity: isDark ? 0.16 : 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  segmentText: {
    color: theme.textMuted,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 11,
  },
  segmentTextSelected: {},
  previewCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: isDark ? withAlpha("#102C2B", 0.96) : "#102C2B",
    marginTop: 2,
  },
  previewEyebrow: {
    color: "#A7F3D0",
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    fontSize: 11,
  },
  previewTitle: {
    color: "#EFFFFB",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 18,
    marginTop: 7,
  },
  previewBody: {
    color: "#B6DAD5",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  footer: {
    position: "absolute",
    left: 12,
    right: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderRadius: 28,
    backgroundColor: isDark ? withAlpha(theme.backgroundSubtle, 0.94) : withAlpha(theme.background, 0.96),
    borderWidth: 1,
    borderColor: isDark ? withAlpha("#ffffff", 0.08) : withAlpha(theme.text, 0.08),
    shadowColor: isDark ? "#000000" : theme.text,
    shadowOpacity: isDark ? 0.28 : 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  footerCopy: {
    marginBottom: 12,
  },
  footerTitle: {
    color: theme.text,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 14,
  },
  footerBody: {
    color: theme.textMuted,
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    marginTop: 3,
  },
  footerActions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 0.8,
    minHeight: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: isDark ? withAlpha("#ffffff", 0.06) : withAlpha(theme.text, 0.08),
  },
  primaryButton: {
    flex: 1.45,
    minHeight: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.tint,
  },
  secondaryText: {
    color: theme.text,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 13,
  },
  primaryText: {
    color: "#EFFFFB",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 13,
  },
});
