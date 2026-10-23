import Purchases, {
  PRODUCT_CATEGORY,
  type PurchasesOffering,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';

import { EconomyError } from '@/lib/economy/types';
import { getEconomyEnvironment } from '@/lib/economy/environment';

export const SPARK_STORE_OFFERING_ID = 'spark_store' as const;

export const SPARK_PACKAGE_DEFINITIONS = Object.freeze([
  { packageId: 'sparks_100', amount: 100, label: 'Starter', stagingProductId: 'com.betweener.staging.sparks.100' },
  { packageId: 'sparks_550', amount: 550, label: 'Popular Starter+', stagingProductId: 'com.betweener.staging.sparks.550' },
  { packageId: 'sparks_1200', amount: 1200, label: 'Popular', stagingProductId: 'com.betweener.staging.sparks.1200' },
  { packageId: 'sparks_2600', amount: 2600, label: 'Best Value', stagingProductId: 'com.betweener.staging.sparks.2600' },
] as const);

export type SparkPackageId = typeof SPARK_PACKAGE_DEFINITIONS[number]['packageId'];

export type ResolvedSparkPackage = {
  packageId: SparkPackageId;
  amount: number;
  label: string;
  localizedPrice: string;
  price: number;
  currencyCode: string;
  revenueCatPackage: PurchasesPackage;
};

export type SparkStoreCatalog = {
  offeringId: typeof SPARK_STORE_OFFERING_ID;
  offering: PurchasesOffering;
  packages: ResolvedSparkPackage[];
};

function assertStagingProduct(pkg: PurchasesPackage, expectedProductId: string) {
  const productId = String(pkg.product.identifier || '');
  if (productId !== expectedProductId || !productId.startsWith('com.betweener.staging.sparks.')) {
    throw new EconomyError(
      'CONFIGURATION_ERROR',
      `Spark package ${pkg.identifier} is not mapped to the canonical staging product.`,
    );
  }
  if (
    pkg.product.productCategory
    && pkg.product.productCategory !== PRODUCT_CATEGORY.NON_SUBSCRIPTION
  ) {
    throw new EconomyError('CONFIGURATION_ERROR', `Spark package ${pkg.identifier} is not consumable.`);
  }
}

export function resolveExactSparkStore(offerings: PurchasesOfferings): SparkStoreCatalog {
  const offering = offerings?.all?.[SPARK_STORE_OFFERING_ID];
  if (!offering || offering.identifier !== SPARK_STORE_OFFERING_ID) {
    throw new EconomyError('CONFIGURATION_ERROR', 'The spark_store offering is unavailable.');
  }

  const packages = SPARK_PACKAGE_DEFINITIONS.map((definition) => {
    const matches = offering.availablePackages.filter(
      (candidate) => candidate.identifier === definition.packageId,
    );
    if (matches.length !== 1) {
      throw new EconomyError(
        'CONFIGURATION_ERROR',
        `Spark package ${definition.packageId} is missing or duplicated.`,
      );
    }
    const pkg = matches[0];
    if (getEconomyEnvironment() === 'staging') {
      assertStagingProduct(pkg, definition.stagingProductId);
    }
    if (!pkg.product.priceString || !Number.isFinite(pkg.product.price)) {
      throw new EconomyError('CONFIGURATION_ERROR', `Spark package ${definition.packageId} has no localized price.`);
    }
    return {
      packageId: definition.packageId,
      amount: definition.amount,
      label: definition.label,
      localizedPrice: pkg.product.priceString,
      price: pkg.product.price,
      currencyCode: pkg.product.currencyCode,
      revenueCatPackage: pkg,
    };
  });

  return { offeringId: SPARK_STORE_OFFERING_ID, offering, packages };
}

export async function loadSparkStoreCatalog() {
  return resolveExactSparkStore(await Purchases.getOfferings());
}
