export type CircleScopeDisplayData = {
  visibility_scope?: string | null;
  city?: string | null;
  region?: string | null;
  country_name?: string | null;
  country_code?: string | null;
};

export const getCircleScopeLabel = (circle?: CircleScopeDisplayData | null) => {
  switch (String(circle?.visibility_scope ?? '').toLowerCase()) {
    case 'global':
      return 'Global';
    case 'diaspora':
      return 'Diaspora';
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
