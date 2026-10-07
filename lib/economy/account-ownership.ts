import Purchases from 'react-native-purchases';

import { supabase } from '@/lib/supabase';
import { assertIdentifiedAccountOwnership } from '@/lib/economy/account-ownership-core';

export {
  assertIdentifiedAccountOwnership,
  isAnonymousRevenueCatAppUserId,
} from '@/lib/economy/account-ownership-core';
export type { AccountOwnershipSnapshot } from '@/lib/economy/account-ownership-core';

export type AccountOwnershipAdapter = {
  getSupabaseUserId: () => Promise<string | null>;
  getRevenueCatAppUserId: () => Promise<string | null>;
};

const defaultAdapter: AccountOwnershipAdapter = {
  getSupabaseUserId: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.user.id ?? null;
  },
  getRevenueCatAppUserId: () => Purchases.getAppUserID().catch(() => null),
};

/** Required at every client economy mutation boundary, including future Spark spending. */
export async function requireEconomyAccountOwnership(
  expectedUserId: string,
  adapter: AccountOwnershipAdapter = defaultAdapter,
) {
  const [supabaseUserId, revenueCatAppUserId] = await Promise.all([
    adapter.getSupabaseUserId(),
    adapter.getRevenueCatAppUserId(),
  ]);
  return assertIdentifiedAccountOwnership({
    expectedUserId,
    supabaseUserId,
    revenueCatAppUserId,
  });
}
