import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import type { SparkWalletSnapshot } from '@/lib/economy/types';

type Props = {
  wallet: SparkWalletSnapshot;
};

export function SparkWalletHero({ wallet }: Props) {
  const balance = wallet.balance === null ? '—' : wallet.balance.toLocaleString();
  const status = wallet.status === 'offline'
    ? 'Offline · balance may be outdated'
    : wallet.isStale
      ? 'Last known balance · refreshing'
      : wallet.status === 'error'
        ? 'Balance temporarily unavailable'
        : wallet.status === 'loading'
          ? 'Refreshing your Sparks'
          : 'RevenueCat verified balance';

  return (
    <View
      accessibilityLabel={wallet.balance === null ? 'Sparks balance unavailable' : `${balance} Sparks balance`}
      style={styles.shell}
    >
      <LinearGradient
        colors={['rgba(24,174,168,0.34)', 'rgba(125,91,166,0.28)', 'rgba(232,184,92,0.14)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.iconShell}>
        <MaterialCommunityIcons name="heart-flash" size={30} color="#F8E6B8" />
      </View>
      <Text style={styles.eyebrow}>YOUR SPARKS</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.balance}>
        {balance}
      </Text>
      <Text style={styles.caption}>Optional premium experiences across Betweener.</Text>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    minHeight: 278,
    overflow: 'hidden',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#172026',
    shadowColor: '#051515',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  iconShell: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    marginBottom: 15,
  },
  eyebrow: {
    color: 'rgba(244,239,230,0.72)',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1.8,
    fontSize: 11,
  },
  balance: {
    color: '#FBF8F1',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 62,
    lineHeight: 72,
    marginTop: 2,
  },
  caption: {
    color: 'rgba(251,248,241,0.86)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
  },
  status: {
    color: 'rgba(248,230,184,0.84)',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    marginTop: 12,
  },
});
