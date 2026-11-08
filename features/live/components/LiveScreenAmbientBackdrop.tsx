import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

export const LiveScreenAmbientBackdrop = memo(function LiveScreenAmbientBackdrop({
  dark,
  reduceMotion,
}: {
  dark: boolean;
  reduceMotion: boolean;
}) {
  const phase = useRef(new Animated.Value(reduceMotion ? 0.5 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      phase.stopAnimation();
      phase.setValue(0.5);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, {
          toValue: 1,
          duration: 7_000,
          useNativeDriver: true,
        }),
        Animated.timing(phase, {
          toValue: 0,
          duration: 7_000,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [phase, reduceMotion]);

  const primaryMotion: Animated.WithAnimatedValue<ViewStyle> = {
    opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.14] }),
    transform: [
      { translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] }) },
      { translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [-10, 16] }) },
      { scale: phase.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] }) },
    ],
  };
  const secondaryMotion: Animated.WithAnimatedValue<ViewStyle> = {
    opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.07] }),
    transform: [
      { translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [14, -16] }) },
      { translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [12, -12] }) },
      { scale: phase.interpolate({ inputRange: [0, 1], outputRange: [1.04, 0.95] }) },
    ],
  };

  return (
    <View pointerEvents="none" style={styles.root}>
      <LinearGradient
        colors={dark
          ? ['#071512', '#0A211D', '#071815']
          : ['#F7FFFC', '#DFF5F0', '#F9FFFD']}
        locations={[0, 0.52, 1]}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.88, y: 1 }}
        style={styles.base}
      />
      <Animated.View
        style={[
          styles.orb,
          styles.primaryOrb,
          { backgroundColor: dark ? '#42D7C6' : '#18B8B4' },
          primaryMotion,
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          styles.secondaryOrb,
          { backgroundColor: dark ? '#806CA8' : '#5F4B8B' },
          secondaryMotion,
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  base: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  orb: { position: 'absolute', width: 360, height: 360, borderRadius: 180 },
  primaryOrb: { top: -126, left: -118 },
  secondaryOrb: { right: -142, bottom: -154 },
});
