import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { useReduceMotion } from '@/hooks/useReduceMotion.ts';

type SeamSpec = {
  key: string;
  orientation: 'horizontal' | 'vertical';
  style: ViewStyle;
};

type Props = {
  focusedIndex: number;
  stageHeight: number;
  stageWidth: number;
  tileCount: number;
};

const vertical = (
  key: string,
  left: ViewStyle['left'],
  top: ViewStyle['top'],
  bottom: ViewStyle['bottom'],
): SeamSpec => ({ key, orientation: 'vertical', style: { left, top, bottom } });

const horizontal = (
  key: string,
  top: ViewStyle['top'],
  left: ViewStyle['left'],
  right: ViewStyle['right'],
): SeamSpec => ({ key, orientation: 'horizontal', style: { top, left, right } });

const baseSeamsFor = (tileCount: number, portraitTrio: boolean): readonly SeamSpec[] => {
  if (tileCount === 2) return [vertical('dual-centre', '50%', 13, 13)];
  if (tileCount === 3 && portraitTrio) {
    return [
      vertical('trio-portrait-spine', '56%', 13, 13),
      horizontal('trio-portrait-branch', '50%', '56%', 13),
    ];
  }
  if (tileCount === 3) {
    return [
      horizontal('trio-landscape-spine', '56%', 13, 13),
      vertical('trio-landscape-branch', '50%', '56%', 13),
    ];
  }
  if (tileCount >= 4) {
    return [
      vertical('quad-vertical', '50%', 13, 13),
      horizontal('quad-horizontal', '50%', 13, 13),
    ];
  }
  return [];
};

const activeSeamsFor = (
  tileCount: number,
  portraitTrio: boolean,
  focusedIndex: number,
): readonly SeamSpec[] => {
  if (focusedIndex < 0) return [];
  if (tileCount === 2) return [vertical('active-dual', '50%', 16, 16)];
  if (tileCount === 3 && portraitTrio) {
    if (focusedIndex === 0) return [vertical('active-trio-lead', '56%', 16, 16)];
    const upper = focusedIndex === 1;
    return [
      vertical('active-trio-side', '56%', upper ? 16 : '50%', upper ? '50%' : 16),
      horizontal('active-trio-branch', '50%', '56%', 16),
    ];
  }
  if (tileCount === 3) {
    if (focusedIndex === 0) return [horizontal('active-trio-lead', '56%', 16, 16)];
    const left = focusedIndex === 1;
    return [
      horizontal('active-trio-side', '56%', left ? 16 : '50%', left ? '50%' : 16),
      vertical('active-trio-branch', '50%', '56%', 16),
    ];
  }
  if (tileCount >= 4) {
    const left = focusedIndex % 2 === 0;
    const upper = focusedIndex < 2;
    return [
      vertical('active-quad-vertical', '50%', upper ? 16 : '50%', upper ? '50%' : 16),
      horizontal('active-quad-horizontal', '50%', left ? 16 : '50%', left ? '50%' : 16),
    ];
  }
  return [];
};

const Seam = memo(function Seam({
  active,
  opacity,
  seam,
}: {
  active?: boolean;
  opacity?: Animated.Value;
  seam: SeamSpec;
}) {
  const isVertical = seam.orientation === 'vertical';
  const colors = active
    ? ['#42D5C300', '#42D5C38F', '#F3E4CAA3', '#AE92E08F', '#AE92E000'] as const
    : ['#42D5C300', '#42D5C32E', '#F3E4CA3D', '#9D83CF2E', '#9D83CF00'] as const;
  return (
    <Animated.View
      style={[
        styles.channel,
        isVertical ? styles.verticalChannel : styles.horizontalChannel,
        active && (isVertical ? styles.verticalChannelActive : styles.horizontalChannelActive),
        seam.style,
        active && opacity ? { opacity } : null,
      ]}
    >
      <LinearGradient
        colors={colors}
        locations={[0, 0.18, 0.5, 0.82, 1]}
        start={{ x: 0, y: 0 }}
        end={isVertical ? { x: 0, y: 1 } : { x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={active
          ? ['#F8ECD000', '#F8ECD070', '#F8ECD000']
          : ['#F8ECD000', '#F8ECD03D', '#F8ECD000']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={isVertical ? { x: 0, y: 1 } : { x: 1, y: 0 }}
        style={isVertical ? styles.verticalCore : styles.horizontalCore}
      />
    </Animated.View>
  );
});

export const LiveStageSeamLayer = memo(function LiveStageSeamLayer({
  focusedIndex,
  stageHeight,
  stageWidth,
  tileCount,
}: Props) {
  const reduceMotion = useReduceMotion();
  const activeOpacity = useRef(new Animated.Value(focusedIndex >= 0 ? 0.66 : 0)).current;
  const portraitTrio = stageWidth > 0 && stageHeight >= stageWidth * 0.72;
  const baseSeams = useMemo(
    () => baseSeamsFor(tileCount, portraitTrio),
    [portraitTrio, tileCount],
  );
  const activeSeams = useMemo(
    () => activeSeamsFor(tileCount, portraitTrio, focusedIndex),
    [focusedIndex, portraitTrio, tileCount],
  );
  const junctionStyle = portraitTrio && tileCount === 3
    ? { left: '56%' as const, top: '50%' as const }
    : tileCount === 3
      ? { left: '50%' as const, top: '56%' as const }
      : { left: '50%' as const, top: '50%' as const };

  useEffect(() => {
    if (focusedIndex < 0) {
      activeOpacity.setValue(0);
      return undefined;
    }
    if (reduceMotion) {
      activeOpacity.setValue(0.58);
      return undefined;
    }
    activeOpacity.setValue(0.2);
    const animation = Animated.sequence([
      Animated.timing(activeOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(activeOpacity, { toValue: 0.56, duration: 520, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [activeOpacity, focusedIndex, reduceMotion]);

  if (tileCount <= 1) return null;

  return (
    <View pointerEvents="none" style={styles.layer}>
      {baseSeams.map((seam) => <Seam key={seam.key} seam={seam} />)}
      {activeSeams.map((seam) => (
        <Seam key={seam.key} active opacity={activeOpacity} seam={seam} />
      ))}
      <View style={[styles.junctionHalo, junctionStyle]}>
        <View style={styles.junctionGem} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 4 },
  channel: { position: 'absolute', overflow: 'hidden' },
  verticalChannel: { width: 5, marginLeft: -2 },
  horizontalChannel: { height: 5, marginTop: -2 },
  verticalChannelActive: { width: 9, marginLeft: -4 },
  horizontalChannelActive: { height: 9, marginTop: -4 },
  verticalCore: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, marginLeft: -0.5, backgroundColor: '#F8ECD08A' },
  horizontalCore: { position: 'absolute', right: 0, left: 0, top: '50%', height: 1, marginTop: -0.5, backgroundColor: '#F8ECD08A' },
  junctionHalo: { position: 'absolute', width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6FD2C02B', shadowColor: '#806CA8', shadowOpacity: 0.42, shadowRadius: 7 },
  junctionGem: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#F3E4CA', shadowColor: '#F3E4CA', shadowOpacity: 0.72, shadowRadius: 4 },
});
