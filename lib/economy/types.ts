export type MembershipTier = 'free' | 'silver' | 'gold';

export type MembershipFeature =
  | 'base_discovery'
  | 'matching'
  | 'matched_messaging'
  | 'mutual_communication'
  | 'base_live_access'
  | 'limited_insights'
  | 'premium_profile_experience'
  | 'full_profile_insights'
  | 'advanced_filters'
  | 'enhanced_premium_access'
  | 'membership_spark_pricing'
  | 'gold_spark_pricing'
  | 'gold_match_night_included';

export type MembershipBenefits = {
  tier: MembershipTier;
  features: ReadonlySet<MembershipFeature>;
  monthlyMemberSparks: number;
  monthlyProfileBoostAllowance: number;
  firstEligibleMatchNightEntryIncluded: boolean;
};

export type EconomyActionCode =
  | 'MATCH_NIGHT_ENTRY'
  | 'MATCH_NIGHT_EXTRA_ROUND'
  | 'PROFILE_BOOST_30M'
  | 'SUPER_SPARK'
  | 'PREMIUM_DATE_DECK';

export type EconomyFeatureFlag =
  | 'spark_wallet_enabled'
  | 'spark_store_enabled'
  | 'member_spark_grants_enabled'
  | 'match_night_spark_entry_enabled'
  | 'match_night_extra_round_enabled'
  | 'profile_boost_spark_enabled'
  | 'super_spark_enabled'
  | 'premium_date_deck_enabled'
  | 'gold_match_night_included_enabled'
  | 'first_match_night_pass_enabled';

export type EconomyErrorCode =
  | 'AUTH_REQUIRED'
  | 'FEATURE_DISABLED'
  | 'ACTION_NOT_FOUND'
  | 'NOT_ELIGIBLE'
  | 'MODERATION_RESTRICTED'
  | 'PRICE_CHANGED'
  | 'PASS_ALREADY_USED'
  | 'ALREADY_FULFILLED'
  | 'INSUFFICIENT_SPARKS'
  | 'REVENUECAT_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'DEBIT_FAILED'
  | 'FULFILLMENT_FAILED'
  | 'COMPENSATION_PENDING'
  | 'ACCOUNT_MISMATCH'
  | 'CONFIGURATION_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export type SparkSpendStatus =
  | 'quoted'
  | 'pending'
  | 'debited'
  | 'fulfilled'
  | 'failed'
  | 'compensation_pending'
  | 'compensated';

export type SparkLedgerSource =
  | 'revenuecat'
  | 'membership_grant'
  | 'purchase'
  | 'spend'
  | 'compensation'
  | 'reconciliation';

export type SparkLedgerReason =
  | 'member_monthly_grant'
  | 'spark_pack_purchase'
  | 'economy_action_debit'
  | 'failed_fulfillment_compensation'
  | 'provider_reconciliation';

export type EconomyRule = {
  id: string;
  environment: 'staging' | 'production';
  actionCode: EconomyActionCode;
  membershipTier: MembershipTier;
  priceSparks: number;
  included: boolean;
  version: number;
};

export type EconomyQuote = {
  quoteId: string;
  actionCode: EconomyActionCode;
  membershipTier: MembershipTier;
  priceSparks: number;
  included: boolean;
  ruleVersion: number;
  expiresAt: string;
};

export type SparkWalletSnapshot = {
  appUserId: string;
  currencyCode: 'SPK';
  balance: number | null;
  status: SparkWalletStatus;
  isStale: boolean;
  fetchedAt: string | null;
  source: 'revenuecat' | 'revenuecat_cache' | null;
  errorCode: EconomyErrorCode | null;
};

export type SparkWalletStatus =
  | 'idle'
  | 'loading'
  | 'fresh'
  | 'stale'
  | 'offline'
  | 'error';

export type SparkPurchaseStatus =
  | 'idle'
  | 'confirming'
  | 'purchasing'
  | 'verifying'
  | 'refreshing_balance'
  | 'success'
  | 'cancelled'
  | 'failed';

export class EconomyError extends Error {
  readonly code: EconomyErrorCode;

  constructor(code: EconomyErrorCode, message: string) {
    super(message);
    this.name = 'EconomyError';
    this.code = code;
  }
}
