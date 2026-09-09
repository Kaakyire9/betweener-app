import { Check, Link2, ShieldCheck, Users } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { LivePoolCandidatePreview, LiveQuorumPoolingSnapshot } from '../application/index.ts';
import { liveQuorumCopy, liveQuorumProgress } from '../domain/live-quorum-pooling.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

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
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  if (loading && !snapshot) {
    return <View style={styles.card}><ActivityIndicator color={visual.teal} /></View>;
  }
  if (!snapshot) return null;
  const confirmed = snapshot.quorum.reached;
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={[styles.icon, confirmed && styles.confirmedIcon]}>
          {confirmed ? <Check size={17} color={visual.accentContrast} /> : <Users size={17} color={visual.teal} />}
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
          <Link2 size={17} color={visual.purple} />
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
          trackColor={{ false: visual.borderStrong, true: visual.teal }}
          thumbColor={visual.surfaceRaised}
        />
      </View>

      {snapshot.canManagePooling ? (
        <View style={styles.admin}>
          <View style={styles.adminTitleRow}><ShieldCheck size={16} color={visual.teal} /><Text style={styles.adminTitle}>Pooling preview</Text></View>
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

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  card: { borderRadius: 25, padding: 18, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border, gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.tealSoft }, confirmedIcon: { backgroundColor: visual.teal }, headingCopy: { flex: 1 }, eyebrow: { color: visual.teal, fontSize: 8, letterSpacing: 1.35, fontFamily: 'Manrope_800ExtraBold' }, heading: { color: visual.text, fontSize: 18, marginTop: 2, fontFamily: 'PlayfairDisplay_700Bold' },
  body: { color: visual.textMuted, fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium' }, progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: visual.border }, progressFill: { height: 5, borderRadius: 3, backgroundColor: visual.teal }, meta: { color: visual.textMuted, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  poolNotice: { flexDirection: 'row', gap: 10, borderRadius: 18, padding: 14, backgroundColor: visual.purpleSoft, borderWidth: 1, borderColor: visual.purple }, poolCopy: { flex: 1 }, poolTitle: { color: visual.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' }, poolBody: { color: visual.textMuted, fontSize: 10, lineHeight: 16, marginTop: 4, fontFamily: 'Manrope_500Medium' }, poolLink: { color: visual.teal, fontSize: 10, marginTop: 8, fontFamily: 'Manrope_800ExtraBold' },
  offer: { borderRadius: 20, padding: 15, backgroundColor: visual.surfaceSoft, borderWidth: 1, borderColor: visual.borderStrong }, offerEyebrow: { color: visual.purple, fontSize: 8, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' }, offerTitle: { color: visual.text, fontSize: 17, marginTop: 5, fontFamily: 'PlayfairDisplay_700Bold' }, offerBody: { color: visual.textMuted, fontSize: 11, lineHeight: 18, marginTop: 7, fontFamily: 'Manrope_500Medium' }, originNote: { color: visual.textMuted, fontSize: 9, lineHeight: 14, marginTop: 7, fontFamily: 'Manrope_600SemiBold' }, actions: { gap: 8, marginTop: 13 }, primary: { minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.teal }, primaryText: { color: visual.accentContrast, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' }, secondary: { minHeight: 42, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: visual.text, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  preference: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 3 }, preferenceCopy: { flex: 1 }, preferenceTitle: { color: visual.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' }, preferenceBody: { color: visual.textMuted, fontSize: 9, lineHeight: 14, marginTop: 3, fontFamily: 'Manrope_500Medium' },
  admin: { borderTopWidth: 1, borderTopColor: visual.border, paddingTop: 14, gap: 9 }, adminTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, adminTitle: { color: visual.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' }, adminBody: { color: visual.textMuted, fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_500Medium' }, adminButton: { minHeight: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.teal }, adminButtonText: { color: visual.teal, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' }, candidate: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, padding: 11, backgroundColor: visual.surfaceSoft }, candidateCopy: { flex: 1 }, candidateTitle: { color: visual.text, fontSize: 11, fontFamily: 'Manrope_700Bold' }, candidateReason: { color: visual.textMuted, fontSize: 9, lineHeight: 13, marginTop: 3, fontFamily: 'Manrope_500Medium' }, combine: { minHeight: 34, borderRadius: 17, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.teal }, combineText: { color: visual.accentContrast, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' }, error: { color: visual.dangerText, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_600SemiBold' },
});
