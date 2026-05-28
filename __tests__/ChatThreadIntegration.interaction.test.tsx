// @ts-nocheck
import React from "react";
import { Text, View } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import ChatFailedRetryHint from "@/components/chat/ChatFailedRetryHint";
import ChatMessageBubblePressable from "@/components/chat/ChatMessageBubblePressable";
import ChatQuickReactionsBar from "@/components/chat/ChatQuickReactionsBar";
import ChatReactionSummarySheet from "@/components/chat/ChatReactionSummarySheet";
import { Colors } from "@/constants/theme";
import { applyLocalReactionToggle } from "@/lib/chat/message-actions";
import { reconcileMessageWithServer, setMessageStatus } from "@/lib/chat/message-state";
import { canRetryFailedTextMessage } from "@/lib/chat/thread-behavior";

const styles = new Proxy(
  {},
  {
    get: () => ({}),
  }
);

function RetryAndReconcileHarness() {
  const [messages, setMessages] = React.useState([
    {
      id: "temp-1",
      text: "Retry me",
      senderId: "me",
      timestamp: new Date("2026-05-22T13:00:00.000Z"),
      type: "text",
      reactions: [],
      status: "failed",
    },
  ]);

  const message = messages[0];
  const canRetry = canRetryFailedTextMessage({ item: message, isMyMessage: true });

  return (
    <View>
      <Text testID="chat-thread-message-status">{message.status}</Text>
      <Text testID="chat-thread-message-id">{message.id}</Text>
      <ChatMessageBubblePressable
        messageId={message.id}
        canRetryFailedText={canRetry}
        styles={styles}
        isMyMessage
        onFocus={() => {}}
        onRetryFailedMessage={(messageId) => {
          setMessages((prev) => setMessageStatus(prev, messageId, "sending"));
        }}
        onPressContent={() => {}}
        onLongPress={() => {}}
      >
        <Text>{message.text}</Text>
        <ChatFailedRetryHint visible={canRetry} isMyMessage styles={styles} />
      </ChatMessageBubblePressable>
      <Text
        testID="chat-thread-server-ack"
        onPress={() => {
          setMessages((prev) =>
            reconcileMessageWithServer({
              items: prev,
              messageId: "temp-1",
              serverMessage: {
                ...message,
                id: "server-9",
                status: "sent",
              },
            })
          );
        }}
      >
        Ack
      </Text>
    </View>
  );
}

function ReactionSummaryIntegrationHarness() {
  const [selectedEmoji, setSelectedEmoji] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState([
    {
      id: "msg-1",
      text: "Hello",
      senderId: "peer-1",
      timestamp: new Date("2026-05-22T13:10:00.000Z"),
      type: "text",
      reactions: [{ userId: "peer-1", emoji: "🔥" }],
    },
  ]);

  const message = messages[0];
  const reactionSummary = React.useMemo(() => {
    const counts = new Map<string, number>();
    message.reactions.forEach((reaction) => {
      counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }));
  }, [message.reactions]);

  const reactionSheetList = React.useMemo(() => {
    if (!selectedEmoji) return message.reactions;
    return message.reactions.filter((reaction) => reaction.emoji === selectedEmoji);
  }, [message.reactions, selectedEmoji]);

  return (
    <View>
      <Text testID="chat-thread-reaction-count">{message.reactions.length} total</Text>
      <ChatQuickReactionsBar
        item={message}
        isMyMessage={false}
        isActionPinned={false}
        canEdit={false}
        quickReactions={["❤️", "🔥"]}
        styles={styles}
        theme={Colors.light}
        onAddReaction={(messageId, emoji) => {
          setMessages((prev) =>
            applyLocalReactionToggle({
              items: prev,
              messageId,
              userId: "me",
              emoji,
            }).items
          );
        }}
        onCloseReactions={() => {}}
        onReply={() => {}}
        onCopyMessage={() => {}}
        onEditMessage={() => {}}
        onTogglePin={() => {}}
        onDeleteMessage={() => {}}
      />
      <ChatReactionSummarySheet
        visible
        styles={styles}
        theme={Colors.light}
        isDark={false}
        currentUserId="me"
        currentUserAvatarUrl={null}
        reactionSheetMessage={message}
        reactionSummary={reactionSummary}
        reactionSheetList={reactionSheetList}
        reactionSheetEmoji={selectedEmoji}
        reactionProfiles={{ "peer-1": { name: "Ayo", avatar: null } }}
        reactionProfilesLoading={false}
        fallbackAvatarSource={{ uri: "https://example.com/fallback.jpg" }}
        onClose={() => {}}
        onSelectEmoji={setSelectedEmoji}
      />
    </View>
  );
}

describe("Chat thread integration flows", () => {
  it("retries a failed message and reconciles it with the server state", () => {
    const { getByTestId, queryByTestId } = render(<RetryAndReconcileHarness />);

    expect(getByTestId("chat-thread-message-status").props.children).toBe("failed");
    expect(getByTestId("chat-thread-message-id").props.children).toBe("temp-1");
    expect(getByTestId("chat-failed-retry-hint")).toBeTruthy();

    fireEvent.press(getByTestId("chat-message-bubble-pressable"));

    expect(getByTestId("chat-thread-message-status").props.children).toBe("sending");

    fireEvent.press(getByTestId("chat-thread-server-ack"));

    expect(getByTestId("chat-thread-message-status").props.children).toBe("sent");
    expect(getByTestId("chat-thread-message-id").props.children).toBe("server-9");
    expect(queryByTestId("chat-failed-retry-hint")).toBeNull();
  });

  it("keeps reaction summary sheet in sync with quick reaction toggles", () => {
    const { getByTestId, getByText, queryByText } = render(
      <ReactionSummaryIntegrationHarness />
    );

    expect(getByTestId("chat-thread-reaction-count").props.children.join("")).toBe("1 total");
    expect(getByText("Ayo")).toBeTruthy();
    expect(queryByText("You")).toBeNull();

    fireEvent.press(getByTestId("chat-quick-reaction-0"));

    expect(getByTestId("chat-thread-reaction-count").props.children.join("")).toBe("2 total");
    expect(getByText("You")).toBeTruthy();

    fireEvent.press(getByTestId("chat-quick-reaction-0"));

    expect(getByTestId("chat-thread-reaction-count").props.children.join("")).toBe("1 total");
    expect(queryByText("You")).toBeNull();
  });
});
