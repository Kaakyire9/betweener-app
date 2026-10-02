import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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

const OFFLINE_SYMBOLS = [
  { icon: 'heart-outline', top: '7%', left: '12%', size: 42, rotate: '-8deg' },
  { icon: 'message-outline', top: '17%', right: '10%', size: 38, rotate: '5deg' },
  { icon: 'account-group-outline', top: '31%', left: '38%', size: 46, rotate: '0deg' },
  { icon: 'broadcast', top: '45%', right: '14%', size: 34, rotate: '8deg' },
  { icon: 'star-four-points-outline', top: '57%', left: '13%', size: 36, rotate: '-5deg' },
  { icon: 'circle-outline', top: '69%', right: '22%', size: 46, rotate: '0deg' },
  { icon: 'heart-multiple-outline', top: '82%', left: '30%', size: 44, rotate: '7deg' },
  { icon: 'message-processing-outline', top: '91%', right: '8%', size: 34, rotate: '-6deg' },
] as const;

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
      <View
        testID={`chat-background-offline-pattern-${tone}`}
        style={[
          styles.offlinePattern,
          { opacity: artworkVisible ? 0 : 0.5 },
        ]}
      >
        {OFFLINE_SYMBOLS.map((symbol, index) => (
          <View
            key={`${symbol.icon}-${index}`}
            style={[
              styles.offlineSymbol,
              {
                top: symbol.top,
                left: 'left' in symbol ? symbol.left : undefined,
                right: 'right' in symbol ? symbol.right : undefined,
                transform: [{ rotate: symbol.rotate }],
              },
            ]}
          >
            <MaterialCommunityIcons
              name={symbol.icon}
              size={symbol.size}
              color={tone === 'dark' ? '#69D6D0' : '#9B718C'}
            />
          </View>
        ))}
      </View>
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
  offlinePattern: {
    ...StyleSheet.absoluteFill,
  },
  offlineSymbol: {
    position: 'absolute',
  },
  atmosphere: {
    ...StyleSheet.absoluteFill,
  },
});
