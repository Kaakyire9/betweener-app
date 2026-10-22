import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseLiveAudienceDelivery,
  parseLiveBroadcastArtifactMetadata,
  resolveLiveAudienceDelivery,
} from '../packages/live-program-domain/src/index.ts';

const sessionId = '11111111-1111-4111-8111-111111111111';

test('interactive hosts and speakers always stay on RTC', () => {
  const delivery = resolveLiveAudienceDelivery({
    sessionId,
    interactive: true,
    sessionLive: true,
    deliveryMode: 'hybrid_hls',
    compositorLive: true,
    hlsLive: true,
    hlsPlaylistUrl: 'https://video.example.test/live/program.m3u8',
  });

  assert.equal(delivery.transport, 'rtc_interactive');
  assert.equal(delivery.hls, null);
  assert.equal(parseLiveAudienceDelivery(delivery)?.transport, 'rtc_interactive');
});
test('passive audiences use HLS only after the authoritative Program output is ready', () => {
  const base = {
    sessionId,
    interactive: false,
    sessionLive: true,
    deliveryMode: 'hybrid_hls' as const,
    compositorLive: true,
    hlsLive: true,
    hlsPlaylistUrl: 'https://video.example.test/live/program.m3u8',
  };
  const hls = resolveLiveAudienceDelivery(base);
  assert.equal(hls.transport, 'hls_passive');
  assert.equal(hls.hls?.playlistUrl, base.hlsPlaylistUrl);

  for (const unavailable of [
    { ...base, sessionLive: false },
    { ...base, compositorLive: false },
    { ...base, hlsLive: false },
    { ...base, hlsPlaylistUrl: null },
    { ...base, deliveryMode: 'rtc_only' as const },
  ]) {
    assert.equal(resolveLiveAudienceDelivery(unavailable).transport, 'rtc_fallback');
  }
});
test('delivery parser rejects HTTP playlists and contradictory interactive state', () => {
  const valid = resolveLiveAudienceDelivery({
    sessionId,
    interactive: false,
    sessionLive: true,
    deliveryMode: 'hybrid_hls',
    compositorLive: true,
    hlsLive: true,
    hlsPlaylistUrl: 'https://video.example.test/live/program.m3u8',
  });
  assert.ok(parseLiveAudienceDelivery(valid));
  assert.equal(parseLiveAudienceDelivery({
    ...valid,
    hls: { playlistUrl: 'http://video.example.test/live/program.m3u8', latencyClass: 'standard' },
  }), null);
  assert.equal(parseLiveAudienceDelivery({ ...valid, interactive: true }), null);
  assert.equal(parseLiveAudienceDelivery({ ...valid, privateDecisions: [] }), null);
});
test('artifact metadata accepts only public Program facts', () => {
  assert.deepEqual(parseLiveBroadcastArtifactMetadata({
    programVersion: 8,
    scene: 'host_plus_pool',
    canvas: 'portrait_9_16',
    language: 'en',
    translationLanguages: ['tw'],
    width: 1080,
    height: 1920,
    container: 'mp4',
    consentVersion: 'public-media-v1',
  })?.scene, 'host_plus_pool');

  for (const privateMetadata of [
    { reactions: [{ userId: sessionId, reaction: 'heart' }] },
    { privateMessages: ['hold the scene'] },
    { sparkDecision: 'continue' },
    { audiencePulseBallots: [sessionId] },
    { scene: { name: 'host_focus', privateDecision: true } },
  ]) assert.equal(parseLiveBroadcastArtifactMetadata(privateMetadata), null);
});
