import Purchases, {
  CustomerInfo,
  CustomerInfoUpdateListener,
  LogHandler,
  LOG_LEVEL,
  PurchasesOfferings,
  PurchasesPackage,
  PurchasesError,
  PURCHASES_ERROR_CODE,
} from "react-native-purchases";
import { Platform } from "react-native";
import { logger } from "@/lib/telemetry/logger";
import {
  resolveMembershipTier,
  type RevenueCatCustomerInfoLike,
} from "@/lib/membership/membership-resolver";
import {
  MEMBERSHIP_PACKAGE_IDS,
  resolveExactMembershipCatalog,
  resolveExactMembershipPackage,
} from "@/lib/membership/offering-resolver";
import {
  resolveRevenueCatLegacyProductHints,
  resolveRevenueCatMembershipProducts,
} from "@/lib/membership/revenuecat-product-config";
import { RevenueCatIdentitySession } from "@/lib/membership/revenuecat-identity-core";
import { requireEconomyAccountOwnership } from "@/lib/economy/account-ownership";
import { EconomyError } from "@/lib/economy/types";
import { clearClientFinancialState } from "@/lib/economy/financial-state-reset";

export type PremiumPlan = "FREE" | "SILVER" | "GOLD";
export type PremiumPlanInterval = "monthly" | "quarterly" | "annual";

type ConfigureArgs = {
  appUserID: string;
};

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || "";
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY || "";

type RevenueCatEventBridge = {
  registered: boolean;
  subscribers: Set<(customerInfo: CustomerInfo | null) => void>;
  customerInfoListener: CustomerInfoUpdateListener;
};

type RevenueCatGlobal = typeof globalThis & {
  __betweenerRevenueCatEventBridge?: RevenueCatEventBridge;
};

function hasBoundRevenueCatIdentity() {
  return Boolean(revenueCatIdentity.getBoundUserId());
}

const revenueCatGlobal = globalThis as RevenueCatGlobal;
const revenueCatEventBridge = revenueCatGlobal.__betweenerRevenueCatEventBridge ?? (() => {
  const subscribers = new Set<(customerInfo: CustomerInfo | null) => void>();
  const bridge: RevenueCatEventBridge = {
    registered: false,
    subscribers,
    customerInfoListener: (customerInfo) => {
      if (!hasBoundRevenueCatIdentity()) return;
      subscribers.forEach((listener) => listener(customerInfo));
    },
  };
  revenueCatGlobal.__betweenerRevenueCatEventBridge = bridge;
  return bridge;
})();

const revenueCatLogHandler: LogHandler = (level, message) => {
  if (__DEV__ && level === LOG_LEVEL.ERROR) {
    console.warn(`[RevenueCat] ${message}`);
  }
};

const SILVER_ENTITLEMENT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_ENTITLEMENT || "silver").toLowerCase();
const GOLD_ENTITLEMENT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_ENTITLEMENT || "gold").toLowerCase();
const SILVER_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_PACKAGE || "silver").toLowerCase();
const GOLD_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_PACKAGE || "gold").toLowerCase();
const PLATFORM_PRODUCT_IDS = resolveRevenueCatMembershipProducts(Platform.OS);
const LEGACY_PRODUCT_HINTS = resolveRevenueCatLegacyProductHints(Platform.OS);
const SILVER_PRODUCT_HINT = LEGACY_PRODUCT_HINTS.silver;
const GOLD_PRODUCT_HINT = LEGACY_PRODUCT_HINTS.gold;
const SILVER_MONTHLY_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_MONTHLY_PACKAGE || "silver_monthly").toLowerCase();
const SILVER_QUARTERLY_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_QUARTERLY_PACKAGE || "silver_quarterly").toLowerCase();
const SILVER_ANNUAL_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_SILVER_ANNUAL_PACKAGE || "silver_annual").toLowerCase();
const GOLD_MONTHLY_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_MONTHLY_PACKAGE || "gold_monthly").toLowerCase();
const GOLD_QUARTERLY_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_QUARTERLY_PACKAGE || "gold_quarterly").toLowerCase();
const GOLD_ANNUAL_PACKAGE_HINT = (process.env.EXPO_PUBLIC_REVENUECAT_GOLD_ANNUAL_PACKAGE || "gold_annual").toLowerCase();
const SILVER_MONTHLY_PRODUCT_HINT = PLATFORM_PRODUCT_IDS.silver.monthly;
const SILVER_QUARTERLY_PRODUCT_HINT = PLATFORM_PRODUCT_IDS.silver.quarterly;
const SILVER_ANNUAL_PRODUCT_HINT = PLATFORM_PRODUCT_IDS.silver.annual;
const GOLD_MONTHLY_PRODUCT_HINT = PLATFORM_PRODUCT_IDS.gold.monthly;
const GOLD_QUARTERLY_PRODUCT_HINT = PLATFORM_PRODUCT_IDS.gold.quarterly;
const GOLD_ANNUAL_PRODUCT_HINT = PLATFORM_PRODUCT_IDS.gold.annual;

const isProductionMembershipResolution = () =>
  String(process.env.EXPO_PUBLIC_ENVIRONMENT || "").trim().toLowerCase() === "production";

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

const revenueCatIdentity = new RevenueCatIdentitySession(
  {
    isConfigured: () => Purchases.isConfigured().catch(() => false),
    configure: (appUserId) => {
      Purchases.configure({ apiKey: getRevenueCatApiKey(), appUserID: appUserId });
    },
    getAppUserId: () => Purchases.getAppUserID().catch(() => null),
    logIn: (appUserId) => Purchases.logIn(appUserId),
    logOut: () => Purchases.logOut(),
  },
  (event) => {
    logger.info(
      event.type === "changed" ? "revenuecat.identity.changed" : `revenuecat.identity.${event.type}`,
      {
        succeeded: event.succeeded,
        reason: event.reason,
        accountChanged:
          Boolean(event.previousUserId) && event.previousUserId !== event.nextUserId,
      },
    );
  },
);

export const isRevenueCatConfiguredForPlatform = () => Boolean(getRevenueCatApiKey()) && Platform.OS !== "web";

function ensureRevenueCatEventBridge() {
  if (!isRevenueCatConfiguredForPlatform() || revenueCatEventBridge.registered) return;

  Purchases.setLogHandler(revenueCatLogHandler);
  Purchases.addCustomerInfoUpdateListener(revenueCatEventBridge.customerInfoListener);
  revenueCatEventBridge.registered = true;
}

export function subscribeToRevenueCatCustomerInfo(
  listener: (customerInfo: CustomerInfo | null) => void,
) {
  if (!isRevenueCatConfiguredForPlatform()) return () => {};

  ensureRevenueCatEventBridge();
  revenueCatEventBridge.subscribers.add(listener);
  return () => {
    revenueCatEventBridge.subscribers.delete(listener);
  };
}

const clearRevenueCatCustomerInfo = () => {
  revenueCatEventBridge.subscribers.forEach((listener) => listener(null));
};

export function blockRevenueCatIdentityAccess() {
  revenueCatIdentity.blockAccess();
  clearRevenueCatCustomerInfo();
  clearClientFinancialState();
}

export function detachRevenueCatIdentity(reason = "explicit_sign_out") {
  revenueCatIdentity.detach(reason);
  clearRevenueCatCustomerInfo();
  clearClientFinancialState();
}

/**
 * Terminal-only SDK identity reset. Normal sign-out must use detachRevenueCatIdentity so the
 * next authenticated UUID can transition directly through Purchases.logIn().
 */
export async function logOutRevenueCatIdentity(reason = "deleted_account_cleanup") {
  blockRevenueCatIdentityAccess();
  if (!isRevenueCatConfiguredForPlatform()) return { error: null };
  return revenueCatIdentity.clearSdkIdentity(reason);
}

export async function bindRevenueCatIdentity(appUserID: string) {
  if (!isRevenueCatConfiguredForPlatform()) return false;

  ensureRevenueCatEventBridge();
  if (revenueCatIdentity.getBoundUserId() !== appUserID) clearRevenueCatCustomerInfo();
  await revenueCatIdentity.bind(appUserID);
  return true;
}

export function canAccessRevenueCatForUser(appUserID: string) {
  return revenueCatIdentity.canAccessFor(appUserID);
}

export async function ensureRevenueCatConfigured({ appUserID }: ConfigureArgs) {
  return bindRevenueCatIdentity(appUserID);
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

  if (!isProductionMembershipResolution() && offerings) {
    resolveExactMembershipCatalog(offerings, PLATFORM_PRODUCT_IDS);
    logger.info("economy.config.loaded", { area: "membership_offering", environment: "staging" });
  }

  return {
    enabled: true,
    canMakePayments,
    offerings,
    customerInfo,
    currentPlan: derivePlanFromCustomerInfo(customerInfo),
  };
}

export function derivePlanFromCustomerInfo(customerInfo: CustomerInfo | null): PremiumPlan {
  const resolution = resolveMembershipTier(customerInfo as RevenueCatCustomerInfoLike | null, {
    allowLegacyProductFallback: isProductionMembershipResolution(),
    legacyProductHints: { silver: SILVER_PRODUCT_HINT, gold: GOLD_PRODUCT_HINT },
  });
  if (resolution.tier === "gold") return "GOLD";
  if (resolution.tier === "silver") return "SILVER";
  return "FREE";
}

function productMatchesPlan(productId: string | null | undefined, plan: Exclude<PremiumPlan, "FREE">) {
  const normalizedProductId = String(productId || "").toLowerCase();
  const planTag = plan.toLowerCase();
  const productHints = Object.values(PRODUCT_HINTS[plan]).flat();
  return (
    normalizedProductId.includes(planTag) ||
    productHints.some((hint) => Boolean(hint) && normalizedProductId.includes(hint))
  );
}

function entitlementMatchesPlan(
  entitlementId: string,
  productId: string | null | undefined,
  plan: Exclude<PremiumPlan, "FREE">,
) {
  const normalizedEntitlementId = entitlementId.toLowerCase();
  const entitlementHint = plan === "GOLD" ? GOLD_ENTITLEMENT : SILVER_ENTITLEMENT;
  return normalizedEntitlementId.includes(entitlementHint) || productMatchesPlan(productId, plan);
}

export function getPlanEndsAtFromCustomerInfo(customerInfo: CustomerInfo | null, plan: PremiumPlan) {
  if (!customerInfo || plan === "FREE") return null;

  if (!isProductionMembershipResolution()) {
    const entitlement = customerInfo.entitlements.active?.[plan.toLowerCase()];
    return entitlement?.isActive === false ? null : entitlement?.expirationDate ?? null;
  }

  const activeEntitlement = Object.entries(customerInfo.entitlements.active || {}).find(([entitlementId, entitlement]) => (
    entitlement.isActive && entitlementMatchesPlan(entitlementId, entitlement.productIdentifier, plan)
  ));
  if (activeEntitlement?.[1]?.expirationDate) {
    return activeEntitlement[1].expirationDate;
  }

  const activeProductId = (customerInfo.activeSubscriptions || []).find((productId) => productMatchesPlan(productId, plan));
  if (activeProductId) {
    return (
      customerInfo.subscriptionsByProductIdentifier?.[activeProductId]?.expiresDate ??
      customerInfo.allExpirationDates?.[activeProductId] ??
      null
    );
  }

  return derivePlanFromCustomerInfo(customerInfo) === plan ? customerInfo.latestExpirationDate : null;
}

export function getPlanIntervalFromPackage(pkg: PurchasesPackage): PremiumPlanInterval | null {
  const subscriptionPeriod = String(pkg.product.subscriptionPeriod || "").toUpperCase();
  const packageId = (pkg.identifier || "").toLowerCase();
  const productId = (pkg.product.identifier || "").toLowerCase();

  for (const tier of ["silver", "gold"] as const) {
    for (const interval of ["monthly", "quarterly", "annual"] as const) {
      if (packageId === MEMBERSHIP_PACKAGE_IDS[tier][interval]) return interval;
    }
  }

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
  if (!isProductionMembershipResolution()) {
    const tier = plan.toLowerCase() as "silver" | "gold";
    const catalog = resolveExactMembershipCatalog(offerings, PLATFORM_PRODUCT_IDS);
    return (["monthly", "quarterly", "annual"] as const).map((interval) => catalog[tier][interval]);
  }

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
  if (!isProductionMembershipResolution()) {
    return resolveExactMembershipPackage(
      offerings,
      plan.toLowerCase() as "silver" | "gold",
      interval,
      PLATFORM_PRODUCT_IDS[plan.toLowerCase() as "silver" | "gold"][interval],
    );
  }

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

export async function purchasePlanPackage(pkg: PurchasesPackage, appUserID: string) {
  await requireEconomyAccountOwnership(appUserID);
  const result = await Purchases.purchasePackage(pkg);
  await requireEconomyAccountOwnership(appUserID);
  return { currentPlan: derivePlanFromCustomerInfo(result.customerInfo) };
}

export async function restoreRevenueCatPurchases(appUserID: string) {
  await requireEconomyAccountOwnership(appUserID);
  const customerInfo = await Purchases.restorePurchases();
  await requireEconomyAccountOwnership(appUserID);
  return { currentPlan: derivePlanFromCustomerInfo(customerInfo) };
}

export function isPurchaseCancelled(error: unknown) {
  const purchasesError = error as PurchasesError | undefined;
  return (
    purchasesError?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
    purchasesError?.userCancelled === true
  );
}

export function getMembershipPurchaseErrorMessage(error: unknown) {
  if (error instanceof EconomyError && error.code === "ACCOUNT_PREPARATION_REQUIRED") {
    return error.message;
  }
  const purchasesError = error as PurchasesError | undefined;
  if (
    purchasesError?.code === PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR ||
    purchasesError?.code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR
  ) {
    return "This store receipt belongs to another Betweener account. Sign in to its original account or use a different store test account.";
  }
  if (purchasesError?.code === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
    return "Check your connection and try again.";
  }
  if (purchasesError?.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
    return "This purchase is pending approval in the App Store.";
  }
  if (purchasesError?.code === PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR) {
    return "Purchases are not allowed for this App Store account.";
  }
  return "Unable to complete this membership request right now.";
}
