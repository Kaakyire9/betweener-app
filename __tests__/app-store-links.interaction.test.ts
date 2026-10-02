import { describe, expect, it } from '@jest/globals';

import {
  isAllowedAppStoreUrl,
  resolveAppStoreLinks,
  resolveShareStoreLinks,
} from '@/config/app-store-links';

const productionIdentity = {
  variant: 'production' as const,
  bundleIdentifier: 'com.aduboffour.betweener',
  webOrigin: 'https://getbetweener.com',
};

const stagingIdentity = {
  variant: 'staging' as const,
  bundleIdentifier: 'com.aduboffour.betweener.staging',
  webOrigin: 'https://staging.getbetweener.com',
};

describe('variant-aware app store links', () => {
  it('preserves the existing production destinations exactly', () => {
    expect(resolveAppStoreLinks(productionIdentity)).toEqual({
      ios: 'https://apps.apple.com/app/betweener/id6753134347',
      android: 'https://play.google.com/store/apps/details?id=com.aduboffour.betweener',
      nativeIos: 'itms-apps://apps.apple.com/app/id6753134347',
      nativeAndroid: 'market://details?id=com.aduboffour.betweener',
    });
    expect(resolveShareStoreLinks(productionIdentity)).toEqual({
      ios: 'https://apps.apple.com/gb/app/betweener/id6753134347',
      android: 'https://play.google.com/store/apps/details?id=com.aduboffour.betweener&pcampaignid=web_share',
    });
  });

  it('keeps staging away from production store listings', () => {
    expect(resolveAppStoreLinks(stagingIdentity)).toEqual({
      ios: 'https://staging.getbetweener.com',
      android: 'https://play.google.com/store/apps/details?id=com.aduboffour.betweener.staging',
      nativeIos: null,
      nativeAndroid: 'market://details?id=com.aduboffour.betweener.staging',
    });
    expect(resolveShareStoreLinks(stagingIdentity)).toEqual({
      ios: 'https://staging.getbetweener.com',
      android: 'https://play.google.com/store/apps/details?id=com.aduboffour.betweener.staging&pcampaignid=web_share',
    });
    expect(isAllowedAppStoreUrl(
      'https://apps.apple.com/app/betweener/id6753134347',
      'ios',
      stagingIdentity,
    )).toBe(false);
    expect(isAllowedAppStoreUrl(
      'https://play.google.com/store/apps/details?id=com.aduboffour.betweener',
      'android',
      stagingIdentity,
    )).toBe(false);
  });

  it('accepts staging-owned destinations', () => {
    expect(isAllowedAppStoreUrl(
      'https://staging.getbetweener.com/download',
      'ios',
      stagingIdentity,
    )).toBe(true);
    expect(isAllowedAppStoreUrl(
      'https://testflight.apple.com/join/example',
      'ios',
      stagingIdentity,
    )).toBe(true);
    expect(isAllowedAppStoreUrl(
      'https://play.google.com/store/apps/details?id=com.aduboffour.betweener.staging',
      'android',
      stagingIdentity,
    )).toBe(true);
  });
});
