import { Image as ExpoImage, type ImageSource } from 'expo-image';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { FirstPartyExpressionAsset } from '@/lib/chat/expressions/between-us-pack';

const playedInstances = new Set<string>();
const MAX_PLAYED_INSTANCES = 512;

const rememberPlayedInstance = (identity: string) => {
  playedInstances.add(identity);
  if (playedInstances.size <= MAX_PLAYED_INSTANCES) return;
  const oldest = playedInstances.values().next().value;
  if (typeof oldest === 'string') playedInstances.delete(oldest);
};

type Props = {
  asset: FirstPartyExpressionAsset;
  instanceId: string;
  animatedSource?: ImageSource | null;
  staticSource?: ImageSource | null;
  maxWidth: number;
};

export function FirstPartyExpressionAssetView({
  asset,
  instanceId,
  animatedSource,
  staticSource,
  maxWidth,
}: Props) {
  const reduceMotion = useReduceMotion();
  const reveal = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const identity = `${instanceId}:${asset.id}:v${asset.assetVersion}`;
  const source = reduceMotion ? staticSource : animatedSource ?? staticSource;
  const width = Math.min(maxWidth, asset.width);
  const height = Math.round(width * (asset.height / asset.width));

  const flourish = useMemo(() => {
    switch (asset.motion) {
      case 'heartbeat_once':
      case 'hug_once':
        return Animated.sequence([
          Animated.timing(scale, { toValue: 1.06, duration: 150, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 190, useNativeDriver: true }),
        ]);
      case 'intertwine_once':
      case 'settle_once':
        return Animated.sequence([
          Animated.timing(rotate, { toValue: 1, duration: 210, useNativeDriver: true }),
          Animated.timing(rotate, { toValue: 0, duration: 230, useNativeDriver: true }),
        ]);
      case 'orbit_once':
      case 'light_travel_once':
        return Animated.sequence([
          Animated.timing(translateX, { toValue: 5, duration: 210, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: 0, duration: 240, useNativeDriver: true }),
        ]);
      case 'spark_once':
      case 'twinkle_once':
        return Animated.sequence([
          Animated.timing(reveal, { toValue: 0.78, duration: 120, useNativeDriver: true }),
          Animated.timing(reveal, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]);
    }
  }, [asset.motion, reveal, rotate, scale, translateX]);

  useEffect(() => {
    if (reduceMotion || playedInstances.has(identity)) return;
    rememberPlayedInstance(identity);
    reveal.setValue(0);
    scale.setValue(0.94);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(reveal, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
      flourish,
    ]).start();
  }, [flourish, identity, reduceMotion, reveal, scale]);

  if (!source) return null;

  return (
    <Animated.View
      testID={`between-us-expression-${asset.id}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={asset.accessibilityLabel}
      style={{
        width,
        height,
        opacity: reveal,
        transform: [
          { scale },
          { translateX },
          {
            rotate: rotate.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '2deg'],
            }),
          },
        ],
      }}
    >
      <ExpoImage
        source={source}
        style={styles.image}
        contentFit="contain"
        autoplay={!reduceMotion}
        transition={0}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
});
