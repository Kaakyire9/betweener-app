import {
  blockRevenueCatIdentityAccess,
  detachRevenueCatIdentity,
  logOutRevenueCatIdentity,
} from '@/lib/subscriptions';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import {
  runAuthMonetizationTeardown,
  type SignOutScope,
} from '@/lib/auth/auth-monetization-lifecycle';

export async function signOutSupabaseSession(options?: {
  scope?: SignOutScope;
  reason?: string;
  clearRevenueCatSdkIdentity?: boolean;
}) {
  const reason = options?.reason ?? 'explicit_sign_out';
  detachRevenueCatIdentity(reason);
  const result = await runAuthMonetizationTeardown({
    blockRevenueCatAccess: blockRevenueCatIdentityAccess,
    revenueCatLogOut: options?.clearRevenueCatSdkIdentity
      ? () => logOutRevenueCatIdentity(reason)
      : undefined,
    supabaseSignOut: async () => {
      const response = options?.scope
        ? await supabase.auth.signOut({ scope: options.scope })
        : await supabase.auth.signOut();
      return { error: response.error ?? null };
    },
  });

  if (result.revenueCatError) {
    logger.warn('revenuecat.identity.logout', { succeeded: false, reason });
  }
  if (result.supabaseError) {
    logger.warn('[auth] supabase_sign_out_failed', { reason });
  }

  return result;
}
