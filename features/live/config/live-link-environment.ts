export type LiveAppVariant = 'staging' | 'production';

export type LiveAppIdentity = {
  variant?: unknown;
  scheme?: unknown;
  webOrigin?: unknown;
};

export type LiveLinkEnvironment = {
  variant: LiveAppVariant;
  scheme: string;
  webOrigin: string;
};

const EXPECTED_LIVE_LINK_ENVIRONMENTS: Readonly<Record<LiveAppVariant, LiveLinkEnvironment>> = {
  staging: Object.freeze({
    variant: 'staging',
    scheme: 'betweenerstaging',
    webOrigin: 'https://staging.getbetweener.com',
  }),
  production: Object.freeze({
    variant: 'production',
    scheme: 'betweenerapp',
    webOrigin: 'https://getbetweener.com',
  }),
};

const normalize = (value: unknown): string => String(value ?? '').trim();

export const resolveLiveLinkEnvironment = (
  identity: LiveAppIdentity | null | undefined,
): LiveLinkEnvironment => {
  const variant = normalize(identity?.variant).toLowerCase();
  if (variant !== 'staging' && variant !== 'production') {
    throw new Error(`Unsupported Live app variant: ${variant || 'missing'}.`);
  }

  const expected = EXPECTED_LIVE_LINK_ENVIRONMENTS[variant];
  const scheme = normalize(identity?.scheme).toLowerCase();
  const webOrigin = normalize(identity?.webOrigin).replace(/\/+$/u, '').toLowerCase();

  if (scheme !== expected.scheme || webOrigin !== expected.webOrigin) {
    throw new Error(`Live link configuration does not match the ${variant} app identity.`);
  }

  return expected;
};

export const createLiveSessionLinks = (
  sessionId: string,
  identity: LiveAppIdentity | null | undefined,
) => {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) throw new Error('A Live session ID is required.');

  const environment = resolveLiveLinkEnvironment(identity);
  const encodedSessionId = encodeURIComponent(normalizedSessionId);
  return {
    deepLink: `${environment.scheme}://live/${encodedSessionId}`,
    webLink: `${environment.webOrigin}/live/${encodedSessionId}`,
  } as const;
};
