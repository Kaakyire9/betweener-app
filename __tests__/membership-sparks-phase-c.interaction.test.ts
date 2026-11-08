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
import { resolvePremiumHeroVariant } from '@/lib/membership/premium-hero-variant';

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
    PRODUCT_ALREADY_PURCHASED_ERROR: 'PRODUCT_ALREADY_PURCHASED_ERROR',
    RECEIPT_ALREADY_IN_USE_ERROR: 'RECEIPT_ALREADY_IN_USE_ERROR',
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
      requireAccountOwnership: async () => ({ appUserId: 'user-a' }),
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
      requireAccountOwnership: async () => ({ appUserId: 'user-a' }),
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
      requireAccountOwnership: async () => ({ appUserId: 'user-a' }),
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
      requireAccountOwnership: async () => ({ appUserId: activeUserId }),
      invalidateAndRefresh: async () => 0,
      onState: () => undefined,
      adapter: {
        purchasePackage: async () => {
          activeUserId = 'user-b';
        },
      },
    })).rejects.toMatchObject({ code: 'ACCOUNT_MISMATCH' });
  });

  it('rechecks authoritative ownership after StoreKit returns', async () => {
    let ownershipChecks = 0;
    await expect(executeSparkPurchase({
      appUserId: 'user-a',
      membershipTier: 'free',
      pack,
      balanceBefore: 0,
      isOnline: () => true,
      getActiveUserId: () => 'user-a',
      requireAccountOwnership: async () => {
        ownershipChecks += 1;
        if (ownershipChecks > 1) {
          throw new EconomyError('ACCOUNT_PREPARATION_REQUIRED', 'Account preparation required.');
        }
      },
      invalidateAndRefresh: async () => 100,
      onState: () => undefined,
      adapter: { purchasePackage: async () => ({}) },
    })).rejects.toMatchObject({ code: 'ACCOUNT_PREPARATION_REQUIRED' });
    expect(ownershipChecks).toBe(2);
  });

  it('fails closed when strict restore policy rejects User B using User A receipt', async () => {
    const invalidateAndRefresh = jest.fn(async () => 100);
    await expect(executeSparkPurchase({
      appUserId: 'user-b',
      membershipTier: 'free',
      pack,
      balanceBefore: 0,
      isOnline: () => true,
      getActiveUserId: () => 'user-b',
      requireAccountOwnership: async () => ({ appUserId: 'user-b' }),
      invalidateAndRefresh,
      onState: () => undefined,
      adapter: {
        purchasePackage: async () => {
          throw { code: 'RECEIPT_ALREADY_IN_USE_ERROR' };
        },
      },
    })).rejects.toMatchObject({ code: 'ACCOUNT_PREPARATION_REQUIRED' });
    expect(invalidateAndRefresh).not.toHaveBeenCalled();
  });
});

describe('Phase C integration wiring', () => {
  const root = path.resolve(__dirname, '..');
  const premiumScreen = fs.readFileSync(path.join(root, 'app/premium-plans.tsx'), 'utf8');
  const walletProvider = fs.readFileSync(path.join(root, 'lib/economy/wallet/use-spark-wallet.tsx'), 'utf8');

  it('refreshes the RevenueCat wallet after membership purchase and restore', () => {
    expect(premiumScreen).toMatch(/reason:\s*['"]membership_purchase['"]/);
    expect(premiumScreen).toMatch(/reason:\s*['"]restore_purchases['"]/);
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

describe('Premium commerce hero personalization', () => {
  const root = path.resolve(__dirname, '..');

  it('shows the opposite-gender portrait for supported Betweener profiles', () => {
    expect(resolvePremiumHeroVariant('MALE')).toBe('woman');
    expect(resolvePremiumHeroVariant('female')).toBe('man');
  });

  it('uses branded artwork until a supported profile gender is available', () => {
    expect(resolvePremiumHeroVariant(null)).toBe('brand');
    expect(resolvePremiumHeroVariant('')).toBe('brand');
    expect(resolvePremiumHeroVariant('OTHER')).toBe('brand');
  });

  it('bundles portrait and emblem assets locally for offline rendering', () => {
    const heroArt = fs.readFileSync(path.join(root, 'components/economy/PremiumHeroArt.tsx'), 'utf8');
    const commerceVisuals = fs.readFileSync(path.join(root, 'components/economy/CommerceVisuals.tsx'), 'utf8');
    const assets = [
      'assets/images/premium/premium-hero-woman-v1.png',
      'assets/images/premium/premium-hero-man-v1.png',
      'assets/images/premium/betweener-glass-emblem-v1.png',
      'assets/images/premium/spark-glass-heart-v1.png',
    ];

    assets.forEach((asset) => expect(fs.existsSync(path.join(root, asset))).toBe(true));
    expect(heroArt).toContain("require('../../assets/images/premium/premium-hero-woman-v1.png')");
    expect(heroArt).toContain("require('../../assets/images/premium/premium-hero-man-v1.png')");
    expect(commerceVisuals).toContain("require('../../assets/images/premium/betweener-glass-emblem-v1.png')");
    expect(commerceVisuals).toContain("require('../../assets/images/premium/spark-glass-heart-v1.png')");
    expect(commerceVisuals).toContain('<SparkEmblem compact={compact} />');
    expect(heroArt).toContain('<CommerceEmblem />');
    expect(`${heroArt}\n${commerceVisuals}`).not.toMatch(/https?:\/\//);
  });

  it('keeps hero benefits in one compact row and defines a genuine light palette', () => {
    const premiumScreen = fs.readFileSync(path.join(root, 'app/premium-plans.tsx'), 'utf8');
    const commerceVisuals = fs.readFileSync(path.join(root, 'components/economy/CommerceVisuals.tsx'), 'utf8');

    expect(premiumScreen.match(/<CommercePill compact/g)).toHaveLength(3);
    expect(commerceVisuals).toContain('CommerceLightColors');
    expect(commerceVisuals).toContain("canvas: '#F7F0E6'");
    expect(commerceVisuals).toContain("text: '#073F3C'");
  });

  it('uses accessible ambient commerce motion without animating wallet authority', () => {
    const commerceVisuals = fs.readFileSync(path.join(root, 'components/economy/CommerceVisuals.tsx'), 'utf8');
    const heroArt = fs.readFileSync(path.join(root, 'components/economy/PremiumHeroArt.tsx'), 'utf8');
    const tierCard = fs.readFileSync(path.join(root, 'components/economy/MembershipTierCard.tsx'), 'utf8');

    expect(commerceVisuals).toContain('const reduceMotion = useReduceMotion()');
    expect(commerceVisuals).toContain('outerOrbit.value = withRepeat');
    expect(commerceVisuals).toContain('innerOrbit.value = withRepeat');
    expect(commerceVisuals).toContain('const sheenStyle = useAnimatedStyle');
    expect(heroArt).toContain('const portraitStyle = useAnimatedStyle');
    expect(tierCard).toContain('withSpring(selected ? 1 : 0');
    expect(commerceVisuals).not.toMatch(/balance\.value\s*=\s*with(?:Timing|Spring)/);
  });
});
