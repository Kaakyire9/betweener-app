// @ts-nocheck
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import ChatQuickReactionsBar from "@/components/chat/ChatQuickReactionsBar";
import { Colors } from "@/constants/theme";

const styles = new Proxy(
  {},
  {
    get: () => ({}),
  }
);

const baseMessage = {
  id: "message-1",
  text: "Hello",
  senderId: "me",
  timestamp: new Date("2026-05-22T10:00:00.000Z"),
  type: "text",
  reactions: [],
  isViewOnce: false,
  deletedForAll: false,
};

const buildProps = (overrides = {}) => ({
  item: baseMessage,
  isMyMessage: true,
  isActionPinned: false,
  canEdit: true,
  quickReactions: ["❤️", "😂", "🔥"],
  styles,
  theme: Colors.light,
  onAddReaction: jest.fn(),
  onCloseReactions: jest.fn(),
  onReply: jest.fn(),
  onCopyMessage: jest.fn(),
  onEditMessage: jest.fn(),
  onTogglePin: jest.fn(),
  onDeleteMessage: jest.fn(),
  ...overrides,
});

describe("ChatQuickReactionsBar interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("forwards quick reaction taps with message id and emoji", () => {
    const props = buildProps();
    const { getByTestId } = render(<ChatQuickReactionsBar {...props} />);

    fireEvent.press(getByTestId("chat-quick-reaction-1"));

    expect(props.onAddReaction).toHaveBeenCalledWith("message-1", "😂");
  });

  it("handles reply, pin, and delete actions and closes after each", () => {
    const props = buildProps({ isActionPinned: true });
    const { getByTestId, getByText } = render(<ChatQuickReactionsBar {...props} />);

    expect(getByText("Unpin")).toBeTruthy();

    fireEvent.press(getByTestId("chat-quick-action-reply"));
    fireEvent.press(getByTestId("chat-quick-action-pin"));
    fireEvent.press(getByTestId("chat-quick-action-delete"));

    expect(props.onReply).toHaveBeenCalledWith(baseMessage);
    expect(props.onTogglePin).toHaveBeenCalledWith(baseMessage, true);
    expect(props.onDeleteMessage).toHaveBeenCalledWith(baseMessage);
    expect(props.onCloseReactions).toHaveBeenCalledTimes(3);
  });

  it("hides copy for view-once messages", () => {
    const props = buildProps({
      item: {
        ...baseMessage,
        isViewOnce: true,
      },
    });
    const { queryByTestId } = render(<ChatQuickReactionsBar {...props} />);

    expect(queryByTestId("chat-quick-action-copy")).toBeNull();
  });

  it("hides reaction tray and action row for deleted messages", () => {
    const props = buildProps({
      item: {
        ...baseMessage,
        deletedForAll: true,
      },
    });
    const { queryByTestId } = render(<ChatQuickReactionsBar {...props} />);

    expect(queryByTestId("chat-quick-reaction-0")).toBeNull();
    expect(queryByTestId("chat-quick-action-reply")).toBeNull();
  });
});
