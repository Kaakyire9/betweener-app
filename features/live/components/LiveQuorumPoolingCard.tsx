import { Check, Link2, ShieldCheck, Users } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { LivePoolCandidatePreview, LiveQuorumPoolingSnapshot } from '../application/index.ts';
import { liveQuorumCopy, liveQuorumProgress } from '../domain/live-quorum-pooling.ts';

type Props = {
  snapshot: LiveQuorumPoolingSnapshot | null;
  preview: LivePoolCandidatePreview | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onSetPreference: (allowed: boolean) => void;
  onRespondOffer: (offerId: string, accept: boolean) => void;
  onCreateDefaultRule: () => void;
  onCreatePool: (candidateSessionId: string, ruleId: string) => void;
  onOpenSession: (sessionId: string) => void;
};

export function LiveQuorumPoolingCard({
  snapshot,
  preview,
  loading,
  saving,
  error,
  onSetPreference,
  onRespondOffer,
  onCreateDefaultRule,
  onCreatePool,
  onOpenSession,
}: Props) {
  if (loading && !snapshot) {
    return <View style={styles.card}><ActivityIndicator color="#E1BE70" /></View>;
  }
  if (!snapshot) return null;
  const confirmed = snapshot.quorum.reached;
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={[styles.icon, confirmed && styles.confirmedIcon]}>
          {confirmed ? <Check size={17} color="#102522" /> : <Users size={17} color="#E7CE92" />}
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{confirmed ? 'TONIGHT IS CONFIRMED' : 'ALMOST READY'}</Text>
          <Text style={styles.heading}>{confirmed ? 'The room is coming together' : 'A warmer room is forming'}</Text>
        </View>
      </View>
      <Text style={styles.body}>{liveQuorumCopy(snapshot.quorum)}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${liveQuorumProgress(snapshot.quorum) * 100}%` }]} />
      </View>
      <Text style={styles.meta}>{snapshot.quorum.attendanceCount} of {snapshot.quorum.minimumAttendance} places saved</Text>

      {snapshot.pool ? (
        <View style={styles.poolNotice}>
          <Link2 size={17} color="#D8BDEA" />
          <View style={styles.poolCopy}>
            <Text style={styles.poolTitle}>A thoughtfully combined Live</Text>
            <Text style={styles.poolBody}>{snapshot.pool.explanation}</Text>
            {snapshot.pool.myOfferState === 'accepted' ? <Pressable onPress={() => onOpenSession(snapshot.pool!.primarySessionId)}><Text style={styles.poolLink}>View {snapshot.pool.primaryTitle} →</Text></Pressable> : null}
          </View>
        </View>
      ) : null}

      {snapshot.offer ? (
        <View style={styles.offer}>
          <Text style={styles.offerEyebrow}>A COMPATIBLE LIVE INVITATION</Text>
          <Text style={styles.offerTitle}>Join {snapshot.offer.destinationTitle}</Text>
          <Text style={styles.offerBody}>{snapshot.offer.explanation}</Text>
          <Text style={styles.originNote}>Your original event context stays attached to your participation.</Text>
          <View style={styles.actions}>
            <Pressable disabled={saving} onPress={() => onRespondOffer(snapshot.offer!.id, true)} style={styles.primary}><Text style={styles.primaryText}>Join combined Live</Text></Pressable>
            <Pressable disabled={saving} onPress={() => onRespondOffer(snapshot.offer!.id, false)} style={styles.secondary}><Text style={styles.secondaryText}>Keep my original event</Text></Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.preference}>
        <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Compatible combined Lives</Text><Text style={styles.preferenceBody}>Allow transparent invitations when another event makes this room more viable.</Text></View>
        <Switch
          accessibilityLabel="Allow compatible combined Live invitations"
          disabled={saving}
          value={snapshot.allowPooledLiveSessions}
          onValueChange={onSetPreference}
          trackColor={{ false: '#344742', true: '#6BAA95' }}
          thumbColor="#FFF7EC"
        />
      </View>

      {snapshot.canManagePooling ? (
        <View style={styles.admin}>
          <View style={styles.adminTitleRow}><ShieldCheck size={16} color="#E7CE92" /><Text style={styles.adminTitle}>Pooling preview</Text></View>
          {!preview?.rule ? (
            <><Text style={styles.adminBody}>Create a conservative same-country rule before previewing compatible events.</Text><Pressable disabled={saving} onPress={onCreateDefaultRule} style={styles.adminButton}><Text style={styles.adminButtonText}>Create safe default rule</Text></Pressable></>
          ) : preview.candidates.length === 0 ? <Text style={styles.adminBody}>No other scheduled Lives are available to preview.</Text> : preview.candidates.map((candidate) => (
            <View key={candidate.sessionId} style={styles.candidate}>
              <View style={styles.candidateCopy}><Text style={styles.candidateTitle}>{candidate.title}</Text><Text style={styles.candidateReason}>{candidate.eligible ? preview.rule?.explanation : candidate.reasonTexts[0] ?? 'Not currently eligible.'}</Text></View>
              {candidate.eligible ? <Pressable disabled={saving} onPress={() => onCreatePool(candidate.sessionId, preview.rule!.id)} style={styles.combine}><Text style={styles.combineText}>Combine</Text></Pressable> : null}
            </View>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>This Live’s readiness details could not be updated. Please try again.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 25, padding: 18, backgroundColor: '#132622', borderWidth: 1, borderColor: '#38514B', gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#243A35' }, confirmedIcon: { backgroundColor: '#BBD7CC' }, headingCopy: { flex: 1 }, eyebrow: { color: '#E7CE92', fontSize: 8, letterSpacing: 1.35, fontFamily: 'Manrope_800ExtraBold' }, heading: { color: '#FFF7EC', fontSize: 18, marginTop: 2, fontFamily: 'PlayfairDisplay_700Bold' },
  body: { color: '#C7D5D1', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium' }, progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: '#2B403B' }, progressFill: { height: 5, borderRadius: 3, backgroundColor: '#8FC6B3' }, meta: { color: '#91A39F', fontSize: 10, fontFamily: 'Manrope_700Bold' },
  poolNotice: { flexDirection: 'row', gap: 10, borderRadius: 18, padding: 14, backgroundColor: '#211F2C', borderWidth: 1, borderColor: '#4E405D' }, poolCopy: { flex: 1 }, poolTitle: { color: '#F2E6F8', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' }, poolBody: { color: '#CBBED1', fontSize: 10, lineHeight: 16, marginTop: 4, fontFamily: 'Manrope_500Medium' }, poolLink: { color: '#E7CE92', fontSize: 10, marginTop: 8, fontFamily: 'Manrope_800ExtraBold' },
  offer: { borderRadius: 20, padding: 15, backgroundColor: '#182F2A', borderWidth: 1, borderColor: '#59766E' }, offerEyebrow: { color: '#D8BDEA', fontSize: 8, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' }, offerTitle: { color: '#FFF7EC', fontSize: 17, marginTop: 5, fontFamily: 'PlayfairDisplay_700Bold' }, offerBody: { color: '#CDD9D5', fontSize: 11, lineHeight: 18, marginTop: 7, fontFamily: 'Manrope_500Medium' }, originNote: { color: '#98B2AA', fontSize: 9, lineHeight: 14, marginTop: 7, fontFamily: 'Manrope_600SemiBold' }, actions: { gap: 8, marginTop: 13 }, primary: { minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E1BE70' }, primaryText: { color: '#102522', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' }, secondary: { minHeight: 42, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#C5D3CF', fontSize: 10, fontFamily: 'Manrope_700Bold' },
  preference: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 3 }, preferenceCopy: { flex: 1 }, preferenceTitle: { color: '#F3EDE4', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' }, preferenceBody: { color: '#91A39F', fontSize: 9, lineHeight: 14, marginTop: 3, fontFamily: 'Manrope_500Medium' },
  admin: { borderTopWidth: 1, borderTopColor: '#304640', paddingTop: 14, gap: 9 }, adminTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, adminTitle: { color: '#F1E4C6', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' }, adminBody: { color: '#9DB0AA', fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_500Medium' }, adminButton: { minHeight: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#806F4A' }, adminButtonText: { color: '#E7CE92', fontSize: 10, fontFamily: 'Manrope_800ExtraBold' }, candidate: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, padding: 11, backgroundColor: '#0D1E1B' }, candidateCopy: { flex: 1 }, candidateTitle: { color: '#F4EEE5', fontSize: 11, fontFamily: 'Manrope_700Bold' }, candidateReason: { color: '#8FA49F', fontSize: 9, lineHeight: 13, marginTop: 3, fontFamily: 'Manrope_500Medium' }, combine: { minHeight: 34, borderRadius: 17, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#BBD7CC' }, combineText: { color: '#102522', fontSize: 9, fontFamily: 'Manrope_800ExtraBold' }, error: { color: '#D8AAA5', fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_600SemiBold' },
});
