import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

const portraitHalo = require('@/assets/images/circle-pulse/love-seat/portrait-halo.png');

type Props = {
  avatarUrl?: string | null;
  name: string;
  palette: CirclePulsePalette;
  onOpenProfile?: () => void;
};

/** Settled Love Seat portrait. The cinematic ceremony belongs to the arrival surface only. */
export default function CircleLoveSeatPortrait({ avatarUrl, name, palette, onOpenProfile }: Props) {
  return (
    <Pressable
      accessibilityRole={onOpenProfile ? 'button' : undefined}
      accessibilityLabel={onOpenProfile ? `Open ${name}'s profile` : `${name}'s Love Seat portrait`}
      disabled={!onOpenProfile}
      onPress={onOpenProfile}
      style={[styles.stage, { borderColor: palette.purpleBorder }]}
    >
      <LinearGradient
        colors={palette.dark
          ? ['rgba(139,92,255,0.18)', 'rgba(19,168,168,0.06)', 'rgba(2,17,20,0)']
          : ['rgba(139,92,255,0.1)', 'rgba(255,255,255,0.72)', 'rgba(19,168,168,0.04)']}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.frame, { borderColor: palette.purpleStrong, backgroundColor: palette.surfaceStrong }]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.portrait} contentFit="cover" transition={160} />
        ) : (
          <MaterialCommunityIcons name="account-heart-outline" size={48} color={palette.purple} />
        )}
      </View>
      <Image source={portraitHalo} style={styles.halo} contentFit="contain" pointerEvents="none" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: 176,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 102,
    height: 102,
    borderRadius: 51,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  portrait: { width: 96, height: 96, borderRadius: 48 },
  halo: { position: 'absolute', width: 154, height: 150 },
});
