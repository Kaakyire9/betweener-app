import { describe, expect, it } from '@jest/globals';

import {
  hasGhanaianProfileConnection,
  isGhanaianDiasporaProfile,
  resolveProfileOnboardingExperience,
  usesGhanaOnboardingExperience,
} from '@/lib/profile/onboarding-experience';

describe('profile onboarding experience', () => {
  it('uses the persisted route even when residence and origin differ', () => {
    expect(
      resolveProfileOnboardingExperience({
        onboarding_variant: 'ghana',
        current_country_code: 'GB',
        current_country: 'United Kingdom',
        origin_country_code: 'GH',
      }),
    ).toBe('ghana');
    expect(
      resolveProfileOnboardingExperience({
        onboarding_variant: 'global',
        origin_country_code: 'GH',
      }),
    ).toBe('global');
  });

  it('supports country-locked Ghana profiles created before the route marker existed', () => {
    expect(usesGhanaOnboardingExperience({ country_lock_policy: 'ghana_unlocked_precise_abroad' })).toBe(true);
  });

  it('does not confuse Ghana residence or heritage with the Ghana onboarding route', () => {
    expect(usesGhanaOnboardingExperience({ current_country_code: 'GH', current_country: 'Ghana' } as any)).toBe(false);
    expect(usesGhanaOnboardingExperience({ origin_country_code: 'GH', origin_country: 'Ghana' } as any)).toBe(false);
  });

  it('offers Ghanaian identity features to Ghana-origin Global profiles', () => {
    expect(
      hasGhanaianProfileConnection({
        onboarding_variant: 'global',
        origin_country_code: 'GH',
        current_country_code: 'GB',
      }),
    ).toBe(true);
  });

  it('shows diaspora positioning only when a Ghanaian member currently lives abroad', () => {
    expect(
      isGhanaianDiasporaProfile({
        origin_country: 'Ghana',
        current_country: 'United Kingdom',
      }),
    ).toBe(true);
    expect(
      isGhanaianDiasporaProfile({
        origin_country_code: 'GH',
        current_country_code: 'GH',
      }),
    ).toBe(false);
    expect(
      isGhanaianDiasporaProfile({
        current_country_code: 'GB',
        origin_country_code: 'NG',
      }),
    ).toBe(false);
  });
});
