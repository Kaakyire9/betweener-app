import { Check, MapPin, ShieldCheck, Sparkles, UsersRound, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type {
  LiveHostedCandidate,
  LiveHostedMatchingSnapshot,
  LiveMatchRoundPerson,
} from '../application/index.ts';
import {
  canProposeLivePair,
  getLivePairAvailability,
  getLiveHostedMatchingErrorCopy,
  hasProposableLivePair,
} from '../domain/live-hosted-pairability.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

export type LiveHostedMatchingPanelProps = {
  snapshot: LiveHostedMatchingSnapshot | null;
  currentUserId: string | null;
  openToIntroductions: boolean;
  busyAction: string | null;
  error: string | null;
  onSetAvailability: (open: boolean) => void;
  onPropose: (userA: string, userB: string) => void;
  onRespond: (roundId: string, accept: boolean) => void;
  onTransition: (
    roundId: string,
    state: 'public_introduction' | 'completed' | 'cancelled',
  ) => void;
  onRespondPrivateSpark: (privateSparkId: string, accept: boolean) => void;
  onEnterPrivateSpark: (privateSparkId: string) => void;
  onEndPrivateSpark: (privateSparkId: string) => void;
  showAvailabilityControl?: boolean;
};

const initials = (name: string | null) => name?.trim().slice(0, 1).toUpperCase() || 'B';

const PersonAvatar = ({ person, size = 50 }: { person: LiveMatchRoundPerson | LiveHostedCandidate; size?: number }) => {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return person.avatarUrl
    ? <Image source={{ uri: person.avatarUrl }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} />
    : <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}><Text style={styles.avatarInitial}>{initials(person.fullName)}</Text></View>;
};

export function LiveHostedMatchingPanel({
  snapshot,
  currentUserId,
  openToIntroductions,
  busyAction,
  error,
  onSetAvailability,
  onPropose,
  onRespond,
  onTransition,
  onRespondPrivateSpark,
  onEnterPrivateSpark,
  onEndPrivateSpark,
  showAvailabilityControl = true,
}: LiveHostedMatchingPanelProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const activeRound = snapshot?.activeRound ?? null;
  const selected = useMemo(
    () => snapshot?.candidates.filter((candidate) => selectedIds.includes(candidate.userId)) ?? [],
    [selectedIds, snapshot?.candidates],
  );
  const hasAvailablePair = useMemo(
    () => hasProposableLivePair(snapshot?.candidates ?? []),
    [snapshot?.candidates],
  );
  const selectedPairIsProposable = selected.length === 2
    && canProposeLivePair(selected[0], selected[1]);
  const errorCopy = getLiveHostedMatchingErrorCopy(error);

  useEffect(() => {
    setSelectedIds((current) => {
      const present = current.filter((id) => (
        snapshot?.candidates.some((candidate) => candidate.userId === id)
      ));
      if (present.length === 2) {
        const first = snapshot?.candidates.find((candidate) => candidate.userId === present[0]);
        const second = snapshot?.candidates.find((candidate) => candidate.userId === present[1]);
        if (!first || !second || !canProposeLivePair(first, second)) return present.slice(0, 1);
      }
      return present.length === current.length
        && present.every((id, index) => id === current[index]) ? current : present;
    });
  }, [snapshot?.candidates]);

  const toggleCandidate = (userId: string) => {
    setSelectedIds((current) => {
      if (current.includes(userId)) return current.filter((id) => id !== userId);
      if (current.length >= 2) return [userId];
      const firstCandidate = snapshot?.candidates.find(
        (candidate) => candidate.userId === current[0],
      );
      const nextCandidate = snapshot?.candidates.find(
        (candidate) => candidate.userId === userId,
      );
      if (firstCandidate && nextCandidate
        && !canProposeLivePair(firstCandidate, nextCandidate)) return current;
      return [...current, userId];
    });
  };

  if (!snapshot) return null;

  const privateSpark = snapshot.privateSpark;
  const privateSparkOther = privateSpark?.isParticipant
    ? privateSpark.participantA.userId === currentUserId
      ? privateSpark.participantB
      : privateSpark.participantA
    : null;

  const privateSparkCard = privateSpark ? (
    <View style={styles.privateSparkCard}>
      <View style={styles.privateSparkHeading}>
        <View style={styles.sparkBadge}><Sparkles size={17} color={visual.color.purple} /></View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>PRIVATE SPARK</Text>
          <Text style={styles.privateSparkTitle}>
            {privateSpark.state === 'active'
              ? 'Your private room is ready.'
              : privateSpark.isParticipant
                ? `Continue privately with ${privateSparkOther?.fullName?.split(' ')[0] || 'this connection'}?`
                : 'A private continuation was offered.'}
          </Text>
        </View>
      </View>
      <Text style={styles.invitationCopy}>
        {privateSpark.state === 'active'
          ? privateSpark.isParticipant
            ? 'Only the two of you can enter. The host and audience cannot watch or listen.'
            : 'Both members accepted. Their room is private; only safety termination remains available.'
          : privateSpark.isParticipant
            ? 'Your answer stays private. The room opens only if you both independently agree.'
            : 'Waiting privately for both members. Individual answers are never shown to the host.'}
      </Text>
      {privateSpark.state === 'active' && privateSpark.isParticipant ? (
        <Pressable
          disabled={busyAction !== null}
          onPress={() => onEnterPrivateSpark(privateSpark.id)}
          style={styles.primaryAction}
        >
          <Text style={styles.primaryActionText}>Enter Private Spark</Text>
        </Pressable>
      ) : privateSpark.state === 'awaiting_consent' && privateSpark.isParticipant ? (
        privateSpark.myResponse ? (
          <View style={styles.waitingPill}>
            <Text style={styles.waitingText}>Choice saved privately · waiting</Text>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Pressable disabled={busyAction !== null} onPress={() => onRespondPrivateSpark(privateSpark.id, false)} style={styles.notNowAction}>
              <X size={16} color={visual.color.textMuted} /><Text style={styles.notNowText}>Not now</Text>
            </Pressable>
            <Pressable disabled={busyAction !== null} onPress={() => onRespondPrivateSpark(privateSpark.id, true)} style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>Continue privately</Text>
            </Pressable>
          </View>
        )
      ) : null}
      {privateSpark.canManage && privateSpark.state === 'active' ? (
        <Pressable disabled={busyAction !== null} onPress={() => onEndPrivateSpark(privateSpark.id)} style={styles.quietAction}>
          <Text style={styles.quietActionText}>Safety end private room</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  if (snapshot.canManage) {
    return (
      <View style={styles.panel}>
        <View style={styles.headingRow}>
          <View style={styles.headingIcon}><UsersRound size={16} color={visual.color.purple} /></View>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>HOSTED MATCHING</Text>
            <Text style={styles.title}>Warm introductions, with consent.</Text>
          </View>
        </View>

        {privateSparkCard}

        {activeRound ? (
          <View style={styles.roundCard}>
            <View style={styles.pairRow}>
              <View style={styles.pairPerson}><PersonAvatar person={activeRound.participantA} /><Text numberOfLines={1} style={styles.personName}>{activeRound.participantA.fullName || 'Member'}</Text></View>
              <View style={styles.sparkBadge}><Sparkles size={17} color={visual.color.purple} /></View>
              <View style={styles.pairPerson}><PersonAvatar person={activeRound.participantB} /><Text numberOfLines={1} style={styles.personName}>{activeRound.participantB.fullName || 'Member'}</Text></View>
            </View>
            <Text style={styles.roundStatus}>
              {activeRound.state === 'awaiting_consent'
                ? 'Invitations sent privately. No response is shown publicly.'
                : activeRound.state === 'both_accepted'
                  ? 'Both are ready. You can begin the introduction.'
                  : activeRound.state === 'public_introduction'
                    ? 'Public introduction in progress'
                    : 'This introduction closed quietly.'}
            </Text>
            {activeRound.connectionSignals.length > 0 ? (
              <View style={styles.signalList}>
                <Text style={styles.sectionLabel}>CONNECTION SIGNALS</Text>
                {activeRound.connectionSignals.map((signal) => <View key={signal.code} style={styles.signalRow}><Check size={14} color={visual.color.teal} /><Text style={styles.signalText}>{signal.text}</Text></View>)}
              </View>
            ) : null}
            {activeRound.conversationSpark ? (
              <View style={styles.sparkCard}>
                <Text style={styles.sectionLabel}>CONVERSATION SPARK</Text>
                <Text style={styles.sparkContext}>{activeRound.conversationSpark.context}</Text>
                <Text style={styles.sparkQuestion}>“{activeRound.conversationSpark.question}”</Text>
              </View>
            ) : null}
            <View style={styles.actionRow}>
              {activeRound.state === 'both_accepted' ? <Pressable disabled={busyAction !== null} onPress={() => onTransition(activeRound.id, 'public_introduction')} style={styles.primaryAction}><Text style={styles.primaryActionText}>Begin introduction</Text></Pressable> : null}
              {activeRound.state === 'public_introduction' ? <Pressable disabled={busyAction !== null} onPress={() => onTransition(activeRound.id, 'completed')} style={styles.primaryAction}><Text style={styles.primaryActionText}>Complete introduction</Text></Pressable> : null}
              {['awaiting_consent','both_accepted','public_introduction'].includes(activeRound.state) ? <Pressable disabled={busyAction !== null} onPress={() => onTransition(activeRound.id, 'cancelled')} style={styles.quietAction}><Text style={styles.quietActionText}>Close quietly</Text></Pressable> : null}
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.helper}>
              {snapshot.candidates.length < 2
                ? `${snapshot.candidates.length} members are open to a thoughtful introduction.`
                : hasAvailablePair
                  ? `${snapshot.candidates.length} members are open to a thoughtful introduction.`
                  : 'No mutually eligible introduction is available yet.'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.candidateRail}>
              {snapshot.candidates.map((candidate) => {
                const isSelected = selectedIds.includes(candidate.userId);
                const firstSelected = selectedIds[0];
                const firstCandidate = snapshot.candidates.find(
                  (item) => item.userId === firstSelected,
                );
                const availability = firstCandidate !== undefined
                  && firstCandidate.userId !== candidate.userId
                  ? getLivePairAvailability(firstCandidate, candidate)
                  : 'available';
                const unavailable = availability !== 'available';
                return <Pressable disabled={unavailable} key={candidate.userId} onPress={() => toggleCandidate(candidate.userId)} style={[styles.candidateCard, isSelected && styles.candidateSelected, unavailable && styles.candidateUnavailable]}>
                  <PersonAvatar person={candidate} />
                  <Text numberOfLines={1} style={styles.candidateName}>{candidate.fullName || 'Member'}</Text>
                  <View style={styles.metaRow}>{candidate.verified ? <ShieldCheck size={13} color={visual.color.teal} /> : null}<Text numberOfLines={1} style={styles.metaText}>{[candidate.age, candidate.city].filter(Boolean).join(' · ') || 'Profile ready'}</Text></View>
                  {candidate.lookingFor ? <Text numberOfLines={2} style={styles.intentText}>{candidate.lookingFor}</Text> : null}
                  {availability === 'already_introduced' ? <Text style={styles.availabilityReason}>Already introduced</Text> : null}
                  {availability === 'not_available' ? <Text style={styles.availabilityReason}>Not available for this pairing</Text> : null}
                  <View style={[styles.selectionMark, isSelected && styles.selectionMarkActive]}>{isSelected ? <Check size={13} color={visual.color.accentContrast} /> : null}</View>
                </Pressable>;
              })}
            </ScrollView>
            {selectedPairIsProposable ? <Pressable disabled={busyAction !== null} onPress={() => onPropose(selected[0].userId, selected[1].userId)} style={styles.primaryAction}><Text style={styles.primaryActionText}>{busyAction === 'propose' ? 'Sending private invitations…' : `Introduce ${selected[0].fullName?.split(' ')[0] || 'them'} + ${selected[1].fullName?.split(' ')[0] || 'them'}`}</Text></Pressable> : <Text style={styles.selectionHint}>{hasAvailablePair ? 'Choose two mutually eligible people to send private invitations.' : 'More compatible members can opt in during the room.'}</Text>}
          </>
        )}
        {errorCopy ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{errorCopy}</Text> : null}
      </View>
    );
  }

  const isMyInvitation = activeRound?.isParticipant && activeRound.state === 'awaiting_consent';
  const otherPerson = activeRound
    ? activeRound.participantA.userId === currentUserId ? activeRound.participantB : activeRound.participantA
    : null;
  if (!privateSparkCard && !activeRound && !showAvailabilityControl && !errorCopy) return null;
  return (
    <View style={styles.memberPanel}>
      {privateSparkCard}
      {isMyInvitation && otherPerson ? (
        <View style={styles.invitationCard}>
          <Text style={styles.eyebrow}>A THOUGHTFUL INTRODUCTION</Text>
          <View style={styles.invitationPerson}><PersonAvatar person={otherPerson} size={58} /><View style={styles.headingCopy}><Text style={styles.invitationTitle}>Meet {otherPerson.fullName?.split(' ')[0] || 'this member'}?</Text><View style={styles.metaRow}><MapPin size={13} color={visual.color.textMuted} /><Text style={styles.metaText}>{[otherPerson.age, otherPerson.city].filter(Boolean).join(' · ') || 'Live now'}</Text></View></View></View>
          <Text style={styles.invitationCopy}>Your choice is private. The room will only continue if you both independently say yes.</Text>
          {activeRound.myResponse ? <View style={styles.waitingPill}><Text style={styles.waitingText}>Choice saved privately · waiting</Text></View> : <View style={styles.actionRow}><Pressable disabled={busyAction !== null} onPress={() => onRespond(activeRound.id, false)} style={styles.notNowAction}><X size={16} color={visual.color.textMuted} /><Text style={styles.notNowText}>Not now</Text></Pressable><Pressable disabled={busyAction !== null} onPress={() => onRespond(activeRound.id, true)} style={styles.primaryAction}><Text style={styles.primaryActionText}>I’m open</Text></Pressable></View>}
        </View>
      ) : activeRound?.state === 'both_accepted' && activeRound.isParticipant ? (
        <View style={styles.waitingPill}><Sparkles size={15} color={visual.color.purple} /><Text style={styles.waitingText}>You both said yes. The host is preparing your introduction.</Text></View>
      ) : !activeRound && showAvailabilityControl ? (
        <Pressable disabled={busyAction !== null} onPress={() => onSetAvailability(!openToIntroductions)} style={[styles.availability, openToIntroductions && styles.availabilityOpen]}>
          <View><Text style={styles.availabilityTitle}>{openToIntroductions ? 'Open to introductions' : 'Keep me in the audience'}</Text><Text style={styles.availabilityCopy}>{openToIntroductions ? 'The host may privately suggest a thoughtful introduction.' : 'You can still enjoy the room without being proposed.'}</Text></View>
          <View style={[styles.toggle, openToIntroductions && styles.toggleOpen]}><View style={[styles.toggleThumb, openToIntroductions && styles.toggleThumbOpen]} /></View>
        </Pressable>
      ) : null}
      {errorCopy ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{errorCopy}</Text> : null}
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  panel: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surface, padding: 16, gap: 13 },
  memberPanel: { backgroundColor: visual.color.surface, paddingHorizontal: 16, paddingVertical: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.purpleSoft },
  headingCopy: { flex: 1, gap: 2 },
  eyebrow: { color: visual.color.purple, fontSize: 11, letterSpacing: 1.7, fontFamily: 'Manrope_700Bold' },
  title: { color: visual.color.text, fontSize: 17, fontFamily: 'PlayfairDisplay_700Bold' },
  helper: { color: visual.color.textMuted, fontSize: 13, fontFamily: 'Manrope_500Medium' },
  candidateRail: { gap: 10, paddingRight: 10 },
  candidateCard: { width: 154, minHeight: 178, borderRadius: 20, padding: 13, gap: 7, backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  candidateSelected: { borderColor: visual.color.purple, backgroundColor: visual.color.purpleSoft },
  candidateUnavailable: { opacity: 0.38 },
  avatar: { backgroundColor: visual.color.tealSoft },
  avatarFallback: { backgroundColor: visual.color.tealSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.color.borderStrong },
  avatarInitial: { color: visual.color.text, fontSize: 19, fontFamily: 'Manrope_700Bold' },
  candidateName: { color: visual.color.text, fontSize: 15, fontFamily: 'Manrope_700Bold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flexShrink: 1, color: visual.color.textMuted, fontSize: 11, fontFamily: 'Manrope_500Medium' },
  intentText: { color: visual.color.text, fontSize: 11, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  availabilityReason: { color: visual.color.textMuted, fontSize: 9, lineHeight: 13, fontFamily: 'Manrope_600SemiBold' },
  selectionMark: { position: 'absolute', right: 12, top: 12, width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: visual.color.border, alignItems: 'center', justifyContent: 'center' },
  selectionMarkActive: { backgroundColor: visual.color.purple, borderColor: visual.color.purple },
  selectionHint: { color: visual.color.textMuted, textAlign: 'center', fontSize: 12, fontFamily: 'Manrope_500Medium' },
  primaryAction: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: visual.color.purple, alignItems: 'center', justifyContent: 'center' },
  primaryActionText: { color: visual.color.accentContrast, fontSize: 13, fontFamily: 'Manrope_700Bold' },
  roundCard: { gap: 13, borderRadius: 22, padding: 14, backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  pairRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
  pairPerson: { width: 90, alignItems: 'center', gap: 6 },
  personName: { color: visual.color.text, fontSize: 12, fontFamily: 'Manrope_700Bold' },
  sparkBadge: { width: 35, height: 35, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.purpleSoft },
  roundStatus: { color: visual.color.textMuted, textAlign: 'center', fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  signalList: { gap: 7 },
  sectionLabel: { color: visual.color.purple, fontSize: 10, letterSpacing: 1.4, fontFamily: 'Manrope_700Bold' },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  signalText: { flex: 1, color: visual.color.text, fontSize: 12, fontFamily: 'Manrope_500Medium' },
  sparkCard: { gap: 6, borderRadius: 15, padding: 12, backgroundColor: visual.color.surface },
  sparkContext: { color: visual.color.textMuted, fontSize: 11, fontFamily: 'Manrope_500Medium' },
  sparkQuestion: { color: visual.color.text, fontSize: 14, lineHeight: 21, fontFamily: 'PlayfairDisplay_700Bold' },
  actionRow: { flexDirection: 'row', gap: 9, justifyContent: 'center' },
  quietAction: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  quietActionText: { color: visual.color.textMuted, fontSize: 12, fontFamily: 'Manrope_700Bold' },
  invitationCard: { gap: 13, borderRadius: 22, padding: 15, backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.borderStrong },
  invitationPerson: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  invitationTitle: { color: visual.color.text, fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  invitationCopy: { color: visual.color.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  privateSparkCard: { gap: 13, borderRadius: 22, padding: 15, backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.borderStrong },
  privateSparkHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  privateSparkTitle: { color: visual.color.text, fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  notNowAction: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surface },
  notNowText: { color: visual.color.textMuted, fontSize: 13, fontFamily: 'Manrope_700Bold' },
  waitingPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 18, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: visual.color.purpleSoft },
  waitingText: { flexShrink: 1, color: visual.color.text, textAlign: 'center', fontSize: 12, lineHeight: 17, fontFamily: 'Manrope_600SemiBold' },
  availability: { minHeight: 76, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  availabilityOpen: { borderColor: visual.color.borderStrong, backgroundColor: visual.color.purpleSoft },
  availabilityTitle: { color: visual.color.text, fontSize: 13, fontFamily: 'Manrope_700Bold' },
  availabilityCopy: { maxWidth: 270, marginTop: 3, color: visual.color.textMuted, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium' },
  toggle: { width: 42, height: 24, padding: 3, borderRadius: 12, backgroundColor: visual.color.border },
  toggleOpen: { backgroundColor: visual.color.purple },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: visual.color.surfaceRaised },
  toggleThumbOpen: { alignSelf: 'flex-end', backgroundColor: visual.color.accentContrast },
  errorText: { color: visual.color.danger, textAlign: 'center', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
});
