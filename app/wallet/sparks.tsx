import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SparkPackCard } from '@/components/economy/SparkPackCard';
import { SparkPurchaseResult } from '@/components/economy/SparkPurchaseResult';
import { SparkWalletHero } from '@/components/economy/SparkWalletHero';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePremiumState } from '@/hooks/use-premium-state';
import type { ResolvedSparkPackage } from '@/lib/economy/store/spark-store-service';
import { trackSparkEvent } from '@/lib/economy/spark-telemetry';
import { useSparkWallet } from '@/lib/economy/wallet/use-spark-wallet';

const BUSY_PURCHASE_STATES = new Set(['purchasing', 'verifying', 'refreshing_balance']);

export default function SparksWalletScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const membership = usePremiumState();
  const {
    wallet,
    flags,
    flagsLoading,
    online,
    store,
    purchase,
    refresh,
    loadStore,
    beginPurchaseConfirmation,
    cancelPurchaseConfirmation,
    purchasePack,
    resetPurchaseState,
  } = useSparkWallet();
  const purchaseBusy = BUSY_PURCHASE_STATES.has(purchase.status);

  useEffect(() => {
    if (!flagsLoading && flags.spark_wallet_enabled) {
      trackSparkEvent('spark_wallet_viewed', {
        membershipTier: membership.effectiveTier,
        walletStatus: wallet.status,
      });
      trackSparkEvent('membership_sparks_balance_viewed', {
        membershipTier: membership.effectiveTier,
        walletStatus: wallet.status,
      });
    }
  }, [flags.spark_wallet_enabled, flagsLoading, membership.effectiveTier, wallet.status]);

  useEffect(() => {
    if (flags.spark_store_enabled && online) {
      void loadStore().then((catalog) => {
        if (catalog) trackSparkEvent('spark_store_viewed', { membershipTier: membership.effectiveTier });
      });
    }
  }, [flags.spark_store_enabled, loadStore, membership.effectiveTier, online]);

  const confirmPurchase = (pack: ResolvedSparkPackage) => {
    if (!online || purchaseBusy) return;
    beginPurchaseConfirmation(pack);
    Alert.alert(
      `Get ${pack.amount.toLocaleString()} Sparks?`,
      `${pack.localizedPrice}\n\nPurchased Sparks do not expire. Apple's purchase sheet will confirm the final purchase.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: cancelPurchaseConfirmation },
        {
          text: 'Continue',
          onPress: () => void purchasePack(pack, membership.effectiveTier),
        },
      ],
    );
  };

  if (flagsLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.tint} />
        <Text style={styles.centerText}>Preparing your Sparks wallet…</Text>
      </View>
    );
  }

  if (!flags.spark_wallet_enabled) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <MaterialCommunityIcons name="heart-flash" size={34} color={theme.textMuted} />
        <Text style={styles.unavailableTitle}>Sparks wallet unavailable</Text>
        <Text style={styles.centerText}>This experience is not enabled for this build yet.</Text>
        <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={['rgba(0,128,128,0.18)', 'rgba(125,91,166,0.12)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={(
            <RefreshControl
              refreshing={wallet.status === 'loading'}
              onRefresh={() => void refresh({ reason: 'manual' })}
              tintColor={theme.tint}
            />
          )}
        >
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()} style={styles.backButton}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={theme.text} />
            </Pressable>
            <Text style={styles.headerTitle}>Sparks</Text>
            <View style={styles.headerSpacer} />
          </View>

          <SparkWalletHero wallet={wallet} />

          <SparkPurchaseResult
            purchase={purchase}
            onDismiss={resetPurchaseState}
            onRetryBalance={() => void refresh({ invalidate: true, reason: 'purchase_balance_retry' })}
          />

          <View style={styles.sectionCard}>
            <Text style={styles.eyebrow}>MEMBERSHIP</Text>
            <Text style={styles.sectionTitle}>
              {membership.effectiveTier === 'free'
                ? 'Free Member'
                : `${membership.effectiveTier === 'silver' ? 'Silver' : 'Gold'} Member`}
            </Text>
            {membership.effectiveTier !== 'free' && flags.member_spark_grants_enabled ? (
              <Text style={styles.sectionBody}>150 Member Sparks with each membership allowance cycle.</Text>
            ) : (
              <Text style={styles.sectionBody}>Your membership and Sparks stay connected to this account.</Text>
            )}
          </View>

          <View style={styles.educationCard}>
            <MaterialCommunityIcons name="shield-check-outline" size={21} color={theme.tint} />
            <View style={styles.educationCopy}>
              <Text style={styles.educationTitle}>Clear, reliable Sparks</Text>
              <Text style={styles.sectionBody}>Purchased Sparks do not expire.</Text>
              <Text style={styles.sectionBody}>Membership Sparks refresh with your membership allowance.</Text>
            </View>
          </View>

          {flags.spark_store_enabled ? (
            <View style={styles.storeSection}>
              <Text style={styles.eyebrow}>SPARK STORE</Text>
              <Text style={styles.sectionTitle}>Choose what feels right</Text>
              <Text style={styles.sectionBody}>Prices come directly from your App Store storefront.</Text>

              {!online ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>Connect to the internet to buy Sparks.</Text>
                </View>
              ) : null}
              {store.status === 'loading' ? <ActivityIndicator color={theme.tint} style={styles.loader} /> : null}
              {store.status === 'error' ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>Spark packs are temporarily unavailable.</Text>
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void loadStore()}>
                    <Text style={styles.retryText}>Try again</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.packList}>
                {store.catalog?.packages.map((pack) => (
                  <SparkPackCard
                    key={pack.packageId}
                    pack={pack}
                    disabled={!online || purchaseBusy}
                    busy={purchaseBusy && purchase.packageId === pack.packageId}
                    onPress={() => confirmPurchase(pack)}
                  />
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Spark Store coming soon</Text>
              <Text style={styles.sectionBody}>Your wallet balance remains available while purchases are disabled.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function createStyles(theme: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    content: { paddingHorizontal: 18, paddingBottom: 48, gap: 16 },
    header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerSpacer: { width: 44 },
    headerTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
    centerText: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', textAlign: 'center', lineHeight: 20 },
    unavailableTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24, textAlign: 'center' },
    secondaryButton: { minHeight: 48, marginTop: 8, paddingHorizontal: 22, borderRadius: 16, backgroundColor: theme.tint, justifyContent: 'center' },
    secondaryButtonText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold' },
    sectionCard: { padding: 20, borderRadius: 24, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
    eyebrow: { color: theme.tint, fontFamily: 'Manrope_700Bold', fontSize: 11, letterSpacing: 1.5 },
    sectionTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 23, marginTop: 5 },
    sectionBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 21, marginTop: 5 },
    educationCard: { flexDirection: 'row', gap: 12, padding: 18, borderRadius: 22, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
    educationCopy: { flex: 1 },
    educationTitle: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 15 },
    storeSection: { marginTop: 6, gap: 7 },
    packList: { gap: 12, marginTop: 10 },
    notice: { padding: 15, borderRadius: 16, marginTop: 8, backgroundColor: theme.backgroundSubtle, borderWidth: 1, borderColor: theme.outline },
    noticeText: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 13 },
    retryText: { color: theme.tint, fontFamily: 'Manrope_700Bold', marginTop: 8 },
    loader: { marginVertical: 22 },
  });
}
