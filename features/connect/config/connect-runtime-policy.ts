import { connectFeatureFlags, type ConnectFeatureFlags } from './connect-feature-flags.ts';

/** Owner-authorised voice/video testing in the native staging development app. */
export const connectProductPolicy = Object.freeze({ ui: true, nativeRuntime: true, videoTransport: true });
const stagingCallingFeatures: Readonly<ConnectFeatureFlags> = Object.freeze({ nativeSafetyOwner: true, endCallAndBlock: true, videoCalling: true, videoCameraOnEntry: true, backgroundAudio: true, connectionRecovery: true });
export interface ConnectRuntimeIdentity {
  development: boolean; platform: string; variant: string; environment: string;
  bundleIdentifier: string; supabaseUrl: string;
}
export function connectRuntimeAvailability(identity: ConnectRuntimeIdentity,
  policy: { ui: boolean; nativeRuntime: boolean; videoTransport: boolean } = connectProductPolicy,
  flags: ConnectFeatureFlags = stagingCallingFeatures) {
  let stagingBackend = false;
  try { const url = new URL(identity.supabaseUrl); stagingBackend = url.protocol === 'https:' && url.host === 'xsgzxadwuxuziubglvps.supabase.co' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash; } catch { /* Fail closed. */ }
  const staging = identity.development && ['ios', 'android'].includes(identity.platform) && identity.variant === 'staging'
    && identity.environment === 'staging' && identity.bundleIdentifier === 'com.aduboffour.betweener.staging' && stagingBackend;
  const runtime = staging && policy.ui === true && policy.nativeRuntime === true && flags.nativeSafetyOwner === true;
  return Object.freeze({ ui: staging && policy.ui === true,
    runtime, video: runtime && policy.videoTransport === true && flags.videoCalling === true });
}

/** Internal transports stay default-off outside the verified product identity. */
export function connectRuntimeFeatureFlags(identity: ConnectRuntimeIdentity): Readonly<ConnectFeatureFlags> {
  return connectRuntimeAvailability(identity).runtime ? stagingCallingFeatures : connectFeatureFlags;
}
