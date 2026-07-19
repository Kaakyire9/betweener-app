import { describe, expect, it } from '@jest/globals';

import {
  getCountryPolicyMessage,
  getGhanaCountryPolicyMessage,
  isCountryManagedPolicy,
  isGlobalCountryManagedPolicy,
  isGhanaCountryManagedPolicy,
  isGhanaCountryVerificationPending,
  normalizeCountryLockPolicy,
  shouldManageProfileCountry,
} from '@/lib/location/country-lock';

describe('Ghana country-lock presentation', () => {
  it('treats every server-owned Ghana state as managed', () => {
    expect(isGhanaCountryManagedPolicy('ghana_locked')).toBe(true);
    expect(isGhanaCountryManagedPolicy('ghana_verification_pending_abroad')).toBe(true);
    expect(isGhanaCountryManagedPolicy('ghana_unlocked_precise_abroad')).toBe(true);
    expect(isGhanaCountryManagedPolicy('none')).toBe(false);
  });

  it('normalizes persisted values without widening eligibility', () => {
    expect(normalizeCountryLockPolicy(' GHANA_LOCKED ')).toBe('ghana_locked');
    expect(isGhanaCountryManagedPolicy('global')).toBe(false);
    expect(isGhanaCountryManagedPolicy(null)).toBe(false);
  });

  it('treats completed global policy states as server managed', () => {
    expect(isGlobalCountryManagedPolicy('global_locked')).toBe(true);
    expect(isGlobalCountryManagedPolicy('global_verified_precise')).toBe(true);
    expect(isCountryManagedPolicy('global_locked')).toBe(true);
    expect(isCountryManagedPolicy('ghana_locked')).toBe(true);
    expect(isCountryManagedPolicy('none')).toBe(false);
  });

  it('closes the UI race before the server policy refresh arrives', () => {
    expect(shouldManageProfileCountry({
      onboarding_variant: 'ghana',
      phone_verified: true,
      phone_number: '+233 24 000 0000',
      current_country_code: 'GH',
    })).toBe(true);
    expect(shouldManageProfileCountry({
      onboarding_variant: 'global',
      profile_completed: true,
      current_country_code: 'GB',
    })).toBe(true);
    expect(shouldManageProfileCountry({
      onboarding_variant: 'ghana',
      phone_verified: true,
      phone_number: '+44 7700 900000',
      current_country_code: 'GH',
    })).toBe(false);
  });

  it('provides clear copy for locked, pending and verified-abroad states', () => {
    expect(getGhanaCountryPolicyMessage('ghana_locked')).toContain('protected as Ghana');
    expect(isGhanaCountryVerificationPending('ghana_verification_pending_abroad')).toBe(true);
    expect(getGhanaCountryPolicyMessage('ghana_verification_pending_abroad')).toContain('six hours');
    expect(getGhanaCountryPolicyMessage('ghana_unlocked_precise_abroad')).toContain('GPS-verified');
    expect(getCountryPolicyMessage('global_locked')).toContain('precise location');
    expect(getCountryPolicyMessage('global_verified_precise')).toContain('GPS-verified');
  });
});
