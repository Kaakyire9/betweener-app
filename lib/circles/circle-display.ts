export type CircleScopeDisplayData = {
  visibility_scope?: string | null;
  city?: string | null;
  region?: string | null;
  country_name?: string | null;
  country_code?: string | null;
};

export type CircleScopePresentation = {
  icon: string;
  label: string | null;
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

export const getCircleScopePresentation = (
  circle?: CircleScopeDisplayData | null,
): CircleScopePresentation | null => {
  switch (String(circle?.visibility_scope ?? '').toLowerCase()) {
    case 'global':
      return { icon: 'web', label: null };
    case 'diaspora':
      return { icon: 'earth', label: 'Diaspora' };
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
