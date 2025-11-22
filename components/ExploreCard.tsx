// components/ExploreCard.tsx
import React, { useEffect, useRef, useState } from "react";
import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import type { Match } from "@/types/match";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// guarded dynamic require for Reanimated to keep compatibility with Expo Go
let ReanimatedModule: any = null;
let canUseReanimated = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ReanimatedModule = require('react-native-reanimated');
  canUseReanimated = !!(
    ReanimatedModule &&
    typeof ReanimatedModule.useSharedValue === 'function' &&
    typeof ReanimatedModule.useAnimatedStyle === 'function' &&
    typeof ReanimatedModule.withTiming === 'function'
  );
} catch (e) {}
// helper to access the animated View component (supports default export shape)
const ReanimatedAnimated: any = ReanimatedModule ? (ReanimatedModule.default || ReanimatedModule) : null;

// safe-area detection (optional, measured if available)
let useSafeAreaInsetsHook: any = null;
let hasSafeAreaHook = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const safe = require('react-native-safe-area-context');
  useSafeAreaInsetsHook = safe && safe.useSafeAreaInsets;
  hasSafeAreaHook = typeof useSafeAreaInsetsHook === 'function';
} catch (e) {}

export default function ExploreCard({ match, onPress, isPreviewing, onPlayPress }: { match: Match; onPress?: (id: string) => void; isPreviewing?: boolean; onPlayPress?: (id: string) => void; }) {
  // compute recently active (within last 3 hours)
  const recentlyActive = (() => {
    if (!match.lastActive) return false;
    try {
      const then = new Date(match.lastActive).getTime();
      if (isNaN(then)) return false;
      const now = Date.now();
      const diffMs = now - then;
      return diffMs > 0 && diffMs <= 3 * 60 * 60 * 1000; // 3 hours
    } catch (e) {
      return false;
    }
  })();

  // Dev-only debug: print key match fields to help diagnose rendering
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // avoid heavy serialization in prod; stringify small arrays for clarity
      const interestsSample = Array.isArray((match as any).interests) ? (match as any).interests : (match as any).interests;
      const personalitySample = Array.isArray((match as any).personalityTags) ? (match as any).personalityTags : (match as any).personalityTags;
      // eslint-disable-next-line no-console
      console.log('[ExploreCard] debug', {
        id: match.id,
        name: match.name,
        interests: interestsSample,
        personalityTags: personalitySample,
        distance: (match as any).distance,
        profileVideo: (match as any).profileVideo,
      });
    }
  } catch (e) {}

  // animated values for badges (Reanimated when available, Animated fallback otherwise)
  const verifiedScale = canUseReanimated ? ReanimatedModule.useSharedValue(0.85) : null;
  const verifiedOpacity = canUseReanimated ? ReanimatedModule.useSharedValue(0) : null;
  const activeScale = canUseReanimated ? ReanimatedModule.useSharedValue(0.85) : null;
  const activeOpacity = canUseReanimated ? ReanimatedModule.useSharedValue(0) : null;

  // AI pill animation values
  const pillScale = canUseReanimated ? ReanimatedModule.useSharedValue(0.85) : null;
  const pillOpacity = canUseReanimated ? ReanimatedModule.useSharedValue(0) : null;

  // measured widths for symmetric spacing
  const [leftBadgeWidth, setLeftBadgeWidth] = useState(0);
  const [rightBadgeWidth, setRightBadgeWidth] = useState(0);
  const MIN_SLOT = 44;

  // safe area insets (if hook available) — call unconditionally when present
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const insets: { left?: number; right?: number } = hasSafeAreaHook ? (useSafeAreaInsetsHook() as any) : { left: 0, right: 0 };

  const slotWidth = Math.max((leftBadgeWidth || 0) + (insets.left || 0), (rightBadgeWidth || 0) + (insets.right || 0), MIN_SLOT);

  // Reanimated shared value for animated slot width
  const slotWidthSV = canUseReanimated ? ReanimatedModule.useSharedValue(slotWidth) : null;
  const slotAnimatedStyle = canUseReanimated && slotWidthSV ? ReanimatedModule.useAnimatedStyle(() => ({ minWidth: slotWidthSV.value })) : undefined;

  // fallback Animated values
  const verifiedAnim = useRef(new Animated.Value(0)).current;
  const verifiedTranslate = useRef(new Animated.Value(6)).current;
  const activeAnim = useRef(new Animated.Value(0)).current;
  const activeTranslate = useRef(new Animated.Value(6)).current;
  const pillAnim = useRef(new Animated.Value(0)).current;
  const pillTranslate = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    if (match.verified) {
      if (canUseReanimated && verifiedScale && verifiedOpacity) {
        try {
          verifiedScale.value = ReanimatedModule.withTiming(1, { duration: 300 });
          verifiedOpacity.value = ReanimatedModule.withTiming(1, { duration: 300 });
        } catch (e) {}
      } else {
        Animated.parallel([
          Animated.timing(verifiedAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(verifiedTranslate, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
      }
    }

    if (match.isActiveNow || (match.lastActive && (() => {
      try { const then = new Date(match.lastActive!).getTime(); return Date.now() - then <= 3 * 60 * 60 * 1000; } catch { return false; }
    })())) {
      if (canUseReanimated && activeScale && activeOpacity) {
        try {
          activeScale.value = ReanimatedModule.withTiming(1, { duration: 300 });
          activeOpacity.value = ReanimatedModule.withTiming(1, { duration: 300 });
        } catch (e) {}
      } else {
        Animated.parallel([
          Animated.timing(activeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(activeTranslate, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
      }
    }

    // animate AI pill entrance on mount / when score changes
    if (canUseReanimated && pillScale && pillOpacity) {
      try {
        pillScale.value = ReanimatedModule.withTiming(1, { duration: 300 });
        pillOpacity.value = ReanimatedModule.withTiming(1, { duration: 300 });
      } catch (e) {}
    } else {
      Animated.parallel([
        Animated.timing(pillAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(pillTranslate, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [match.verified, match.isActiveNow, match.lastActive]);

  // animate slot width whenever measured badge widths or safe-area insets change
  useEffect(() => {
    const target = Math.max((leftBadgeWidth || 0) + (insets.left || 0), (rightBadgeWidth || 0) + (insets.right || 0), MIN_SLOT);
    if (canUseReanimated && slotWidthSV) {
      try {
        slotWidthSV.value = ReanimatedModule.withTiming(target, { duration: 250 });
      } catch (e) {}
    }
    // when Reanimated isn't available, the inline style uses `slotWidth` directly
  }, [leftBadgeWidth, rightBadgeWidth, insets.left, insets.right]);

  // animated styles
  const verifiedAnimatedStyle = canUseReanimated && verifiedScale && verifiedOpacity ? ReanimatedModule.useAnimatedStyle(() => ({
    transform: [{ scale: verifiedScale.value }, { translateY: verifiedScale.value ? 0 : 6 }],
    opacity: verifiedOpacity.value,
  })) : undefined;

  const activeAnimatedStyle = canUseReanimated && activeScale && activeOpacity ? ReanimatedModule.useAnimatedStyle(() => ({
    transform: [{ scale: activeScale.value }, { translateY: activeScale.value ? 0 : 6 }],
    opacity: activeOpacity.value,
  })) : undefined;

  const pillAnimatedStyle = canUseReanimated && pillScale && pillOpacity ? ReanimatedModule.useAnimatedStyle(() => ({
    transform: [{ scale: pillScale.value }, { translateY: pillScale.value ? 0 : 6 }],
    opacity: pillOpacity.value,
  })) : undefined;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardContent} activeOpacity={0.95} onPress={() => onPress?.(match.id)}>
        <Image source={{ uri: match.avatar_url || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=600&fit=crop&crop=face" }} style={styles.image} />

        {/* subtle full-card glow while previewing (modal playing) */}
        {isPreviewing ? (
          <View pointerEvents="none" style={styles.previewGlow} />
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
            <View style={styles.videoBadge} pointerEvents="none">
              <MaterialCommunityIcons name="play" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Top-row: left = Verified, center = AI pill, right = Active */}
        <View style={styles.topRow} pointerEvents="box-none">
          {canUseReanimated && ReanimatedAnimated && slotAnimatedStyle ? (
            <ReanimatedAnimated.View style={[styles.leftSlot, slotAnimatedStyle]} pointerEvents="none">
              {match.verified ? (
                // @ts-ignore
                <ReanimatedAnimated.View style={[styles.verifiedBadgeInline, verifiedAnimatedStyle]} pointerEvents="none" onLayout={(e: any) => { try { setLeftBadgeWidth(e.nativeEvent.layout.width || 0); } catch {} }}>
                  <MaterialCommunityIcons name="check-decagram" size={14} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </ReanimatedAnimated.View>
              ) : null}
            </ReanimatedAnimated.View>
          ) : (
            <View style={[styles.leftSlot, { minWidth: slotWidth }]} pointerEvents="none">
              {match.verified ? (
                canUseReanimated && verifiedAnimatedStyle && ReanimatedAnimated && ReanimatedAnimated.View ? (
                  // @ts-ignore
                  <ReanimatedAnimated.View style={[styles.verifiedBadgeInline, verifiedAnimatedStyle]} pointerEvents="none" onLayout={(e: any) => { try { setLeftBadgeWidth(e.nativeEvent.layout.width || 0); } catch {} }}>
                    <MaterialCommunityIcons name="check-decagram" size={14} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </ReanimatedAnimated.View>
                ) : (
                  <Animated.View style={[styles.verifiedBadgeInline, { transform: [{ translateY: verifiedTranslate }], opacity: verifiedAnim }]} pointerEvents="none" onLayout={(e: any) => { try { setLeftBadgeWidth(e.nativeEvent.layout.width || 0); } catch {} }}>
                    <MaterialCommunityIcons name="check-decagram" size={14} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </Animated.View>
                )
              ) : null}
            </View>
          )}

          <View style={styles.centerSlot} pointerEvents="none">
            {(() => {
              const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
              let score = typeof (match as any).aiScore === 'number' ? clamp((match as any).aiScore) : null;
              if (score === null) {
                try {
                  const id = match.id || '';
                  let h = 0;
                  for (let i = 0; i < id.length; i++) h = (h << 5) - h + id.charCodeAt(i);
                  const v = Math.abs(h) % 39;
                  score = 60 + v;
                } catch {
                  score = 75;
                }
              }

              if (canUseReanimated && pillAnimatedStyle && ReanimatedAnimated && ReanimatedAnimated.View) {
                // @ts-ignore
                return (
                  // @ts-ignore
                  <ReanimatedAnimated.View style={pillAnimatedStyle} pointerEvents="none">
                    <LinearGradientSafe colors={["#06b6d4", "#7c3aed"]} start={[0, 0]} end={[1, 1]} style={styles.aiPillInline}>
                      <Text style={styles.aiPillText}>{`${score}% Match`}</Text>
                    </LinearGradientSafe>
                  </ReanimatedAnimated.View>
                );
              }

              return (
                <Animated.View style={{ transform: [{ translateY: pillTranslate }], opacity: pillAnim }} pointerEvents="none">
                  <LinearGradientSafe colors={["#06b6d4", "#7c3aed"]} start={[0, 0]} end={[1, 1]} style={styles.aiPillInline}>
                    <Text style={styles.aiPillText}>{`${score}% Match`}</Text>
                  </LinearGradientSafe>
                </Animated.View>
              );
            })()}
          </View>

          {canUseReanimated && ReanimatedAnimated && slotAnimatedStyle ? (
            <ReanimatedAnimated.View style={[styles.rightSlot, slotAnimatedStyle]} pointerEvents="none">
              {(match.isActiveNow || recentlyActive) ? (
                // @ts-ignore
                <ReanimatedAnimated.View style={[styles.activeInline, match.isActiveNow ? styles.activeNowBg : styles.recentlyActiveBg, activeAnimatedStyle]} pointerEvents="none" onLayout={(e: any) => { try { setRightBadgeWidth(e.nativeEvent.layout.width || 0); } catch {} }}>
                  <View style={styles.activeDotSmall} />
                  <Text style={styles.activeTopText}>{match.isActiveNow ? 'Active Now' : 'Recently Active'}</Text>
                </ReanimatedAnimated.View>
              ) : null}
            </ReanimatedAnimated.View>
          ) : (
            <View style={[styles.rightSlot, { minWidth: slotWidth }]} pointerEvents="none">
              {(match.isActiveNow || recentlyActive) ? (
                canUseReanimated && activeAnimatedStyle && ReanimatedAnimated && ReanimatedAnimated.View ? (
                  // @ts-ignore
                  <ReanimatedAnimated.View style={[styles.activeInline, match.isActiveNow ? styles.activeNowBg : styles.recentlyActiveBg, activeAnimatedStyle]} pointerEvents="none" onLayout={(e: any) => { try { setRightBadgeWidth(e.nativeEvent.layout.width || 0); } catch {} }}>
                    <View style={styles.activeDotSmall} />
                    <Text style={styles.activeTopText}>{match.isActiveNow ? 'Active Now' : 'Recently Active'}</Text>
                  </ReanimatedAnimated.View>
                ) : (
                  <Animated.View style={[styles.activeInline, match.isActiveNow ? styles.activeNowBg : styles.recentlyActiveBg, { transform: [{ translateY: activeTranslate }], opacity: activeAnim }]} pointerEvents="none" onLayout={(e: any) => { try { setRightBadgeWidth(e.nativeEvent.layout.width || 0); } catch {} }}>
                    <View style={styles.activeDotSmall} />
                    <Text style={styles.activeTopText}>{match.isActiveNow ? 'Active Now' : 'Recently Active'}</Text>
                  </Animated.View>
                )
              ) : null}
            </View>
          )}
        </View>

        <LinearGradientSafe colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]} style={styles.gradient} />

        <BlurViewSafe intensity={60} tint="dark" style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{match.name}, {match.age}</Text>
            {/* keep inline small active badge for backward compatibility (hidden when top-right exists) */}
            {!match.isActiveNow && !recentlyActive ? null : null}
          </View>

          {/* Personality tags (up to 3) */}
          {(() => {
            const raw = (match as any).personalityTags || (match as any).personality || [];
            const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(/,\s*/).filter(Boolean) : []);
            const pills = arr.slice(0, 3);
            if (pills.length === 0) return null;
            return (
              <View style={styles.personalityRow}>
                {pills.map((p, i) => (
                  <View key={i} style={styles.personalityPill}>
                    <Text style={styles.personalityText}>{p}</Text>
                  </View>
                ))}
              </View>
            );
          })()}

          <Text style={styles.tagline}>{match.tagline}</Text>

          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker" size={14} color="#fff" />
            <Text style={styles.location}>{match.distance}</Text>
          </View>

          <View style={styles.tags}>
            {(() => {
              const ICON_MAP: Record<string, string> = {
                Travel: 'airplane-takeoff',      // more dynamic travel glyph
                Music: 'music-note',             // single-note glyph
                Business: 'briefcase',
                Art: 'brush',                    // brush instead of palette
                Fitness: 'run',                  // active runner glyph
              };
              const interests = Array.isArray(match.interests) ? match.interests : [];
              const visible = interests.slice(0, 3);
              const remaining = Math.max(0, interests.length - visible.length);

              return (
                <>
                  {visible.map((t, i) => {
                    const iconName = ICON_MAP[t];
                    return (
                      <View key={i} style={styles.tag} accessible accessibilityLabel={t}>
                        {iconName ? (
                          <MaterialCommunityIcons name={iconName as any} size={14} color="#fff" />
                        ) : (
                          <Text style={styles.tagText}>{t}</Text>
                        )}
                      </View>
                    );
                  })}
                  {remaining > 0 && (
                    <View style={styles.tag}><Text style={styles.tagText}>{`+${remaining}`}</Text></View>
                  )}
                </>
              );
            })()}
          </View>
        </BlurViewSafe>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", width: "100%", height: "100%", borderRadius: 24, overflow: "hidden", backgroundColor: "#fff" },
  cardContent: { flex: 1 },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "50%" },
  info: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 28 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  name: { color: "#fff", fontSize: 28, fontWeight: "800", flex: 1 },
  activeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(16,185,129,0.95)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff", marginRight: 6 },
  activeText: { color: "#fff", fontSize: 11 },
  tagline: { color: "#fff", marginBottom: 12, fontSize: 15 },
  locationRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  location: { color: "#fff", marginLeft: 6 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 6 },
  tagText: { color: "#fff", fontSize: 12 },
  verifiedBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    zIndex: 30,
  },
  verifiedText: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
  activeNowBg: { backgroundColor: 'rgba(16,185,129,0.95)' },
  recentlyActiveBg: { backgroundColor: 'rgba(99,102,241,0.9)' },
  activeDotSmall: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 8 },
  activeTopText: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
  aiPillText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  topRow: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 40 },
  leftSlot: { alignItems: 'flex-start' },
  centerSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rightSlot: { alignItems: 'flex-end' },
  verifiedBadgeInline: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  activeInline: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  aiPillInline: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, minWidth: 100, maxWidth: '70%', alignItems: 'center' },
  personalityRow: { flexDirection: 'row', marginBottom: 8, gap: 8 },
  personalityPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.02)'
  },
  personalityText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // video badge
  videoBadgeHit: {
    position: 'absolute',
    right: 12,
    bottom: 12,
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
    backgroundColor: 'rgba(6,182,212,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)'
  },
  previewGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,182,212,0.06)',
    borderRadius: 24,
    zIndex: 40,
  },
});
