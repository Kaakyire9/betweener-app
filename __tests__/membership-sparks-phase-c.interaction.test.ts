import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import { EconomyError } from '@/lib/economy/types';
import {
  SPARK_PACKAGE_DEFINITIONS,
  SPARK_STORE_OFFERING_ID,
  resolveExactSparkStore,
  type ResolvedSparkPackage,
} from '@/lib/economy/store/spark-store-service';
import { executeSparkPurchase } from '@/lib/economy/store/spark-purchase-service';
import {
  extractSparkBalance,
  fetchFreshSparkWallet,
  readCachedSparkWallet,
  type SparkWalletRevenueCatAdapter,
} from '@/lib/economy/wallet/spark-wallet-service';
import { SparkWalletStore } from '@/lib/economy/wallet/spark-wallet-store';
import { createEmptySparkWallet, isSparkWalletStale } from '@/lib/economy/wallet/spark-wallet-types';

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getOfferings: jest.fn(),
    getVirtualCurrencies: jest.fn(),
    getCachedVirtualCurrencies: jest.fn(),
    invalidateVirtualCurrenciesCache: jest.fn(),
    purchasePackage: jest.fn(),
  },
  PRODUCT_CATEGORY: { NON_SUBSCRIPTION: 'NON_SUBSCRIPTION' },
  PURCHASES_ERROR_CODE: {
    NETWORK_ERROR: 'NETWORK_ERROR',
    PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR',
    PURCHASE_NOT_ALLOWED_ERROR: 'PURCHASE_NOT_ALLOWED_ERROR',
    PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: 'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR',
  },
}));

jest.mock('@/lib/economy/spark-telemetry', () => ({
  trackSparkEvent: jest.fn(),
}));

const virtualCurrencies = (balance: number) => ({
  all: {
    SPK: {
      balance,
      name: 'Sparks',
      code: 'SPK',
      serverDescription: null,
    },
  },
});

const makePackage = (packageId: string, productId: string, price = 0.99) => ({
  identifier: packageId,
  packageType: 'CUSTOM',
  offeringIdentifier: SPARK_STORE_OFFERING_ID,
  presentedOfferingContext: {
    offeringIdentifier: SPARK_STORE_OFFERING_ID,
    placementIdentifier: null,
    targetingContext: null,
  },
  webCheckoutUrl: null,
  product: {
    identifier: productId,
    description: `${packageId} description`,
    title: packageId,
    price,
    priceString: `£${price.toFixed(2)}`,
    pricePerWeek: null,
    pricePerMonth: null,
    pricePerYear: null,
    pricePerWeekString: null,
    pricePerMonthString: null,
    pricePerYearString: null,
    currencyCode: 'GBP',
    introPrice: null,
    discounts: null,
    productCategory: 'NON_SUBSCRIPTION',
    productType: 'CONSUMABLE',
    subscriptionPeriod: null,
    defaultOption: null,
    subscriptionOptions: null,
    presentedOfferingIdentifier: SPARK_STORE_OFFERING_ID,
    presentedOfferingContext: {
      offeringIdentifier: SPARK_STORE_OFFERING_ID,
      placementIdentifier: null,
      targetingContext: null,
    },
  },
}) as any;

const makeOfferings = (packages = SPARK_PACKAGE_DEFINITIONS.map((definition, index) =>
  makePackage(definition.packageId, definition.stagingProductId, 0.99 + index * 2))) => ({
    current: null,
    all: {
      [SPARK_STORE_OFFERING_ID]: {
        identifier: SPARK_STORE_OFFERING_ID,
        serverDescription: 'Sparks',
        metadata: {},
        availablePackages: packages,
        lifetime: null,
        annual: null,
        sixMonth: null,
        threeMonth: null,
        twoMonth: null,
        monthly: null,
        weekly: null,
        webCheckoutUrl: null,
      },
    },
  } as any);

describe('Phase C RevenueCat wallet adapter', () => {
  it('extracts SPK and rejects a missing currency instead of rendering zero', () => {
    expect(extractSparkBalance(virtualCurrencies(150))).toBe(150);
    expect(() => extractSparkBalance({ all: {} })).toThrow(EconomyError);
  });

  it('returns stale cached state followed by a fresh authoritative state', async () => {
    const adapter: SparkWalletRevenueCatAdapter = {
      getCachedVirtualCurrencies: async () => virtualCurrencies(150),
      getVirtualCurrencies: async () => virtualCurrencies(250),
      invalidateVirtualCurrenciesCache: async () => undefined,
    };
    const cached = await readCachedSparkWallet('user-a', adapter);
    expect(cached).toMatchObject({ balance: 150, status: 'stale', isStale: true, source: 'revenuecat_cache' });
    const fresh = await fetchFreshSparkWallet('user-a', adapter);
    expect(fresh).toMatchObject({ balance: 250, status: 'fresh', isStale: false, source: 'revenuecat' });
    expect(isSparkWalletStale(fresh, Date.parse(fresh.fetchedAt!) + 46_000)).toBe(true);
  });

  it('preserves a cached balance while explicitly marking offline state', () => {
    const store = new SparkWalletStore();
    const version = store.switchIdentity('user-a');
    store.accept({
      ...createEmptySparkWallet('user-a'),
      balance: 150,
      status: 'stale',
      isStale: true,
      source: 'revenuecat_cache',
      fetchedAt: new Date().toISOString(),
    }, version);
    store.markUnavailable('user-a', version, 'offline', 'NETWORK_ERROR');
    expect(store.getSnapshot()).toMatchObject({ balance: 150, status: 'offline', isStale: true });
  });

  it('clears User A synchronously and rejects late snapshots after switching to User B', () => {
    const store = new SparkWalletStore();
    const userAVersion = store.switchIdentity('user-a');
    const userASnapshot = {
      ...createEmptySparkWallet('user-a'),
      balance: 150,
      status: 'fresh' as const,
      source: 'revenuecat' as const,
      fetchedAt: new Date().toISOString(),
    };
    expect(store.accept(userASnapshot, userAVersion)).toBe(true);
    const userBVersion = store.switchIdentity('user-b');
    expect(store.getSnapshot()).toEqual(createEmptySparkWallet('user-b'));
    expect(store.accept(userASnapshot, userAVersion)).toBe(false);
    expect(store.getSnapshot().appUserId).toBe('user-b');
    expect(store.getSnapshot().balance).toBeNull();
    expect(userBVersion).toBeGreaterThan(userAVersion);
  });
});

describe('Phase C exact Spark Store catalog', () => {
  const previousEnvironment = process.env.EXPO_PUBLIC_ENVIRONMENT;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ENVIRONMENT = 'staging';
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_ENVIRONMENT = previousEnvironment;
  });

  it('resolves spark_store and all four exact packages in canonical order', () => {
    const catalog = resolveExactSparkStore(makeOfferings());
    expect(catalog.offeringId).toBe('spark_store');
    expect(catalog.packages.map((pack) => pack.packageId)).toEqual([
      'sparks_100',
      'sparks_550',
      'sparks_1200',
      'sparks_2600',
    ]);
    expect(catalog.packages.map((pack) => pack.amount)).toEqual([100, 550, 1200, 2600]);
    expect(catalog.packages.every((pack) => pack.localizedPrice.startsWith('£'))).toBe(true);
  });

  it('fails closed for a missing package', () => {
    expect(() => resolveExactSparkStore(makeOfferings(
      SPARK_PACKAGE_DEFINITIONS.slice(0, 3).map((definition) =>
        makePackage(definition.packageId, definition.stagingProductId)),
    ))).toThrow(EconomyError);
  });

  it('rejects a production Spark product inside staging', () => {
    const packages = SPARK_PACKAGE_DEFINITIONS.map((definition) =>
      makePackage(
        definition.packageId,
        definition.packageId === 'sparks_100'
          ? 'com.betweener.sparks.100'
          : definition.stagingProductId,
      ));
    expect(() => resolveExactSparkStore(makeOfferings(packages))).toThrow(EconomyError);
  });
});

describe('Phase C Spark purchase lifecycle', () => {
  const pack: ResolvedSparkPackage = {
    packageId: 'sparks_100',
    amount: 100,
    label: 'Starter',
    localizedPrice: '£0.99',
    price: 0.99,
    currencyCode: 'GBP',
    revenueCatPackage: makePackage('sparks_100', 'com.betweener.staging.sparks.100'),
  };

  it('purchases the exact package then waits for authoritative refreshed balance', async () => {
    const states: string[] = [];
    const purchasePackage = jest.fn(async (_package: unknown) => ({}));
    const invalidateAndRefresh = jest.fn(async () => 250);
    const result = await executeSparkPurchase({
      appUserId: 'user-a',
      membershipTier: 'silver',
      pack,
      balanceBefore: 150,
      isOnline: () => true,
      getActiveUserId: () => 'user-a',
      invalidateAndRefresh,
      onState: (state) => states.push(state.status),
      adapter: { purchasePackage },
    });
    expect(purchasePackage).toHaveBeenCalledWith(pack.revenueCatPackage);
    expect(invalidateAndRefresh).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['purchasing', 'verifying', 'refreshing_balance', 'success']);
    expect(result).toMatchObject({ storeCompleted: true, refreshedBalance: 250, provedExpectedIncrease: true });
  });

  it('treats cancellation as non-failure', async () => {
    const states: string[] = [];
    const result = await executeSparkPurchase({
      appUserId: 'user-a',
      membershipTier: 'free',
      pack,
      balanceBefore: 0,
      isOnline: () => true,
      getActiveUserId: () => 'user-a',
      invalidateAndRefresh: async () => 0,
      onState: (state) => states.push(state.status),
      adapter: {
        purchasePackage: async () => {
          throw { userCancelled: true };
        },
      },
    });
    expect(states).toEqual(['purchasing', 'cancelled']);
    expect(result.status).toBe('cancelled');
  });

  it('retains store success when the balance refresh temporarily fails', async () => {
    const snapshots: any[] = [];
    const result = await executeSparkPurchase({
      appUserId: 'user-a',
      membershipTier: 'gold',
      pack,
      balanceBefore: 150,
      isOnline: () => true,
      getActiveUserId: () => 'user-a',
      invalidateAndRefresh: async () => {
        throw new Error('network');
      },
      onState: (state) => snapshots.push(state),
      adapter: { purchasePackage: async () => ({}) },
    });
    expect(result).toMatchObject({ status: 'success', storeCompleted: true, balanceRefreshPending: true });
    expect(snapshots.at(-1)).toMatchObject({ status: 'success', storeCompleted: true, balanceRefreshPending: true });
  });

  it('stops the old account result when identity changes after StoreKit completes', async () => {
    let activeUserId = 'user-a';
    await expect(executeSparkPurchase({
      appUserId: 'user-a',
      membershipTier: 'silver',
      pack,
      balanceBefore: 150,
      isOnline: () => true,
      getActiveUserId: () => activeUserId,
      invalidateAndRefresh: async () => 0,
      onState: () => undefined,
      adapter: {
        purchasePackage: async () => {
          activeUserId = 'user-b';
        },
      },
    })).rejects.toMatchObject({ code: 'ACCOUNT_MISMATCH' });
  });
});

describe('Phase C integration wiring', () => {
  const root = path.resolve(__dirname, '..');
  const premiumScreen = fs.readFileSync(path.join(root, 'app/premium-plans.tsx'), 'utf8');
  const walletProvider = fs.readFileSync(path.join(root, 'lib/economy/wallet/use-spark-wallet.tsx'), 'utf8');

  it('refreshes the RevenueCat wallet after membership purchase and restore', () => {
    expect(premiumScreen).toContain('reason: "membership_purchase"');
    expect(premiumScreen).toContain('reason: "restore_purchases"');
    expect(premiumScreen).not.toMatch(/balance\s*\+=/);
  });

  it('invalidates RevenueCat virtual currency cache after a Spark purchase', () => {
    expect(walletProvider).toContain("refresh({ invalidate: true, reason: 'spark_purchase' })");
    expect(walletProvider).toContain('invalidateSparkWalletCache');
  });

  it('does not reference server RevenueCat secrets from client economy code', () => {
    const clientSources = [
      'lib/economy/wallet/spark-wallet-service.ts',
      'lib/economy/wallet/use-spark-wallet.tsx',
      'lib/economy/store/spark-store-service.ts',
      'lib/economy/store/spark-purchase-service.ts',
    ].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    expect(clientSources).not.toContain('REVENUECAT_V2_SECRET_API_KEY');
    expect(clientSources).not.toContain('REVENUECAT_SECRET_API_KEY');
    expect(clientSources).not.toContain('spark-spend');
  });
});
