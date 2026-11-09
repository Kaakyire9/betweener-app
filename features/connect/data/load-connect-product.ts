import type { ConnectSession } from '../domain/connect';
import { voicePeerPhotos } from '../voice/peer-gallery';
import type { NativeSessionOwner } from '../../../lib/auth/native-session-owner';
import { createAuthenticatedConnectServices, invokePinnedConnectRpc, type PinnedConnectRpcClient } from './authenticated-connect-services';
import type { ConnectRuntimeIdentity } from '../config/connect-runtime-policy';
import { connectRuntimeAvailability, connectRuntimeFeatureFlags } from '../config/connect-runtime-policy';
import { createConnectNativeSafetyComposition, loadConnectNativeEnvironment } from '../media/native-safety-composition';
import { subscribePushRegistrations } from '../../../lib/notifications/push-registration-events';
import { withdrawCallingConsent } from '../application/withdraw-calling-consent';
import { createConnectTerminalLogger } from '../diagnostics/connect-terminal-logger';
import { loadCallSecurity } from '../security/load-call-security';
import { createNativeAnswerLease } from '../media/native-answer-lease';
import { withinRecoveryBudget } from '../media/recovery-policy';
import { createProductLeaseRegistry } from '../application/product-lease';

/** Called only by the gated app host. Existing Supabase/native imports remain lazy. */
async function buildConnectProduct(identity: ConnectRuntimeIdentity, auth: NativeSessionOwner, profileId: string) {
  if (!connectRuntimeAvailability(identity).runtime) throw new Error('connect_disabled');
  let flags = connectRuntimeFeatureFlags(identity);
  const expected = auth.snapshot();
  if (!expected) throw new Error('connect_unauthenticated');
  const [{ supabase }, crypto, { getPushInstallationId }, { APP_IDENTITY }, environment] = await Promise.all([
    import('../../../lib/supabase'), import('expo-crypto'), import('../../../lib/notifications/push'),
    import('../../../config/app-identity'), loadConnectNativeEnvironment(flags),
  ]);
  const deviceId = await getPushInstallationId(APP_IDENTITY.bundleIdentifier);
  auth.accessToken(expected);
  const terminal = createConnectTerminalLogger(identity);
  const services = createAuthenticatedConnectServices(auth, profileId, {
    async rpc(name, args, token) {
      const callId = args.p_call;
      try {
        const result = await invokePinnedConnectRpc(supabase as unknown as PinnedConnectRpcClient, name, args, token);
        if (result.error) terminal.serviceFailure('rpc', result.error, callId);
        return result;
      } catch (error) { terminal.serviceFailure('rpc', error, callId); throw error; }
    },
    async credentials(callId, selectedDevice, token) {
      const { data, error } = await supabase.functions.invoke('connect-credentials', {
        body: { callId, deviceId: selectedDevice }, headers: { Authorization: `Bearer ${token}` },
      });
      if (error) { terminal.serviceFailure('credentials', error, callId); throw new Error('connect_unavailable'); } return data;
    },
    async peer(id, token) {
      const { data, error } = await supabase.from('profiles').select('id,full_name,username,avatar_url,photos,account_state,deleted_at')
        .eq('id', id).single().setHeader('Authorization', `Bearer ${token}`);
      if (error || !data || data.account_state === 'deleted' || data.deleted_at) throw new Error('connect_unavailable');
      let avatar: string | null = null;
      try { const url = new URL(data.avatar_url ?? ''); if (url.protocol === 'https:' && !url.username && !url.password) avatar = url.toString(); } catch { /* Use the local initial. */ }
      return { profileId: data.id, name: (data.full_name || data.username || 'Your connection').slice(0, 100), avatar, photos: voicePeerPhotos(avatar, data.photos) };
    },
  }, { videoCalling: flags.videoCalling === true && connectRuntimeAvailability(identity).video, prepareCredentials: prepareKeys });
  const security = await loadCallSecurity(auth, deviceId, async (name, args, token) => invokePinnedConnectRpc(supabase as unknown as PinnedConnectRpcClient, name, args, token));
  flags = { ...flags, encryptedCalls: security.encryptedCalls, nativeIncoming: security.nativeIncoming };
  if (security.encryptedCalls) {
    const { loadStreamVideoSdk } = await import('../../live/media/load-stream-video-sdk');
    if (!(await loadStreamVideoSdk()).EncryptionManager.isSupported()) throw Error('connect_e2ee_native_unsupported');
  }
  async function prepareKeys(call: ConnectSession) {
    if (call.encryption_required !== true) return;
    if (!security.agent) throw Error('connect_e2ee_unavailable');
    // Resolve authenticated user IDs from the protected context, never profile UI.
    const result = await invokePinnedConnectRpc(supabase as unknown as PinnedConnectRpcClient, 'rpc_connect_key_context', { p_call: call.id, p_device: deviceId }, auth.accessToken(expected));
    auth.accessToken(expected);
    if (result.error) throw Error('connect_key_unavailable');
    const context = result.data as { caller_user_id: string; recipient_user_id: string };
    const key = await security.agent.acquire({ cid: `betweener_connect:${call.id}`, userId: expected.userId, authEpoch: expected.generation,
      generation: call.created_at, participants: [context.caller_user_id, context.recipient_user_id] });
    new Uint8Array(key.key).fill(0);
  }
  const create = services.api.createCall;
  services.api.createCall = async (...args) => {
    const call = await create(...args);
    try {
      if (security.encryptedCalls && call.encryption_required !== true) throw Error('connect_encryption_downgrade');
      await prepareKeys(call); return call;
    }
    catch (error) {
      // A failed encrypted setup must not leave an invitation silently ringing.
      try { const fresh = await services.api.getCall(call.id); await services.api.act(fresh.id, 'cancel', fresh.version, deviceId); } catch { /* Existing expiry/outbox retains cleanup. */ }
      throw error;
    }
  };
  const nativeAnswer = createNativeAnswerLease(() => auth.snapshot()?.generation === expected.generation && auth.snapshot()?.userId === expected.userId);
  const composition = createConnectNativeSafetyComposition({ ...environment, auth, api: terminal.wrapApi(services.api), selfProfileId: profileId,
    nativeAnswerAllowed: nativeAnswer.allowed,
    nativeAnswerReady: nativeAnswer.ready,
    deviceId, uuid: crypto.randomUUID, peer: services.peer, flags, retireOnReconnect: true, failClosedAuthority: true,
    keyAgent: security.agent,
    encryptionInfo: 'encryptionInfo' in security ? security.encryptionInfo : undefined,
    verifyIdentity: 'verifyIdentity' in security ? security.verifyIdentity : undefined,
    reviewIdentity: 'reviewIdentity' in security ? security.reviewIdentity : undefined,
    replaceIdentity: 'replaceIdentity' in security ? security.replaceIdentity : undefined,
    onOwner: owner => terminal.watchOwner(owner) });
  terminal.watch(composition.controller);
  // Foreground discovery still works when push registration is unavailable.
  void services.registerNotificationCapability(deviceId, true).catch(() => undefined);
  let refreshNative=async()=>{};
  const unsubscribePush = subscribePushRegistrations((user, installation) => {
    if (user === expected.userId && installation === deviceId) {
      void services.registerNotificationCapability(deviceId, true).catch(() => undefined);
      void refreshNative().catch(()=>undefined);
    }
  });
  let nativeRegistration: {dispose():void;refresh():Promise<void>} = { dispose() {}, async refresh() {} };
  try {
    if(security.nativeIncoming) {
      const {registerNativeIncomingDevice}=await import('../application/native-device-registration');
      nativeRegistration=await registerNativeIncomingDevice({auth,deviceId,platform:identity.platform,
        async send(body,bearer) {
          const {data,error}=await supabase.functions.invoke('connect-native-device',{body,headers:{Authorization:`Bearer ${bearer}`}});
          return !error && data?.queued===true;
        },
      });
    }
  } catch(error) { unsubscribePush(); try {await composition.dispose();} finally {terminal.dispose();} throw error; }
  refreshNative=nativeRegistration.refresh;
  const setPreferences=services.preferences.set, setMedia=services.preferences.setMedia;
  services.preferences.set=async (...args) => { const result=await setPreferences(...args); void nativeRegistration.refresh().catch(()=>undefined); return result; };
  if(setMedia) services.preferences.setMedia=async (...args) => { const result=await setMedia(...args); void nativeRegistration.refresh().catch(()=>undefined); return result; };
  return { ...composition, services, flags, selfProfileId: profileId, authGeneration: expected.generation, accountUserId: expected.userId,
    async answerNative(call: Awaited<ReturnType<typeof services.api.getCall>>, ready?: () => void) {
      if (!security.nativeIncoming || !call.native_incoming || call.recipient_profile_id !== profileId) return false;
      const release = nativeAnswer.begin(`betweener_connect:${call.id}`,ready);
      try {
        await withinRecoveryBudget(async () => {
          await composition.controller.openCall(call.id);
          await composition.controller.accept();
        }, 20_000);
        const state = composition.controller.getSnapshot();
        return state.session?.id === call.id && state.session.created_at === call.created_at && state.audioSetupStage === 'ready';
      } finally { release(); }
    },
    withdrawCallingConsent: () => withdrawCallingConsent({ hangup: () => composition.controller.hangup(), setPreferences: services.preferences.set }),
    dispose: async () => { unsubscribePush(); nativeRegistration.dispose(); try { await composition.dispose(); } finally { terminal.dispose(); } } };
}
const acquireProduct = createProductLeaseRegistry<Awaited<ReturnType<typeof buildConnectProduct>>>();
export const loadConnectProduct = (identity: ConnectRuntimeIdentity, auth: NativeSessionOwner, profileId: string) => acquireProduct(auth, () => buildConnectProduct(identity, auth, profileId));
