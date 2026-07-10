import React, { useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { Animated, Easing, Pressable, type PressableProps } from 'react-native';

export function HapticTab(props: PressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const animateTo = (nextScale: number, nextTranslateY: number) => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: nextScale,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: nextTranslateY,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale }, { translateY }],
      }}
    >
      <Pressable
        {...props}
        onPressIn={(ev) => {
          animateTo(0.97, 1);
          if (process.env.EXPO_OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          props.onPressIn?.(ev);
        }}
        onPressOut={(ev) => {
          animateTo(1, 0);
          props.onPressOut?.(ev);
        }}
      />
    </Animated.View>
  );
}
