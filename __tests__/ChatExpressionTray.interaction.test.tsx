// @ts-nocheck
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ChatExpressionTray from '@/components/chat/ChatExpressionTray';
import { Colors } from '@/constants/theme';

describe('ChatExpressionTray', () => {
  it('sends a curated Betweener sticker from the signature pack', async () => {
    const onSendSticker = jest.fn();
    const screen = await render(
      <ChatExpressionTray
        visible
        theme={Colors.light}
        isDark={false}
        onClose={jest.fn()}
        onInsertEmoji={jest.fn()}
        onSendSticker={onSendSticker}
        onSendGif={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByTestId('chat-expression-sticker-great-flow'));

    expect(onSendSticker).toHaveBeenCalledWith(expect.objectContaining({
      id: 'great-flow',
      name: 'Great Flow',
    }));
  }, 15_000);

  it('inserts emoji without sending a separate message', async () => {
    const onInsertEmoji = jest.fn();
    const screen = await render(
      <ChatExpressionTray
        visible
        theme={Colors.dark}
        isDark
        onClose={jest.fn()}
        onInsertEmoji={onInsertEmoji}
        onSendSticker={jest.fn()}
        onSendGif={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByTestId('chat-expression-tab-emoji'));
    await fireEvent.press(screen.getByTestId('chat-expression-emoji-0'));

    expect(onInsertEmoji).toHaveBeenCalledWith('😀');
  });

  it('hides GIF search when a licensed provider key is not configured', async () => {
    const previous = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
    delete process.env.EXPO_PUBLIC_GIPHY_API_KEY;
    const screen = await render(
      <ChatExpressionTray
        visible
        theme={Colors.light}
        isDark={false}
        onClose={jest.fn()}
        onInsertEmoji={jest.fn()}
        onSendSticker={jest.fn()}
        onSendGif={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.queryByTestId('chat-expression-tab-gifs')).toBeNull());
    if (previous === undefined) delete process.env.EXPO_PUBLIC_GIPHY_API_KEY;
    else process.env.EXPO_PUBLIC_GIPHY_API_KEY = previous;
  });

  it('offers animated text when the native GIPHY SDK is configured', async () => {
    const previous = process.env.EXPO_PUBLIC_GIPHY_IOS_API_KEY;
    process.env.EXPO_PUBLIC_GIPHY_IOS_API_KEY = 'test-ios-sdk-key';
    try {
      const screen = await render(
        <ChatExpressionTray
          visible
          theme={Colors.dark}
          isDark
          onClose={jest.fn()}
          onInsertEmoji={jest.fn()}
          onSendSticker={jest.fn()}
          onSendGif={jest.fn()}
        />,
      );

      await fireEvent.press(screen.getByTestId('chat-expression-tab-gifs'));
      await fireEvent.press(screen.getByTestId('chat-expression-giphy-mode-animated-text'));

      expect(screen.getByPlaceholderText('Type words to animate')).toBeTruthy();
      expect(screen.getByText('Animate your words')).toBeTruthy();
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_GIPHY_IOS_API_KEY;
      else process.env.EXPO_PUBLIC_GIPHY_IOS_API_KEY = previous;
    }
  });
});
