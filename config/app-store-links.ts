import { APP_IDENTITY, type AppIdentity } from '@/config/app-identity';

type StorePlatform = 'ios' | 'android';

type AppStoreLinks = {
  ios: string;
  android: string;
  nativeIos: string | null;
  nativeAndroid: string;
};

const PRODUCTION_STORE_LINKS: AppStoreLinks = Object.freeze({
  ios: 'https://apps.apple.com/app/betweener/id6753134347',
  android: 'https://play.google.com/store/apps/details?id=com.aduboffour.betweener',
  nativeIos: 'itms-apps://apps.apple.com/app/id6753134347',
  nativeAndroid: 'market://details?id=com.aduboffour.betweener',
});

export const resolveAppStoreLinks = (
  identity: Pick<AppIdentity, 'variant' | 'bundleIdentifier' | 'webOrigin'>,
): AppStoreLinks => {
  if (identity.variant === 'production') return PRODUCTION_STORE_LINKS;

  return Object.freeze({
    // Betweener S is TestFlight-only. Until a tester-facing TestFlight URL is
    // configured remotely, use its isolated staging landing origin.
    ios: identity.webOrigin,
    android: `https://play.google.com/store/apps/details?id=${encodeURIComponent(identity.bundleIdentifier)}`,
    nativeIos: null,
    nativeAndroid: `market://details?id=${encodeURIComponent(identity.bundleIdentifier)}`,
  });
};

export const isAllowedAppStoreUrl = (
  value: string,
  platform: StorePlatform,
  identity: Pick<AppIdentity, 'variant' | 'bundleIdentifier' | 'webOrigin'> = APP_IDENTITY,
): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  if (identity.variant === 'production') {
    const expectedHost = platform === 'android' ? 'play.google.com' : 'apps.apple.com';
    return parsed.hostname === expectedHost;
  }

  if (platform === 'android') {
    return (
      parsed.hostname === 'play.google.com' &&
      parsed.pathname === '/store/apps/details' &&
      parsed.searchParams.get('id') === identity.bundleIdentifier
    );
  }

  const stagingOrigin = new URL(identity.webOrigin).origin;
  return parsed.origin === stagingOrigin || parsed.hostname === 'testflight.apple.com';
};

export const APP_STORE_LINKS = resolveAppStoreLinks(APP_IDENTITY);

export const resolveShareStoreLinks = (
  identity: Pick<AppIdentity, 'variant' | 'bundleIdentifier' | 'webOrigin'>,
) => {
  const storeLinks = resolveAppStoreLinks(identity);
  return Object.freeze({
    ios: identity.variant === 'production'
      ? 'https://apps.apple.com/gb/app/betweener/id6753134347'
      : storeLinks.ios,
    android: `${storeLinks.android}${storeLinks.android.includes('?') ? '&' : '?'}pcampaignid=web_share`,
  });
};

export const APP_SHARE_STORE_LINKS = resolveShareStoreLinks(APP_IDENTITY);
