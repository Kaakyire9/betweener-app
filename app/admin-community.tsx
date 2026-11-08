import { AdminScreenShell } from '@/components/admin/AdminScreenShell';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type QueueKind = 'circle' | 'gathering';
type QueueItem = {
  id: string;
  kind: QueueKind;
  title: string;
  description: string | null;
  status: string;
  location: string;
  createdAt: string;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function AdminCommunityScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const styles = useMemo(() => createStyles(theme, resolvedScheme === 'dark'), [theme, resolvedScheme]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeKind, setActiveKind] = useState<QueueKind>('circle');
  const [rejecting, setRejecting] = useState<QueueItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [circlesResult, gatheringsResult] = await Promise.all([
      supabase.rpc('rpc_admin_get_circles_queue'),
      supabase.rpc('rpc_admin_get_gatherings_queue'),
    ]);
    setLoading(false);

    const error = circlesResult.error || gatheringsResult.error;
    if (error) {
      Alert.alert('Community queue', error.message || 'Unable to load the review queue.');
      return;
    }

    const circles: QueueItem[] = (circlesResult.data ?? []).map((row) => ({
      id: row.id,
      kind: 'circle',
      title: row.name,
      description: row.short_description || row.description,
      status: row.status,
      location: [row.city, row.country_name].filter(Boolean).join(' · ') || 'Location flexible',
      createdAt: row.created_at,
    }));
    const gatherings: QueueItem[] = (gatheringsResult.data ?? []).map((row) => ({
      id: row.id,
      kind: 'gathering',
      title: row.title,
      description: row.description,
      status: row.status,
      location: [row.venue_name, row.city].filter(Boolean).join(' · ') || row.gathering_type,
      createdAt: row.created_at,
    }));
    setItems([...circles, ...gatherings]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = useCallback((item: QueueItem) => {
    Alert.alert(`Approve ${item.kind}`, `Publish “${item.title}” to staging?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: () => {
          void (async () => {
            setMutatingId(item.id);
            const result = item.kind === 'circle'
              ? await supabase.rpc('rpc_approve_circle', { p_circle_id: item.id })
              : await supabase.rpc('rpc_approve_gathering', { p_gathering_id: item.id });
            setMutatingId(null);
            if (result.error) {
              Alert.alert('Approval failed', result.error.message);
              return;
            }
            await load();
          })();
        },
      },
    ]);
  }, [load]);

  const reject = useCallback(async () => {
    if (!rejecting || rejectReason.trim().length < 8) {
      Alert.alert('Reason required', 'Add a clear reason the creator can act on.');
      return;
    }
    setMutatingId(rejecting.id);
    const result = rejecting.kind === 'circle'
      ? await supabase.rpc('rpc_reject_circle', { p_circle_id: rejecting.id, p_reason: rejectReason.trim() })
      : await supabase.rpc('rpc_reject_gathering', { p_gathering_id: rejecting.id, p_reason: rejectReason.trim() });
    setMutatingId(null);
    if (result.error) {
      Alert.alert('Rejection failed', result.error.message);
      return;
    }
    setRejecting(null);
    setRejectReason('');
    await load();
  }, [load, rejectReason, rejecting]);

  const visibleItems = items.filter((item) => item.kind === activeKind);
  const pendingCount = (kind: QueueKind) => items.filter((item) => item.kind === kind && item.status === 'pending_review').length;

  return (
    <AdminScreenShell title="Community" subtitle="Global Circle and Gathering review queues." capability="community" refreshing={loading} onRefresh={() => void load()}>
      <View style={styles.segmented}>
        {(['circle', 'gathering'] as const).map((kind) => {
          const active = activeKind === kind;
          return (
            <Pressable key={kind} style={[styles.segment, active && styles.segmentActive]} onPress={() => setActiveKind(kind)}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{kind === 'circle' ? 'Circles' : 'Gatherings'}</Text>
              <View style={[styles.countBadge, active && styles.countBadgeActive]}>
                <Text style={[styles.countText, active && styles.countTextActive]}>{pendingCount(kind)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.queueHeader}>
        <Text style={styles.queueTitle}>{activeKind === 'circle' ? 'Circle requests' : 'Gathering requests'}</Text>
        <Text style={styles.queueHint}>{visibleItems.length} total</Text>
      </View>

      {visibleItems.length ? visibleItems.map((item) => (
        <View key={`${item.kind}:${item.id}`} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.kindIcon}>
              <MaterialCommunityIcons name={item.kind === 'circle' ? 'account-group-outline' : 'calendar-heart'} size={18} color={theme.tint} />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{item.location} · {formatDate(item.createdAt)}</Text>
            </View>
            <View style={[styles.status, item.status === 'pending_review' ? styles.statusPending : styles.statusNeutral]}>
              <Text style={styles.statusText}>{item.status.replace('_', ' ')}</Text>
            </View>
          </View>
          <Text style={styles.cardBody}>{item.description || 'No description supplied.'}</Text>
          {item.status === 'pending_review' ? (
            <View style={styles.actions}>
              <TouchableOpacity disabled={mutatingId === item.id} style={styles.secondaryButton} onPress={() => { setRejectReason(''); setRejecting(item); }}>
                <Text style={styles.secondaryText}>Needs changes</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={mutatingId === item.id} style={styles.primaryButton} onPress={() => approve(item)}>
                <Text style={styles.primaryText}>{mutatingId === item.id ? 'Working…' : 'Approve'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )) : (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="check-decagram-outline" size={26} color={theme.tint} />
          <Text style={styles.emptyTitle}>Queue clear</Text>
          <Text style={styles.emptyBody}>No {activeKind === 'circle' ? 'Circle' : 'Gathering'} requests are waiting.</Text>
        </View>
      )}

      <Modal visible={Boolean(rejecting)} transparent animationType="fade" onRequestClose={() => setRejecting(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRejecting(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request changes</Text>
            <Text style={styles.modalBody}>Explain what must change before this can be approved.</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              maxLength={500}
              placeholder="Clear, actionable reason"
              placeholderTextColor={theme.textMuted}
              style={styles.input}
            />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setRejecting(null)}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.dangerButton} onPress={() => void reject()}><Text style={styles.dangerText}>Send back</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AdminScreenShell>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => StyleSheet.create({
  segmented: { flexDirection: 'row', gap: 8, padding: 5, borderRadius: 18, backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.64)', borderWidth: 1, borderColor: theme.outline },
  segment: { flex: 1, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  segmentActive: { backgroundColor: theme.tint },
  segmentText: { color: theme.textMuted, fontFamily: 'Archivo_700Bold', fontSize: 12 },
  segmentTextActive: { color: '#FFFFFF' },
  countBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.outline },
  countBadgeActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  countText: { color: theme.textMuted, fontFamily: 'Archivo_700Bold', fontSize: 10 },
  countTextActive: { color: '#FFFFFF' },
  queueHeader: { marginTop: 4, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  queueTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20 },
  queueHint: { color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  card: { gap: 12, padding: 16, borderRadius: 22, backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.74)', borderWidth: 1, borderColor: theme.outline },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  kindIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(0,160,160,0.12)' : 'rgba(0,128,128,0.09)' },
  cardCopy: { flex: 1, gap: 3 },
  cardTitle: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 15 },
  cardMeta: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 10, lineHeight: 15 },
  cardBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
  status: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  statusPending: { backgroundColor: isDark ? 'rgba(240,197,94,0.14)' : 'rgba(145,99,0,0.10)' },
  statusNeutral: { backgroundColor: theme.outline },
  statusText: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 9, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  primaryButton: { minHeight: 42, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tint },
  primaryText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 12 },
  secondaryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline },
  secondaryText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 12 },
  dangerButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.danger },
  dangerText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 12 },
  empty: { alignItems: 'center', gap: 7, padding: 28, borderRadius: 22, borderWidth: 1, borderColor: theme.outline, backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.64)' },
  emptyTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20 },
  emptyBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalCard: { gap: 12, padding: 20, borderRadius: 24, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.outline },
  modalTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 23 },
  modalBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
  input: { minHeight: 110, padding: 14, borderRadius: 16, textAlignVertical: 'top', color: theme.text, backgroundColor: theme.backgroundSubtle, borderWidth: 1, borderColor: theme.outline, fontFamily: 'Manrope_500Medium' },
});
