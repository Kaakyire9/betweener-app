// @ts-nocheck
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import ChatMessageActionsSheet from "@/components/chat/ChatMessageActionsSheet";
import { Colors } from "@/constants/theme";

const styles = new Proxy(
  {},
  {
    get: () => ({}),
  }
);

const actionMessage = {
  id: "message-1",
  text: "Retry me",
  senderId: "me",
  timestamp: new Date("2026-05-22T09:00:00.000Z"),
  type: "text",
  reactions: [],
  status: "failed",
};

const buildProps = (overrides = {}) => ({
  visible: true,
  actionMessage,
  styles,
  theme: Colors.light,
  isDark: false,
  canRetryActionMessage: true,
  canEditAction: true,
  canReportActionMessage: true,
  isActionPinned: false,
  isChatMuted: false,
  onClose: jest.fn(),
  onReply: jest.fn(),
  onRetry: jest.fn(),
  onEdit: jest.fn(),
  onCopy: jest.fn(),
  onViewEditHistory: jest.fn(),
  onTogglePin: jest.fn(),
  onToggleMute: jest.fn(),
  onReport: jest.fn(),
  onDelete: jest.fn(),
  ...overrides,
});

describe("ChatMessageActionsSheet interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retries failed messages and closes first", () => {
    const props = buildProps();
    const { getByTestId } = render(<ChatMessageActionsSheet {...props} />);

    fireEvent.press(getByTestId("chat-message-action-retry"));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onRetry).toHaveBeenCalledWith(actionMessage);
    expect(props.onClose.mock.invocationCallOrder[0]).toBeLessThan(
      props.onRetry.mock.invocationCallOrder[0]
    );
  });

  it("toggles the pin label and forwards the pinned state", () => {
    const props = buildProps({ isActionPinned: true });
    const { getByText, getByTestId } = render(<ChatMessageActionsSheet {...props} />);

    expect(getByText("Unpin message")).toBeTruthy();

    fireEvent.press(getByTestId("chat-message-action-pin"));

    expect(props.onTogglePin).toHaveBeenCalledWith(actionMessage, true);
  });

  it("hides retry when the selected message is not retryable", () => {
    const props = buildProps({ canRetryActionMessage: false });
    const { queryByTestId } = render(<ChatMessageActionsSheet {...props} />);

    expect(queryByTestId("chat-message-action-retry")).toBeNull();
  });

  it("supports closing from cancel and backdrop", () => {
    const props = buildProps();
    const { getByTestId } = render(<ChatMessageActionsSheet {...props} />);

    fireEvent.press(getByTestId("chat-message-action-cancel"));
    fireEvent.press(getByTestId("chat-message-actions-backdrop"));

    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
