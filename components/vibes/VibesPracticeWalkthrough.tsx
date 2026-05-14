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
import { Animated, Image, PanResponder, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from "react-native";

type PracticeStep =
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
  intentPrompt: {
    eyebrow: "Practice 1 of 3",
    title: "Start with Intent",
    body: "Intent is Betweener's signature move. Tap the center button or swipe up on the photo to open a meaningful request.",
  },
  intentForm: {
    eyebrow: "Intent request",
    title: "Choose your request",
    body: "This is practice only. Pick how you want to connect, then send the request.",
  },
  intentExplain: {
    eyebrow: "Intent placed",
    title: "This is how Betweener begins",
    body: "Intent gives your request a 48-hour window, so it feels rare, present, and worth answering. Use it when the Vibe deserves more than a quick swipe.",
    cta: "Practice Notice",
  },
  noticePrompt: {
    eyebrow: "Practice 2 of 3",
    title: "Send a Notice",
    body: "Swipe right on the photo, or tap the heart button. A Notice is light interest, not the main Betweener move.",
  },
  noticeExplain: {
    eyebrow: "Notice sent",
    title: "They can see you noticed them",
    body: "A Notice lasts 72 hours. Use it when you want to be seen without starting a deeper request.",
    cta: "Practice Pass",
  },
  passPrompt: {
    eyebrow: "Practice 3 of 3",
    title: "Pass with care",
    body: "Swipe left on the photo, or tap the first button. Passing removes this Vibe quietly.",
  },
  passExplain: {
    eyebrow: "Passed",
    title: "You passed quietly",
    body: "Left swipe means not interested. It is the same as the Pass button. Here is the full dock before real Vibes begin.",
    cta: "Start real Vibes",
  },
};

const DOCK_LESSONS = [
  { icon: "close", label: "Pass", body: "Same as swiping left." },
  { icon: "undo-variant", label: "Undo", body: "Bring back the last card when available." },
  { icon: "heart-outline", label: "Notice", body: "Same as swiping right. Lasts 72 hours." },
  { icon: "diamond-stone", label: "Premium", body: "Send a stronger premium gesture." },
  { icon: "intent-mark", label: "Intent", body: "Request chat or send a note. Lasts up to 48 hours." },
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
            <Text style={styles.practiceBadgeText}>Guided photo</Text>
          </View>
          <View style={styles.practiceBadge}>
            <MaterialCommunityIcons name="phone-check" size={13} color={theme.tint} />
            <Text style={styles.practiceBadgeText}>Phone verified</Text>
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

export default function VibesPracticeWalkthrough({ metrics, onComplete, onGestureLockChange }: VibesPracticeWalkthroughProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDark = (colorScheme ?? "light") === "dark";
  const styles = useMemo(() => createStyles(theme, isDark, metrics), [isDark, metrics, theme]);
  const [step, setStep] = useState<PracticeStep>("intentPrompt");
  const [selectedIntentType, setSelectedIntentType] = useState<PracticeIntentType>("connect");
  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const hint = useRef(new Animated.Value(0)).current;
  const intentHint = useRef(new Animated.Value(0)).current;
  const promptDirection = step === "noticePrompt" ? "right" : step === "passPrompt" ? "left" : null;

  const activeCard =
    step === "intentPrompt" || step === "intentForm"
      ? PRACTICE_CARDS[0]
      : step === "noticePrompt" || step === "noticeExplain" || step === "intentExplain"
        ? PRACTICE_CARDS[1]
        : PRACTICE_CARDS[2];

  useEffect(() => {
    translate.setValue({ x: 0, y: 0 });
  }, [activeCard.id, translate]);

  useEffect(() => {
    if (!promptDirection) {
      hint.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hint, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(hint, { toValue: 0, duration: 900, useNativeDriver: true }),
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
        Animated.timing(intentHint, { toValue: 1, duration: 820, useNativeDriver: true }),
        Animated.timing(intentHint, { toValue: 0, duration: 820, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      intentHint.setValue(0);
    };
  }, [intentHint, step]);

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
        onStartShouldSetPanResponder: () => step === "intentPrompt",
        onStartShouldSetPanResponderCapture: () => step === "intentPrompt",
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          if (step !== "intentPrompt") return false;
          return gesture.dy < -4 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
        },
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (step === "intentPrompt") {
            return gesture.dy < -4 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
          }
          return Boolean(promptDirection) && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
        },
        onPanResponderGrant: () => {
          if (step === "intentPrompt") onGestureLockChange?.(true);
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
            return;
          }
          if (promptDirection === "left" && gesture.dx < -threshold) {
            completeSwipe("left");
            return;
          }
          resetCard();
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
    if (step === "intentExplain") {
      setStep("noticePrompt");
      return;
    }
    if (step === "noticeExplain") {
      setStep("passPrompt");
      return;
    }
    if (step === "passExplain") {
      onComplete();
    }
  }, [onComplete, step]);

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

  const hintStyle: any = {
    opacity: hint.interpolate({ inputRange: [0, 1], outputRange: [0.38, 1] }),
    transform: [
      {
        translateX: hint.interpolate({
          inputRange: [0, 1],
          outputRange: [0, promptDirection === "left" ? -18 : 18],
        }),
      },
    ],
  };

  const intentHintStyle: any = {
    opacity: intentHint.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
    transform: [
      {
        translateY: intentHint.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
      },
    ],
  };

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.cardLayer, cardAnimatedStyle]} {...panResponder.panHandlers}>
        <PracticeVibeCard card={activeCard} metrics={metrics} isDark={isDark} theme={theme} />
      </Animated.View>

      {promptDirection ? (
        <Animated.View style={[styles.swipeHint, hintStyle]} pointerEvents="none">
          <MaterialCommunityIcons
            name={promptDirection === "left" ? "arrow-left-thin" : "arrow-right-thin"}
            size={42}
            color={isDark ? VIBES_DEPTH_COLORS.cream : "#0F3D3E"}
          />
        </Animated.View>
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
        <Text style={styles.eyebrow}>{STEP_COPY[step].eyebrow}</Text>
        <Text style={styles.title}>{STEP_COPY[step].title}</Text>
        <Text style={styles.body}>{STEP_COPY[step].body}</Text>
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
                  {PRACTICE_CARDS[0].location} {PRACTICE_CARDS[0].countryCode} · {PRACTICE_CARDS[0].shared.slice(0, 2).join(", ")}
                </Text>
              </View>
            </View>
            {[
              { type: "connect" as const, label: "Ask to chat", icon: "message-outline" },
              { type: "like_with_note" as const, label: "Like with note", icon: "text-box-plus-outline" },
              { type: "date_request" as const, label: "Suggest a date", icon: "calendar-heart" },
            ].map((option) => {
              const selected = selectedIntentType === option.type;
              return (
                <TouchableOpacity
                  key={option.type}
                  style={[styles.intentOption, selected ? styles.intentOptionActive : null]}
                  activeOpacity={0.86}
                  onPress={() => {
                    setSelectedIntentType(option.type);
                    try { Haptics.selectionAsync(); } catch {}
                  }}
                >
                  <MaterialCommunityIcons name={option.icon as any} size={16} color={selected ? "#F8FFFF" : theme.tint} />
                  <Text style={[styles.intentOptionText, selected ? styles.intentOptionTextActive : null]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.practiceNote}>
              <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.tint} />
              <Text style={styles.practiceNoteText}>Example note: I liked your music vibe. Want to chat?</Text>
            </View>
            <TouchableOpacity style={styles.intentSendButton} activeOpacity={0.88} onPress={completeIntent}>
              <IntentMark size={17} color="#F8FFFF" strokeWidth={2.2} />
              <Text style={styles.intentSendText}>Send practice request</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {STEP_COPY[step].cta ? (
          <TouchableOpacity style={styles.lessonButton} activeOpacity={0.88} onPress={goNext}>
            <Text style={styles.lessonButtonText}>{STEP_COPY[step].cta}</Text>
          </TouchableOpacity>
        ) : null}
      </GlassSurface>

      {step === "intentPrompt" ? (
        <>
          <Animated.View style={[styles.intentSwipeHint, intentHintStyle]} pointerEvents="none">
            <MaterialCommunityIcons name="arrow-up-thin" size={40} color={VIBES_DEPTH_COLORS.cream} />
            <Text style={styles.intentSwipeHintText}>Swipe up</Text>
          </Animated.View>
          <Animated.View style={[styles.intentPointer, intentHintStyle]} pointerEvents="none">
            <IntentMark size={16} color={VIBES_DEPTH_COLORS.cream} strokeWidth={2.2} />
            <Text style={styles.intentPointerText}>Intent</Text>
          </Animated.View>
        </>
      ) : null}

      <View style={styles.dockLayer} pointerEvents="box-none">
        <VibesActionDock
          metrics={metrics}
          onPass={() => completeSwipe("left")}
          onUndo={resetCard}
          onLike={() => completeSwipe("right")}
          onPremium={resetCard}
          onIntent={openIntentForm}
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
    cardLayer: {
      width: metrics.cardWidth,
      height: metrics.cardHeight,
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
    },
    swipeHint: {
      position: "absolute",
      top: Math.max(80, metrics.cardHeight * 0.35),
      alignSelf: "center",
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(3,14,18,0.34)" : "rgba(255,250,244,0.52)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(15,61,62,0.12)",
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
    lessonButton: {
      alignSelf: "flex-start",
      marginTop: 9,
      minHeight: 34,
      paddingHorizontal: 14,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.tint,
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
    intentPointer: {
      position: "absolute",
      left: Math.max(0, metrics.cardWidth / 2 - 43),
      bottom: metrics.dockHeight + (metrics.isCompactHeight ? 31 : 36),
      minHeight: 30,
      width: 86,
      paddingHorizontal: 10,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(34,28,22,0.74)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(244,232,208,0.20)",
      zIndex: 40,
    },
    intentSwipeHint: {
      position: "absolute",
      top: Math.max(148, metrics.cardHeight * 0.39),
      alignSelf: "center",
      width: 82,
      height: 82,
      borderRadius: 41,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(3,14,18,0.36)" : "rgba(7,30,34,0.28)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(244,232,208,0.22)",
      zIndex: 35,
    },
    intentSwipeHintText: {
      marginTop: -4,
      color: VIBES_DEPTH_COLORS.cream,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 10,
      letterSpacing: 0.4,
    },
    intentPointerText: {
      color: VIBES_DEPTH_COLORS.cream,
      fontFamily: "Manrope_800ExtraBold",
      fontSize: 11,
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
      justifyContent: "space-between",
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
