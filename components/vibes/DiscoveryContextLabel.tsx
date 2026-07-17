import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export type DiscoveryContextLabelProps = {
  mode: 'ghana_diaspora' | 'global';
  label: string;
};

const GLOBAL_PULSE_DURATION_MS = 2400;
const GLOBAL_PULSE_PAUSE_MS = 5200;

export default function DiscoveryContextLabel({
  mode,
  label,
}: DiscoveryContextLabelProps) {
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? 'light') === 'dark';
  const iconEntrance = useSharedValue(0);
  const ringProgress = useSharedValue(0);

  useEffect(() => {
    iconEntrance.value = 0;
    iconEntrance.value = withTiming(1, {
      duration: mode === 'ghana_diaspora' ? 700 : 850,
      easing: Easing.out(Easing.cubic),
    });

    if (mode === 'global') {
      ringProgress.value = 0;
      ringProgress.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: GLOBAL_PULSE_DURATION_MS,
            easing: Easing.out(Easing.cubic),
          }),
          withDelay(GLOBAL_PULSE_PAUSE_MS, withTiming(0, { duration: 1 })),
        ),
        -1,
        false,
      );
    } else {
      ringProgress.value = 0;
    }

    return () => {
      cancelAnimation(iconEntrance);
      cancelAnimation(ringProgress);
    };
  }, [iconEntrance, mode, ringProgress]);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: iconEntrance.value,
    transform: [
      {
        translateY: mode === 'ghana_diaspora'
          ? 3 * (1 - iconEntrance.value)
          : 0,
      },
    ],
  }));

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.18 * (1 - ringProgress.value),
    transform: [{ scale: 0.85 + 0.95 * ringProgress.value }],
  }));

  const isGhana = mode === 'ghana_diaspora';

  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        {isGhana ? (
          <View style={[styles.iconGlow, styles.ghanaGlow]} />
        ) : (
          <Animated.View style={[styles.orbitRing, ringAnimatedStyle]} />
        )}
        <Animated.Text style={[styles.icon, iconAnimatedStyle]}>
          {isGhana ? '🇬🇭' : '🌍'}
        </Animated.Text>
      </View>
      <Text
        style={[styles.label, !isDark && styles.labelLight]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    width: 25,
    height: 25,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    zIndex: 2,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  iconGlow: {
    position: 'absolute',
    width: 23,
    height: 23,
    borderRadius: 12,
  },
  ghanaGlow: {
    backgroundColor: 'rgba(246,197,94,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(19,168,168,0.22)',
  },
  orbitRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(19,168,168,0.45)',
    backgroundColor: 'rgba(139,92,255,0.08)',
  },
  label: {
    flexShrink: 1,
    color: 'rgba(246,239,227,0.72)',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13.5,
    letterSpacing: 0,
  },
  labelLight: {
    color: 'rgba(23,60,59,0.72)',
  },
});
