import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type CommerceTheme, useCommerceTheme } from '@/components/economy/CommerceVisuals';
import type { ResolvedSparkPackage } from '@/lib/economy/store/spark-store-service';

type Props = {
  pack: ResolvedSparkPackage;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
};

export function SparkPackCard({ pack, disabled = false, busy = false, onPress }: Props) {
  const theme = useCommerceTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const featured = pack.packageId === 'sparks_2600';
  const popular = pack.packageId === 'sparks_550';

  return (
    <View style={[styles.card, featured && styles.cardFeatured]}>
      <LinearGradient
        colors={theme.mode === 'dark'
          ? featured
            ? ['rgba(188,122,16,0.38)', 'rgba(61,42,12,0.20)', 'rgba(10,29,31,0.92)']
            : ['rgba(15,51,54,0.90)', 'rgba(37,25,53,0.46)']
          : featured
            ? ['rgba(235,184,66,0.43)', 'rgba(255,254,250,0.99)']
            : ['rgba(255,254,250,0.99)', 'rgba(218,194,231,0.34)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {popular || featured ? (
        <View style={[styles.badge, featured && styles.badgeFeatured]}>
          <Text style={[styles.badgeText, featured && styles.badgeTextFeatured]}>
            {featured ? 'BEST VALUE' : 'POPULAR'}
          </Text>
        </View>
      ) : null}
      <View style={styles.copy}>
        <View style={styles.amountRow}>
          <View style={[styles.iconShell, featured && styles.iconShellFeatured]}>
            <MaterialCommunityIcons name="heart-flash" size={18} color={featured ? theme.gold : theme.violet} />
          </View>
          <Text style={styles.amount}>{pack.amount.toLocaleString()}</Text>
        </View>
        <Text style={styles.sparkLabel}>Sparks</Text>
        <Text style={[styles.label, featured && styles.labelFeatured]}>{pack.label}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Buy ${pack.amount.toLocaleString()} Sparks for ${pack.localizedPrice}`}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          disabled && styles.buttonDisabled,
          featured && !disabled && styles.buttonFeatured,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text style={[styles.buttonText, featured && !disabled && styles.buttonTextFeatured]}>
          {busy ? 'Processing…' : pack.localizedPrice}
        </Text>
        {!busy ? (
          <MaterialCommunityIcons name="chevron-right" size={18} color={featured && !disabled ? '#2C1E05' : theme.text} />
        ) : null}
      </Pressable>
    </View>
  );
}

function createStyles(theme: CommerceTheme) {
  return StyleSheet.create({
  card: {
    minHeight: 190,
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.line,
    padding: 15,
    justifyContent: 'space-between',
    shadowColor: theme.shadow,
    shadowOpacity: theme.mode === 'light' ? 0.12 : 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: theme.mode === 'light' ? 3 : 0,
  },
  cardFeatured: {
    borderColor: theme.gold,
    shadowColor: theme.gold,
    shadowOpacity: theme.mode === 'dark' ? 0.24 : 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
  copy: { flex: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconShell: { width: 34, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(196,124,255,0.14)' },
  iconShellFeatured: { backgroundColor: 'rgba(255,200,87,0.15)' },
  amount: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 24 },
  sparkLabel: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 12, marginTop: 9 },
  label: { color: theme.cyan, fontFamily: 'Manrope_600SemiBold', fontSize: 11, marginTop: 3 },
  labelFeatured: { color: theme.gold },
  badge: { position: 'absolute', top: 0, right: 0, paddingHorizontal: 9, paddingVertical: 5, borderBottomLeftRadius: 12, backgroundColor: theme.violet },
  badgeFeatured: { backgroundColor: theme.gold },
  badgeText: { color: '#180D21', fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 0.4 },
  badgeTextFeatured: { color: '#2C1E05' },
  button: {
    minHeight: 43,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.lineBright,
    backgroundColor: theme.surfaceStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  buttonFeatured: { backgroundColor: theme.gold, borderColor: theme.gold },
  buttonDisabled: { opacity: 0.44 },
  buttonText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 15 },
  buttonTextFeatured: { color: '#2C1E05' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  });
}
