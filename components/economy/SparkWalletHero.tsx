import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  type CommerceTheme,
  RevenueCatVerifiedBadge,
  SparkOrb,
  useCommerceTheme,
} from '@/components/economy/CommerceVisuals';
import type { SparkWalletSnapshot } from '@/lib/economy/types';

type Props = {
  wallet: SparkWalletSnapshot;
};

export function SparkWalletHero({ wallet }: Props) {
  const theme = useCommerceTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const balance = wallet.balance === null ? '—' : wallet.balance.toLocaleString();
  const loading = wallet.status === 'loading' && wallet.balance === null;
  const status = wallet.status === 'offline'
    ? 'Offline · showing your last verified balance'
    : wallet.status === 'error'
      ? 'Balance temporarily unavailable'
      : wallet.status === 'loading'
        ? 'Confirming your balance'
        : 'Ready for whatever happens next';

  return (
    <View
      accessibilityLabel={wallet.balance === null ? 'Sparks balance unavailable' : `${balance} Sparks balance`}
      style={styles.shell}
    >
      <LinearGradient
        colors={theme.mode === 'dark'
          ? ['rgba(7,118,124,0.38)', 'rgba(11,34,40,0.88)', 'rgba(75,36,91,0.34)']
          : ['rgba(174,226,217,0.78)', 'rgba(255,254,250,0.99)', 'rgba(220,196,234,0.48)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowA} />
      <View style={styles.glowB} />
      <View style={styles.orbWrap}>
        <SparkOrb showCore={false} />
        <View style={styles.balanceOverlay}>
          <Text style={styles.balanceLabel}>YOUR BALANCE</Text>
          {loading ? (
            <ActivityIndicator color={theme.cyan} size="large" style={styles.loader} />
          ) : (
            <Text adjustsFontSizeToFit minimumFontScale={0.66} numberOfLines={1} style={styles.balance}>
              {balance}
            </Text>
          )}
          <Text style={styles.unit}>Sparks</Text>
        </View>
      </View>
      <RevenueCatVerifiedBadge stale={wallet.isStale || wallet.status === 'offline'} />
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

function createStyles(theme: CommerceTheme) {
  return StyleSheet.create({
  shell: {
    minHeight: 352,
    overflow: 'hidden',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: theme.lineBright,
    paddingHorizontal: 18,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.panel,
    shadowColor: theme.shadow,
    shadowOpacity: theme.mode === 'dark' ? 0.16 : 0.13,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  glowA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 190,
    top: -120,
    right: -70,
    backgroundColor: theme.mode === 'dark' ? 'rgba(22,221,214,0.10)' : 'rgba(20,126,121,0.08)',
  },
  glowB: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 180,
    bottom: -120,
    left: -60,
    backgroundColor: theme.mode === 'dark' ? 'rgba(194,104,255,0.10)' : 'rgba(126,70,155,0.07)',
  },
  orbWrap: { width: 194, height: 194, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  balanceOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  balanceLabel: { color: theme.textMuted, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 1.35 },
  balance: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 52, lineHeight: 58, marginTop: 1 },
  loader: { minHeight: 58 },
  unit: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 16, marginTop: -3 },
  status: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, marginTop: 10, textAlign: 'center' },
  });
}
