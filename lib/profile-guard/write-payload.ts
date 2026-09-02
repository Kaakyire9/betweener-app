const SERVER_MANAGED_PROFILE_FIELDS = new Set([
  'profile_completed',
  'identity_status',
  'onboarding_completed_at',
  'identity_finalized_at',
  'phone_number',
  'phone_verified',
]);

export const prepareProfileGuardWrite = (updates: Record<string, unknown>) => {
  const completeOnboarding = updates.profile_completed === true
    || updates.identity_status === 'active'
    || updates.onboarding_completed_at != null
    || updates.identity_finalized_at != null;

  return {
    updates: Object.fromEntries(
      Object.entries(updates).filter(([key]) => !SERVER_MANAGED_PROFILE_FIELDS.has(key)),
    ),
    completeOnboarding,
  };
};
