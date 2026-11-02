// @ts-nocheck -- Read-only, pinned Deno SDK; no user/call/configuration mutations.
import { stagingClient, verifyApp, digest } from './lib/connect-stream-audit.ts';
import { assertConnectCallType } from '../supabase/functions/_shared/connect-stream-adapter.ts';
import type { LimitsSettingsRequest } from 'npm:@stream-io/node-sdk@0.7.63';

// This shape is also checked against the actual pinned server SDK by deno check.
const timerShape: LimitsSettingsRequest = { max_duration_seconds: 60, max_participants: 2 };
const { client } = await stagingClient();
const { call_types: types } = await client.video.listCallTypes();
const type = Object.values(types).find((item) => item.name === 'betweener_connect');
assertConnectCallType(type);
const audit = {
  recordedAt: new Date().toISOString(), mode: 'READ_ONLY', providerWrites: 0,
  app: await verifyApp(client), serverSdk: '0.7.63', clientSdk: '1.62.0',
  sdkTimerRequestShape: timerShape,
  callType: { name: type.name, grants: type.grants, limits: type.settings.limits, session: type.settings.session },
  joinEndedCallRoles: Object.entries(type.grants).filter(([, grants]) => grants.includes('join-ended-call')).map(([role]) => role),
  callTypesDigest: await digest(types),
  durationLimitEnabled: Number(type.settings.limits?.max_duration_seconds ?? 0) > 0,
  timerEnforcementExecuted: false,
};
await Deno.mkdir('tmp/connect-boundary', { recursive: true });
await Deno.writeTextFile('tmp/connect-boundary/provider-audit.json', JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify(audit));
