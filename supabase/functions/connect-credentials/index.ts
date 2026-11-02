// @ts-nocheck -- Deno function, no client/native imports.
import { connectBackend, connectEnv, connectJson, connectRpc } from '../_shared/connect-edge.ts';
import { issueConnectCredentials } from '../_shared/connect-credential-issuance.ts';
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
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(body.callId) || !uuid.test(body.deviceId) || Object.keys(body).some((k) => !['callId', 'deviceId'].includes(k))) return connectJson({ error: 'invalid_request' }, 400);
    const { authenticated, service, adapter } = connectBackend(); const userClient = authenticated(authorization);
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return connectJson({ error: 'unauthorized' }, 401);
    const args = { p_call: body.callId, p_device: body.deviceId };
    const credentials = await issueConnectCredentials({
      admit: () => connectRpc(userClient, 'rpc_connect_admission', args),
      snapshot: () => connectRpc(service, 'rpc_connect_worker_snapshot', { p_call: body.callId }),
      issue: (snapshot, userId) => adapter.credentials(snapshot, userId),
    }, data.user.id, body.callId);
    return connectJson({ ...credentials, apiKey: connectEnv('CONNECT_STREAM_API_KEY'), user: { id: data.user.id } });
  } catch { return connectJson({ error: 'connect_unavailable' }, 403); }
});
