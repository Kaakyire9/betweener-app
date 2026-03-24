// components/ExploreCard.tsx
import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { VerificationBadge } from "@/components/VerificationBadge";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getProfileInitials, getProfilePlaceholderPalette, hasProfileImage } from "@/lib/profile-placeholders";
import type { Match } from "@/types/match";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const isDistanceLabel = (label?: string) => {
  if (!label) return false;
  const lower = label.toLowerCase();
  return lower.includes('away') || /\b(km|mi|mile|miles)\b/.test(lower) || /<\s*1/.test(lower);
};

const getCityOnly = (label?: string) => {
  if (!label) return '';
  const parts = String(label).split(',');
  return parts[0]?.trim() || '';
};

const toFlagEmoji = (code?: string) => {
  if (!code) return '';
  const normalized = String(code).trim().toUpperCase();
  if (normalized.length !== 2) return '';
  const first = normalized.charCodeAt(0);
  const second = normalized.charCodeAt(1);
  if (first < 65 || first > 90 || second < 65 || second > 90) return '';
  return String.fromCodePoint(0x1f1e6 + (first - 65), 0x1f1e6 + (second - 65));
};

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const normalizeLabel = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'united kingdom': 'GB',
  uk: 'GB',
  britain: 'GB',
  'great britain': 'GB',
  ghana: 'GH',
  nigeria: 'NG',
  'united states': 'US',
  usa: 'US',
  america: 'US',
  canada: 'CA',
  germany: 'DE',
  france: 'FR',
  italy: 'IT',
  spain: 'ES',
  netherlands: 'NL',
  belgium: 'BE',
  sweden: 'SE',
  norway: 'NO',
  ireland: 'IE',
  australia: 'AU',
  'south africa': 'ZA',
  uae: 'AE',
  'united arab emirates': 'AE',
};

const inferCountryCode = (...values: (string | null | undefined)[]) => {
  for (const value of values) {
    const normalized = normalizeLabel(value);
    if (!normalized) continue;
    if (normalized.length === 2 && /^[a-z]+$/i.test(normalized)) {
      return normalized.toUpperCase();
    }
    if (COUNTRY_NAME_TO_CODE[normalized]) {
      return COUNTRY_NAME_TO_CODE[normalized];
    }
  }
  return '';
};

export default function ExploreCard({ match, onPress, isPreviewing, onPlayPress }: { match: Match; onPress?: (id: string) => void; isPreviewing?: boolean; onPlayPress?: (id: string) => void; }) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const placeholderPalette = getProfilePlaceholderPalette(match.id || match.name);
  const styles = useMemo(() => createStyles(theme, isDark, placeholderPalette), [placeholderPalette, theme, isDark]);
  const gradientColors = useMemo(
    () => (isDark ? ["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"] : ["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"] ),
    [isDark]
  );
  const isManualLocation = (match as any).location_precision === 'CITY';
  const locationLabel = isManualLocation ? '' : getCityOnly(match.location || match.region || '');
  const distanceLabel = match.distance || '';
  const showDistance = isDistanceLabel(distanceLabel);
  const locationDisplayBase =
    showDistance && locationLabel && distanceLabel !== locationLabel
      ? `${distanceLabel} \u00b7 ${locationLabel}`
      : distanceLabel || locationLabel;
  const resolvedCountryCode = inferCountryCode(
    (match as any).current_country_code,
    (match as any).current_country,
    (match as any).current_country_name,
    match.region,
    match.location,
  );
  const countryFlag = toFlagEmoji(resolvedCountryCode);
  const locationDisplay = locationDisplayBase
    ? `${locationDisplayBase}${countryFlag ? ` ${countryFlag}` : ''}`
    : countryFlag;
  const blockedLabels = useMemo(() => {
    const values = new Set<string>();
    const addValue = (value?: string | null) => {
      const normalized = normalizeLabel(value);
      if (normalized) values.add(normalized);
    };

    addValue(locationLabel);
    addValue(getCityOnly(match.location || ''));
    addValue(match.location);
    addValue(match.region);
    addValue((match as any).current_country);
    addValue((match as any).current_country_name);

    return values;
  }, [locationLabel, match.location, match.region, (match as any).current_country, (match as any).current_country_name]);
  const verificationLevel =
    typeof (match as any).verification_level === 'number'
      ? (match as any).verification_level
      : match.verified
      ? 1
      : 0;
  const badgeVariant = verificationLevel >= 2 ? 'id' : verificationLevel >= 1 ? 'phone' : null;
  const hasAvatarImage = hasProfileImage(match.avatar_url);
  const profileInitials = getProfileInitials(match.name);

  const isOnlineNow = !!(match as any).online;
  const lastActiveValue = match.lastActive || (match as any).last_active;
  const ACTIVE_NOW_MS = 3 * 60 * 1000;
  const RECENTLY_ACTIVE_MS = 45 * 60 * 1000;
  const { isActiveNow, recentlyActive } = (() => {
    if (!lastActiveValue) return { isActiveNow: false, recentlyActive: false };
    try {
      const then = new Date(lastActiveValue).getTime();
      if (isNaN(then)) return { isActiveNow: false, recentlyActive: false };
      const diffMs = Date.now() - then;
      if (diffMs <= 0) return { isActiveNow: false, recentlyActive: false };
      return {
        isActiveNow: diffMs <= ACTIVE_NOW_MS,
        recentlyActive: diffMs > ACTIVE_NOW_MS && diffMs <= RECENTLY_ACTIVE_MS,
      };
    } catch (_e) {
      return { isActiveNow: false, recentlyActive: false };
    }
  })();

  // Dev-only debug: print key match fields to help diagnose rendering
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // avoid heavy serialization in prod; stringify small arrays for clarity
      const interestsSample = Array.isArray((match as any).interests) ? (match as any).interests : (match as any).interests;
      const personalitySample = Array.isArray((match as any).personalityTags) ? (match as any).personalityTags : (match as any).personalityTags;
       
      console.log('[ExploreCard] debug', {
        id: match.id,
        name: match.name,
        interests: interestsSample,
        personalityTags: personalitySample,
        distance: (match as any).distance,
        profileVideo: (match as any).profileVideo,
      });
    }
  } catch (_e) {}

  // Reduced-motion preference + small, native Animated transitions (no Reanimated hooks).
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    try {
      AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduceMotion(!!v); }).catch(() => {});
    } catch (_e) {}
    return () => { mounted = false; };
  }, []);

  // measured widths for symmetric spacing
  const [leftBadgeWidth, setLeftBadgeWidth] = useState(0);
  const [rightBadgeWidth, setRightBadgeWidth] = useState(0);
  const MIN_SLOT = 44;

  const insets = useSafeAreaInsets();
  const slotWidth = Math.max(leftBadgeWidth + insets.left, rightBadgeWidth + insets.right, MIN_SLOT);

  // fallback Animated values
  const verifiedAnim = useRef(new Animated.Value(0)).current;
  const verifiedTranslate = useRef(new Animated.Value(6)).current;
  const activeAnim = useRef(new Animated.Value(0)).current;
  const activeTranslate = useRef(new Animated.Value(6)).current;
  const pillAnim = useRef(new Animated.Value(0)).current;
  const pillTranslate = useRef(new Animated.Value(6)).current;
  const introPulse = useRef(new Animated.Value(0)).current;
  const previewGlowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (badgeVariant) {
      Animated.parallel([
        Animated.timing(verifiedAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(verifiedTranslate, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      verifiedAnim.setValue(0);
      verifiedTranslate.setValue(6);
    }

    if (isOnlineNow || isActiveNow || recentlyActive) {
      Animated.parallel([
        Animated.timing(activeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(activeTranslate, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      activeAnim.setValue(0);
      activeTranslate.setValue(6);
    }

    // animate AI pill entrance on mount / when score changes
    Animated.parallel([
      Animated.timing(pillAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(pillTranslate, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [badgeVariant, isOnlineNow, isActiveNow, recentlyActive, lastActiveValue]);

  useEffect(() => {
    if (!(match as any).profileVideo) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(introPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(introPulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      introPulse.setValue(0);
    };
  }, [introPulse, (match as any).profileVideo]);

  const introPulseStyle = {
    transform: [
      {
        scale: introPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
      },
    ],
    opacity: introPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }),
  };

  const vibePill = useMemo(() => {
    const rawScore = typeof (match as any).compatibility === 'number' ? Math.round((match as any).compatibility) : null;
    if (typeof rawScore !== 'number') return null;
    if (rawScore >= 78) {
      return {
        label: 'Strong alignment',
        colors: ['#25C4C0', theme.tint] as [string, string],
      };
    }
    if (rawScore >= 56) {
      return {
        label: 'Shared vibe',
        colors: [theme.secondary, theme.tint] as [string, string],
      };
    }
    if (rawScore >= 38) {
      return {
        label: 'Aligned',
        colors: [theme.accent, theme.tint] as [string, string],
      };
    }
    return null;
  }, [(match as any).compatibility, theme.accent, theme.secondary, theme.tint]);

  const alignmentChips = useMemo(() => {
    const chips: { label: string; tone: 'tint' | 'secondary' | 'accent' }[] = [];
    const commonInterests = (Array.isArray((match as any).commonInterests) ? (match as any).commonInterests : []).filter(
      (interest) => !blockedLabels.has(normalizeLabel(String(interest || '')))
    );
    const interests = (Array.isArray(match.interests) ? match.interests : []).filter(
      (interest) => !blockedLabels.has(normalizeLabel(String(interest || '')))
    );
    const personalities = Array.isArray((match as any).personalityTags) ? (match as any).personalityTags : [];
    const lookingFor = (match as any).looking_for || (match as any).lookingFor;
    const loveLanguage = (match as any).love_language || (match as any).loveLanguage;

    if (personalities[0]) chips.push({ label: personalities[0], tone: 'accent' });
    if (commonInterests[0]) {
      chips.push({
        label: commonInterests.length > 1 ? `${commonInterests.length} shared interests` : `Shared: ${commonInterests[0]}`,
        tone: 'secondary',
      });
    } else if (interests[0]) {
      chips.push({ label: interests[0], tone: 'secondary' });
    }
    if (lookingFor) chips.push({ label: `Intent: ${lookingFor}`, tone: 'tint' });
    if (loveLanguage && chips.length < 3) chips.push({ label: `Love language: ${loveLanguage}`, tone: 'tint' });

    return chips.slice(0, 3);
  }, [blockedLabels, match.interests, (match as any).commonInterests, (match as any).personalityTags, (match as any).looking_for, (match as any).lookingFor, (match as any).love_language, (match as any).loveLanguage]);

  const previewGlowStyle = {
    transform: [
      {
        scale: previewGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
      },
    ],
    opacity: previewGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }),
  };

  useEffect(() => {
    if (!isPreviewing || reduceMotion) {
      previewGlowAnim.stopAnimation();
      previewGlowAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(previewGlowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(previewGlowAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      previewGlowAnim.setValue(0);
    };
  }, [isPreviewing, reduceMotion, previewGlowAnim]);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardContent} activeOpacity={0.95} onPress={() => onPress?.(match.id)}>
        {hasAvatarImage ? (
          <Image source={{ uri: match.avatar_url }} style={styles.image} />
        ) : (
          <LinearGradientSafe
            colors={[placeholderPalette.start, placeholderPalette.end]}
            start={[0, 0]}
            end={[1, 1]}
            style={styles.placeholderSurface}
          >
            <View style={styles.placeholderOrb} />
            <View style={styles.placeholderContent}>
              <Text style={styles.placeholderInitials}>{profileInitials}</Text>
              <Text style={styles.placeholderTitle}>Profile loading in style</Text>
              <Text style={styles.placeholderSubtitle}>Photos can wait. Presence still matters.</Text>
            </View>
          </LinearGradientSafe>
        )}

        {/* subtle full-card glow while previewing (modal playing) */}
        {isPreviewing ? (
          !reduceMotion ? (
            <Animated.View style={[styles.previewGlow, previewGlowStyle]} pointerEvents="none" />
          ) : (
            <View pointerEvents="none" style={styles.previewGlow} />
          )
        ) : null}

        {/* Video indicator (bottom-right of avatar) */}
        {((match as any).profileVideo) ? (
          <TouchableOpacity
            accessibilityLabel={"Play profile video"}
            accessibilityRole="button"
            onPress={() => onPlayPress ? onPlayPress(match.id) : onPress?.(match.id)}
            style={styles.videoBadgeHit}
            activeOpacity={0.9}
          >
            <Animated.View style={[styles.videoBadge, introPulseStyle]} pointerEvents="none">
              <MaterialCommunityIcons name="play" size={14} color="#fff" />
            </Animated.View>
          </TouchableOpacity>
        ) : null}

        {/* Top-row: left = Verified, center = AI pill, right = Active */}
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={[styles.leftSlot, { minWidth: slotWidth }]} pointerEvents="none">
            {badgeVariant ? (
              <Animated.View
                style={[styles.badgeWrapper, { transform: [{ translateY: verifiedTranslate }], opacity: verifiedAnim }]}
                pointerEvents="none"
                onLayout={(e: any) => {
                  try {
                    setLeftBadgeWidth(e.nativeEvent.layout.width || 0);
                  } catch {}
                }}
              >
                {badgeVariant === "id" ? (
                  <VerificationBadge level={2} size="small" variant="betweener" surface="explore" />
                ) : (
                  <View style={styles.phoneBadge}>
                    <MaterialCommunityIcons name="phone-check" size={14} color={theme.tint} />
                    <Text style={styles.phoneBadgeText}>Phone verified</Text>
                  </View>
                )}
              </Animated.View>
            ) : null}
          </View>

          <View style={styles.centerSlot} pointerEvents="none">
            {vibePill ? (
              <Animated.View style={{ transform: [{ translateY: pillTranslate }], opacity: pillAnim }} pointerEvents="none">
                <LinearGradientSafe colors={vibePill.colors} start={[0, 0]} end={[1, 1]} style={styles.aiPillInline}>
                  <Text style={styles.aiPillText}>{vibePill.label}</Text>
                </LinearGradientSafe>
              </Animated.View>
            ) : null}
          </View>

          <View style={[styles.rightSlot, { minWidth: slotWidth }]} pointerEvents="none">
            {isOnlineNow || isActiveNow || recentlyActive ? (
              <Animated.View
                style={[
                  styles.activeInline,
                  isOnlineNow || isActiveNow ? styles.activeNowBg : styles.recentlyActiveBg,
                  { transform: [{ translateY: activeTranslate }], opacity: activeAnim },
                ]}
                pointerEvents="none"
                onLayout={(e: any) => {
                  try {
                    setRightBadgeWidth(e.nativeEvent.layout.width || 0);
                  } catch {}
                }}
              >
                <View style={styles.activeDotSmall} />
                <Text style={styles.activeTopText}>
                  {isOnlineNow ? "Online" : isActiveNow ? "Active now" : "Recently active"}
                </Text>
              </Animated.View>
            ) : null}
          </View>
        </View>

        <LinearGradientSafe colors={gradientColors} style={styles.gradient} />

        <BlurViewSafe intensity={60} tint="dark" style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{match.name}, {match.age}</Text>
            {/* keep inline small active badge for backward compatibility (hidden when top-right exists) */}
            {!match.isActiveNow && !recentlyActive ? null : null}
          </View>

          {null}

          {locationDisplay ? (
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker" size={14} color="#fff" />
              <Text style={styles.location}>{locationDisplay}</Text>
            </View>
          ) : null}

          {alignmentChips.length >= 2 || /shared/i.test(String(alignmentChips[0]?.label || '')) ? (
            <View style={styles.alignmentRow}>
              <View style={styles.alignmentChips}>
                {alignmentChips.map((chip, idx) => (
                  <View
                    key={`${chip.label}-${idx}`}
                    style={[
                      styles.alignmentChip,
                      chip.tone === 'tint'
                        ? styles.alignmentChipTint
                        : chip.tone === 'secondary'
                          ? styles.alignmentChipSecondary
                          : styles.alignmentChipAccent,
                    ]}
                  >
                    <Text style={styles.alignmentChipText}>{chip.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </BlurViewSafe>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (
  theme: typeof Colors.light,
  isDark: boolean,
  placeholderPalette: ReturnType<typeof getProfilePlaceholderPalette>,
) => {
  const surface = theme.background;
  const previewGlowBg = withAlpha(theme.tint, 0.1);
  const activeNowBgColor = withAlpha(theme.secondary, isDark ? 0.9 : 0.95);
  const recentlyActiveBgColor = withAlpha(theme.accent, isDark ? 0.85 : 0.9);
  const infoBg = isDark ? 'rgba(5,10,18,0.16)' : 'rgba(17,24,39,0.12)';
  return StyleSheet.create({
    card: {
      position: "absolute",
      width: "100%",
      height: "100%",
      borderRadius: 28,
      overflow: "hidden",
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.22 : 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    cardContent: { flex: 1 },
    image: { width: "100%", height: "100%", resizeMode: "cover" },
    placeholderSurface: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
    placeholderOrb: {
      position: 'absolute',
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: 'rgba(255,255,255,0.08)',
      shadowColor: '#fff',
      shadowOpacity: 0.12,
      shadowRadius: 36,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    placeholderContent: { alignItems: 'center', paddingHorizontal: 28 },
    placeholderInitials: {
      fontSize: 54,
      fontFamily: 'PlayfairDisplay_700Bold',
      color: placeholderPalette.text,
      letterSpacing: 1.5,
    },
    placeholderTitle: {
      marginTop: 10,
      fontSize: 18,
      fontFamily: 'Archivo_700Bold',
      color: '#fff',
      textAlign: 'center',
    },
    placeholderSubtitle: {
      marginTop: 6,
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
      color: placeholderPalette.muted,
      textAlign: 'center',
      lineHeight: 19,
    },
    gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "56%" },
    info: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 18,
      paddingTop: 22,
      paddingBottom: 34,
      backgroundColor: infoBg,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.14)',
    },
    nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    name: { color: "#fff", fontSize: 30, flex: 1, fontFamily: 'PlayfairDisplay_700Bold' },
    activeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: activeNowBgColor, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff", marginRight: 6 },
    activeText: { color: "#fff", fontSize: 11 },
    tagline: { color: "#fff", marginBottom: 12, fontSize: 15, fontFamily: 'Manrope_500Medium' },
    locationRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    location: { color: "#fff", marginLeft: 6, fontFamily: 'Manrope_600SemiBold' },
    alignmentRow: { marginBottom: 2 },
    alignmentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    alignmentChip: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, 0.16),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    alignmentChipTint: { backgroundColor: withAlpha(theme.tint, 0.35) },
    alignmentChipSecondary: { backgroundColor: withAlpha(theme.secondary, 0.32) },
    alignmentChipAccent: { backgroundColor: withAlpha(theme.accent, 0.32) },
    alignmentChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    verifiedBadge: {
      position: 'absolute',
      top: 12,
      left: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.tint,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      zIndex: 30,
    },
    activeTopRight: {
      position: 'absolute',
      top: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      zIndex: 30,
    },
    activeNowBg: { backgroundColor: activeNowBgColor },
    recentlyActiveBg: { backgroundColor: recentlyActiveBgColor },
    activeDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginRight: 6 },
    activeTopText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    aiPill: {
      position: 'absolute',
      top: 12,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      zIndex: 20,
      minWidth: 100,
      maxWidth: '70%',
    },
    topRow: { position: 'absolute', top: 22, left: 22, right: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 40 },
    leftSlot: { alignItems: 'flex-start' },
    centerSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    rightSlot: { alignItems: 'flex-end' },
    badgeWrapper: { flexDirection: 'row', alignItems: 'center' },
    phoneBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.22),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.10 : 0.09),
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.06 : 0.04,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    phoneBadgeText: {
      marginLeft: 5,
      color: '#fff',
      fontSize: 9,
      fontWeight: '800',
    },
    activeInline: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    aiPillInline: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      minWidth: 88,
      maxWidth: '64%',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    aiPillText: { color: '#fff', fontSize: 9, fontWeight: '800', textAlign: 'center' },
    // video badge
    videoBadgeHit: {
      position: 'absolute',
      right: 12,
      bottom: 20,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
    },
    videoBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: withAlpha(theme.secondary, 0.95),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: withAlpha('#ffffff', 0.9),
      shadowColor: withAlpha(theme.secondary, 0.8),
      shadowOpacity: 0.95,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 0 },
      elevation: 10,
    },
    previewGlow: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: previewGlowBg,
      borderRadius: 24,
      zIndex: 40,
    },
  });
};
