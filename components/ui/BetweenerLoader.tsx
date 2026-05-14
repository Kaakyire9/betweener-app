import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

type BetweenerLoaderProps = {
  label?: string;
  sublabel?: string;
  fullScreen?: boolean;
};

export default function BetweenerLoader({
  label = 'Opening Betweener',
  sublabel = 'Keeping your connection ready.',
  fullScreen = true,
}: BetweenerLoaderProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const pulse = useRef(new Animated.Value(0)).current;
  const dotA = useRef(new Animated.Value(0)).current;
  const dotB = useRef(new Animated.Value(0)).current;
  const dotC = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeDot = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 420,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay(180),
        ]),
      );

    const animation = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 1200,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ),
      makeDot(dotA, 0),
      makeDot(dotB, 120),
      makeDot(dotC, 240),
    ]);

    animation.start();
    return () => animation.stop();
  }, [dotA, dotB, dotC, pulse]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.72] });

  const dotStyle = (value: Animated.Value) => ({
    transform: [
      {
        translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
      },
      {
        scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.12] }),
      },
    ],
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }),
  }) as any;

  return (
    <View style={[styles.container, !fullScreen && styles.inline]}>
      <View style={styles.markWrap}>
        <Animated.View style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
        <View style={styles.mark}>
          <MaterialCommunityIcons name="heart-multiple" size={26} color="#EFFFFB" />
        </View>
      </View>

      <View style={styles.dots}>
        <Animated.View style={[styles.dot, styles.dotTeal, dotStyle(dotA)]} />
        <Animated.View style={[styles.dot, styles.dotLight, dotStyle(dotB)]} />
        <Animated.View style={[styles.dot, styles.dotAccent, dotStyle(dotC)]} />
      </View>

      <Text style={styles.label}>{label}</Text>
      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      backgroundColor: theme.background,
    },
    inline: {
      flex: 0,
      minHeight: 220,
      backgroundColor: 'transparent',
    },
    markWrap: {
      width: 82,
      height: 82,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 22,
    },
    halo: {
      position: 'absolute',
      width: 82,
      height: 82,
      borderRadius: 41,
      backgroundColor: isDark ? 'rgba(0, 160, 160, 0.22)' : 'rgba(0, 128, 128, 0.16)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(91, 193, 187, 0.22)' : 'rgba(0, 128, 128, 0.18)',
    },
    mark: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.tint,
      shadowColor: theme.tint,
      shadowOpacity: 0.34,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      height: 18,
      marginBottom: 18,
    },
    dot: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
    },
    dotTeal: { backgroundColor: theme.tint },
    dotLight: { backgroundColor: isDark ? '#DFFDFC' : '#3DBDB7' },
    dotAccent: { backgroundColor: theme.accent },
    label: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: 0,
    },
    sublabel: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 7,
      lineHeight: 19,
      maxWidth: 280,
    },
  });
