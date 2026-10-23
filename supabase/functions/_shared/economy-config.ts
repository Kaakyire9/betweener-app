declare const Deno: { env: { get(name: string): string | undefined } };

export type EconomyEnvironment = 'staging' | 'production';

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

export type RevenueCatV2Config = {
  projectId: string;
  secretApiKey: string;
};

export const getEconomyEnvironment = (): EconomyEnvironment => {
  const value = String(Deno.env.get('ENVIRONMENT') || '').trim().toLowerCase();
  if (value !== 'staging' && value !== 'production') {
    throw new Error('CONFIGURATION_ERROR: invalid economy environment');
  }
  return value;
};

export const getRevenueCatV2Config = (): RevenueCatV2Config => {
  const projectId = String(Deno.env.get('REVENUECAT_PROJECT_ID') || '').trim();
  const secretApiKey = String(Deno.env.get('REVENUECAT_V2_SECRET_API_KEY') || '').trim();
  if (!projectId || !secretApiKey) {
    throw new Error('CONFIGURATION_ERROR: RevenueCat V2 configuration is incomplete');
  }
  return { projectId, secretApiKey };
};

export async function requireEconomyFeature(
  service: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ error?: { message?: string } | null }> },
  flag: EconomyFeatureFlag,
  environment = getEconomyEnvironment(),
) {
  const { error } = await service.rpc('rpc_service_assert_economy_feature_enabled_v1', {
    p_environment: environment,
    p_flag_key: flag,
  });
  if (error) {
    const message = String(error.message || '');
    if (message.includes('economy_feature_disabled')) {
      throw new Error('FEATURE_DISABLED');
    }
    throw new Error('CONFIGURATION_ERROR');
  }
}
