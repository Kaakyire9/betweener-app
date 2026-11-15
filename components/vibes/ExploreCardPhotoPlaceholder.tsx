import { StyleSheet, Text, View } from 'react-native';

import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import type { getProfilePlaceholderPalette } from '@/lib/profile-placeholders';

type Props = {
  initials: string;
  palette: ReturnType<typeof getProfilePlaceholderPalette>;
  cardHeight: number;
  infoHeight: number;
};

export default function ExploreCardPhotoPlaceholder({ initials, palette, cardHeight, infoHeight }: Props) {
  return (
    <LinearGradientSafe
      colors={[palette.start, palette.end]}
      start={[0, 0]}
      end={[1, 1]}
      style={styles.surface}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.portrait, { height: Math.max(0, cardHeight - infoHeight) }]}>
        <View style={styles.orb} />
        <Text allowFontScaling={false} style={[styles.initials, { color: palette.text }]}>{initials}</Text>
      </View>
    </LinearGradientSafe>
  );
}

const styles = StyleSheet.create({
  surface: { width: '100%', height: '100%' },
  // Keep decorative initials above the profile information, including cards
  // with long names or several context chips. The actual name remains below.
  portrait: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  orb: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  initials: { fontSize: 54, lineHeight: 70, fontFamily: 'PlayfairDisplay_700Bold', letterSpacing: 1.5 },
});
