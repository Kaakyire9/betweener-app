import type { NativeSessionOwner } from '../../../lib/auth/native-session-owner';
import { createAuthenticatedConnectServices, invokePinnedConnectRpc, type PinnedConnectRpcClient } from './authenticated-connect-services';
import type { ConnectRuntimeIdentity } from '../config/connect-runtime-policy';
import { connectRuntimeAvailability, connectRuntimeFeatureFlags } from '../config/connect-runtime-policy';
import { createConnectNativeSafetyComposition, loadConnectNativeEnvironment } from '../media/native-safety-composition';
import { subscribePushRegistrations } from '../../../lib/notifications/push-registration-events';
import { withdrawCallingConsent } from '../application/withdraw-calling-consent';

/** Called only by the gated app host. Existing Supabase/native imports remain lazy. */
export async function loadConnectProduct(identity: ConnectRuntimeIdentity, auth: NativeSessionOwner, profileId: string) {
  if (!connectRuntimeAvailability(identity).runtime) throw new Error('connect_disabled');
  const flags = connectRuntimeFeatureFlags(identity);
  const expected = auth.snapshot();
  if (!expected) throw new Error('connect_unauthenticated');
  const [{ supabase }, crypto, { getPushInstallationId }, { APP_IDENTITY }, environment] = await Promise.all([
    import('../../../lib/supabase'), import('expo-crypto'), import('../../../lib/notifications/push'),
    import('../../../config/app-identity'), loadConnectNativeEnvironment(flags),
  ]);
  const deviceId = await getPushInstallationId(APP_IDENTITY.bundleIdentifier);
  auth.accessToken(expected);
  const services = createAuthenticatedConnectServices(auth, profileId, {
    async rpc(name, args, token) {
      return await invokePinnedConnectRpc(supabase as unknown as PinnedConnectRpcClient, name, args, token);
    },
    async credentials(callId, selectedDevice, token) {
      const { data, error } = await supabase.functions.invoke('connect-credentials', {
        body: { callId, deviceId: selectedDevice }, headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw new Error('connect_unavailable'); return data;
    },
    async peer(id, token) {
      const { data, error } = await supabase.from('profiles').select('id,full_name,username,avatar_url,account_state,deleted_at')
        .eq('id', id).single().setHeader('Authorization', `Bearer ${token}`);
      if (error || !data || data.account_state === 'deleted' || data.deleted_at) throw new Error('connect_unavailable');
      let avatar: string | null = null;
      try { const url = new URL(data.avatar_url ?? ''); if (url.protocol === 'https:' && !url.username && !url.password) avatar = url.toString(); } catch { /* Use the local initial. */ }
      return { profileId: data.id, name: (data.full_name || data.username || 'Your connection').slice(0, 100), avatar };
    },
  }, { videoCalling: flags.videoCalling === true && connectRuntimeAvailability(identity).video });
  const composition = createConnectNativeSafetyComposition({ ...environment, auth, api: services.api, selfProfileId: profileId,
    deviceId, uuid: crypto.randomUUID, peer: services.peer, flags, retireOnReconnect: true, failClosedAuthority: true });
  // Foreground discovery still works when push registration is unavailable.
  void services.registerNotificationCapability(deviceId, true).catch(() => undefined);
  const unsubscribePush = subscribePushRegistrations((user, installation) => {
    if (user === expected.userId && installation === deviceId) void services.registerNotificationCapability(deviceId, true).catch(() => undefined);
  });
  return { ...composition, services, flags, selfProfileId: profileId, authGeneration: expected.generation, accountUserId: expected.userId,
    withdrawCallingConsent: () => withdrawCallingConsent({ hangup: () => composition.controller.hangup(), setPreferences: services.preferences.set }),
    dispose: () => { unsubscribePush(); return composition.dispose(); } };
}
