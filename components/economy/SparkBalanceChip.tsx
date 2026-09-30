import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SparkWalletSnapshot } from '@/lib/economy/types';

type Props = {
  wallet: SparkWalletSnapshot;
  compact?: boolean;
};

export function SparkBalanceChip({ wallet, compact = false }: Props) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const loading = wallet.status === 'loading' && wallet.balance === null;
  const label = wallet.balance === null
    ? 'Sparks balance unavailable'
    : `${wallet.balance.toLocaleString()} Sparks balance${wallet.isStale ? ', may be outdated' : ''}`;

  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.container,
        compact && styles.compact,
        { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
      ]}
    >
      <MaterialCommunityIcons name="heart-flash" size={compact ? 15 : 18} color={theme.accent} />
      {loading ? (
        <ActivityIndicator size="small" color={theme.tint} />
      ) : (
        <Text style={[styles.value, compact && styles.valueCompact, { color: theme.text }]}>
          {wallet.balance === null ? '—' : wallet.balance.toLocaleString()}
        </Text>
      )}
      {wallet.isStale ? <View style={[styles.staleDot, { backgroundColor: theme.accent }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 40,
    minWidth: 76,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  compact: {
    minHeight: 34,
    minWidth: 64,
    paddingHorizontal: 10,
  },
  value: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  valueCompact: {
    fontSize: 13,
  },
  staleDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
});
