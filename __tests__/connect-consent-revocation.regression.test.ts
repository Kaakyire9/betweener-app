import assert from 'node:assert/strict';
import test from 'node:test';
import { revokeConnectConsent, type ConnectRevocationStore } from '../supabase/functions/_shared/connect-consent-revocation.ts';
import { assertConnectSessionSettings } from '../supabase/functions/_shared/connect-stream-adapter.ts';
import { assertConnectJobAcknowledged, runConnectEndJob } from '../supabase/functions/_shared/connect-provider-worker.ts';

const call = 'fc110000-0000-4000-8000-000000000001';
function fixture() {
  const events: string[] = [];
  const store: ConnectRevocationStore = {
    async revoke() { events.push('commit'); return { revoked: true, calls: [call], pending_count: 1 }; },
    async claimEnd(id) { events.push('claim'); return { call_id: id, operation: 'end', lease: 'lease' }; },
    async complete(_, success) { events.push(success ? 'ack' : 'retry'); },
    async snapshot() { throw new Error('end must survive deleted sessions'); },
    async reconcile() { throw new Error('cleanup cannot certify media'); },
  };
  const provider = { async end() { events.push('provider-end'); return { type: 'betweener_connect' as const, id: call,
    outcome: 'accepted' as const, mediaEnforcement: 'unverified' as const }; } };
  return { events, store, provider };
}
test('revocation commits authority before provider cleanup and requires completion ACK', async () => {
  const f = fixture();
  assert.deepEqual(await revokeConnectConsent('grant', f.store, f.provider), { revoked: true, providerCleanup: 'complete' });
  assert.deepEqual(f.events, ['commit', 'claim', 'provider-end', 'ack']);
});
test('provider outage preserves revoked authority and reports cleanup pending', async () => {
  const f = fixture(); f.provider.end = async () => { throw new Error('outage'); };
  assert.deepEqual(await revokeConnectConsent('grant', f.store, f.provider), { revoked: true, providerCleanup: 'pending' });
  assert.deepEqual(f.events, ['commit', 'claim', 'retry']);
});
test('an unclaimed concurrent worker lease cannot count as completed termination', async () => {
  const f = fixture(); f.store.claimEnd = async () => null;
  assert.equal((await revokeConnectConsent('grant', f.store, f.provider)).providerCleanup, 'pending');
  assert.deepEqual(f.events, ['commit']);
});
test('a failed completion ACK and a partial batch never claim remote cleanup complete', async () => {
  const f = fixture(); f.store.complete = async () => { throw new Error('database unavailable'); };
  assert.equal((await revokeConnectConsent('grant', f.store, f.provider)).providerCleanup, 'pending');
  const more = fixture(); more.store.revoke = async () => ({ revoked: true, calls: [call], pending_count: 2 });
  assert.equal((await revokeConnectConsent('grant', more.store, more.provider)).providerCleanup, 'pending');
});
test('false or malformed RPC completion results keep authoritative revocation cleanup pending', async () => {
  assert.doesNotThrow(() => assertConnectJobAcknowledged(true));
  for (const value of [false, null, undefined, 'true', { ack: true }]) {
    const f = fixture();
    f.store.complete = async () => { assertConnectJobAcknowledged(value); };
    assert.equal((await revokeConnectConsent('grant', f.store, f.provider)).providerCleanup, 'pending');
    assert.deepEqual(f.events, ['commit', 'claim', 'provider-end']);
  }
});
test('an unacknowledged worker completion cannot return a successful cleanup result', async () => {
  const f = fixture();
  f.store.complete = async () => { assertConnectJobAcknowledged(false); };
  await assert.rejects(runConnectEndJob({ call_id: call, operation: 'end', lease: 'stale' }, f.store, f.provider), /connect_job_not_acknowledged/);
  assert.deepEqual(f.events, ['provider-end']);
});
test('invalid authoritative revocation never invokes provider changes', async () => {
  const f = fixture(); f.store.revoke = async () => { throw new Error('unauthorized'); };
  await assert.rejects(revokeConnectConsent('grant', f.store, f.provider)); assert.deepEqual(f.events, []);
});
const settings = () => ({ video: { enabled: false, camera_default_on: false, access_request_enabled: false }, audio: { access_request_enabled: false },
  recording: { mode: 'disabled' }, transcription: { mode: 'disabled', closed_caption_mode: 'disabled' },
  individual_recording: { mode: 'disabled' }, raw_recording: { mode: 'disabled' }, frame_recording: { mode: 'disabled' },
  screensharing: { enabled: false, access_request_enabled: false }, thumbnails: { enabled: false }, ingress: { enabled: false },
  broadcasting: { enabled: false, hls: { enabled: false }, rtmp: { enabled: false } }, limits: { max_participants: 2 },
});
test('VOICE_ONLY and VIDEO require distinct exact per-call settings', () => {
  const voice = settings(); assert.doesNotThrow(() => assertConnectSessionSettings(voice, 'voice'));
  assert.throws(() => assertConnectSessionSettings(voice, 'video'));
  voice.video.enabled = true; assert.doesNotThrow(() => assertConnectSessionSettings(voice, 'video'));
  assert.throws(() => assertConnectSessionSettings(voice, 'voice'));
});
test('neither media policy admits screenshare, recording, transcription or broadcasting', () => {
  for (const media of ['voice', 'video'] as const) for (const field of ['screensharing', 'recording', 'transcription', 'broadcasting'] as const) {
    const unsafe = settings(); unsafe.video.enabled = media === 'video';
    if (field === 'recording' || field === 'transcription') unsafe[field].mode = 'available'; else unsafe[field].enabled = true;
    assert.throws(() => assertConnectSessionSettings(unsafe, media));
  }
});
