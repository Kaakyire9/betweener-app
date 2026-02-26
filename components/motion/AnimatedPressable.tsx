import { PropsWithChildren, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Motion } from '@/lib/motion';

type AnimatedPressableProps = PropsWithChildren<{
  onPress?: () => void;
  disabled?: boolean;
  reduceMotion?: boolean;
  style?: StyleProp<ViewStyle>;
  pressScale?: number; // e.g. 0.98
  pressOpacity?: number; // e.g. 0.92
  liftY?: number; // e.g. -4
  liftScale?: number; // e.g. 1.01
  onHaptic?: () => void;
}>;

export default function AnimatedPressable({
  children,
  onPress,
  disabled,
  reduceMotion,
  style,
  pressScale = Motion.transform.pressScale,
  pressOpacity = Motion.transform.pressOpacity,
  liftY = 0,
  liftScale = 1,
  onHaptic,
}: AnimatedPressableProps) {
  const pressed = useSharedValue(0);

  const tap = useMemo(() => {
    const g = Gesture.Tap().enabled(!disabled);

    g.onBegin(() => {
      'worklet';
      pressed.value = reduceMotion
        ? withTiming(1, { duration: Motion.duration.fast })
        : withTiming(1, { duration: Motion.duration.fast, easing: Motion.easing.outCubic });
    });

    g.onFinalize((_evt, success) => {
      'worklet';
      pressed.value = reduceMotion ? withTiming(0, { duration: Motion.duration.fast }) : withSpring(0, Motion.spring);
      if (!success || disabled) return;
      if (onHaptic) runOnJS(onHaptic)();
      if (onPress) runOnJS(onPress)();
    });

    return g;
  }, [disabled, onHaptic, onPress, pressed, reduceMotion]);

  const animatedStyle = useAnimatedStyle<ViewStyle>(() => {
    const p = pressed.value;
    const scaleDown = 1 - (1 - pressScale) * p;
    const opacityDown = 1 - (1 - pressOpacity) * p;
    const lift = liftY * p;
    const liftS = 1 + (liftScale - 1) * p;

    if (reduceMotion) return { opacity: 1 };
    return {
      opacity: opacityDown,
      transform: [{ translateY: lift }, { scale: scaleDown * liftS }] as any,
    };
  }, [liftScale, liftY, pressOpacity, pressScale, reduceMotion]);

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}
