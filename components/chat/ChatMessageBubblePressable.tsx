import React from "react";
import { Pressable } from "react-native";

type Props = {
  messageId: string;
  canRetryFailedText: boolean;
  styles: Record<string, any>;
  isMyMessage: boolean;
  centerContent?: boolean;
  hasFrame?: boolean;
  onFocus: (messageId: string) => void;
  onRetryFailedMessage: (messageId: string) => void;
  onPressContent: () => void;
  onLongPress: () => void;
  children: React.ReactNode;
};

export default function ChatMessageBubblePressable({
  messageId,
  canRetryFailedText,
  styles,
  isMyMessage,
  centerContent = false,
  hasFrame = false,
  onFocus,
  onRetryFailedMessage,
  onPressContent,
  onLongPress,
  children,
}: Props) {
  return (
    <Pressable
      testID="chat-message-bubble-pressable"
      onLongPress={onLongPress}
      delayLongPress={450}
      onPress={() => {
        onFocus(messageId);
        if (canRetryFailedText) {
          onRetryFailedMessage(messageId);
          return;
        }
        onPressContent();
      }}
      style={({ pressed }) => [
        styles.messageBubbleContainer,
        isMyMessage ? styles.myMessageContainer : styles.theirMessageContainer,
        centerContent ? styles.centeredMessageContainer : null,
        pressed && hasFrame ? styles.messageBubblePressed : null,
      ]}
    >
      {children}
    </Pressable>
  );
}
