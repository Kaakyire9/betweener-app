import { Colors } from "@/constants/theme";
import { usePremiumState } from "@/hooks/use-premium-state";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Motion } from "@/lib/motion";
import {
  PremiumPlan,
  derivePlanFromCustomerInfo,
  findPackageForPlan,
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
import { SafeAreaView } from "react-native-safe-area-context";

const PLAN_CONFIG: Record<
  Exclude<PremiumPlan, "FREE">,
  { label: string; fallbackPrice: string; subtitle: string; features: string[]; accent: string }
> = {
  SILVER: {
    label: "Silver",
    fallbackPrice: "Starter premium",
    subtitle: "For members who want stronger visibility, cleaner trust signals, and more momentum.",
    features: [
      "30-minute profile boosts from your own profile",
      "Elevated discovery visibility and a stronger first impression",
      "Priority support for account and verification issues",
      "More premium presentation across profile and trust surfaces",
    ],
    accent: "#0EA5E9",
  },
  GOLD: {
    label: "Gold",
    fallbackPrice: "Flagship premium",
    subtitle: "For members who want the strongest premium positioning and priority.",
    features: [
      "Everything in Silver, plus the highest premium placement",
      "Profile boosts included with the top member tier",
      "The strongest trust framing across core member surfaces",
      "Priority-first support and premium release access",
    ],
    accent: "#D4A017",
  },
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
  const [actionPlan, setActionPlan] = useState<Exclude<PremiumPlan, "FREE"> | null>(null);
  const [restoring, setRestoring] = useState(false);

  const handlePurchase = async (plan: Exclude<PremiumPlan, "FREE">) => {
    const targetPackage = findPackageForPlan(offerings, plan);
    if (!targetPackage) {
      Alert.alert("Plan unavailable", `${PLAN_CONFIG[plan].label} is not available in the current RevenueCat offering yet.`);
      return;
    }

    try {
      setActionPlan(plan);
      const result = await purchasePlanPackage(targetPackage);
      if (result.customerInfo && derivePlanFromCustomerInfo(result.customerInfo) !== "FREE") {
        await refresh();
      }
      Alert.alert("Premium active", `${PLAN_CONFIG[plan].label} is now active on this account.`);
    } catch (error) {
      if (!isPurchaseCancelled(error)) {
        const message = error instanceof Error ? error.message : "Unable to complete this purchase right now.";
        Alert.alert("Purchase failed", message);
      }
    } finally {
      setActionPlan(null);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      await restoreRevenueCatPurchases();
      await refresh();
      Alert.alert("Purchases restored", "Your RevenueCat entitlements have been refreshed.");
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
      "Hello Betweener team,%0D%0A%0D%0AI need help managing my premium plan.%0D%0A"
    );
  };

  const revenueCatMissing = !billingReady && !loading && isRevenueCatConfiguredForPlatform() === false;

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
              <Text style={styles.heroTitle}>Premium should feel real, secure, and instantly usable</Text>
              <Text style={styles.heroBody}>
                Betweener now resolves entitlements through live RevenueCat purchases and server-backed premium access, so boosts and paid features reflect real plan state.
              </Text>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Current plan</Text>
                <Text style={styles.statusValue}>{loading ? "Checking..." : currentPlan}</Text>
              </View>
              <Text style={styles.statusMeta}>
                {currentPlanEndsAt
                  ? `Premium active until ${new Date(currentPlanEndsAt).toLocaleDateString()}`
                  : "No active paid entitlement found on this account yet."}
              </Text>
              <Text style={styles.statusMeta}>
                Billing: {billingReady ? (billingSupported ? "ready" : "configured but payments unavailable on this device") : "not configured for this platform"}
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
              <Text style={styles.noticeTitle}>Billing notice</Text>
              <Text style={styles.noticeBody}>{billingError}</Text>
            </View>
          ) : null}

          {revenueCatMissing ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>RevenueCat keys still missing</Text>
              <Text style={styles.noticeBody}>
                Add `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` and `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` to unlock live billing on device.
              </Text>
            </View>
          ) : null}

          {(["SILVER", "GOLD"] as const).map((plan, index) => {
            const config = PLAN_CONFIG[plan];
            const active = currentPlan === plan;
            const targetPackage = findPackageForPlan(offerings, plan);
            const product = targetPackage?.product ?? null;
            return (
              <Animated.View key={plan} entering={FadeInDown.delay((index + 1) * 80).duration(Motion.duration.slow)}>
                <View style={styles.planCard}>
                  <LinearGradient
                    colors={[withAlpha(config.accent, isDark ? 0.28 : 0.16), "transparent"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.planGlow}
                  />
                  <View style={styles.planHeader}>
                    <View>
                      <Text style={styles.planName}>{config.label}</Text>
                      <Text style={styles.planPrice}>{product?.priceString || config.fallbackPrice}</Text>
                    </View>
                    <View style={[styles.planBadge, active && styles.planBadgeActive]}>
                      <Text style={[styles.planBadgeText, active && styles.planBadgeTextActive]}>
                        {active ? "Active" : billingReady && targetPackage ? "Live" : "Preview"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.planSubtitle}>
                    {product?.subscriptionPeriod ? `${config.subtitle} • ${formatSubscriptionPeriod(product.subscriptionPeriod)}` : config.subtitle}
                  </Text>
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
                        <Text style={[styles.planButtonText, styles.planButtonTextMuted]}>Manage subscription</Text>
                      </Pressable>
                    ) : billingReady && billingSupported && targetPackage ? (
                      <Pressable style={styles.planButton} onPress={() => void handlePurchase(plan)}>
                        <Text style={styles.planButtonText}>
                          {actionPlan === plan ? "Processing..." : `Choose ${config.label}`}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[styles.planButton, styles.planButtonMuted]}
                        onPress={() =>
                          void openSupportEmail(
                            `Betweener ${config.label} plan`,
                            `Hello Betweener team,%0D%0A%0D%0AI want to ask about the ${config.label} premium plan.%0D%0A`
                          )
                        }
                      >
                        <Text style={[styles.planButtonText, styles.planButtonTextMuted]}>Ask about {config.label}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </Animated.View>
            );
          })}

          <View style={styles.footerCard}>
            <Text style={styles.footerTitle}>Restore and sync</Text>
            <Text style={styles.footerBody}>
              RevenueCat is now the live purchase source in-app, while server-backed premium RPCs drive actual access to boost and premium status surfaces.
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
                <Text style={styles.secondaryButtonText}>Refresh state</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function formatSubscriptionPeriod(period: string) {
  switch (period) {
    case "P1W":
      return "weekly billing";
    case "P1M":
      return "monthly billing";
    case "P3M":
      return "quarterly billing";
    case "P6M":
      return "six-month billing";
    case "P1Y":
      return "annual billing";
    default:
      return period;
  }
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    safeArea: { flex: 1 },
    bgGlow: {
      position: "absolute",
      top: -100,
      left: -90,
      width: 280,
      height: 280,
      borderRadius: 280,
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
      borderRadius: 24,
      padding: 20,
      gap: 12,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.34 : 0.74),
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
    heroTitle: { color: theme.text, fontSize: 28, lineHeight: 34, fontFamily: "PlayfairDisplay_700Bold" },
    heroBody: { color: theme.textMuted, fontSize: 13, lineHeight: 21, fontFamily: "Manrope_500Medium" },
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
      borderRadius: 22,
      padding: 18,
      gap: 12,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    planGlow: { ...StyleSheet.absoluteFillObject },
    planHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    planName: { color: theme.text, fontSize: 22, fontFamily: "PlayfairDisplay_700Bold" },
    planPrice: { color: theme.textMuted, fontSize: 12, marginTop: 4, fontFamily: "Manrope_500Medium" },
    planBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.92),
    },
    planBadgeActive: { borderColor: theme.tint, backgroundColor: withAlpha(theme.tint, 0.14) },
    planBadgeText: { color: theme.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
    planBadgeTextActive: { color: theme.tint },
    planSubtitle: { color: theme.textMuted, fontSize: 13, lineHeight: 20, fontFamily: "Manrope_500Medium" },
    features: { gap: 10 },
    featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    featureText: { flex: 1, color: theme.text, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    planActions: { marginTop: 4 },
    planButton: {
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 999,
      backgroundColor: theme.tint,
      alignItems: "center",
    },
    planButtonMuted: {
      backgroundColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    planButtonText: { color: Colors.light.background, fontSize: 12, fontWeight: "700" },
    planButtonTextMuted: { color: theme.text },
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
