// @ts-nocheck -- service-only Deno entrypoint; no hosted invocation during M1.
import { connectBackend, connectEnv, connectJson, connectRpc } from '../_shared/connect-edge.ts';
import { assertConnectJobAcknowledged } from '../_shared/connect-provider-worker.ts';
import { runConnectProviderBatch } from '../_shared/connect-provider-batch.ts';
import { verifyConnectWebhook } from '../_shared/connect-webhook.ts';
import { reconcileNativeDestination } from '../_shared/connect-native-destination.ts';
import { isAcceptedEnd, isScopedNotFound } from '../_shared/connect-provider-end.ts';
Deno.serve(async (request) => {
  if (request.method !== 'POST') return connectJson({ error: 'method_not_allowed' }, 405);
  try {
    // Dedicated random worker secret, compared using HMAC verification.
    const supplied = request.headers.get('x-connect-worker-secret') ?? '';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(connectEnv('CONNECT_WORKER_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('connect-worker')));
    const signature = Array.from(signed, (b) => b.toString(16).padStart(2, '0')).join('');
    if (!await verifyConnectWebhook('connect-worker', signature, supplied)) return connectJson({ error: 'unauthorized' }, 401);
    const { service, adapter, stream } = connectBackend();
    await connectRpc(service, 'rpc_connect_sweep');
    const result = await runConnectProviderBatch({
      claim: () => connectRpc(service, 'rpc_connect_claim_job'),
      snapshot: (id) => connectRpc(service, 'rpc_connect_worker_snapshot', { p_call: id }),
      complete: async (j, success) => { assertConnectJobAcknowledged(await connectRpc(service, 'rpc_connect_complete_job', { p_call: j.call_id, p_operation: j.operation, p_lease: j.lease, p_success: success })); },
      reconcile: async (id, m) => { await connectRpc(service, 'rpc_connect_reconcile_media', { p_call: id, p_session: m.session, p_users: m.users, p_ended: m.ended }); },
    }, adapter);
    const nativeJob = await connectRpc(service, 'rpc_connect_claim_native_destination');
    if (!nativeJob) return connectJson(result);
    // Session invalidation/config-off creates deletion work independently of
    // admission. Never stop this cleanup because new calling is disabled.
    const { app } = await stream.getApp();
    if (app.id !== Number(connectEnv('CONNECT_STREAM_APP_ID')) || app.disable_auth_checks !== false || app.disable_permissions_checks !== false) throw Error('connect_environment_mismatch');
    const native = await reconcileNativeDestination(nativeJob, {
      current: (j) => connectRpc(service, 'rpc_connect_native_destination_current', { p_hash: j.token_hash, p_generation: j.generation, p_lease: j.lease }),
      async remove(token, user) {
        try { if (!isAcceptedEnd(await stream.deleteDevice({ id: token, user_id: user }))) throw Error('native_remove_unconfirmed'); }
        catch (error) { if (!isScopedNotFound(error)) throw error; }
      },
      async register(token, user, platform) {
        const provider = connectEnv(platform === 'ios' ? 'CONNECT_NATIVE_APNS_PROVIDER' : 'CONNECT_NATIVE_FCM_PROVIDER');
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(provider)) throw Error('connect_configuration_unavailable');
        // Same ID-only provisioning used by Connect calls; no role overwrite.
        await stream.upsertUsers([{ id: user }]);
        if (!isAcceptedEnd(await stream.createDevice({ id: token, user_id: user, push_provider: platform === 'ios' ? 'apn' : 'firebase',
          push_provider_name: provider, voip_token: platform === 'ios' }))) throw Error('native_register_unconfirmed');
      },
      complete: (j, success) => connectRpc(service, 'rpc_connect_complete_native_destination', { p_hash: j.token_hash, p_generation: j.generation, p_lease: j.lease, p_success: success }),
    });
    return connectJson({ ...result, processed: true, nativeDestinationReconciled: native.success });
  } catch { return connectJson({ error: 'connect_worker_unavailable' }, 503); }
});
