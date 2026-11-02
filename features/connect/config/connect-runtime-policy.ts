import { connectFeatureFlags, type ConnectFeatureFlags } from './connect-feature-flags.ts';

/** Voice testing is available only in the native staging development app. */
export const connectProductPolicy = Object.freeze({ ui: true, nativeRuntime: true, videoTransport: false });
const stagingVoiceFeatures: Readonly<ConnectFeatureFlags> = Object.freeze({ nativeSafetyOwner: true, endCallAndBlock: false });
export interface ConnectRuntimeIdentity {
  development: boolean; platform: string; variant: string; environment: string;
  bundleIdentifier: string; supabaseUrl: string;
}
export function connectRuntimeAvailability(identity: ConnectRuntimeIdentity,
  policy: { ui: boolean; nativeRuntime: boolean; videoTransport: boolean } = connectProductPolicy,
  flags: ConnectFeatureFlags = stagingVoiceFeatures) {
  let stagingBackend = false;
  try { const url = new URL(identity.supabaseUrl); stagingBackend = url.protocol === 'https:' && url.host === 'xsgzxadwuxuziubglvps.supabase.co' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash; } catch { /* Fail closed. */ }
  const staging = identity.development && ['ios', 'android'].includes(identity.platform) && identity.variant === 'staging'
    && identity.environment === 'staging' && identity.bundleIdentifier === 'com.aduboffour.betweener.staging' && stagingBackend;
  return Object.freeze({ ui: staging && policy.ui === true,
    runtime: staging && policy.ui === true && policy.nativeRuntime === true && flags.nativeSafetyOwner === true,
    video: false as const });
}

/** Internal transports stay default-off outside the verified product identity. */
export function connectRuntimeFeatureFlags(identity: ConnectRuntimeIdentity): Readonly<ConnectFeatureFlags> {
  return connectRuntimeAvailability(identity).runtime ? stagingVoiceFeatures : connectFeatureFlags;
}
