import { describe, expect, it } from '@jest/globals';

import { buildVerificationMethods, getVerificationSubmissionType } from '@/lib/verification/verification-methods';

describe('verification methods', () => {
  it('offers Ghana Card only to the Ghana onboarding experience', () => {
    const ghanaMethods = buildVerificationMethods(true);
    const globalMethods = buildVerificationMethods(false);
    const ghanaCard = ghanaMethods.find((method) => method.id === 'ghana_card');

    expect(ghanaCard).toBeDefined();
    expect(ghanaCard?.category).toBe('document');
    expect(ghanaCard && getVerificationSubmissionType(ghanaCard)).toBe('passport');
    expect(globalMethods.some((method) => method.id === 'ghana_card')).toBe(false);
  });

  it('keeps method identifiers unique in both experiences', () => {
    for (const methods of [buildVerificationMethods(true), buildVerificationMethods(false)]) {
      expect(new Set(methods.map((method) => method.id)).size).toBe(methods.length);
    }
  });
});
