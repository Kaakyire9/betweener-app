import { Animated, View } from "react-native";

type Props = {
  styles: any;
  progress: Animated.AnimatedInterpolation<string | number>;
};

export function PremiumOnboardingProgressBar({ styles, progress }: Props) {
  return (
    <View style={styles.progressShell}>
      <Animated.View style={[styles.progressFill, { width: progress }]} />
    </View>
  );
}
