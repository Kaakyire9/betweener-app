export type ProfileOnboardingExperience = 'ghana' | 'global';

type OnboardingExperienceProfile = {
  onboarding_variant?: unknown;
  country_lock_policy?: unknown;
  current_country_code?: unknown;
  current_country?: unknown;
  origin_country_code?: unknown;
  origin_country?: unknown;
} | null | undefined;

const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();

const isGhana = (code: unknown, country: unknown) =>
  normalized(code) === 'gh' || normalized(country) === 'ghana';

export const resolveProfileOnboardingExperience = (
  profile: OnboardingExperienceProfile,
): ProfileOnboardingExperience => {
  const explicitVariant = normalized(profile?.onboarding_variant);
  if (explicitVariant === 'ghana' || explicitVariant === 'global') {
    return explicitVariant;
  }

  // This lock predates onboarding_variant and is the only durable legacy
  // signal that the Ghana-specific experience was intentionally assigned.
  if (normalized(profile?.country_lock_policy).startsWith('ghana_')) {
    return 'ghana';
  }

  return 'global';
};

export const usesGhanaOnboardingExperience = (profile: OnboardingExperienceProfile) =>
  resolveProfileOnboardingExperience(profile) === 'ghana';

/**
 * Audience eligibility is intentionally broader than the onboarding route.
 * A Ghanaian using Global onboarding is still entitled to Ghanaian identity
 * features when Ghana is recorded as their origin country.
 */
export const hasGhanaianProfileConnection = (profile: OnboardingExperienceProfile) =>
  usesGhanaOnboardingExperience(profile) ||
  isGhana(profile?.origin_country_code, profile?.origin_country);

export const isGhanaianDiasporaProfile = (profile: OnboardingExperienceProfile) => {
  if (!hasGhanaianProfileConnection(profile)) return false;

  const hasCurrentCountry = Boolean(
    normalized(profile?.current_country_code) || normalized(profile?.current_country),
  );
  return hasCurrentCountry && !isGhana(profile?.current_country_code, profile?.current_country);
};
