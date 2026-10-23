export type LiveAudienceReachScope =
  | 'global'
  | 'country'
  | 'local'
  | 'diaspora'
  | 'invite_only';

export type LiveAudiencePolicyDraft = {
  audienceScopes: LiveAudienceReachScope[];
  audienceCountryCode: string;
  audienceCountryName: string;
  audienceRegion: string;
  audienceCity: string;
  diasporaOriginCountryCodes: string[];
  diasporaDestinationCountryCodes: string[];
};

export const LIVE_AUDIENCE_REACH_OPTIONS: readonly LiveAudienceReachScope[] = [
  'global',
  'country',
  'local',
  'diaspora',
  'invite_only',
];

export const getLiveAudienceReachLabel = (scope: LiveAudienceReachScope) => ({
  global: 'Global',
  country: 'Country',
  local: 'Local',
  diaspora: 'Diaspora',
  invite_only: 'Invite only',
}[scope]);

export const normalizeLiveAudienceScopes = (
  values?: readonly string[] | null,
): LiveAudienceReachScope[] => {
  const requested = new Set((values ?? []).map((value) => String(value).trim().toLowerCase()));
  if (requested.has('invite_only')) return ['invite_only'];
  if (requested.has('global')) return ['global'];

  const locationScope: LiveAudienceReachScope | null = requested.has('local')
    ? 'local'
    : requested.has('country')
      ? 'country'
      : null;
  const result: LiveAudienceReachScope[] = [
    ...(locationScope ? [locationScope] : []),
    ...(requested.has('diaspora') ? ['diaspora' as const] : []),
  ];
  return result.length > 0 ? result : ['global'];
};

export const toggleLiveAudienceScope = (
  values: readonly LiveAudienceReachScope[],
  scope: LiveAudienceReachScope,
): LiveAudienceReachScope[] => {
  if (scope === 'global' || scope === 'invite_only') return [scope];
  const current = normalizeLiveAudienceScopes(values)
    .filter((value) => value !== 'global' && value !== 'invite_only');
  if (scope === 'diaspora') {
    const next = current.includes(scope)
      ? current.filter((value) => value !== scope)
      : [...current, scope];
    return normalizeLiveAudienceScopes(next);
  }
  const next = current.includes(scope)
    ? current.filter((value) => value !== scope)
    : [
        ...current.filter((value) => value !== 'country' && value !== 'local'),
        scope,
      ];
  return normalizeLiveAudienceScopes(next);
};

export const normalizeAudienceCountryCodes = (values?: readonly string[] | null) =>
  Array.from(new Set((values ?? [])
    .map((value) => String(value).trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value))))
    .slice(0, 12);

export const getLiveAudiencePolicyError = (policy: LiveAudiencePolicyDraft): string | null => {
  const scopes = normalizeLiveAudienceScopes(policy.audienceScopes);
  const hasLocation = scopes.includes('country') || scopes.includes('local');
  if (hasLocation && !/^[A-Z]{2}$/.test(policy.audienceCountryCode.trim().toUpperCase())) {
    return 'Choose the country this Live should reach.';
  }
  if (scopes.includes('local') && !policy.audienceCity.trim()) {
    return 'Choose the city or town this Live should reach.';
  }
  if (scopes.includes('diaspora') && normalizeAudienceCountryCodes(policy.diasporaOriginCountryCodes).length === 0) {
    return 'Choose at least one diaspora heritage country.';
  }
  return null;
};

export const getLiveAudienceSummary = (policy: LiveAudiencePolicyDraft) => {
  const scopes = normalizeLiveAudienceScopes(policy.audienceScopes);
  if (scopes.includes('global')) return 'Global discovery';
  if (scopes.includes('invite_only')) return 'Invite only';

  const parts: string[] = [];
  if (scopes.includes('local')) parts.push(policy.audienceCity.trim() || 'Local');
  else if (scopes.includes('country')) {
    parts.push(policy.audienceCountryName.trim() || policy.audienceCountryCode.trim() || 'Country');
  }
  if (scopes.includes('diaspora')) {
    const origins = normalizeAudienceCountryCodes(policy.diasporaOriginCountryCodes);
    parts.push(origins.length > 0 ? `${origins.join(', ')} diaspora` : 'Diaspora');
  }
  return parts.join(' + ') || 'Global discovery';
};
