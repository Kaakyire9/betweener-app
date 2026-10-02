import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import {
  CommerceBackdrop,
  type CommerceTheme,
  CommerceHeader,
  CommercePill,
  SparkOrb,
  useCommerceTheme,
} from '@/components/economy/CommerceVisuals';
import { SparkPackCard } from '@/components/economy/SparkPackCard';
import { SparkPurchaseResult } from '@/components/economy/SparkPurchaseResult';
import { SparkWalletHero } from '@/components/economy/SparkWalletHero';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { usePremiumState } from '@/hooks/use-premium-state';
import type { ResolvedSparkPackage } from '@/lib/economy/store/spark-store-service';
import { trackSparkEvent } from '@/lib/economy/spark-telemetry';
import { useSparkWallet } from '@/lib/economy/wallet/use-spark-wallet';
import { Motion } from '@/lib/motion';

const BUSY_PURCHASE_STATES = new Set(['purchasing', 'verifying', 'refreshing_balance']);

const STORE_BENEFITS = [
  { icon: 'gift-outline' as const, label: 'Send gifts' },
  { icon: 'star-four-points-outline' as const, label: 'Stand out' },
  { icon: 'heart-outline' as const, label: 'Show interest' },
  { icon: 'calendar-heart' as const, label: 'Unlock dates' },
];

export default function SparksWalletScreen() {
  const theme = useCommerceTheme();
  const reduceMotion = useReduceMotion();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const oneColumn = width < 350;
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
  const membershipLabel = membership.effectiveTier === 'free'
    ? 'Free Member'
    : `${membership.effectiveTier === 'silver' ? 'Silver' : 'Gold'} Member`;
  const membershipAccent = membership.effectiveTier === 'gold'
    ? theme.gold
    : membership.effectiveTier === 'silver'
      ? theme.silver
      : theme.cyan;

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
    const storeName = Platform.OS === 'android' ? 'Google Play' : 'Apple';
    Alert.alert(
      `Get ${pack.amount.toLocaleString()} Sparks?`,
      `${pack.localizedPrice}\n\nPurchased Sparks do not expire. ${storeName} will confirm the final purchase.`,
      [
        { text: 'Not now', style: 'cancel', onPress: cancelPurchaseConfirmation },
        { text: 'Continue', onPress: () => void purchasePack(pack, membership.effectiveTier) },
      ],
    );
  };

  if (flagsLoading) {
    return (
      <View style={styles.center}>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        <CommerceBackdrop variant="sparks" />
        <SparkOrb compact />
        <ActivityIndicator color={theme.cyan} />
        <Text style={styles.centerTitle}>Preparing your Sparks</Text>
        <Text style={styles.centerText}>Confirming your account and verified balance.</Text>
      </View>
    );
  }

  if (!flags.spark_wallet_enabled) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        <CommerceBackdrop variant="sparks" />
        <SparkOrb compact />
        <Text style={styles.centerTitle}>Sparks are resting</Text>
        <Text style={styles.centerText}>This experience is not enabled for this build yet.</Text>
        <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <CommerceBackdrop variant="sparks" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={(
            <RefreshControl
              refreshing={wallet.status === 'loading'}
              onRefresh={() => void refresh({ reason: 'manual' })}
              tintColor={theme.cyan}
            />
          )}
        >
          <CommerceHeader
            title="Your Sparks"
            onBack={() => router.back()}
            trailing={(
              <View style={[styles.tierMini, { borderColor: membershipAccent }]}>
                <Text style={[styles.tierMiniText, { color: membershipAccent }]}> {membership.effectiveTier.toUpperCase()} </Text>
              </View>
            )}
          />

          <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(Motion.duration.slow)}>
            <SparkWalletHero wallet={wallet} />
          </Animated.View>

          <SparkPurchaseResult
            purchase={purchase}
            onDismiss={resetPurchaseState}
            onRetryBalance={() => void refresh({ invalidate: true, reason: 'purchase_balance_retry' })}
          />

          <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(70).duration(Motion.duration.slow)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View premium plans"
              onPress={() => router.push('/premium-plans')}
              style={({ pressed }) => [styles.membershipCard, pressed && styles.cardPressed]}
            >
              <LinearGradient
                colors={theme.mode === 'dark'
                  ? membership.effectiveTier === 'gold'
                    ? ['rgba(177,119,14,0.48)', 'rgba(75,51,10,0.18)', 'rgba(9,29,30,0.90)']
                    : ['rgba(14,98,102,0.38)', 'rgba(9,29,30,0.90)']
                  : membership.effectiveTier === 'gold'
                    ? ['rgba(230,180,65,0.40)', 'rgba(255,254,250,0.99)']
                    : ['rgba(139,215,205,0.50)', 'rgba(255,254,250,0.99)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.membershipIcon, { borderColor: membershipAccent }]}>
                <MaterialCommunityIcons
                  name={membership.effectiveTier === 'gold' ? 'crown' : membership.effectiveTier === 'silver' ? 'diamond-stone' : 'sprout'}
                  size={26}
                  color={membershipAccent}
                />
              </View>
              <View style={styles.membershipCopy}>
                <Text style={styles.cardEyebrow}>YOUR MEMBERSHIP</Text>
                <Text style={styles.membershipTitle}>{membershipLabel}</Text>
                <Text style={styles.membershipBody}>
                  {membership.effectiveTier !== 'free' && flags.member_spark_grants_enabled
                    ? 'Your membership allowance and purchased Sparks stay protected separately.'
                    : 'Your membership and Sparks stay connected to this account.'}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textMuted} />
            </Pressable>
          </Animated.View>

          <View style={styles.promiseCard}>
            <View style={styles.promiseIcon}>
              <MaterialCommunityIcons name="infinity" size={28} color={theme.cyan} />
            </View>
            <View style={styles.promiseCopy}>
              <Text style={styles.promiseTitle}>Clear, reliable Sparks</Text>
              <Text style={styles.promiseBody}>Purchased Sparks do not expire.</Text>
              <Text style={styles.promiseBody}>Membership Sparks refresh with your allowance.</Text>
            </View>
          </View>

          {flags.spark_store_enabled ? (
            <View style={styles.storeSection}>
              <View style={styles.storeIntro}>
                <View style={styles.storeIntroCopy}>
                  <Text style={styles.eyebrow}>SPARK STORE</Text>
                  <Text style={styles.storeTitle}>Small sparks.{`\n`}Bigger moments.</Text>
                  <Text style={styles.storeBody}>Optional premium experiences, priced by your storefront.</Text>
                </View>
                <SparkOrb compact />
              </View>

              <View style={styles.benefitGrid}>
                {STORE_BENEFITS.map((benefit) => (
                  <View key={benefit.label} style={styles.benefitItem}>
                    <View style={styles.benefitIcon}>
                      <MaterialCommunityIcons name={benefit.icon} size={18} color={theme.cyan} />
                    </View>
                    <Text style={styles.benefitLabel}>{benefit.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.storeHeadingRow}>
                <View>
                  <Text style={styles.storeHeading}>Choose a Spark pack</Text>
                  <Text style={styles.storeCaption}>Purchased Sparks never expire.</Text>
                </View>
                <CommercePill icon="shield-check-outline" label="Verified" />
              </View>

              {!online ? (
                <View style={styles.notice}>
                  <MaterialCommunityIcons name="wifi-off" size={18} color={theme.gold} />
                  <Text style={styles.noticeText}>Connect to the internet to buy Sparks. Your verified balance remains visible.</Text>
                </View>
              ) : null}
              {store.status === 'loading' ? <ActivityIndicator color={theme.cyan} style={styles.loader} /> : null}
              {store.status === 'error' ? (
                <View style={styles.notice}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.gold} />
                  <View style={styles.noticeCopy}>
                    <Text style={styles.noticeText}>Spark packs are temporarily unavailable.</Text>
                    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void loadStore()}>
                      <Text style={styles.retryText}>Try again</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              <View style={styles.packGrid}>
                {store.catalog?.packages.map((pack) => (
                  <View key={pack.packageId} style={[styles.packCell, oneColumn && styles.packCellFull]}>
                    <SparkPackCard
                      pack={pack}
                      disabled={!online || purchaseBusy}
                      busy={purchaseBusy && purchase.packageId === pack.packageId}
                      onPress={() => confirmPurchase(pack)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.promiseCard}>
              <View style={styles.promiseIcon}>
                <MaterialCommunityIcons name="store-clock-outline" size={26} color={theme.cyan} />
              </View>
              <View style={styles.promiseCopy}>
                <Text style={styles.promiseTitle}>Spark Store coming soon</Text>
                <Text style={styles.promiseBody}>Your verified wallet remains available while purchases are disabled.</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function createStyles(theme: CommerceTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.canvas },
    safeArea: { flex: 1 },
    content: { paddingHorizontal: 18, paddingBottom: 54, gap: 16 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14, backgroundColor: theme.canvas },
    centerTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 26, textAlign: 'center' },
    centerText: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', textAlign: 'center', lineHeight: 20 },
    primaryButton: { minHeight: 48, marginTop: 8, paddingHorizontal: 24, borderRadius: 24, backgroundColor: theme.cyanDeep, justifyContent: 'center' },
    primaryButtonText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold' },
    tierMini: { minHeight: 30, minWidth: 64, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface },
    tierMiniText: { fontFamily: 'Archivo_700Bold', fontSize: 9, letterSpacing: 0.9 },
    membershipCard: { minHeight: 126, overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: theme.line, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 13, shadowColor: theme.shadow, shadowOpacity: theme.mode === 'light' ? 0.12 : 0.03, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: theme.mode === 'light' ? 3 : 0 },
    membershipIcon: { width: 54, height: 54, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.iconSurface },
    membershipCopy: { flex: 1 },
    cardEyebrow: { color: theme.textMuted, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 1.25 },
    membershipTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, marginTop: 3 },
    membershipBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 16, marginTop: 4 },
    promiseCard: { borderRadius: 22, borderWidth: 1, borderColor: theme.line, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: theme.surface },
    promiseIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.mode === 'dark' ? 'rgba(11,103,105,0.22)' : 'rgba(8,127,124,0.10)' },
    promiseCopy: { flex: 1 },
    promiseTitle: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 15 },
    promiseBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, marginTop: 2 },
    storeSection: { gap: 14, marginTop: 8 },
    storeIntro: { minHeight: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
    storeIntroCopy: { flex: 1, paddingRight: 8 },
    eyebrow: { color: theme.cyan, fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 1.7 },
    storeTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 32, lineHeight: 35, marginTop: 8 },
    storeBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, marginTop: 7 },
    benefitGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
    benefitItem: { flex: 1, alignItems: 'center', gap: 7 },
    benefitIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.line, backgroundColor: theme.surface },
    benefitLabel: { color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 9, textAlign: 'center' },
    storeHeadingRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    storeHeading: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 21 },
    storeCaption: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 10, marginTop: 3 },
    packGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    packCell: { width: '47.5%', flexGrow: 1 },
    packCellFull: { width: '100%' },
    cardPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
    notice: { padding: 14, borderRadius: 17, flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: theme.warningSurface, borderWidth: 1, borderColor: `${theme.gold}44` },
    noticeCopy: { flex: 1 },
    noticeText: { flex: 1, color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 17 },
    retryText: { color: theme.cyan, fontFamily: 'Manrope_700Bold', marginTop: 7 },
    loader: { marginVertical: 18 },
  });
}
