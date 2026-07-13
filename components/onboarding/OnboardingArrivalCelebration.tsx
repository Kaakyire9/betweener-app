import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  ZoomIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const PARTICLES = [
  { left: "12%", top: "18%", color: "#F4C95D", delay: 80 },
  { left: "24%", top: "35%", color: "#7BCBC9", delay: 180 },
  { left: "80%", top: "23%", color: "#D3A9E8", delay: 120 },
  { left: "73%", top: "43%", color: "#F4C95D", delay: 260 },
  { left: "18%", top: "66%", color: "#D3A9E8", delay: 320 },
  { left: "84%", top: "70%", color: "#7BCBC9", delay: 220 },
] as const;

function Particle({ item }: { item: (typeof PARTICLES)[number] }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    progress.value = withDelay(item.delay, withTiming(1, { duration: reduceMotion ? 0 : 900 }));
  }, [item.delay, progress, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.15 ? progress.value * 6 : 1 - Math.max(0, progress.value - 0.72) * 3.5,
    transform: [{ translateY: -30 * progress.value }, { scale: 0.4 + progress.value }] as ViewStyle["transform"],
  }));
  return <Animated.View style={[styles.particle, { left: item.left, top: item.top, backgroundColor: item.color }, style]} />;
}

export function OnboardingArrivalCelebration({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, 3200);
    return () => clearTimeout(timer);
  }, [onDismiss, visible]);
  if (!visible) return null;

  return (
    <Animated.View entering={FadeIn.duration(260).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(240)} style={styles.overlay}>
      {PARTICLES.map((item, index) => <Particle key={index} item={item} />)}
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss welcome celebration" onPress={onDismiss} style={styles.dismissArea}>
        <Animated.View entering={ZoomIn.springify().damping(14).reduceMotion(ReduceMotion.System)} style={styles.card}>
          <View style={styles.iconHalo}>
            <MaterialCommunityIcons name="heart-multiple-outline" size={32} color="#6D46E8" />
          </View>
          <Text style={styles.eyebrow}>YOUR STORY IS LIVE</Text>
          <Text style={styles.title}>Welcome to Vibes</Text>
          <Text style={styles.body}>Your world is ready. Start exploring connections shaped around who you are.</Text>
          <Text style={styles.hint}>Tap anywhere to begin</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, backgroundColor: "rgba(11,10,18,0.72)" },
  dismissArea: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  card: {
    width: "100%", maxWidth: 360, alignItems: "center", borderRadius: 30, paddingHorizontal: 28, paddingVertical: 30,
    backgroundColor: "#FFF9F1", borderWidth: 1, borderColor: "rgba(245,203,105,0.65)",
    shadowColor: "#E7BC55", shadowOpacity: 0.34, shadowRadius: 30, shadowOffset: { width: 0, height: 15 }, elevation: 18,
  },
  iconHalo: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", marginBottom: 18, backgroundColor: "#F1EAFE", borderWidth: 1, borderColor: "#E1D3FA" },
  eyebrow: { color: "#8A6727", fontSize: 11, letterSpacing: 2, fontFamily: "Manrope_700Bold", marginBottom: 8 },
  title: { color: "#211714", fontSize: 29, fontFamily: "PlayfairDisplay_700Bold", marginBottom: 10 },
  body: { color: "#6D625E", fontSize: 14, lineHeight: 21, textAlign: "center", fontFamily: "Manrope_600SemiBold" },
  hint: { color: "#8A7B75", fontSize: 11, marginTop: 20, fontFamily: "Manrope_600SemiBold" },
  particle: { position: "absolute", width: 7, height: 7, borderRadius: 4, shadowColor: "#FFF", shadowOpacity: 0.7, shadowRadius: 8 },
});
