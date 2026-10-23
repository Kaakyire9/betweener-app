const SERVER_MANAGED_PROFILE_FIELDS = new Set([
  'profile_completed',
  'identity_status',
  'onboarding_completed_at',
  'identity_finalized_at',
  'phone_number',
  'phone_verified',
]);

export const PROFILE_GUARD_SAFETY_CONTRACT_V1_2 = '1.2.0';

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

export const prepareProfileGuardInvocation = (updates: Record<string, unknown>) => {
  const write = prepareProfileGuardWrite(updates);
  return {
    functionName: write.completeOnboarding
      ? 'profile-onboarding-submit'
      : 'profile-guard-update',
    body: write.completeOnboarding
      ? { updates: write.updates, safety_contract_version: PROFILE_GUARD_SAFETY_CONTRACT_V1_2 }
      : {
          updates: write.updates,
          complete_onboarding: false,
          safety_contract_version: PROFILE_GUARD_SAFETY_CONTRACT_V1_2,
        },
  } as const;
};
