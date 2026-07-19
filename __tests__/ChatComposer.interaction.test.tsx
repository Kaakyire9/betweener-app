// @ts-nocheck
import React from "react";
import { Animated } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import ChatComposer from "@/components/chat/ChatComposer";
import { Colors } from "@/constants/theme";

const styles = new Proxy(
  {},
  {
    get: () => ({}),
  }
);

const buildProps = (overrides = {}) => ({
  styles,
  theme: Colors.light,
  isDark: false,
  inputRef: { current: null },
  inputText: "",
  onChangeText: jest.fn(),
  onFocus: jest.fn(),
  onBlur: jest.fn(),
  placeholderTextColor: "#999",
  isRecording: false,
  isVoicePreviewReady: false,
  isVoicePreviewPlaying: false,
  isUploadingVoice: false,
  recordingDuration: 0,
  voiceButtonScale: new Animated.Value(1),
  recordingAnimation: new Animated.Value(0),
  showImagePicker: false,
  showMoodStickers: false,
  isInputFocused: false,
  replyingTo: null,
  editingMessage: null,
  isChatBlocked: false,
  isBlockedByMe: false,
  onConfirmUnblock: jest.fn(),
  onCancelReply: jest.fn(),
  onCancelEdit: jest.fn(),
  onToggleAttachment: jest.fn(),
  onToggleMoodStickers: jest.fn(),
  onStartVoiceRecording: jest.fn(),
  onDiscardVoiceRecording: jest.fn(),
  onFinishVoiceRecording: jest.fn(),
  onToggleVoicePreview: jest.fn(),
  onSendVoiceRecording: jest.fn(),
  onSendMessage: jest.fn(),
  ...overrides,
});

describe("ChatComposer interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propagates text changes through the composer input", async () => {
    const props = buildProps();
    const { getByTestId } = await render(<ChatComposer {...props} />);

    await fireEvent.changeText(getByTestId("chat-composer-input"), "Hello there");

    expect(props.onChangeText).toHaveBeenCalledWith("Hello there");
  });

  it("shows the send button for non-empty text and triggers send", async () => {
    const props = buildProps({ inputText: "Hello there" });
    const { getByTestId } = await render(<ChatComposer {...props} />);

    await fireEvent.press(getByTestId("chat-composer-send"));

    expect(props.onSendMessage).toHaveBeenCalledTimes(1);
  });

  it("renders edit and reply previews and supports cancelling both", async () => {
    const props = buildProps({
      replyingTo: {
        id: "reply-1",
        text: "Original",
        senderId: "peer",
        timestamp: new Date("2026-05-22T08:00:00.000Z"),
        type: "text",
        reactions: [],
      },
      editingMessage: {
        id: "edit-1",
        text: "Current draft",
        senderId: "me",
        timestamp: new Date("2026-05-22T08:01:00.000Z"),
        type: "text",
        reactions: [],
      },
    });

    const { getByText, getByTestId } = await render(<ChatComposer {...props} />);

    expect(getByText("Replying to: Original")).toBeTruthy();
    expect(getByText("Editing: Current draft")).toBeTruthy();

    await fireEvent.press(getByTestId("chat-composer-cancel-reply"));
    await fireEvent.press(getByTestId("chat-composer-cancel-edit"));

    expect(props.onCancelReply).toHaveBeenCalledTimes(1);
    expect(props.onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it("renders blocked state with unblock action for self-blocked chats", async () => {
    const props = buildProps({
      isChatBlocked: true,
      isBlockedByMe: true,
    });

    const { getByText, getByTestId, queryByTestId } = await render(
      <ChatComposer {...props} />
    );

    expect(getByText("Blocked privately")).toBeTruthy();
    expect(queryByTestId("chat-composer-input")).toBeNull();

    await fireEvent.press(getByTestId("chat-composer-unblock"));

    expect(props.onConfirmUnblock).toHaveBeenCalledTimes(1);
  });

  it("toggles attachment and mood entry points", async () => {
    const props = buildProps();
    const { getByTestId } = await render(<ChatComposer {...props} />);

    await fireEvent.press(getByTestId("chat-composer-toggle-attachment"));
    await fireEvent.press(getByTestId("chat-composer-toggle-mood"));

    expect(props.onToggleAttachment).toHaveBeenCalledTimes(1);
    expect(props.onToggleMoodStickers).toHaveBeenCalledTimes(1);
  });

  it("starts voice recording when the mic button is pressed", async () => {
    const props = buildProps();
    const { getByTestId, queryByTestId } = await render(<ChatComposer {...props} />);

    expect(getByTestId("chat-composer-start-voice")).toBeTruthy();
    expect(queryByTestId("chat-composer-send")).toBeNull();

    await fireEvent.press(getByTestId("chat-composer-start-voice"));

    expect(props.onStartVoiceRecording).toHaveBeenCalledTimes(1);
  });

  it("renders active recording controls and routes pause, discard, and send", async () => {
    const props = buildProps({
      isRecording: true,
      recordingDuration: 65,
    });
    const { getByTestId, getByText, queryByTestId } = await render(
      <ChatComposer {...props} />
    );

    expect(getByText("1:05")).toBeTruthy();
    expect(queryByTestId("chat-composer-start-voice")).toBeNull();

    await fireEvent.press(getByTestId("chat-composer-discard-voice"));
    await fireEvent.press(getByTestId("chat-composer-toggle-voice-pause"));
    await fireEvent.press(getByTestId("chat-composer-send-voice"));

    expect(props.onDiscardVoiceRecording).toHaveBeenCalledTimes(1);
    expect(props.onFinishVoiceRecording).toHaveBeenCalledTimes(1);
    expect(props.onSendVoiceRecording).toHaveBeenCalledTimes(1);
  });

  it("plays a finalized recording preview instead of resuming capture", async () => {
    const props = buildProps({
      isRecording: true,
      isVoicePreviewReady: true,
      recordingDuration: 12,
    });
    const { getByTestId } = await render(<ChatComposer {...props} />);

    await fireEvent.press(getByTestId("chat-composer-toggle-voice-pause"));

    expect(getByTestId("chat-composer-toggle-voice-pause").props.accessibilityLabel).toBe(
      "Play voice preview"
    );
    expect(props.onToggleVoicePreview).toHaveBeenCalledTimes(1);
    expect(props.onFinishVoiceRecording).not.toHaveBeenCalled();
  });
});
