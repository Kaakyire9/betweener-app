import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CommerceBackdrop,
  type CommerceTheme,
  CommerceHeader,
  CommercePill,
  SparkOrb,
  useCommerceTheme,
} from '@/components/economy/CommerceVisuals';
import { MembershipDurationSelector } from '@/components/economy/MembershipDurationSelector';
import {
  MembershipTierCard,
  type MembershipTierVisual,
} from '@/components/economy/MembershipTierCard';
import { PremiumHeroArt } from '@/components/economy/PremiumHeroArt';
import { SparkBalanceChip } from '@/components/economy/SparkBalanceChip';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { usePremiumState } from '@/hooks/use-premium-state';
import { useAuth } from '@/lib/auth-context';
import { useSparkWallet } from '@/lib/economy/wallet/use-spark-wallet';
import { Motion } from '@/lib/motion';
import {
  type PremiumPlan,
  type PremiumPlanInterval,
  findPackageForPlan,
  getMembershipPurchaseErrorMessage,
  getPackagesForPlan,
  getPlanIntervalFromPackage,
  isPurchaseCancelled,
  isRevenueCatConfiguredForPlatform,
  purchasePlanPackage,
  restoreRevenueCatPurchases,
} from '@/lib/subscriptions';
import { openExternalUrl, openSupportEmail, TRUST_LINKS } from '@/lib/trust-links';

type PaidPlan = Exclude<PremiumPlan, 'FREE'>;

const PLAN_DEFAULT_INTERVAL: Record<PaidPlan, PremiumPlanInterval> = {
  SILVER: 'quarterly',
  GOLD: 'annual',
};

function buildPlanVisuals(theme: CommerceTheme): Record<PremiumPlan, MembershipTierVisual> {
  return {
  FREE: {
    plan: 'FREE',
    label: 'Free',
    tagline: 'Chat, match, and explore.',
    accent: theme.cyan,
    icon: 'sprout',
    benefits: ['Basic chat', 'Standard visibility'],
  },
  SILVER: {
    plan: 'SILVER',
    label: 'Silver',
    tagline: 'Get seen faster. Keep momentum moving.',
    accent: theme.silver,
    icon: 'diamond-stone',
    benefits: ['Profile boosts', 'Advanced filters', 'Send gifts'],
  },
  GOLD: {
    plan: 'GOLD',
    label: 'Gold',
    tagline: 'The strongest presence and premium polish.',
    accent: theme.gold,
    icon: 'crown',
    benefits: ['Highest visibility', 'Concierge help', 'The Ring'],
  },
  };
}

const PLAN_FEATURES: Record<PaidPlan, string[]> = {
  SILVER: [
    '30-minute profile boosts',
    'Advanced Vibes filters for trust, chemistry, and distance',
    'Send standard gifts before the conversation cools off',
    'Initiate date plans when the energy is right',
  ],
  GOLD: [
    'Everything in Silver, plus the highest premium placement',
    'Signature gifts, including the Ring',
    'Betweener concierge support for accepted date plans',
    'The strongest trust framing across member surfaces',
  ],
};

const FEATURE_MATRIX = [
  { label: 'Matching and chat', free: 'Included', silver: 'Included', gold: 'Included' },
  { label: 'Discovery visibility', free: 'Standard', silver: 'Elevated', gold: 'Highest' },
  { label: 'Advanced filters', free: '—', silver: 'Included', gold: 'Included' },
  { label: 'Profile boosts', free: '—', silver: 'Included', gold: 'Included' },
  { label: 'Signature Ring', free: '—', silver: '—', gold: 'Included' },
  { label: 'Concierge help', free: '—', silver: '—', gold: 'Included' },
];

export default function PremiumPlansScreen() {
  const { profile, user } = useAuth();
  const reduceMotion = useReduceMotion();
  const theme = useCommerceTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const planVisuals = useMemo(() => buildPlanVisuals(theme), [theme]);
  const membership = usePremiumState();
  const {
    wallet: sparkWallet,
    flags: economyFlags,
    flagsLoading: economyFlagsLoading,
    refresh: refreshSparkWallet,
  } = useSparkWallet();
  const [selectedPlan, setSelectedPlan] = useState<PremiumPlan>('SILVER');
  const [selectedIntervals, setSelectedIntervals] = useState<Record<PaidPlan, PremiumPlanInterval>>(PLAN_DEFAULT_INTERVAL);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const showDeveloperBillingNotice = __DEV__
    && !membership.billingReady
    && !membership.loading
    && !isRevenueCatConfiguredForPlatform();
  const accountLabel = Platform.OS === 'android' ? 'Google Play account' : 'Apple ID account';
  const manageLocationLabel = Platform.OS === 'android' ? 'Google Play subscription settings' : 'App Store account settings';

  const packageCatalog = useMemo(() => ({
    SILVER: buildPackageMap(membership.offerings, 'SILVER'),
    GOLD: buildPackageMap(membership.offerings, 'GOLD'),
  }), [membership.offerings]);

  useEffect(() => {
    if (membership.currentPlan !== 'FREE') setSelectedPlan(membership.currentPlan);
  }, [membership.currentPlan]);

  useEffect(() => {
    setSelectedIntervals((current) => {
      const next = { ...current };
      let changed = false;
      (['SILVER', 'GOLD'] as const).forEach((plan) => {
        if (packageCatalog[plan][current[plan]]) return;
        const replacement = ([PLAN_DEFAULT_INTERVAL[plan], 'monthly', 'quarterly', 'annual'] as PremiumPlanInterval[])
          .find((interval) => packageCatalog[plan][interval]);
        if (replacement && replacement !== current[plan]) {
          next[plan] = replacement;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [packageCatalog]);

  const handlePurchase = async (plan: PaidPlan, interval: PremiumPlanInterval) => {
    const targetPackage = packageCatalog[plan][interval];
    if (!targetPackage) {
      Alert.alert('Plan unavailable', `${planVisuals[plan].label} ${interval} is not available right now.`);
      return;
    }
    try {
      setActionKey(`${plan}:${interval}`);
      if (!user?.id) throw new Error('An authenticated account is required.');
      const result = await purchasePlanPackage(targetPackage, user.id);
      if (result.currentPlan !== 'FREE') {
        await Promise.allSettled([
          membership.refresh(),
          refreshSparkWallet({ invalidate: true, reason: 'membership_purchase' }),
        ]);
      }
      Alert.alert('Premium active', `${planVisuals[plan].label} is now active on this account.`);
    } catch (error) {
      if (!isPurchaseCancelled(error)) Alert.alert('Purchase failed', getMembershipPurchaseErrorMessage(error));
    } finally {
      setActionKey(null);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      if (!user?.id) throw new Error('An authenticated account is required.');
      await restoreRevenueCatPurchases(user.id);
      await Promise.allSettled([
        membership.refresh(),
        refreshSparkWallet({ invalidate: true, reason: 'restore_purchases' }),
      ]);
      Alert.alert('Purchases restored', 'Your premium membership has been refreshed.');
    } catch (error) {
      Alert.alert('Restore failed', getMembershipPurchaseErrorMessage(error));
    } finally {
      setRestoring(false);
    }
  };

  const handleManage = async () => {
    if (membership.managementURL) {
      await openExternalUrl(membership.managementURL);
      return;
    }
    await openSupportEmail(
      'Betweener premium support',
      'Hello Betweener team,%0D%0A%0D%0AI need help managing my premium plan.%0D%0A',
    );
  };

  const selectedPaidPlan = selectedPlan === 'FREE' ? null : selectedPlan;
  const selectedVisual = planVisuals[selectedPlan];
  const selectedInterval = selectedPaidPlan ? selectedIntervals[selectedPaidPlan] : null;
  const selectedPackage = selectedPaidPlan && selectedInterval
    ? packageCatalog[selectedPaidPlan][selectedInterval]
    : null;
  const monthlyPackage = selectedPaidPlan ? packageCatalog[selectedPaidPlan].monthly : null;
  const monthlyEquivalent = selectedPackage ? formatMonthlyEquivalent(selectedPackage) : null;
  const savingsLabel = selectedPackage && monthlyPackage ? getSavingsLabel(selectedPackage, monthlyPackage) : null;
  const planEndsAt = formatMembershipDate(membership.currentPlanEndsAt);
  const activeSelected = membership.currentPlan === selectedPlan;
  const purchaseBusy = Boolean(actionKey);
  const currentPlanAccent = membership.currentPlan === 'GOLD'
    ? theme.gold
    : membership.currentPlan === 'SILVER'
      ? theme.silver
      : theme.cyan;

  return (
    <View style={styles.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <CommerceBackdrop variant={selectedPlan === 'GOLD' ? 'gold' : 'mixed'} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <CommerceHeader
            title="Premium Plans"
            onBack={() => router.back()}
            trailing={(
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeLabel}>CURRENT</Text>
                <Text style={[styles.currentBadgeValue, { color: currentPlanAccent }]}>
                  {membership.loading ? '···' : membership.currentPlan}
                </Text>
              </View>
            )}
          />

          <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(Motion.duration.slow)} style={styles.hero}>
            <LinearGradient
              colors={theme.mode === 'dark'
                ? ['rgba(5,95,99,0.42)', 'rgba(10,36,39,0.88)', 'rgba(82,48,26,0.30)']
                : ['rgba(178,229,220,0.94)', 'rgba(255,254,250,0.97)', 'rgba(237,203,132,0.58)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroArt}>
              <PremiumHeroArt viewerGender={profile?.gender} />
            </View>
            <LinearGradient
              pointerEvents="none"
              colors={theme.mode === 'dark'
                ? ['rgba(5,41,42,0.94)', 'rgba(5,41,42,0.50)', 'rgba(5,41,42,0.04)']
                : ['rgba(225,242,235,0.98)', 'rgba(239,246,239,0.68)', 'rgba(239,246,239,0.03)']}
              locations={[0, 0.54, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.heroSideScrim}
            />
            <LinearGradient
              pointerEvents="none"
              colors={theme.mode === 'dark'
                ? ['rgba(7,29,31,0)', 'rgba(7,29,31,0.88)']
                : ['rgba(255,254,250,0)', 'rgba(255,254,250,0.96)']}
              locations={[0, 1]}
              style={styles.heroBottomScrim}
            />
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>MORE THAN A MATCH</Text>
              <Text style={styles.heroTitle}>Choose your{`\n`}pace.</Text>
              <Text style={styles.heroBody}>Same great conversations. More of what happens next.</Text>
            </View>
            <View style={styles.heroBenefits}>
              <CommercePill compact icon="rocket-launch-outline" label="Get seen" />
              <CommercePill compact icon="shield-check-outline" label="Build trust" />
              <CommercePill compact icon="calendar-heart" label="Make plans" />
            </View>
            <View style={styles.heroStatus}>
              <View style={styles.heroStatusCopy}>
                <Text style={styles.heroStatusLabel}>MEMBERSHIP STATUS</Text>
                <Text style={styles.heroStatusText}>
                  {planEndsAt
                    ? `${membership.currentPlan} active until ${planEndsAt}`
                    : membership.currentPlan === 'FREE'
                      ? 'Free, with room to move faster'
                      : `${membership.currentPlan} active on this account`}
                </Text>
              </View>
              {membership.hasActiveBoost ? <CommercePill icon="rocket-launch" label="Boost live" tone="gold" /> : null}
            </View>
          </Animated.View>

          {membership.error ? (
            <View style={styles.notice}>
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color={theme.gold} />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>Plans are temporarily unavailable</Text>
                <Text style={styles.noticeBody}>Refresh this screen or try again in a moment.</Text>
              </View>
            </View>
          ) : null}

          {showDeveloperBillingNotice ? (
            <View style={styles.notice}>
              <MaterialCommunityIcons name="code-tags" size={20} color={theme.cyan} />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>Developer billing notice</Text>
                <Text style={styles.noticeBody}>RevenueCat public SDK keys are required for live device pricing.</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.eyebrow}>FIND YOUR MOMENTUM</Text>
              <Text style={styles.sectionTitle}>A plan for every pace</Text>
            </View>
            <Text style={styles.sectionHint}>Tap to explore</Text>
          </View>

          <View style={styles.tierStack}>
            {(Object.keys(planVisuals) as PremiumPlan[]).map((plan, index) => (
              <Animated.View key={plan} entering={reduceMotion ? undefined : FadeInDown.delay((index + 1) * 55).duration(Motion.duration.slow)}>
                <MembershipTierCard
                  tier={planVisuals[plan]}
                  selected={selectedPlan === plan}
                  current={membership.currentPlan === plan}
                  onPress={() => setSelectedPlan(plan)}
                />
              </Animated.View>
            ))}
          </View>

          {selectedPaidPlan && selectedInterval ? (
            <Animated.View key={selectedPaidPlan} entering={reduceMotion ? undefined : FadeInDown.duration(Motion.duration.base)} style={styles.purchasePanel}>
              <LinearGradient
                colors={theme.mode === 'dark'
                  ? selectedPaidPlan === 'GOLD'
                    ? ['rgba(171,112,12,0.36)', 'rgba(41,31,12,0.18)', 'rgba(8,28,30,0.92)']
                    : ['rgba(211,232,235,0.13)', 'rgba(9,61,64,0.30)', 'rgba(8,28,30,0.92)']
                  : selectedPaidPlan === 'GOLD'
                    ? ['rgba(230,180,65,0.38)', 'rgba(255,254,250,0.99)']
                    : ['rgba(169,211,207,0.62)', 'rgba(255,254,250,0.99)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.purchaseHeader}>
                <View>
                  <Text style={[styles.purchaseEyebrow, { color: selectedVisual.accent }]}>
                    {selectedPaidPlan === 'GOLD' ? 'SIGNATURE TIER' : 'ESSENTIAL TIER'}
                  </Text>
                  <Text style={styles.purchaseTitle}>{selectedVisual.label}</Text>
                </View>
                <View style={[styles.planState, { borderColor: selectedVisual.accent }]}>
                  <Text style={[styles.planStateText, { color: selectedVisual.accent }]}>
                    {activeSelected ? 'ACTIVE' : selectedPackage ? 'AVAILABLE' : 'PREPARING'}
                  </Text>
                </View>
              </View>

              <MembershipDurationSelector
                packages={packageCatalog[selectedPaidPlan]}
                selected={selectedInterval}
                accent={selectedVisual.accent}
                billingReady={membership.billingReady}
                onSelect={(interval) => setSelectedIntervals((current) => ({ ...current, [selectedPaidPlan]: interval }))}
              />

              <View style={styles.pricePanel}>
                <View style={styles.priceCopy}>
                  <Text style={styles.priceLabel}>{selectedInterval.toUpperCase()} BILLING</Text>
                  <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.priceValue}>
                    {selectedPackage?.product.priceString ?? (membership.billingReady ? 'Unavailable' : 'Loading price')}
                  </Text>
                  <Text style={styles.priceMeta}>Localized price from your App Store storefront.</Text>
                </View>
                <View style={styles.priceAside}>
                  {monthlyEquivalent ? <Text style={styles.monthlyValue}>{monthlyEquivalent}</Text> : null}
                  {savingsLabel ? <Text style={[styles.savings, { color: selectedVisual.accent }]}>{savingsLabel}</Text> : null}
                </View>
              </View>

              <Text style={styles.includedLabel}>INCLUDED IN {selectedVisual.label.toUpperCase()}</Text>
              <View style={styles.featureList}>
                {PLAN_FEATURES[selectedPaidPlan].map((feature) => (
                  <View key={feature} style={styles.featureRow}>
                    <View style={[styles.check, { backgroundColor: `${selectedVisual.accent}1F` }]}>
                      <MaterialCommunityIcons name="check" size={14} color={selectedVisual.accent} />
                    </View>
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              {activeSelected ? (
                <Pressable style={styles.manageButton} onPress={() => void handleManage()}>
                  <Text style={styles.manageButtonText}>Manage membership</Text>
                  <MaterialCommunityIcons name="open-in-new" size={17} color={theme.text} />
                </Pressable>
              ) : (
                <Pressable
                  disabled={!membership.billingReady || !membership.billingSupported || !selectedPackage || purchaseBusy}
                  onPress={() => void handlePurchase(selectedPaidPlan, selectedInterval)}
                  style={({ pressed }) => [
                    styles.purchaseButton,
                    { backgroundColor: selectedPaidPlan === 'GOLD' ? theme.gold : theme.cyanDeep },
                    (!membership.billingReady || !membership.billingSupported || !selectedPackage || purchaseBusy) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={selectedPaidPlan === 'GOLD' ? 'crown' : 'diamond-stone'}
                    size={19}
                    color={selectedPaidPlan === 'GOLD' ? '#2D1D02' : '#FFFFFF'}
                  />
                  <Text style={[styles.purchaseButtonText, selectedPaidPlan === 'GOLD' && styles.purchaseButtonTextGold]}>
                    {actionKey === `${selectedPaidPlan}:${selectedInterval}`
                      ? 'Confirming with the App Store…'
                      : selectedPackage
                        ? `Choose ${selectedVisual.label} ${capitalize(selectedInterval)}`
                        : membership.billingReady
                          ? 'Plan unavailable'
                          : 'Loading local price'}
                  </Text>
                </Pressable>
              )}
              <Text style={styles.renewalNote}>Cancel anytime in your {manageLocationLabel}.</Text>
            </Animated.View>
          ) : (
            <View style={styles.freePanel}>
              <MaterialCommunityIcons name="message-text-outline" size={27} color={theme.cyan} />
              <View style={styles.freePanelCopy}>
                <Text style={styles.freePanelTitle}>The social core stays open.</Text>
                <Text style={styles.freePanelBody}>Create your profile, explore Vibes, match, and chat without a subscription.</Text>
              </View>
            </View>
          )}

          {!economyFlagsLoading && economyFlags.spark_wallet_enabled ? (
            <View style={styles.sparkCard}>
              <LinearGradient
                colors={theme.mode === 'dark'
                  ? ['rgba(10,121,124,0.38)', 'rgba(102,48,132,0.30)']
                  : ['rgba(118,205,195,0.54)', 'rgba(190,143,214,0.34)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.sparkCardCopy}>
                <Text style={styles.eyebrow}>SPARKS</Text>
                <Text style={styles.sparkTitle}>Premium moments, on your terms.</Text>
                <Text style={styles.sparkBody}>Your verified balance stays separate from membership.</Text>
                <Pressable style={styles.sparkButton} onPress={() => router.push('/wallet/sparks' as never)}>
                  <Text style={styles.sparkButtonText}>Open Sparks</Text>
                  <MaterialCommunityIcons name="arrow-right" size={17} color="#FFFFFF" />
                </Pressable>
              </View>
              <View style={styles.sparkCardVisual}>
                <SparkOrb compact />
                <SparkBalanceChip wallet={sparkWallet} compact />
              </View>
            </View>
          ) : null}

          <Pressable style={styles.compareButton} onPress={() => setComparisonOpen((current) => !current)}>
            <View style={styles.compareLabelRow}>
              <MaterialCommunityIcons name="chart-bar" size={20} color={theme.cyan} />
              <Text style={styles.compareButtonText}>Compare all features</Text>
            </View>
            <MaterialCommunityIcons name={comparisonOpen ? 'chevron-up' : 'chevron-down'} size={22} color={theme.text} />
          </Pressable>

          {comparisonOpen ? (
            <View style={styles.matrix}>
              <View style={styles.matrixHeader}>
                <Text style={[styles.matrixFeature, styles.matrixHeaderFeature]}>FEATURE</Text>
                <Text style={styles.matrixValue}>FREE</Text>
                <Text style={styles.matrixValue}>SILVER</Text>
                <Text style={[styles.matrixValue, { color: theme.gold }]}>GOLD</Text>
              </View>
              {FEATURE_MATRIX.map((row) => (
                <View key={row.label} style={styles.matrixRow}>
                  <Text style={styles.matrixFeature}>{row.label}</Text>
                  <Text style={styles.matrixValue}>{row.free}</Text>
                  <Text style={styles.matrixValue}>{row.silver}</Text>
                  <Text style={styles.matrixValue}>{row.gold}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.footerCard}>
            <View style={styles.footerHeader}>
              <View style={styles.footerIcon}>
                <MaterialCommunityIcons name="restore" size={22} color={theme.cyan} />
              </View>
              <View style={styles.footerHeaderCopy}>
                <Text style={styles.footerTitle}>Already a member?</Text>
                <Text style={styles.footerBody}>Restore purchases from this {accountLabel}.</Text>
              </View>
            </View>
            <View style={styles.footerActions}>
              <Pressable
                disabled={!membership.billingReady || restoring}
                onPress={() => void handleRestore()}
                style={[styles.footerButton, (!membership.billingReady || restoring) && styles.disabled]}
              >
                <Text style={styles.footerButtonText}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
              </Pressable>
              <Pressable onPress={() => void membership.refresh()} style={styles.footerButton}>
                <Text style={styles.footerButtonText}>Refresh plans</Text>
              </Pressable>
            </View>
            <Text style={styles.legalCopy}>
              Payment is charged to your {accountLabel} at confirmation. Subscriptions renew automatically unless cancelled at least 24 hours before the current period ends.
            </Text>
            <View style={styles.legalLinks}>
              <Pressable onPress={() => void openExternalUrl(TRUST_LINKS.terms)}><Text style={styles.legalLink}>Terms of Use</Text></Pressable>
              <View style={styles.legalDot} />
              <Pressable onPress={() => void openExternalUrl(TRUST_LINKS.privacy)}><Text style={styles.legalLink}>Privacy Policy</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function buildPackageMap(offerings: PurchasesOfferings | null, plan: PaidPlan) {
  if (!offerings) return { monthly: null, quarterly: null, annual: null };
  const packages = getPackagesForPlan(offerings, plan);
  return {
    monthly: packages.find((pkg) => getPlanIntervalFromPackage(pkg) === 'monthly') || findPackageForPlan(offerings, plan, 'monthly'),
    quarterly: packages.find((pkg) => getPlanIntervalFromPackage(pkg) === 'quarterly') || findPackageForPlan(offerings, plan, 'quarterly'),
    annual: packages.find((pkg) => getPlanIntervalFromPackage(pkg) === 'annual') || findPackageForPlan(offerings, plan, 'annual'),
  };
}

function getMonthsForInterval(interval: PremiumPlanInterval) {
  if (interval === 'monthly') return 1;
  if (interval === 'quarterly') return 3;
  return 12;
}

function formatCurrency(amount: number, pkg: PurchasesPackage) {
  const currencyCode = pkg.product.currencyCode || 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

function formatMonthlyEquivalent(pkg: PurchasesPackage) {
  const interval = getPlanIntervalFromPackage(pkg);
  if (!interval || typeof pkg.product.price !== 'number') return null;
  return `${formatCurrency(pkg.product.price / getMonthsForInterval(interval), pkg)}/mo`;
}

function getSavingsLabel(selected: PurchasesPackage, monthly: PurchasesPackage) {
  const interval = getPlanIntervalFromPackage(selected);
  if (!interval || interval === 'monthly') return null;
  const selectedPrice = selected.product.price;
  const monthlyPrice = monthly.product.price;
  if (!Number.isFinite(selectedPrice) || !Number.isFinite(monthlyPrice)) return null;
  const savings = ((monthlyPrice - selectedPrice / getMonthsForInterval(interval)) / monthlyPrice) * 100;
  return savings >= 4 ? `Save ${Math.round(savings)}%` : null;
}

function formatMembershipDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createStyles(theme: CommerceTheme) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.canvas },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 52, gap: 16 },
  currentBadge: { minWidth: 74, alignItems: 'flex-end' },
  currentBadgeLabel: { color: theme.textMuted, fontFamily: 'Manrope_700Bold', fontSize: 7, letterSpacing: 1.1 },
  currentBadgeValue: { fontFamily: 'Archivo_700Bold', fontSize: 11, marginTop: 2 },
  hero: { minHeight: 372, overflow: 'hidden', borderRadius: 30, borderWidth: 1, borderColor: theme.lineBright, padding: 21, shadowColor: theme.shadow, shadowOpacity: theme.mode === 'light' ? 0.13 : 0.04, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: theme.mode === 'light' ? 4 : 0 },
  heroCopy: { width: '64%', zIndex: 3 },
  heroEyebrow: { color: theme.cyan, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 2.2 },
  heroTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 44, lineHeight: 45, marginTop: 15 },
  heroBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20, marginTop: 10 },
  heroArt: { position: 'absolute', width: 222, height: 318, top: 4, right: -22, zIndex: 1 },
  heroSideScrim: { position: 'absolute', top: 0, bottom: 92, left: 0, right: 0, zIndex: 2 },
  heroBottomScrim: { position: 'absolute', height: 150, left: 0, right: 0, bottom: 0, zIndex: 2 },
  heroBenefits: { marginTop: 25, flexDirection: 'row', gap: 5, zIndex: 3 },
  heroStatus: { marginTop: 18, minHeight: 64, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, zIndex: 3 },
  heroStatusCopy: { flex: 1 },
  heroStatusLabel: { color: theme.textMuted, fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 1.2 },
  heroStatusText: { color: theme.text, fontFamily: 'Manrope_600SemiBold', fontSize: 12, marginTop: 4 },
  notice: { padding: 15, borderRadius: 18, flexDirection: 'row', gap: 11, borderWidth: 1, borderColor: `${theme.gold}44`, backgroundColor: theme.warningSurface },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  noticeBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 16, marginTop: 3 },
  sectionHeading: { marginTop: 4, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  eyebrow: { color: theme.cyan, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 1.7 },
  sectionTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 25, marginTop: 5 },
  sectionHint: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 10 },
  tierStack: { gap: 10 },
  purchasePanel: { overflow: 'hidden', borderRadius: 28, borderWidth: 1, borderColor: theme.lineBright, padding: 18, gap: 17, shadowColor: theme.shadow, shadowOpacity: theme.mode === 'light' ? 0.12 : 0.03, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: theme.mode === 'light' ? 3 : 0 },
  purchaseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  purchaseEyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 1.6 },
  purchaseTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 30, marginTop: 3 },
  planState: { minHeight: 30, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  planStateText: { fontFamily: 'Archivo_700Bold', fontSize: 8, letterSpacing: 0.8 },
  pricePanel: { minHeight: 116, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.surfaceStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  priceCopy: { flex: 1 },
  priceLabel: { color: theme.textMuted, fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 1.1 },
  priceValue: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 29, marginTop: 5 },
  priceMeta: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 9, lineHeight: 13, marginTop: 4 },
  priceAside: { alignItems: 'flex-end' },
  monthlyValue: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 11 },
  savings: { fontFamily: 'Manrope_700Bold', fontSize: 10, marginTop: 5 },
  includedLabel: { color: theme.textMuted, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 1.15 },
  featureList: { gap: 11 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1, color: theme.text, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
  purchaseButton: { minHeight: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16 },
  purchaseButtonText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  purchaseButtonTextGold: { color: '#2D1D02' },
  manageButton: { minHeight: 52, borderRadius: 26, borderWidth: 1, borderColor: theme.lineBright, backgroundColor: theme.surfaceStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  manageButtonText: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  renewalNote: { color: theme.textMuted, textAlign: 'center', fontFamily: 'Manrope_500Medium', fontSize: 9 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  freePanel: { padding: 18, borderRadius: 22, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.surface, flexDirection: 'row', alignItems: 'center', gap: 13 },
  freePanelCopy: { flex: 1 },
  freePanelTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 19 },
  freePanelBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 17, marginTop: 4 },
  sparkCard: { minHeight: 190, overflow: 'hidden', borderRadius: 27, borderWidth: 1, borderColor: theme.lineBright, padding: 18, flexDirection: 'row', alignItems: 'center' },
  sparkCardCopy: { flex: 1, zIndex: 2 },
  sparkTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 23, lineHeight: 27, marginTop: 7 },
  sparkBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 16, marginTop: 6 },
  sparkButton: { alignSelf: 'flex-start', marginTop: 13, minHeight: 39, borderRadius: 20, paddingHorizontal: 14, backgroundColor: theme.cyanDeep, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sparkButtonText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 11 },
  sparkCardVisual: { width: 122, alignItems: 'center', gap: 7 },
  compareButton: { minHeight: 58, borderRadius: 24, borderWidth: 1, borderColor: theme.lineBright, backgroundColor: theme.surface, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compareLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  compareButtonText: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  matrix: { borderRadius: 22, borderWidth: 1, borderColor: theme.line, overflow: 'hidden', backgroundColor: theme.surface },
  matrixHeader: { minHeight: 42, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.panelStrong },
  matrixRow: { minHeight: 52, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.line },
  matrixFeature: { width: '34%', color: theme.text, fontFamily: 'Manrope_600SemiBold', fontSize: 9.5 },
  matrixHeaderFeature: { color: theme.textMuted, fontSize: 8, letterSpacing: 0.7 },
  matrixValue: { width: '22%', color: theme.textMuted, textAlign: 'center', fontFamily: 'Manrope_600SemiBold', fontSize: 8.5 },
  footerCard: { padding: 18, borderRadius: 24, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.surface, gap: 14 },
  footerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,100,101,0.22)' },
  footerHeaderCopy: { flex: 1 },
  footerTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 18 },
  footerBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, marginTop: 2 },
  footerActions: { flexDirection: 'row', gap: 9 },
  footerButton: { flex: 1, minHeight: 43, borderRadius: 21, borderWidth: 1, borderColor: theme.lineBright, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceStrong },
  footerButtonText: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 10 },
  legalCopy: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 8.5, lineHeight: 14, textAlign: 'center' },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  legalLink: { color: theme.cyan, fontFamily: 'Manrope_700Bold', fontSize: 9 },
  legalDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: theme.textMuted },
  });
}
