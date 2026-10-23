import { LinearGradient } from 'expo-linear-gradient';
import { Mic, Music2, Radio } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import type { LiveMusicProgramState } from '../odo/show/odo-show-contracts.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const WAVE = [12, 23, 16, 31, 20, 37, 27, 18, 34, 24, 39, 19, 29, 15, 35, 22];

export function LiveMusicProgramStage({ music }: { music: LiveMusicProgramState }) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const playing = ['playing', 'ducked', 'fading'].includes(music.status);
  const breathe = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const [compact, setCompact] = useState(false);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextCompact = event.nativeEvent.layout.height < 380;
    setCompact((current) => current === nextCompact ? current : nextCompact);
  }, []);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    breathe.stopAnimation();

    if (!playing || reduceMotion) {
      breathe.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [breathe, playing, reduceMotion]);

  const glowStyle = {
    opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.48] }),
    transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] }) }],
  };
  const waveStyle = {
    opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.76, 1] }),
    transform: [{ scaleY: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
  };

  return (
    <View
      accessibilityLabel={`Betweener Music. ${music.title ?? 'Programme Music'} by ${music.artist ?? 'Betweener'}. ${music.status}.`}
      onLayout={handleLayout}
      pointerEvents="none"
      style={styles.root}
    >
      <LinearGradient
        colors={['#031915', '#07342E', '#231A32']}
        locations={[0, 0.56, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.ambientTeal} />
      <View style={styles.ambientPurple} />
      <View style={styles.orbitLarge} />
      <View style={styles.orbitSmall} />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.eyebrow}>PLAYING FROM</Text>
            <Text style={styles.collection}>Betweener Music</Text>
          </View>
          <View style={styles.liveBadge}>
            <Radio color={visual.color.teal} size={13} />
            <Text style={styles.liveText}>{playing ? 'LIVE' : 'PAUSED'}</Text>
          </View>
        </View>

        <Animated.View style={[styles.artworkShell, compact && styles.artworkShellCompact]}>
          <Animated.View style={[styles.artworkGlow, compact && styles.artworkGlowCompact, glowStyle]} />
          <LinearGradient
            colors={['#08AAA1', '#123934', '#8F68B7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.artwork, compact && styles.artworkCompact]}
          >
            <View style={styles.artworkOrbit} />
            <Music2 color={visual.color.oat} size={38} />
            <Text style={styles.wordmark}>BETWEENER</Text>
            <Text numberOfLines={1} style={styles.mood}>
              {music.mood?.replaceAll('_', ' ') ?? 'LIVE'}
            </Text>
          </LinearGradient>
        </Animated.View>

        <Text numberOfLines={2} style={[styles.title, compact && styles.titleCompact]}>
          {music.title ?? 'Programme Music'}
        </Text>
        <Text numberOfLines={1} style={styles.artist}>
          {music.artist ?? 'Betweener'}
        </Text>

        <Animated.View
          accessibilityLabel="Programme audio visualization"
          style={[styles.waveform, playing && waveStyle, compact && styles.waveformCompact]}
        >
          {WAVE.map((height, index) => (
            <View
              key={`${height}-${index}`}
              style={[
                styles.waveBar,
                { height: playing ? height : Math.max(5, Math.round(height * 0.3)) },
                index > Math.floor(WAVE.length * 0.7) && styles.waveBarQuiet,
              ]}
            />
          ))}
        </Animated.View>

        <View style={styles.introductionPill}>
          <Mic color={visual.color.teal} size={12} />
          <Text style={styles.caption}>HOST MIC READY FOR INTRODUCTIONS</Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
    backgroundColor: '#031915',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  ambientTeal: {
    position: 'absolute',
    top: -90,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#08AAA1',
    opacity: 0.12,
  },
  ambientPurple: {
    position: 'absolute',
    right: -90,
    bottom: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#8F68B7',
    opacity: 0.13,
  },
  orbitLarge: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: 175,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
    opacity: 0.52,
  },
  orbitSmall: {
    position: 'absolute',
    width: 245,
    height: 245,
    borderRadius: 123,
    borderWidth: 1,
    borderColor: visual.color.purple,
    opacity: 0.22,
  },
  content: {
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: visual.color.teal,
    fontSize: 8,
    letterSpacing: 1.8,
    fontFamily: 'Manrope_800ExtraBold',
  },
  collection: {
    marginTop: 2,
    color: visual.color.oat,
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
  },
  liveBadge: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#031915CC',
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
  },
  liveText: {
    color: visual.color.teal,
    fontSize: 8,
    letterSpacing: 1,
    fontFamily: 'Manrope_800ExtraBold',
  },
  artworkShell: {
    width: 174,
    height: 174,
    marginTop: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkShellCompact: { width: 122, height: 122, marginTop: 8 },
  artworkGlow: {
    position: 'absolute',
    width: 174,
    height: 174,
    borderRadius: 36,
    backgroundColor: visual.color.purple,
  },
  artworkGlowCompact: { width: 122, height: 122, borderRadius: 28 },
  artwork: {
    width: 158,
    height: 158,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FFFFFF24',
  },
  artworkCompact: { width: 112, height: 112, borderRadius: 22 },
  artworkOrbit: {
    position: 'absolute',
    width: 126,
    height: 126,
    borderRadius: 63,
    borderWidth: 1,
    borderColor: '#FFFFFF42',
  },
  wordmark: {
    marginTop: 11,
    color: visual.color.oat,
    fontSize: 7,
    letterSpacing: 2.4,
    fontFamily: 'Manrope_800ExtraBold',
  },
  mood: {
    maxWidth: 120,
    marginTop: 2,
    color: visual.color.oat,
    fontSize: 19,
    textTransform: 'uppercase',
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  title: {
    maxWidth: 310,
    marginTop: 14,
    color: visual.color.oat,
    fontSize: 23,
    lineHeight: 27,
    textAlign: 'center',
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  titleCompact: { marginTop: 7, fontSize: 18, lineHeight: 21 },
  artist: {
    marginTop: 3,
    color: visual.color.textMuted,
    fontSize: 9,
    fontFamily: 'Manrope_600SemiBold',
  },
  waveform: {
    height: 41,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  waveformCompact: { height: 32, marginTop: 4, transform: [{ scaleY: 0.72 }] },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: visual.color.teal,
  },
  waveBarQuiet: { backgroundColor: visual.color.borderStrong },
  introductionPill: {
    minHeight: 27,
    marginTop: 7,
    paddingHorizontal: 11,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#031915CC',
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
  },
  caption: {
    color: visual.color.textMuted,
    fontSize: 7,
    letterSpacing: 0.8,
    fontFamily: 'Manrope_800ExtraBold',
  },
});
