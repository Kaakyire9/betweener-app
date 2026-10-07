import type { PurchasesVirtualCurrencies } from '@revenuecat/purchases-typescript-internal';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type PurchasesError,
} from 'react-native-purchases';

import { EconomyError, type EconomyErrorCode, type SparkWalletSnapshot } from '@/lib/economy/types';
import { SPARK_CURRENCY_CODE } from '@/lib/economy/wallet/spark-wallet-types';

export type SparkWalletRevenueCatAdapter = {
  getVirtualCurrencies: () => Promise<PurchasesVirtualCurrencies>;
  getCachedVirtualCurrencies: () => Promise<PurchasesVirtualCurrencies | null>;
  invalidateVirtualCurrenciesCache: () => Promise<void>;
};

const revenueCatWalletAdapter: SparkWalletRevenueCatAdapter = {
  getVirtualCurrencies: () => Purchases.getVirtualCurrencies(),
  getCachedVirtualCurrencies: () => Purchases.getCachedVirtualCurrencies(),
  invalidateVirtualCurrenciesCache: () => Purchases.invalidateVirtualCurrenciesCache(),
};

export function mapSparkWalletError(error: unknown): EconomyError {
  if (error instanceof EconomyError) return error;
  const purchasesError = error as PurchasesError | undefined;
  const code = String(purchasesError?.code ?? '').toUpperCase();
  const message = String(purchasesError?.message ?? error ?? '').toLowerCase();

  if (
    code === String(PURCHASES_ERROR_CODE.NETWORK_ERROR).toUpperCase()
    || message.includes('network')
    || message.includes('offline')
    || message.includes('internet')
  ) {
    return new EconomyError('NETWORK_ERROR', 'The Sparks balance is unavailable while offline.');
  }
  if (message.includes('configuration') || message.includes('not configured')) {
    return new EconomyError('CONFIGURATION_ERROR', 'Sparks are not configured for this build.');
  }
  if (code || message.includes('revenuecat') || message.includes('purchases')) {
    return new EconomyError('REVENUECAT_UNAVAILABLE', 'Sparks are temporarily unavailable.');
  }
  return new EconomyError('UNKNOWN', 'Sparks are temporarily unavailable.');
}

export function extractSparkBalance(virtualCurrencies: PurchasesVirtualCurrencies): number {
  const spark = virtualCurrencies?.all?.[SPARK_CURRENCY_CODE];
  if (!spark || spark.code !== SPARK_CURRENCY_CODE || !Number.isFinite(spark.balance) || spark.balance < 0) {
    throw new EconomyError('CONFIGURATION_ERROR', 'RevenueCat did not return a valid SPK currency.');
  }
  return spark.balance;
}

function toSnapshot(
  appUserId: string,
  virtualCurrencies: PurchasesVirtualCurrencies,
  source: 'revenuecat' | 'revenuecat_cache',
): SparkWalletSnapshot {
  return {
    appUserId,
    currencyCode: SPARK_CURRENCY_CODE,
    balance: extractSparkBalance(virtualCurrencies),
    status: source === 'revenuecat' ? 'fresh' : 'stale',
    isStale: source !== 'revenuecat',
    fetchedAt: new Date().toISOString(),
    source,
    errorCode: null,
  };
}

export async function readCachedSparkWallet(
  appUserId: string,
  adapter: SparkWalletRevenueCatAdapter = revenueCatWalletAdapter,
) {
  try {
    const cached = await adapter.getCachedVirtualCurrencies();
    return cached ? toSnapshot(appUserId, cached, 'revenuecat_cache') : null;
  } catch (error) {
    throw mapSparkWalletError(error);
  }
}

export async function fetchFreshSparkWallet(
  appUserId: string,
  adapter: SparkWalletRevenueCatAdapter = revenueCatWalletAdapter,
) {
  try {
    return toSnapshot(appUserId, await adapter.getVirtualCurrencies(), 'revenuecat');
  } catch (error) {
    throw mapSparkWalletError(error);
  }
}

export async function invalidateSparkWalletCache(
  adapter: SparkWalletRevenueCatAdapter = revenueCatWalletAdapter,
) {
  try {
    await adapter.invalidateVirtualCurrenciesCache();
  } catch (error) {
    throw mapSparkWalletError(error);
  }
}

export const getEconomyErrorCode = (error: unknown): EconomyErrorCode =>
  mapSparkWalletError(error).code;
