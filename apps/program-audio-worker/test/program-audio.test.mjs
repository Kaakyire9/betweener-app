import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFfmpegArguments,
  buildRtmpTarget,
  classifyFfmpegStartupFailure,
  clampProgrammeVolume,
  parseWorkerConfig,
  sanitizeFfmpegDiagnostic,
  shouldCompleteBeforePublish,
} from '../src/program-audio.mjs';

test('programme volume is constrained to the safe music range', () => {
  assert.equal(clampProgrammeVolume(-1), 0);
  assert.equal(clampProgrammeVolume(0.12), 0.12);
  assert.equal(clampProgrammeVolume(2), 0.5);
});

test('RTMP target accepts only RTMP ingress and keeps the token out of arguments metadata', () => {
  assert.equal(buildRtmpTarget('rtmps://example.test/live/', 'x'.repeat(32)),
    `rtmps://example.test/live/${'x'.repeat(32)}`);
  assert.throws(() => buildRtmpTarget('https://example.test', 'x'.repeat(32)),
    /invalid_rtmp_address/);
});

test('FFmpeg publishes one audio-only AAC feed with direct-spawn gain control', () => {
  const args = buildFfmpegArguments({
    inputPath: '/tmp/approved.audio',
    outputUrl: 'rtmps://example.test/live/redacted',
    offsetSeconds: 4.25,
    repeatOne: true,
    volume: 0.12,
    controlPort: 25_555,
  });
  assert.ok(args.includes('-stream_loop'));
  assert.ok(args.includes('-vn'));
  assert.ok(!args.includes('lavfi'));
  assert.ok(!args.includes('libx264'));
  assert.ok(args.includes('aac'));
  assert.ok(args.includes('48000'));
  assert.match(args[args.indexOf('-af') + 1], /volume@programme=0\.120/);
  assert.match(args[args.indexOf('-af') + 1], /azmq=/);
  assert.ok(args[args.indexOf('-af') + 1].includes('tcp\\\\://127.0.0.1\\\\:25555'));
});

test('worker configuration rejects weak shared secrets', () => {
  assert.throws(() => parseWorkerConfig({
    SUPABASE_URL: 'https://project.supabase.co',
    PROGRAM_AUDIO_WORKER_TOKEN: 'short',
  }), /invalid_program_audio_worker_token/);
});

test('an expired non-looping track completes before FFmpeg starts', () => {
  assert.equal(shouldCompleteBeforePublish({
    durationSeconds: 180,
    offsetSeconds: 180,
    repeatMode: 'off',
  }), true);
  assert.equal(shouldCompleteBeforePublish({
    durationSeconds: 180,
    offsetSeconds: 42,
    repeatMode: 'off',
  }), false);
  assert.equal(shouldCompleteBeforePublish({
    durationSeconds: 180,
    offsetSeconds: 179,
    repeatMode: 'one',
  }), false);
});

test('FFmpeg failures are classified without returning transport credentials', () => {
  assert.equal(classifyFfmpegStartupFailure('Connection refused'),
    'program_audio_rtmp_connection_failed');
  assert.equal(classifyFfmpegStartupFailure('Output file is empty, nothing was written'),
    'program_audio_track_exhausted');
  assert.equal(classifyFfmpegStartupFailure('', 'ENOENT'),
    'program_audio_ffmpeg_unavailable');
  assert.equal(classifyFfmpegStartupFailure("Error initializing filter 'azmq': No option name near '//127.0.0.1:25555'"),
    'program_audio_gain_filter_invalid');

  const streamKey = `eyJ${'a'.repeat(30)}.${'b'.repeat(20)}.${'c'.repeat(30)}`;
  const target = `rtmps://ingress.example.test/live/${streamKey}`;
  const diagnostic = sanitizeFfmpegDiagnostic(
    `Error opening ${target} from /tmp/private-track.audio`,
    [target, streamKey, '/tmp/private-track.audio'],
  );
  assert.doesNotMatch(diagnostic, /ingress\.example|eyJ|private-track/i);
  assert.match(diagnostic, /\[redacted\]/i);
});
