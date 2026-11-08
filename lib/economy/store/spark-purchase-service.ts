import Purchases, {
  PURCHASES_ERROR_CODE,
  type PurchasesError,
  type PurchasesPackage,
} from 'react-native-purchases';

import { EconomyError, type EconomyErrorCode, type MembershipTier } from '@/lib/economy/types';
import type { SparkPurchaseState } from '@/lib/economy/wallet/spark-wallet-types';
import type { ResolvedSparkPackage } from '@/lib/economy/store/spark-store-service';
import { trackSparkEvent } from '@/lib/economy/spark-telemetry';
import { requireEconomyAccountOwnership } from '@/lib/economy/account-ownership';

export type SparkPurchaseAdapter = {
  purchasePackage: (pkg: PurchasesPackage) => Promise<unknown>;
};

const revenueCatPurchaseAdapter: SparkPurchaseAdapter = {
  purchasePackage: (pkg) => Purchases.purchasePackage(pkg),
};

export type SparkPurchaseResult = {
  status: 'success' | 'cancelled';
  storeCompleted: boolean;
  balanceRefreshPending: boolean;
  refreshedBalance: number | null;
  provedExpectedIncrease: boolean;
};

export const isSparkPurchaseCancellation = (error: unknown) => {
  const purchaseError = error as PurchasesError | undefined;
  return purchaseError?.userCancelled === true
    || purchaseError?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
};

export function mapSparkPurchaseError(error: unknown): EconomyError {
  if (error instanceof EconomyError) return error;
  const purchaseError = error as PurchasesError | undefined;
  if (
    purchaseError?.code === PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR
    || purchaseError?.code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR
  ) {
    return new EconomyError(
      'ACCOUNT_PREPARATION_REQUIRED',
      'This store receipt belongs to another Betweener account. Sign in to its original account or use a different store test account.',
    );
  }
  if (purchaseError?.code === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
    return new EconomyError('NETWORK_ERROR', 'Check your connection and try again.');
  }
  if (purchaseError?.code === PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR) {
    return new EconomyError('NOT_ELIGIBLE', 'Purchases are not allowed for this App Store account.');
  }
  if (purchaseError?.code === PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR) {
    return new EconomyError('CONFIGURATION_ERROR', 'This Spark pack is unavailable.');
  }
  return new EconomyError('REVENUECAT_UNAVAILABLE', 'The App Store could not complete this purchase.');
}

type PurchaseArgs = {
  appUserId: string;
  membershipTier: MembershipTier;
  pack: ResolvedSparkPackage;
  balanceBefore: number | null;
  isOnline: () => boolean;
  getActiveUserId: () => string | null;
  invalidateAndRefresh: () => Promise<number>;
  onState: (state: SparkPurchaseState) => void;
  adapter?: SparkPurchaseAdapter;
  requireAccountOwnership?: (expectedUserId: string) => Promise<unknown>;
};

const stateFor = (
  status: SparkPurchaseState['status'],
  pack: ResolvedSparkPackage,
  patch: Partial<SparkPurchaseState> = {},
): SparkPurchaseState => ({
  status,
  packageId: pack.packageId,
  sparkAmount: pack.amount,
  errorCode: null,
  storeCompleted: false,
  balanceRefreshPending: false,
  refreshedBalance: null,
  ...patch,
});

export async function executeSparkPurchase(args: PurchaseArgs): Promise<SparkPurchaseResult> {
  const adapter = args.adapter ?? revenueCatPurchaseAdapter;
  const requireAccountOwnership = args.requireAccountOwnership ?? requireEconomyAccountOwnership;
  const telemetry = { packageId: args.pack.packageId, sparkAmount: args.pack.amount, membershipTier: args.membershipTier };
  if (!args.isOnline()) throw new EconomyError('NETWORK_ERROR', 'Connect to the internet to buy Sparks.');
  if (args.getActiveUserId() !== args.appUserId) throw new EconomyError('ACCOUNT_MISMATCH', 'Your account changed.');
  await requireAccountOwnership(args.appUserId);

  args.onState(stateFor('purchasing', args.pack));
  trackSparkEvent('spark.purchase.started', telemetry);
  trackSparkEvent('spark_pack_purchase_started', telemetry);

  try {
    await adapter.purchasePackage(args.pack.revenueCatPackage);
  } catch (error) {
    if (isSparkPurchaseCancellation(error)) {
      args.onState(stateFor('cancelled', args.pack));
      trackSparkEvent('spark.purchase.cancelled', telemetry);
      trackSparkEvent('spark_pack_purchase_cancelled', telemetry);
      return {
        status: 'cancelled',
        storeCompleted: false,
        balanceRefreshPending: false,
        refreshedBalance: null,
        provedExpectedIncrease: false,
      };
    }
    const mapped = mapSparkPurchaseError(error);
    args.onState(stateFor('failed', args.pack, { errorCode: mapped.code }));
    trackSparkEvent('spark.purchase.failed', { ...telemetry, result: mapped.code });
    trackSparkEvent('spark_pack_purchase_failed', { ...telemetry, result: mapped.code });
    throw mapped;
  }

  args.onState(stateFor('verifying', args.pack, { storeCompleted: true }));
  trackSparkEvent('spark.purchase.store_completed', telemetry);
  try {
    if (args.getActiveUserId() !== args.appUserId) {
      throw new EconomyError('ACCOUNT_MISMATCH', 'The purchase completed for the previous account.');
    }
    await requireAccountOwnership(args.appUserId);
  } catch (error) {
    const mismatch = error instanceof EconomyError
      ? error
      : new EconomyError('ACCOUNT_PREPARATION_REQUIRED', 'We are preparing this account for purchases. Please try again.');
    args.onState(stateFor('failed', args.pack, { storeCompleted: true, errorCode: mismatch.code }));
    trackSparkEvent('spark.account_mismatch', { ...telemetry, result: mismatch.code });
    throw mismatch;
  }

  args.onState(stateFor('refreshing_balance', args.pack, { storeCompleted: true }));
  try {
    const refreshedBalance = await args.invalidateAndRefresh();
    if (args.getActiveUserId() !== args.appUserId) {
      throw new EconomyError('ACCOUNT_MISMATCH', 'The account changed while refreshing Sparks.');
    }
    const provedExpectedIncrease = args.balanceBefore !== null
      && refreshedBalance >= args.balanceBefore + args.pack.amount;
    args.onState(stateFor('success', args.pack, {
      storeCompleted: true,
      refreshedBalance,
    }));
    trackSparkEvent('spark.purchase.balance_refreshed', telemetry);
    trackSparkEvent('spark_pack_purchase_completed', telemetry);
    return {
      status: 'success',
      storeCompleted: true,
      balanceRefreshPending: false,
      refreshedBalance,
      provedExpectedIncrease,
    };
  } catch (error) {
    const code: EconomyErrorCode = error instanceof EconomyError ? error.code : 'REVENUECAT_UNAVAILABLE';
    if (code === 'ACCOUNT_MISMATCH' || code === 'ACCOUNT_PREPARATION_REQUIRED') {
      args.onState(stateFor('failed', args.pack, { storeCompleted: true, errorCode: code }));
      trackSparkEvent('spark.account_mismatch', { ...telemetry, result: code });
      throw error;
    }
    args.onState(stateFor('success', args.pack, {
      storeCompleted: true,
      balanceRefreshPending: true,
      errorCode: code,
    }));
    trackSparkEvent('spark.wallet.refresh_failed', { ...telemetry, result: code });
    trackSparkEvent('spark_wallet_refresh_failed', { ...telemetry, result: code });
    return {
      status: 'success',
      storeCompleted: true,
      balanceRefreshPending: true,
      refreshedBalance: null,
      provedExpectedIncrease: false,
    };
  }
}
