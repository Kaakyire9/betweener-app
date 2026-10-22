import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChromiumArguments,
  buildFfmpegArguments,
  buildRtmpTarget,
  classifyProcessFailure,
  dimensionsForCanvas,
  isLoopbackAddress,
  parseWorkerConfig,
  sanitizeDiagnostic,
  stableSessionSlug,
} from '../src/compositor-runtime.mjs';

const environment = {
  SUPABASE_URL: 'https://staging.example.supabase.co',
  BROADCAST_COMPOSITOR_WORKER_TOKEN: 'a'.repeat(32),
};

test('configuration is restrictive and defaults to one compositor', () => {
  const parsed = parseWorkerConfig(environment);
  assert.equal(parsed.maximumSessions, 1);
  assert.equal(parsed.pollMilliseconds, 1_000);
  assert.equal(parsed.sourceRevision, 'unknown');
  assert.equal(parsed.manifestVersion, 'adaptive-stage-v2.0.0-m1');
  assert.equal(parseWorkerConfig({
    ...environment,
    BETWEENER_SOURCE_REVISION: 'a'.repeat(40),
  }).sourceRevision, 'a'.repeat(40));
  assert.throws(() => parseWorkerConfig({ ...environment, SUPABASE_URL: 'http://example.com' }));
  assert.throws(() => parseWorkerConfig({ ...environment, BROADCAST_COMPOSITOR_WORKER_TOKEN: 'short' }));
  assert.throws(() => parseWorkerConfig({ ...environment, BETWEENER_SOURCE_REVISION: 'not-a-sha' }));
});

test('canvas dimensions remain broadcast-safe and deterministic', () => {
  assert.deepEqual(dimensionsForCanvas('landscape_16_9'), { width: 1280, height: 720 });
  assert.deepEqual(dimensionsForCanvas('portrait_9_16'), { width: 720, height: 1280 });
  assert.deepEqual(dimensionsForCanvas('square_1_1'), { width: 1080, height: 1080 });
  assert.equal(stableSessionSlug('session-1'), stableSessionSlug('session-1'));
});

test('ffmpeg emits one H264 AAC RTMP programme with fixed GOP', () => {
  const outputUrl = buildRtmpTarget('rtmps://example.invalid/live/', 's'.repeat(32));
  const args = buildFfmpegArguments({
    display: 90,
    width: 1280,
    height: 720,
    pulseMonitor: 'betweener_123.monitor',
    outputUrl,
  });
  assert.ok(args.includes('x11grab'));
  assert.ok(args.includes('pulse'));
  assert.ok(args.includes('libx264'));
  assert.ok(args.includes('aac'));
  assert.ok(args.includes('60'));
  assert.equal(args.at(-1), outputUrl);
});

test('chromium is isolated and autoplay-ready', () => {
  const args = buildChromiumArguments({
    display: 90,
    width: 1280,
    height: 720,
    rendererUrl: 'http://127.0.0.1:8080/renderer?session=test',
    profilePath: '/tmp/profile',
  });
  assert.ok(args.includes('--autoplay-policy=no-user-gesture-required'));
  assert.ok(args.includes('--disable-background-timer-throttling'));
  assert.ok(args.some((item) => item.startsWith('--user-data-dir=')));
});

test('diagnostics redact RTMP targets and explicit credentials', () => {
  const target = 'rtmps://example.invalid/live/secret';
  const sanitized = sanitizeDiagnostic(`failed ${target} token-value`, ['token-value']);
  assert.equal(sanitized.includes('secret'), false);
  assert.equal(sanitized.includes('token-value'), false);
});

test('failures and local control addresses are classified safely', () => {
  assert.equal(classifyProcessFailure('ffmpeg', '', 'ENOENT'), 'broadcast_compositor_ffmpeg_unavailable');
  assert.equal(classifyProcessFailure('ffmpeg', 'authentication failed'), 'broadcast_compositor_rtmp_rejected');
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('10.0.0.5'), false);
});
