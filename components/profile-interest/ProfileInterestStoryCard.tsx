import OfflineImage from '@/components/media/OfflineImage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type StoryVisualTone = 'visits' | 'intro' | 'saves' | 'full' | 'repeat' | 'intent';

type StoryCardProps = {
  name: string;
  avatarUrl?: string | null;
  title: string;
  body: string;
  chips: string[];
  accentLabel: string;
  eyebrow: string;
  signalTone: StoryVisualTone;
  onPress: () => void;
  theme: {
    text: string;
    textMuted: string;
    outline: string;
    tint: string;
    secondary: string;
    accent: string;
    backgroundSubtle: string;
  };
  isDark: boolean;
};

export default function ProfileInterestStoryCard({
  name,
  avatarUrl,
  title,
  body,
  chips,
  accentLabel,
  eyebrow,
  signalTone,
  onPress,
  theme,
  isDark,
}: StoryCardProps) {
  const initial = name.trim().charAt(0).toUpperCase() || 'B';
  const toneConfig: Record<
    StoryVisualTone,
    {
      icon: keyof typeof MaterialCommunityIcons.glyphMap;
      glow: string;
      iconBg: string;
      chipBg: string;
      gradientDark: [string, string];
      gradientLight: [string, string];
    }
  > = {
    visits: {
      icon: 'eye-outline',
      glow: '#2EDDE2',
      iconBg: 'rgba(46, 221, 226, 0.18)',
      chipBg: 'rgba(46, 221, 226, 0.1)',
      gradientDark: ['rgba(10,52,58,0.92)', 'rgba(19,29,43,0.82)'],
      gradientLight: ['rgba(221,248,249,0.96)', 'rgba(236,242,255,0.92)'],
    },
    intro: {
      icon: 'play-circle-outline',
      glow: '#AE84FF',
      iconBg: 'rgba(174, 132, 255, 0.18)',
      chipBg: 'rgba(174, 132, 255, 0.1)',
      gradientDark: ['rgba(38,26,67,0.9)', 'rgba(16,29,52,0.84)'],
      gradientLight: ['rgba(239,232,252,0.96)', 'rgba(234,241,255,0.92)'],
    },
    saves: {
      icon: 'bookmark-outline',
      glow: '#E1BE56',
      iconBg: 'rgba(225, 190, 86, 0.18)',
      chipBg: 'rgba(225, 190, 86, 0.1)',
      gradientDark: ['rgba(61,47,17,0.88)', 'rgba(23,31,36,0.82)'],
      gradientLight: ['rgba(251,246,225,0.96)', 'rgba(244,247,238,0.92)'],
    },
    full: {
      icon: 'book-open-page-variant-outline',
      glow: '#3AD7E7',
      iconBg: 'rgba(58, 215, 231, 0.18)',
      chipBg: 'rgba(58, 215, 231, 0.1)',
      gradientDark: ['rgba(10,56,66,0.9)', 'rgba(18,27,44,0.84)'],
      gradientLight: ['rgba(224,248,251,0.96)', 'rgba(235,244,251,0.92)'],
    },
    repeat: {
      icon: 'repeat',
      glow: '#6DE4FF',
      iconBg: 'rgba(109, 228, 255, 0.18)',
      chipBg: 'rgba(109, 228, 255, 0.1)',
      gradientDark: ['rgba(10,45,52,0.9)', 'rgba(18,27,36,0.84)'],
      gradientLight: ['rgba(230,248,252,0.96)', 'rgba(238,244,250,0.92)'],
    },
    intent: {
      icon: 'target',
      glow: '#38D7A9',
      iconBg: 'rgba(56, 215, 169, 0.18)',
      chipBg: 'rgba(56, 215, 169, 0.1)',
      gradientDark: ['rgba(10,60,49,0.9)', 'rgba(14,29,38,0.84)'],
      gradientLight: ['rgba(225,249,241,0.96)', 'rgba(236,244,249,0.92)'],
    },
  };
  const tone = toneConfig[signalTone];

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
    >
      <LinearGradient
        colors={isDark ? tone.gradientDark : tone.gradientLight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={[styles.heroGlow, { backgroundColor: tone.glow }]} />
        <View style={[styles.heroOrb, { backgroundColor: tone.iconBg }]} />
        <View style={styles.heroTopRow}>
          <View style={[styles.avatarWrap, styles.avatarWrapLifted]}>
            {avatarUrl ? (
              <OfflineImage uri={avatarUrl} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
          </View>
          <View style={styles.heroCopy}>
            <View style={styles.metaRow}>
              <Text style={[styles.eyebrow, { color: theme.secondary }]}>{eyebrow}</Text>
              <View style={[styles.signalBadge, { backgroundColor: tone.iconBg, borderColor: `${tone.glow}35` }]}>
                <MaterialCommunityIcons name={tone.icon} size={13} color={tone.glow} />
                <Text style={[styles.signalBadgeText, { color: tone.glow }]}>{accentLabel}</Text>
              </View>
            </View>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{title}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
        </View>
        <Text style={[styles.body, { color: theme.textMuted }]}>{body}</Text>
      </LinearGradient>
      <View style={styles.chipRow}>
        {chips.map((chip) => (
          <View key={chip} style={[styles.chip, { borderColor: theme.outline, backgroundColor: tone.chipBg }]}>
            <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>{chip}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  hero: {
    padding: 18,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -34,
    right: -22,
    width: 118,
    height: 118,
    borderRadius: 59,
    opacity: 0.12,
  },
  heroOrb: {
    position: 'absolute',
    bottom: -28,
    left: -18,
    width: 96,
    height: 96,
    borderRadius: 48,
    opacity: 0.16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  avatarWrapLifted: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.42)',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C7778',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10,
    letterSpacing: 1.3,
  },
  signalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  signalBadgeText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  title: {
    marginTop: 4,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    lineHeight: 27,
  },
  body: {
    marginTop: 14,
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    lineHeight: 20,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  chipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
});
