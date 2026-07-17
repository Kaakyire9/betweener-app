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
  isRecordingPaused: false,
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
  onPauseVoiceRecording: jest.fn(),
  onResumeVoiceRecording: jest.fn(),
  onSendVoiceRecording: jest.fn(),
  onSendMessage: jest.fn(),
  ...overrides,
});

describe("ChatComposer interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propagates text changes through the composer input", () => {
    const props = buildProps();
    const { getByTestId } = render(<ChatComposer {...props} />);

    fireEvent.changeText(getByTestId("chat-composer-input"), "Hello there");

    expect(props.onChangeText).toHaveBeenCalledWith("Hello there");
  });

  it("shows the send button for non-empty text and triggers send", () => {
    const props = buildProps({ inputText: "Hello there" });
    const { getByTestId } = render(<ChatComposer {...props} />);

    fireEvent.press(getByTestId("chat-composer-send"));

    expect(props.onSendMessage).toHaveBeenCalledTimes(1);
  });

  it("renders edit and reply previews and supports cancelling both", () => {
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

    const { getByText, getByTestId } = render(<ChatComposer {...props} />);

    expect(getByText("Replying to: Original")).toBeTruthy();
    expect(getByText("Editing: Current draft")).toBeTruthy();

    fireEvent.press(getByTestId("chat-composer-cancel-reply"));
    fireEvent.press(getByTestId("chat-composer-cancel-edit"));

    expect(props.onCancelReply).toHaveBeenCalledTimes(1);
    expect(props.onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it("renders blocked state with unblock action for self-blocked chats", () => {
    const props = buildProps({
      isChatBlocked: true,
      isBlockedByMe: true,
    });

    const { getByText, getByTestId, queryByTestId } = render(
      <ChatComposer {...props} />
    );

    expect(getByText("Blocked privately")).toBeTruthy();
    expect(queryByTestId("chat-composer-input")).toBeNull();

    fireEvent.press(getByTestId("chat-composer-unblock"));

    expect(props.onConfirmUnblock).toHaveBeenCalledTimes(1);
  });

  it("toggles attachment and mood entry points", () => {
    const props = buildProps();
    const { getByTestId } = render(<ChatComposer {...props} />);

    fireEvent.press(getByTestId("chat-composer-toggle-attachment"));
    fireEvent.press(getByTestId("chat-composer-toggle-mood"));

    expect(props.onToggleAttachment).toHaveBeenCalledTimes(1);
    expect(props.onToggleMoodStickers).toHaveBeenCalledTimes(1);
  });

  it("starts voice recording when the mic button is pressed", () => {
    const props = buildProps();
    const { getByTestId, queryByTestId } = render(<ChatComposer {...props} />);

    expect(getByTestId("chat-composer-start-voice")).toBeTruthy();
    expect(queryByTestId("chat-composer-send")).toBeNull();

    fireEvent.press(getByTestId("chat-composer-start-voice"));

    expect(props.onStartVoiceRecording).toHaveBeenCalledTimes(1);
  });

  it("renders active recording controls and routes pause, discard, and send", () => {
    const props = buildProps({
      isRecording: true,
      recordingDuration: 65,
    });
    const { getByTestId, getByText, queryByTestId } = render(
      <ChatComposer {...props} />
    );

    expect(getByText("1:05")).toBeTruthy();
    expect(queryByTestId("chat-composer-start-voice")).toBeNull();

    fireEvent.press(getByTestId("chat-composer-discard-voice"));
    fireEvent.press(getByTestId("chat-composer-toggle-voice-pause"));
    fireEvent.press(getByTestId("chat-composer-send-voice"));

    expect(props.onDiscardVoiceRecording).toHaveBeenCalledTimes(1);
    expect(props.onPauseVoiceRecording).toHaveBeenCalledTimes(1);
    expect(props.onSendVoiceRecording).toHaveBeenCalledTimes(1);
  });

  it("resumes paused recordings instead of pausing again", () => {
    const props = buildProps({
      isRecording: true,
      isRecordingPaused: true,
      recordingDuration: 12,
    });
    const { getByTestId } = render(<ChatComposer {...props} />);

    fireEvent.press(getByTestId("chat-composer-toggle-voice-pause"));

    expect(props.onResumeVoiceRecording).toHaveBeenCalledTimes(1);
    expect(props.onPauseVoiceRecording).not.toHaveBeenCalled();
  });
});
