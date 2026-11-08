import { connectRuntimeAvailability, type ConnectRuntimeIdentity } from './connect-runtime-policy.ts';
export function nativeIncomingPolicy(identity: ConnectRuntimeIdentity, config: { enabled?: string; apnsProvider?: string; fcmProvider?: string }) {
  const alias = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
  const enabled = connectRuntimeAvailability(identity).runtime && config.enabled === 'true'
    && alias.test(config.apnsProvider ?? '') && alias.test(config.fcmProvider ?? '');
  return { enabled, ...(enabled ? { ios: { pushProviderName: config.apnsProvider! }, android: { pushProviderName: config.fcmProvider! } } : {}) };
}
