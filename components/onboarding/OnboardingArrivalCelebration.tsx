import { AnimatedCompletionPortal } from "@/components/onboarding/AnimatedCompletionPortal";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CELEBRATION_PARTICLES = Array.from({ length: 24 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 24 - Math.PI / 2;
  return {
    angle,
    color: ["#FFE6A0", "#83DED8", "#D8B4FF", "#FFF9E8"][index % 4],
    delay: 120 + (index % 8) * 48,
    distance: 118 + (index % 5) * 22,
    size: 3 + (index % 4),
  };
});

type ParticleItem = (typeof CELEBRATION_PARTICLES)[number];

function CelebrationParticle({
  active,
  item,
  reducedMotion,
}: {
  active: boolean;
  item: ParticleItem;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (!active || reducedMotion) return;
    progress.value = withDelay(
      item.delay,
      withSequence(
        withTiming(1, { duration: 1150, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 1 }),
      ),
    );
    return () => cancelAnimation(progress);
  }, [active, item.delay, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.76, 1], [0, 1, 0.7, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: Math.cos(item.angle) * item.distance * progress.value },
      { translateY: Math.sin(item.angle) * item.distance * progress.value },
      { rotate: `${progress.value * 150}deg` },
      { scale: interpolate(progress.value, [0, 0.2, 1], [0.2, 1.15, 0.45], Extrapolation.CLAMP) },
    ] as ViewStyle["transform"],
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: item.size,
          height: item.size * (item.size % 2 === 0 ? 1.8 : 1),
          borderRadius: item.size,
          backgroundColor: item.color,
        },
        animatedStyle,
      ]}
    />
  );
}

type Props = {
  visible: boolean;
  onDismiss: () => void;
  name?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
};

export function OnboardingArrivalCelebration({
  visible,
  onDismiss,
  name,
  avatarUrl,
  location,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const entrance = useSharedValue(0);
  const copy = useSharedValue(0);
  const actions = useSharedValue(0);
  const glow = useSharedValue(0);
  const sheen = useSharedValue(0);
  const dismissedRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstName = useMemo(() => String(name || "").trim().split(/\s+/)[0] || null, [name]);
  const announcementNameRef = useRef<string | null>(firstName);
  const cleanLocation = useMemo(() => String(location || "").trim() || null, [location]);
  const compact = height < 720;
  const portalSize = Math.round(Math.min(width * 0.72, compact ? 220 : 286));

  useEffect(() => {
    if (firstName) announcementNameRef.current = firstName;
  }, [firstName]);

  useEffect(() => {
    cancelAnimation(entrance);
    cancelAnimation(copy);
    cancelAnimation(actions);
    cancelAnimation(glow);
    cancelAnimation(sheen);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (!visible) return;

    dismissedRef.current = false;
    if (reduceMotion) {
      entrance.value = 1;
      copy.value = 1;
      actions.value = 1;
      glow.value = 1;
      sheen.value = 0;
    } else {
      entrance.value = 0;
      copy.value = 0;
      actions.value = 0;
      glow.value = 0;
      sheen.value = 0;
      entrance.value = withSpring(1, { damping: 13, stiffness: 82, mass: 0.86 });
      copy.value = withDelay(620, withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) }));
      actions.value = withDelay(1040, withSpring(1, { damping: 15, stiffness: 115 }));
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
      sheen.value = withDelay(
        1220,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 1050, easing: Easing.inOut(Easing.cubic) }),
            withTiming(0, { duration: 1 }),
            withDelay(1800, withTiming(0, { duration: 1 })),
          ),
          -1,
          false,
        ),
      );
    }

    const avatarHapticTimer = setTimeout(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }, reduceMotion ? 0 : 300);
    const actionHapticTimer = setTimeout(() => {
      if (!reduceMotion) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      }
    }, 1060);
    const announcementTimer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(
        `${announcementNameRef.current ? `Welcome, ${announcementNameRef.current}. ` : "Welcome. "}Your profile is live.`,
      );
    }, reduceMotion ? 100 : 900);

    return () => {
      clearTimeout(avatarHapticTimer);
      clearTimeout(actionHapticTimer);
      clearTimeout(announcementTimer);
      cancelAnimation(entrance);
      cancelAnimation(copy);
      cancelAnimation(actions);
      cancelAnimation(glow);
      cancelAnimation(sheen);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [actions, copy, entrance, glow, reduceMotion, sheen, visible]);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    void Haptics.selectionAsync().catch(() => undefined);
    if (reduceMotion) {
      onDismiss();
      return;
    }
    actions.value = withTiming(0, { duration: 130, easing: Easing.in(Easing.quad) });
    copy.value = withTiming(0, { duration: 170, easing: Easing.in(Easing.quad) });
    entrance.value = withDelay(
      50,
      withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }),
    );
    dismissTimerRef.current = setTimeout(onDismiss, 280);
  }, [actions, copy, entrance, onDismiss, reduceMotion]);

  const stageStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: interpolate(entrance.value, [0, 1], [34, 0], Extrapolation.CLAMP) },
      { scale: interpolate(entrance.value, [0, 1], [0.76, 1], Extrapolation.CLAMP) },
    ] as ViewStyle["transform"],
  }));
  const goldGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.28 + glow.value * 0.34,
    transform: [{ scale: 0.9 + glow.value * 0.18 }] as ViewStyle["transform"],
  }));
  const tealGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.22 + glow.value * 0.28,
    transform: [{ scale: 1.04 - glow.value * 0.12 }] as ViewStyle["transform"],
  }));
  const portalGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.34 + glow.value * 0.34,
    transform: [{ scale: 0.9 + glow.value * 0.18 }] as ViewStyle["transform"],
  }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.value,
    transform: [{ translateY: 18 * (1 - copy.value) }] as ViewStyle["transform"],
  }));
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actions.value,
    transform: [{ translateY: 16 * (1 - actions.value) }] as ViewStyle["transform"],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheen.value, [0, 0.15, 0.8, 1], [0, 0.65, 0.35, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(sheen.value, [0, 1], [-180, 180]) },
      { rotate: "18deg" },
    ] as ViewStyle["transform"],
  }));

  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      navigationBarTranslucent
      onRequestClose={dismiss}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View
        accessibilityViewIsModal
        style={styles.modalRoot}
        testID="onboarding-arrival-celebration"
      >
        <LinearGradient
          colors={["#080B17", "#101629", "#152B30", "#0B151D"]}
          locations={[0, 0.32, 0.72, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.94, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={[styles.ambientGlow, styles.ambientGlowGold, goldGlowStyle]} />
        <Animated.View style={[styles.ambientGlow, styles.ambientGlowTeal, tealGlowStyle]} />
        <View style={styles.constellation} pointerEvents="none">
          {Array.from({ length: 18 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.constellationStar,
                {
                  left: `${8 + ((index * 31) % 88)}%`,
                  top: `${5 + ((index * 47) % 88)}%`,
                  opacity: 0.18 + (index % 4) * 0.12,
                  transform: [{ scale: 0.65 + (index % 3) * 0.25 }],
                },
              ]}
            />
          ))}
        </View>

        <Pressable
          accessibilityLabel="Skip celebration and enter Vibes"
          accessibilityRole="button"
          hitSlop={12}
          onPress={dismiss}
          style={[styles.closeButton, { top: insets.top + 10 }]}
        >
          <MaterialCommunityIcons color="rgba(255,255,255,0.68)" name="close" size={19} />
        </Pressable>

        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + (compact ? 30 : 48),
              paddingBottom: Math.max(insets.bottom, 18) + 12,
            },
          ]}
        >
          <Animated.View style={[styles.stage, stageStyle]}>
            <Animated.View
              style={[
                styles.portalAura,
                { width: portalSize * 0.9, height: portalSize * 0.9, borderRadius: portalSize },
                portalGlowStyle,
              ]}
            />
            {!reduceMotion
              ? CELEBRATION_PARTICLES.map((item, index) => (
                <CelebrationParticle
                  active={visible}
                  item={item}
                  key={index}
                  reducedMotion={reduceMotion}
                />
              ))
              : null}
            <AnimatedCompletionPortal
              avatarUri={avatarUrl}
              celebrating={visible}
              size={portalSize}
            />
          </Animated.View>

          <Animated.View style={[styles.copy, compact && styles.copyCompact, copyStyle]}>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>YOUR STORY IS LIVE</Text>
            </View>
            <Text
              accessibilityRole="header"
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              numberOfLines={1}
              style={[styles.title, compact && styles.titleCompact]}
            >
              {firstName ? `Welcome, ${firstName}` : "Welcome to Betweener"}
            </Text>
            <Text style={styles.body}>
              Your world is ready. Meet people who connect with your story, your roots, and where you are going next.
            </Text>
            {cleanLocation ? (
              <View style={styles.locationPill}>
                <MaterialCommunityIcons color="#9FE4DD" name="map-marker-outline" size={14} />
                <Text numberOfLines={1} style={styles.locationText}>{cleanLocation}</Text>
              </View>
            ) : null}
          </Animated.View>

          <Animated.View style={[styles.actions, actionsStyle]}>
            <Pressable
              accessibilityHint="Closes this celebration and opens your Vibes discovery experience"
              accessibilityLabel="Enter Vibes"
              accessibilityRole="button"
              onPress={dismiss}
              style={({ pressed }) => [styles.ctaPressable, pressed && styles.ctaPressed]}
            >
              <LinearGradient
                colors={["#A779FF", "#7445ED", "#5030C9"]}
                end={{ x: 1, y: 1 }}
                start={{ x: 0, y: 0 }}
                style={styles.cta}
              >
                <Animated.View pointerEvents="none" style={[styles.ctaSheen, sheenStyle]}>
                  <LinearGradient
                    colors={["transparent", "rgba(255,255,255,0.42)", "transparent"]}
                    end={{ x: 1, y: 0 }}
                    start={{ x: 0, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <Text style={styles.ctaText}>Enter Vibes</Text>
                <MaterialCommunityIcons color="#FFFFFF" name="arrow-right" size={20} />
              </LinearGradient>
            </Pressable>
            <View style={styles.assuranceRow}>
              <MaterialCommunityIcons color="rgba(218,241,238,0.84)" name="shield-check-outline" size={14} />
              <Text style={styles.assuranceText}>Private by design · Yours to refine</Text>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: "#080B17", overflow: "hidden" },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  closeButton: {
    position: "absolute",
    right: 20,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ambientGlow: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
  },
  ambientGlowGold: {
    top: -130,
    right: -120,
    backgroundColor: "rgba(223,179,91,0.18)",
    shadowColor: "#EAC46A",
    shadowOpacity: 0.35,
    shadowRadius: 80,
  },
  ambientGlowTeal: {
    bottom: -160,
    left: -150,
    backgroundColor: "rgba(72,184,178,0.16)",
    shadowColor: "#5ECAC5",
    shadowOpacity: 0.3,
    shadowRadius: 90,
  },
  constellation: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  constellationStar: {
    position: "absolute",
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FFF6D8",
    shadowColor: "#FFF6D8",
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  stage: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  portalAura: {
    position: "absolute",
    backgroundColor: "rgba(246,207,112,0.18)",
    shadowColor: "#F5D77E",
    shadowOpacity: 0.55,
    shadowRadius: 46,
  },
  particle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    zIndex: 8,
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowRadius: 7,
  },
  copy: { alignItems: "center", maxWidth: 430, marginTop: -8, zIndex: 10 },
  copyCompact: { marginTop: -18 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 14,
    backgroundColor: "rgba(245,210,128,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(245,210,128,0.34)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F5D280",
    shadowColor: "#F5D280",
    shadowOpacity: 1,
    shadowRadius: 7,
  },
  livePillText: {
    color: "#F8D98F",
    fontFamily: "Manrope_700Bold",
    fontSize: 10,
    letterSpacing: 2.1,
  },
  title: {
    color: "#FFF8E9",
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 38,
    lineHeight: 44,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  titleCompact: { fontSize: 32, lineHeight: 38 },
  body: {
    color: "rgba(225,235,235,0.78)",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 350,
    marginTop: 12,
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 300,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(94,202,197,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(115,221,214,0.24)",
  },
  locationText: {
    flexShrink: 1,
    color: "rgba(213,241,238,0.84)",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
  },
  actions: { width: "100%", maxWidth: 380, alignItems: "center", zIndex: 10 },
  ctaPressable: {
    width: "100%",
    borderRadius: 22,
    shadowColor: "#7F52F2",
    shadowOpacity: 0.46,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  cta: {
    minHeight: 58,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  ctaSheen: {
    position: "absolute",
    top: -18,
    bottom: -18,
    width: 80,
  },
  ctaText: { color: "#FFFFFF", fontFamily: "Manrope_800ExtraBold", fontSize: 16 },
  assuranceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  assuranceText: {
    color: "rgba(218,234,232,0.78)",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.2,
  },
});
