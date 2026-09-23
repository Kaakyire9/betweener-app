// @ts-nocheck
import { fireEvent, render } from '@testing-library/react-native';

import {
  ChatBackground,
  getChatBackgroundTreatment,
} from '@/components/chat/ChatBackground';
import { ChatWallpaper, Colors } from '@/constants/theme';

describe('ChatBackground', () => {
  it('selects the dark treatment without intercepting conversation gestures', async () => {
    const { getByTestId } = await render(<ChatBackground tone="dark" />);
    const background = getByTestId('chat-background');

    expect(background.props.pointerEvents).toBe('none');
    expect(getByTestId('chat-background-artwork-dark')).toBeTruthy();
    expect(getByTestId('chat-background-atmosphere-dark')).toBeTruthy();
    expect(getChatBackgroundTreatment('dark').foundation).toBe(Colors.dark.background);
  });

  it('switches coherently to the light treatment with identical geometry', async () => {
    const { getByTestId, queryByTestId, rerender } = await render(
      <ChatBackground tone="dark" />,
    );

    await rerender(<ChatBackground tone="light" />);

    expect(queryByTestId('chat-background-artwork-dark')).toBeNull();
    expect(getByTestId('chat-background-artwork-light')).toBeTruthy();
    expect(getByTestId('chat-background-atmosphere-light')).toBeTruthy();
    expect(getChatBackgroundTreatment('light').foundation).toBe(Colors.light.background);
    expect(getChatBackgroundTreatment('light').geometryId).toBe(
      getChatBackgroundTreatment('dark').geometryId,
    );
  });

  it('falls back to the immediate theme foundation when artwork fails', async () => {
    const { getByTestId, queryByTestId } = await render(<ChatBackground tone="light" />);

    await fireEvent(getByTestId('chat-background-artwork-light'), 'error');

    expect(queryByTestId('chat-background-artwork-light')).toBeNull();
    expect(getByTestId('chat-background')).toHaveStyle({
      backgroundColor: Colors.light.background,
    });
    expect(getByTestId('chat-background-atmosphere-light')).toBeTruthy();
  });

  it('uses the centralized refined symbol and atmosphere strengths', async () => {
    const { getByTestId, rerender } = await render(<ChatBackground tone="dark" />);

    expect(getChatBackgroundTreatment('dark').symbolOpacity).toBe(0.2975);
    expect(getByTestId('chat-background-artwork-dark')).toHaveStyle({ opacity: 0.2975 });
    expect(getByTestId('chat-background-atmosphere-dark')).toHaveStyle({
      opacity: ChatWallpaper.dark.atmosphereOpacity,
    });

    await rerender(<ChatBackground tone="light" />);

    expect(getChatBackgroundTreatment('light').symbolOpacity).toBe(0.259);
    expect(getByTestId('chat-background-artwork-light')).toHaveStyle({ opacity: 0.259 });
    expect(getByTestId('chat-background-atmosphere-light')).toHaveStyle({
      opacity: ChatWallpaper.light.atmosphereOpacity,
    });
  });
});
