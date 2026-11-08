// Canonical project identity, independent of Live routes and public app flags.
const stagingProjectRef = 'xsgzxadwuxuziubglvps';
export function assertConnectEnvironment(environment: string, backendUrl: string): void {
  const url = new URL(backendUrl);
  const localHosts = ['localhost', '127.0.0.1', 'kong', 'supabase_kong_betweener-app'];
  if (url.username || url.password) throw new Error('connect_environment_mismatch');
  if (environment === 'local' && localHosts.includes(url.hostname) && ['http:', 'https:'].includes(url.protocol)) return;
  if (environment === 'staging' && url.protocol === 'https:' && url.hostname === `${stagingProjectRef}.supabase.co`) return;
  throw new Error('connect_environment_mismatch');
}
