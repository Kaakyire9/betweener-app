import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import type { CirclePulseComment, CirclePulseCommentReaction } from '@/lib/circles/pulse/circle-pulse-types';
import type { CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

const REACTION_OPTIONS: { kind: CirclePulseCommentReaction; emoji: string; label: string }[] = [
  { kind: 'heart', emoji: '\u2764\uFE0F', label: 'Love' },
  { kind: 'laugh', emoji: '\u{1F602}', label: 'Laugh' },
  { kind: 'love', emoji: '\u{1F60D}', label: 'Admire' },
  { kind: 'thumbs_up', emoji: '\u{1F44D}', label: 'Approve' },
  { kind: 'fire', emoji: '\u{1F525}', label: 'Fire' },
  { kind: 'clap', emoji: '\u{1F44F}', label: 'Clap' },
];

type Props = {
  visible: boolean;
  comment: CirclePulseComment | null;
  palette: CirclePulsePalette;
  moderationState?: {
    pinStatus: 'queued' | 'failed' | null;
    reportStatus: 'queued' | 'failed' | null;
  } | null;
  onClose: () => void;
  onReply: (comment: CirclePulseComment) => void;
  onCopy: (comment: CirclePulseComment) => void;
  onEdit: (comment: CirclePulseComment) => void;
  onReact: (comment: CirclePulseComment, reaction: CirclePulseCommentReaction) => void;
  onTogglePin: (comment: CirclePulseComment, pinned: boolean) => void;
  onRemove: (comment: CirclePulseComment) => void;
  onReport: (comment: CirclePulseComment) => void;
  onRetryModerationSync?: (comment: CirclePulseComment, kind: 'pin' | 'report') => void;
};

type ActionRowProps = {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  danger?: boolean;
  onPress: () => void;
  palette: CirclePulsePalette;
};

function ActionRow({ icon, label, danger = false, onPress, palette }: ActionRowProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.actionRow, danger && { backgroundColor: palette.purpleSoft }]}
      onPress={onPress}
    >
      <Text style={[styles.actionLabel, { color: danger ? palette.danger : palette.text }]}>{label}</Text>
      <MaterialCommunityIcons name={icon} size={18} color={danger ? palette.danger : palette.textMuted} />
    </TouchableOpacity>
  );
}

export default function CirclePulseCommentActionsSheet({
  visible,
  comment,
  palette,
  moderationState,
  onClose,
  onReply,
  onCopy,
  onEdit,
  onReact,
  onTogglePin,
  onRemove,
  onReport,
  onRetryModerationSync,
}: Props) {
  if (!visible || !comment) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay }]} onPress={onClose} />
        <View style={styles.content}>
          <BlurViewSafe
            intensity={46}
            tint={palette.dark ? 'dark' : 'light'}
            style={[
              styles.reactionTray,
              {
                backgroundColor: palette.surfaceStrong,
                borderColor: palette.outline,
              },
            ]}
          >
            {REACTION_OPTIONS.map((option) => {
              const active = comment.myReaction === option.kind;
              return (
                <TouchableOpacity
                  key={option.kind}
                  activeOpacity={0.9}
                  style={[
                    styles.reactionButton,
                    {
                      backgroundColor: active ? palette.tealSoft : palette.surfaceMuted,
                      borderColor: active ? palette.tealBorder : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    onReact(comment, option.kind);
                    onClose();
                  }}
                >
                  <Text style={styles.reactionEmoji}>{option.emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </BlurViewSafe>

          <BlurViewSafe
            intensity={50}
            tint={palette.dark ? 'dark' : 'light'}
            style={[
              styles.actionMenu,
              {
                backgroundColor: palette.surfaceStrong,
                borderColor: palette.outline,
              },
            ]}
          >
            <View style={[styles.previewCard, { borderBottomColor: palette.outline }]}>
              <Text style={[styles.previewName, { color: palette.text }]} numberOfLines={1}>
                {comment.isOwn ? 'You' : comment.displayName}
              </Text>
              <Text style={[styles.previewBody, { color: palette.textSoft }]} numberOfLines={3}>
                {comment.body}
              </Text>
              {moderationState?.pinStatus || moderationState?.reportStatus ? (
                <View style={styles.syncStateGroup}>
                  {moderationState.pinStatus ? (
                    <View
                      style={[
                        styles.syncPill,
                        {
                          backgroundColor:
                            moderationState.pinStatus === 'failed' ? palette.purpleSoft : palette.tealSoft,
                          borderColor:
                            moderationState.pinStatus === 'failed' ? palette.purpleBorder : palette.tealBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.syncPillText,
                          { color: moderationState.pinStatus === 'failed' ? palette.purpleStrong : palette.teal },
                        ]}
                      >
                        {moderationState.pinStatus === 'failed'
                          ? 'Pin sync failed'
                          : comment.pinnedAt
                            ? 'Pin syncing'
                            : 'Unpin syncing'}
                      </Text>
                    </View>
                  ) : null}
                  {moderationState.reportStatus ? (
                    <View
                      style={[
                        styles.syncPill,
                        {
                          backgroundColor:
                            moderationState.reportStatus === 'failed' ? palette.purpleSoft : palette.tealSoft,
                          borderColor:
                            moderationState.reportStatus === 'failed' ? palette.purpleBorder : palette.tealBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.syncPillText,
                          { color: moderationState.reportStatus === 'failed' ? palette.purpleStrong : palette.teal },
                        ]}
                      >
                        {moderationState.reportStatus === 'failed' ? 'Report sync failed' : 'Report syncing'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <ActionRow
              icon="reply-outline"
              label="Reply"
              palette={palette}
              onPress={() => {
                onReply(comment);
                onClose();
              }}
            />
            <ActionRow
              icon="content-copy"
              label="Copy"
              palette={palette}
              onPress={() => {
                onCopy(comment);
                onClose();
              }}
            />
            {comment.canEdit ? (
              <ActionRow
                icon="pencil-outline"
                label="Edit"
                palette={palette}
                onPress={() => {
                  onEdit(comment);
                  onClose();
                }}
              />
            ) : null}
            {comment.canPin ? (
              <ActionRow
                icon={comment.pinnedAt ? 'pin-off-outline' : 'pin-outline'}
                label={comment.pinnedAt ? 'Unpin' : 'Pin'}
                palette={palette}
                onPress={() => {
                  onTogglePin(comment, !comment.pinnedAt);
                  onClose();
                }}
              />
            ) : null}
            {moderationState?.pinStatus === 'failed' ? (
              <ActionRow
                icon="reload"
                label={comment.pinnedAt ? 'Retry pin sync' : 'Retry unpin sync'}
                palette={palette}
                onPress={() => {
                  onRetryModerationSync?.(comment, 'pin');
                  onClose();
                }}
              />
            ) : null}
            {!comment.isOwn ? (
              <ActionRow
                icon="alert-octagon-outline"
                label="Report"
                danger
                palette={palette}
                onPress={() => {
                  onReport(comment);
                  onClose();
                }}
              />
            ) : null}
            {!comment.isOwn && moderationState?.reportStatus === 'failed' ? (
              <ActionRow
                icon="reload"
                label="Retry report sync"
                palette={palette}
                onPress={() => {
                  onRetryModerationSync?.(comment, 'report');
                  onClose();
                }}
              />
            ) : null}
            {comment.canRemove ? (
              <ActionRow
                icon="trash-can-outline"
                label={comment.isOwn ? 'Delete' : 'Remove'}
                danger
                palette={palette}
                onPress={() => {
                  onRemove(comment);
                  onClose();
                }}
              />
            ) : null}
          </BlurViewSafe>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    gap: 8,
  },
  reactionTray: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  reactionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  reactionEmoji: {
    fontSize: 16,
  },
  actionMenu: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 3,
    borderBottomWidth: 1,
  },
  syncStateGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 6,
  },
  syncPill: {
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  previewName: {
    fontSize: 15,
    fontWeight: '700',
  },
  previewBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  actionRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});
