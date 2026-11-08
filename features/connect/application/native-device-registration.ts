import type { NativeSessionOwner } from '../../../lib/auth/native-session-owner';
import { getConnectIncomingConfig, handleConnectNativeCallAction } from './native-incoming-bootstrap';
interface RegistrationInput {
  auth: NativeSessionOwner; deviceId: string; platform: string;
  send(body: { deviceId: string; platform: 'ios' | 'android'; token: string; register: boolean }, bearer: string): Promise<boolean>;
}
/** Tokens stay in memory and the protected request body. Provider reconciliation
 * uses durable session-bound intents; disposal is not the only logout defence. */
export async function registerNativeIncomingDevice(input: RegistrationInput) {
  if (!getConnectIncomingConfig().enabled || !['ios', 'android'].includes(input.platform)) return { dispose() {}, async refresh() {} };
  const expected = input.auth.snapshot(); if (!expected) throw Error('connect_unauthenticated');
  const subscriptions: (() => void)[] = [];
  let currentToken: string | null = null, registeredToken: string | null = null;
  let disposed = false, lastBearer = input.auth.accessToken(expected);
  let pending = Promise.resolve();
  const receiveOne = async (token: string) => {
    if (disposed || registeredToken === token) return;
    const bearer = input.auth.accessToken(expected);
    lastBearer = bearer;
    if (currentToken && currentToken !== token) await input.send({ deviceId: input.deviceId, platform: input.platform as 'ios' | 'android', token: currentToken, register: false },bearer);
    currentToken=token;
    if (!await input.send({ deviceId: input.deviceId, platform: input.platform as 'ios' | 'android', token, register: true }, bearer)) throw Error('connect_native_registration_unavailable');
    input.auth.accessToken(expected); if (!disposed) registeredToken=token;
  };
  const receive = (token: string) => {
    const work=pending.catch(()=>undefined).then(()=>receiveOne(token)); pending=work; return work;
  };
  const retire = (logout=false) => {
    if(disposed) return;
    disposed = true;
    if(logout && currentToken) {
      const body={deviceId:input.deviceId,platform:input.platform as 'ios'|'android',token:currentToken,register:false};
      // Best effort only. Session invalidation and durable destination ownership
      // remain the server fallback; late removal cannot delete a successor.
      void input.send(body,lastBearer).catch(()=>undefined);
    }
    for (const remove of subscriptions.splice(0)) remove(); currentToken=null; registeredToken=null; lastBearer='';
  };
  let requestToken=async () => {};
  const registration = { dispose: retire, async refresh() { registeredToken=null; if(currentToken) await receive(currentToken); else await requestToken(); } };
  subscriptions.push(input.auth.subscribe(() => {
    if (input.auth.snapshot()?.generation !== expected.generation) retire(true);
    else { try {lastBearer=input.auth.accessToken(expected);} catch {retire(true);} }
  }));
  try { if (input.platform === 'ios') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CallingxModule: port } = require('@stream-io/react-native-callingx') as typeof import('@stream-io/react-native-callingx');
    const subscription = port.addEventListener('voipNotificationsRegistered', ({ token }) => { void receive(token).catch(() => undefined); });
    subscriptions.push(() => subscription.remove());
    for (const { eventName, params } of port.getInitialVoipEvents()) {
      if (eventName === 'voipNotificationsRegistered' && 'token' in params) void receive(params.token).catch(() => undefined);
      if (eventName === 'voipNotificationReceived' && 'stream' in params) void handleConnectNativeCallAction({ cid: params.stream.call_cid, action: 'incoming' });
    }
    requestToken=async()=>{ if(!disposed) port.registerVoipToken(); }; await requestToken();
  } else {
    // Reuse the app's existing notification permission. Do not prompt or capture.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CallingxModule: port } = require('@stream-io/react-native-callingx') as typeof import('@stream-io/react-native-callingx');
    let listening=false;
    requestToken=async()=>{
      if(disposed || !port.canPostNotifications) return;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const messaging = require('@react-native-firebase/messaging') as typeof import('@react-native-firebase/messaging');
      const client=messaging.getMessaging();
      if(!listening) { listening=true; subscriptions.push(messaging.onTokenRefresh(client,token=>{void receive(token).catch(()=>undefined);})); }
      await messaging.getToken(client).then(receive);
    };
    void requestToken().catch(()=>undefined);
  } } catch(error) {retire();throw error;}
  return registration;
}
