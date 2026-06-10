import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type BetweenerLoaderProps = {
  label?: string;
  sublabel?: string;
  fullScreen?: boolean;
};

const DOT_COLORS = ['#658783', '#00A0A0', '#7FD5CF', '#E8F0ED', '#E8F0ED', '#8FD9D4', '#9B7CC8', '#B894E4'] as const;
const LINE_X = [-28, -20, -12, -4, 4, 12, 20, 28] as const;
const TRIANGLE_POINTS = [
  { x: 0, y: -18 },
  { x: -8, y: -8 },
  { x: 8, y: -8 },
  { x: -16, y: 4 },
  { x: 16, y: 4 },
  { x: -24, y: 16 },
  { x: 24, y: 16 },
  { x: 0, y: 16 },
] as const;
const CIRCLE_POINTS = [
  { x: 0, y: -18 },
  { x: 12.7, y: -12.7 },
  { x: 18, y: 0 },
  { x: 12.7, y: 12.7 },
  { x: 0, y: 18 },
  { x: -12.7, y: 12.7 },
  { x: -18, y: 0 },
  { x: -12.7, y: -12.7 },
] as const;

export default function BetweenerLoader({ fullScreen = true }: BetweenerLoaderProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const timeline = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(breathe, {
            toValue: 0,
            duration: 1600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.timing(timeline, {
          toValue: 1,
          duration: 4600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ]);

    animation.start();
    return () => animation.stop();
  }, [breathe, timeline]);

  const orbitRotation = timeline.interpolate({
    inputRange: [0, 0.76, 1],
    outputRange: ['0deg', '0deg', '300deg'],
  });
  const stageScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1.02],
  });
  const stageOpacity = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });

  return (
    <View style={[styles.container, !fullScreen && styles.inline]}>
      <Animated.View style={[styles.stage, { opacity: stageOpacity, transform: [{ scale: stageScale }, { rotate: orbitRotation }] }]}>
        {LINE_X.map((lineX, index) => {
          const bounceStart = index * 0.028;
          const dropPoint = bounceStart + 0.055;
          const reboundPoint = bounceStart + 0.093;
          const settlePoint = bounceStart + 0.14;

          const translateX = timeline.interpolate({
            inputRange: [0, 0.4, 0.66, 0.84, 1],
            outputRange: [
              lineX,
              lineX,
              TRIANGLE_POINTS[index].x,
              CIRCLE_POINTS[index].x,
              CIRCLE_POINTS[index].x,
            ],
          });

          const translateY = timeline.interpolate({
            inputRange: [0, bounceStart, dropPoint, reboundPoint, settlePoint, 0.4, 0.66, 0.84, 1],
            outputRange: [
              -20,
              -20,
              0,
              -6.5,
              0,
              0,
              TRIANGLE_POINTS[index].y,
              CIRCLE_POINTS[index].y,
              CIRCLE_POINTS[index].y,
            ],
            extrapolate: 'clamp',
          });

          const scale = timeline.interpolate({
            inputRange: [0, bounceStart, dropPoint, reboundPoint, settlePoint, 0.66, 0.84, 1],
            outputRange: [0.64, 0.64, 1.12, 0.88, 1, 1, 0.95, 1],
            extrapolate: 'clamp',
          });

          const opacity = timeline.interpolate({
            inputRange: [0, bounceStart, dropPoint, 0.66, 1],
            outputRange: [0.18, 0.18, 1, 0.94, 0.9],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor: DOT_COLORS[index],
                  opacity,
                  transform: [{ translateX }, { translateY }, { scale }],
                },
              ]}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    inline: {
      flex: 0,
      minHeight: 96,
      backgroundColor: 'transparent',
    },
    stage: {
      width: 72,
      height: 72,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: {
      position: 'absolute',
      width: 6,
      height: 6,
      borderRadius: 999,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 1 },
    },
  });
