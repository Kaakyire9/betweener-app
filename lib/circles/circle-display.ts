export type CircleScopeDisplayData = {
  visibility_scope?: string | null;
  reach_scope?: string | null;
  reach_scopes?: string[] | null;
  access_policy?: string | null;
  requires_join_approval?: boolean | null;
  city?: string | null;
  region?: string | null;
  country_name?: string | null;
  country_code?: string | null;
  diaspora_origin_country_codes?: string[] | null;
  diaspora_destination_country_codes?: string[] | null;
};

export type CircleScopePresentation = {
  icon: string;
  label: string | null;
};

export const getCircleScopeLabel = (circle?: CircleScopeDisplayData | null) => {
  const reaches = circle?.reach_scopes ?? [];
  if (reaches.includes('diaspora') && (reaches.includes('country') || reaches.includes('local'))) {
    const location = circle?.city || circle?.country_name || circle?.country_code || 'Local';
    return `${location} + diaspora`;
  }
  switch (String(circle?.reach_scope ?? circle?.visibility_scope ?? '').toLowerCase()) {
    case 'global':
      return 'Global';
    case 'diaspora':
      return circle?.country_name ? `${circle.country_name} diaspora` : 'Diaspora';
    case 'invite_only':
      return 'Private';
    case 'local':
      return circle?.city || circle?.region || circle?.country_name || 'Local';
    case 'country':
      return circle?.country_name || circle?.country_code || 'Country';
    default:
      return circle?.city || circle?.country_name || null;
  }
};

export const getCircleScopePresentation = (
  circle?: CircleScopeDisplayData | null,
): CircleScopePresentation | null => {
  const reaches = circle?.reach_scopes ?? [];
  if (reaches.includes('diaspora') && (reaches.includes('country') || reaches.includes('local'))) {
    const location = circle?.city || circle?.country_name || circle?.country_code || 'Local';
    return { icon: 'earth', label: `${location} + diaspora` };
  }
  switch (String(circle?.reach_scope ?? circle?.visibility_scope ?? '').toLowerCase()) {
    case 'global':
      return { icon: 'web', label: 'Global' };
    case 'diaspora':
      return {
        icon: 'earth',
        label: circle?.country_name ? `${circle.country_name} diaspora` : 'Diaspora',
      };
    case 'invite_only':
      return { icon: 'lock-outline', label: 'Private' };
    case 'local':
      return {
        icon: 'map-marker-radius-outline',
        label: circle?.city || circle?.region || circle?.country_name || 'Local',
      };
    case 'country':
      return {
        icon: 'map-outline',
        label: circle?.country_name || circle?.country_code || 'Country',
      };
    default: {
      const fallbackLabel = circle?.city || circle?.country_name || null;
      return fallbackLabel ? { icon: 'map-marker-outline', label: fallbackLabel } : null;
    }
  }
};

export const getCircleAccessLabel = (circle?: CircleScopeDisplayData | null) => {
  const accessPolicy = String(circle?.access_policy ?? '').toLowerCase();
  if (accessPolicy === 'invite_only' || circle?.visibility_scope === 'invite_only') return 'Invite only';
  if (accessPolicy === 'approval_required' || circle?.requires_join_approval) return 'Approval required';
  return 'Open';
};
