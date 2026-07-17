export type GhanaCountryLockPolicy =
  | 'ghana_locked'
  | 'ghana_verification_pending_abroad'
  | 'ghana_unlocked_precise_abroad';

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
