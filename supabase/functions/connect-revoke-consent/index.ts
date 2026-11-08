// @ts-nocheck -- Pinned Deno runtime checked in isolated strict sources.
import { connectBackend, connectJson, connectRpc } from '../_shared/connect-edge.ts';
import { revokeConnectConsent } from '../_shared/connect-consent-revocation.ts';
import { assertConnectJobAcknowledged } from '../_shared/connect-provider-worker.ts';
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return connectJson({});
  if (request.method !== 'POST') return connectJson({ error: 'method_not_allowed' }, 405);
  try {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return connectJson({ error: 'unauthorized' }, 401);
    if (Number(request.headers.get('Content-Length') ?? 0) > 2048) return connectJson({ error: 'invalid_request' }, 400);
    const raw = await request.text();
    if (raw.length > 2048) return connectJson({ error: 'invalid_request' }, 400);
    const body = JSON.parse(raw);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.grantId)
      || Object.keys(body).some((key) => key !== 'grantId')) return connectJson({ error: 'invalid_request' }, 400);
    const { authenticated, service, adapter } = connectBackend();
    const user = authenticated(authorization);
    const identity = await user.auth.getUser();
    if (identity.error || !identity.data.user) return connectJson({ error: 'unauthorized' }, 401);
    const result = await revokeConnectConsent(body.grantId, {
      revoke: (grant) => connectRpc(user, 'rpc_connect_revoke_consent', { p_grant: grant }),
      claimEnd: (id) => connectRpc(service, 'rpc_connect_claim_end', { p_call: id }),
      snapshot: (id) => connectRpc(service, 'rpc_connect_worker_snapshot', { p_call: id }),
      complete: async (job, success) => { assertConnectJobAcknowledged(await connectRpc(service, 'rpc_connect_complete_job', {
        p_call: job.call_id, p_operation: job.operation, p_lease: job.lease, p_success: success,
      })); },
      reconcile: async () => { throw new Error('connect_unavailable'); },
    }, adapter);
    return connectJson(result, result.providerCleanup === 'complete' ? 200 : 202);
  } catch { return connectJson({ error: 'connect_unavailable' }, 403); }
});
