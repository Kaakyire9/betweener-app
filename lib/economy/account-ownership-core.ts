import { EconomyError } from '@/lib/economy/types';

const REVENUECAT_ANONYMOUS_PREFIX = '$RCAnonymousID:';

export type AccountOwnershipSnapshot = {
  expectedUserId: string;
  supabaseUserId: string | null;
  revenueCatAppUserId: string | null;
};

export const isAnonymousRevenueCatAppUserId = (appUserId: string | null | undefined) =>
  String(appUserId || '').startsWith(REVENUECAT_ANONYMOUS_PREFIX);

export function assertIdentifiedAccountOwnership(snapshot: AccountOwnershipSnapshot) {
  const { expectedUserId, supabaseUserId, revenueCatAppUserId } = snapshot;
  if (
    !expectedUserId
    || !supabaseUserId
    || !revenueCatAppUserId
    || isAnonymousRevenueCatAppUserId(revenueCatAppUserId)
    || supabaseUserId !== expectedUserId
    || revenueCatAppUserId !== expectedUserId
  ) {
    throw new EconomyError(
      'ACCOUNT_PREPARATION_REQUIRED',
      'We are preparing this account for purchases. Please try again.',
    );
  }
  return { appUserId: expectedUserId } as const;
}
