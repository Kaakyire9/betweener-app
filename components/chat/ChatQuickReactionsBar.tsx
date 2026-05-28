import type { MessageType } from "@/components/chat/types";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

type Theme = {
  text: string;
  danger: string;
};

type Props = {
  item: MessageType;
  isMyMessage: boolean;
  isActionPinned: boolean;
  canEdit: boolean;
  quickReactions: string[];
  styles: Record<string, any>;
  theme: Theme;
  onAddReaction: (messageId: string, emoji: string) => void;
  onCloseReactions: () => void;
  onReply: (message: MessageType) => void;
  onCopyMessage: (message: MessageType) => void;
  onEditMessage: (message: MessageType) => void;
  onTogglePin: (message: MessageType, isPinned: boolean) => void;
  onDeleteMessage: (message: MessageType) => void;
};

export default function ChatQuickReactionsBar({
  item,
  isMyMessage,
  isActionPinned,
  canEdit,
  quickReactions,
  styles,
  theme,
  onAddReaction,
  onCloseReactions,
  onReply,
  onCopyMessage,
  onEditMessage,
  onTogglePin,
  onDeleteMessage,
}: Props) {
  return (
    <>
      <View
        style={[
          styles.quickReactionsContainer,
          isMyMessage ? styles.quickReactionsRight : styles.quickReactionsLeft,
        ]}
      >
        {!item.deletedForAll
          ? quickReactions.map((emoji, idx) => (
              <TouchableOpacity
                key={`${emoji}-${idx}`}
                testID={`chat-quick-reaction-${idx}`}
                style={styles.quickReactionButton}
                onPress={() => onAddReaction(item.id, emoji)}
              >
                <Text style={styles.quickReactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))
          : null}
      </View>

      {!item.deletedForAll ? (
        <View
          style={[
            styles.messageActionRow,
            isMyMessage ? styles.messageActionRowRight : styles.messageActionRowLeft,
          ]}
        >
          <TouchableOpacity
            testID="chat-quick-action-reply"
            style={styles.messageActionPill}
            onPress={() => {
              onReply(item);
              onCloseReactions();
            }}
          >
            <MaterialCommunityIcons name="reply" size={14} color={theme.text} />
            <Text style={styles.messageActionPillLabel}>Reply</Text>
          </TouchableOpacity>

          {!item.isViewOnce ? (
            <TouchableOpacity
              testID="chat-quick-action-copy"
              style={styles.messageActionPill}
              onPress={() => {
                onCopyMessage(item);
                onCloseReactions();
              }}
            >
              <MaterialCommunityIcons name="content-copy" size={14} color={theme.text} />
              <Text style={styles.messageActionPillLabel}>Copy</Text>
            </TouchableOpacity>
          ) : null}

          {canEdit ? (
            <TouchableOpacity
              testID="chat-quick-action-edit"
              style={styles.messageActionPill}
              onPress={() => {
                onEditMessage(item);
                onCloseReactions();
              }}
            >
              <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.text} />
              <Text style={styles.messageActionPillLabel}>Edit</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            testID="chat-quick-action-pin"
            style={styles.messageActionPill}
            onPress={() => {
              onTogglePin(item, isActionPinned);
              onCloseReactions();
            }}
          >
            <MaterialCommunityIcons
              name={isActionPinned ? "pin-off-outline" : "pin-outline"}
              size={14}
              color={theme.text}
            />
            <Text style={styles.messageActionPillLabel}>
              {isActionPinned ? "Unpin" : "Pin"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="chat-quick-action-delete"
            style={[styles.messageActionPill, styles.messageActionPillDanger]}
            onPress={() => {
              onDeleteMessage(item);
              onCloseReactions();
            }}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={14} color={theme.danger} />
            <Text style={[styles.messageActionPillLabel, styles.messageActionPillLabelDanger]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );
}
