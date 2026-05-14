import { Easing } from "react-native-reanimated";

export const vibesMotion = {
  calmTiming: {
    duration: 360,
    easing: Easing.out(Easing.cubic),
  },
  pressIn: {
    duration: 90,
    easing: Easing.out(Easing.cubic),
  },
  pressOut: {
    duration: 210,
    easing: Easing.out(Easing.cubic),
  },
  ambient: {
    minDuration: 8000,
    maxDuration: 14000,
    easing: Easing.inOut(Easing.cubic),
  },
};
