import { Easing } from 'react-native-reanimated';

// Shared motion tokens for a consistent "premium" feel.
export const Motion = {
  duration: {
    fast: 120,
    base: 180,
    slow: 240,
  },
  easing: {
    outCubic: Easing.out(Easing.cubic),
  },
  spring: {
    damping: 20,
    stiffness: 190,
    mass: 1,
  },
  transform: {
    pressScale: 0.98,
    pressOpacity: 0.92,
    popScale: 1.02,
    enterTranslateY: 8,
    cardLiftY: -4,
    avatarLiftY: -2,
  },
} as const;

