import { describe, expect, it } from '@jest/globals';

import { resolveOnboardingVariant } from '@/lib/onboarding/onboarding-routing';

describe('post-auth onboarding routing', () => {
  it('uses the newly verified phone country over a stale explicit route', () => {
    expect(resolveOnboardingVariant({ explicitVariant: 'global', phoneCountryCode: 'GH' })).toBe('ghana');
    expect(resolveOnboardingVariant({ explicitVariant: 'ghana', phoneCountryCode: 'GB' })).toBe('global');
  });

  it('routes Ghana-locked and Ghana-profile accounts to Ghana onboarding', () => {
    expect(resolveOnboardingVariant({ countryLockPolicy: 'ghana_locked' })).toBe('ghana');
    expect(resolveOnboardingVariant({ currentCountryCode: 'GH' })).toBe('ghana');
    expect(resolveOnboardingVariant({ originCountry: 'Ghana' })).toBe('ghana');
  });

  it('does not leak a stored Ghana route into a fresh +44 signup', () => {
    expect(resolveOnboardingVariant({ storedVariant: 'ghana', phoneCountryCode: 'GB' })).toBe('global');
  });

  it('keeps explicit and persisted global choices out of Ghana routing', () => {
    expect(resolveOnboardingVariant({ storedVariant: 'global', originCountry: 'Ghana' })).toBe('global');
    expect(resolveOnboardingVariant({ profileVariant: 'global', countryLockPolicy: 'ghana_locked' })).toBe('global');
  });

  it('resumes an already persisted onboarding route even when the phone is diaspora', () => {
    expect(resolveOnboardingVariant({ profileVariant: 'ghana', phoneCountryCode: 'GB' })).toBe('ghana');
  });

  it('routes a Ghana phone to Ghana when no stronger preference exists', () => {
    expect(resolveOnboardingVariant({ phoneCountryCode: 'GH' })).toBe('ghana');
  });

  it('defaults unknown and non-Ghana accounts to global onboarding', () => {
    expect(resolveOnboardingVariant({})).toBe('global');
    expect(resolveOnboardingVariant({ phoneCountryCode: 'US' })).toBe('global');
  });
});
