import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type VerificationNudgeCardProps = {
  theme: typeof Colors.light;
  mode?: "invite" | "pending";
  onPress?: () => void;
  onSecondaryPress?: () => void;
};

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const bigint = parseInt(expanded, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

export function VerificationNudgeCard({
  theme,
  mode = "invite",
  onPress,
  onSecondaryPress,
}: VerificationNudgeCardProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const revealAnim = useRef(new Animated.Value(0)).current;
  const orbitBreathAnim = useRef(new Animated.Value(0)).current;
  const ctaBreathAnim = useRef(new Animated.Value(0)).current;
  const auraAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(revealAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const orbitLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbitBreathAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(orbitBreathAnim, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const ctaLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaBreathAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ctaBreathAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const auraLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(auraAnim, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(auraAnim, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    orbitLoop.start();
    ctaLoop.start();
    auraLoop.start();

    return () => {
      orbitLoop.stop();
      ctaLoop.stop();
      auraLoop.stop();
    };
  }, [auraAnim, ctaBreathAnim, orbitBreathAnim, revealAnim]);

  const orbitRevealStyle: any = {
    opacity: revealAnim.interpolate({
      inputRange: [0, 0.2, 1],
      outputRange: [0, 0.45, 1],
    }),
    transform: [
      {
        scale: revealAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.72, 1],
        }),
      },
    ],
  };

  const emblemRevealStyle: any = {
    opacity: revealAnim.interpolate({
      inputRange: [0, 0.35, 1],
      outputRange: [0, 0.35, 1],
    }),
    transform: [
      {
        translateY: revealAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
      {
        scale: revealAnim.interpolate({
          inputRange: [0, 0.7, 1],
          outputRange: [0.78, 1.04, 1],
        }),
      },
    ],
  };

  const sparkleLeftStyle: any = {
    opacity: revealAnim.interpolate({
      inputRange: [0, 0.25, 0.7, 1],
      outputRange: [0, 0.25, 1, 0.82],
    }),
    transform: [
      {
        translateX: revealAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-26, 0],
        }),
      },
      {
        translateY: revealAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
      {
        scale: revealAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.6, 1],
        }),
      },
    ],
  };

  const sparkleRightStyle: any = {
    opacity: revealAnim.interpolate({
      inputRange: [0, 0.4, 0.8, 1],
      outputRange: [0, 0.2, 1, 0.8],
    }),
    transform: [
      {
        translateX: revealAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
      {
        translateY: revealAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-16, 0],
        }),
      },
      {
        scale: revealAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.65, 1],
        }),
      },
    ],
  };

  const orbitBreathStyle: any = {
    transform: [
      {
        scale: orbitBreathAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.035],
        }),
      },
    ],
    opacity: orbitBreathAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.95, 0.75],
    }),
  };

  const auraStyle: any = {
    opacity: auraAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.16, 0.3],
    }),
    transform: [
      {
        scale: auraAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1.06],
        }),
      },
    ],
  };

  const ctaGlowStyle: any = {
    opacity: ctaBreathAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.14, 0.28],
    }),
    transform: [
      {
        scale: ctaBreathAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.03],
        }),
      },
    ],
  };
  const isPending = mode === "pending";

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[
          withAlpha(theme.backgroundSubtle, 0.985),
          withAlpha(theme.background, 0.965),
          withAlpha(theme.background, 0.94),
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowPill}>
            <MaterialCommunityIcons
              name={isPending ? "clock-check-outline" : "shield-star-outline"}
              size={13}
              color={theme.tint}
            />
            <Text style={styles.eyebrowText}>{isPending ? "TRUST REVIEW" : "TRUST INVITATION"}</Text>
          </View>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="clock-time-four-outline" size={12} color={theme.textMuted} />
            <Text style={styles.metaText}>{isPending ? "in progress" : "under 1 minute"}</Text>
          </View>
        </View>

        <View style={styles.illustrationWrap}>
          <Animated.View style={[styles.illustrationAura, auraStyle]} />

          <Animated.View style={[styles.orbitShell, orbitRevealStyle, orbitBreathStyle]}>
            <View style={styles.orbitRingOuter} />
            <View style={styles.orbitRingMid} />
            <View style={styles.orbitSealHalo} />
          </Animated.View>

          <Animated.View style={[styles.sparkleLeft, sparkleLeftStyle]}>
            <MaterialCommunityIcons name="star-four-points" size={9} color={theme.secondary} />
          </Animated.View>
          <Animated.View style={[styles.sparkleRight, sparkleRightStyle]}>
            <MaterialCommunityIcons name="star-four-points" size={10} color={theme.accent} />
          </Animated.View>

          <Animated.View style={[styles.emblemWrap, emblemRevealStyle]}>
            <LinearGradient
              colors={["#F8E9B8", "#D8B96A"]}
              start={{ x: 0.18, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emblemGoldShell}
            >
              <View style={styles.emblemInnerHalo}>
                <View style={styles.emblemTealRing}>
                  <View style={[styles.emblemCore, { backgroundColor: theme.tint }]}>
                    <MaterialCommunityIcons name="check-bold" size={24} color="#FFFFFF" />
                  </View>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        </View>

        <View style={styles.copyBlock}>
          <Text style={styles.title}>{isPending ? "Verification in review" : "Get verified on Betweener"}</Text>
          <Text style={styles.subtitle}>
            {isPending
              ? "Your proof is with Betweener now. We will update your trust mark as soon as review is complete."
              : "This is your trust invitation. Unlock a rarer mark, build confidence faster, and make serious matches lean in sooner."}
          </Text>
        </View>

        <View style={styles.benefitsRow}>
          <View style={styles.benefitChip}>
            <MaterialCommunityIcons name={isPending ? "shield-lock-outline" : "flash-outline"} size={13} color={theme.tint} />
            <Text style={styles.benefitText}>{isPending ? "Private review" : "Faster trust"}</Text>
          </View>
          <View style={styles.benefitChip}>
            <MaterialCommunityIcons name="seal-variant" size={13} color={theme.tint} />
            <Text style={styles.benefitText}>{isPending ? "Queue secured" : "Signature mark"}</Text>
          </View>
          <View style={styles.benefitChip}>
            <MaterialCommunityIcons name={isPending ? "bell-outline" : "heart-outline"} size={13} color={theme.tint} />
            <Text style={styles.benefitText}>{isPending ? "We will notify you" : "Safer interest"}</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity activeOpacity={0.94} onPress={onPress} style={styles.primaryCtaWrap}>
            <Animated.View pointerEvents="none" style={[styles.ctaGlow, ctaGlowStyle]} />
            <LinearGradient
              colors={[theme.tint, theme.accent]}
              start={{ x: 0, y: 0.3 }}
              end={{ x: 1, y: 0.7 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>{isPending ? "View review status" : "Start verification"}</Text>
              <MaterialCommunityIcons name="arrow-right" size={16} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>

          {isPending ? null : (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={onSecondaryPress}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Not now</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.helperText}>
          {isPending ? "You can withdraw and resubmit from the verification screen" : "Quick face check or manual document review"}
        </Text>
      </LinearGradient>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light) =>
  StyleSheet.create({
    wrapper: {
      marginTop: 18,
      marginBottom: 18,
    },
    card: {
      overflow: "hidden",
      borderRadius: 28,
      borderWidth: 1,
      borderColor: withAlpha(theme.outline, 0.88),
      paddingHorizontal: 22,
      paddingTop: 16,
      paddingBottom: 16,
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.11,
      shadowRadius: 20,
      elevation: 6,
      backgroundColor: theme.backgroundSubtle,
    },
    eyebrowRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      flexWrap: "wrap",
    },
    eyebrowPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: withAlpha(theme.background, 0.82),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.14),
    },
    eyebrowText: {
      fontSize: 11,
      fontFamily: "Archivo_700Bold",
      color: theme.tint,
      letterSpacing: 1.2,
    },
    metaPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 7,
      backgroundColor: withAlpha(theme.background, 0.88),
      borderWidth: 1,
      borderColor: withAlpha(theme.outline, 0.9),
    },
    metaText: {
      fontSize: 11,
      fontFamily: "Manrope_700Bold",
      color: theme.textMuted,
    },
    illustrationWrap: {
      height: 140,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 10,
      marginBottom: 0,
    },
    illustrationAura: {
      position: "absolute",
      width: 136,
      height: 136,
      borderRadius: 68,
      backgroundColor: withAlpha(theme.tint, 0.04),
    },
    orbitShell: {
      position: "absolute",
      width: 132,
      height: 132,
      alignItems: "center",
      justifyContent: "center",
    },
    orbitRingOuter: {
      position: "absolute",
      width: 116,
      height: 116,
      borderRadius: 58,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.12),
    },
    orbitRingMid: {
      position: "absolute",
      width: 92,
      height: 92,
      borderRadius: 46,
      borderWidth: 1,
      borderColor: withAlpha(theme.accent, 0.1),
    },
    orbitSealHalo: {
      position: "absolute",
      width: 70,
      height: 70,
      borderRadius: 35,
      borderWidth: 1,
      borderColor: withAlpha("#D8B96A", 0.28),
    },
    sparkleLeft: {
      position: "absolute",
      left: "31%",
      bottom: 33,
    },
    sparkleRight: {
      position: "absolute",
      top: 26,
      right: "31%",
    },
    emblemWrap: {
      alignItems: "center",
      justifyContent: "center",
    },
    emblemGoldShell: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#D7B86A",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 14,
      elevation: 6,
    },
    emblemInnerHalo: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: withAlpha(theme.background, 0.94),
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.1),
    },
    emblemTealRing: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.tint, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.16),
    },
    emblemCore: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: withAlpha(theme.tint, 0.65),
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.14,
      shadowRadius: 10,
      elevation: 4,
    },
    copyBlock: {
      marginTop: 0,
      alignItems: "center",
    },
    title: {
      fontSize: 26,
      lineHeight: 32,
      fontFamily: "PlayfairDisplay_700Bold",
      color: theme.text,
      textAlign: "center",
      maxWidth: 300,
    },
    subtitle: {
      marginTop: 9,
      fontSize: 14,
      lineHeight: 22,
      fontFamily: "Manrope_500Medium",
      color: theme.textMuted,
      textAlign: "center",
      maxWidth: 316,
    },
    benefitsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 8,
      marginTop: 16,
    },
    benefitChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.background, 0.42),
      borderWidth: 1,
      borderColor: withAlpha(theme.outline, 0.68),
    },
    benefitText: {
      fontSize: 11.5,
      fontFamily: "Manrope_700Bold",
      color: theme.text,
    },
    actionsRow: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    primaryCtaWrap: {
      flex: 1,
      borderRadius: 18,
      overflow: "visible",
    },
    ctaGlow: {
      position: "absolute",
      left: 16,
      right: 16,
      top: 8,
      bottom: -2,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.tint, 0.18),
    },
    ctaGradient: {
      minHeight: 52,
      borderRadius: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 18,
    },
    ctaText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontFamily: "Archivo_700Bold",
    },
    secondaryButton: {
      minHeight: 52,
      minWidth: 102,
      paddingHorizontal: 17,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.background, 0.92),
      borderWidth: 1,
      borderColor: withAlpha(theme.outline, 1),
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.035,
      shadowRadius: 8,
      elevation: 1,
    },
    secondaryButtonText: {
      color: theme.text,
      fontSize: 14,
      fontFamily: "Archivo_700Bold",
    },
    helperText: {
      marginTop: 10,
      fontSize: 11.5,
      fontFamily: "Manrope_600SemiBold",
      color: theme.textMuted,
      textAlign: "center",
    },
  });
