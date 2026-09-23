import { LinearGradient } from 'expo-linear-gradient';
import { memo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ChatWallpaper } from '@/constants/theme';

export type ChatBackgroundTone = 'light' | 'dark';
export type ChatBackgroundIntensity = 'subtle' | 'balanced' | 'rich';

const CHAT_BACKGROUND_SOURCES = {
  dark: require('@/assets/images/chat-background/betweener-chat-dark.webp'),
  light: require('@/assets/images/chat-background/betweener-chat-light.webp'),
} as const;

export const getChatBackgroundTreatment = (tone: ChatBackgroundTone) => ({
  ...ChatWallpaper[tone],
  source: CHAT_BACKGROUND_SOURCES[tone],
  geometryId: ChatWallpaper.geometryId,
});

type ChatBackgroundProps = {
  tone: ChatBackgroundTone;
  intensity?: ChatBackgroundIntensity;
};

/**
 * Static, viewport-anchored decoration for the private conversation canvas.
 * It owns no message state and is intentionally non-interactive.
 */
const ChatBackgroundComponent = ({
  tone,
  intensity = 'balanced',
}: ChatBackgroundProps) => {
  const treatment = getChatBackgroundTreatment(tone);
  const [failedTone, setFailedTone] = useState<ChatBackgroundTone | null>(null);
  const artworkVisible = failedTone !== tone;
  const artworkOpacity = Math.min(
    1,
    treatment.symbolOpacity * ChatWallpaper.intensityMultipliers[intensity],
  );

  return (
    <View
      testID="chat-background"
      pointerEvents="none"
      accessible={false}
      style={[styles.root, { backgroundColor: treatment.foundation }]}
    >
      {artworkVisible ? (
        <Image
          key={tone}
          testID={`chat-background-artwork-${tone}`}
          accessible={false}
          source={treatment.source}
          resizeMode="cover"
          fadeDuration={0}
          accessibilityIgnoresInvertColors
          onError={() => setFailedTone(tone)}
          style={[styles.artwork, { opacity: artworkOpacity }]}
        />
      ) : null}
      <LinearGradient
        testID={`chat-background-atmosphere-${tone}`}
        pointerEvents="none"
        colors={treatment.atmosphere}
        locations={[0, 0.52, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={[styles.atmosphere, { opacity: treatment.atmosphereOpacity }]}
      />
    </View>
  );
};

export const ChatBackground = memo(ChatBackgroundComponent);
ChatBackground.displayName = 'ChatBackground';

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  artwork: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  atmosphere: {
    ...StyleSheet.absoluteFill,
  },
});
