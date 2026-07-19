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

  it("retries failed messages and closes first", async () => {
    const props = buildProps();
    const { getByTestId } = await render(<ChatMessageActionsSheet {...props} />);

    await fireEvent.press(getByTestId("chat-message-action-retry"));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onRetry).toHaveBeenCalledWith(actionMessage);
    expect(props.onClose.mock.invocationCallOrder[0]).toBeLessThan(
      props.onRetry.mock.invocationCallOrder[0]
    );
  });

  it("toggles the pin label and forwards the pinned state", async () => {
    const props = buildProps({ isActionPinned: true });
    const { getByText, getByTestId } = await render(<ChatMessageActionsSheet {...props} />);

    expect(getByText("Unpin message")).toBeTruthy();

    await fireEvent.press(getByTestId("chat-message-action-pin"));

    expect(props.onTogglePin).toHaveBeenCalledWith(actionMessage, true);
  });

  it("hides retry when the selected message is not retryable", async () => {
    const props = buildProps({ canRetryActionMessage: false });
    const { queryByTestId } = await render(<ChatMessageActionsSheet {...props} />);

    expect(queryByTestId("chat-message-action-retry")).toBeNull();
  });

  it("supports closing from cancel and backdrop", async () => {
    const props = buildProps();
    const { getByTestId } = await render(<ChatMessageActionsSheet {...props} />);

    await fireEvent.press(getByTestId("chat-message-action-cancel"));
    await fireEvent.press(
      getByTestId("chat-message-actions-backdrop", { includeHiddenElements: true })
    );

    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
