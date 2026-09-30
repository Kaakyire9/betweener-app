import { DISABLED_ECONOMY_FEATURE_FLAGS, normalizeEconomyFeatureFlags } from '@/lib/economy/feature-flags';
import type { EconomyFeatureFlagState } from '@/lib/economy/feature-flags';
import { getEconomyEnvironment } from '@/lib/economy/environment';
import { supabase } from '@/lib/supabase';

type PublicEconomyConfigResponse = {
  environment?: string;
  flags?: { flag_key?: string | null; enabled?: boolean | null }[];
};

export async function loadPublicEconomyFeatureFlags(): Promise<EconomyFeatureFlagState> {
  // Phase C is explicitly staging-only. Production remains fail-closed even if remote
  // configuration is changed before a separately authorized rollout.
  if (getEconomyEnvironment() === 'production') return DISABLED_ECONOMY_FEATURE_FLAGS;

  const { data, error } = await supabase.functions.invoke<PublicEconomyConfigResponse>(
    'economy-public-config',
  );
  if (error || data?.environment !== 'staging') return DISABLED_ECONOMY_FEATURE_FLAGS;
  return normalizeEconomyFeatureFlags(data.flags);
}
