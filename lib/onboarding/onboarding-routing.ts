import type { SignupOnboardingVariant } from '@/lib/signup-tracking';

type ResolveOnboardingVariantInput = {
  explicitVariant?: string | null;
  profileVariant?: string | null;
  storedVariant?: string | null;
  countryLockPolicy?: string | null;
  currentCountryCode?: string | null;
  currentCountry?: string | null;
  originCountryCode?: string | null;
  originCountry?: string | null;
  phoneCountryCode?: string | null;
};

const normalizeVariant = (value?: string | null): SignupOnboardingVariant | null => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'ghana' || normalized === 'global' ? normalized : null;
};

const isGhana = (code?: string | null, country?: string | null) =>
  String(code ?? '').trim().toUpperCase() === 'GH' ||
  String(country ?? '').trim().toLowerCase() === 'ghana';

export const resolveOnboardingVariant = ({
  explicitVariant,
  profileVariant,
  storedVariant,
  countryLockPolicy,
  currentCountryCode,
  currentCountry,
  originCountryCode,
  originCountry,
  phoneCountryCode,
}: ResolveOnboardingVariantInput): SignupOnboardingVariant => {
  const persisted = normalizeVariant(profileVariant);
  if (persisted) return persisted;

  // A server-owned Ghana policy is durable legacy evidence for an account
  // created before onboarding_variant was persisted.
  if (String(countryLockPolicy ?? '').trim().toLowerCase().startsWith('ghana_')) {
    return 'ghana';
  }

  // For a genuinely new profile, the newly verified phone country is the
  // authoritative route signal. Device storage and query params can be stale
  // after another account used this installation.
  const verifiedPhoneCountry = String(phoneCountryCode ?? '').trim().toUpperCase();
  if (verifiedPhoneCountry) {
    return verifiedPhoneCountry === 'GH' ? 'ghana' : 'global';
  }

  const explicit = normalizeVariant(explicitVariant);
  if (explicit) return explicit;

  const stored = normalizeVariant(storedVariant);
  if (stored) return stored;

  if (
    isGhana(currentCountryCode, currentCountry) ||
    isGhana(originCountryCode, originCountry)
  ) {
    return 'ghana';
  }

  return 'global';
};
