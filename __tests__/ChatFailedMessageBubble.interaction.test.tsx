// @ts-nocheck
import React from "react";
import { Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import ChatFailedRetryHint from "@/components/chat/ChatFailedRetryHint";
import ChatMessageBubblePressable from "@/components/chat/ChatMessageBubblePressable";

const styles = new Proxy(
  {},
  {
    get: () => ({}),
  }
);

describe("Chat failed message bubble interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retries failed text bubbles on press and does not fall through", () => {
    const onFocus = jest.fn();
    const onRetryFailedMessage = jest.fn();
    const onPressContent = jest.fn();

    const { getByTestId } = render(
      <ChatMessageBubblePressable
        messageId="message-1"
        canRetryFailedText
        styles={styles}
        isMyMessage
        onFocus={onFocus}
        onRetryFailedMessage={onRetryFailedMessage}
        onPressContent={onPressContent}
        onLongPress={jest.fn()}
      >
        <Text>Bubble</Text>
      </ChatMessageBubblePressable>
    );

    fireEvent.press(getByTestId("chat-message-bubble-pressable"));

    expect(onFocus).toHaveBeenCalledWith("message-1");
    expect(onRetryFailedMessage).toHaveBeenCalledWith("message-1");
    expect(onPressContent).not.toHaveBeenCalled();
  });

  it("falls through to normal content behavior when the message is not retryable", () => {
    const onFocus = jest.fn();
    const onRetryFailedMessage = jest.fn();
    const onPressContent = jest.fn();

    const { getByTestId } = render(
      <ChatMessageBubblePressable
        messageId="message-2"
        canRetryFailedText={false}
        styles={styles}
        isMyMessage={false}
        onFocus={onFocus}
        onRetryFailedMessage={onRetryFailedMessage}
        onPressContent={onPressContent}
        onLongPress={jest.fn()}
      >
        <Text>Bubble</Text>
      </ChatMessageBubblePressable>
    );

    fireEvent.press(getByTestId("chat-message-bubble-pressable"));

    expect(onFocus).toHaveBeenCalledWith("message-2");
    expect(onRetryFailedMessage).not.toHaveBeenCalled();
    expect(onPressContent).toHaveBeenCalledTimes(1);
  });

  it("renders the retry hint only for retryable failed messages", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <ChatFailedRetryHint visible isMyMessage styles={styles} />
    );

    expect(getByTestId("chat-failed-retry-hint")).toBeTruthy();

    rerender(
      <ChatFailedRetryHint visible={false} isMyMessage={false} styles={styles} />
    );

    expect(queryByTestId("chat-failed-retry-hint")).toBeNull();
  });
});
