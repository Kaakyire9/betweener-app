import { ConnectError, type ConnectAuthorization, type ConnectGrant, type ConnectMedia, type ConnectPreferences, type ConnectSession } from '../domain/connect.ts';
import { readEndBlockContext, readEndBlockReceipt, type EndBlockContext } from '../domain/end-block.ts';

export interface ConnectRpcPort {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
}
const safeCodes = new Set(['connect_unauthenticated', 'connect_unavailable', 'connect_disabled', 'connect_consent_required',
  'connect_busy', 'connect_rate_limited', 'connect_invalid_input', 'connect_invalid_transition', 'connect_conflict',
  'connect_idempotency_conflict', 'connect_device_conflict', 'connect_test_budget_exhausted']);
/** Injectable transport; never imports native Stream or the Live singleton. */
export function createConnectRepository(port: ConnectRpcPort) {
  async function command<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await port.rpc(name, args);
    if (error) throw new ConnectError((safeCodes.has(error.message ?? '') ? error.message : 'connect_unavailable') as ConnectError['code']);
    return data as T;
  }
  return {
    setMediaPreference: (media: ConnectMedia, enabled: boolean) => command<void>('rpc_connect_set_media_preference', { p_media: media, p_enabled: enabled }),
    async prepareEndBlock(call: ConnectSession, peer: string) {
      return readEndBlockContext(await command('rpc_connect_end_block_context', { p_call: call.id, p_peer: peer, p_generation: call.created_at }), call, peer);
    },
    async endCallAndBlock(context: EndBlockContext, key: string) {
      return readEndBlockReceipt(await command('rpc_connect_end_call_and_block', { p_call: context.call_id, p_peer: context.peer_profile_id,
        p_generation: context.generation, p_key: key, p_context: context }), context, key);
    },
    async getEndBlockStatus(context: EndBlockContext) {
      const value = await command('rpc_connect_end_block_status', { p_call: context.call_id, p_peer: context.peer_profile_id, p_generation: context.generation });
      return value === null ? null : readEndBlockReceipt(value, context);
    },
    checkEligibility: (peer: string, media: ConnectMedia, authorization: ConnectAuthorization, grantId: string | null = null) =>
      command<boolean>('rpc_connect_check_eligibility', { p_peer: peer, p_media: media, p_authorization: authorization, p_grant: grantId }),
    createCall: (peer: string, media: ConnectMedia, authorization: ConnectAuthorization, key: string, device: string, grantId: string | null = null) =>
      command<ConnectSession>('rpc_connect_create_call', { p_peer: peer, p_media: media, p_authorization: authorization, p_key: key, p_device: device, p_grant: grantId }),
    act: (call: string, action: 'accept' | 'decline' | 'cancel' | 'end', version: number, device: string) =>
      command<ConnectSession>('rpc_connect_act', { p_call: call, p_action: action, p_version: version, p_device: device }),
    getCall: (call: string) => command<ConnectSession>('rpc_connect_get_call', { p_call: call }),
    getHistory: (before: string | null = null, limit = 30) => command<ConnectSession[]>('rpc_connect_get_history', { p_before: before, p_limit: limit }),
    setPreferences: (voice: boolean, video: boolean) => command<void>('rpc_connect_set_preferences', { p_voice: voice, p_video: video }),
    getPreferences: () => command<ConnectPreferences>('rpc_connect_get_preferences', {}),
    getGrant: (grant: string) => command<ConnectGrant>('rpc_connect_get_grant', { p_grant: grant }),
    getIntentConsent: (intent: string) => command<unknown>('rpc_connect_get_intent_consent', { p_intent: intent }),
    registerNotificationCapability: (installation: string, enabled: boolean) => command<void>('rpc_connect_register_notification_capability', { p_installation: installation, p_enabled: enabled }),
    requestGrant: (intent: string, voice: boolean, video: boolean) => command<string>('rpc_connect_request_grant', { p_intent: intent, p_voice: voice, p_video: video }),
    decideGrant: (grant: string, voice: boolean, video: boolean) => command<void>('rpc_connect_decide_grant', { p_grant: grant, p_voice: voice, p_video: video }),
    revokeGrant: (grant: string) => command<void>('rpc_connect_revoke_grant', { p_grant: grant }),
  };
}
