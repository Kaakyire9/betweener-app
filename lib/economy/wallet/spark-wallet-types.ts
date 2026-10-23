import type {
  EconomyErrorCode,
  SparkPurchaseStatus,
  SparkWalletSnapshot,
} from '@/lib/economy/types';

export const SPARK_CURRENCY_CODE = 'SPK' as const;
export const SPARK_WALLET_TTL_MS = 45_000;

export type SparkWalletSource = SparkWalletSnapshot['source'];

export type SparkPurchaseState = {
  status: SparkPurchaseStatus;
  packageId: string | null;
  sparkAmount: number | null;
  errorCode: EconomyErrorCode | null;
  storeCompleted: boolean;
  balanceRefreshPending: boolean;
  refreshedBalance: number | null;
};

export const createEmptySparkWallet = (appUserId = ''): SparkWalletSnapshot => ({
  appUserId,
  currencyCode: SPARK_CURRENCY_CODE,
  balance: null,
  status: 'idle',
  isStale: false,
  fetchedAt: null,
  source: null,
  errorCode: null,
});

export const EMPTY_SPARK_PURCHASE_STATE: SparkPurchaseState = Object.freeze({
  status: 'idle',
  packageId: null,
  sparkAmount: null,
  errorCode: null,
  storeCompleted: false,
  balanceRefreshPending: false,
  refreshedBalance: null,
});

export const isSparkWalletStale = (
  snapshot: SparkWalletSnapshot,
  now = Date.now(),
  ttlMs = SPARK_WALLET_TTL_MS,
) => {
  if (snapshot.status !== 'fresh' || !snapshot.fetchedAt) return true;
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  return !Number.isFinite(fetchedAt) || now - fetchedAt >= ttlMs;
};
