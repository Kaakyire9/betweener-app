// @ts-nocheck -- Deno environment is provided by the Supabase Edge runtime.
// Low-privilege Supabase credential resolution for Edge Functions.

type ResolveOptions = {
  injectedPublishableKeys?: string | null;
  dedicatedPublishableKey?: string | null;
  keyName?: string | null;
};

const clean = (value?: string | null) => String(value || '').trim();

const assertPublishableKey = (value: string) => {
  if (!value.startsWith('sb_publishable_')) {
    throw new Error('invalid_supabase_publishable_key');
  }
  return value;
};

export const resolveSupabasePublicApiKey = ({
  injectedPublishableKeys,
  dedicatedPublishableKey,
  keyName,
}: ResolveOptions) => {
  const injected = clean(injectedPublishableKeys);
  const resolvedKeyName = clean(keyName) || 'default';

  if (injected) {
    let keys: Record<string, unknown>;
    try {
      keys = JSON.parse(injected) as Record<string, unknown>;
    } catch {
      throw new Error('invalid_supabase_publishable_keys_json');
    }

    const key = clean(typeof keys?.[resolvedKeyName] === 'string'
      ? keys[resolvedKeyName] as string
      : '');
    if (!key) throw new Error(`missing_supabase_publishable_key:${resolvedKeyName}`);
    return assertPublishableKey(key);
  }

  const dedicated = clean(dedicatedPublishableKey);
  if (dedicated) return assertPublishableKey(dedicated);

  throw new Error('missing_supabase_publishable_key');
};

export const getSupabasePublicApiKey = () => resolveSupabasePublicApiKey({
  injectedPublishableKeys: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
  dedicatedPublishableKey: Deno.env.get('BETWEENER_SUPABASE_PUBLISHABLE_KEY'),
  keyName: Deno.env.get('BETWEENER_SUPABASE_PUBLISHABLE_KEY_NAME'),
});
