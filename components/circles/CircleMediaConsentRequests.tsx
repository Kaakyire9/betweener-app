import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  fetchMyCircleMediaSubjectApprovals,
  respondToCircleMediaSubjectApproval,
  type CircleMediaSubjectApproval,
} from '@/lib/circles/pulse/circle-pulse-service';
import { useCirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = { circleId: string; actorProfileId: string };

export default function CircleMediaConsentRequests({ circleId, actorProfileId }: Props) {
  const palette = useCirclePulsePalette();
  const [requests, setRequests] = useState<CircleMediaSubjectApproval[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const rows = await fetchMyCircleMediaSubjectApprovals(actorProfileId);
      setRequests(rows.filter((row) => row.circleId === circleId));
    } catch { setRequests([]); }
  }, [actorProfileId, circleId]);
  useEffect(() => { void load(); }, [load]);
  const respond = async (request: CircleMediaSubjectApproval, approve: boolean) => {
    setBusy(true);
    try { await respondToCircleMediaSubjectApproval(request.assetId, actorProfileId, approve); await load(); }
    catch (error) { Alert.alert('Media consent', error instanceof Error ? error.message : 'Could not save your choice.'); }
    finally { setBusy(false); }
  };
  if (requests.length === 0) return null;
  return (
    <View style={[styles.card, { borderColor: palette.purpleBorder, backgroundColor: palette.purpleSoft }]} accessibilityRole="summary">
      <View style={styles.heading}>
        <MaterialCommunityIcons name="account-check-outline" size={20} color={palette.purple} />
        <Text style={[styles.title, { color: palette.text }]}>Your approval is needed</Text>
      </View>
      {requests.map((request) => (
        <View key={request.assetId} style={styles.request}>
          <Text style={[styles.requestTitle, { color: palette.text }]}>{request.title}</Text>
          <Text style={[styles.copy, { color: palette.textMuted }]}>{request.uploaderName} says you are recognisable in this {request.mediaType}. It stays private unless you agree.</Text>
          <View style={styles.actions}>
            <Pressable disabled={busy} style={[styles.decline, { borderColor: palette.outline }]} onPress={() => void respond(request, false)}><Text style={[styles.declineText, { color: palette.textSoft }]}>No, keep private</Text></Pressable>
            <Pressable disabled={busy} style={[styles.approve, { backgroundColor: palette.purple }]} onPress={() => void respond(request, true)}><Text style={styles.approveText}>I approve</Text></Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 14, borderRadius: 18, borderWidth: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 13, fontWeight: '900' },
  request: { gap: 6 },
  requestTitle: { fontSize: 14, fontWeight: '900' },
  copy: { fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  decline: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 18 },
  declineText: { fontSize: 10, fontWeight: '900' },
  approve: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 18 },
  approveText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
