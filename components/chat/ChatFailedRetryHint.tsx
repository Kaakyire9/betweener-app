import React from "react";
import { Text } from "react-native";

type Props = {
  visible: boolean;
  isMyMessage: boolean;
  styles: Record<string, any>;
};

export default function ChatFailedRetryHint({ visible, isMyMessage, styles }: Props) {
  if (!visible) return null;

  return (
    <Text
      testID="chat-failed-retry-hint"
      style={[
        styles.failedRetryHint,
        isMyMessage ? styles.failedRetryHintMy : styles.failedRetryHintTheir,
      ]}
    >
      Tap to retry
    </Text>
  );
}
