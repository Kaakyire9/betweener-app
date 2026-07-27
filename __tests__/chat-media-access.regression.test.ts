import test from 'node:test';
import assert from 'node:assert/strict';

import { ChatMediaAccess } from '../lib/chat/media/chat-media-access.ts';
import { getChatVisualMediaPaths } from '../lib/chat/media/chat-media-paths.ts';
import type { MessageType } from '../components/chat/types.ts';

const mediaMessage = (
  type: MessageType['type'],
  storagePath: string,
  deletedForAll = false,
): MessageType => ({
  id: `${type}:${storagePath}`,
  text: '',
  senderId: 'sender',
  timestamp: new Date(0),
  type,
  storagePath,
  reactions: [],
  deletedForAll,
});

test('reuses a valid signed media URL until its refresh window expires', async () => {
  let now = 1_000;
  let signingCalls = 0;
  const access = new ChatMediaAccess(() => now, 100);
  const sign = async () => {
    signingCalls += 1;
    return `https://media.example/${signingCalls}`;
  };

  assert.deepEqual(await access.resolve('sender/peer/photo.jpg', sign), {
    status: 'ready', uri: 'https://media.example/1', source: 'signed',
  });
  assert.deepEqual(await access.resolve('sender/peer/photo.jpg', sign), {
    status: 'ready', uri: 'https://media.example/1', source: 'cache',
  });
  assert.equal(signingCalls, 1);
  assert.equal(access.getRefreshAt('sender/peer/photo.jpg'), 1_100);

  now += 101;
  assert.deepEqual(await access.resolve('sender/peer/photo.jpg', sign), {
    status: 'ready', uri: 'https://media.example/2', source: 'signed',
  });
});

test('deduplicates concurrent signing and returns a recoverable failure', async () => {
  let resolveSigning: ((value: string | null) => void) | null = null;
  const access = new ChatMediaAccess();
  const sign = () => new Promise<string | null>((resolve) => {
    resolveSigning = resolve;
  });

  const first = access.resolve('sender/peer/video.mp4', sign);
  const second = access.resolve('sender/peer/video.mp4', sign);
  resolveSigning?.('https://media.example/video');
  assert.deepEqual(await first, { status: 'ready', uri: 'https://media.example/video', source: 'signed' });
  assert.deepEqual(await second, { status: 'ready', uri: 'https://media.example/video', source: 'signed' });

  assert.deepEqual(await access.resolve(null, sign), {
    status: 'unavailable', failure: 'missing_storage_path',
  });
});

test('does not cache a failed signing attempt, allowing an explicit retry to recover', async () => {
  let now = 10_000;
  const access = new ChatMediaAccess(() => now, 100, [5_000, 15_000]);
  const path = 'sender/peer/retry.jpg';
  const failureCause = new Error('network unavailable');

  assert.deepEqual(await access.resolve(path, async () => {
    throw failureCause;
  }), {
    status: 'unavailable',
    failure: 'signing_failed',
    cause: failureCause,
    retryAt: 15_000,
    attempt: 1,
  });

  assert.deepEqual(await access.resolve(path, async () => 'https://media.example/recovered'), {
    status: 'unavailable',
    failure: 'retry_scheduled',
    cause: failureCause,
    retryAt: 15_000,
    attempt: 1,
  });

  assert.deepEqual(await access.resolve(
    path,
    async () => 'https://media.example/recovered',
    { force: true, bypassBackoff: true },
  ), {
    status: 'ready', uri: 'https://media.example/recovered', source: 'signed',
  });

  now += 20_000;
  assert.equal(access.getKnownUri(path), null);
});

test('load failures are cooled down and automatic retries become terminal', async () => {
  let now = 1_000;
  const access = new ChatMediaAccess(() => now, 100, [10, 20]);
  const path = 'sender/peer/broken.jpg';

  assert.deepEqual(access.invalidate(path), {
    status: 'unavailable',
    failure: 'media_load_failed',
    cause: undefined,
    retryAt: 1_010,
    attempt: 1,
  });
  const cooledDown = access.invalidate(path);
  assert.equal(cooledDown.status, 'unavailable');
  if (cooledDown.status === 'unavailable') {
    assert.equal(cooledDown.failure, 'retry_scheduled');
  }

  now = 1_011;
  const second = await access.resolve(path, async () => null);
  assert.equal(second.status, 'unavailable');
  if (second.status === 'unavailable') {
    assert.equal(second.failure, 'signed_url_unavailable');
    assert.equal(second.attempt, 2);
  }

  now = 2_000;
  const exhausted = await access.resolve(path, async () => 'unused');
  assert.equal(exhausted.status, 'unavailable');
  if (exhausted.status === 'unavailable') {
    assert.equal(exhausted.failure, 'retry_exhausted');
  }
});

test('visual media hydration excludes voice paths, deleted media, and duplicates', () => {
  const image = mediaMessage('image', 'sender/peer/photo.jpg');
  image.mediaItems = [{
    attachmentId: 'album-1',
    index: 0,
    type: 'image',
    storagePath: 'sender/peer/photo.jpg',
  }];

  assert.deepEqual(
    getChatVisualMediaPaths([
      mediaMessage('voice', 'sender/peer/voice.m4a'),
      image,
      mediaMessage('video', 'sender/peer/video.mp4'),
      mediaMessage('document', 'sender/peer/deleted.pdf', true),
    ]),
    ['sender/peer/photo.jpg', 'sender/peer/video.mp4'],
  );
});
