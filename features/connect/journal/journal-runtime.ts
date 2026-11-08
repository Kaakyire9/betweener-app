/** Local implementation is not a production history or calling rollout. */
export function journalReadRuntime(input: { enabled?: boolean; development: boolean; variant: string; environment: string; supabaseUrl: string }) {
  try {
    const url = new URL(input.supabaseUrl);
    return input.enabled === true && input.development && input.variant === 'staging' && input.environment === 'staging'
      && url.protocol === 'https:' && url.host === 'xsgzxadwuxuziubglvps.supabase.co' && url.pathname === '/'
      && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
