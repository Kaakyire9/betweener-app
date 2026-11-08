import { Check, ShieldAlert, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LiveReportReason } from '../application/index.ts';
import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const REPORT_REASONS: readonly { label: string; value: LiveReportReason; wide?: boolean }[] = [
  { label: 'Unsafe behaviour', value: 'unsafe_behaviour' },
  { label: 'Harassment', value: 'harassment' },
  { label: 'Hate or abuse', value: 'hate' },
  { label: 'Sexual content', value: 'sexual_content' },
  { label: 'Spam or misleading', value: 'spam' },
  { label: 'Impersonation', value: 'impersonation' },
  { label: 'Something else', value: 'other', wide: true },
];

type Props = {
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: LiveReportReason) => Promise<boolean>;
  roomTitle: string;
  targetName?: string | null;
  visible: boolean;
};

/** Private room-level reporting. Reports enter the same durable Live safety queue. */
export function LiveSafetyReportSheet({
  busy,
  onClose,
  onSubmit,
  roomTitle,
  targetName = null,
  visible,
}: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<LiveReportReason | null>(null);

  useEffect(() => {
    if (!visible) setReason(null);
  }, [visible]);

  const submit = async () => {
    if (!reason || busy) return;
    const sent = await onSubmit(reason);
    if (!sent) {
      Alert.alert('Report not sent', 'Check your connection and try again.');
      return;
    }
    onClose();
    Alert.alert(
      'Report received',
      'Your report was sent privately to Betweener Safety. Leave the room if you feel unsafe.',
    );
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={busy ? undefined : onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="Close safety report"
          disabled={busy}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <LiveGlassSurface intensity={76} style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <ShieldAlert color={visual.color.dangerText} size={19} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>PRIVATE SAFETY REPORT</Text>
                <Text style={styles.title}>{targetName ? `Report ${targetName}` : 'Report this Live'}</Text>
              </View>
              <Pressable
                accessibilityLabel="Close safety report"
                accessibilityRole="button"
                disabled={busy}
                onPress={onClose}
                style={styles.closeButton}
              >
                <X color={visual.color.text} size={18} />
              </Pressable>
            </View>

            <Text numberOfLines={2} style={styles.intro}>
              {targetName
                ? `Tell us what concerns you about ${targetName}. Your report is never shown in the room.`
                : `Tell us what concerns you about ${roomTitle}. Your report is never shown in the room.`}
            </Text>

            <View accessibilityRole="radiogroup" style={styles.reasons}>
              {REPORT_REASONS.map((item) => {
                const selected = item.value === reason;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: busy }}
                    disabled={busy}
                    key={item.value}
                    onPress={() => setReason(item.value)}
                    style={({ pressed }) => [
                      styles.reason,
                      item.wide && styles.reasonWide,
                      selected && styles.reasonSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                      {item.label}
                    </Text>
                    <View style={[styles.selection, selected && styles.selectionSelected]}>
                      {selected ? <Check color={visual.color.accentContrast} size={12} strokeWidth={3} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !reason || busy }}
              disabled={!reason || busy}
              onPress={() => void submit()}
              style={[styles.submit, (!reason || busy) && styles.submitDisabled]}
            >
              <Text style={styles.submitText}>{busy ? 'Sending privately...' : 'Submit report'}</Text>
            </Pressable>
          </LiveGlassSurface>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: visual.color.scrim },
  sheetWrap: { paddingHorizontal: 12 },
  sheet: {
    borderRadius: 28,
    padding: 17,
    gap: 12,
    backgroundColor: visual.color.surfaceTranslucent,
    borderColor: visual.color.borderStrong,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.dangerSoft,
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: visual.color.dangerText, fontSize: 8, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 2, color: visual.color.text, fontSize: 21, fontFamily: 'PlayfairDisplay_700Bold' },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.surfaceRaised,
    borderWidth: 1,
    borderColor: visual.color.border,
  },
  intro: { color: visual.color.textMuted, fontSize: 11, lineHeight: 17, fontFamily: 'Manrope_500Medium' },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reason: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 48,
    paddingHorizontal: 11,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: visual.color.surfaceRaised,
    borderWidth: 1,
    borderColor: visual.color.border,
  },
  reasonWide: { flexBasis: '100%' },
  reasonSelected: { backgroundColor: visual.color.dangerSoft, borderColor: visual.color.danger },
  reasonLabel: { flexShrink: 1, color: visual.color.text, fontSize: 11, lineHeight: 15, fontFamily: 'Manrope_600SemiBold' },
  reasonLabelSelected: { color: visual.color.dangerText, fontFamily: 'Manrope_700Bold' },
  selection: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.color.borderStrong },
  selectionSelected: { backgroundColor: visual.color.danger, borderColor: visual.color.danger },
  submit: { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.danger },
  submitDisabled: { opacity: 0.42 },
  submitText: { color: visual.color.accentContrast, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  pressed: { opacity: 0.76 },
});
