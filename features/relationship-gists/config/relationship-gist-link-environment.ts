export type RelationshipGistAppVariant = 'staging' | 'production';

export type RelationshipGistAppIdentity = {
  variant?: unknown;
  scheme?: unknown;
  webOrigin?: unknown;
};

export type RelationshipGistLinkEnvironment = {
  variant: RelationshipGistAppVariant;
  scheme: string;
  webOrigin: string;
};

const EXPECTED_ENVIRONMENTS: Readonly<Record<RelationshipGistAppVariant, RelationshipGistLinkEnvironment>> = {
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

const normalize = (value: unknown) => String(value ?? '').trim();

export const resolveRelationshipGistLinkEnvironment = (
  identity: RelationshipGistAppIdentity | null | undefined,
): RelationshipGistLinkEnvironment => {
  const variant = normalize(identity?.variant).toLowerCase();
  if (variant !== 'staging' && variant !== 'production') {
    throw new Error(`Unsupported Relationship Gist app variant: ${variant || 'missing'}.`);
  }

  const expected = EXPECTED_ENVIRONMENTS[variant];
  const scheme = normalize(identity?.scheme).toLowerCase();
  const webOrigin = normalize(identity?.webOrigin).replace(/\/+$/u, '').toLowerCase();
  if (scheme !== expected.scheme || webOrigin !== expected.webOrigin) {
    throw new Error(`Relationship Gist link configuration does not match the ${variant} app identity.`);
  }
  return expected;
};

export const createRelationshipGistLinks = (
  gistId: string,
  perspective: string | null | undefined,
  identity: RelationshipGistAppIdentity | null | undefined,
) => {
  const normalizedGistId = gistId.trim();
  if (!normalizedGistId) throw new Error('A Relationship Gist ID is required.');
  const environment = resolveRelationshipGistLinkEnvironment(identity);
  const encodedGistId = encodeURIComponent(normalizedGistId);
  const normalizedPerspective = normalize(perspective).toLowerCase();
  const query = normalizedPerspective
    ? `?perspective=${encodeURIComponent(normalizedPerspective)}`
    : '';
  return {
    deepLink: `${environment.scheme}://gists/${encodedGistId}${query}`,
    webLink: `${environment.webOrigin}/gists/${encodedGistId}${query}`,
  } as const;
};
