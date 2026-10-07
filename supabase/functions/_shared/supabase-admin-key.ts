// @ts-nocheck -- Deno environment is provided by the Supabase Edge runtime.
// Server-only Supabase credential resolution for Edge Functions.
// New secret keys are injected by Supabase as a JSON map in SUPABASE_SECRET_KEYS.

export type SupabaseAdminKeySource =
  | 'injected_secret_key'
  | 'dedicated_secret_key';

export type SupabaseAdminCredential = {
  key: string;
  source: SupabaseAdminKeySource;
};

type ResolveOptions = {
  injectedSecretKeys?: string | null;
  dedicatedSecretKey?: string | null;
  keyName?: string | null;
};

const clean = (value?: string | null) => String(value || '').trim();

const assertSecretKey = (value: string, source: SupabaseAdminKeySource) => {
  if (!value.startsWith('sb_secret_')) {
    throw new Error(`invalid_supabase_admin_key:${source}`);
  }
  return value;
};

export const resolveSupabaseAdminCredential = ({
  injectedSecretKeys,
  dedicatedSecretKey,
  keyName,
}: ResolveOptions): SupabaseAdminCredential => {
  const injected = clean(injectedSecretKeys);
  const resolvedKeyName = clean(keyName) || 'default';

  if (injected) {
    let keys: Record<string, unknown>;
    try {
      keys = JSON.parse(injected) as Record<string, unknown>;
    } catch {
      throw new Error('invalid_supabase_secret_keys_json');
    }

    const key = clean(typeof keys?.[resolvedKeyName] === 'string' ? keys[resolvedKeyName] as string : '');
    if (!key) throw new Error(`missing_supabase_secret_key:${resolvedKeyName}`);
    return { key: assertSecretKey(key, 'injected_secret_key'), source: 'injected_secret_key' };
  }

  const dedicated = clean(dedicatedSecretKey);
  if (dedicated) {
    return {
      key: assertSecretKey(dedicated, 'dedicated_secret_key'),
      source: 'dedicated_secret_key',
    };
  }

  throw new Error('missing_supabase_admin_key');
};

export const getSupabaseAdminCredential = (): SupabaseAdminCredential => {
  return resolveSupabaseAdminCredential({
    injectedSecretKeys: Deno.env.get('SUPABASE_SECRET_KEYS'),
    dedicatedSecretKey: Deno.env.get('BETWEENER_SUPABASE_SECRET_KEY'),
    keyName: Deno.env.get('BETWEENER_SUPABASE_SECRET_KEY_NAME'),
  });
};

export const getSupabaseAdminKey = () => getSupabaseAdminCredential().key;

export const getSupabaseAdminHeaders = (headers: Record<string, string> = {}) => {
  const credential = getSupabaseAdminCredential();
  const result: Record<string, string> = {
    ...headers,
    apikey: credential.key,
  };

  return result;
};
