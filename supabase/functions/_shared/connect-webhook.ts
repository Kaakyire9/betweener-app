export async function verifyConnectWebhook(raw: string, signature: string, secret: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(signature) || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!, (s) => parseInt(s, 16));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(raw));
}
/** Call only after raw-body HMAC and call binding pass. Stream keeps this header
 * stable across retries. It is a delivery hint, not signed admission authority. */
export async function connectWebhookReceiptDigest(raw: string, callId: string, appId: string, webhookId: string | null): Promise<string> {
  if (appId !== '1731011' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(callId)) {
    throw new Error('connect_webhook_binding_invalid');
  }
  if (webhookId !== null && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(webhookId)) throw new Error('connect_webhook_identity_invalid');
  // Keep the legacy raw-body receipt contract when no delivery header exists.
  const identity = webhookId === null ? raw : JSON.stringify(['connect-webhook-v2', appId, callId.toLowerCase(), webhookId]);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
/** Verified callbacks only wake reconciliation. No event ever certifies media. */
export function connectWebhookCall(raw: string, now = Date.now()): string | null {
  try {
    const event = JSON.parse(raw);
    if (typeof event.type !== 'string' || !event.type.startsWith('call.') || typeof event.call_cid !== 'string'
      || Math.abs(now - Date.parse(event.created_at)) > 5 * 60_000 || !Number.isFinite(Date.parse(event.created_at))) return null;
    const match = /^betweener_connect:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(event.call_cid);
    return match?.[1] ?? null;
  } catch { return null; }
}
