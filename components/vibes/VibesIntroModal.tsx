import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { haptics } from "@/lib/haptics";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Sparkles, Target, Gem } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Slide = {
  key: string;
  title: string;
  body: string;
  bullets: string[];
  gradient: [string, string];
  icon: "sparkles" | "target" | "gem";
};

const Slides: Slide[] = [
  {
    key: "swipe",
    title: "Vibes, in 10 seconds",
    body: "Swipe through people who match your energy. Keep it light, fast, and intentional.",
    bullets: ["Swipe right to like", "Swipe left to pass", "Undo if you slip"],
    gradient: ["#008080", "#4FA7A3"],
    icon: "sparkles",
  },
  {
    key: "filters",
    title: "Make it feel curated",
    body: "Use filters and location to tighten the feed. Better inputs, better matches.",
    bullets: ["Set your city or use GPS", "Filter by age, distance, and more", "Save your filters automatically"],
    gradient: ["#7D5BA6", "#008080"],
    icon: "target",
  },
  {
    key: "premium",
    title: "Move with confidence",
    body: "When you see someone you like, act. The fastest path is a clear, respectful opener.",
    bullets: ["Send Intent when it matters", "Your visibility stays private in matchmaking mode", "You can reopen this guide anytime"],
    gradient: ["#4FA7A3", "#7D5BA6"],
    icon: "gem",
  },
];

function SlideIcon({ kind, color }: { kind: Slide["icon"]; color: string }) {
  const size = 26;
  if (kind === "target") return <Target size={size} color={color} />;
  if (kind === "gem") return <Gem size={size} color={color} />;
  return <Sparkles size={size} color={color} />;
}

function HeroScene({
  kind,
  ink,
  slide,
  isDark,
}: {
  kind: Slide["key"];
  ink: string;
  slide: Animated.Value;
  isDark: boolean;
}) {
  const micro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    micro.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(micro, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(micro, { toValue: 0, duration: 950, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      try {
        loop.stop();
      } catch {}
    };
  }, [micro, kind]);

  const fadeIn = slide.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const floatY = micro.interpolate({ inputRange: [0, 1], outputRange: [2, -2] });
  const nudge = slide.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  if (kind === "filters") {
    return (
      <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: nudge }] }}>
        <View style={stylesLocal.sceneRow}>
          <View style={[stylesLocal.sceneCard, { backgroundColor: isDark ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.16)" }]}>
            <View style={stylesLocal.sceneHeader}>
              <View style={[stylesLocal.sceneDot, { backgroundColor: ink }]} />
              <View style={stylesLocal.sceneLine} />
              <View style={[stylesLocal.scenePill, { borderColor: "rgba(255,255,255,0.20)" }]}>
                <MaterialCommunityIcons name="map-marker-outline" size={14} color={ink} />
                <Text style={[stylesLocal.scenePillText, { color: ink }]}>City</Text>
              </View>
            </View>

            <View style={stylesLocal.sliderBlock}>
              <View style={stylesLocal.sliderLabelRow}>
                <Text style={[stylesLocal.sliderLabel, { color: ink }]}>Distance</Text>
                <Text style={[stylesLocal.sliderValue, { color: ink }]}>25 mi</Text>
              </View>
              <View style={stylesLocal.sliderTrack}>
                <View style={[stylesLocal.sliderFill, { backgroundColor: ink, width: "62%" }]} />
                <Animated.View style={[stylesLocal.sliderKnob, { backgroundColor: ink, transform: [{ translateY: floatY }] }]} />
              </View>
            </View>

            <View style={stylesLocal.sliderBlock}>
              <View style={stylesLocal.sliderLabelRow}>
                <Text style={[stylesLocal.sliderLabel, { color: ink }]}>Age</Text>
                <Text style={[stylesLocal.sliderValue, { color: ink }]}>25-38</Text>
              </View>
              <View style={stylesLocal.sliderTrack}>
                <View style={[stylesLocal.sliderFill, { backgroundColor: ink, width: "54%" }]} />
                <Animated.View style={[stylesLocal.sliderKnob, { backgroundColor: ink, transform: [{ translateY: floatY }] }]} />
              </View>
            </View>
          </View>

          <View style={stylesLocal.sideStack}>
            <Animated.View style={[stylesLocal.sideChip, { transform: [{ translateY: floatY }] }]}>
              <MaterialCommunityIcons name="filter-variant" size={14} color={ink} />
              <Text style={[stylesLocal.sideChipText, { color: ink }]}>Saved</Text>
            </Animated.View>
            <View style={stylesLocal.miniCard} />
            <View style={[stylesLocal.miniCard, { opacity: 0.7 }]} />
          </View>
        </View>
      </Animated.View>
    );
  }

  if (kind === "premium") {
    return (
      <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: nudge }] }}>
        <View style={stylesLocal.sceneRow}>
          <View style={[stylesLocal.sceneCard, { backgroundColor: isDark ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.16)" }]}>
            <View style={stylesLocal.intentHeader}>
              <View style={[stylesLocal.avatar, { borderColor: "rgba(255,255,255,0.24)" }]} />
              <View style={{ flex: 1 }}>
                <View style={[stylesLocal.nameBar, { backgroundColor: "rgba(255,255,255,0.18)" }]} />
                <View style={[stylesLocal.subBar, { backgroundColor: "rgba(255,255,255,0.14)" }]} />
              </View>
              <View style={[stylesLocal.badge, { borderColor: "rgba(255,255,255,0.20)" }]}>
                <MaterialCommunityIcons name="timer-outline" size={14} color={ink} />
                <Text style={[stylesLocal.badgeText, { color: ink }]}>72h</Text>
              </View>
            </View>

            <View style={stylesLocal.bubbleWrap}>
              <View style={[stylesLocal.bubble, { borderColor: "rgba(255,255,255,0.18)" }]}>
                <Text style={[stylesLocal.bubbleText, { color: ink }]}>Quick opener suggestion</Text>
              </View>
              <View style={[stylesLocal.bubble, stylesLocal.bubbleGhost]} />
            </View>

            <Animated.View style={[stylesLocal.intentBtn, { transform: [{ translateY: floatY }] }]}>
              <MaterialCommunityIcons name="send" size={16} color="#fff" />
              <Text style={stylesLocal.intentBtnText}>Send Intent</Text>
            </Animated.View>
          </View>

          <View style={stylesLocal.sideStack}>
            <Animated.View style={[stylesLocal.sideChip, { transform: [{ translateY: floatY }] }]}>
              <MaterialCommunityIcons name="star-four-points" size={14} color={ink} />
              <Text style={[stylesLocal.sideChipText, { color: ink }]}>Coach</Text>
            </Animated.View>
            <View style={stylesLocal.miniCard} />
            <View style={[stylesLocal.miniCard, { opacity: 0.7 }]} />
          </View>
        </View>
      </Animated.View>
    );
  }

  // swipe
  return (
    <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: nudge }] }}>
      <View style={stylesLocal.sceneRow}>
        <View style={[stylesLocal.sceneCard, { backgroundColor: isDark ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.16)" }]}>
          <View style={stylesLocal.intentHeader}>
            <View style={[stylesLocal.avatar, { borderColor: "rgba(255,255,255,0.24)" }]} />
            <View style={{ flex: 1 }}>
              <View style={[stylesLocal.nameBar, { backgroundColor: "rgba(255,255,255,0.18)" }]} />
              <View style={[stylesLocal.subBar, { backgroundColor: "rgba(255,255,255,0.14)" }]} />
            </View>
            <View style={[stylesLocal.badge, { borderColor: "rgba(255,255,255,0.20)" }]}>
              <MaterialCommunityIcons name="heart-outline" size={14} color={ink} />
              <Text style={[stylesLocal.badgeText, { color: ink }]}>Vibe</Text>
            </View>
          </View>

          <View style={stylesLocal.swipeMid}>
            <View style={[stylesLocal.swipeHint, { borderColor: "rgba(255,255,255,0.18)" }]}>
              <MaterialCommunityIcons name="gesture-swipe-right" size={16} color={ink} />
              <Text style={[stylesLocal.swipeHintText, { color: ink }]}>Swipe</Text>
            </View>
            <Animated.View style={[stylesLocal.swipeArrow, { transform: [{ translateX: micro.interpolate({ inputRange: [0, 1], outputRange: [-6, 10] }) }] }]}>
              <MaterialCommunityIcons name="arrow-right" size={20} color={ink} />
            </Animated.View>
          </View>

          <View style={stylesLocal.actionRow}>
            <View style={[stylesLocal.actionBtn, { borderColor: "rgba(255,255,255,0.18)" }]}>
              <MaterialCommunityIcons name="close" size={16} color={ink} />
            </View>
            <View style={[stylesLocal.actionBtn, { borderColor: "rgba(255,255,255,0.18)" }]}>
              <MaterialCommunityIcons name="heart" size={16} color={ink} />
            </View>
            <View style={[stylesLocal.actionBtn, { borderColor: "rgba(255,255,255,0.18)" }]}>
              <MaterialCommunityIcons name="undo" size={16} color={ink} />
            </View>
          </View>
        </View>

        <View style={stylesLocal.sideStack}>
          <Animated.View style={[stylesLocal.sideChip, { transform: [{ translateY: floatY }] }]}>
            <MaterialCommunityIcons name="flash-outline" size={14} color={ink} />
            <Text style={[stylesLocal.sideChipText, { color: ink }]}>Fast</Text>
          </Animated.View>
          <View style={stylesLocal.miniCard} />
          <View style={[stylesLocal.miniCard, { opacity: 0.7 }]} />
        </View>
      </View>
    </Animated.View>
  );
}

const stylesLocal = StyleSheet.create({
  sceneRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  sceneCard: {
    flex: 1,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  sideStack: { width: 98, justifyContent: "space-between", gap: 10 },
  sideChip: {
    height: 34,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
  },
  sideChipText: { fontSize: 12, fontWeight: "900" },
  miniCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  sceneHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  sceneDot: { width: 10, height: 10, borderRadius: 6 },
  sceneLine: { flex: 1, height: 10, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.14)" },
  scenePill: {
    height: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
  },
  scenePillText: { fontSize: 12, fontWeight: "900" },
  sliderBlock: { marginTop: 10 },
  sliderLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sliderLabel: { fontSize: 12, fontWeight: "900" },
  sliderValue: { fontSize: 12, fontWeight: "900", opacity: 0.9 },
  sliderTrack: {
    marginTop: 8,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    justifyContent: "center",
  },
  sliderFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, opacity: 0.85 },
  sliderKnob: {
    position: "absolute",
    right: 12,
    width: 14,
    height: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
  },
  intentHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
  },
  nameBar: { height: 10, borderRadius: 8, width: "64%" },
  subBar: { height: 8, borderRadius: 8, width: "42%", marginTop: 6 },
  badge: {
    height: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: "900" },
  bubbleWrap: { marginTop: 12, gap: 8 },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
  },
  bubbleGhost: { height: 34, opacity: 0.65 },
  bubbleText: { fontSize: 12, fontWeight: "900" },
  intentBtn: {
    marginTop: 12,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(0,128,128,0.95)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  intentBtnText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  swipeMid: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  swipeHint: {
    height: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
  },
  swipeHintText: { fontSize: 12, fontWeight: "900" },
  swipeArrow: { width: 34, height: 34, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionRow: { marginTop: 12, flexDirection: "row", gap: 10, justifyContent: "space-between" },
  actionBtn: {
    flex: 1,
    height: 34,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function VibesIntroModal({ visible, onClose }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDark = (colorScheme ?? "light") === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const heroInk = isDark ? "#fff" : theme.accent;

  const [step, setStep] = useState(0);
  const enter = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const iconPop = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const shineLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const current = Slides[Math.max(0, Math.min(Slides.length - 1, step))];
  const progress = (step + 1) / Slides.length;

  useEffect(() => {
    if (!visible) {
      try {
        shineLoopRef.current?.stop();
      } catch {}
      return;
    }
    setStep(0);
    enter.setValue(0);
    slide.setValue(0);
    iconPop.setValue(0);
    shine.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.timing(iconPop, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();

    // Subtle premium "sheen" across the illustration.
    try {
      shineLoopRef.current?.stop();
    } catch {}
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, {
          toValue: 1,
          duration: 1650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shine, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(900),
      ]),
    );
    shineLoopRef.current = loop;
    loop.start();

    return () => {
      try {
        shineLoopRef.current?.stop();
      } catch {}
    };
  }, [visible, enter, slide, iconPop, shine]);

  const animateStep = (nextStep: number) => {
    slide.setValue(0);
    iconPop.setValue(0);
    setStep(nextStep);
    void haptics.tap();
    Animated.timing(slide, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.timing(iconPop, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
  };

  const onNext = () => {
    if (step >= Slides.length - 1) {
      void haptics.success();
      onClose();
      return;
    }
    animateStep(step + 1);
  };

  const handleClose = () => {
    void haptics.tap();
    onClose();
  };

  const overlayOpacity = enter.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const cardScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const cardTranslate = slide.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const illusFloat = slide.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });
  const iconScale = iconPop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const iconRotate = iconPop.interpolate({ inputRange: [0, 1], outputRange: ["-4deg", "0deg"] });
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-220, 520] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <Animated.View
          style={[
            styles.card,
            {
              transform: [{ scale: cardScale }],
            },
          ]}
        >
          <BlurViewSafe intensity={22} tint={isDark ? "dark" : "light"} style={styles.blur}>
            <LinearGradientSafe colors={current.gradient as any} style={styles.illus}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.shineWrap,
                  {
                    transform: [{ translateX: shineX }],
                  },
                ]}
              >
                <LinearGradientSafe
                  colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]}
                  start={[0, 0]}
                  end={[1, 0]}
                  style={styles.shine}
                />
              </Animated.View>

              <Animated.View style={{ transform: [{ translateY: illusFloat }] }}>
                <View style={styles.illusRow}>
                  <Animated.View style={[styles.illusIcon, { transform: [{ scale: iconScale }, { rotate: iconRotate }] }]}>
                    <SlideIcon kind={current.icon} color={heroInk} />
                  </Animated.View>

                  <View style={styles.illusMeta}>
                    <View style={styles.guidePill}>
                      <Text style={[styles.guidePillText, { color: heroInk }]}>VIBES GUIDE</Text>
                    </View>

                    <View style={styles.stepDots} accessibilityLabel={`Step ${step + 1} of ${Slides.length}`}>
                      {Slides.map((_s, i) => (
                        <View
                          key={_s.key}
                          style={[
                            styles.stepDot,
                            { backgroundColor: isDark ? "rgba(255,255,255,0.28)" : "rgba(125,91,166,0.22)" },
                            { borderColor: isDark ? "rgba(255,255,255,0.22)" : "rgba(125,91,166,0.22)" },
                            i === step ? [styles.stepDotActive, { backgroundColor: heroInk, borderColor: isDark ? "rgba(255,255,255,0.45)" : "rgba(125,91,166,0.45)" }] : null,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                </View>

                <View style={styles.heroWrap}>
                  <HeroScene kind={current.key} ink={heroInk} slide={slide} isDark={isDark} />
                </View>
              </Animated.View>
            </LinearGradientSafe>

            <Animated.View
              style={[
                styles.content,
                {
                  opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
                  transform: [{ translateY: cardTranslate }],
                },
              ]}
            >
              <Text style={styles.title}>{current.title}</Text>
              <Text style={styles.body}>{current.body}</Text>

              <View style={styles.bullets}>
                {current.bullets.map((b) => (
                  <View key={b} style={styles.bulletRow}>
                    <View style={styles.dot} />
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <LinearGradientSafe
                    colors={[theme.tint, theme.secondary]}
                    start={[0, 0]}
                    end={[1, 0]}
                    style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {step + 1}/{Slides.length}
                </Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity onPress={handleClose} activeOpacity={0.85} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onNext} activeOpacity={0.9} style={styles.primaryBtn}>
                  <Text style={styles.primaryText}>{step >= Slides.length - 1 ? "Start Vibes" : "Next"}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </BlurViewSafe>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => {
  const overlay = isDark ? "rgba(0,0,0,0.66)" : "rgba(15,23,42,0.36)";
  const cardBg = isDark ? "rgba(15,26,26,0.94)" : "rgba(247,236,226,0.92)";
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: overlay,
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
    },
    card: {
      width: "100%",
      maxWidth: 520,
      borderRadius: 22,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : theme.outline,
      backgroundColor: cardBg,
      shadowColor: isDark ? "#000" : "#0f172a",
      shadowOpacity: isDark ? 0.22 : 0.14,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 10,
    },
    blur: {
      borderRadius: 22,
      overflow: "hidden",
    },
    illus: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 14,
      overflow: "hidden",
    },
    illusRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    heroWrap: {
      marginTop: 6,
    },
    illusIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.14)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    illusPills: { flexDirection: "row", gap: 8 },
    illusMeta: { alignItems: "flex-end", gap: 8 },
    guidePill: {
      paddingHorizontal: 10,
      height: 26,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    guidePillText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1.0 },
    stepDots: { flexDirection: "row", alignItems: "center", gap: 6 },
    stepDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: "rgba(255,255,255,0.28)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.22)",
    },
    stepDotActive: {
      width: 16,
      backgroundColor: "rgba(255,255,255,0.92)",
      borderColor: "rgba(255,255,255,0.45)",
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      height: 30,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.18)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.2)",
    },
    pillGhost: { backgroundColor: "rgba(255,255,255,0.12)" },
    pillText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    shineWrap: {
      position: "absolute",
      top: -20,
      left: 0,
      width: 220,
      height: 220,
      opacity: 0.9,
    },
    shine: {
      width: 220,
      height: 220,
      transform: [{ rotate: "18deg" }],
    },
    illusCards: {
      alignItems: "center",
      paddingBottom: 6,
    },
    fakeCard: {
      width: "100%",
      height: 86,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.16)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
    title: { fontSize: 22, color: theme.text, fontFamily: "PlayfairDisplay_700Bold" },
    body: {
      marginTop: 8,
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Manrope_600SemiBold",
    },
    bullets: { marginTop: 14, gap: 10 },
    bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      marginTop: 6,
      backgroundColor: theme.tint,
    },
    bulletText: { flex: 1, color: theme.text, fontSize: 13, lineHeight: 18 },
    progressRow: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10 },
    progressTrack: {
      flex: 1,
      height: 8,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      overflow: "hidden",
    },
    progressFill: {
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    progressText: { fontSize: 12, color: theme.textMuted, fontWeight: "700" },
    actions: { marginTop: 16, flexDirection: "row", gap: 10 },
    secondaryBtn: {
      flex: 1,
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryText: { color: theme.text, fontWeight: "800" },
    primaryBtn: {
      flex: 1,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.tint,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: isDark ? "#000" : "#0f172a",
      shadowOpacity: isDark ? 0.24 : 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    primaryText: { color: "#fff", fontWeight: "900" },
  });
};
