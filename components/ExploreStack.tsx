// ExploreStack.tsx
import type { Match } from "@/types/match";
import * as Haptics from "expo-haptics";
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
};

const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;
const EXIT_DISTANCE = SCREEN_WIDTH * 1.2;

const ExploreStack = forwardRef<ExploreStackHandle, Props>(
  ({ matches, currentIndex, setCurrentIndex, recordSwipe, onProfileTap }, ref) => {
    const list = matches && matches.length > 0 ? matches : [];

    // Shared values for active card
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const scale = useSharedValue(1);
    const cardOpacity = useSharedValue(1);

    // Imperative API to parent to trigger swipes programmatically
    useImperativeHandle(ref, () => ({
      performSwipe: (dir: "left" | "right" | "superlike") => {
        try {
          if (dir === "superlike") {
            cardOpacity.value = withTiming(0, { duration: 420 });
            translateX.value = withTiming(-SCREEN_WIDTH * 0.08, { duration: 220 }, () => {
              translateX.value = withTiming(0, { duration: 320 });
            });
            translateY.value = withTiming(-EXIT_DISTANCE, { duration: 520 }, () => runOnJS(completeSwipe)(dir));
            rotate.value = withTiming(-6, { duration: 420 });
            return;
          }

          const targetX = dir === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;
          cardOpacity.value = withTiming(0, { duration: 240 });
          translateX.value = withTiming(targetX, { duration: 300 }, () => {
            runOnJS(completeSwipe)(dir);
          });
          rotate.value = withTiming(dir === "right" ? 18 : -18, { duration: 300 });
        } catch (_e) {
          // fallback if worklets not available
          runOnJS(completeSwipe)(dir as any);
        }
      },
      rewind: () => {
        try {
          scale.value = 0.8;
          cardOpacity.value = 1;
          translateX.value = 0;
          translateY.value = 0;
          rotate.value = 0;
          scale.value = withTiming(1, { duration: 260 });
        } catch (_e) {}
      },
    }));

    // Reset animation values when index changes
    useEffect(() => {
      translateX.value = 0;
      translateY.value = 0;
      rotate.value = 0;
      scale.value = 1;
      cardOpacity.value = 1;
    }, [currentIndex]);

    // JS callback executed after swipe completes (runs on JS thread)
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
      if (currentIndex < list.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setCurrentIndex(list.length);
      }
    };

    // Animated style for the active card
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

    const stackedStyle = (i: number) => {
      const diff = i - currentIndex;
      if (diff <= 0) return { transform: [{ translateY: 0 }, { scale: 1 }], opacity: 1 } as any;
      const ty = diff * 12;
      const s = 1 - Math.min(diff * 0.04, 0.12);
      const op = 1 - Math.min(diff * 0.08, 0.6);
      return { transform: [{ translateY: ty }, { scale: s }], opacity: op } as any;
    };

    // Pan gesture via GestureDetector
    const pan = Gesture.Pan()
      .onUpdate((e) => {
        translateX.value = e.translationX;
        translateY.value = e.translationY;
        rotate.value = interpolate(
          translateX.value,
          [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
          [-18, 0, 18],
          Extrapolate.CLAMP
        );
        scale.value = 1 - Math.min(Math.abs(translateX.value) / (SCREEN_WIDTH * 8), 0.08);
        cardOpacity.value = 1 - Math.min(Math.abs(translateX.value) / (SCREEN_WIDTH * 1.2), 0.6);
      })
      .onEnd((e) => {
        const shouldExit = Math.abs(e.translationX) > SWIPE_THRESHOLD || Math.abs(e.velocityX) > 1000;
        if (shouldExit) {
          const dir: "left" | "right" = e.translationX > 0 ? "right" : "left";
          const targetX = dir === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;
          translateX.value = withTiming(targetX, { duration: 280 }, () => {
            runOnJS(completeSwipe)(dir);
          });
          rotate.value = withTiming(dir === "right" ? 18 : -18, { duration: 280 });
          cardOpacity.value = withTiming(0, { duration: 240 });
        } else {
          translateX.value = withSpring(0, { damping: 12, stiffness: 150 });
          translateY.value = withSpring(0, { damping: 12, stiffness: 150 });
          rotate.value = withSpring(0);
          scale.value = withSpring(1);
          cardOpacity.value = withTiming(1);
        }
      })
      .runOnJS(true);

    // Render the card stack
    return (
      // ensure this container stretches horizontally even when parent uses `alignItems: 'center'`
      <View style={{ flex: 1, alignSelf: 'stretch' }}>
        {list.map((m, i) => {
          if (i < currentIndex) return null;
          const isActive = i === currentIndex;
          const zIndex = list.length - i;

          if (isActive) {
            return (
              <View key={m.id} style={[styles.cardContainer, { zIndex }]}>
                <GestureDetector gesture={pan}>
                  <Animated.View style={[styles.card, activeStyle]}>
                    <ExploreCard match={m} onPress={() => onProfileTap(m.id)} />
                  </Animated.View>
                </GestureDetector>
              </View>
            );
          }

          const st = stackedStyle(i);
          return (
            <Animated.View key={m.id} style={[styles.card, st, { zIndex }]}>
              <ExploreCard match={m} onPress={() => onProfileTap(m.id)} />
            </Animated.View>
          );
        })}
      </View>
    );
  }
);

ExploreStack.displayName = "ExploreStack";

export default ExploreStack;

const styles = StyleSheet.create({
  cardContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: SCREEN_HEIGHT * 0.52,
  },
  card: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: SCREEN_HEIGHT * 0.52,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 16,
  },
});
