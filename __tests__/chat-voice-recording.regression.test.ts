import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChatVoiceRecordingMetadata } from '../lib/chat/attachments/chat-voice-recording.ts';
import { createChatOutboxFlushGate } from '../lib/chat/outbox/chat-outbox-flush-gate.ts';

test('voice recording metadata uses the canonical MPEG-4 audio MIME', () => {
  assert.deepEqual(
    resolveChatVoiceRecordingMetadata('file:///recordings/voice.m4a'),
    { extension: 'm4a', contentType: 'audio/mp4' },
  );
});

test('voice recording metadata ignores URI query strings', () => {
  assert.deepEqual(
    resolveChatVoiceRecordingMetadata('file:///recordings/voice.caf?cache=1'),
    { extension: 'caf', contentType: 'audio/x-caf' },
  );
});

test('voice recording metadata safely defaults extensionless native files', () => {
  assert.deepEqual(
    resolveChatVoiceRecordingMetadata('file:///recordings/native-recording'),
    { extension: 'm4a', contentType: 'audio/mp4' },
  );
});

test('outbox flush gate serializes and drains a follow-up for the same account', async () => {
  const gate = createChatOutboxFlushGate<number>();
  let executions = 0;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });

  const first = gate.run('owner-a', async () => {
    executions += 1;
    await wait;
    return 7;
  });
  const second = gate.run('owner-a', async () => {
    executions += 1;
    return 9;
  });

  assert.equal(gate.hasActiveTask('owner-a'), true);
  assert.equal(executions, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [9, 9]);
  assert.equal(executions, 2);
  assert.equal(gate.hasActiveTask('owner-a'), false);
});

test('outbox flush gate permits different accounts concurrently', async () => {
  const gate = createChatOutboxFlushGate<string>();
  const results = await Promise.all([
    gate.run('owner-a', async () => 'a'),
    gate.run('owner-b', async () => 'b'),
  ]);

  assert.deepEqual(results, ['a', 'b']);
});
