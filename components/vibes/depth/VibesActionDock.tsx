import IntentMark from "@/components/icons/IntentMark";
import SignalIcon from "@/components/icons/SignalIcon";
import GlassSurface from "@/components/vibes/depth/GlassSurface";
import GlowOrb from "@/components/vibes/depth/GlowOrb";
import RimLight from "@/components/vibes/depth/RimLight";
import { VIBES_DEPTH_COLORS } from "@/components/vibes/depth/platformGlass";
import type { VibesDepthMetrics } from "@/components/vibes/depth/useVibesResponsiveMetrics";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { CircleOff, RotateCcw } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import React, { memo } from "react";
import { Animated as RNAnimated, Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { vibesMotion } from "./motionPresets";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";

type ActionKey = "pass" | "undo" | "intent" | "premium" | "like";

type VibesActionDockProps = {
  metrics: VibesDepthMetrics;
  onPass: () => void;
  onUndo: () => void;
  onIntent: () => void;
  onPremium: () => void;
  onLike: () => void;
  superlikeBadge?: React.ReactNode;
  disabledPremium?: boolean;
  hiddenActions?: ActionKey[];
  highlightedAction?: ActionKey | null;
  entranceStyle?: any;
};

function DockButton({
  actionKey,
  size,
  primary,
  accent,
  onPress,
  children,
  isDark,
  highlighted,
}: {
  actionKey: ActionKey;
  size: number;
  primary?: boolean;
  accent?: "purple" | "cream" | "teal";
  onPress: () => void;
  children: React.ReactNode;
  isDark: boolean;
  highlighted?: boolean;
}) {
  const scale = useSharedValue(1);
  const highlightPulse = useSharedValue(highlighted ? 1 : 0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlighted ? 0.5 + highlightPulse.value * 0.4 : 0,
    transform: [{ scale: 0.96 + highlightPulse.value * 0.08 }],
  }));

  React.useEffect(() => {
    if (!highlighted) {
      highlightPulse.value = 0;
      return;
    }
    highlightPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 760 }),
        withTiming(0, { duration: 760 }),
      ),
      -1,
      false,
    );
  }, [highlightPulse, highlighted]);

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.94, vibesMotion.pressIn),
      withTiming(1, vibesMotion.pressOut),
    );
    try {
      Haptics.selectionAsync();
    } catch {}
    onPress();
  };

  return (
    <Animated.View style={[animatedStyle, primary ? styles.primaryLift : null]}>
      {highlighted ? (
        <>
          <Animated.View style={[styles.highlightLayer, highlightStyle]} pointerEvents="none">
            <GlowOrb
              color={accent === "purple" ? "rgba(139,92,255,0.24)" : accent === "cream" ? "rgba(244,232,208,0.20)" : "rgba(19,168,168,0.24)"}
              size={size + 30}
              opacity={0.32}
              top={-15}
              left={-15}
            />
            <View
              style={[
                styles.highlightRing,
                {
                  width: size + 10,
                  height: size + 10,
                  borderRadius: (size + 10) / 2,
                  top: -5,
                  left: -5,
                },
                accent === "purple"
                  ? styles.highlightRingPurple
                  : accent === "cream"
                    ? styles.highlightRingCream
                    : styles.highlightRingTeal,
              ]}
            />
          </Animated.View>
        </>
      ) : null}
      {primary ? <GlowOrb color="rgba(19,168,168,0.18)" size={size + 34} opacity={0.22} top={-17} left={-17} /> : null}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={
          actionKey === "pass"
            ? "Pass profile"
            : actionKey === "undo"
              ? "Undo last action"
            : actionKey === "intent"
                ? "Open Intent request"
                : actionKey === "premium"
                  ? "Send Signal"
                  : "Send Notice"
        }
        activeOpacity={0.88}
        onPress={handlePress}
        style={[
          styles.actionButton,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: isDark ? "rgba(3,14,18,0.58)" : "rgba(255,250,244,0.64)",
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,128,128,0.10)",
          },
          primary ? styles.primaryButton : null,
          primary && !isDark ? styles.primaryButtonLight : null,
          accent === "purple" ? styles.purpleButton : null,
          accent === "purple" && !isDark ? styles.purpleButtonLight : null,
          accent === "cream" ? styles.creamButton : null,
          accent === "cream" && !isDark ? styles.creamButtonLight : null,
          accent === "teal" ? styles.tealButton : null,
        ]}
      >
        {children}
        {primary ? (
          <LinearGradientSafe
            pointerEvents="none"
            colors={["rgba(255,255,255,0.32)", "rgba(255,255,255,0.04)", "rgba(255,255,255,0)"]}
            start={[0.2, 0]}
            end={[0.8, 1]}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <RimLight position="all" color={primary ? VIBES_DEPTH_COLORS.teal : "rgba(255,255,255,0.55)"} opacity={primary ? 0.34 : 0.14} radius={size / 2} thickness={1} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function VibesActionDock({
  metrics,
  onPass,
  onUndo,
  onIntent,
  onPremium,
  onLike,
  superlikeBadge,
  hiddenActions,
  highlightedAction,
  entranceStyle,
}: VibesActionDockProps) {
  const secondarySize = metrics.buttonSize;
  const centerSize = metrics.centerButtonSize;
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? "light") === "dark";
  const hiddenActionSet = React.useMemo(() => new Set(hiddenActions ?? []), [hiddenActions]);
  const showAction = React.useCallback((actionKey: ActionKey) => !hiddenActionSet.has(actionKey), [hiddenActionSet]);

  return (
    <RNAnimated.View style={[styles.wrap, entranceStyle]}>
      <GlowOrb color="rgba(19,168,168,0.10)" size={metrics.dockWidth * 0.72} opacity={0.12} bottom={-16} left={metrics.dockWidth * 0.14} />
      <GlassSurface
        radius={metrics.dockHeight / 2}
        intensity={20}
        glow={false}
        glowColor={VIBES_DEPTH_COLORS.teal}
        borderOpacity={0.07}
        fallbackColor={isDark
          ? Platform.OS === "android" ? "rgba(3,14,18,0.92)" : "rgba(7,30,34,0.46)"
          : Platform.OS === "android" ? "rgba(255,250,244,0.88)" : "rgba(255,250,244,0.56)"}
        style={[
          styles.dock,
          {
            width: metrics.dockWidth,
            minHeight: metrics.dockHeight - 2,
            borderRadius: metrics.dockHeight / 2,
          },
        ]}
        contentStyle={[
          styles.dockContent,
          {
            borderRadius: metrics.dockHeight / 2,
            paddingHorizontal: metrics.isCompactWidth ? 8 : 11,
            paddingVertical: metrics.isCompactHeight ? 2 : 3,
          },
        ]}
      >
        <LinearGradientSafe
          pointerEvents="none"
          colors={isDark
            ? ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.03)", "rgba(255,255,255,0)"]
            : ["rgba(255,255,255,0.42)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0)"]}
          start={[0, 0]}
          end={[1, 0]}
          style={styles.dockReflection}
        />
        <LinearGradientSafe
          pointerEvents="none"
          colors={["rgba(19,168,168,0)", isDark ? "rgba(19,168,168,0.22)" : "rgba(0,128,128,0.14)", "rgba(19,168,168,0)"]}
          start={[0, 0]}
          end={[1, 0]}
          style={styles.dockUnderscore}
        />
        <RimLight position="top" color="rgba(244,232,208,0.9)" opacity={0.12} radius={metrics.dockHeight / 2} thickness={1} />
        <RimLight position="bottom" color={VIBES_DEPTH_COLORS.teal} opacity={0.1} radius={metrics.dockHeight / 2} thickness={1} />
        <View style={styles.row}>
          {showAction("pass") ? (
            <DockButton actionKey="pass" size={secondarySize} onPress={onPass} isDark={isDark} highlighted={highlightedAction === "pass"}>
              <CircleOff size={Math.round(secondarySize * 0.43)} color={isDark ? "rgba(244,232,208,0.88)" : "#173C3B"} strokeWidth={2.2} />
            </DockButton>
          ) : null}
          {showAction("undo") ? (
            <DockButton actionKey="undo" size={Math.max(44, secondarySize - 4)} onPress={onUndo} isDark={isDark} highlighted={highlightedAction === "undo"}>
              <RotateCcw size={Math.round(secondarySize * 0.36)} color={VIBES_DEPTH_COLORS.teal} strokeWidth={2.25} />
            </DockButton>
          ) : null}
          {showAction("intent") ? (
            <DockButton actionKey="intent" size={centerSize} primary accent="teal" onPress={onIntent} isDark={isDark} highlighted={highlightedAction === "intent"}>
              <IntentMark size={Math.round(centerSize * 0.50)} color={isDark ? "#DDFBFA" : "#0F3D3E"} strokeWidth={2.2} />
            </DockButton>
          ) : null}
          {showAction("premium") ? (
            <View style={styles.superlikeWrap}>
              {superlikeBadge}
              <DockButton actionKey="premium" size={secondarySize} accent="purple" onPress={onPremium} isDark={isDark} highlighted={highlightedAction === "premium"}>
                <SignalIcon size={Math.round(secondarySize * 0.58)} color="#fff" accentColor="#F4E8D0" active strokeWidth={2.15} />
              </DockButton>
            </View>
          ) : null}
          {showAction("like") ? (
            <DockButton actionKey="like" size={secondarySize} accent="cream" onPress={onLike} isDark={isDark} highlighted={highlightedAction === "like"}>
              <MaterialCommunityIcons name="heart-outline" size={Math.round(secondarySize * 0.43)} color={isDark ? VIBES_DEPTH_COLORS.cream : "#7A5B3A"} />
            </DockButton>
          ) : null}
        </View>
      </GlassSurface>
    </RNAnimated.View>
  );
}

export default memo(VibesActionDock);

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  dock: {
    overflow: "visible",
  },
  dockContent: {
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dockReflection: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 5,
    height: 12,
    borderRadius: 999,
    opacity: 0.38,
  },
  dockUnderscore: {
    position: "absolute",
    left: "38%",
    right: "38%",
    bottom: 3,
    height: 2,
    borderRadius: 999,
    opacity: 0.44,
  },
  actionButton: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  primaryLift: {
    marginHorizontal: -1,
  },
  primaryButton: {
    backgroundColor: "rgba(5,36,40,0.72)",
    borderColor: "rgba(19,168,168,0.24)",
    shadowColor: VIBES_DEPTH_COLORS.teal,
    shadowOpacity: 0.11,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryButtonLight: {
    backgroundColor: "rgba(232,249,246,0.74)",
    borderColor: "rgba(19,168,168,0.24)",
  },
  purpleButton: {
    backgroundColor: "rgba(75,43,164,0.82)",
    borderColor: "rgba(139,92,255,0.34)",
  },
  purpleButtonLight: {
    backgroundColor: "rgba(124,92,255,0.66)",
  },
  creamButton: {
    backgroundColor: "rgba(34,28,22,0.7)",
    borderColor: "rgba(244,232,208,0.18)",
  },
  creamButtonLight: {
    backgroundColor: "rgba(255,248,237,0.78)",
    borderColor: "rgba(122,91,58,0.14)",
  },
  tealButton: {
    borderColor: "rgba(19,168,168,0.38)",
  },
  highlightLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  highlightRing: {
    position: "absolute",
    borderWidth: 1.5,
  },
  highlightRingTeal: {
    borderColor: "rgba(19,168,168,0.74)",
  },
  highlightRingPurple: {
    borderColor: "rgba(168,132,255,0.78)",
  },
  highlightRingCream: {
    borderColor: "rgba(244,232,208,0.74)",
  },
  superlikeWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
});
