export type GhanaCountryLockPolicy =
  | 'ghana_locked'
  | 'ghana_verification_pending_abroad'
  | 'ghana_unlocked_precise_abroad';

export type GlobalCountryLockPolicy =
  | 'global_locked'
  | 'global_verified_precise';

export type ManagedCountryLockPolicy = GhanaCountryLockPolicy | GlobalCountryLockPolicy;

type CountryIntegrityProfile = {
  country_lock_policy?: unknown;
  onboarding_variant?: unknown;
  onboarding_completed_at?: unknown;
  profile_completed?: unknown;
  phone_number?: unknown;
  phone_verified?: unknown;
  current_country_code?: unknown;
} | null | undefined;

export const normalizeCountryLockPolicy = (value: unknown) =>
  String(value ?? '').trim().toLowerCase();

export const isGhanaCountryManagedPolicy = (
  value: unknown,
): value is GhanaCountryLockPolicy => {
  const policy = normalizeCountryLockPolicy(value);
  return policy === 'ghana_locked'
    || policy === 'ghana_verification_pending_abroad'
    || policy === 'ghana_unlocked_precise_abroad';
};

export const isGhanaCountryVerificationPending = (value: unknown) =>
  normalizeCountryLockPolicy(value) === 'ghana_verification_pending_abroad';

export const isGlobalCountryManagedPolicy = (
  value: unknown,
): value is GlobalCountryLockPolicy => {
  const policy = normalizeCountryLockPolicy(value);
  return policy === 'global_locked' || policy === 'global_verified_precise';
};

export const isCountryManagedPolicy = (
  value: unknown,
): value is ManagedCountryLockPolicy =>
  isGhanaCountryManagedPolicy(value) || isGlobalCountryManagedPolicy(value);

export const shouldManageProfileCountry = (profile: CountryIntegrityProfile) => {
  if (isCountryManagedPolicy(profile?.country_lock_policy)) return true;

  const variant = String(profile?.onboarding_variant ?? '').trim().toLowerCase();
  const phoneDigits = String(profile?.phone_number ?? '').replace(/\D/g, '');
  const countryCode = String(profile?.current_country_code ?? '').trim().toUpperCase();

  if (
    variant === 'ghana'
    && profile?.phone_verified === true
    && phoneDigits.startsWith('233')
  ) {
    return true;
  }

  return variant === 'global'
    && Boolean(profile?.profile_completed || profile?.onboarding_completed_at)
    && /^[A-Z]{2}$/.test(countryCode);
};

export const getGhanaCountryPolicyMessage = (value: unknown) => {
  const policy = normalizeCountryLockPolicy(value);
  if (policy === 'ghana_verification_pending_abroad') {
    return 'Your first move check is confirmed. Verify again after six hours to securely update your country.';
  }
  if (policy === 'ghana_unlocked_precise_abroad') {
    return 'Your current country is GPS-verified. Use precise location again if you move to another country.';
  }
  return 'Current country is protected as Ghana. If you move abroad, two precise checks will securely verify the change.';
};

export const getCountryPolicyMessage = (value: unknown) => {
  const policy = normalizeCountryLockPolicy(value);
  if (isGhanaCountryManagedPolicy(policy)) {
    return getGhanaCountryPolicyMessage(policy);
  }
  if (policy === 'global_verified_precise') {
    return 'Your current country is GPS-verified. Use precise location again if you move to another country.';
  }
  if (policy === 'global_locked') {
    return 'Your current country is protected. A precise location check is required to verify a move to another country.';
  }
  return '';
};
