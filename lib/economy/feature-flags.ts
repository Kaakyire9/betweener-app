import type { EconomyFeatureFlag } from '@/lib/economy/types';

export const ECONOMY_FEATURE_FLAGS: readonly EconomyFeatureFlag[] = [
  'spark_wallet_enabled',
  'spark_store_enabled',
  'member_spark_grants_enabled',
  'match_night_spark_entry_enabled',
  'match_night_extra_round_enabled',
  'profile_boost_spark_enabled',
  'super_spark_enabled',
  'premium_date_deck_enabled',
  'gold_match_night_included_enabled',
  'first_match_night_pass_enabled',
] as const;

export type EconomyFeatureFlagState = Readonly<Record<EconomyFeatureFlag, boolean>>;

export const DISABLED_ECONOMY_FEATURE_FLAGS: EconomyFeatureFlagState = Object.freeze(
  Object.fromEntries(ECONOMY_FEATURE_FLAGS.map((flag) => [flag, false])),
) as EconomyFeatureFlagState;

export function normalizeEconomyFeatureFlags(
  rows: { flag_key?: string | null; enabled?: boolean | null }[] | null | undefined,
): EconomyFeatureFlagState {
  const next = { ...DISABLED_ECONOMY_FEATURE_FLAGS };
  for (const row of rows ?? []) {
    if (ECONOMY_FEATURE_FLAGS.includes(row.flag_key as EconomyFeatureFlag)) {
      next[row.flag_key as EconomyFeatureFlag] = row.enabled === true;
    }
  }
  return Object.freeze(next);
}
