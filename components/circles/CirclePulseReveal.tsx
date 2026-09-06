import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

export default function CirclePulseReveal({ children, delay = 0, style }: Props) {
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled || reduceMotion || process.env.NODE_ENV === 'test') {
          progress.setValue(1);
          return;
        }
        progress.setValue(0);
        animation = Animated.timing(progress, {
          toValue: 1,
          duration: 520,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        });
        animation.start();
      })
      .catch(() => progress.setValue(1));

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [delay, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
