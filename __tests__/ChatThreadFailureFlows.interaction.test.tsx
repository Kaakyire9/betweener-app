// @ts-nocheck
import React from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessageActionsSheet from "@/components/chat/ChatMessageActionsSheet";
import ChatQuickReactionsBar from "@/components/chat/ChatQuickReactionsBar";
import ChatReactionSummarySheet from "@/components/chat/ChatReactionSummarySheet";
import { Colors } from "@/constants/theme";
import {
  applyDeleteMessageForEveryone,
  applyLocalReactionToggle,
  applyOptimisticMessageEdit,
  reconcileEditedMessage,
  restoreMessageReactions,
} from "@/lib/chat/message-actions";

const styles = new Proxy(
  {},
  {
    get: () => ({}),
  }
);

function DeleteForEveryoneHarness() {
  const [messages, setMessages] = React.useState([
    {
      id: "delete-1",
      text: "Photo note",
      senderId: "me",
      timestamp: new Date("2026-05-22T14:00:00.000Z"),
      type: "image",
      imageUrl: "https://example.com/photo.jpg",
      reactions: [{ userId: "peer-1", emoji: "🔥" }],
    },
  ]);

  const message = messages[0];

  return (
    <View>
      <Text testID="delete-message-text">{message.text}</Text>
      <Text testID="delete-message-flag">{String(Boolean(message.deletedForAll))}</Text>
      <Text testID="delete-message-image">{String(Boolean(message.imageUrl))}</Text>
      <Text testID="delete-message-reactions">{String(message.reactions.length)}</Text>
      <ChatMessageActionsSheet
        visible
        actionMessage={message}
        styles={styles}
        theme={Colors.light}
        isDark={false}
        canRetryActionMessage={false}
        canEditAction={false}
        canReportActionMessage={false}
        isActionPinned={false}
        isChatMuted={false}
        onClose={() => {}}
        onReply={() => {}}
        onRetry={() => {}}
        onEdit={() => {}}
        onCopy={() => {}}
        onViewEditHistory={() => {}}
        onTogglePin={() => {}}
        onToggleMute={() => {}}
        onReport={() => {}}
        onDelete={(target) => {
          setMessages((prev) =>
            applyDeleteMessageForEveryone({
              items: prev,
              messageId: target.id,
              deletedAt: new Date("2026-05-22T14:05:00.000Z"),
              deletedBy: "me",
            })
          );
        }}
      />
    </View>
  );
}

function ReactionRollbackHarness() {
  const [selectedEmoji, setSelectedEmoji] = React.useState<string | null>(null);
  const [previousReactions, setPreviousReactions] = React.useState([]);
  const [messages, setMessages] = React.useState([
    {
      id: "react-1",
      text: "Hello",
      senderId: "peer-1",
      timestamp: new Date("2026-05-22T14:10:00.000Z"),
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
      <Text testID="rollback-reaction-count">{`${message.reactions.length} total`}</Text>
      <ChatQuickReactionsBar
        item={message}
        isMyMessage={false}
        isActionPinned={false}
        canEdit={false}
        quickReactions={["❤️", "🔥"]}
        styles={styles}
        theme={Colors.light}
        onAddReaction={(messageId, emoji) => {
          const mutation = applyLocalReactionToggle({
            items: messages,
            messageId,
            userId: "me",
            emoji,
          });
          setPreviousReactions(mutation.previousReactions);
          setMessages(mutation.items);
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
      <Pressable
        testID="rollback-reaction-failure"
        onPress={() => {
          setMessages((prev) =>
            restoreMessageReactions({
              items: prev,
              messageId: "react-1",
              reactions: previousReactions,
            })
          );
        }}
      >
        <Text>Rollback reaction</Text>
      </Pressable>
    </View>
  );
}

function EditReconcileHarness() {
  const [inputText, setInputText] = React.useState("Polished draft");
  const [messages, setMessages] = React.useState([
    {
      id: "edit-1",
      text: "Original copy",
      senderId: "me",
      timestamp: new Date("2026-05-22T14:20:00.000Z"),
      type: "text",
      reactions: [],
    },
  ]);
  const [editingMessage, setEditingMessage] = React.useState(messages[0]);

  const message = messages[0];

  return (
    <View>
      <Text testID="edit-message-text">{message.text}</Text>
      <Text testID="edit-message-edited">{String(Boolean(message.editedAt))}</Text>
      <ChatComposer
        styles={styles}
        theme={Colors.light}
        isDark={false}
        inputRef={{ current: null }}
        inputText={inputText}
        onChangeText={setInputText}
        onFocus={() => {}}
        onBlur={() => {}}
        placeholderTextColor="#999"
        isRecording={false}
        isRecordingPaused={false}
        isUploadingVoice={false}
        recordingDuration={0}
        voiceButtonScale={new Animated.Value(1)}
        recordingAnimation={new Animated.Value(0)}
        showImagePicker={false}
        showMoodStickers={false}
        isInputFocused={false}
        replyingTo={null}
        editingMessage={editingMessage}
        isChatBlocked={false}
        isBlockedByMe={false}
        onConfirmUnblock={() => {}}
        onCancelReply={() => {}}
        onCancelEdit={() => setEditingMessage(null)}
        onToggleAttachment={() => {}}
        onToggleMoodStickers={() => {}}
        onStartVoiceRecording={() => {}}
        onDiscardVoiceRecording={() => {}}
        onPauseVoiceRecording={() => {}}
        onResumeVoiceRecording={() => {}}
        onSendVoiceRecording={() => {}}
        onSendMessage={() => {
          setMessages((prev) =>
            applyOptimisticMessageEdit({
              items: prev,
              messageId: "edit-1",
              text: inputText,
              editedAt: new Date("2026-05-22T14:21:00.000Z"),
            })
          );
          setEditingMessage(null);
        }}
      />
      <Pressable
        testID="edit-message-server-reconcile"
        onPress={() => {
          setMessages((prev) =>
            reconcileEditedMessage({
              items: prev,
              messageId: "edit-1",
              text: "Polished draft (server)",
              editedAt: new Date("2026-05-22T14:22:00.000Z"),
            })
          );
        }}
      >
        <Text>Reconcile edit</Text>
      </Pressable>
    </View>
  );
}

describe("Chat failure-path integration flows", () => {
  it("rolls back optimistic reactions when the backend fails", async () => {
    const { getByTestId, getByText, queryByText } = await render(<ReactionRollbackHarness />);

    expect(getByTestId("rollback-reaction-count").props.children).toBe("1 total");
    expect(getByText("Ayo")).toBeTruthy();
    expect(queryByText("You")).toBeNull();

    await fireEvent.press(getByTestId("chat-quick-reaction-0"));

    expect(getByTestId("rollback-reaction-count").props.children).toBe("2 total");
    expect(getByText("You")).toBeTruthy();

    await fireEvent.press(getByTestId("rollback-reaction-failure"));

    expect(getByTestId("rollback-reaction-count").props.children).toBe("1 total");
    expect(queryByText("You")).toBeNull();
  });

  it("applies delete-for-everyone state from the action sheet path", async () => {
    const { getByTestId } = await render(<DeleteForEveryoneHarness />);

    expect(getByTestId("delete-message-text").props.children).toBe("Photo note");
    expect(getByTestId("delete-message-flag").props.children).toBe("false");
    expect(getByTestId("delete-message-image").props.children).toBe("true");
    expect(getByTestId("delete-message-reactions").props.children).toBe("1");

    await fireEvent.press(getByTestId("chat-message-action-delete"));

    expect(getByTestId("delete-message-text").props.children).toBe("Message deleted");
    expect(getByTestId("delete-message-flag").props.children).toBe("true");
    expect(getByTestId("delete-message-image").props.children).toBe("false");
    expect(getByTestId("delete-message-reactions").props.children).toBe("0");
  });

  it("reconciles optimistic edits after the composer send path", async () => {
    const { getByTestId, getByText, queryByText } = await render(<EditReconcileHarness />);

    expect(getByTestId("edit-message-text").props.children).toBe("Original copy");
    expect(getByText("Editing: Original copy")).toBeTruthy();

    await fireEvent.press(getByTestId("chat-composer-send"));

    expect(getByTestId("edit-message-text").props.children).toBe("Polished draft");
    expect(getByTestId("edit-message-edited").props.children).toBe("true");
    expect(queryByText("Editing: Original copy")).toBeNull();

    await fireEvent.press(getByTestId("edit-message-server-reconcile"));

    expect(getByTestId("edit-message-text").props.children).toBe("Polished draft (server)");
    expect(getByTestId("edit-message-edited").props.children).toBe("true");
  });
});
