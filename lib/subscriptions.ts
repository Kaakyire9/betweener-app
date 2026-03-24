import Purchases, {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
  PurchasesError,
  PURCHASES_ERROR_CODE,
} from "react-native-purchases";
import { Platform } from "react-native";

export type PremiumPlan = "FREE" | "SILVER" | "GOLD";
export type PremiumPlanInterval = "monthly" | "quarterly" | "annual";

type ConfigureArgs = {
  appUserID: string;
  email?: string | null;
  displayName?: string | null;
};

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || "";
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY || "";
const SILVER_ENTITLEMENT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_ENTITLEMENT || "silver").toLowerCase();
const GOLD_ENTITLEMENT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_ENTITLEMENT || "gold").toLowerCase();
const SILVER_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_PACKAGE || "silver").toLowerCase();
const GOLD_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_PACKAGE || "gold").toLowerCase();
const SILVER_PRODUCT_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_PRODUCT || "silver").toLowerCase();
const GOLD_PRODUCT_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_PRODUCT || "gold").toLowerCase();
const SILVER_MONTHLY_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_MONTHLY_PACKAGE || "silver_monthly").toLowerCase();
const SILVER_QUARTERLY_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_QUARTERLY_PACKAGE || "silver_quarterly").toLowerCase();
const SILVER_ANNUAL_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_ANNUAL_PACKAGE || "silver_annual").toLowerCase();
const GOLD_MONTHLY_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_MONTHLY_PACKAGE || "gold_monthly").toLowerCase();
const GOLD_QUARTERLY_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_QUARTERLY_PACKAGE || "gold_quarterly").toLowerCase();
const GOLD_ANNUAL_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_ANNUAL_PACKAGE || "gold_annual").toLowerCase();
const SILVER_MONTHLY_PRODUCT_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_MONTHLY_PRODUCT || "silver.monthly").toLowerCase();
const SILVER_QUARTERLY_PRODUCT_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_QUARTERLY_PRODUCT || "silver.quarterly").toLowerCase();
const SILVER_ANNUAL_PRODUCT_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_ANNUAL_PRODUCT || "silver.annual").toLowerCase();
const GOLD_MONTHLY_PRODUCT_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_MONTHLY_PRODUCT || "gold.monthly").toLowerCase();
const GOLD_QUARTERLY_PRODUCT_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_QUARTERLY_PRODUCT || "gold.quarterly").toLowerCase();
const GOLD_ANNUAL_PRODUCT_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_ANNUAL_PRODUCT || "gold.annual").toLowerCase();

const INTERVAL_ORDER: Record<PremiumPlanInterval, number> = {
  monthly: 0,
  quarterly: 1,
  annual: 2,
};

const PACKAGE_HINTS: Record<Exclude<PremiumPlan, "FREE">, Record<PremiumPlanInterval, string[]>> = {
  SILVER: {
    monthly: [SILVER_MONTHLY_PACKAGE_HINT, SILVER_PACKAGE_HINT],
    quarterly: [SILVER_QUARTERLY_PACKAGE_HINT],
    annual: [SILVER_ANNUAL_PACKAGE_HINT],
  },
  GOLD: {
    monthly: [GOLD_MONTHLY_PACKAGE_HINT, GOLD_PACKAGE_HINT],
    quarterly: [GOLD_QUARTERLY_PACKAGE_HINT],
    annual: [GOLD_ANNUAL_PACKAGE_HINT],
  },
};

const PRODUCT_HINTS: Record<Exclude<PremiumPlan, "FREE">, Record<PremiumPlanInterval, string[]>> = {
  SILVER: {
    monthly: [SILVER_MONTHLY_PRODUCT_HINT, SILVER_PRODUCT_HINT],
    quarterly: [SILVER_QUARTERLY_PRODUCT_HINT],
    annual: [SILVER_ANNUAL_PRODUCT_HINT],
  },
  GOLD: {
    monthly: [GOLD_MONTHLY_PRODUCT_HINT, GOLD_PRODUCT_HINT],
    quarterly: [GOLD_QUARTERLY_PRODUCT_HINT],
    annual: [GOLD_ANNUAL_PRODUCT_HINT],
  },
};

const getRevenueCatApiKey = () => {
  if (Platform.OS === "ios") return IOS_API_KEY;
  if (Platform.OS === "android") return ANDROID_API_KEY;
  return "";
};

export const isRevenueCatConfiguredForPlatform = () => Boolean(getRevenueCatApiKey()) && Platform.OS !== "web";

export async function ensureRevenueCatConfigured({ appUserID, email, displayName }: ConfigureArgs) {
  if (!isRevenueCatConfiguredForPlatform()) return false;

  const configured = await Purchases.isConfigured().catch(() => false);
  if (!configured) {
    Purchases.configure({
      apiKey: getRevenueCatApiKey(),
      appUserID,
    });
  } else {
    const currentUser = await Purchases.getAppUserID().catch(() => null);
    if (currentUser && currentUser !== appUserID) {
      await Purchases.logIn(appUserID);
    }
  }

  if (email) {
    await Purchases.setEmail(email).catch(() => {});
  }
  if (displayName) {
    await Purchases.setDisplayName(displayName).catch(() => {});
  }

  return true;
}

export async function loadRevenueCatState(args: ConfigureArgs): Promise<{
  enabled: boolean;
  canMakePayments: boolean;
  offerings: PurchasesOfferings | null;
  customerInfo: CustomerInfo | null;
  currentPlan: PremiumPlan;
}> {
  const ready = await ensureRevenueCatConfigured(args);
  if (!ready) {
    return {
      enabled: false,
      canMakePayments: false,
      offerings: null,
      customerInfo: null,
      currentPlan: "FREE",
    };
  }

  const [canMakePayments, offerings, customerInfo] = await Promise.all([
    Purchases.canMakePayments().catch(() => false),
    Purchases.getOfferings().catch(() => null),
    Purchases.getCustomerInfo().catch(() => null),
  ]);

  return {
    enabled: true,
    canMakePayments,
    offerings,
    customerInfo,
    currentPlan: derivePlanFromCustomerInfo(customerInfo),
  };
}

export function derivePlanFromCustomerInfo(customerInfo: CustomerInfo | null): PremiumPlan {
  if (!customerInfo) return "FREE";
  const activeEntitlements = Object.keys(customerInfo.entitlements.active || {}).map((key) => key.toLowerCase());
  const activeProducts = (customerInfo.activeSubscriptions || []).map((key) => key.toLowerCase());

  const hasGold =
    activeEntitlements.some((key) => key.includes(GOLD_ENTITLEMENT)) ||
    activeProducts.some((key) => key.includes(GOLD_PRODUCT_HINT));
  if (hasGold) return "GOLD";

  const hasSilver =
    activeEntitlements.some((key) => key.includes(SILVER_ENTITLEMENT)) ||
    activeProducts.some((key) => key.includes(SILVER_PRODUCT_HINT));
  if (hasSilver) return "SILVER";

  return "FREE";
}

export function getPlanIntervalFromPackage(pkg: PurchasesPackage): PremiumPlanInterval | null {
  const subscriptionPeriod = String(pkg.product.subscriptionPeriod || "").toUpperCase();
  const packageId = (pkg.identifier || "").toLowerCase();
  const productId = (pkg.product.identifier || "").toLowerCase();

  if (subscriptionPeriod === "P1M" || packageId.includes("monthly") || productId.includes("monthly")) {
    return "monthly";
  }
  if (subscriptionPeriod === "P3M" || packageId.includes("quarterly") || productId.includes("quarterly")) {
    return "quarterly";
  }
  if (subscriptionPeriod === "P1Y" || packageId.includes("annual") || packageId.includes("yearly") || productId.includes("annual") || productId.includes("yearly")) {
    return "annual";
  }
  return null;
}

function packageMatchesPlanAndInterval(
  pkg: PurchasesPackage,
  plan: Exclude<PremiumPlan, "FREE">,
  interval: PremiumPlanInterval,
) {
  const packageId = (pkg.identifier || "").toLowerCase();
  const productId = (pkg.product.identifier || "").toLowerCase();
  const title = (pkg.product.title || "").toLowerCase();
  const planTag = plan.toLowerCase();
  const normalizedInterval = getPlanIntervalFromPackage(pkg);

  const packageHints = PACKAGE_HINTS[plan][interval];
  const productHints = PRODUCT_HINTS[plan][interval];

  return (
    (normalizedInterval === interval || normalizedInterval === null) &&
    (
      packageHints.some((hint) => hint && packageId.includes(hint)) ||
      productHints.some((hint) => hint && productId.includes(hint)) ||
      (packageId.includes(planTag) && packageId.includes(interval)) ||
      (productId.includes(planTag) && productId.includes(interval)) ||
      (title.includes(planTag) && title.includes(interval))
    )
  );
}

export function getPackagesForPlan(offerings: PurchasesOfferings | null, plan: Exclude<PremiumPlan, "FREE">) {
  return (["monthly", "quarterly", "annual"] as const)
    .map((interval) => findPackageForPlan(offerings, plan, interval))
    .filter((pkg): pkg is PurchasesPackage => Boolean(pkg))
    .sort((left, right) => {
      const leftInterval = getPlanIntervalFromPackage(left) || "annual";
      const rightInterval = getPlanIntervalFromPackage(right) || "annual";
      return INTERVAL_ORDER[leftInterval] - INTERVAL_ORDER[rightInterval];
    });
}

export function findPackageForPlan(
  offerings: PurchasesOfferings | null,
  plan: Exclude<PremiumPlan, "FREE">,
  interval: PremiumPlanInterval = "monthly",
) {
  const packages = offerings?.current?.availablePackages || [];

  const exactMatch = packages.find((pkg) => packageMatchesPlanAndInterval(pkg, plan, interval));
  if (exactMatch) {
    return exactMatch;
  }

  if (interval === "monthly") {
    return (
      packages.find((pkg) => {
        const packageId = (pkg.identifier || "").toLowerCase();
        const productId = (pkg.product.identifier || "").toLowerCase();
        const title = (pkg.product.title || "").toLowerCase();
        const planTag = plan.toLowerCase();
        return packageId.includes(planTag) || productId.includes(planTag) || title.includes(planTag);
      }) || null
    );
  }

  return null;
}

export async function purchasePlanPackage(pkg: PurchasesPackage) {
  return Purchases.purchasePackage(pkg);
}

export async function restoreRevenueCatPurchases() {
  return Purchases.restorePurchases();
}

export function isPurchaseCancelled(error: unknown) {
  const purchasesError = error as PurchasesError | undefined;
  return (
    purchasesError?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
    purchasesError?.userCancelled === true
  );
}
