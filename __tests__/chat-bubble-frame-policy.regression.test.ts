import assert from 'node:assert/strict';
import test from 'node:test';

import type { MessageType } from '../components/chat/types.ts';
import {
  getChatBubbleAccentFamily,
  getChatBubbleFramePolicy,
} from '../lib/chat/ui/bubble-frame-policy.ts';

const message = (overrides: Partial<MessageType>): MessageType => ({
  id: 'message-1',
  text: '',
  senderId: 'user-1',
  timestamp: new Date('2026-09-25T10:00:00.000Z'),
  type: 'text',
  reactions: [],
  status: 'sent',
  ...overrides,
});

test('bubble accents remain stable when a provisional message receives a server id', () => {
  const optimistic = message({ id: 'temp-1', clientMessageId: 'client-1' });
  const canonical = message({ id: 'server-99', clientMessageId: 'client-1' });

  assert.equal(
    getChatBubbleFramePolicy({ message: optimistic }).accentFamily,
    getChatBubbleFramePolicy({ message: canonical }).accentFamily,
  );
});

test('frame policy keeps transparent expressions and emoji-only text borderless', () => {
  assert.equal(
    getChatBubbleFramePolicy({
      message: message({ type: 'image', mediaKind: 'giphy_sticker' }),
    }).role,
    'none',
  );
  assert.equal(
    getChatBubbleFramePolicy({ message: message({ text: '😍' }), emojiOnly: true }).role,
    'none',
  );
  assert.equal(
    getChatBubbleFramePolicy({
      message: message({ type: 'image', mediaKind: 'giphy_gif' }),
    }).role,
    'media',
  );
});

test('media glow yields to queued, sending, and failed delivery states', () => {
  assert.equal(getChatBubbleFramePolicy({ message: message({ type: 'image' }) }).glow, true);
  assert.equal(
    getChatBubbleFramePolicy({ message: message({ type: 'image', status: 'sending' }) }).glow,
    false,
  );
  assert.equal(
    getChatBubbleFramePolicy({ message: message({ type: 'video', status: 'failed' }) }).glow,
    false,
  );
});

test('message variants resolve to one intentional frame owner', () => {
  assert.equal(getChatBubbleFramePolicy({ message: message({ type: 'text' }) }).ownsOuterFrame, true);
  assert.equal(getChatBubbleFramePolicy({ message: message({ type: 'voice' }) }).role, 'quiet');
  assert.equal(getChatBubbleFramePolicy({ message: message({ type: 'document' }) }).role, 'quiet');
  assert.equal(getChatBubbleFramePolicy({ message: message({ type: 'location' }) }).role, 'quiet');
  assert.equal(getChatBubbleFramePolicy({ message: message({ type: 'date_plan' }) }).role, 'quiet');
  assert.equal(getChatBubbleFramePolicy({ message: message({ type: 'mood_sticker' }) }).role, 'none');
  assert.equal(getChatBubbleFramePolicy({ message: message({ type: 'system' }) }).role, 'none');
});

test('accent hashing follows the intended weighted family distribution', () => {
  const counts = { teal: 0, lavender: 0, rose: 0 };
  for (let index = 0; index < 10_000; index += 1) {
    counts[getChatBubbleAccentFamily(`message-${index}`)] += 1;
  }

  assert.ok(counts.teal > 4_200 && counts.teal < 4_800, JSON.stringify(counts));
  assert.ok(counts.lavender > 3_700 && counts.lavender < 4_300, JSON.stringify(counts));
  assert.ok(counts.rose > 1_250 && counts.rose < 1_750, JSON.stringify(counts));
});

test('photo and video bubbles do not restore the legacy padded outer frame', async () => {
  const { readFile } = await import('node:fs/promises');
  const styles = await readFile(
    new URL('../components/chat/styles/chat-screen.styles.ts', import.meta.url),
    'utf8',
  );
  const renderer = await readFile(
    new URL('../components/chat/message-variants/MediaMessageContent.tsx', import.meta.url),
    'utf8',
  );

  assert.match(styles, /imageBubble:\s*\{\s*padding: 0,/);
  assert.match(styles, /videoBubble:\s*\{\s*padding: 0,/);
  assert.doesNotMatch(renderer, /styles\.mediaFrame/);
  assert.match(renderer, /styles\.imageMessageContainer,[\s\S]{0,220}mediaFrameStyle/);
  assert.match(renderer, /styles\.videoMessageContainer, styles\.mediaSurface, mediaFrameStyle/);
});
