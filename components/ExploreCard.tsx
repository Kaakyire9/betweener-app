// components/ExploreCard.tsx
import AmbientCardGlow from "@/components/AmbientCardGlow";
import OfflineImage from "@/components/media/OfflineImage";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { VerificationBadge } from "@/components/VerificationBadge";
import { getMomentAtmosphere } from "@/components/vibes/momentAtmosphere";
import { formatDisplayNameForCard } from "@/components/vibes/nameFormatting";
import { getInterestIconName } from "@/components/vibes/interestIcons";
import { getVibesLayoutMetrics, type VibesLayoutMetrics } from "@/components/vibes/VibesResponsiveLayout";
import GlassSurface from "@/components/vibes/depth/GlassSurface";
import VibesCardFrame from "@/components/vibes/depth/VibesCardFrame";
import { VIBES_DEPTH_COLORS } from "@/components/vibes/depth/platformGlass";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { buildLocationDisplay, getFirstLocationPart } from "@/lib/location/location-display";
import { getAuthoritativePresenceDisplay } from "@/lib/presence";
import { getProfileInitials, getProfilePlaceholderPalette, hasProfileImage } from "@/lib/profile-placeholders";
import type { Match } from "@/types/match";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

const toTitleLabel = (value: string) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

function ExploreCard({
  match,
  onPress,
  isPreviewing,
  onPlayPress,
  layoutMetrics,
}: {
  match: Match;
  onPress?: (id: string) => void;
  isPreviewing?: boolean;
  onPlayPress?: (id: string) => void;
  layoutMetrics?: VibesLayoutMetrics;
}) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const resolvedLayoutMetrics = useMemo(
    () => layoutMetrics ?? getVibesLayoutMetrics({
      screenWidth: windowWidth,
      screenHeight: windowHeight,
      insets,
    }),
    [insets, layoutMetrics, windowHeight, windowWidth],
  );
  const placeholderPalette = getProfilePlaceholderPalette(match.id || match.name);
  const hasIntroVideo = Boolean((match as any).profileVideo);
  const styles = useMemo(
    () => createStyles(theme, isDark, placeholderPalette, resolvedLayoutMetrics, hasIntroVideo),
    [placeholderPalette, theme, isDark, resolvedLayoutMetrics, hasIntroVideo],
  );
  const gradientColors = useMemo(
    () => (isDark
      ? ["rgba(0,0,0,0)", "rgba(3,14,18,0.18)", "rgba(2,8,10,0.76)"]
      : ["rgba(0,0,0,0)", "rgba(4,19,22,0.24)", "rgba(2,8,10,0.68)"] ),
    [isDark]
  );
  const bottomGradientColors = useMemo(
    () => (isDark
      ? ["rgba(0,0,0,0)", "rgba(2,8,10,0.34)", "rgba(2,8,10,0.88)"]
      : ["rgba(0,0,0,0)", "rgba(5,22,24,0.28)", "rgba(4,14,16,0.78)"]),
    [isDark],
  );
  const sideVignetteColors = useMemo(
    () => (isDark
      ? ["rgba(0,0,0,0.20)", "rgba(0,0,0,0)", "rgba(0,0,0,0.16)"]
      : ["rgba(0,0,0,0.13)", "rgba(0,0,0,0)", "rgba(0,0,0,0.10)"]),
    [isDark],
  );
  const distanceLabel = match.distance || '';
  const locationPresentation = useMemo(
    () => buildLocationDisplay(match as any, { surface: 'vibes', distanceLabel }),
    [distanceLabel, match],
  );
  const countryFlag = locationPresentation.flag;
  const locationDisplay = locationPresentation.withFlag.replace(countryFlag, '').trim();
  const blockedLabels = useMemo(() => {
    const values = new Set<string>();
    const addValue = (value?: string | null) => {
      const normalized = normalizeLabel(value);
      if (normalized) values.add(normalized);
    };

    addValue(locationPresentation.primary);
    addValue(locationPresentation.secondary);
    addValue((match as any).city);
    addValue(getFirstLocationPart(match.location || ''));
    addValue(match.location);
    addValue(match.region);
    addValue((match as any).current_country);
    addValue((match as any).current_country_name);

    return values;
  }, [locationPresentation.primary, locationPresentation.secondary, (match as any).city, match.location, match.region, (match as any).current_country, (match as any).current_country_name]);
  const verificationLevel =
    typeof (match as any).verification_level === 'number'
      ? (match as any).verification_level
      : match.verified
      ? 1
      : 0;
  const badgeVariant = verificationLevel >= 2 ? 'id' : verificationLevel >= 1 ? 'phone' : null;
  const hasAvatarImage = hasProfileImage(match.avatar_url);
  const profileInitials = getProfileInitials(match.name);
  const compactMode = windowHeight <= 760 || windowWidth <= 360;
  const displayName = useMemo(
    () => formatDisplayNameForCard(match.name, (match as any).age, resolvedLayoutMetrics.device.compactWidth ? 18 : 24),
    [resolvedLayoutMetrics.device.compactWidth, match.name, (match as any).age],
  );

  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const lastActiveValue = match.lastActive || (match as any).last_active;
  const presence = getAuthoritativePresenceDisplay(
    (match as any).online,
    lastActiveValue,
    presenceNow,
  );
  const isOnlineNow = presence.online;
  const isActiveNow = presence.activeNow;
  const recentlyActive = presence.recentlyActive;

  useEffect(() => {
    const interval = setInterval(() => setPresenceNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Reduced-motion preference + small, native Animated transitions (no Reanimated hooks).
  const [reduceMotion, setReduceMotion] = useState(false);
  const [pressed, setPressed] = useState(false);
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

  const slotWidth = Math.max(leftBadgeWidth + insets.left, rightBadgeWidth + insets.right, MIN_SLOT);

  // fallback Animated values
  const verifiedAnim = useRef(new Animated.Value(0)).current;
  const verifiedTranslate = useRef(new Animated.Value(6)).current;
  const activeAnim = useRef(new Animated.Value(0)).current;
  const activeTranslate = useRef(new Animated.Value(6)).current;
  const pillAnim = useRef(new Animated.Value(0)).current;
  const pillTranslate = useRef(new Animated.Value(6)).current;
  const introPulse = useRef(new Animated.Value(0)).current;
  const atmospherePulse = useRef(new Animated.Value(0)).current;

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
    if (!hasIntroVideo) return;
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
  }, [hasIntroVideo, introPulse]);

  const momentTypeHint = useMemo(() => {
    const shared = Array.isArray((match as any).commonInterests) ? (match as any).commonInterests[0] : null;
    const interest = Array.isArray(match.interests) ? match.interests[0] : null;
    const lookingFor = (match as any).looking_for || (match as any).lookingFor;
    if (shared) return String(shared);
    if (interest) return String(interest);
    if (hasIntroVideo) return "video";
    if (badgeVariant) return "verified";
    return lookingFor ? String(lookingFor) : null;
  }, [(match as any).commonInterests, (match as any).looking_for, (match as any).lookingFor, badgeVariant, hasIntroVideo, match.interests]);

  const atmosphere = useMemo(() => getMomentAtmosphere(momentTypeHint), [momentTypeHint]);

  useEffect(() => {
    if (reduceMotion) {
      atmospherePulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(atmospherePulse, { toValue: 1, duration: 2600, useNativeDriver: true }),
        Animated.timing(atmospherePulse, { toValue: 0, duration: 2600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      atmospherePulse.setValue(0);
    };
  }, [atmospherePulse, reduceMotion, atmosphere.microAnimationType]);

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
    const chips: { label: string; tone: 'tint' | 'secondary' | 'accent'; icon: string }[] = [];
    const commonInterests = (Array.isArray((match as any).commonInterests) ? (match as any).commonInterests : []).filter(
      (interest) => !blockedLabels.has(normalizeLabel(String(interest || '')))
    );
    const lookingFor = (match as any).looking_for || (match as any).lookingFor;
    const loveLanguage = (match as any).love_language || (match as any).loveLanguage;

    if (commonInterests[0]) {
      const cleanShared = commonInterests.map((interest) => toTitleLabel(String(interest || ''))).filter(Boolean);
      const sharedLabel =
        cleanShared.length >= 3
          ? `${cleanShared.length} shared interests`
          : `Shared: ${cleanShared.slice(0, 2).join(', ')}`;
      chips.push({
        label: sharedLabel,
        tone: 'secondary',
        icon: getInterestIconName(cleanShared[0] || sharedLabel),
      });
    }
    if (lookingFor) chips.push({ label: `Intent: ${toTitleLabel(String(lookingFor))}`, tone: 'tint', icon: 'target' });
    if (loveLanguage && chips.length < 3) chips.push({ label: `Love language: ${toTitleLabel(String(loveLanguage))}`, tone: 'tint', icon: 'hand-heart-outline' });

    return chips.slice(0, 3);
  }, [
    blockedLabels,
    (match as any).commonInterests,
    (match as any).looking_for,
    (match as any).lookingFor,
    (match as any).love_language,
    (match as any).loveLanguage,
  ]);

  const atmosphereStyle: any = {
    opacity: atmospherePulse.interpolate({
      inputRange: [0, 1],
      outputRange: [atmosphere.glowOpacity * 0.54, atmosphere.glowOpacity],
    }),
    transform: [
      {
        translateY: atmospherePulse.interpolate({
          inputRange: [0, 1],
          outputRange: atmosphere.microAnimationType === "pulse" ? [0, -6] : [0, -12],
        }),
      },
      {
        scale: atmospherePulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, atmosphere.microAnimationType === "pulse" ? 1.08 : 1.04],
        }),
      },
    ],
  };

  return (
    <View style={styles.cardShell}>
      <AmbientCardGlow
        theme={theme}
        hasIntroVideo={hasIntroVideo}
        isActiveNow={isOnlineNow || isActiveNow}
        isPressed={pressed || Boolean(isPreviewing)}
        compactMode={compactMode}
        disabled={reduceMotion}
      />
      <VibesCardFrame metrics={resolvedLayoutMetrics} active={!isPreviewing}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.95}
        onPress={() => onPress?.(match.id)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
      >
        {hasAvatarImage ? (
          <OfflineImage
            uri={match.avatar_url}
            style={styles.image}
            contentFit="cover"
            contentPosition={{ top: "34%", left: "50%" }}
            fallback={
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
            }
          />
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

        <Animated.View pointerEvents="none" style={[styles.atmosphere, atmosphereStyle]}>
          <LinearGradientSafe
            colors={atmosphere.backgroundOverlay}
            start={[0.2, 0]}
            end={[0.8, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <LinearGradientSafe colors={gradientColors} style={styles.gradient} />
        <LinearGradientSafe
          pointerEvents="none"
          colors={bottomGradientColors}
          start={[0.5, 0]}
          end={[0.5, 1]}
          style={styles.bottomReadabilityGradient}
        />
        <LinearGradientSafe
          pointerEvents="none"
          colors={sideVignetteColors}
          start={[0, 0.45]}
          end={[1, 0.45]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text
              style={styles.name}
              numberOfLines={1}
              ellipsizeMode="tail"
              allowFontScaling={false}
              accessibilityLabel={displayName.accessibilityLabel}
            >
              {displayName.name}
            </Text>
            {displayName.ageLabel ? (
              <View style={styles.ageCluster} pointerEvents="none">
                <View style={styles.ageDotMarker} />
                <Text style={styles.ageText} allowFontScaling={false}>{displayName.ageLabel}</Text>
              </View>
            ) : null}
          </View>

          {null}

          {locationDisplay || countryFlag ? (
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker" size={14} color="#fff" />
              {locationDisplay ? (
                <Text style={styles.location} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.12}>
                  {locationDisplay}
                </Text>
              ) : null}
              {countryFlag ? <Text style={styles.locationFlag}>{countryFlag}</Text> : null}
            </View>
          ) : null}

          {alignmentChips.length > 0 || hasIntroVideo ? (
            <View style={styles.contextRow}>
              {alignmentChips.length > 0 ? (
                <View style={styles.alignmentChips}>
                  {alignmentChips.map((chip, idx) => (
                    <GlassSurface
                      key={`${chip.label}-${idx}`}
                      radius={999}
                      intensity={16}
                      borderOpacity={0.14}
                      fallbackColor={isDark ? "rgba(8,34,38,0.74)" : "rgba(7,30,34,0.62)"}
                      contentStyle={styles.alignmentChipSurface}
                      style={[
                        styles.alignmentChipFrame,
                        chip.tone === 'tint'
                          ? styles.alignmentChipTint
                          : chip.tone === 'secondary'
                            ? styles.alignmentChipSecondary
                            : styles.alignmentChipAccent,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={chip.icon as any}
                        size={resolvedLayoutMetrics.device.compactHeight ? 11 : 12}
                        color={isDark ? '#D9FFFF' : '#F4FFFF'}
                        style={styles.alignmentChipIcon}
                      />
                      <Text style={styles.alignmentChipText} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
                        {chip.label}
                      </Text>
                    </GlassSurface>
                  ))}
                </View>
              ) : <View style={styles.alignmentChipsEmpty} />}
              {hasIntroVideo ? (
                <TouchableOpacity
                  accessibilityLabel={"Play profile video"}
                  accessibilityRole="button"
                  onPress={() => onPlayPress ? onPlayPress(match.id) : onPress?.(match.id)}
                  style={styles.inlineIntroHit}
                  activeOpacity={0.9}
                >
                  <Animated.View style={[styles.inlineIntroPill, introPulseStyle, compactMode ? styles.inlineIntroPillCompact : null]}>
                    <MaterialCommunityIcons name="play-circle-outline" size={compactMode ? 12 : 13} color="#F2FBFB" />
                    <Text style={styles.inlineIntroText}>Intro</Text>
                  </Animated.View>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
      </VibesCardFrame>
    </View>
  );
}

const createStyles = (
  theme: typeof Colors.light,
  isDark: boolean,
  placeholderPalette: ReturnType<typeof getProfilePlaceholderPalette>,
  metrics: VibesLayoutMetrics,
  hasIntroVideo: boolean,
) => {
  const activeNowBgColor = withAlpha(theme.secondary, isDark ? 0.9 : 0.95);
  const recentlyActiveBgColor = withAlpha(theme.accent, isDark ? 0.85 : 0.9);
  return StyleSheet.create({
    cardShell: {
      position: "absolute",
      width: "100%",
      height: "100%",
      borderRadius: metrics.cardBorderRadius,
      overflow: "visible",
    },
    card: {
      width: "100%",
      height: "100%",
      borderRadius: metrics.cardBorderRadius,
      overflow: "hidden",
      backgroundColor: VIBES_DEPTH_COLORS.background,
    },
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
    atmosphere: {
      position: "absolute",
      left: -12,
      right: -12,
      bottom: metrics.cardHeight * 0.2,
      height: metrics.cardHeight * 0.34,
      borderRadius: metrics.cardBorderRadius * 1.5,
      overflow: "hidden",
    },
    gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "62%" },
    bottomReadabilityGradient: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: "48%",
    },
    info: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: Math.max(190, metrics.cardHeight * 0.58),
      paddingHorizontal: metrics.overlayPadding.horizontal + 2,
      paddingTop: metrics.device.compactHeight ? 18 : metrics.overlayPadding.top + 8,
      paddingBottom: metrics.overlayPadding.bottom + 4,
      backgroundColor: 'transparent',
      borderTopWidth: 0,
      borderTopColor: 'transparent',
    },
    nameRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: metrics.device.compactHeight ? 8 : 10 },
    name: {
      color: VIBES_DEPTH_COLORS.cream,
      fontSize: metrics.device.compactHeight ? Math.max(25, metrics.nameFontSize) : metrics.nameFontSize + 2,
      flexShrink: 1,
      flexGrow: 0,
      maxWidth: Math.max(168, metrics.cardWidth - (metrics.overlayPadding.horizontal * 2) - 88),
      fontFamily: 'PlayfairDisplay_700Bold',
      minWidth: 0,
      lineHeight: (metrics.device.compactHeight ? Math.max(25, metrics.nameFontSize) : metrics.nameFontSize + 2) + 6,
      textShadowColor: isDark ? 'rgba(0,0,0,0.58)' : 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 4 },
      textShadowRadius: 13,
      letterSpacing: -0.5,
    },
    ageCluster: {
      flexDirection: "row",
      alignItems: "baseline",
      flexShrink: 0,
    },
    ageDotMarker: {
      width: 5,
      height: 5,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.72)",
      marginRight: 8,
      marginBottom: 6,
    },
    ageText: {
      color: "rgba(244,232,208,0.94)",
      fontSize: Math.max(18, metrics.nameFontSize - 6),
      fontFamily: 'Manrope_700Bold',
    },
    activeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: activeNowBgColor, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff", marginRight: 6 },
    activeText: { color: "#fff", fontSize: 11 },
    tagline: { color: "#fff", marginBottom: 12, fontSize: 15, fontFamily: 'Manrope_500Medium' },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: hasIntroVideo ? (metrics.device.compactHeight ? 7 : 8) : (metrics.device.compactHeight ? 8 : 11),
    },
    location: { color: "rgba(255,255,255,0.92)", marginLeft: 6, fontFamily: 'Manrope_600SemiBold', flexShrink: 1, fontSize: metrics.device.compactHeight ? 13 : 14, letterSpacing: 0.1 },
    locationFlag: { marginLeft: 6, fontSize: 15 },
    contextRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 4,
    },
    alignmentChips: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 6, overflow: 'hidden' },
    alignmentChipsEmpty: { flex: 1 },
    alignmentChipFrame: {
      maxWidth: metrics.device.compactWidth ? 150 : 192,
      borderRadius: 999,
    },
    alignmentChipSurface: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: metrics.device.compactHeight ? 9 : 11,
      paddingVertical: metrics.device.compactHeight ? 6 : 7,
      borderRadius: 999,
    },
    alignmentChipIcon: {
      marginTop: 1,
    },
    alignmentChipTint: { backgroundColor: withAlpha(theme.tint, 0.18) },
    alignmentChipSecondary: { backgroundColor: withAlpha(theme.secondary, 0.16) },
    alignmentChipAccent: { backgroundColor: withAlpha(theme.accent, 0.16) },
    alignmentChipText: { color: '#F8FFFF', fontSize: metrics.device.compactHeight ? 11 : 12, fontWeight: '800' },
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
    topRow: {
      position: 'absolute',
      top: metrics.topRowInset,
      left: metrics.topRowInset,
      right: metrics.topRowInset,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 40,
    },
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
    inlineIntroHit: {
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      alignSelf: 'flex-start',
      marginBottom: 0,
    },
    inlineIntroPill: {
      minHeight: 25,
      borderRadius: 13,
      backgroundColor: isDark ? 'rgba(18, 38, 40, 0.70)' : 'rgba(15, 61, 62, 0.60)',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha('#E9FEFF', isDark ? 0.28 : 0.22),
      shadowColor: withAlpha(theme.tint, 0.35),
      shadowOpacity: isDark ? 0.18 : 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    inlineIntroPillCompact: {
      minHeight: 24,
      paddingHorizontal: 8,
      borderRadius: 12,
      gap: 4,
    },
    inlineIntroText: {
      color: '#F5FFFF',
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
  });
};

export default memo(
  ExploreCard,
  (prev, next) =>
    prev.match === next.match &&
    prev.isPreviewing === next.isPreviewing &&
    prev.layoutMetrics === next.layoutMetrics,
);
