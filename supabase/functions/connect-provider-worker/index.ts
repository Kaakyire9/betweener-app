// @ts-nocheck -- service-only Deno entrypoint; no hosted invocation during M1.
import { connectBackend, connectEnv, connectJson, connectRpc } from '../_shared/connect-edge.ts';
import { assertConnectJobAcknowledged, runConnectProviderJob } from '../_shared/connect-provider-worker.ts';
import { verifyConnectWebhook } from '../_shared/connect-webhook.ts';
Deno.serve(async (request) => {
  if (request.method !== 'POST') return connectJson({ error: 'method_not_allowed' }, 405);
  try {
    // Dedicated random worker secret, compared using HMAC verification.
    const supplied = request.headers.get('x-connect-worker-secret') ?? '';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(connectEnv('CONNECT_WORKER_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('connect-worker')));
    const signature = Array.from(signed, (b) => b.toString(16).padStart(2, '0')).join('');
    if (!await verifyConnectWebhook('connect-worker', signature, supplied)) return connectJson({ error: 'unauthorized' }, 401);
    const { service, adapter } = connectBackend();
    await connectRpc(service, 'rpc_connect_sweep');
    const job = await connectRpc(service, 'rpc_connect_claim_job');
    if (!job) return connectJson({ processed: false });
    const result = await runConnectProviderJob(job, {
      snapshot: (id) => connectRpc(service, 'rpc_connect_worker_snapshot', { p_call: id }),
      complete: async (j, success) => { assertConnectJobAcknowledged(await connectRpc(service, 'rpc_connect_complete_job', { p_call: j.call_id, p_operation: j.operation, p_lease: j.lease, p_success: success })); },
      reconcile: async (id, m) => { await connectRpc(service, 'rpc_connect_reconcile_media', { p_call: id, p_session: m.session, p_users: m.users, p_ended: m.ended }); },
    }, adapter);
    return connectJson({ processed: true, ...result });
  } catch { return connectJson({ error: 'connect_worker_unavailable' }, 503); }
});
