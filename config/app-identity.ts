import Constants from 'expo-constants';

type AppVariant = 'production' | 'staging';

export type AppIdentity = {
  variant: AppVariant;
  name: string;
  scheme: string;
  bundleIdentifier: string;
  webOrigin: string;
};

const PRODUCTION_IDENTITY: AppIdentity = {
  variant: 'production',
  name: 'Betweener',
  scheme: 'betweenerapp',
  bundleIdentifier: 'com.aduboffour.betweener',
  webOrigin: 'https://getbetweener.com',
};

const configuredIdentity = Constants.expoConfig?.extra?.appIdentity as Partial<AppIdentity> | undefined;

const normalizeWebOrigin = (value: unknown) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return PRODUCTION_IDENTITY.webOrigin;

  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return PRODUCTION_IDENTITY.webOrigin;
  }
};

export const APP_IDENTITY: AppIdentity = Object.freeze({
  variant: configuredIdentity?.variant === 'staging' ? 'staging' : 'production',
  name: configuredIdentity?.name?.trim() || PRODUCTION_IDENTITY.name,
  scheme: configuredIdentity?.scheme?.trim().toLowerCase() || PRODUCTION_IDENTITY.scheme,
  bundleIdentifier:
    configuredIdentity?.bundleIdentifier?.trim() || PRODUCTION_IDENTITY.bundleIdentifier,
  webOrigin: normalizeWebOrigin(configuredIdentity?.webOrigin),
});

export const APP_VARIANT = APP_IDENTITY.variant;
export const APP_SCHEME = APP_IDENTITY.scheme;
export const APP_WEB_ORIGIN = APP_IDENTITY.webOrigin;
export const APP_AUTH_CALLBACK_URL = `${APP_SCHEME}://auth/callback`;
export const APP_WEB_AUTH_CALLBACK_URL = `${APP_WEB_ORIGIN}/auth/callback`;

export const buildAppUrl = (path: string) => {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return `${APP_SCHEME}://${normalizedPath}`;
};

export const buildWebUrl = (path: string) => {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return `${APP_WEB_ORIGIN}/${normalizedPath}`;
};
