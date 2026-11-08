import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { APP_IDENTITY } from '../../../config/app-identity';
import { getApplicationNativeSession } from '../../../lib/auth/application-native-owner';
import { nativeIncomingPolicy } from '../config/native-incoming-policy';
import { createNativeCallCoordinator, type NativeCallEvent } from './native-call-coordinator';

const identity = () => ({ development: typeof __DEV__ !== 'undefined' && __DEV__, platform: Platform.OS,
  variant: APP_IDENTITY.variant, bundleIdentifier: Application.applicationId ?? '', environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? '',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '' });
export const getConnectIncomingConfig = () => nativeIncomingPolicy(identity(), {
  enabled: process.env.EXPO_PUBLIC_CONNECT_NATIVE_INCOMING,
  apnsProvider: process.env.EXPO_PUBLIC_CONNECT_APNS_PROVIDER, fcmProvider: process.env.EXPO_PUBLIC_CONNECT_FCM_PROVIDER,
});
const callingx = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@stream-io/react-native-callingx') as typeof import('@stream-io/react-native-callingx')).CallingxModule;
};
let device: string | null = null, subscribed = false;
const deviceId = async () => {
  if (!device) { const { getPushInstallationId } = await import('../../../lib/notifications/push'); device = await getPushInstallationId(APP_IDENTITY.bundleIdentifier); }
  return device;
};
const coordinator = createNativeCallCoordinator({ enabled: () => getConnectIncomingConfig().enabled,
  now: Date.now, deviceId,
  current(user, epoch) { const live = getApplicationNativeSession().owner.snapshot(); return live?.userId === user && live.generation === epoch; },
  close: (cid, reason) => callingx().endCallWithReason(cid, reason),
  async identify(cid,product,profile) {
    if (!callingx().isCallTracked(cid) || !product.services.peer) return;
    const peer = await product.services.peer(profile), live = getApplicationNativeSession().owner.snapshot();
    if (live?.userId !== product.accountUserId || live.generation !== product.authGeneration) throw Error('connect_unauthenticated');
    await callingx().updateDisplay(cid,cid,peer.name,true);
  },
  async keepAlive(cid) {
    const owner = `connect-native-incoming:${cid}`, port = callingx();
    if (Platform.OS === 'android') await port.acquireBackgroundTask(owner);
    return async () => { if (Platform.OS === 'android') await port.releaseBackgroundTask(owner); };
  },
  async load() {
    if (!getConnectIncomingConfig().enabled) throw Error('connect_disabled');
    const { supabase } = await import('../../../lib/supabase');
    const auth = getApplicationNativeSession();
    if (!subscribed) {
      subscribed = true;
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session || (auth.owner.snapshot() && session.user.id !== auth.owner.snapshot()!.userId)) {
          auth.invalidate(); void coordinator.dispose();
        } else if (event === 'TOKEN_REFRESHED' && auth.owner.snapshot()?.userId === session.user.id) {
          // Supabase's successful refresh preserves the same trusted account;
          // the owner still rejects a retired or changed session identifier.
          auth.accept(session);
        }
      });
    }
    const { data: local, error: localError } = await supabase.auth.getSession();
    const session = local.session;
    if (localError || !session) throw Error('connect_unauthenticated');
    // Persisted session state alone cannot own a native Answer. Validate it.
    const { data: verified, error } = await supabase.auth.getUser(session.access_token);
    if (error || verified.user?.id !== session.user.id) throw Error('connect_unauthenticated');
    const { data: current } = await supabase.auth.getSession();
    if (current.session?.access_token !== session.access_token) throw Error('connect_unauthenticated');
    auth.accept(session); const expected = auth.owner.snapshot();
    if (!expected) throw Error('connect_unauthenticated');
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id,user_id').eq('user_id', expected.userId).single()
      .setHeader('Authorization', `Bearer ${auth.owner.accessToken(expected)}`);
    auth.owner.accessToken(expected);
    if (profileError || profile?.user_id !== expected.userId) throw Error('connect_unauthenticated');
    const { loadConnectProduct } = await import('../data/load-connect-product');
    const product = await loadConnectProduct(identity(), auth.owner, profile.id);
    if (product.flags.nativeIncoming !== true) { await product.dispose(); throw Error('connect_disabled'); }
    return product;
  },
});
export const handleConnectNativeCallAction = (event: NativeCallEvent) => coordinator.handle(event);
