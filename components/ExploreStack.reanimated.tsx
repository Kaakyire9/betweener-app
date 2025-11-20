import type { Match } from "@/types/match";
import * as Haptics from "expo-haptics";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
} from "react";
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
  performSwipe: (dir: "left" | "right") => void;
};

type Props = {
  matches: Match[];
  currentIndex: number;
  setCurrentIndex: (n: number) => void;
  recordSwipe: (id: string, action: "like" | "dislike") => void;
  onProfileTap: (id: string) => void;
};

const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;
const EXIT_DISTANCE = SCREEN_WIDTH * 1.2;

const ExploreStackReanimated = forwardRef<ExploreStackHandle, Props>(
  ({ matches, currentIndex, setCurrentIndex, recordSwipe, onProfileTap }, ref) => {
    // Debug match for empty lists in dev mode
    const debugMatch: Match = useMemo(
      () => ({
        id: "__debug",
        name: "Demo",
        age: 30,
        tagline: "Demo profile",
        bio: "Debug profile for layout",
        location: "",
        tribe: "",
        religion: "",
        interests: [],
        avatar_url: "",
        distance: "",
        lastActive: "",
        isActiveNow: false,
      }),
      []
    );

    const list = matches && matches.length > 0 ? matches : [debugMatch];

    // (no debug logs) -- production path

    // SHARED VALUES for current card
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const scale = useSharedValue(1);
    const cardOpacity = useSharedValue(1);

    // Imperative swipe from parent
    useImperativeHandle(ref, () => ({
      performSwipe: (dir: "left" | "right") => {
        try {
          const targetX = dir === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;

          cardOpacity.value = withTiming(0, { duration: 240 });
          translateX.value = withTiming(targetX, { duration: 300 }, () => {
            runOnJS(completeSwipe)(dir);
          });
          rotate.value = withTiming(dir === "right" ? 18 : -18, { duration: 300 });
        } catch {
          runOnJS(completeSwipe)(dir);
        }
      },
    }));

    // Reset when index changes
    useEffect(() => {
      translateX.value = 0;
      translateY.value = 0;
      rotate.value = 0;
      scale.value = 1;
      cardOpacity.value = 1;
    }, [currentIndex]);

    // JS handler after animation
    const completeSwipe = (dir: "left" | "right") => {
      const current = list[currentIndex];

      if (current && current.id !== "__debug") {
        recordSwipe(current.id, dir === "right" ? "like" : "dislike");
      }

      try {
        if (dir === "right") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      } catch {}

      if (currentIndex < list.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setCurrentIndex(list.length);
      }
    };

    // ACTIVE CARD ANIMATION (single hook — order stable)
    const activeStyle = useAnimatedStyle(() => {
      return {
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
          { rotate: `${rotate.value}deg` },
          { scale: scale.value },
        ],
        opacity: cardOpacity.value,
      } as any;
    });

    // GESTURE HANDLER
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
        const shouldExit =
          Math.abs(e.translationX) > SWIPE_THRESHOLD ||
          Math.abs(e.velocityX) > 1000;

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

    // Small child component for stacked cards — each instance safely uses hooks.
    function StackedCard({ m, index, zIndex }: { m: Match; index: number; zIndex: number }) {
      // derived animated style per-instance (hook inside stable component instance)
      const st = useAnimatedStyle(() => {
        const diff = index - currentIndex;
        if (diff <= 0) {
          return {
            transform: [{ translateY: 0 }, { scale: 1 }],
            opacity: 1,
          } as any;
        }
        const ty = diff * 12;
        const sc = 1 - Math.min(diff * 0.04, 0.12);
        const op = 1 - Math.min(diff * 0.08, 0.6);

        return {
          transform: [
            { translateY: withTiming(ty, { duration: 300 }) },
            { scale: withTiming(sc, { duration: 300 }) },
          ],
          opacity: withTiming(op, { duration: 300 }),
        } as any;
      }, [currentIndex, index]);

      return (
        <Animated.View style={[styles.card, st, { zIndex }]} key={m.id}>
          <ExploreCard match={m} onPress={() => onProfileTap(m.id)} />
        </Animated.View>
      );
    }

    // UI RENDER
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

          // stacked (non-active) card — render StackedCard instance
          return <StackedCard key={m.id} m={m} index={i} zIndex={zIndex} />;
        })}
      </View>
    );
  }
);

export default ExploreStackReanimated;

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
