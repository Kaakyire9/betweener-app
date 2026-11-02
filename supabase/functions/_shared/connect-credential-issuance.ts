import type { createConnectStreamAdapter, ProviderSnapshot } from './connect-stream-adapter.ts';

type Credentials = Awaited<ReturnType<ReturnType<typeof createConnectStreamAdapter>['credentials']>>;
interface CredentialPort {
  admit(): Promise<unknown>;
  snapshot(): Promise<ProviderSnapshot | null>;
  issue(snapshot: ProviderSnapshot, userId: string): Promise<Credentials>;
}
function requireAdmission(value: unknown, userId: string, callId: string): 'voice' | 'video' {
  const a = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (a.admitted !== true || a.user_id !== userId || a.id !== callId || a.call_type !== 'betweener_connect'
    || !['ACCEPTED', 'CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(String(a.state))
    || (a.media !== 'voice' && a.media !== 'video')) throw new Error('connect_unavailable');
  return a.media;
}
/** Both admission transactions must commit affirmative authority before delivery. */
export async function issueConnectCredentials(port: CredentialPort, userId: string, callId: string) {
  const media = requireAdmission(await port.admit(), userId, callId);
  const snapshot = await port.snapshot();
  if (!snapshot || snapshot.id !== callId || snapshot.media !== media) throw new Error('connect_unavailable');
  const credentials = await port.issue(snapshot, userId);
  if (requireAdmission(await port.admit(), userId, callId) !== media) throw new Error('connect_unavailable');
  return { ...credentials, media };
}
