const clean = (value?: string | null) => String(value || '').trim();

export const isJwtShaped = (value?: string | null) => {
  const token = clean(value);
  if (!token.startsWith('eyJ')) return false;
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
};

export const isSupabasePublicApiKey = (value?: string | null) => {
  const key = clean(value);
  return key.startsWith('sb_publishable_') || isJwtShaped(key);
};

export const buildSupabasePublicHeaders = ({
  apiKey,
  accessToken,
}: {
  apiKey: string;
  accessToken?: string | null;
}): Record<string, string> => {
  const normalizedApiKey = clean(apiKey);
  if (!isSupabasePublicApiKey(normalizedApiKey)) {
    throw new Error('invalid_supabase_public_api_key');
  }

  const normalizedAccessToken = clean(accessToken);
  if (normalizedAccessToken) {
    if (
      normalizedAccessToken === normalizedApiKey
      || !isJwtShaped(normalizedAccessToken)
    ) {
      throw new Error('invalid_supabase_user_access_token');
    }
  }

  return {
    apikey: normalizedApiKey,
    ...(normalizedAccessToken
      ? { Authorization: `Bearer ${normalizedAccessToken}` }
      : {}),
  };
};
