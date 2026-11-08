import type { ConnectRuntimeIdentity } from '../config/connect-runtime-policy';

export function isConnectStartupTarget(identity: ConnectRuntimeIdentity) {
  return identity.development && ['ios', 'android'].includes(identity.platform) && identity.variant === 'staging'
    && identity.environment === 'staging' && identity.bundleIdentifier === 'com.aduboffour.betweener.staging'
    && identity.supabaseUrl === 'https://xsgzxadwuxuziubglvps.supabase.co';
}
interface AuthFacts { account: string | null; ownerAccount: string | null; profileAccount: string | null; sessionAccount: string | null; epoch: string | null; trusted: boolean }
interface Input {
  identity: ConnectRuntimeIdentity; marker: string; version: string | null; build: string | null;
  gates: { ui: boolean; nativeRuntime: boolean; videoTransport: boolean; nativeSafetyOwner: boolean; endCallAndBlock: boolean };
  auth(): AuthFacts; modules: Record<string, () => boolean>; microphonePermission(): Promise<string>;
}
/** Metadata and permission-status reads only; never receives credentials or a media owner. */
export async function inspectConnectStartup(input: Input) {
  if (!isConnectStartupTarget(input.identity) || Object.values(input.gates).some(value => value !== false)) throw new Error('connect_startup_check_requires_disabled_staging');
  const before = input.auth();
  const native: Record<string, boolean> = {};
  for (const [name, inspect] of Object.entries(input.modules)) { try { native[name] = inspect() === true; } catch { native[name] = false; } }
  let microphone = 'unknown';
  try { const status = await input.microphonePermission(); if (['granted', 'denied', 'undetermined'].includes(status)) microphone = status; } catch { /* Unknown is not a successful permission check. */ }
  const after = input.auth();
  const authBound = !!before.account && !!before.epoch && before.trusted && after.trusted && before.account === after.account && before.epoch === after.epoch
    && after.account === after.ownerAccount && after.account === after.profileAccount && after.account === after.sessionAccount;
  return { scope: 'staging_startup_metadata_only', marker: input.marker, platform: input.identity.platform, version: input.version, build: input.build,
    target: 'xsgzxadwuxuziubglvps', bundle: input.identity.bundleIdentifier, native, nativeApisPresent: Object.keys(native).length > 0 && Object.values(native).every(Boolean),
    authBound, microphone, gatesOff: true, streamClientCreated: false, mediaRequested: false, hardwareVerified: false };
}
