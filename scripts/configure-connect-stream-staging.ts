// @ts-nocheck -- Explicitly approved staging-only configuration. No existing type updates.
import { digest, isolatedCallTypes, matchesSubset, requireCondition, root, safeError, stagingClient, verifyApp, writeEvidence } from './lib/connect-stream-audit.ts';
import { assertConnectCallType } from '../supabase/functions/_shared/connect-stream-adapter.ts';

requireCondition(Deno.args.includes('--apply-approved-proposal'), 'explicit_apply_argument_required');
const proposal = JSON.parse(await Deno.readTextFile(new URL('docs/betweener-connect/stream-staging-connect-proposal.json', root)));
requireCondition(await digest(proposal) === '64c5af1bee8cb45288a4c72795e8b3e4d30bd10ed099692dc4f26bae436ea958', 'proposal_differs_from_approved_revision');
// Chat/feed built-ins cannot be named in video grants. Their approved arrays are empty.
const excludedNonVideoRoles = ['channel_member', 'channel_moderator', 'feed_follower', 'feed_member', 'feed_member_viewer', 'feed_moderator'];
const approvedType = structuredClone(proposal.create_call_type);
for (const role of excludedNonVideoRoles) {
  requireCondition(approvedType.grants[role]?.length === 0, 'proposal_non_video_role_has_permissions');
  delete approvedType.grants[role];
}
function matchesApproved(type) {
  const normalized = structuredClone(type);
  // Provider omits grant entries that have no applicable role/configuration.
  for (const [role, grants] of Object.entries(approvedType.grants)) {
    if (grants.length === 0 && normalized.grants[role] === undefined) normalized.grants[role] = [];
  }
  return matchesSubset(normalized, approvedType);
}
const receipt = { timestamp: new Date().toISOString(), approval: 'User approved scoped development configuration and isolated tests',
  target: proposal.target, proposalSha256: await digest(proposal), writes: [], checks: {}, result: 'IN_PROGRESS' };
let redact = () => 'provider_configuration_request_failed';
try {
  requireCondition(proposal.target.app_id === 1731011 && proposal.target.credential_group === 'STREAM_STAGING'
    && proposal.create_call_type.name === 'betweener_connect'
    && proposal.create_roles.map((role) => role.name).sort().join(',') === 'connect_invited,connect_video,connect_voice', 'proposal_scope_mismatch');
  const staging = await stagingClient();
  const { client } = staging;
  redact = staging.redact;
  receipt.app = await verifyApp(client);
  const before = await client.video.listCallTypes();
  const baseline = isolatedCallTypes(before.call_types);
  receipt.existingTypesBeforeSha256 = await digest(baseline);
  // Persist the baseline before the first write, so interruption cannot lose it.
  await writeEvidence('provider-configuration-before.json', { app: receipt.app, existingCallTypes: baseline });
  const existingRoles = new Set((await client.listRoles()).roles.map((role) => role.name));
  for (const role of proposal.create_roles) {
    if (existingRoles.has(role.name)) continue;
    const response = await client.createRole(role);
    receipt.writes.push({ operation: 'createRole', name: role.name, status: response.metadata.responseCode });
    await writeEvidence('provider-configuration-receipt.json', receipt);
  }
  const existingType = Object.values(before.call_types).find((type) => type.name === 'betweener_connect');
  if (existingType) {
    // Reconcile only the disabled RTMP value the create endpoint defaulted to true.
    const withoutRtmpDefault = structuredClone(existingType);
    withoutRtmpDefault.settings.broadcasting.rtmp.enabled = false;
    requireCondition(matchesApproved(withoutRtmpDefault), 'existing_connect_type_differs_stop_without_update');
  } else {
    // Required by provider validation even for disabled features. These carry no grants.
    const request = structuredClone(approvedType);
    request.settings.video.target_resolution = { width: 640, height: 480, bitrate: 600000 };
    request.settings.broadcasting.hls.quality_tracks = ['720p'];
    request.settings.frame_recording.capture_interval_in_seconds = 3;
    receipt.disabledFeatureValidationDefaults = { video: request.settings.video.target_resolution,
      hls_quality_tracks: ['720p'], frame_capture_interval_seconds: 3 };
    receipt.omittedUnsupportedEmptyRoles = excludedNonVideoRoles;
    const response = await client.video.createCallType(request);
    receipt.writes.push({ operation: 'createCallType', name: 'betweener_connect', status: response.metadata.responseCode });
  }
  let type = await client.video.getCallType({ name: 'betweener_connect' });
  if (type.settings.broadcasting.enabled === false && type.settings.broadcasting.rtmp.enabled !== false) {
    const response = await client.video.updateCallType({ name: 'betweener_connect', settings: {
      broadcasting: { enabled: false, rtmp: { enabled: false, quality: '720p' } },
    } });
    receipt.writes.push({ operation: 'disableConnectRtmp', name: 'betweener_connect', status: response.metadata.responseCode });
    type = await client.video.getCallType({ name: 'betweener_connect' });
  }
  receipt.readback = { name: type.name, grants: type.grants, settings: type.settings, notification_settings: type.notification_settings };
  receipt.checks.approvedSubsetMatches = matchesApproved(type);
  receipt.checks.existingTypesUnchanged = receipt.existingTypesBeforeSha256 === await digest(isolatedCallTypes((await client.video.listCallTypes()).call_types));
  receipt.checks.globalChecksEnabled = !!await verifyApp(client);
  assertConnectCallType(type);
  receipt.checks.localAdapterPolicyAccepted = true;
  requireCondition(Object.values(receipt.checks).every(Boolean), 'configuration_readback_mismatch');
  receipt.result = 'PASS';
} catch (error) {
  receipt.result = 'BLOCKED';
  receipt.failure = { ...safeError(error), reason: redact(error?.message ?? 'provider_configuration_request_failed') };
} finally {
  await writeEvidence('provider-configuration-receipt.json', receipt);
  await writeEvidence(`provider-configuration-${receipt.timestamp.replaceAll(':', '-')}.json`, receipt);
  console.log(JSON.stringify({ target: receipt.target, writes: receipt.writes, checks: receipt.checks, result: receipt.result, failure: receipt.failure }));
}
if (receipt.result !== 'PASS') Deno.exit(1);
