import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import type { MessageType } from "@/components/chat/types";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";

type Theme = typeof Colors.light;

type Props = {
  visible: boolean;
  actionMessage: MessageType | null;
  styles: Record<string, any>;
  theme: Theme;
  isDark: boolean;
  canRetryActionMessage: boolean;
  canEditAction: boolean;
  canReportActionMessage: boolean;
  isActionPinned: boolean;
  isChatMuted: boolean;
  onClose: () => void;
  onReply: (message: MessageType) => void;
  onRetry: (message: MessageType) => void;
  onEdit: (message: MessageType) => void;
  onCopy: (message: MessageType) => void;
  onViewEditHistory: (message: MessageType) => void;
  onTogglePin: (message: MessageType, isPinned: boolean) => void;
  onToggleMute: () => void;
  onReport: (message: MessageType) => void;
  onDelete: (message: MessageType) => void;
};

type ActionCardProps = {
  testID: string;
  label: string;
  hint: string;
  icon: string;
  danger?: boolean;
  onPress: () => void;
  styles: Record<string, any>;
  theme: Theme;
};

function ActionCard({
  testID,
  label,
  hint,
  icon,
  danger = false,
  onPress,
  styles,
  theme,
}: ActionCardProps) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.messageActionCard, danger && styles.messageActionDanger]}
      onPress={onPress}
    >
      <View style={[styles.messageActionIcon, danger && styles.messageActionIconDanger]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={22}
          color={danger ? Colors.light.background : theme.text}
        />
      </View>
      <View style={styles.messageActionText}>
        <Text style={[styles.messageActionLabel, danger && styles.messageActionLabelDanger]}>
          {label}
        </Text>
        <Text style={styles.messageActionHint}>{hint}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ChatMessageActionsSheet({
  visible,
  actionMessage,
  styles,
  theme,
  isDark,
  canRetryActionMessage,
  canEditAction,
  canReportActionMessage,
  isActionPinned,
  isChatMuted,
  onClose,
  onReply,
  onRetry,
  onEdit,
  onCopy,
  onViewEditHistory,
  onTogglePin,
  onToggleMute,
  onReport,
  onDelete,
}: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable testID="chat-message-actions-backdrop" style={styles.messageActionBackdrop} onPress={onClose} />
      <View style={styles.messageActionSheet}>
        <BlurViewSafe
          intensity={34}
          tint={isDark ? "dark" : "light"}
          style={styles.messageActionBlur}
        />
        <View style={styles.messageActionContent}>
          <Text style={styles.messageActionTitle}>Message options</Text>
          {actionMessage ? (
            <>
              <ActionCard
                testID="chat-message-action-reply"
                label="Reply"
                hint="Respond to this message."
                icon="reply"
                onPress={() => {
                  onClose();
                  onReply(actionMessage);
                }}
                styles={styles}
                theme={theme}
              />

              {canRetryActionMessage ? (
                <ActionCard
                  testID="chat-message-action-retry"
                  label="Retry send"
                  hint="Try sending this message again."
                  icon="refresh"
                  onPress={() => {
                    onClose();
                    onRetry(actionMessage);
                  }}
                  styles={styles}
                  theme={theme}
                />
              ) : null}

              {canEditAction ? (
                <ActionCard
                  testID="chat-message-action-edit"
                  label="Edit message"
                  hint="Update the text in place."
                  icon="pencil-outline"
                  onPress={() => {
                    onClose();
                    onEdit(actionMessage);
                  }}
                  styles={styles}
                  theme={theme}
                />
              ) : null}

              {!actionMessage.isViewOnce ? (
                <ActionCard
                  testID="chat-message-action-copy"
                  label="Copy"
                  hint="Copy to clipboard."
                  icon="content-copy"
                  onPress={() => {
                    onClose();
                    onCopy(actionMessage);
                  }}
                  styles={styles}
                  theme={theme}
                />
              ) : null}

              {actionMessage.editedAt ? (
                <ActionCard
                  testID="chat-message-action-history"
                  label="View edit history"
                  hint="See previous versions."
                  icon="history"
                  onPress={() => {
                    onClose();
                    onViewEditHistory(actionMessage);
                  }}
                  styles={styles}
                  theme={theme}
                />
              ) : null}

              <ActionCard
                testID="chat-message-action-pin"
                label={isActionPinned ? "Unpin message" : "Pin message"}
                hint={isActionPinned ? "Remove this pin." : "Keep it at the top for you."}
                icon="pin-outline"
                onPress={() => {
                  onClose();
                  onTogglePin(actionMessage, isActionPinned);
                }}
                styles={styles}
                theme={theme}
              />

              <ActionCard
                testID="chat-message-action-mute"
                label={isChatMuted ? "Unmute chat" : "Mute chat"}
                hint="Silence notifications for this chat."
                icon={isChatMuted ? "volume-high" : "volume-off"}
                onPress={() => {
                  onClose();
                  onToggleMute();
                }}
                styles={styles}
                theme={theme}
              />

              {canReportActionMessage ? (
                <ActionCard
                  testID="chat-message-action-report"
                  label="Report message"
                  hint="Attach this message for review."
                  icon="alert-octagon-outline"
                  danger
                  onPress={() => {
                    onClose();
                    onReport(actionMessage);
                  }}
                  styles={styles}
                  theme={theme}
                />
              ) : null}

              <ActionCard
                testID="chat-message-action-delete"
                label="Delete"
                hint="Remove this message."
                icon="trash-can-outline"
                danger
                onPress={() => {
                  onClose();
                  onDelete(actionMessage);
                }}
                styles={styles}
                theme={theme}
              />
            </>
          ) : null}
        </View>
        <TouchableOpacity testID="chat-message-action-cancel" style={styles.messageActionCancel} onPress={onClose}>
          <Text style={styles.messageActionCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
