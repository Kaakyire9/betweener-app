import type { MembershipProductIds } from '@/lib/membership/offering-resolver';

export type RevenueCatPlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos';

type OptionalMembershipProductIds = {
  [Tier in keyof MembershipProductIds]: {
    [Interval in keyof MembershipProductIds[Tier]]: string | undefined;
  };
};

const SHARED_MEMBERSHIP_PRODUCTS: OptionalMembershipProductIds = {
  silver: {
    monthly: process.env.EXPO_PUBLIC_REVENUECAT_SILVER_MONTHLY_PRODUCT,
    quarterly: process.env.EXPO_PUBLIC_REVENUECAT_SILVER_QUARTERLY_PRODUCT,
    annual: process.env.EXPO_PUBLIC_REVENUECAT_SILVER_ANNUAL_PRODUCT,
  },
  gold: {
    monthly: process.env.EXPO_PUBLIC_REVENUECAT_GOLD_MONTHLY_PRODUCT,
    quarterly: process.env.EXPO_PUBLIC_REVENUECAT_GOLD_QUARTERLY_PRODUCT,
    annual: process.env.EXPO_PUBLIC_REVENUECAT_GOLD_ANNUAL_PRODUCT,
  },
};

export const REVENUECAT_ANDROID_PRODUCTS: OptionalMembershipProductIds = {
  silver: {
    monthly: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_MONTHLY_PRODUCT,
    quarterly: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_QUARTERLY_PRODUCT,
    annual: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_ANNUAL_PRODUCT,
  },
  gold: {
    monthly: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_GOLD_MONTHLY_PRODUCT,
    quarterly: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_GOLD_QUARTERLY_PRODUCT,
    annual: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_GOLD_ANNUAL_PRODUCT,
  },
};

const SHARED_LEGACY_PRODUCTS = {
  silver: process.env.EXPO_PUBLIC_REVENUECAT_SILVER_PRODUCT,
  gold: process.env.EXPO_PUBLIC_REVENUECAT_GOLD_PRODUCT,
} as const;

const ANDROID_LEGACY_PRODUCTS = {
  silver: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_PRODUCT,
  gold: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_GOLD_PRODUCT,
} as const;

const DEFAULT_PRODUCTS: MembershipProductIds = {
  silver: {
    monthly: 'silver.monthly',
    quarterly: 'silver.quarterly',
    annual: 'silver.annual',
  },
  gold: {
    monthly: 'gold.monthly',
    quarterly: 'gold.quarterly',
    annual: 'gold.annual',
  },
};

const normalizeProductId = (value: string | undefined, fallback: string) =>
  String(value || fallback).trim().toLowerCase();

export function resolveRevenueCatMembershipProducts(
  platform: RevenueCatPlatform,
  androidProducts: OptionalMembershipProductIds = REVENUECAT_ANDROID_PRODUCTS,
  sharedProducts: OptionalMembershipProductIds = SHARED_MEMBERSHIP_PRODUCTS,
): MembershipProductIds {
  const primary = platform === 'android' ? androidProducts : sharedProducts;

  return {
    silver: {
      monthly: normalizeProductId(
        primary.silver.monthly,
        normalizeProductId(sharedProducts.silver.monthly, DEFAULT_PRODUCTS.silver.monthly),
      ),
      quarterly: normalizeProductId(
        primary.silver.quarterly,
        normalizeProductId(sharedProducts.silver.quarterly, DEFAULT_PRODUCTS.silver.quarterly),
      ),
      annual: normalizeProductId(
        primary.silver.annual,
        normalizeProductId(sharedProducts.silver.annual, DEFAULT_PRODUCTS.silver.annual),
      ),
    },
    gold: {
      monthly: normalizeProductId(
        primary.gold.monthly,
        normalizeProductId(sharedProducts.gold.monthly, DEFAULT_PRODUCTS.gold.monthly),
      ),
      quarterly: normalizeProductId(
        primary.gold.quarterly,
        normalizeProductId(sharedProducts.gold.quarterly, DEFAULT_PRODUCTS.gold.quarterly),
      ),
      annual: normalizeProductId(
        primary.gold.annual,
        normalizeProductId(sharedProducts.gold.annual, DEFAULT_PRODUCTS.gold.annual),
      ),
    },
  };
}

export function resolveRevenueCatLegacyProductHints(platform: RevenueCatPlatform) {
  return {
    silver: normalizeProductId(
      platform === 'android' ? ANDROID_LEGACY_PRODUCTS.silver : SHARED_LEGACY_PRODUCTS.silver,
      normalizeProductId(SHARED_LEGACY_PRODUCTS.silver, 'silver'),
    ),
    gold: normalizeProductId(
      platform === 'android' ? ANDROID_LEGACY_PRODUCTS.gold : SHARED_LEGACY_PRODUCTS.gold,
      normalizeProductId(SHARED_LEGACY_PRODUCTS.gold, 'gold'),
    ),
  };
}
