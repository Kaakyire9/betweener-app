import { afterEach, describe, expect, it } from '@jest/globals';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('EAS platform profile guard', () => {
  it.each([
    ['playInternal', 'staging', 'staging'],
    ['playStaging', 'staging', 'staging'],
    ['playVerification', 'production', 'production'],
  ])('rejects iOS builds using %s', (profile, variant, environment) => {
    process.env.EAS_BUILD = 'true';
    process.env.EAS_BUILD_PLATFORM = 'ios';
    process.env.EAS_BUILD_PROFILE = profile;
    process.env.APP_VARIANT = variant;
    process.env.EXPO_PUBLIC_ENVIRONMENT = environment;

    const configure = require('../app.config.js');
    const appJson = require('../app.json');

    expect(() => configure({ config: appJson.expo })).toThrow(
      `[app-config] Build profile ${profile} is Android-only and cannot produce an iOS build.`,
    );
  });

  it('defines playStaging as a staging Play Store app bundle using the preview environment', () => {
    const eas = require('../eas.json');

    expect(eas.build.playStaging).toEqual(expect.objectContaining({
      distribution: 'store',
      environment: 'preview',
      android: { buildType: 'app-bundle' },
      env: expect.objectContaining({ APP_VARIANT: 'staging' }),
    }));
  });
});
