import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { LiveReactionBurst } from '../application/index.ts';
import { LIVE_REACTION_PRESENTATION } from './live-reaction-presentation.ts';
import { LiveReactionGlyph } from './LiveReactionGlyph.tsx';

const seedFor = (id: string) => Array.from(id).reduce(
  (seed, character) => ((seed * 31) + character.charCodeAt(0)) >>> 0,
  17,
);

const BurstGlyphCluster = ({
  accent,
  burst,
}: {
  accent: string;
  burst: LiveReactionBurst;
}) => {
  const visibleCount = Math.min(burst.count, 3);
  return (
    <View style={styles.glyphCluster}>
      {Array.from({ length: visibleCount }, (_, index) => (
        <View
          key={index}
          style={[
            styles.clusterGlyph,
            index > 0 && styles.clusterGlyphOverlap,
            index === 1 && styles.clusterGlyphLift,
            { backgroundColor: `${accent}1F`, borderColor: `${accent}73` },
          ]}
        >
          <LiveReactionGlyph color={accent} kind={burst.reaction} size={visibleCount === 1 ? 23 : 17} />
        </View>
      ))}
    </View>
  );
};

const ReactionParticle = memo(function ReactionParticle({
  burst,
  height,
  onComplete,
  reduceMotion,
}: {
  burst: LiveReactionBurst;
  height: number;
  onComplete: (id: string) => void;
  reduceMotion: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const seed = useMemo(() => seedFor(burst.id), [burst.id]);
  const presentation = LIVE_REACTION_PRESENTATION[burst.reaction];
  const startLeft = 12 + (seed % 73);
  const drift = ((seed % 5) - 2) * 13;
  const distance = reduceMotion ? 24 : Math.max(170, height * 0.52);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 720 : 1_850 + (seed % 420),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onComplete(burst.id);
    });
    return () => animation.stop();
  }, [burst.id, onComplete, progress, reduceMotion, seed]);

  const animatedStyle: Animated.WithAnimatedValue<ViewStyle> = {
    opacity: progress.interpolate({
      inputRange: [0, 0.1, 0.76, 1],
      outputRange: [0, 1, 0.92, 0],
    }),
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [18, -distance],
        }),
      },
      {
        translateX: progress.interpolate({
          inputRange: [0, 0.55, 1],
          outputRange: [0, drift, drift * 0.35],
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 0.14, 0.72, 1],
          outputRange: [0.7, 1.14, 1, 0.9],
        }),
      },
    ],
  };
  const ringStyle = {
    opacity: progress.interpolate({
      inputRange: [0, 0.12, 0.56, 1],
      outputRange: [0, 0.78, 0.26, 0],
    }),
    transform: [{
      scale: progress.interpolate({
        inputRange: [0, 0.7, 1],
        outputRange: [0.72, 1.32, 1.62],
      }),
    }],
  };

  return (
    <Animated.View
      renderToHardwareTextureAndroid
      style={[styles.particle, { left: `${startLeft}%` }, animatedStyle]}
    >
      <View style={[styles.particleGlow, { backgroundColor: `${presentation.accent}25` }]} />
      {!reduceMotion ? (
        <>
          <View style={[styles.trailDot, styles.trailDotOne, { backgroundColor: `${presentation.accent}B8` }]} />
          <View style={[styles.trailDot, styles.trailDotTwo, { backgroundColor: `${presentation.accent}80` }]} />
          <View style={[styles.trailDot, styles.trailDotThree, { backgroundColor: `${presentation.accent}54` }]} />
          <Animated.View
            style={[styles.particleRing, { borderColor: `${presentation.accent}9E` }, ringStyle]}
          />
        </>
      ) : null}
      <View style={[styles.particleCore, { borderColor: `${presentation.accent}7A` }]}>
        <BurstGlyphCluster accent={presentation.accent} burst={burst} />
        {burst.count > 3 ? <Text style={styles.particleCount}>{burst.count}</Text> : null}
      </View>
    </Animated.View>
  );
});

type Props = {
  bursts: readonly LiveReactionBurst[];
  onBurstComplete: (id: string) => void;
};

export const LiveReactionBurstLayer = memo(function LiveReactionBurstLayer({
  bursts,
  onBurstComplete,
}: Props) {
  const reduceMotion = useReduceMotion();
  const [height, setHeight] = useState(0);
  const surgeProgress = useRef(new Animated.Value(0)).current;
  const surgeId = useMemo(
    () => [...bursts].reverse().find((burst) => burst.count >= 4)?.id ?? null,
    [bursts],
  );
  const captureLayout = (event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height);

  useEffect(() => {
    if (!surgeId || reduceMotion) {
      surgeProgress.setValue(0);
      return undefined;
    }
    surgeProgress.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(surgeProgress, { toValue: 0.62, duration: 260, useNativeDriver: true }),
      Animated.timing(surgeProgress, { toValue: 1, duration: 740, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, surgeId, surgeProgress]);

  const surgeStyle = {
    opacity: surgeProgress.interpolate({
      inputRange: [0, 0.25, 0.72, 1],
      outputRange: [0, 0.58, 0.24, 0],
    }),
    transform: [{
      scale: surgeProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.97, 1.025],
      }),
    }],
  };

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={captureLayout}
      pointerEvents="none"
      style={styles.layer}
    >
      {!reduceMotion && surgeId ? (
        <Animated.View style={[styles.surgeFrame, surgeStyle]}>
          <View style={styles.surgeInnerFrame} />
        </Animated.View>
      ) : null}
      {height > 0 ? bursts.map((burst) => (
        <ReactionParticle
          key={burst.id}
          burst={burst}
          height={height}
          onComplete={onBurstComplete}
          reduceMotion={reduceMotion}
        />
      )) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 30, overflow: 'hidden' },
  particle: { position: 'absolute', bottom: 42, width: 92, height: 74, marginLeft: -46, alignItems: 'center', justifyContent: 'center' },
  particleGlow: { position: 'absolute', width: 76, height: 68, borderRadius: 34 },
  particleRing: { position: 'absolute', width: 62, height: 58, borderRadius: 29, borderWidth: 1 },
  particleCore: { minWidth: 50, height: 50, paddingHorizontal: 7, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#071916E8', borderWidth: 1, shadowColor: '#000000', shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 8 },
  glyphCluster: { flexDirection: 'row', alignItems: 'center' },
  clusterGlyph: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  clusterGlyphOverlap: { marginLeft: -12 },
  clusterGlyphLift: { transform: [{ translateY: -3 }] },
  particleCount: { minWidth: 18, color: '#FFF9F1', fontSize: 9, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold' },
  trailDot: { position: 'absolute', borderRadius: 99 },
  trailDotOne: { width: 5, height: 5, left: 26, bottom: 4 },
  trailDotTwo: { width: 3, height: 3, left: 37, bottom: 0 },
  trailDotThree: { width: 3, height: 3, left: 20, bottom: 13 },
  surgeFrame: { position: 'absolute', top: 8, right: 8, bottom: 8, left: 8, borderRadius: 28, borderWidth: 1.5, borderColor: '#7BE0D0A8', shadowColor: '#A88ADA', shadowOpacity: 0.7, shadowRadius: 18, elevation: 3 },
  surgeInnerFrame: { position: 'absolute', top: 5, right: 5, bottom: 5, left: 5, borderRadius: 23, borderWidth: 1, borderColor: '#F2E3C463' },
});
