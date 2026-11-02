// @ts-nocheck -- raw-body provider signature checked before any RPC.
import { connectBackend, connectEnv, connectJson, connectRpc } from '../_shared/connect-edge.ts';
import { connectWebhookCall, connectWebhookReceiptDigest, verifyConnectWebhook } from '../_shared/connect-webhook.ts';
Deno.serve(async (request) => {
  if (request.method !== 'POST') return connectJson({ error: 'method_not_allowed' }, 405);
  try {
    if (Number(request.headers.get('Content-Length') ?? 0) > 65536) return connectJson({ error: 'invalid_request' }, 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 65536) return connectJson({ error: 'invalid_request' }, 413);
    if (!await verifyConnectWebhook(raw, request.headers.get('x-signature') ?? '', connectEnv('CONNECT_STREAM_API_SECRET'))) return connectJson({ error: 'unauthorized' }, 401);
    const id = connectWebhookCall(raw);
    if (id) {
      const digest = await connectWebhookReceiptDigest(raw, id, connectEnv('CONNECT_STREAM_APP_ID'), request.headers.get('x-webhook-id'));
      await connectRpc(connectBackend().service, 'rpc_connect_enqueue_sync', { p_call: id, p_digest: digest });
    }
    return connectJson({ received: true });
  } catch { return connectJson({ error: 'connect_webhook_unavailable' }, 503); }
});
