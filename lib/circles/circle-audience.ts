export type CircleReachScope = 'local' | 'country' | 'diaspora' | 'global';
export type CircleAccessPolicy = 'open' | 'approval_required' | 'invite_only';
export type CircleMembershipEligibilityPolicy = 'recommend_only' | 'target_only';
export type CircleLiveDiscoveryPolicy = 'members_only' | 'discoverable_join_required';

export const CIRCLE_REACH_OPTIONS: readonly CircleReachScope[] = [
  'local',
  'country',
  'diaspora',
  'global',
];

export const CIRCLE_ACCESS_OPTIONS: readonly CircleAccessPolicy[] = [
  'open',
  'approval_required',
  'invite_only',
];

export const getCircleReachOptionLabel = (scope: CircleReachScope) => ({
  local: 'Local',
  country: 'Country',
  diaspora: 'Diaspora',
  global: 'Global',
}[scope]);

export const getCircleAccessOptionLabel = (policy: CircleAccessPolicy) => ({
  open: 'Open',
  approval_required: 'Approval required',
  invite_only: 'Invite only',
}[policy]);

export const normalizeCircleReachScopes = (
  values?: readonly string[] | null,
  fallback: CircleReachScope = 'country',
): CircleReachScope[] => {
  const requested = new Set((values ?? []).map((value) => String(value).trim().toLowerCase()));
  const normalized: CircleReachScope[] = CIRCLE_REACH_OPTIONS.filter((scope) => requested.has(scope));
  if (normalized.includes('global')) return ['global'];
  const locationScope: CircleReachScope | null = normalized.includes('local')
    ? 'local'
    : normalized.includes('country')
      ? 'country'
      : null;
  const result: CircleReachScope[] = [
    ...(locationScope ? [locationScope] : []),
    ...(normalized.includes('diaspora') ? ['diaspora' as const] : []),
  ];
  return result.length > 0 ? result : [fallback];
};

export const toggleCircleReachScope = (
  values: readonly CircleReachScope[],
  scope: CircleReachScope,
): CircleReachScope[] => {
  if (scope === 'global') return ['global'];
  const current = normalizeCircleReachScopes(values);
  const withoutGlobal = current.filter((value) => value !== 'global');
  const withoutCompetingLocation = scope === 'local' || scope === 'country'
    ? withoutGlobal.filter((value) => value !== 'local' && value !== 'country')
    : withoutGlobal;
  const next = current.includes(scope)
    ? withoutGlobal.filter((value) => value !== scope)
    : [...withoutCompetingLocation, scope];
  return normalizeCircleReachScopes(next);
};

export const getPrimaryCircleReachScope = (values: readonly CircleReachScope[]) => {
  const normalized = normalizeCircleReachScopes(values);
  return normalized.find((value) => value !== 'diaspora') ?? normalized[0];
};

export const normalizeCountryCodeList = (value: string) => Array.from(new Set(
  value
    .split(/[\s,]+/)
    .map((item) => item.trim().toUpperCase())
    .filter((item) => /^[A-Z]{2}$/.test(item)),
));

export const formatCountryCodeList = (values?: readonly string[] | null) =>
  (values ?? []).join(', ');

export const resolveLegacyCircleAudience = (circle: {
  visibility_scope?: string | null;
  reach_scope?: string | null;
  reach_scopes?: string[] | null;
  visibility?: string | null;
  requires_join_approval?: boolean | null;
  access_policy?: string | null;
}) => {
  const reachCandidate = String(circle.reach_scope ?? circle.visibility_scope ?? 'country').toLowerCase();
  const reachScope: CircleReachScope = CIRCLE_REACH_OPTIONS.includes(reachCandidate as CircleReachScope)
    ? reachCandidate as CircleReachScope
    : 'country';
  const reachScopes = normalizeCircleReachScopes(circle.reach_scopes, reachScope);
  const accessCandidate = String(circle.access_policy ?? '').toLowerCase();
  const accessPolicy: CircleAccessPolicy = CIRCLE_ACCESS_OPTIONS.includes(accessCandidate as CircleAccessPolicy)
    ? accessCandidate as CircleAccessPolicy
    : circle.visibility === 'private' || circle.visibility_scope === 'invite_only'
      ? 'invite_only'
      : circle.requires_join_approval
        ? 'approval_required'
        : 'open';
  return { reachScope: getPrimaryCircleReachScope(reachScopes), reachScopes, accessPolicy };
};
