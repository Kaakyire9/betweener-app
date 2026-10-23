// @ts-nocheck
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ChatLinkifiedText from '@/components/chat/ChatLinkifiedText';

describe('ChatLinkifiedText', () => {
  it('keeps prose intact and routes a validated link through the supplied opener', async () => {
    const onOpenLink = jest.fn();
    const { getByText } = await render(
      <ChatLinkifiedText
        text="Meet me at https://example.com/date tonight"
        style={{}}
        linkStyle={{}}
        onOpenLink={onOpenLink}
      />
    );

    await fireEvent.press(getByText('https://example.com/date'));

    expect(onOpenLink).toHaveBeenCalledWith('https://example.com/date');
  });

  it('does not turn unsafe schemes into interactive links', async () => {
    const onOpenLink = jest.fn();
    const { queryByRole } = await render(
      <ChatLinkifiedText
        text="javascript:alert(1)"
        style={{}}
        linkStyle={{}}
        onOpenLink={onOpenLink}
      />
    );

    expect(queryByRole('link')).toBeNull();
    expect(onOpenLink).not.toHaveBeenCalled();
  });
});
