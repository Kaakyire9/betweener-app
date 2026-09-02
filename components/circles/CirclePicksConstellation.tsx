import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';
import { CirclePickCard, type CirclePickData } from './CirclesHomeCards';

type Props = {
  picks: CirclePickData[];
  onOpenProfile: (pick: CirclePickData) => void;
};

export default function CirclePicksConstellation({ picks, onOpenProfile }: Props) {
  const palette = useCirclePulsePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { width: windowWidth } = useWindowDimensions();
  const reveal = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const signature = picks.map((pick) => `${pick.circleId ?? pick.circleName}:${pick.profile_id}`).join('|');
  const originCircles = Array.from(new Set(picks.map((pick) => pick.circleName).filter(Boolean))).slice(0, 3);
  const pickCardWidth = Math.max(136, Math.min(180, (windowWidth - 60) / 2));
  const remainingPickCount = Math.max(0, picks.length - 2);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    reveal.stopAnimation();
    if (reduceMotion) {
      reveal.setValue(1);
      return;
    }
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 1450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => reveal.stopAnimation();
  }, [reduceMotion, reveal, signature]);

  return (
    <View style={styles.shell}>
      <Animated.View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.constellation,
          {
            opacity: reveal.interpolate({ inputRange: [0, 0.38], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{
              translateY: reveal.interpolate({ inputRange: [0, 0.45], outputRange: [-7, 0], extrapolate: 'clamp' }),
            }],
          },
        ]}
      >
        <View style={styles.originRow}>
          {originCircles.map((circleName, index) => (
            <Animated.View
              key={circleName}
              style={[
                styles.originNode,
                {
                  opacity: reveal.interpolate({
                    inputRange: [0.04 + index * 0.06, 0.28 + index * 0.06],
                    outputRange: [0, 1],
                    extrapolate: 'clamp',
                  }),
                  transform: [{
                    scale: reveal.interpolate({
                      inputRange: [0.04 + index * 0.06, 0.32 + index * 0.06],
                      outputRange: [0.86, 1],
                      extrapolate: 'clamp',
                    }),
                  }],
                },
              ]}
            >
              <View style={styles.nodeDot} />
              <Text style={styles.originLabel} numberOfLines={1}>{circleName}</Text>
            </Animated.View>
          ))}
        </View>

        <View style={styles.threadField}>
          {originCircles.map((circleName, index) => {
            const isLeftThread = originCircles.length > 1 && index === 0;
            const isRightThread = originCircles.length > 1 && index === originCircles.length - 1;
            return (
              <Animated.View
                key={`thread:${circleName}`}
                style={[
                  styles.thread,
                  isLeftThread ? styles.threadLeft : isRightThread ? styles.threadRight : styles.threadCenter,
                  {
                    opacity: reveal.interpolate({ inputRange: [0.24, 0.58], outputRange: [0, 0.72], extrapolate: 'clamp' }),
                    transform: [
                      ...(isLeftThread
                        ? [{ rotate: '-24deg' as const }]
                        : isRightThread
                          ? [{ rotate: '24deg' as const }]
                          : []),
                      {
                        scaleY: reveal.interpolate({ inputRange: [0.24, 0.62], outputRange: [0, 1], extrapolate: 'clamp' }),
                      },
                    ],
                  },
                ]}
              />
            );
          })}
          <Animated.View
            style={[
              styles.contextSpark,
              {
                opacity: reveal.interpolate({ inputRange: [0.46, 0.68], outputRange: [0, 1], extrapolate: 'clamp' }),
                transform: [{
                  scale: reveal.interpolate({ inputRange: [0.46, 0.76], outputRange: [0.7, 1], extrapolate: 'clamp' }),
                }],
              },
            ]}
          >
            <MaterialCommunityIcons name="creation" size={15} color={palette.overlayText} />
          </Animated.View>
        </View>
        <View style={styles.constellationCaptionRow}>
          <MaterialCommunityIcons name="shimmer" size={13} color={palette.tealStrong} />
          <Text style={styles.constellationCaption}>Your shared worlds are opening new introductions</Text>
        </View>
      </Animated.View>

      <View style={styles.pickRailFrame}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.pickRail, picks.length === 1 && styles.pickRailSingle]}
          accessibilityLabel="Circle Picks"
        >
          {picks.map((pick, index) => {
            const start = Math.min(0.76, 0.46 + index * 0.055);
            const end = Math.min(0.96, 0.74 + index * 0.035);
            return (
              <Animated.View
                key={pick.profile_id}
                style={{
                  opacity: reveal.interpolate({ inputRange: [start, end], outputRange: [0, 1], extrapolate: 'clamp' }),
                  transform: [
                    {
                      translateX: reveal.interpolate({ inputRange: [start, end], outputRange: [24, 0], extrapolate: 'clamp' }),
                    },
                    {
                      scale: reveal.interpolate({ inputRange: [start, end], outputRange: [0.965, 1], extrapolate: 'clamp' }),
                    },
                  ],
                }}
              >
                <CirclePickCard pick={pick} cardWidth={pickCardWidth} onOpenProfile={() => onOpenProfile(pick)} />
              </Animated.View>
            );
          })}
        </ScrollView>
        {remainingPickCount > 0 ? (
          <View pointerEvents="none" style={styles.continuationBadge} accessibilityElementsHidden>
            <Text style={styles.continuationText}>+{remainingPickCount}</Text>
            <MaterialCommunityIcons name="chevron-right" size={13} color={palette.overlayText} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (palette: CirclePulsePalette) => StyleSheet.create({
  shell: { gap: 12 },
  constellation: {
    minHeight: 104,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.outlineSoft,
    backgroundColor: palette.dark ? 'rgba(4,22,25,0.62)' : 'rgba(255,249,243,0.76)',
    overflow: 'hidden',
  },
  originRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', gap: 8 },
  originNode: {
    maxWidth: '31%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.tealBorder,
    backgroundColor: palette.tealSoft,
  },
  nodeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.tealStrong },
  originLabel: { flexShrink: 1, color: palette.textSoft, fontSize: 9, fontWeight: '800' },
  threadField: { height: 38, alignItems: 'center', justifyContent: 'flex-end' },
  thread: {
    position: 'absolute',
    top: 1,
    width: 1,
    height: 31,
    backgroundColor: palette.tealStrong,
  },
  threadLeft: { left: '28%' },
  threadRight: { right: '28%' },
  threadCenter: { left: '50%' },
  contextSpark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.purpleStrong,
    borderWidth: 1,
    borderColor: palette.purpleBorder,
    shadowColor: palette.purpleStrong,
    shadowOpacity: 0.36,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  constellationCaptionRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  constellationCaption: { color: palette.textMuted, fontSize: 10, textAlign: 'center', fontWeight: '700' },
  pickRailFrame: { position: 'relative' },
  pickRail: { flexGrow: 1, gap: 10, paddingHorizontal: 6, paddingRight: 18 },
  pickRailSingle: { justifyContent: 'center', paddingRight: 6 },
  continuationBadge: {
    position: 'absolute',
    right: 6,
    top: 10,
    minWidth: 38,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(95,57,211,0.92)',
    borderWidth: 1,
    borderColor: palette.purpleBorder,
    shadowColor: palette.purpleStrong,
    shadowOpacity: 0.34,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  continuationText: { color: palette.overlayText, fontSize: 10, fontWeight: '900' },
});
