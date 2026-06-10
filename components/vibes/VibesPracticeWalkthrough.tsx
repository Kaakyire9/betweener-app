import IntentMark from "@/components/icons/IntentMark";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import GlassSurface from "@/components/vibes/depth/GlassSurface";
import VibesActionDock from "@/components/vibes/depth/VibesActionDock";
import { VIBES_DEPTH_COLORS } from "@/components/vibes/depth/platformGlass";
import type { VibesDepthMetrics } from "@/components/vibes/depth/useVibesResponsiveMetrics";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, PanResponder, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from "react-native";

export type PracticeStep =
  | "intro"
  | "intentPrompt"
  | "intentForm"
  | "intentExplain"
  | "noticePrompt"
  | "noticeExplain"
  | "passPrompt"
  | "passExplain";

type PracticeIntentType = "connect" | "like_with_note" | "date_request";

type VibesPracticeWalkthroughProps = {
  metrics: VibesDepthMetrics;
  onComplete: () => void;
  onGestureLockChange?: (locked: boolean) => void;
  initialStep?: PracticeStep;
  onStepChange?: (step: PracticeStep) => void;
  allowClose?: boolean;
  onClose?: () => void;
};

type PracticeCardData = {
  id: string;
  name: string;
  age: number;
  location: string;
  countryCode: string;
  initials: string;
  photo: ImageSourcePropType;
  shared: string[];
  accent: "teal" | "purple";
  intro?: boolean;
};

type CelebrationState = {
  key: number;
  title: string;
  accent: "teal" | "purple" | "cream";
} | null;

const PRACTICE_CARDS: PracticeCardData[] = [
  {
    id: "vibes-practice-notice",
    name: "Ama Mensah",
    age: 29,
    location: "Accra",
    countryCode: "GH",
    initials: "AM",
    photo: require("../../assets/images/vibes/walkthrough-intent-profile.png"),
    shared: ["Music", "Movies", "Travel"],
    accent: "teal",
    intro: true,
  },
  {
    id: "vibes-practice-pass",
    name: "Emma Rose",
    age: 27,
    location: "London",
    countryCode: "GB",
    initials: "EM",
    photo: require("../../assets/images/vibes/walkthrough-notice-profile.png"),
    shared: ["Music", "Travel"],
    accent: "purple",
  },
  {
    id: "vibes-practice-pass-final",
    name: "Kofi Mensah",
    age: 31,
    location: "Kumasi",
    countryCode: "GH",
    initials: "KM",
    photo: require("../../assets/images/vibes/walkthrough-pass-profile.png"),
    shared: ["Fitness", "Outdoors"],
    accent: "teal",
  },
];

const STEP_COPY: Record<PracticeStep, { eyebrow: string; title: string; body: string; cta?: string }> = {
  intro: {
    eyebrow: "Practice walkthrough",
    title: "Learn the three moves first",
    body: "You will practice Intent, Notice, and Pass on guided profiles before the full deck opens.",
    cta: "Start practice",
  },
  intentPrompt: {
    eyebrow: "Step 1 of 3",
    title: "Start with Intent",
    body: "Swipe up or press Intent. It opens a deliberate request.",
  },
  intentForm: {
    eyebrow: "Refine the tone",
    title: "Choose the move",
    body: "Pick the shape of your opening, then send it.",
  },
  intentExplain: {
    eyebrow: "Intent placed",
    title: "This is how Betweener begins",
    body: "Intent stays open for 48 hours. Use it when a Vibe deserves more than a quick signal.",
    cta: "Next: Notice",
  },
  noticePrompt: {
    eyebrow: "Step 2 of 3",
    title: "Send a Notice",
    body: "Drag right or press Notice. It is light interest, not the main move.",
  },
  noticeExplain: {
    eyebrow: "Notice sent",
    title: "They can see you noticed them",
    body: "Notice stays visible for 72 hours. Use it when you want to be seen without opening something deeper.",
    cta: "Next: Pass",
  },
  passPrompt: {
    eyebrow: "Step 3 of 3",
    title: "Pass with care",
    body: "Drag left or press Pass. It clears the Vibe quietly.",
  },
  passExplain: {
    eyebrow: "Passed",
    title: "You passed quietly",
    body: "Quiet, clean, and private. The full dock appears after this rehearsal.",
    cta: "Start real Vibes",
  },
};

const DOCK_LESSONS = [
  { icon: "close", label: "Pass", body: "Quiet exit." },
  { icon: "heart-outline", label: "Notice", body: "Light interest for 72 hours." },
  { icon: "intent-mark", label: "Intent", body: "Deliberate request for 48 hours." },
];

const INTENT_OPTIONS = [
  { type: "connect" as const, label: "Ask to chat", icon: "message-outline" },
  { type: "like_with_note" as const, label: "Like with note", icon: "text-box-plus-outline" },
  { type: "date_request" as const, label: "Suggest a date", icon: "calendar-heart" },
];

function PracticeVibeCard({
  card,
  metrics,
  isDark,
  theme,
}: {
  card: PracticeCardData;
  metrics: VibesDepthMetrics;
  isDark: boolean;
  theme: typeof Colors.light;
}) {
  const styles = useMemo(
    () => createPracticeCardStyles(theme, isDark, metrics, card.accent),
    [card.accent, isDark, metrics, theme],
  );
  const sharedLabel = card.shared.length >= 3 ? `${card.shared.length} shared interests` : `Shared: ${card.shared.join(", ")}`;

  return (
    <View style={styles.cardShell}>
      <LinearGradientSafe
        colors={isDark
          ? ["rgba(7,30,34,0.98)", "rgba(4,18,22,0.96)", "rgba(2,8,12,0.98)"]
          : ["rgba(255,250,244,0.98)", "rgba(233,249,246,0.96)", "rgba(244,232,208,0.96)"]}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.card}
      >
        <Image
          source={card.photo}
          style={styles.photo}
          resizeMode="cover"
        />

        <View style={styles.noiseVeil} pointerEvents="none" />
        <View style={styles.rimTop} pointerEvents="none" />
        <View style={styles.rimBottom} pointerEvents="none" />
        <View style={styles.auraLarge} pointerEvents="none" />

        <View style={styles.topBadges} pointerEvents="none">
          <View style={styles.practiceBadge}>
            <MaterialCommunityIcons name="image-outline" size={13} color={theme.tint} />
            <Text style={styles.practiceBadgeText}>Guided profile</Text>
          </View>
        </View>

        <LinearGradientSafe
          pointerEvents="none"
          colors={isDark
            ? ["rgba(0,0,0,0)", "rgba(0,0,0,0.24)", "rgba(0,0,0,0.82)"]
            : ["rgba(0,0,0,0)", "rgba(7,30,34,0.24)", "rgba(7,30,34,0.72)"]}
          style={styles.bottomFade}
        />

        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1} allowFontScaling={false}>{card.name}</Text>
            <Text style={styles.age} allowFontScaling={false}>{"\u00b7"} {card.age}</Text>
          </View>
          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker" size={14} color="#fff" />
            <Text style={styles.location} numberOfLines={1}>{card.location}</Text>
            <Text style={styles.countryCode}>{card.countryCode}</Text>
          </View>
          <View style={styles.contextRow}>
            <View style={styles.sharedChip}>
              <MaterialCommunityIcons name="music-note" size={13} color="#EFFFFF" />
              <Text style={styles.sharedText} numberOfLines={1}>{sharedLabel}</Text>
            </View>
            {card.intro ? (
              <View style={styles.introChip}>
                <MaterialCommunityIcons name="play-circle-outline" size={13} color="#EFFFFF" />
                <Text style={styles.introText}>Intro</Text>
              </View>
            ) : null}
          </View>
        </View>
      </LinearGradientSafe>
    </View>
  );
}

export default function VibesPracticeWalkthrough({
  metrics,
  onComplete,
  onGestureLockChange,
  initialStep = "intentPrompt",
  onStepChange,
  allowClose = false,
  onClose,
}: VibesPracticeWalkthroughProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDark = (colorScheme ?? "light") === "dark";
  const styles = useMemo(() => createStyles(theme, isDark, metrics), [isDark, metrics, theme]);
  const [step, setStep] = useState<PracticeStep>(initialStep);
  const [selectedIntentType, setSelectedIntentType] = useState<PracticeIntentType | null>(null);
  const [hasPickedIntentOption, setHasPickedIntentOption] = useState(false);
  const [previewIntentOptionIndex, setPreviewIntentOptionIndex] = useState(0);
  const [celebration, setCelebration] = useState<CelebrationState>(null);
  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const hint = useRef(new Animated.Value(0)).current;
  const intentHint = useRef(new Animated.Value(0)).current;
  const focusPulse = useRef(new Animated.Value(0)).current;
  const ctaHint = useRef(new Animated.Value(0)).current;
  const celebrationPulse = useRef(new Animated.Value(0)).current;
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptDirection = step === "noticePrompt" ? "right" : step === "passPrompt" ? "left" : null;

  const activeCard =
    step === "intro" || step === "intentPrompt" || step === "intentForm" || step === "intentExplain"
      ? PRACTICE_CARDS[0]
      : step === "noticePrompt" || step === "noticeExplain"
        ? PRACTICE_CARDS[1]
        : PRACTICE_CARDS[2];

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    onStepChange?.(step);
  }, [onStepChange, step]);

  useEffect(() => {
    translate.setValue({ x: 0, y: 0 });
  }, [activeCard.id, translate]);

  useEffect(() => {
    if (step !== "intentForm") {
      setHasPickedIntentOption(false);
      setPreviewIntentOptionIndex(0);
      setSelectedIntentType(null);
      return;
    }
    if (hasPickedIntentOption) return;
    const interval = setInterval(() => {
      setPreviewIntentOptionIndex((current) => (current + 1) % INTENT_OPTIONS.length);
    }, 920);
    return () => clearInterval(interval);
  }, [hasPickedIntentOption, step]);

  useEffect(() => {
    if (!promptDirection) {
      hint.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(180),
        Animated.timing(hint, { toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(120),
        Animated.timing(hint, { toValue: 0, duration: 680, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      hint.setValue(0);
    };
  }, [hint, promptDirection]);

  useEffect(() => {
    if (step !== "intentPrompt") {
      intentHint.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(220),
        Animated.timing(intentHint, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(120),
        Animated.timing(intentHint, { toValue: 0, duration: 660, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      intentHint.setValue(0);
    };
  }, [intentHint, step]);

  useEffect(() => {
    if (step !== "intentForm" || !hasPickedIntentOption) {
      focusPulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(140),
        Animated.timing(focusPulse, { toValue: 1, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(140),
        Animated.timing(focusPulse, { toValue: 0, duration: 760, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      focusPulse.setValue(0);
    };
  }, [focusPulse, hasPickedIntentOption, step]);

  useEffect(() => {
    if (!STEP_COPY[step].cta) {
      ctaHint.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(160),
        Animated.timing(ctaHint, { toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(120),
        Animated.timing(ctaHint, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      ctaHint.setValue(0);
    };
  }, [ctaHint, step]);

  useEffect(() => {
    if (!celebration) {
      celebrationPulse.setValue(0);
      return;
    }
    Animated.sequence([
      Animated.timing(celebrationPulse, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(220),
      Animated.timing(celebrationPulse, {
        toValue: 0,
        duration: 240,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCelebration(null);
    });
  }, [celebration, celebrationPulse]);

  useEffect(() => () => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, []);

  const triggerCelebration = useCallback((title: string, accent: "teal" | "purple" | "cream") => {
    setCelebration({
      key: Date.now(),
      title,
      accent,
    });
  }, []);

  const resetCard = useCallback(() => {
    Animated.spring(translate, {
      toValue: { x: 0, y: 0 },
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [translate]);

  const completeSwipe = useCallback((direction: "left" | "right") => {
    if (direction === "right" && step !== "noticePrompt") return;
    if (direction === "left" && step !== "passPrompt") return;

    try {
      if (direction === "right") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {}

    Animated.timing(translate, {
      toValue: { x: direction === "right" ? metrics.cardWidth * 1.2 : -metrics.cardWidth * 1.2, y: -14 },
      duration: 260,
      useNativeDriver: true,
    }).start(() => {
      setStep(direction === "right" ? "noticeExplain" : "passExplain");
      translate.setValue({ x: 0, y: 0 });
    });
  }, [metrics.cardWidth, step, translate]);

  const openIntentForm = useCallback(() => {
    if (step !== "intentPrompt") return;
    try { Haptics.selectionAsync(); } catch {}
    setStep("intentForm");
  }, [step]);

  const completeIntent = useCallback(() => {
    if (step !== "intentForm") return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    Animated.timing(translate, {
      toValue: { x: 0, y: -metrics.cardHeight * 1.08 },
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      setStep("intentExplain");
      translate.setValue({ x: 0, y: 0 });
    });
  }, [metrics.cardHeight, step, translate]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => step === "intentPrompt" || Boolean(promptDirection),
        onStartShouldSetPanResponderCapture: () => step === "intentPrompt" || Boolean(promptDirection),
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          if (step === "intentPrompt") {
            return gesture.dy < -4 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
          }
          return Boolean(promptDirection) && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
        },
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (step === "intentPrompt") {
            return gesture.dy < -4 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
          }
          return Boolean(promptDirection) && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
        },
        onPanResponderGrant: () => {
          if (step === "intentPrompt" || promptDirection) onGestureLockChange?.(true);
        },
        onPanResponderMove: (_, gesture) => {
          if (step === "intentPrompt") {
            translate.setValue({
              x: gesture.dx * 0.04,
              y: Math.max(-118, Math.min(0, gesture.dy * 0.82)),
            });
            return;
          }
          translate.setValue({ x: gesture.dx, y: gesture.dy * 0.28 });
        },
        onPanResponderRelease: (_, gesture) => {
          if (step === "intentPrompt") {
            if (gesture.dy < -Math.max(48, metrics.cardHeight * 0.075)) {
              openIntentForm();
              resetCard();
              onGestureLockChange?.(false);
              return;
            }
            resetCard();
            onGestureLockChange?.(false);
            return;
          }
          const threshold = metrics.cardWidth * 0.22;
          if (promptDirection === "right" && gesture.dx > threshold) {
            completeSwipe("right");
            onGestureLockChange?.(false);
            return;
          }
          if (promptDirection === "left" && gesture.dx < -threshold) {
            completeSwipe("left");
            onGestureLockChange?.(false);
            return;
          }
          resetCard();
          onGestureLockChange?.(false);
        },
        onPanResponderTerminate: () => {
          resetCard();
          onGestureLockChange?.(false);
        },
        onShouldBlockNativeResponder: () => true,
      }),
    [completeSwipe, metrics.cardHeight, metrics.cardWidth, onGestureLockChange, openIntentForm, promptDirection, resetCard, step, translate],
  );

  const goNext = useCallback(() => {
    if (step === "intro") {
      setStep("intentPrompt");
      return;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    if (step === "intentExplain") {
      triggerCelebration("Step complete", "purple");
      transitionTimeoutRef.current = setTimeout(() => {
        setStep("noticePrompt");
        transitionTimeoutRef.current = null;
      }, 460);
      return;
    }
    if (step === "noticeExplain") {
      triggerCelebration("Step complete", "teal");
      transitionTimeoutRef.current = setTimeout(() => {
        setStep("passPrompt");
        transitionTimeoutRef.current = null;
      }, 460);
      return;
    }
    if (step === "passExplain") {
      triggerCelebration("Practice complete", "cream");
      transitionTimeoutRef.current = setTimeout(() => {
        onComplete();
        transitionTimeoutRef.current = null;
      }, 460);
    }
  }, [onComplete, step, triggerCelebration]);

  const cardAnimatedStyle: any = {
    transform: [
      { translateX: translate.x },
      { translateY: translate.y },
      {
        rotate: translate.x.interpolate({
          inputRange: [-metrics.cardWidth, 0, metrics.cardWidth],
          outputRange: ["-8deg", "0deg", "8deg"],
          extrapolate: "clamp",
        }),
      },
    ],
  };

  const handStyle: any = {
    opacity: hint.interpolate({ inputRange: [0, 1], outputRange: [0.34, 1] }),
    transform: [
      {
        translateX: hint.interpolate({
          inputRange: [0, 1],
          outputRange: [0, promptDirection === "left" ? -32 : 32],
        }),
      },
      {
        translateY: hint.interpolate({
          inputRange: [0, 1],
          outputRange: [6, -2],
        }),
      },
      {
        rotate: hint.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", promptDirection === "left" ? "-8deg" : "8deg"],
        }),
      },
    ],
  };

  const guidePillStyle: any = {
    opacity: hint.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }),
    transform: [
      {
        translateY: hint.interpolate({ inputRange: [0, 1], outputRange: [4, -2] }),
      },
    ],
  };

  const intentHandStyle: any = {
    opacity: intentHint.interpolate({ inputRange: [0, 1], outputRange: [0.34, 1] }),
    transform: [
      {
        translateY: intentHint.interpolate({ inputRange: [0, 1], outputRange: [10, -28] }),
      },
      {
        scale: intentHint.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.04] }),
      },
    ],
  };

  const intentGuidePillStyle: any = {
    opacity: intentHint.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }),
    transform: [
      {
        translateY: intentHint.interpolate({ inputRange: [0, 1], outputRange: [4, -4] }),
      },
    ],
  };

  const intentSendPulseStyle: any = {
    transform: [
      {
        scale: focusPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
      },
    ],
    opacity: focusPulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }),
  };

  const ctaPointerStyle: any = {
    opacity: ctaHint.interpolate({ inputRange: [0, 1], outputRange: [0.52, 1] }),
    transform: [
      {
        translateX: ctaHint.interpolate({ inputRange: [0, 1], outputRange: [-2, 4] }),
      },
      {
        scale: ctaHint.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
      },
    ],
  };

  const celebrationStyle: any = {
    opacity: celebrationPulse.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
    transform: [
      {
        scale: celebrationPulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
      },
      {
        translateY: celebrationPulse.interpolate({ inputRange: [0, 1], outputRange: [10, -4] }),
      },
    ],
  };

  const activeIntentPointerIndex = hasPickedIntentOption ? null : previewIntentOptionIndex;

  const highlightedDockAction =
    step === "intentPrompt"
      ? "intent"
      : step === "noticePrompt"
        ? "like"
        : step === "passPrompt"
          ? "pass"
          : null;

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.cardLayer, cardAnimatedStyle]} {...panResponder.panHandlers}>
        <PracticeVibeCard card={activeCard} metrics={metrics} isDark={isDark} theme={theme} />
      </Animated.View>

      {celebration ? (
        <Animated.View
          key={celebration.key}
          style={[
            styles.celebrationWrap,
            celebrationStyle,
            celebration.accent === "purple"
              ? styles.celebrationWrapPurple
              : celebration.accent === "cream"
                ? styles.celebrationWrapCream
                : styles.celebrationWrapTeal,
          ]}
          pointerEvents="none"
        >
          <Text style={styles.celebrationEmoji}>✦</Text>
          <Text style={styles.celebrationText}>{celebration.title}</Text>
        </Animated.View>
      ) : null}

      {promptDirection ? (
        <View style={styles.dragTrackWrap} pointerEvents="none">
          <View style={styles.dragTrack} />
          <Animated.View style={[styles.dragGuidePill, guidePillStyle]}>
            <Text style={styles.dragGuidePillEmoji}>{promptDirection === "left" ? "👈🏼" : "👉🏼"}</Text>
            <Text style={styles.dragGuidePillText}>{promptDirection === "left" ? "Drag left" : "Drag right"}</Text>
          </Animated.View>
          <Animated.View style={[styles.handHint, handStyle]}>
            <Text style={styles.dragHintEmoji}>{promptDirection === "left" ? "👈🏼" : "👉🏼"}</Text>
          </Animated.View>
        </View>
      ) : null}

      <GlassSurface
        radius={20}
        intensity={18}
        borderOpacity={isDark ? 0.08 : 0.12}
        fallbackColor={isDark ? "rgba(3,14,18,0.80)" : "rgba(255,250,244,0.84)"}
        style={styles.lessonPanel}
        contentStyle={styles.lessonPanelSurface}
      >
        <LinearGradientSafe
          pointerEvents="none"
          colors={isDark
            ? ["rgba(19,168,168,0.12)", "rgba(7,30,34,0)"]
            : ["rgba(19,168,168,0.10)", "rgba(255,250,244,0)"]}
          start={[0, 0]}
          end={[1, 1]}
          style={StyleSheet.absoluteFill}
        />
        {allowClose ? (
          <TouchableOpacity
            style={styles.closeButton}
            activeOpacity={0.86}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close practice walkthrough"
          >
            <MaterialCommunityIcons
              name="close"
              size={18}
              color={isDark ? VIBES_DEPTH_COLORS.cream : "#0F3D3E"}
            />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.eyebrow}>{STEP_COPY[step].eyebrow}</Text>
        <Text style={styles.title}>{STEP_COPY[step].title}</Text>
        <Text style={styles.body}>{STEP_COPY[step].body}</Text>
        {step === "intro" ? (
          <View style={styles.introLessonGrid}>
            {DOCK_LESSONS.map((lesson) => (
              <View key={lesson.label} style={styles.introLesson}>
                <View style={styles.introLessonIcon}>
                  {lesson.icon === "intent-mark" ? (
                    <IntentMark size={14} color={theme.tint} strokeWidth={2.25} />
                  ) : (
                    <MaterialCommunityIcons name={lesson.icon as any} size={13} color={theme.tint} />
                  )}
                </View>
                <View style={styles.introLessonCopy}>
                  <Text style={styles.introLessonLabel}>{lesson.label}</Text>
                  <Text style={styles.introLessonBody}>{lesson.body}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
        {step === "passExplain" ? (
          <View style={styles.dockLessonGrid}>
            {DOCK_LESSONS.map((lesson) => (
              <View key={lesson.label} style={styles.dockLesson}>
                <View style={styles.dockLessonIcon}>
                  {lesson.icon === "intent-mark" ? (
                    <IntentMark size={14} color={theme.tint} strokeWidth={2.25} />
                  ) : (
                    <MaterialCommunityIcons name={lesson.icon as any} size={13} color={theme.tint} />
                  )}
                </View>
                <View style={styles.dockLessonCopy}>
                  <Text style={styles.dockLessonLabel}>{lesson.label}</Text>
                  <Text style={styles.dockLessonBody}>{lesson.body}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
        {step === "intentForm" ? (
          <View style={styles.intentForm}>
            <View style={styles.intentProfileRow}>
              <Image
                source={PRACTICE_CARDS[0].photo}
                style={styles.intentProfilePhoto}
                resizeMode="cover"
              />
              <View style={styles.intentProfileCopy}>
                <Text style={styles.intentProfileName} numberOfLines={1}>
                  {PRACTICE_CARDS[0].name} {"\u00b7"} {PRACTICE_CARDS[0].age}
                </Text>
                <Text style={styles.intentProfileMeta} numberOfLines={1}>
                  {PRACTICE_CARDS[0].location} {PRACTICE_CARDS[0].countryCode} - {PRACTICE_CARDS[0].shared.slice(0, 2).join(", ")}
                </Text>
              </View>
            </View>
            {INTENT_OPTIONS.map((option, index) => {
              const selected = hasPickedIntentOption && selectedIntentType === option.type;
              const previewed = activeIntentPointerIndex === index;
              return (
                <TouchableOpacity
                  key={option.type}
                  style={[styles.intentOption, selected ? styles.intentOptionActive : null, previewed ? styles.intentOptionPreview : null]}
                  activeOpacity={0.86}
                  onPress={() => {
                    setSelectedIntentType(option.type);
                    setHasPickedIntentOption(true);
                    try { Haptics.selectionAsync(); } catch {}
                  }}
                >
                  {previewed ? <Text style={styles.intentOptionPointer}>👉🏼</Text> : <View style={styles.intentOptionPointerSpacer} />}
                  <MaterialCommunityIcons name={option.icon as any} size={16} color={selected ? "#F8FFFF" : theme.tint} />
                  <Text style={[styles.intentOptionText, selected ? styles.intentOptionTextActive : null]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.practiceNote}>
              <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.tint} />
              <Text style={styles.practiceNoteText}>Example note: I liked your music vibe. Want to chat?</Text>
            </View>
            <Animated.View style={[intentSendPulseStyle, hasPickedIntentOption ? styles.intentSendWrapFocused : null]}>
              {hasPickedIntentOption ? <Text style={styles.intentSendPointer}>👉🏼</Text> : null}
              <TouchableOpacity style={styles.intentSendButton} activeOpacity={0.88} onPress={completeIntent}>
                <IntentMark size={17} color="#F8FFFF" strokeWidth={2.2} />
                <Text style={styles.intentSendText}>Send practice request</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        ) : null}
        {STEP_COPY[step].cta ? (
          <Animated.View style={[styles.lessonButtonWrap, ctaPointerStyle]}>
            <Text style={styles.lessonButtonPointer}>👉🏼</Text>
            <TouchableOpacity style={styles.lessonButton} activeOpacity={0.88} onPress={goNext}>
              <Text style={styles.lessonButtonText}>{STEP_COPY[step].cta}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}
      </GlassSurface>

      {step === "intentPrompt" ? (
        <>
          <View style={styles.intentDragTrackWrap} pointerEvents="none">
            <View style={styles.intentDragTrack} />
            <Animated.View style={[styles.intentGuidePill, intentGuidePillStyle]}>
              <Text style={styles.intentGuidePillEmoji}>👆🏼</Text>
              <Text style={styles.intentGuidePillText}>Swipe up or press Intent</Text>
            </Animated.View>
            <Animated.View style={[styles.intentHandHint, intentHandStyle]}>
              <Text style={styles.dragHintEmoji}>👆🏼</Text>
            </Animated.View>
          </View>
        </>
      ) : null}

      <View style={styles.dockLayer} pointerEvents="box-none">
        <VibesActionDock
          metrics={metrics}
          onPass={() => completeSwipe("left")}
          onUndo={() => undefined}
          onLike={() => completeSwipe("right")}
          onPremium={() => undefined}
          onIntent={openIntentForm}
          hiddenActions={["undo", "premium"]}
          highlightedAction={highlightedDockAction}
        />
      </View>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean, metrics: VibesDepthMetrics) =>
  StyleSheet.create({
    wrap: {
      width: metrics.cardWidth,
      height: metrics.cardHeight + metrics.stackBottomReserve,
      alignItems: "center",
      overflow: "visible",
    },
    celebrationWrap: {
      position: "absolute",
      top: Math.max(112, metrics.cardHeight * 0.32),
      alignSelf: "center",
      minHeight: 36,
      paddingHorizontal: 16,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      zIndex: 45,
      borderWidth: StyleSheet.hairlineWidth,
    },
    celebrationWrapTeal: {
      backgroundColor: isDark ? "rgba(7,30,34,0.82)" : "rgba(233,249,246,0.92)",
      borderColor: "rgba(19,168,168,0.26)",
    },
    celebrationWrapPurple: {
      backgroundColor: isDark ? "rgba(35,24,58,0.86)" : "rgba(244,239,255,0.94)",
      borderColor: "rgba(139,92,255,0.24)",
    },
    celebrationWrapCream: {
      backgroundColor: isDark ? "rgba(40,30,20,0.82)" : "rgba(255,248,237,0.94)",
      borderColor: "rgba(244,232,208,0.26)",
    },
    celebrationEmoji: {
      fontSize: 15,
    },
    celebrationText: {
      color: isDark ? VIBES_DEPTH_COLORS.cream : "#0F3D3E",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
      letterSpacing: 0.2,
    },
    cardLayer: {
      width: metrics.cardWidth,
      height: metrics.cardHeight,
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
    },
    dragTrackWrap: {
      position: "absolute",
      top: Math.max(104, metrics.cardHeight * 0.39),
      alignSelf: "center",
      width: 132,
      height: 70,
      alignItems: "center",
      justifyContent: "center",
    },
    dragTrack: {
      position: "absolute",
      width: 94,
      height: 2,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(244,232,208,0.28)" : "rgba(15,61,62,0.18)",
    },
    dragGuidePill: {
      position: "absolute",
      top: -10,
      minHeight: 28,
      paddingHorizontal: 12,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(3,14,18,0.58)" : "rgba(255,250,244,0.80)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(15,61,62,0.10)",
    },
    dragGuidePillText: {
      color: isDark ? VIBES_DEPTH_COLORS.cream : "#0F3D3E",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
      letterSpacing: 0.3,
    },
    dragGuidePillEmoji: {
      fontSize: 18,
      marginRight: 5,
    },
    dragHintEmoji: {
      fontSize: 28,
    },
    handHint: {
      position: "absolute",
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(3,14,18,0.56)" : "rgba(255,250,244,0.80)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,61,62,0.12)",
    },
    lessonPanel: {
      position: "absolute",
      left: metrics.isCompactWidth ? 14 : 18,
      right: metrics.isCompactWidth ? 14 : 18,
      top: metrics.isCompactHeight ? 14 : 18,
      zIndex: 20,
    },
    lessonPanelSurface: {
      paddingHorizontal: metrics.isCompactWidth ? 13 : 15,
      paddingVertical: metrics.isCompactHeight ? 10 : 12,
    },
    closeButton: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.58)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(15,61,62,0.10)",
      zIndex: 2,
    },
    eyebrow: {
      color: theme.tint,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
      letterSpacing: 1.4,
      textTransform: "uppercase",
      marginBottom: 3,
    },
    title: {
      color: isDark ? VIBES_DEPTH_COLORS.cream : "#0F3D3E",
      fontFamily: "PlayfairDisplay_700Bold",
      fontSize: metrics.isCompactHeight ? 18 : 20,
      lineHeight: metrics.isCompactHeight ? 23 : 25,
      marginBottom: 4,
    },
    body: {
      color: isDark ? "rgba(255,255,255,0.82)" : "rgba(15,61,62,0.76)",
      fontFamily: "Manrope_600SemiBold",
      fontSize: metrics.isCompactHeight ? 11 : 12,
      lineHeight: metrics.isCompactHeight ? 16 : 17,
    },
    introLessonGrid: {
      marginTop: 10,
      gap: 6,
    },
    introLesson: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,61,62,0.07)",
    },
    introLessonIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(19,168,168,0.10)" : "rgba(19,168,168,0.12)",
    },
    introLessonCopy: {
      flex: 1,
      minWidth: 0,
    },
    introLessonLabel: {
      color: isDark ? "rgba(255,255,255,0.88)" : "rgba(15,61,62,0.82)",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
    },
    introLessonBody: {
      marginTop: 1,
      color: isDark ? "rgba(255,255,255,0.66)" : "rgba(15,61,62,0.62)",
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
      lineHeight: 13,
    },
    lessonButton: {
      minHeight: 34,
      paddingHorizontal: 14,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.tint,
    },
    lessonButtonWrap: {
      alignSelf: "flex-start",
      marginTop: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    lessonButtonPointer: {
      fontSize: 22,
    },
    lessonButtonText: {
      color: "#F8FFFF",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 12,
    },
    intentForm: {
      marginTop: 10,
      gap: 7,
    },
    intentProfileRow: {
      minHeight: 58,
      borderRadius: 18,
      padding: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: isDark ? "rgba(7,30,34,0.58)" : "rgba(255,255,255,0.54)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(15,61,62,0.10)",
    },
    intentProfilePhoto: {
      width: 44,
      height: 44,
      borderRadius: 14,
      overflow: "hidden",
    },
    intentProfilePhotoFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    intentProfileInitials: {
      color: VIBES_DEPTH_COLORS.cream,
      fontFamily: "PlayfairDisplay_700Bold",
      fontSize: 16,
    },
    intentProfileCopy: {
      flex: 1,
      minWidth: 0,
    },
    intentProfileName: {
      color: isDark ? VIBES_DEPTH_COLORS.cream : "#0F3D3E",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 12,
    },
    intentProfileMeta: {
      marginTop: 2,
      color: isDark ? "rgba(255,255,255,0.66)" : "rgba(15,61,62,0.62)",
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
    },
    intentOption: {
      minHeight: 34,
      borderRadius: 15,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,61,62,0.07)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,61,62,0.10)",
    },
    intentOptionActive: {
      backgroundColor: theme.tint,
      borderColor: "rgba(255,255,255,0.22)",
    },
    intentOptionPreview: {
      borderColor: isDark ? "rgba(244,232,208,0.18)" : "rgba(15,61,62,0.18)",
      backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(15,61,62,0.10)",
      shadowColor: theme.tint,
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    intentOptionPointer: {
      fontSize: 22,
      marginRight: 2,
    },
    intentOptionPointerSpacer: {
      width: 24,
    },
    intentOptionText: {
      color: isDark ? "rgba(255,255,255,0.84)" : "rgba(15,61,62,0.78)",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
    },
    intentOptionTextActive: {
      color: "#F8FFFF",
    },
    practiceNote: {
      minHeight: 36,
      borderRadius: 15,
      paddingHorizontal: 10,
      paddingVertical: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: isDark ? "rgba(7,30,34,0.52)" : "rgba(255,255,255,0.48)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,61,62,0.08)",
    },
    practiceNoteText: {
      flex: 1,
      color: isDark ? "rgba(255,255,255,0.70)" : "rgba(15,61,62,0.66)",
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
      lineHeight: 14,
    },
    intentSendButton: {
      minHeight: 36,
      borderRadius: 999,
      paddingHorizontal: 12,
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: theme.tint,
    },
    intentSendWrapFocused: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
    },
    intentSendPointer: {
      fontSize: 22,
    },
    intentSendText: {
      color: "#F8FFFF",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
    },
    dockLessonGrid: {
      marginTop: 9,
      gap: 5,
    },
    dockLesson: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 13,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,61,62,0.07)",
    },
    dockLessonIcon: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(19,168,168,0.10)" : "rgba(19,168,168,0.12)",
    },
    dockLessonCopy: {
      flex: 1,
      minWidth: 0,
    },
    dockLessonLabel: {
      color: isDark ? "rgba(255,255,255,0.86)" : "rgba(15,61,62,0.78)",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
    },
    dockLessonBody: {
      color: isDark ? "rgba(255,255,255,0.68)" : "rgba(15,61,62,0.62)",
      fontFamily: "Manrope_600SemiBold",
      fontSize: 10,
      lineHeight: 13,
      marginTop: 1,
    },
    intentDragTrackWrap: {
      position: "absolute",
      top: Math.max(166, metrics.cardHeight * 0.44),
      alignSelf: "center",
      width: 78,
      height: 118,
      alignItems: "center",
      justifyContent: "flex-end",
      zIndex: 34,
    },
    intentDragTrack: {
      position: "absolute",
      bottom: 14,
      width: 2,
      height: 66,
      borderRadius: 999,
      backgroundColor: "rgba(244,232,208,0.28)",
    },
    intentGuidePill: {
      position: "absolute",
      top: -8,
      minHeight: 30,
      paddingHorizontal: 14,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(3,14,18,0.60)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(244,232,208,0.16)",
    },
    intentGuidePillText: {
      color: VIBES_DEPTH_COLORS.cream,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
      letterSpacing: 0.3,
    },
    intentGuidePillEmoji: {
      fontSize: 18,
      marginRight: 5,
    },
    intentHandHint: {
      position: "absolute",
      bottom: 0,
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(3,14,18,0.56)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.14)",
    },
    dockLayer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: metrics.isCompactHeight ? 18 : 22,
      alignItems: "center",
      zIndex: 30,
    },
  });

const createPracticeCardStyles = (
  theme: typeof Colors.light,
  isDark: boolean,
  metrics: VibesDepthMetrics,
  accent: "teal" | "purple",
) => {
  const accentColor = accent === "teal" ? VIBES_DEPTH_COLORS.teal : VIBES_DEPTH_COLORS.purple;
  const cardInset = metrics.isCompactWidth ? 16 : 18;

  return StyleSheet.create({
    cardShell: {
      width: "100%",
      height: "100%",
      borderRadius: metrics.cardRadius,
      overflow: "visible",
      shadowColor: accentColor,
      shadowOpacity: isDark ? 0.18 : 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 10,
    },
    card: {
      width: "100%",
      height: "100%",
      borderRadius: metrics.cardRadius,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(19,168,168,0.28)" : "rgba(15,61,62,0.22)",
    },
    photo: {
      ...StyleSheet.absoluteFillObject,
      width: "100%",
      height: "100%",
    },
    photoFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    photoFallbackInitials: {
      color: VIBES_DEPTH_COLORS.cream,
      fontFamily: "PlayfairDisplay_700Bold",
      fontSize: metrics.isCompactHeight ? 40 : 48,
      letterSpacing: 0.5,
    },
    photoFallbackText: {
      marginTop: 8,
      color: "rgba(255,255,255,0.68)",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    noiseVeil: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? "rgba(7,30,34,0.06)" : "rgba(255,255,255,0.02)",
    },
    rimTop: {
      position: "absolute",
      top: 0,
      left: 22,
      right: 22,
      height: 1,
      backgroundColor: isDark ? "rgba(244,232,208,0.42)" : "rgba(255,255,255,0.70)",
      opacity: 0.55,
    },
    rimBottom: {
      position: "absolute",
      bottom: 0,
      left: 28,
      right: 28,
      height: 2,
      borderRadius: 999,
      backgroundColor: accentColor,
      opacity: isDark ? 0.32 : 0.24,
    },
    auraLarge: {
      position: "absolute",
      width: metrics.cardWidth * 0.92,
      height: metrics.cardWidth * 0.92,
      borderRadius: metrics.cardWidth * 0.46,
      left: metrics.cardWidth * 0.04,
      bottom: -metrics.cardWidth * 0.28,
      backgroundColor: accentColor,
      opacity: isDark ? 0.12 : 0.10,
    },
    topBadges: {
      position: "absolute",
      left: cardInset,
      right: cardInset,
      top: cardInset,
      flexDirection: "row",
      justifyContent: "flex-start",
      gap: 8,
      zIndex: 3,
    },
    practiceBadge: {
      minHeight: 28,
      paddingHorizontal: 10,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: isDark ? "rgba(5,24,28,0.66)" : "rgba(255,250,244,0.64)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(15,61,62,0.10)",
    },
    practiceBadgeText: {
      color: isDark ? "#EFFFFF" : "#0F3D3E",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
    },
    bottomFade: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: "62%",
    },
    identity: {
      position: "absolute",
      left: cardInset,
      right: cardInset,
      bottom: metrics.dockHeight + (metrics.isCompactHeight ? 66 : 76),
      zIndex: 4,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "baseline",
      marginBottom: metrics.isCompactHeight ? 6 : 8,
    },
    name: {
      color: VIBES_DEPTH_COLORS.cream,
      fontFamily: "PlayfairDisplay_700Bold",
      fontSize: metrics.isCompactHeight ? 29 : 33,
      lineHeight: metrics.isCompactHeight ? 35 : 39,
      flexShrink: 1,
      textShadowColor: "rgba(0,0,0,0.58)",
      textShadowRadius: 12,
      textShadowOffset: { width: 0, height: 4 },
    },
    age: {
      color: "rgba(244,232,208,0.92)",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: metrics.isCompactHeight ? 20 : 22,
      marginLeft: 7,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: metrics.isCompactHeight ? 8 : 10,
    },
    location: {
      color: "#F7FFFF",
      fontFamily: "Manrope_700Bold",
      fontSize: metrics.isCompactHeight ? 13 : 14,
      marginLeft: 5,
    },
    countryCode: {
      color: "#F7FFFF",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
      marginLeft: 7,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: "rgba(7,30,34,0.48)",
      overflow: "hidden",
    },
    contextRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    sharedChip: {
      minHeight: 32,
      maxWidth: metrics.cardWidth * 0.58,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 11,
      borderRadius: 999,
      backgroundColor: "rgba(7,30,34,0.68)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.12)",
    },
    sharedText: {
      color: "#F8FFFF",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: metrics.isCompactHeight ? 11 : 12,
      flexShrink: 1,
    },
    introChip: {
      minHeight: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: "rgba(7,30,34,0.54)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.16)",
    },
    introText: {
      color: "#F8FFFF",
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
    },
  });
};
