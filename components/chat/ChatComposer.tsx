import type { MessageType } from "@/components/chat/types";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { RefObject } from "react";
import React from "react";
import {
  Animated,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Theme = typeof Colors.light;

type Props = {
  styles: Record<string, any>;
  theme: Theme;
  isDark: boolean;
  inputRef: RefObject<TextInput | null>;
  inputText: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  placeholderTextColor: string;
  isRecording: boolean;
  isRecordingPaused: boolean;
  isUploadingVoice: boolean;
  recordingDuration: number;
  voiceButtonScale: Animated.Value;
  recordingAnimation: Animated.Value;
  showImagePicker: boolean;
  showMoodStickers: boolean;
  isInputFocused: boolean;
  replyingTo: MessageType | null;
  editingMessage: MessageType | null;
  isChatBlocked: boolean;
  isBlockedByMe: boolean;
  onConfirmUnblock: () => void;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onToggleAttachment: () => void;
  onToggleMoodStickers: () => void;
  onStartVoiceRecording: () => void;
  onDiscardVoiceRecording: () => void;
  onPauseVoiceRecording: () => void;
  onResumeVoiceRecording: () => void;
  onSendVoiceRecording: () => void;
  onSendMessage: () => void;
};

const getReplyPreviewLabel = (message: MessageType) => {
  if (message.type === "text") return message.text;
  if (message.type === "voice") return "Voice message";
  if (message.type === "image") return "Photo";
  if (message.type === "video") return "Video";
  if (message.type === "document") return message.document?.name || "Document";
  if (message.type === "location") return "Location";
  return "Sticker";
};

export default function ChatComposer({
  styles,
  theme,
  isDark: _isDark,
  inputRef,
  inputText,
  onChangeText,
  onFocus,
  onBlur,
  placeholderTextColor,
  isRecording,
  isRecordingPaused,
  isUploadingVoice,
  recordingDuration,
  voiceButtonScale,
  recordingAnimation,
  showImagePicker,
  showMoodStickers,
  isInputFocused,
  replyingTo,
  editingMessage,
  isChatBlocked,
  isBlockedByMe,
  onConfirmUnblock,
  onCancelReply,
  onCancelEdit,
  onToggleAttachment,
  onToggleMoodStickers,
  onStartVoiceRecording,
  onDiscardVoiceRecording,
  onPauseVoiceRecording,
  onResumeVoiceRecording,
  onSendVoiceRecording,
  onSendMessage,
}: Props) {
  return (
    <>
      {replyingTo && (
        <View style={styles.replyPreview}>
          <View style={styles.replyPreviewContent}>
            <MaterialCommunityIcons name="reply" size={16} color={theme.tint} />
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              Replying to: {getReplyPreviewLabel(replyingTo)}
            </Text>
          </View>
          <TouchableOpacity
            testID="chat-composer-cancel-reply"
            onPress={onCancelReply}
            style={styles.cancelReplyButton}
          >
            <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {editingMessage && (
        <View style={styles.editPreview}>
          <View style={styles.editPreviewContent}>
            <View style={styles.editPreviewBadge}>
              <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.tint} />
            </View>
            <Text style={styles.editPreviewText} numberOfLines={1}>
              Editing: {editingMessage.text || "Message"}
            </Text>
          </View>
          <TouchableOpacity
            testID="chat-composer-cancel-edit"
            onPress={onCancelEdit}
            style={styles.cancelEditButton}
          >
            <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {isChatBlocked ? (
        <View style={styles.blockedInput}>
          <View style={styles.blockedInputIcon}>
            <MaterialCommunityIcons
              name={isBlockedByMe ? "shield-lock-outline" : "lock-alert-outline"}
              size={18}
              color={theme.tint}
            />
          </View>
          <View style={styles.blockedInputCopy}>
            <Text style={styles.blockedInputTitle}>
              {isBlockedByMe ? "Blocked privately" : "Messaging unavailable"}
            </Text>
            <Text style={styles.blockedInputText}>
              {isBlockedByMe
                ? "You blocked this member. They cannot message you, and they were not notified."
                : "This conversation is paused for safety."}
            </Text>
          </View>
          {isBlockedByMe ? (
            <TouchableOpacity
              testID="chat-composer-unblock"
              style={styles.blockedInputAction}
              onPress={onConfirmUnblock}
            >
              <Text style={styles.blockedInputActionText}>Unblock</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={[styles.inputContainer, showImagePicker && styles.inputContainerRaised]}>
          <View
            style={[
              styles.composerShell,
              isInputFocused && styles.composerShellFocused,
              showMoodStickers && styles.composerShellAccent,
            ]}
          >
            <View style={styles.inputLeftActions}>
              <TouchableOpacity
                testID="chat-composer-toggle-attachment"
                style={[
                  styles.inputActionButton,
                  showImagePicker && styles.inputActionButtonActive,
                ]}
                onPress={onToggleAttachment}
              >
                <MaterialCommunityIcons
                  name={showImagePicker ? "keyboard-outline" : "plus"}
                  size={20}
                  color={showImagePicker ? Colors.light.background : theme.textMuted}
                />
              </TouchableOpacity>

              <TouchableOpacity
                testID="chat-composer-toggle-mood"
                style={[
                  styles.inputActionButton,
                  showMoodStickers && styles.inputActionButtonSecondaryActive,
                ]}
                onPress={onToggleMoodStickers}
              >
                <MaterialCommunityIcons
                  name="emoticon-happy"
                  size={20}
                  color={showMoodStickers ? theme.tint : theme.textMuted}
                />
              </TouchableOpacity>
            </View>

            <TextInput
              ref={inputRef}
              testID="chat-composer-input"
              style={styles.textInput}
              value={inputText}
              onChangeText={onChangeText}
              onFocus={onFocus}
              onBlur={onBlur}
              placeholder={
                isRecording
                  ? "Recording voice..."
                  : replyingTo
                  ? "Reply..."
                  : "Say something thoughtful..."
              }
              placeholderTextColor={placeholderTextColor}
              multiline
              maxLength={500}
              editable={!isRecording}
            />

            <View style={styles.inputRightActions}>
              {!inputText.trim() && !isRecording && (
                <Animated.View style={{ transform: [{ scale: voiceButtonScale }] }}>
                  <Pressable
                    testID="chat-composer-start-voice"
                    style={styles.voiceButton}
                    onPress={onStartVoiceRecording}
                  >
                    <Animated.View
                      style={[
                        styles.voiceButtonInner,
                        {
                          opacity: recordingAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 0.3],
                          }),
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="microphone"
                        size={19}
                        color={Colors.light.background}
                      />
                    </Animated.View>
                  </Pressable>
                </Animated.View>
              )}

              {!inputText.trim() && isRecording && (
                <View style={styles.recordingControls}>
                  <TouchableOpacity
                    testID="chat-composer-discard-voice"
                    style={[styles.recordingControlButton, styles.recordingControlDanger]}
                    onPress={onDiscardVoiceRecording}
                    disabled={isUploadingVoice}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={18}
                      color={Colors.light.background}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="chat-composer-toggle-voice-pause"
                    style={[styles.recordingControlButton, styles.recordingControlPause]}
                    onPress={isRecordingPaused ? onResumeVoiceRecording : onPauseVoiceRecording}
                    disabled={isUploadingVoice}
                  >
                    <MaterialCommunityIcons
                      name={isRecordingPaused ? "play" : "pause"}
                      size={18}
                      color={Colors.light.background}
                    />
                  </TouchableOpacity>

                  <View style={styles.recordingTimerPill}>
                    <Text style={styles.recordingTimerText}>
                      {Math.floor(recordingDuration / 60)}:
                      {`${Math.floor(recordingDuration % 60)}`.padStart(2, "0")}
                    </Text>
                  </View>

                  <TouchableOpacity
                    testID="chat-composer-send-voice"
                    style={[
                      styles.recordingControlButton,
                      styles.recordingControlSend,
                      isUploadingVoice && styles.recordingControlDisabled,
                    ]}
                    onPress={onSendVoiceRecording}
                    disabled={isUploadingVoice}
                  >
                    <MaterialCommunityIcons name="send" size={16} color={Colors.light.background} />
                  </TouchableOpacity>
                </View>
              )}

              {inputText.trim() && (
                <TouchableOpacity
                  testID="chat-composer-send"
                  style={styles.sendButtonActive}
                  onPress={onSendMessage}
                >
                  <MaterialCommunityIcons name="send" size={19} color={Colors.light.background} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}
    </>
  );
}
