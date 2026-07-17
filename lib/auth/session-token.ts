type SessionLike = {
  access_token?: string | null;
  expires_at?: number | null;
};

const JWT_EXPIRY_SKEW_SECONDS = 30;
const BASE64_URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const decodeBase64Url = (value: string) => {
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const character of value) {
    const index = BASE64_URL_ALPHABET.indexOf(character);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output;
};

export const getJwtExpirySeconds = (accessToken?: string | null) => {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    return typeof parsed.exp === 'number' ? parsed.exp : null;
  } catch {
    return null;
  }
};

export const isSupabaseAccessTokenUsable = (
  accessToken?: string | null,
  nowMs: number = Date.now(),
  skewSeconds: number = JWT_EXPIRY_SKEW_SECONDS,
) => {
  if (!accessToken) return false;
  const expiresAt = getJwtExpirySeconds(accessToken);
  return expiresAt === null || expiresAt > Math.floor(nowMs / 1000) + skewSeconds;
};

export const isSupabaseSessionUsable = (
  session?: SessionLike | null,
  nowMs: number = Date.now(),
  skewSeconds: number = JWT_EXPIRY_SKEW_SECONDS,
) => {
  if (!session?.access_token) return false;
  const expiresAt =
    typeof session.expires_at === 'number'
      ? session.expires_at
      : getJwtExpirySeconds(session.access_token);
  return expiresAt === null || expiresAt > Math.floor(nowMs / 1000) + skewSeconds;
};
