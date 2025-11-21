import type { Match } from "@/types/match";
import * as Haptics from "expo-haptics";
import React, { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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

    // Shared values
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const scale = useSharedValue(1);
    const cardOpacity = useSharedValue(1);
    const hasPassedThreshold = useSharedValue(false);

    // Imperative API
    const completeSwipe = (dir: "left" | "right") => {
      const current = list[currentIndex];
      if (current && current.id !== "__debug") {
        recordSwipe(current.id, dir === "right" ? "like" : "dislike");
      }
      try {
        if (dir === "right") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
      if (currentIndex < list.length - 1) setCurrentIndex(currentIndex + 1);
      else setCurrentIndex(list.length);
    };

    useImperativeHandle(ref, () => ({
      performSwipe: (dir: "left" | "right") => {
        try {
          const targetX = dir === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;
          cardOpacity.value = withTiming(0, { duration: 240 });
          translateX.value = withTiming(targetX, { duration: 300 }, () => {
            runOnJS(completeSwipe)(dir);
          });
          rotate.value = withTiming(dir === "right" ? 18 : -18, { duration: 300 });
        } catch (e) {
          runOnJS(completeSwipe)(dir);
        }
      },
    }));

    useEffect(() => {
      translateX.value = 0;
      translateY.value = 0;
      rotate.value = 0;
      scale.value = 1;
      cardOpacity.value = 1;
      hasPassedThreshold.value = false;
    }, [currentIndex]);

    // Gesture
    const pan = Gesture.Pan()
      .onUpdate((e) => {
        translateX.value = e.translationX;
        translateY.value = e.translationY;
        rotate.value = interpolate(translateX.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-18, 0, 18], Extrapolate.CLAMP);
        scale.value = 1 - Math.min(Math.abs(translateX.value) / (SCREEN_WIDTH * 8), 0.08);
        cardOpacity.value = 1 - Math.min(Math.abs(translateX.value) / (SCREEN_WIDTH * 1.2), 0.6);

        // threshold haptic gate
        const passed = Math.abs(e.translationX) > SWIPE_THRESHOLD;
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
        const shouldExit = Math.abs(e.translationX) > SWIPE_THRESHOLD || Math.abs(e.velocityX) > 1000;
        if (shouldExit) {
          const dir: "left" | "right" = e.translationX > 0 ? "right" : "left";
          const targetX = dir === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;
          translateX.value = withTiming(targetX, { duration: 280 }, () => runOnJS(completeSwipe)(dir));
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
      opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD], [0.9, 0, 0.9], Extrapolate.CLAMP),
    })) as any;

    const rightGlowStyle = useAnimatedStyle(() => ({
      position: "absolute",
      width: SCREEN_WIDTH * 0.6,
      height: SCREEN_WIDTH * 0.6,
      borderRadius: (SCREEN_WIDTH * 0.6) / 2,
      backgroundColor: "rgba(16,185,129,0.12)",
      transform: [{ scale: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0.6, 1.15], Extrapolate.CLAMP) }],
      opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD], [0, 0.65, 1], Extrapolate.CLAMP),
    } as any));

    const rightIconStyle = useAnimatedStyle(() => {
      const MAX_X = SCREEN_WIDTH * 0.22;
      const followX = Math.abs(translateX.value) > 12 ? interpolate(translateX.value, [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD], [-MAX_X, 0, MAX_X], Extrapolate.CLAMP) : 0;
      return {
        transform: [
          { translateX: followX },
          { translateY: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [12, -12], Extrapolate.CLAMP) },
          { scale: interpolate(translateX.value, [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD], [0.7, 1, 1.2], Extrapolate.CLAMP) },
          { rotate: `${interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 12], Extrapolate.CLAMP)}deg` },
        ],
        opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD * 0.3, SWIPE_THRESHOLD], [0, 0.8, 1], Extrapolate.CLAMP),
      } as any;
    });

    const leftGlowStyle = useAnimatedStyle(() => ({
      position: "absolute",
      width: SCREEN_WIDTH * 0.6,
      height: SCREEN_WIDTH * 0.6,
      borderRadius: (SCREEN_WIDTH * 0.6) / 2,
      backgroundColor: "rgba(239,68,68,0.12)",
      transform: [{ scale: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1.15, 0.6], Extrapolate.CLAMP) }],
      opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD * 0.5, 0], [1, 0.65, 0], Extrapolate.CLAMP),
    } as any));

    const leftIconStyle = useAnimatedStyle(() => {
      const MAX_X = SCREEN_WIDTH * 0.22;
      const followX = Math.abs(translateX.value) > 12 ? interpolate(translateX.value, [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD], [-MAX_X, 0, MAX_X], Extrapolate.CLAMP) : 0;
      return {
        transform: [
          { translateX: followX },
          { translateY: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [-12, 12], Extrapolate.CLAMP) },
          { scale: interpolate(translateX.value, [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD * 0.5, 0], [1.2, 1, 0.7], Extrapolate.CLAMP) },
          { rotate: `${interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [-12, 0], Extrapolate.CLAMP)}deg` },
        ],
        opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD * 0.3, 0], [1, 0.8, 0], Extrapolate.CLAMP),
      } as any;
    });

    // ActiveCard child stabilizes hooks ordering when list changes
    function ActiveCard({ m, zIndex }: { m: Match; zIndex: number }) {
      return (
        <View style={[styles.cardContainer, { zIndex }]}> 
          <GestureDetector gesture={pan}>
            <Animated.View style={{ flex: 1 }} pointerEvents="box-none">
              <Animated.View style={[styles.card, activeStyle]}>
                <ExploreCard match={m} onPress={() => onProfileTap(m.id)} />
              </Animated.View>

              <Animated.View pointerEvents="none" style={[styles.feedbackContainer, overlayContainerStyle]}>
                <Animated.View style={rightGlowStyle} />
                <Animated.View style={rightIconStyle}>
                  <MaterialCommunityIcons name="heart" size={64} color="#10B981" />
                </Animated.View>
                <Animated.View style={leftGlowStyle} />
                <Animated.View style={leftIconStyle}>
                  <MaterialCommunityIcons name="close" size={64} color="#EF4444" />
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        </View>
      );
    }

    // stacked (non-active) card renderer
    function StackedCard({ m, index, zIndex }: { m: Match; index: number; zIndex: number }) {
      const st = useAnimatedStyle(() => {
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
        <Animated.View key={m.id} style={[styles.card, st, { zIndex }]}>
          <ExploreCard match={m} onPress={() => onProfileTap(m.id)} />
        </Animated.View>
      );
    }

    // UI
    return (
      <View style={{ flex: 1, alignSelf: "stretch" }}>
        {list.map((m, i) => {
          if (i < currentIndex) return null;
          const isActive = i === currentIndex;
          const zIndex = list.length - i;

          if (isActive) return <ActiveCard key={m.id} m={m} zIndex={zIndex} />;

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
