import { Colors } from "@/constants/theme";
import { usePremiumState } from "@/hooks/use-premium-state";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Motion } from "@/lib/motion";
import {
  PremiumPlan,
  PremiumPlanInterval,
  derivePlanFromCustomerInfo,
  findPackageForPlan,
  getPackagesForPlan,
  getPlanIntervalFromPackage,
  isPurchaseCancelled,
  isRevenueCatConfiguredForPlatform,
  purchasePlanPackage,
  restoreRevenueCatPurchases,
} from "@/lib/subscriptions";
import { openExternalUrl, openSupportEmail } from "@/lib/trust-links";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PurchasesOfferings, PurchasesPackage } from "react-native-purchases";
import { SafeAreaView } from "react-native-safe-area-context";

type PaidPlan = Exclude<PremiumPlan, "FREE">;

const INTERVALS: PremiumPlanInterval[] = ["monthly", "quarterly", "annual"];

const INTERVAL_META: Record<
  PremiumPlanInterval,
  { label: string; short: string; spotlight?: string }
> = {
  monthly: { label: "Monthly", short: "1 mo" },
  quarterly: { label: "Quarterly", short: "3 mo", spotlight: "Balanced" },
  annual: { label: "Annual", short: "12 mo", spotlight: "Best value" },
};

const PLAN_CONFIG: Record<
  PaidPlan,
  {
    label: string;
    eyebrow: string;
    fallbackPrice: string;
    subtitle: string;
    features: string[];
    accent: string;
    halo: [string, string];
  }
> = {
  SILVER: {
    label: "Silver",
    eyebrow: "Essential tier",
    fallbackPrice: "Starter premium",
    subtitle: "For members who want stronger visibility, cleaner trust signals, and more momentum.",
    features: [
      "30-minute profile boosts from your own profile",
      "Elevated discovery visibility and a stronger first impression",
      "Priority support for account and verification issues",
      "More premium presentation across profile and trust surfaces",
    ],
    accent: "#14B8D4",
    halo: ["rgba(20,184,212,0.28)", "rgba(20,184,212,0.03)"],
  },
  GOLD: {
    label: "Gold",
    eyebrow: "Signature tier",
    fallbackPrice: "Flagship premium",
    subtitle: "For members who want the strongest premium positioning and priority.",
    features: [
      "Everything in Silver, plus the highest premium placement",
      "Profile boosts included with the top member tier",
      "The strongest trust framing across core member surfaces",
      "Priority-first support and premium release access",
    ],
    accent: "#EAB308",
    halo: ["rgba(234,179,8,0.32)", "rgba(234,179,8,0.04)"],
  },
};

const PLAN_DEFAULT_INTERVAL: Record<PaidPlan, PremiumPlanInterval> = {
  SILVER: "quarterly",
  GOLD: "annual",
};

export default function PremiumPlansScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const {
    activeBoostEndsAt,
    billingReady,
    billingSupported,
    currentPlan,
    currentPlanEndsAt,
    customerInfo,
    error: billingError,
    hasActiveBoost,
    offerings,
    loading,
    refresh,
  } = usePremiumState();
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [selectedIntervals, setSelectedIntervals] = useState<Record<PaidPlan, PremiumPlanInterval>>(PLAN_DEFAULT_INTERVAL);
  const showDeveloperBillingNotice = __DEV__ && !billingReady && !loading && isRevenueCatConfiguredForPlatform() === false;

  const packageCatalog = useMemo(
    () => ({
      SILVER: buildPackageMap(offerings, "SILVER"),
      GOLD: buildPackageMap(offerings, "GOLD"),
    }),
    [offerings],
  );

  const handlePurchase = async (plan: PaidPlan, interval: PremiumPlanInterval) => {
    const targetPackage = getSelectedPlanPackage(packageCatalog[plan], interval);
    if (!targetPackage) {
      Alert.alert("Plan unavailable", `${PLAN_CONFIG[plan].label} ${INTERVAL_META[interval].label.toLowerCase()} is not available right now.`);
      return;
    }

    try {
      setActionKey(`${plan}:${interval}`);
      const result = await purchasePlanPackage(targetPackage);
      if (result.customerInfo && derivePlanFromCustomerInfo(result.customerInfo) !== "FREE") {
        await refresh();
      }
      Alert.alert("Premium active", `${PLAN_CONFIG[plan].label} ${INTERVAL_META[interval].label.toLowerCase()} is now active on this account.`);
    } catch (error) {
      if (!isPurchaseCancelled(error)) {
        const message = error instanceof Error ? error.message : "Unable to complete this purchase right now.";
        Alert.alert("Purchase failed", message);
      }
    } finally {
      setActionKey(null);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      await restoreRevenueCatPurchases();
      await refresh();
      Alert.alert("Purchases restored", "Your premium membership has been refreshed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to restore purchases right now.";
      Alert.alert("Restore failed", message);
    } finally {
      setRestoring(false);
    }
  };

  const handleManage = async () => {
    if (customerInfo?.managementURL) {
      await openExternalUrl(customerInfo.managementURL);
      return;
    }
    await openSupportEmail(
      "Betweener premium support",
      "Hello Betweener team,%0D%0A%0D%0AI need help managing my premium plan.%0D%0A",
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[withAlpha(theme.tint, isDark ? 0.24 : 0.14), withAlpha(theme.accent, isDark ? 0.18 : 0.08), "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgGlow}
      />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(Motion.duration.slow)}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <MaterialCommunityIcons name="chevron-left" size={20} color={theme.text} />
              <Text style={styles.backLabel}>Back</Text>
            </Pressable>

            <View style={styles.heroCard}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>Premium Plans</Text>
              </View>
              <Text style={styles.heroTitle}>Choose the premium pace that fits your momentum</Text>
              <Text style={styles.heroBody}>
                Step into a cleaner, more luxurious membership experience with stronger visibility, priority trust framing, and flexible billing that matches how you date.
              </Text>
              <View style={styles.heroHighlights}>
                <View style={styles.heroPill}>
                  <MaterialCommunityIcons name="rocket-launch-outline" size={16} color={theme.tint} />
                  <Text style={styles.heroPillText}>Boost visibility</Text>
                </View>
                <View style={styles.heroPill}>
                  <MaterialCommunityIcons name="shield-check-outline" size={16} color={theme.tint} />
                  <Text style={styles.heroPillText}>Premium trust</Text>
                </View>
                <View style={styles.heroPill}>
                  <MaterialCommunityIcons name="calendar-clock-outline" size={16} color={theme.tint} />
                  <Text style={styles.heroPillText}>Flexible billing</Text>
                </View>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Current membership</Text>
                <Text style={styles.statusValue}>{loading ? "Checking..." : currentPlan}</Text>
              </View>
              <Text style={styles.statusMeta}>
                {currentPlanEndsAt
                  ? `Active until ${new Date(currentPlanEndsAt).toLocaleDateString()}`
                  : "You are currently on the free plan."}
              </Text>
              <Text style={styles.statusMeta}>
                {billingReady
                  ? billingSupported
                    ? "In-app purchases are available on this device."
                    : "Purchases are not available on this device right now."
                  : "Plan pricing is still loading for this device."}
              </Text>
              <Text style={styles.statusMeta}>
                {hasActiveBoost && activeBoostEndsAt
                  ? `Boost currently live until ${new Date(activeBoostEndsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "No live boost is running right now."}
              </Text>
            </View>
          </Animated.View>

          {billingError ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Plans are temporarily unavailable</Text>
              <Text style={styles.noticeBody}>
                We could not load premium plans right now. Refresh this screen or try again in a moment.
              </Text>
            </View>
          ) : null}

          {showDeveloperBillingNotice ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Developer billing notice</Text>
              <Text style={styles.noticeBody}>
                Add `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` and `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` to unlock live billing on device.
              </Text>
            </View>
          ) : null}

          {(Object.keys(PLAN_CONFIG) as PaidPlan[]).map((plan, index) => {
            const config = PLAN_CONFIG[plan];
            const active = currentPlan === plan;
            const packageMap = packageCatalog[plan];
            const selectedInterval = selectedIntervals[plan];
            const selectedPackage = getSelectedPlanPackage(packageMap, selectedInterval);
            const monthlyPackage = packageMap.monthly;
            const savingsLabel = getSavingsLabel(selectedPackage, monthlyPackage);
            const monthlyEquivalent = formatMonthlyEquivalent(selectedPackage);

            return (
              <Animated.View key={plan} entering={FadeInDown.delay((index + 1) * 80).duration(Motion.duration.slow)}>
                <View style={styles.planCard}>
                  <LinearGradient colors={config.halo} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.planGlow} />
                  <View style={styles.planHeader}>
                    <View style={styles.planHeaderCopy}>
                      <Text style={[styles.planEyebrow, { color: config.accent }]}>{config.eyebrow}</Text>
                      <Text style={styles.planName}>{config.label}</Text>
                      <Text style={styles.planSubtitle}>{config.subtitle}</Text>
                    </View>
                    <View style={[styles.planBadge, active && styles.planBadgeActive]}>
                      <Text style={[styles.planBadgeText, active && styles.planBadgeTextActive]}>
                        {active ? "Active" : selectedPackage ? "Available" : "Preparing"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.durationRail}>
                    {INTERVALS.map((interval) => {
                      const pkg = packageMap[interval];
                      const selected = interval === selectedInterval;
                      const intervalMeta = INTERVAL_META[interval];
                      return (
                        <Pressable
                          key={interval}
                          style={[styles.durationChip, selected && styles.durationChipSelected, !pkg && styles.durationChipDisabled]}
                          disabled={!pkg}
                          onPress={() => setSelectedIntervals((current) => ({ ...current, [plan]: interval }))}
                        >
                          <Text style={[styles.durationChipLabel, selected && styles.durationChipLabelSelected]}>
                            {intervalMeta.label}
                          </Text>
                          <Text style={[styles.durationChipPrice, selected && styles.durationChipPriceSelected]}>
                            {pkg?.product.priceString || intervalMeta.short}
                          </Text>
                          {intervalMeta.spotlight && pkg ? (
                            <View style={[styles.durationSpotlight, selected && styles.durationSpotlightSelected]}>
                              <Text style={[styles.durationSpotlightText, selected && styles.durationSpotlightTextSelected]}>
                                {intervalMeta.spotlight}
                              </Text>
                            </View>
                          ) : null}
                          {selected ? <View style={[styles.durationChipGlow, { borderColor: withAlpha(config.accent, 0.42) }]} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.priceHeroShell}>
                    <LinearGradient
                      colors={[withAlpha(config.accent, isDark ? 0.16 : 0.12), withAlpha(config.accent, 0.02)]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.priceHeroGlow}
                    />
                    <View style={styles.priceHeroTopline}>
                      <Text style={styles.priceHeroKicker}>
                        {selectedPackage ? `${INTERVAL_META[selectedInterval].label} billing` : "Membership preview"}
                      </Text>
                      {INTERVAL_META[selectedInterval].spotlight ? (
                        <View style={[styles.priceHeroBadge, { backgroundColor: withAlpha(config.accent, 0.16) }]}>
                          <Text style={[styles.priceHeroBadgeText, { color: config.accent }]}>
                            {INTERVAL_META[selectedInterval].spotlight}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  <View style={styles.priceHero}>
                    <View>
                      <Text style={styles.priceHeroValue}>{selectedPackage?.product.priceString || config.fallbackPrice}</Text>
                      <Text style={styles.priceHeroMeta}>
                        {selectedPackage
                          ? `${INTERVAL_META[selectedInterval].label} billing`
                          : "Pricing is being prepared for this membership option."}
                      </Text>
                    </View>
                    <View style={styles.priceHeroAside}>
                      {monthlyEquivalent ? <Text style={styles.priceHeroAsideValue}>{monthlyEquivalent}</Text> : null}
                      {savingsLabel ? <Text style={styles.priceHeroAsideMeta}>{savingsLabel}</Text> : null}
                    </View>
                  </View>
                  </View>

                  <Text style={styles.sectionLabel}>Included in {config.label}</Text>
                  <View style={styles.features}>
                    {config.features.map((feature) => (
                      <View key={feature} style={styles.featureRow}>
                        <MaterialCommunityIcons name="check-circle-outline" size={18} color={config.accent} />
                        <Text style={styles.featureText}>{feature}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.planActions}>
                    {active ? (
                      <Pressable style={[styles.planButton, styles.planButtonMuted]} onPress={() => void handleManage()}>
                        <Text style={[styles.planButtonText, styles.planButtonTextMuted]}>Manage membership</Text>
                      </Pressable>
                    ) : billingReady && billingSupported && selectedPackage ? (
                      <Pressable style={styles.planButton} onPress={() => void handlePurchase(plan, selectedInterval)}>
                        <Text style={styles.planButtonText}>
                          {actionKey === `${plan}:${selectedInterval}` ? "Processing..." : `Choose ${config.label} ${INTERVAL_META[selectedInterval].label}`}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable style={[styles.planButton, styles.planButtonMuted]} disabled>
                        <Text style={[styles.planButtonText, styles.planButtonTextMuted]}>Launching soon</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.planFootnote}>Cancel anytime in your Apple subscription settings.</Text>
                </View>
              </Animated.View>
            );
          })}

          <View style={styles.footerCard}>
            <Text style={styles.footerTitle}>Restore purchases</Text>
            <Text style={styles.footerBody}>
              Already subscribed on this Apple ID? Restore your purchases to refresh your membership on this device.
            </Text>
            <View style={styles.footerActions}>
              <Pressable
                style={[styles.secondaryButton, (!billingReady || restoring) && styles.secondaryButtonMuted]}
                disabled={!billingReady || restoring}
                onPress={() => void handleRestore()}
              >
                <Text style={styles.secondaryButtonText}>{restoring ? "Restoring..." : "Restore purchases"}</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => void refresh()}>
                <Text style={styles.secondaryButtonText}>Refresh plans</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function buildPackageMap(offerings: PurchasesOfferings | null, plan: PaidPlan) {
  const packages = getPackagesForPlan(offerings, plan);
  return {
    monthly: packages.find((pkg) => getPlanIntervalFromPackage(pkg) === "monthly") || findPackageForPlan(offerings, plan, "monthly"),
    quarterly: packages.find((pkg) => getPlanIntervalFromPackage(pkg) === "quarterly") || findPackageForPlan(offerings, plan, "quarterly"),
    annual: packages.find((pkg) => getPlanIntervalFromPackage(pkg) === "annual") || findPackageForPlan(offerings, plan, "annual"),
  };
}

function getSelectedPlanPackage(
  packageMap: Record<PremiumPlanInterval, PurchasesPackage | null>,
  selectedInterval: PremiumPlanInterval,
) {
  return packageMap[selectedInterval] || packageMap.annual || packageMap.quarterly || packageMap.monthly || null;
}

function getMonthsForInterval(interval: PremiumPlanInterval) {
  switch (interval) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "annual":
      return 12;
  }
}

function getPackagePrice(pkg: PurchasesPackage | null) {
  const price = pkg?.product.price;
  return typeof price === "number" ? price : null;
}

function formatCurrency(amount: number, pkg: PurchasesPackage) {
  const currencyCode = pkg.product.currencyCode || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: amount >= 10 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

function formatMonthlyEquivalent(pkg: PurchasesPackage | null) {
  if (!pkg) return null;
  const price = getPackagePrice(pkg);
  const interval = getPlanIntervalFromPackage(pkg);
  if (price == null || !interval) return null;
  return `${formatCurrency(price / getMonthsForInterval(interval), pkg)}/mo`;
}

function getSavingsLabel(selectedPackage: PurchasesPackage | null, monthlyPackage: PurchasesPackage | null) {
  const selectedPrice = getPackagePrice(selectedPackage);
  const monthlyPrice = getPackagePrice(monthlyPackage);
  const interval = selectedPackage ? getPlanIntervalFromPackage(selectedPackage) : null;

  if (selectedPrice == null || monthlyPrice == null || !interval || interval === "monthly") {
    return null;
  }

  const selectedMonthlyEquivalent = selectedPrice / getMonthsForInterval(interval);
  const savings = ((monthlyPrice - selectedMonthlyEquivalent) / monthlyPrice) * 100;

  if (!Number.isFinite(savings) || savings < 4) {
    return null;
  }

  return `Save ${Math.round(savings)}%`;
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    safeArea: { flex: 1 },
    bgGlow: {
      position: "absolute",
      top: -100,
      left: -90,
      width: 320,
      height: 320,
      borderRadius: 320,
    },
    content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, gap: 18 },
    backButton: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
      marginBottom: 14,
    },
    backLabel: { color: theme.text, fontSize: 12, fontWeight: "600" },
    heroCard: {
      borderRadius: 28,
      padding: 22,
      gap: 14,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.34 : 0.8),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
    },
    heroBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.36 : 0.92),
    },
    heroBadgeText: { color: theme.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
    heroTitle: { color: theme.text, fontSize: 30, lineHeight: 36, fontFamily: "PlayfairDisplay_700Bold" },
    heroBody: { color: theme.textMuted, fontSize: 13, lineHeight: 21, fontFamily: "Manrope_500Medium" },
    heroHighlights: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    heroPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.background, isDark ? 0.4 : 0.92),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
    },
    heroPillText: { color: theme.text, fontSize: 11, fontWeight: "700" },
    statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
    statusLabel: { color: theme.textMuted, fontSize: 12, fontFamily: "Archivo_700Bold" },
    statusValue: { color: theme.text, fontSize: 16, fontFamily: "Archivo_700Bold" },
    statusMeta: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    noticeCard: {
      borderRadius: 18,
      padding: 16,
      gap: 8,
      backgroundColor: withAlpha(theme.accent, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.accent, 0.22),
    },
    noticeTitle: { color: theme.text, fontSize: 15, fontFamily: "Archivo_700Bold" },
    noticeBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    planCard: {
      position: "relative",
      overflow: "hidden",
      borderRadius: 26,
      padding: 20,
      gap: 14,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.3 : 0.75),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    planGlow: { ...StyleSheet.absoluteFillObject },
    planHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    planHeaderCopy: { flex: 1, gap: 4 },
    planEyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
    planName: { color: theme.text, fontSize: 24, fontFamily: "PlayfairDisplay_700Bold" },
    planSubtitle: { color: theme.textMuted, fontSize: 13, lineHeight: 20, fontFamily: "Manrope_500Medium" },
    planBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.92),
    },
    planBadgeActive: { borderColor: theme.tint, backgroundColor: withAlpha(theme.tint, 0.14) },
    planBadgeText: { color: theme.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
    planBadgeTextActive: { color: theme.tint },
    durationRail: { flexDirection: "row", gap: 10 },
    durationChip: {
      position: "relative",
      flex: 1,
      minHeight: 82,
      paddingHorizontal: 11,
      paddingVertical: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.36 : 0.9),
      justifyContent: "space-between",
    },
    durationChipSelected: {
      borderColor: theme.tint,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
      transform: [{ translateY: -3 }],
    },
    durationChipDisabled: { opacity: 0.42 },
    durationChipLabel: { color: theme.text, fontSize: 12, fontWeight: "700" },
    durationChipLabelSelected: { color: theme.text },
    durationChipPrice: { color: theme.textMuted, fontSize: 11, fontWeight: "700" },
    durationChipPriceSelected: { color: theme.text },
    durationSpotlight: {
      alignSelf: "flex-start",
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.12 : 0.06),
    },
    durationSpotlightSelected: { backgroundColor: withAlpha(theme.tint, 0.18) },
    durationSpotlightText: { color: theme.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 0.2 },
    durationSpotlightTextSelected: { color: theme.text },
    durationChipGlow: {
      position: "absolute",
      inset: 0,
      borderRadius: 18,
      borderWidth: 1.5,
    },
    priceHeroShell: {
      position: "relative",
      overflow: "hidden",
      borderRadius: 22,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.4 : 0.94),
    },
    priceHeroGlow: {
      ...StyleSheet.absoluteFillObject,
    },
    priceHeroTopline: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    priceHeroKicker: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    priceHeroBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    priceHeroBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.3,
    },
    priceHero: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12,
    },
    priceHeroValue: { color: theme.text, fontSize: 32, lineHeight: 36, fontFamily: "Archivo_700Bold" },
    priceHeroMeta: { color: theme.textMuted, fontSize: 12, marginTop: 3, lineHeight: 17, fontFamily: "Manrope_500Medium" },
    priceHeroAside: { alignItems: "flex-end", gap: 4 },
    priceHeroAsideValue: { color: theme.text, fontSize: 12, fontWeight: "700" },
    priceHeroAsideMeta: { color: theme.tint, fontSize: 11, fontWeight: "700" },
    sectionLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    features: { gap: 9 },
    featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    featureText: { flex: 1, color: theme.text, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    planActions: { marginTop: 0 },
    planButton: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: theme.tint,
      alignItems: "center",
    },
    planButtonMuted: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    planButtonText: { color: Colors.light.background, fontSize: 12, fontWeight: "700" },
    planButtonTextMuted: { color: theme.text },
    planFootnote: {
      color: theme.textMuted,
      fontSize: 10,
      lineHeight: 15,
      fontFamily: "Manrope_500Medium",
      textAlign: "center",
    },
    footerCard: {
      borderRadius: 18,
      padding: 16,
      gap: 10,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    footerTitle: { color: theme.text, fontSize: 16, fontFamily: "Archivo_700Bold" },
    footerBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    footerActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    secondaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.92),
    },
    secondaryButtonMuted: { opacity: 0.5 },
    secondaryButtonText: { color: theme.text, fontSize: 12, fontWeight: "600" },
  });

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};
