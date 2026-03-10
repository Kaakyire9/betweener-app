import Purchases, {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
  PurchasesError,
  PURCHASES_ERROR_CODE,
} from "react-native-purchases";
import { Platform } from "react-native";

export type PremiumPlan = "FREE" | "SILVER" | "GOLD";

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

export function findPackageForPlan(offerings: PurchasesOfferings | null, plan: Exclude<PremiumPlan, "FREE">) {
  const packages = offerings?.current?.availablePackages || [];
  const packageHint = plan === "SILVER" ? SILVER_PACKAGE_HINT : GOLD_PACKAGE_HINT;
  const productHint = plan === "SILVER" ? SILVER_PRODUCT_HINT : GOLD_PRODUCT_HINT;

  return (
    packages.find((pkg) => {
      const packageId = (pkg.identifier || "").toLowerCase();
      const productId = (pkg.product.identifier || "").toLowerCase();
      const title = (pkg.product.title || "").toLowerCase();
      return (
        packageId.includes(packageHint) ||
        productId.includes(productHint) ||
        title.includes(plan.toLowerCase())
      );
    }) || null
  );
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
