// @ts-nocheck -- Deno-only, pinned SDK; no credentials or tokens in evidence.
/* eslint-disable import/no-unresolved -- Deno npm resolution. */
import { StreamClient } from 'npm:@stream-io/node-sdk@0.7.63';

export const root = new URL('../../', import.meta.url);
export const evidenceDirectory = new URL('tmp/connect-m2/', root);
export const safeError = (error: unknown) => ({
  status: Number(error?.status ?? error?.statusCode ?? error?.metadata?.responseCode ?? error?.response?.status) || null,
  code: Number(error?.code) || null,
});
export function requireCondition(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}
export async function stagingClient() {
  const text = await Deno.readTextFile(new URL('.env.stream-audit.local', root));
  const values = Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/.exec(line);
    return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
  }));
  const key = values.STREAM_STAGING_API_KEY;
  const secret = values.STREAM_STAGING_API_SECRET;
  requireCondition(key && secret, 'missing_staging_credentials');
  const client = new StreamClient(key, secret);
  await verifyApp(client);
  const redact = (message: string) => Object.values(values).filter((value) => value.length >= 6)
    .reduce((safe, value) => safe.replaceAll(value, '[REDACTED]'), String(message))
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]').slice(0, 1500);
  return { client, key, redact };
}
export async function verifyApp(client: StreamClient) {
  const { app } = await client.getApp();
  requireCondition(app.id === 1731011 && app.name === 'Betweener Staging'
    && app.disable_auth_checks === false && app.disable_permissions_checks === false, 'staging_identity_or_checks_mismatch');
  return { id: app.id, name: app.name, disable_auth_checks: app.disable_auth_checks, disable_permissions_checks: app.disable_permissions_checks };
}
export async function writeEvidence(name: string, value: unknown) {
  await Deno.mkdir(evidenceDirectory, { recursive: true });
  await Deno.writeTextFile(new URL(name, evidenceDirectory), JSON.stringify(value, null, 2) + '\n');
}
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
export async function digest(value: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value))));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function matchesSubset(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length
    && [...actual].sort().join('\0') === [...expected].sort().join('\0');
  if (expected && typeof expected === 'object') return !!actual && Object.entries(expected).every(([k, v]) => matchesSubset(actual[k], v));
  return actual === expected;
}
export function isolatedCallTypes(types: Record<string, unknown>) {
  return Object.fromEntries(Object.values(types).filter((type) => type.name !== 'betweener_connect').map((type) =>
    [type.name, { name: type.name, grants: type.grants, settings: type.settings, notification_settings: type.notification_settings }]));
}
