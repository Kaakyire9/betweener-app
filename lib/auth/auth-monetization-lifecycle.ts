export type SignOutScope = 'local' | 'global' | 'others';

export type MonetizationSignOutResult = {
  supabaseError: unknown | null;
  revenueCatError: unknown | null;
};

export async function runAuthMonetizationTeardown(dependencies: {
  blockRevenueCatAccess: () => void;
  revenueCatLogOut?: () => Promise<{ error: unknown | null }>;
  supabaseSignOut: () => Promise<{ error: unknown | null }>;
}): Promise<MonetizationSignOutResult> {
  dependencies.blockRevenueCatAccess();

  const revenueCatResult = dependencies.revenueCatLogOut
    ? await dependencies.revenueCatLogOut().catch((error) => ({ error }))
    : { error: null };
  const supabaseResult = await dependencies.supabaseSignOut().catch((error) => ({ error }));

  return {
    revenueCatError: revenueCatResult.error ?? null,
    supabaseError: supabaseResult.error ?? null,
  };
}
