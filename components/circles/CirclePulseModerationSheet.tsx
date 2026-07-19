import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchCirclePulseCommentReports,
  reviewCirclePulseCommentReport,
} from '@/lib/circles/pulse/circle-pulse-service';
import type {
  CirclePulseCommentReport,
  CirclePulseCommentReportAction,
} from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  visible: boolean;
  circleId: string;
  actorProfileId: string | null;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function CirclePulseModerationSheet({
  visible,
  circleId,
  actorProfileId,
  onClose,
  onChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const palette = useCirclePulsePalette();
  const styles = useMemo(() => createStyles(insets.bottom, palette), [insets.bottom, palette]);
  const [reports, setReports] = useState<CirclePulseCommentReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    if (!visible || !circleId || !actorProfileId) return;
    setLoading(true);
    setError(null);
    try {
      setReports(await fetchCirclePulseCommentReports(circleId, actorProfileId));
    } catch {
      setError('Could not open Pulse reports right now.');
    } finally {
      setLoading(false);
    }
  }, [actorProfileId, circleId, visible]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const review = async (commentId: string, action: CirclePulseCommentReportAction) => {
    if (!actorProfileId || savingCommentId) return;
    setSavingCommentId(commentId);
    try {
      await reviewCirclePulseCommentReport(commentId, actorProfileId, action);
      await loadReports();
      void onChanged?.();
    } catch {
      Alert.alert('Pulse moderation', 'Could not update this report right now.');
    } finally {
      setSavingCommentId(null);
    }
  };

  const confirmDismiss = (report: CirclePulseCommentReport) => {
    Alert.alert('Dismiss concern?', 'The comment will remain visible and this report will leave the moderation queue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Dismiss', onPress: () => void review(report.commentId, 'dismiss') },
    ]);
  };

  const confirmRemove = (report: CirclePulseCommentReport) => {
    Alert.alert('Remove comment?', 'The comment will no longer appear in the Circle Pulse discussion.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove comment', style: 'destructive', onPress: () => void review(report.commentId, 'remove') },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Circle Pulse</Text>
              <Text style={styles.title}>Discussion review</Text>
              <Text style={styles.subtitle}>Keep comments warm, respectful, and intentional.</Text>
            </View>
            <Pressable accessibilityLabel="Close Pulse moderation" style={styles.closeButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={18} color={palette.text} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {loading && reports.length === 0 ? (
              <Text style={styles.muted}>Opening reports...</Text>
            ) : error ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="alert-circle-outline" size={25} color={palette.warning} />
                <Text style={styles.emptyTitle}>Reports unavailable</Text>
                <Text style={styles.muted}>{error}</Text>
                <Pressable style={styles.outlineButton} onPress={() => void loadReports()}>
                  <Text style={styles.outlineButtonText}>Try again</Text>
                </Pressable>
              </View>
            ) : reports.length === 0 ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="shield-check-outline" size={27} color={palette.teal} />
                <Text style={styles.emptyTitle}>No Pulse reports</Text>
                <Text style={styles.muted}>Discussion concerns will appear here for private review.</Text>
              </View>
            ) : (
              reports.map((report) => (
                <View key={report.commentId} style={styles.report}>
                  <View style={styles.reportHeader}>
                    <Text style={styles.reportLabel}>{report.itemType.replace('_', ' ')}</Text>
                    <Text style={styles.reportMeta}>{report.reportCount} {report.reportCount === 1 ? 'report' : 'reports'} · {formatDate(report.latestReportAt)}</Text>
                  </View>
                  <Text style={styles.reportTitle} numberOfLines={1}>{report.itemTitle}</Text>
                  <Text style={styles.author}>{report.commentAuthorName}</Text>
                  <Text style={styles.commentBody}>{report.commentBody}</Text>
                  <Text style={styles.reason}>Latest concern: {report.latestReason}</Text>
                  <View style={styles.actions}>
                    {report.status === 'pending' ? (
                      <Pressable
                        accessibilityLabel="Mark Pulse report reviewing"
                        disabled={!!savingCommentId}
                        style={styles.outlineButton}
                        onPress={() => void review(report.commentId, 'reviewing')}
                      >
                        <Text style={styles.outlineButtonText}>Reviewing</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.reviewingLabel}>Reviewing</Text>
                    )}
                    <Pressable
                      accessibilityLabel="Dismiss Pulse report"
                      disabled={!!savingCommentId}
                      style={styles.outlineButton}
                      onPress={() => confirmDismiss(report)}
                    >
                      <Text style={styles.outlineButtonText}>Dismiss</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Remove reported Pulse comment"
                      disabled={!!savingCommentId}
                      style={styles.removeButton}
                      onPress={() => confirmRemove(report)}
                    >
                      <Text style={styles.removeButtonText}>{savingCommentId === report.commentId ? 'Updating' : 'Remove'}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (bottomInset: number, palette: CirclePulsePalette) =>
  StyleSheet.create({
    modal: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: palette.overlay },
    sheet: {
      maxHeight: '82%',
      minHeight: 350,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: Math.max(bottomInset, 16),
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: palette.purpleBorder,
      backgroundColor: palette.surface,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: palette.outline },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 15, paddingBottom: 10 },
    headerCopy: { flex: 1, gap: 3 },
    eyebrow: { color: palette.teal, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4 },
    title: { color: palette.text, fontSize: 21, lineHeight: 26, fontFamily: 'PlayfairDisplay_700Bold' },
    subtitle: { color: palette.textMuted, fontSize: 12, lineHeight: 17 },
    closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceMuted },
    content: { gap: 10, paddingBottom: 6 },
    empty: { minHeight: 225, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 26 },
    emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '900' },
    muted: { color: palette.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
    report: { gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.outline },
    reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    reportLabel: { color: palette.purple, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
    reportMeta: { color: palette.textMuted, fontSize: 10 },
    reportTitle: { color: palette.teal, fontSize: 12, fontWeight: '800' },
    author: { color: palette.text, fontSize: 13, fontWeight: '900' },
    commentBody: { color: palette.textSoft, fontSize: 13, lineHeight: 19 },
    reason: { color: palette.warning, fontSize: 11, lineHeight: 16 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, paddingTop: 3 },
    outlineButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, borderColor: palette.outline },
    outlineButtonText: { color: palette.teal, fontSize: 11, fontWeight: '800' },
    removeButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(232,138,149,0.5)' },
    removeButtonText: { color: palette.danger, fontSize: 11, fontWeight: '900' },
    reviewingLabel: { color: palette.purple, fontSize: 11, fontWeight: '900', paddingHorizontal: 4 },
  });
