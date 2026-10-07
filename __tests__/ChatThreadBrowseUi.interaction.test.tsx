// @ts-nocheck
import { renderHook } from '@testing-library/react-native';

import { useChatThreadBrowseUi } from '@/lib/chat/hooks/use-chat-thread-browse-ui';

const buildMessage = (overrides = {}) => ({
  id: 'message-1',
  text: '',
  senderId: 'peer-1',
  timestamp: new Date('2026-09-22T18:00:00.000Z'),
  type: 'image',
  status: 'delivered',
  reactions: [],
  storagePath: 'peer-1/message-1/photo.jpg',
  ...overrides,
});

describe('useChatThreadBrowseUi', () => {
  it('retrieves received private media from the signed path map', async () => {
    const received = buildMessage();
    const { result } = await renderHook(() => useChatThreadBrowseUi({
      chatSearchQuery: '',
      renderedMessages: [received],
      pinnedMessageCount: 0,
      primaryPinnedMessage: null,
      jumpToMessage: jest.fn(),
      mediaUrisByPath: {
        'peer-1/message-1/photo.jpg': 'https://signed.example/photo.jpg',
      },
    }));

    expect(result.current.mediaItems).toHaveLength(1);
    expect(result.current.mediaItems[0]).toMatchObject({
      type: 'image',
      url: 'https://signed.example/photo.jpg',
      albumIndex: 0,
    });
  });

  it('keeps view-once media out of the reusable media hub', async () => {
    const { result } = await renderHook(() => useChatThreadBrowseUi({
      chatSearchQuery: '',
      renderedMessages: [buildMessage({ isViewOnce: true })],
      pinnedMessageCount: 0,
      primaryPinnedMessage: null,
      jumpToMessage: jest.fn(),
      mediaUrisByPath: {
        'peer-1/message-1/photo.jpg': 'https://signed.example/photo.jpg',
      },
    }));

    expect(result.current.mediaItems).toEqual([]);
  });
});
