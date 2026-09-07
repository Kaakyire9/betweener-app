import {
  Archive,
  CalendarClock,
  Copy,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  LiveCancellationReason,
  LiveSessionSummary,
} from '../application/index.ts';

const CANCELLATION_REASONS: readonly {
  value: LiveCancellationReason;
  label: string;
}[] = [
  { value: 'plans_changed', label: 'Plans changed' },
  { value: 'host_unavailable', label: 'Host unavailable' },
  { value: 'not_enough_people', label: 'Not enough people' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'other', label: 'Another reason' },
];

function Action({
  icon,
  title,
  description,
  destructive = false,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <View style={[styles.actionIcon, destructive && styles.destructiveIcon]}>{icon}</View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionTitle, destructive && styles.destructiveText]}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
    </Pressable>
  );
}

export function LiveEventManagementSheet({
  visible,
  session,
  busy,
  onClose,
  onEdit,
  onReschedule,
  onDuplicate,
  onCancel,
  onArchive,
}: {
  visible: boolean;
  session: LiveSessionSummary;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onReschedule: () => void;
  onDuplicate: () => void;
  onCancel: (reason: LiveCancellationReason) => void;
  onArchive: () => void;
}) {
  const [reason, setReason] = useState<LiveCancellationReason>('plans_changed');
  const editable = ['scheduled', 'waiting_for_quorum', 'confirmed'].includes(session.status);
  const cancellable = ['draft', 'scheduled', 'waiting_for_quorum', 'confirmed', 'backstage'].includes(session.status);
  const archivable = session.status === 'ended' || session.status === 'cancelled';

  const confirmCancellation = () => {
    const label = CANCELLATION_REASONS.find((item) => item.value === reason)?.label ?? 'Plans changed';
    Alert.alert(
      'Cancel this Live?',
      `Guests will see that it was cancelled. Reason: ${label}. This action cannot be undone.`,
      [
        { text: 'Keep Live', style: 'cancel' },
        { text: 'Cancel Live', style: 'destructive', onPress: () => onCancel(reason) },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close Live management" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View><Text style={styles.eyebrow}>HOST CONTROLS</Text><Text style={styles.title}>Manage Live</Text></View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}><X size={20} color="#FFF7EC" /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {editable ? (
              <>
                <Action icon={<Pencil size={18} color="#D7B56D" />} title="Edit details" description="Refine the story, poster, room settings, or time." onPress={onEdit} />
                <Action icon={<CalendarClock size={18} color="#D7B56D" />} title="Reschedule" description="Choose a new time; existing guests must reconfirm." onPress={onReschedule} />
              </>
            ) : null}
            <Action icon={<Copy size={18} color="#D7B56D" />} title="Create a copy" description="Start a new Studio draft using this Live as the foundation." onPress={onDuplicate} />
            {cancellable ? (
              <View style={styles.cancelBlock}>
                <View style={styles.cancelHeading}><RotateCcw size={16} color="#E7B1A7" /><Text style={styles.cancelTitle}>Cancellation reason</Text></View>
                <View style={styles.reasons}>
                  {CANCELLATION_REASONS.map((item) => (
                    <Pressable
                      key={item.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: reason === item.value }}
                      onPress={() => setReason(item.value)}
                      style={[styles.reason, reason === item.value && styles.reasonActive]}
                    >
                      <Text style={[styles.reasonText, reason === item.value && styles.reasonTextActive]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Action icon={<Trash2 size={18} color="#FFB8AC" />} title="Cancel Live" description="Close the room and notify guests without deleting its safety record." destructive onPress={confirmCancellation} />
              </View>
            ) : null}
            {archivable ? <Action icon={<Archive size={18} color="#D7B56D" />} title="Archive from Studio" description="Remove this completed record from your Studio list." onPress={onArchive} /> : null}
          </ScrollView>
          {busy ? <View style={styles.busy}><ActivityIndicator color="#102522" /><Text style={styles.busyText}>Updating Live…</Text></View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,8,7,0.7)' },
  sheet: { maxHeight: '86%', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 9, paddingBottom: 28, backgroundColor: '#0E211D', borderWidth: 1, borderColor: '#38514B' },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#526A64' },
  header: { paddingHorizontal: 22, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#D7B56D', fontSize: 8, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  title: { color: '#FFF7EC', fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#192E29' },
  content: { paddingHorizontal: 18, gap: 9, paddingBottom: 15 },
  action: { minHeight: 76, borderRadius: 20, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#142824', borderWidth: 1, borderColor: '#304A44' },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#27372B' },
  destructiveIcon: { backgroundColor: '#3B2421' },
  actionCopy: { flex: 1 },
  actionTitle: { color: '#FFF7EC', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  destructiveText: { color: '#FFB8AC' },
  actionDescription: { color: '#92A49F', fontSize: 9, lineHeight: 14, marginTop: 3, fontFamily: 'Manrope_500Medium' },
  cancelBlock: { marginTop: 8, borderRadius: 22, padding: 10, gap: 10, backgroundColor: '#1F1E19' },
  cancelHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 5, paddingTop: 4 },
  cancelTitle: { color: '#E8D6D0', fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  reason: { borderRadius: 15, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#2A2922', borderWidth: 1, borderColor: '#48463B' },
  reasonActive: { borderColor: '#E7B1A7', backgroundColor: '#4A302C' },
  reasonText: { color: '#B7B1A5', fontSize: 9, fontFamily: 'Manrope_700Bold' },
  reasonTextActive: { color: '#FFE7E1' },
  busy: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderTopLeftRadius: 32, borderTopRightRadius: 32, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, backgroundColor: 'rgba(215,181,109,0.94)' },
  busyText: { color: '#102522', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
});
