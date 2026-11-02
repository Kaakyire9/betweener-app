// @ts-nocheck -- Deno-only read-only provider audit; never prints credentials.
/* eslint-disable import/no-unresolved -- Deno resolves the pinned server SDK. */
import { StreamClient } from 'npm:@stream-io/node-sdk@0.7.63';
const root = new URL('../', import.meta.url);
function parseEnv(text: string): Record<string, string> {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/.exec(line);
    return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
  }));
}
const safeError = (e: unknown) => ({ status: Number(e?.status ?? e?.statusCode ?? e?.metadata?.responseCode ?? e?.response?.status) || null, code: Number(e?.code) || null });
const audit: Record<string, unknown> = { timestamp: new Date().toISOString(), mode: 'READ_ONLY', credentialGroup: 'STREAM_STAGING', providerWrites: 0 };
try {
  const secrets = parseEnv(await Deno.readTextFile(new URL('.env.stream-audit.local', root)));
  const key = secrets.STREAM_STAGING_API_KEY; const secret = secrets.STREAM_STAGING_API_SECRET;
  if (!key || !secret) throw new Error('missing_staging_credentials');
  const client = new StreamClient(key, secret);
  audit.phase = 'application';
  const { app } = await client.getApp();
  audit.app = { id: app.id, name: app.name, disable_auth_checks: app.disable_auth_checks, disable_permissions_checks: app.disable_permissions_checks };
  if (/\bproduction\b/i.test(app.name) && !/staging|development|sandbox/i.test(app.name)) throw new Error('production_identity_stop');
  const local = parseEnv(await Deno.readTextFile(new URL('.env.local', root)));
  const base = parseEnv(await Deno.readTextFile(new URL('.env', root)));
  const configured = local.EXPO_PUBLIC_STREAM_VIDEO_API_KEY || base.EXPO_PUBLIC_STREAM_VIDEO_API_KEY;
  audit.clientKeyConfigured = !!configured;
  audit.clientKeyMatchesStagingCredential = configured ? configured === key : null;
  audit.localVariant = local.APP_VARIANT ?? null;
  audit.phase = 'roles';
  const roles = await client.listRoles(); audit.roles = roles.roles.map((r) => ({ name: r.name, custom: r.custom, scopes: r.scopes }));
  audit.phase = 'permissions';
  const permissions = await client.listPermissions(); audit.permissionIds = permissions.permissions.map((p) => p.id);
  audit.phase = 'call_types';
  const types = await client.video.listCallTypes(); audit.callTypeNames = Object.values(types.call_types).map((t) => t.name);
  audit.existingCallTypeGrants = Object.fromEntries(Object.values(types.call_types).map((t) => [t.name, t.grants]));
  audit.phase = 'connect_call_type';
  try {
    const type = await client.video.getCallType({ name: 'betweener_connect' });
    audit.connectCallType = { name: type.name, grants: type.grants, settings: type.settings };
    audit.connectCallTypeResponse = { status: 200, code: null };
  } catch (e) { audit.connectCallTypeResponse = safeError(e); }
  audit.phase = 'complete';
} catch (e) { audit.failure = { ...safeError(e), name: e?.name, reason: ['missing_staging_credentials','production_identity_stop'].includes(e?.message) ? e.message : 'provider_audit_unavailable' }; }
await Deno.mkdir(new URL('tmp/connect-m2/', root), { recursive: true });
await Deno.writeTextFile(new URL('tmp/connect-m2/provider-audit.json', root), JSON.stringify(audit, null, 2));
console.log(JSON.stringify({ mode: audit.mode, app: audit.app, clientKeyConfigured: audit.clientKeyConfigured,
  clientKeyMatchesStagingCredential: audit.clientKeyMatchesStagingCredential, callTypeNames: audit.callTypeNames,
  connectCallTypeResponse: audit.connectCallTypeResponse, failure: audit.failure, providerWrites: 0 }));
