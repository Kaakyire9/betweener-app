import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Image, Text, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type Props = {
  asset: any;
  dark: boolean;
  variant: "global" | "ghana";
  styles: any;
};

const LIGHTS = [
  { left: "13%", top: "19%", size: 5, delay: 0 },
  { left: "79%", top: "16%", size: 4, delay: 700 },
  { left: "87%", top: "48%", size: 6, delay: 1200 },
  { left: "20%", top: "57%", size: 3, delay: 400 },
] as const;

function WelcomeLight({ item, dark, styles }: { item: (typeof LIGHTS)[number]; dark: boolean; styles: any }) {
  const reduceMotion = useReducedMotion();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    shimmer.value = withDelay(item.delay, withRepeat(withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [item.delay, reduceMotion, shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.55 : 0.25 + shimmer.value * 0.7,
    transform: [{ scale: reduceMotion ? 1 : 0.6 + shimmer.value * 0.7 }] as ViewStyle["transform"],
  }));

  return (
    <Animated.View
      style={[
        styles.welcomeLight,
        { left: item.left, top: item.top, width: item.size, height: item.size, borderRadius: item.size, backgroundColor: dark ? "#7BE0DA" : "#F2C866" },
        animatedStyle,
      ]}
    />
  );
}

export function PremiumOnboardingWelcomeStep({ asset, dark, variant, styles }: Props) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const orbit = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    breathe.value = withRepeat(withTiming(1, { duration: 5400, easing: Easing.inOut(Easing.cubic) }), -1, true);
    orbit.value = withRepeat(withTiming(1, { duration: 20_000, easing: Easing.linear }), -1, false);
  }, [breathe, orbit, reduceMotion]);

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduceMotion ? 0 : -4 * breathe.value }, { scale: reduceMotion ? 1 : 0.985 + breathe.value * 0.02 }] as ViewStyle["transform"],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.16 : 0.09 + breathe.value * 0.12,
    transform: [{ scale: reduceMotion ? 1 : 0.88 + breathe.value * 0.18 }] as ViewStyle["transform"],
  }));
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value * 360}deg` }] as ViewStyle["transform"],
  }));

  return (
    <View style={styles.welcomeBody}>
      <View style={styles.heroVisual}>
        <LinearGradient
          colors={dark ? ["rgba(20,174,169,0.1)", "rgba(139,92,255,0.06)", "transparent"] : ["rgba(247,202,97,0.12)", "rgba(139,92,255,0.045)", "transparent"]}
          style={styles.welcomeAtmosphere}
        />
        <Animated.View style={[styles.welcomeHalo, haloStyle]} />
        <Animated.View style={[styles.welcomeOrbit, orbitStyle]}><View style={styles.welcomeOrbitDot} /></Animated.View>
        {LIGHTS.map((item, index) => <WelcomeLight key={index} item={item} dark={dark} styles={styles} />)}
        <View style={styles.heroBaseGlow} />
        <Animated.View style={[styles.heroImageMotion, heroStyle]}>
          <Image source={asset} style={styles.heroImage} resizeMode="contain" />
        </Animated.View>
        <LinearGradient colors={dark ? ["transparent", "#071E22"] : ["transparent", "#FFF7ED"]} style={styles.heroFade} />
        <Animated.View entering={FadeInDown.delay(280).duration(620).reduceMotion(ReduceMotion.System)} style={styles.welcomeStoryPanel}>
          <View style={styles.welcomeStoryIcon}>
            <MaterialCommunityIcons name={variant === "ghana" ? "map-marker-star-outline" : "account-heart-outline"} size={17} color={styles.tokens.accent.color} />
          </View>
          <View style={styles.welcomeStoryCopy}>
            <Text style={styles.welcomeStoryTitle}>{variant === "ghana" ? "Rooted here. Open to the world." : "Made for meaningful connection."}</Text>
            <Text style={styles.welcomeStoryBody}>{variant === "ghana" ? "Ghana and its global community, brought closer." : "A profile shaped around your real story—not a checklist."}</Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}
