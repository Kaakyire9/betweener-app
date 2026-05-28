import type { Match } from "@/types/match";
import type { VibesLayoutMetrics } from "@/components/vibes/VibesResponsiveLayout";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { forwardRef, memo, useEffect, useImperativeHandle } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Extrapolate,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import ExploreCard from "./ExploreCard";
import IntentMark from "./icons/IntentMark";

export type ExploreStackHandle = {
  performSwipe: (dir: "left" | "right" | "superlike") => void;
  rewind: () => void;
};

type Props = {
  matches: Match[];
  currentIndex: number;
  setCurrentIndex: (n: number) => void;
  recordSwipe: (id: string, action: "like" | "dislike" | "superlike", index?: number) => void;
  onProfileTap: (id: string) => void;
  onPlayPress?: (id: string) => void;
  previewingId?: string;
  layoutMetrics: VibesLayoutMetrics;
  onIntentSwipeUp?: () => void;
  onGestureLockChange?: (locked: boolean) => void;
};

const ActiveCardView = memo(function ActiveCardView({
  match,
  zIndex,
  pan,
  cardFrameStyle,
  activeStyle,
  overlayContainerStyle,
  superlikeGlowStyle,
  superlikeIconStyle,
  rightGlowStyle,
  rightIconStyle,
  leftGlowStyle,
  leftIconStyle,
  intentGlowStyle,
  intentIconStyle,
  onProfileTap,
  onPlayPress,
  previewingId,
  layoutMetrics,
}: {
  match: Match;
  zIndex: number;
  pan: any;
  cardFrameStyle: { height: number; borderRadius: number };
  activeStyle: any;
  overlayContainerStyle: any;
  superlikeGlowStyle: any;
  superlikeIconStyle: any;
  rightGlowStyle: any;
  rightIconStyle: any;
  leftGlowStyle: any;
  leftIconStyle: any;
  intentGlowStyle: any;
  intentIconStyle: any;
  onProfileTap: (id: string) => void;
  onPlayPress?: (id: string) => void;
  previewingId?: string;
  layoutMetrics: VibesLayoutMetrics;
}) {
  return (
    <View style={[styles.cardContainer, cardFrameStyle, { zIndex }]}>
      <GestureDetector gesture={pan}>
        <Animated.View style={{ flex: 1 }} pointerEvents="box-none">
          <Animated.View style={[styles.card, cardFrameStyle, activeStyle]}>
            <ExploreCard
              match={match}
              onPress={() => onProfileTap(match.id)}
              onPlayPress={() => onPlayPress?.(match.id)}
              isPreviewing={previewingId === match.id}
              layoutMetrics={layoutMetrics}
            />
          </Animated.View>

          <Animated.View pointerEvents="none" style={[styles.feedbackContainer, overlayContainerStyle]}>
            <Animated.View style={superlikeGlowStyle} />
            <Animated.View style={superlikeIconStyle}>
              <MaterialCommunityIcons name="star" size={88} color="#FBBF24" style={{ textShadowColor: 'rgba(59,130,246,0.36)', textShadowOffset: { width: 0, height: 6 }, textShadowRadius: 18 }} />
            </Animated.View>
            <Animated.View style={rightGlowStyle} />
            <Animated.View style={rightIconStyle}>
              <MaterialCommunityIcons name="heart" size={64} color="#10B981" />
            </Animated.View>
            <Animated.View style={leftGlowStyle} />
            <Animated.View style={leftIconStyle}>
              <MaterialCommunityIcons name="close" size={64} color="#EF4444" />
            </Animated.View>
            <Animated.View style={intentGlowStyle} />
            <Animated.View style={intentIconStyle}>
              <IntentMark size={58} color="#A7FFF8" strokeWidth={2.15} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const StackedCardView = memo(function StackedCardView({
  match,
  index,
  currentIndex,
  zIndex,
  cardFrameStyle,
  onProfileTap,
  onPlayPress,
  previewingId,
  layoutMetrics,
}: {
  match: Match;
  index: number;
  currentIndex: number;
  zIndex: number;
  cardFrameStyle: { height: number; borderRadius: number };
  onProfileTap: (id: string) => void;
  onPlayPress?: (id: string) => void;
  previewingId?: string;
  layoutMetrics: VibesLayoutMetrics;
}) {
  const stackedStyle = useAnimatedStyle(() => {
    const diff = index - currentIndex;
    if (diff <= 0) return { transform: [{ translateY: 0 }, { scale: 1 }], opacity: 1 } as any;
    const ty = diff * 12;
    const s = 1 - Math.min(diff * 0.04, 0.12);
    const op = 1 - Math.min(diff * 0.08, 0.6);
    return {
      transform: [{ translateY: withTiming(ty, { duration: 300 }) }, { scale: withTiming(s, { duration: 300 }) }],
      opacity: withTiming(op, { duration: 300 }),
    } as any;
  }, [currentIndex, index]);

  return (
    <Animated.View style={[styles.card, cardFrameStyle, stackedStyle, { zIndex }]}>
      <ExploreCard
        match={match}
        onPress={() => onProfileTap(match.id)}
        onPlayPress={() => onPlayPress?.(match.id)}
        isPreviewing={previewingId === match.id}
        layoutMetrics={layoutMetrics}
      />
    </Animated.View>
  );
});

const ExploreStackReanimated = forwardRef<ExploreStackHandle, Props>(
  ({
    matches,
    currentIndex,
    setCurrentIndex,
    recordSwipe,
    onProfileTap,
    onPlayPress,
    previewingId,
    layoutMetrics,
    onIntentSwipeUp,
    onGestureLockChange,
  }, ref) => {
    const list = matches && matches.length > 0 ? matches : [];
    const screenWidth = layoutMetrics.cardWidth;
    const swipeThreshold = screenWidth * 0.28;
    const exitDistance = screenWidth * 1.2;
    const intentSwipeThreshold = Math.min(layoutMetrics.cardHeight * 0.18, 124);
    const cardFrameStyle = {
      height: layoutMetrics.cardHeight,
      borderRadius: layoutMetrics.cardBorderRadius,
    };

    // Shared values
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const scale = useSharedValue(1);
    const cardOpacity = useSharedValue(1);
    const hasPassedThreshold = useSharedValue(false);
    const superlikePulse = useSharedValue(0);
    const intentProgress = useSharedValue(0);

    const setGestureLocked = (locked: boolean) => {
      onGestureLockChange?.(locked);
    };

    const openIntentFromSwipe = () => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
      onIntentSwipeUp?.();
    };

    // Imperative API
    const completeSwipe = (dir: "left" | "right" | "superlike") => {
      const current = list[currentIndex];
      if (current) {
        if (dir === "superlike") recordSwipe(current.id, "superlike", currentIndex);
        else recordSwipe(current.id, dir === "right" ? "like" : "dislike", currentIndex);
      }
      try {
        if (dir === "right") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        else if (dir === "superlike") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
      if (currentIndex < list.length - 1) setCurrentIndex(currentIndex + 1);
      else setCurrentIndex(list.length);
    };

    useImperativeHandle(ref, () => ({
      performSwipe: (dir: "left" | "right" | "superlike") => {
        try {
          if (dir === "superlike") {
            // special arc motion upwards
            cardOpacity.value = withTiming(0, { duration: 420 });
            // small curve: nudge left then return while moving up
            translateX.value = withTiming(-screenWidth * 0.08, { duration: 220 }, () => {
              translateX.value = withTiming(0, { duration: 320 });
            });
            translateY.value = withTiming(-exitDistance, { duration: 520 }, () => runOnJS(completeSwipe)(dir));
            rotate.value = withTiming(-6, { duration: 420 });
            superlikePulse.value = withTiming(1, { duration: 160 }, () => {
              superlikePulse.value = withTiming(0, { duration: 300 });
            });
            return;
          }

          const targetX = dir === "right" ? exitDistance : -exitDistance;
          cardOpacity.value = withTiming(0, { duration: 240 });
          translateX.value = withTiming(targetX, { duration: 300 }, () => {
            runOnJS(completeSwipe)(dir);
          });
          rotate.value = withTiming(dir === "right" ? 18 : -18, { duration: 300 });
        } catch (_e) {
          runOnJS(completeSwipe)(dir as any);
        }
      },
      rewind: () => {
        try {
          // start slightly smaller then pop to full size
          scale.value = 0.8;
          cardOpacity.value = 1;
          translateX.value = 0;
          translateY.value = 0;
          rotate.value = 0;
          scale.value = withTiming(1, { duration: 260 });
        } catch (_e) {}
      },
    }));

    useEffect(() => {
      translateX.value = 0;
      translateY.value = 0;
      rotate.value = 0;
      scale.value = 1;
      cardOpacity.value = 1;
      hasPassedThreshold.value = false;
      intentProgress.value = 0;
    }, [currentIndex]);

    // Gesture
    const pan = Gesture.Pan()
      .onBegin(() => {
        if (onGestureLockChange) runOnJS(setGestureLocked)(true);
      })
      .onUpdate((e) => {
        const verticalIntentDrag =
          !!onIntentSwipeUp &&
          e.translationY < -8 &&
          Math.abs(e.translationY) > Math.abs(e.translationX) * 0.85;

        if (verticalIntentDrag) {
          translateX.value = e.translationX * 0.12;
          translateY.value = Math.max(e.translationY * 0.82, -layoutMetrics.cardHeight * 0.32);
          rotate.value = 0;
          scale.value = 1 - Math.min(Math.abs(e.translationY) / (layoutMetrics.cardHeight * 12), 0.035);
          cardOpacity.value = 1 - Math.min(Math.abs(e.translationY) / (layoutMetrics.cardHeight * 3.2), 0.18);
          intentProgress.value = interpolate(
            Math.abs(e.translationY),
            [0, intentSwipeThreshold],
            [0, 1],
            Extrapolate.CLAMP,
          );
        } else {
          translateX.value = e.translationX;
          translateY.value = e.translationY;
          rotate.value = interpolate(translateX.value, [-screenWidth, 0, screenWidth], [-18, 0, 18], Extrapolate.CLAMP);
          scale.value = 1 - Math.min(Math.abs(translateX.value) / (screenWidth * 8), 0.08);
          cardOpacity.value = 1 - Math.min(Math.abs(translateX.value) / (screenWidth * 1.2), 0.6);
          intentProgress.value = 0;
        }

        // threshold haptic gate
        const passed = Math.abs(e.translationX) > swipeThreshold || intentProgress.value >= 1;
        if (passed && !hasPassedThreshold.value) {
          hasPassedThreshold.value = true;
          runOnJS(() => {
            try {
              Haptics.selectionAsync();
            } catch {}
          })();
        } else if (!passed && hasPassedThreshold.value) {
          hasPassedThreshold.value = false;
        }
      })
      .onEnd((e) => {
        const shouldOpenIntent =
          !!onIntentSwipeUp &&
          e.translationY < -intentSwipeThreshold &&
          Math.abs(e.translationY) > Math.abs(e.translationX) * 0.85;
        const shouldOpenIntentByVelocity =
          !!onIntentSwipeUp &&
          e.velocityY < -950 &&
          Math.abs(e.velocityY) > Math.abs(e.velocityX) * 0.7;

        if (shouldOpenIntent || shouldOpenIntentByVelocity) {
          translateX.value = withSpring(0, { damping: 14, stiffness: 150 });
          translateY.value = withTiming(-Math.min(layoutMetrics.cardHeight * 0.12, 86), { duration: 130 }, () => {
            translateY.value = withSpring(0, { damping: 14, stiffness: 150 });
          });
          rotate.value = withSpring(0);
          scale.value = withSpring(1);
          cardOpacity.value = withTiming(1, { duration: 160 });
          intentProgress.value = withTiming(0, { duration: 180 });
          runOnJS(openIntentFromSwipe)();
          return;
        }

        const shouldExit = Math.abs(e.translationX) > swipeThreshold || Math.abs(e.velocityX) > 1000;
        if (shouldExit) {
          const dir: "left" | "right" = e.translationX > 0 ? "right" : "left";
          const targetX = dir === "right" ? exitDistance : -exitDistance;
          translateX.value = withTiming(targetX, { duration: 280 }, () => runOnJS(completeSwipe)(dir));
          rotate.value = withTiming(dir === "right" ? 18 : -18, { duration: 280 });
          cardOpacity.value = withTiming(0, { duration: 240 });
        } else {
          translateX.value = withSpring(0, { damping: 12, stiffness: 150 });
          translateY.value = withSpring(0, { damping: 12, stiffness: 150 });
          rotate.value = withSpring(0);
          scale.value = withSpring(1);
          cardOpacity.value = withTiming(1);
          intentProgress.value = withTiming(0, { duration: 160 });
        }
      })
      .onFinalize(() => {
        if (onGestureLockChange) runOnJS(setGestureLocked)(false);
      })
      .runOnJS(true);

    const activeStyle = useAnimatedStyle(() => {
      const rot = `${rotate.value}deg`;
      return {
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
          { rotate: rot },
          { scale: scale.value },
        ],
        opacity: cardOpacity.value,
      } as any;
    }, []);

    const overlayContainerStyle = useAnimatedStyle(() => ({
      opacity: Math.max(
        interpolate(translateX.value, [-swipeThreshold, 0, swipeThreshold], [0.9, 0, 0.9], Extrapolate.CLAMP),
        intentProgress.value * 0.95,
      ),
    })) as any;

    const rightGlowStyle = useAnimatedStyle(() => ({
      position: "absolute",
      width: screenWidth * 0.6,
      height: screenWidth * 0.6,
      borderRadius: (screenWidth * 0.6) / 2,
      backgroundColor: "rgba(16,185,129,0.12)",
      transform: [{ scale: interpolate(translateX.value, [0, swipeThreshold], [0.6, 1.15], Extrapolate.CLAMP) }],
      opacity: interpolate(translateX.value, [0, swipeThreshold * 0.5, swipeThreshold], [0, 0.65, 1], Extrapolate.CLAMP),
    } as any));

    const rightIconStyle = useAnimatedStyle(() => {
      const MAX_X = screenWidth * 0.22;
      const followX = Math.abs(translateX.value) > 12 ? interpolate(translateX.value, [-swipeThreshold, 0, swipeThreshold], [-MAX_X, 0, MAX_X], Extrapolate.CLAMP) : 0;
      return {
        transform: [
          { translateX: followX },
          { translateY: interpolate(translateX.value, [0, swipeThreshold], [12, -12], Extrapolate.CLAMP) },
          { scale: interpolate(translateX.value, [0, swipeThreshold * 0.5, swipeThreshold], [0.7, 1, 1.2], Extrapolate.CLAMP) },
          { rotate: `${interpolate(translateX.value, [0, swipeThreshold], [0, 12], Extrapolate.CLAMP)}deg` },
        ],
        opacity: interpolate(translateX.value, [0, swipeThreshold * 0.3, swipeThreshold], [0, 0.8, 1], Extrapolate.CLAMP),
      } as any;
    });

    const leftGlowStyle = useAnimatedStyle(() => ({
      position: "absolute",
      width: screenWidth * 0.6,
      height: screenWidth * 0.6,
      borderRadius: (screenWidth * 0.6) / 2,
      backgroundColor: "rgba(239,68,68,0.12)",
      transform: [{ scale: interpolate(translateX.value, [-swipeThreshold, 0], [1.15, 0.6], Extrapolate.CLAMP) }],
      opacity: interpolate(translateX.value, [-swipeThreshold, -swipeThreshold * 0.5, 0], [1, 0.65, 0], Extrapolate.CLAMP),
    } as any));

    const leftIconStyle = useAnimatedStyle(() => {
      const MAX_X = screenWidth * 0.22;
      const followX = Math.abs(translateX.value) > 12 ? interpolate(translateX.value, [-swipeThreshold, 0, swipeThreshold], [-MAX_X, 0, MAX_X], Extrapolate.CLAMP) : 0;
      return {
        transform: [
          { translateX: followX },
          { translateY: interpolate(translateX.value, [-swipeThreshold, 0], [-12, 12], Extrapolate.CLAMP) },
          { scale: interpolate(translateX.value, [-swipeThreshold, -swipeThreshold * 0.5, 0], [1.2, 1, 0.7], Extrapolate.CLAMP) },
          { rotate: `${interpolate(translateX.value, [-swipeThreshold, 0], [-12, 0], Extrapolate.CLAMP)}deg` },
        ],
        opacity: interpolate(translateX.value, [-swipeThreshold, -swipeThreshold * 0.3, 0], [1, 0.8, 0], Extrapolate.CLAMP),
      } as any;
    });

    const superlikeGlowStyle = useAnimatedStyle(() => ({
      position: "absolute",
      width: screenWidth * 0.84,
      height: screenWidth * 0.84,
      borderRadius: (screenWidth * 0.84) / 2,
      backgroundColor: "rgba(59,130,246,0.2)",
      transform: [
        { scale: interpolate(superlikePulse.value, [0, 1], [0.5, 1.6], Extrapolate.CLAMP) },
        { rotate: `${interpolate(superlikePulse.value, [0, 1], [0, 8], Extrapolate.CLAMP)}deg` },
      ],
      opacity: interpolate(superlikePulse.value, [0, 0.5, 1], [0, 0.9, 1], Extrapolate.CLAMP),
    } as any));

    const superlikeIconStyle = useAnimatedStyle(() => ({
      transform: [
        { translateY: interpolate(superlikePulse.value, [0, 1], [12, -36], Extrapolate.CLAMP) },
        { scale: interpolate(superlikePulse.value, [0, 0.5, 1], [0.6, 1.1, 1.4], Extrapolate.CLAMP) },
      ],
      opacity: superlikePulse.value,
    }) as any);

    const intentGlowStyle = useAnimatedStyle(() => ({
      position: "absolute",
      width: screenWidth * 0.82,
      height: screenWidth * 0.82,
      borderRadius: (screenWidth * 0.82) / 2,
      backgroundColor: "rgba(19,168,168,0.16)",
      transform: [
        { translateY: interpolate(intentProgress.value, [0, 1], [36, -24], Extrapolate.CLAMP) },
        { scale: interpolate(intentProgress.value, [0, 1], [0.55, 1.18], Extrapolate.CLAMP) },
      ],
      opacity: interpolate(intentProgress.value, [0, 0.45, 1], [0, 0.55, 1], Extrapolate.CLAMP),
    } as any));

    const intentIconStyle = useAnimatedStyle(() => ({
      alignItems: "center",
      justifyContent: "center",
      width: 104,
      height: 104,
      borderRadius: 52,
      borderWidth: 1,
      borderColor: "rgba(127,228,220,0.45)",
      backgroundColor: "rgba(3,20,24,0.42)",
      transform: [
        { translateY: interpolate(intentProgress.value, [0, 1], [40, -28], Extrapolate.CLAMP) },
        { scale: interpolate(intentProgress.value, [0, 0.55, 1], [0.72, 1, 1.1], Extrapolate.CLAMP) },
      ],
      opacity: interpolate(intentProgress.value, [0, 0.28, 1], [0, 0.85, 1], Extrapolate.CLAMP),
    } as any));

    // UI
    return (
      <View style={{ flex: 1, alignSelf: "stretch" }}>
        {list.map((m, i) => {
          if (i < currentIndex) return null;
          const isActive = i === currentIndex;
          const zIndex = list.length - i;

          if (isActive) {
            return (
              <ActiveCardView
                key={m.id}
                match={m}
                zIndex={zIndex}
                pan={pan}
                cardFrameStyle={cardFrameStyle}
                activeStyle={activeStyle}
                overlayContainerStyle={overlayContainerStyle}
                superlikeGlowStyle={superlikeGlowStyle}
                superlikeIconStyle={superlikeIconStyle}
                rightGlowStyle={rightGlowStyle}
                rightIconStyle={rightIconStyle}
                leftGlowStyle={leftGlowStyle}
                leftIconStyle={leftIconStyle}
                intentGlowStyle={intentGlowStyle}
                intentIconStyle={intentIconStyle}
                onProfileTap={onProfileTap}
                onPlayPress={onPlayPress}
                previewingId={previewingId}
                layoutMetrics={layoutMetrics}
              />
            );
          }

          return (
            <StackedCardView
              key={m.id}
              match={m}
              index={i}
              currentIndex={currentIndex}
              zIndex={zIndex}
              cardFrameStyle={cardFrameStyle}
              onProfileTap={onProfileTap}
              onPlayPress={onPlayPress}
              previewingId={previewingId}
              layoutMetrics={layoutMetrics}
            />
          );
        })}
      </View>
    );
  }
);

ExploreStackReanimated.displayName = "ExploreStackReanimated";

export default ExploreStackReanimated;

const styles = StyleSheet.create({
  cardContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  card: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    borderRadius: 28,
    overflow: "visible",
    backgroundColor: "transparent",
  },
  feedbackContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 20,
  },
});
