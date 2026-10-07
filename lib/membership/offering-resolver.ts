import { EconomyError } from '@/lib/economy/types';
import type { MembershipTier } from '@/lib/economy/types';

export type MembershipInterval = 'monthly' | 'quarterly' | 'annual';
export type PaidMembershipTier = Exclude<MembershipTier, 'free'>;
export type SparkPackageId = 'sparks_100' | 'sparks_550' | 'sparks_1200' | 'sparks_2600';
export type MembershipProductIds = Record<
  PaidMembershipTier,
  Record<MembershipInterval, string>
>;

export type RevenueCatPackageLike = {
  identifier: string;
  product: { identifier: string };
};

export type RevenueCatOfferingLike<TPackage extends RevenueCatPackageLike = RevenueCatPackageLike> = {
  identifier?: string;
  availablePackages: TPackage[];
};

export type RevenueCatOfferingsLike<TPackage extends RevenueCatPackageLike = RevenueCatPackageLike> = {
  all?: Record<string, RevenueCatOfferingLike<TPackage>>;
  current?: RevenueCatOfferingLike<TPackage> | null;
};

export const MEMBERSHIP_OFFERING_ID = 'default' as const;
export const SPARK_OFFERING_ID = 'spark_store' as const;

export const MEMBERSHIP_PACKAGE_IDS = {
  silver: {
    monthly: 'silver_monthly',
    quarterly: 'silver_quarterly',
    annual: 'silver_annual',
  },
  gold: {
    monthly: 'gold_monthly',
    quarterly: 'gold_quarterly',
    annual: 'gold_annual',
  },
} as const;

export const SPARK_PACKAGE_IDS: readonly SparkPackageId[] = [
  'sparks_100',
  'sparks_550',
  'sparks_1200',
  'sparks_2600',
] as const;

export class MembershipConfigurationError extends EconomyError {
  readonly detail: string;

  constructor(detail: string) {
    super('CONFIGURATION_ERROR', 'Membership purchasing is temporarily unavailable.');
    this.name = 'MembershipConfigurationError';
    this.detail = detail;
  }
}

export function getExpectedMembershipProductId(
  tier: PaidMembershipTier,
  interval: MembershipInterval,
): string {
  const envName = `EXPO_PUBLIC_REVENUECAT_${tier.toUpperCase()}_${interval.toUpperCase()}_PRODUCT`;
  const value = String(({
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
  } as const)[tier][interval] ?? '').trim();
  if (!value) throw new MembershipConfigurationError(`missing_product_config:${envName}`);
  return value;
}

function getExactOffering<TPackage extends RevenueCatPackageLike>(
  offerings: RevenueCatOfferingsLike<TPackage> | null,
  offeringId: string,
): RevenueCatOfferingLike<TPackage> {
  const offering = offerings?.all?.[offeringId] ?? null;
  if (!offering) throw new MembershipConfigurationError(`missing_offering:${offeringId}`);
  if (offering.identifier && offering.identifier !== offeringId) {
    throw new MembershipConfigurationError(`wrong_offering:${offering.identifier}`);
  }
  return offering;
}

export function resolveExactMembershipPackage<TPackage extends RevenueCatPackageLike>(
  offerings: RevenueCatOfferingsLike<TPackage> | null,
  tier: PaidMembershipTier,
  interval: MembershipInterval,
  expectedProductIdOverride?: string,
): TPackage {
  const offering = getExactOffering(offerings, MEMBERSHIP_OFFERING_ID);
  const packageId = MEMBERSHIP_PACKAGE_IDS[tier][interval];
  const pkg = offering.availablePackages.find((candidate) => candidate.identifier === packageId);
  if (!pkg) throw new MembershipConfigurationError(`missing_package:${packageId}`);

  const expectedProductId = expectedProductIdOverride || getExpectedMembershipProductId(tier, interval);
  if (pkg.product.identifier !== expectedProductId) {
    throw new MembershipConfigurationError(
      `wrong_product:${packageId}:${pkg.product.identifier}`,
    );
  }
  return pkg;
}

export function resolveExactMembershipCatalog<TPackage extends RevenueCatPackageLike>(
  offerings: RevenueCatOfferingsLike<TPackage> | null,
  expectedProductIds?: MembershipProductIds,
): Record<PaidMembershipTier, Record<MembershipInterval, TPackage>> {
  return {
    silver: {
      monthly: resolveExactMembershipPackage(offerings, 'silver', 'monthly', expectedProductIds?.silver.monthly),
      quarterly: resolveExactMembershipPackage(offerings, 'silver', 'quarterly', expectedProductIds?.silver.quarterly),
      annual: resolveExactMembershipPackage(offerings, 'silver', 'annual', expectedProductIds?.silver.annual),
    },
    gold: {
      monthly: resolveExactMembershipPackage(offerings, 'gold', 'monthly', expectedProductIds?.gold.monthly),
      quarterly: resolveExactMembershipPackage(offerings, 'gold', 'quarterly', expectedProductIds?.gold.quarterly),
      annual: resolveExactMembershipPackage(offerings, 'gold', 'annual', expectedProductIds?.gold.annual),
    },
  };
}

export function resolveExactSparkCatalog<TPackage extends RevenueCatPackageLike>(
  offerings: RevenueCatOfferingsLike<TPackage> | null,
): Record<SparkPackageId, TPackage> {
  const offering = getExactOffering(offerings, SPARK_OFFERING_ID);
  return Object.fromEntries(
    SPARK_PACKAGE_IDS.map((packageId) => {
      const pkg = offering.availablePackages.find((candidate) => candidate.identifier === packageId);
      if (!pkg) throw new MembershipConfigurationError(`missing_package:${packageId}`);
      return [packageId, pkg];
    }),
  ) as Record<SparkPackageId, TPackage>;
}
