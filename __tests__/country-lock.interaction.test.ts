import { describe, expect, it } from '@jest/globals';

import {
  getGhanaCountryPolicyMessage,
  isGhanaCountryManagedPolicy,
  isGhanaCountryVerificationPending,
  normalizeCountryLockPolicy,
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

  it('provides clear copy for locked, pending and verified-abroad states', () => {
    expect(getGhanaCountryPolicyMessage('ghana_locked')).toContain('protected as Ghana');
    expect(isGhanaCountryVerificationPending('ghana_verification_pending_abroad')).toBe(true);
    expect(getGhanaCountryPolicyMessage('ghana_verification_pending_abroad')).toContain('six hours');
    expect(getGhanaCountryPolicyMessage('ghana_unlocked_precise_abroad')).toContain('GPS-verified');
  });
});
