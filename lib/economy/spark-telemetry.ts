import type { MembershipTier, SparkWalletStatus } from '@/lib/economy/types';
import { logger } from '@/lib/telemetry/logger';

type SparkTelemetryContext = {
  packageId?: string | null;
  sparkAmount?: number | null;
  membershipTier?: MembershipTier | null;
  result?: string | null;
  walletStatus?: SparkWalletStatus | null;
  currencyCode?: string | null;
};

export function trackSparkEvent(event: string, context: SparkTelemetryContext = {}) {
  logger.info(event, {
    environment: String(process.env.EXPO_PUBLIC_ENVIRONMENT || 'unknown').toLowerCase(),
    package_id: context.packageId ?? undefined,
    spark_amount: context.sparkAmount ?? undefined,
    membership_tier: context.membershipTier ?? undefined,
    result: context.result ?? undefined,
    wallet_status: context.walletStatus ?? undefined,
    currency_code: context.currencyCode ?? undefined,
  });
}
