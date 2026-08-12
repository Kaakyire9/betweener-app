import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeIncrementalThreadMessages } from '../lib/chat/loading/thread-message-state-merge.ts';

test('replaces a temporary message while retaining cached media and voice playback', () => {
  const previous = [{ id: 'temp', clientMessageId: 'client', text: '', senderId: 'me', timestamp: new Date(1), type: 'video', reactions: [{ userId: 'peer', emoji: '❤️' }], offlineVideoUri: 'file://video', voiceMessage: { duration: 1, waveform: [], isPlaying: true } }] as any;
  const fetched = [{ id: 'server', clientMessageId: 'client', text: '', senderId: 'me', timestamp: new Date(2), type: 'video', reactions: [], videoUrl: 'https://video', voiceMessage: { duration: 1, waveform: [], isPlaying: false } }] as any;
  const result = mergeIncrementalThreadMessages(previous, fetched);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'server');
  assert.equal(result[0].offlineVideoUri, 'file://video');
  assert.equal(result[0].voiceMessage?.isPlaying, true);
  assert.equal(result[0].reactions.length, 1);
});
