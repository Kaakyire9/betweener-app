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

const PersonAvatar = ({ person, size = 50 }: { person: LiveMatchRoundPerson | LiveHostedCandidate; size?: number }) => (
  person.avatarUrl
    ? <Image source={{ uri: person.avatarUrl }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} />
    : <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}><Text style={styles.avatarInitial}>{initials(person.fullName)}</Text></View>
);

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
        <View style={styles.sparkBadge}><Sparkles size={17} color="#D7B56D" /></View>
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
              <X size={16} color="#D8C9BF" /><Text style={styles.notNowText}>Not now</Text>
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
          <View style={styles.headingIcon}><UsersRound size={16} color="#D7B56D" /></View>
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
              <View style={styles.sparkBadge}><Sparkles size={17} color="#D7B56D" /></View>
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
                {activeRound.connectionSignals.map((signal) => <View key={signal.code} style={styles.signalRow}><Check size={14} color="#73D3BC" /><Text style={styles.signalText}>{signal.text}</Text></View>)}
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
                  <View style={styles.metaRow}>{candidate.verified ? <ShieldCheck size={13} color="#73D3BC" /> : null}<Text numberOfLines={1} style={styles.metaText}>{[candidate.age, candidate.city].filter(Boolean).join(' · ') || 'Profile ready'}</Text></View>
                  {candidate.lookingFor ? <Text numberOfLines={2} style={styles.intentText}>{candidate.lookingFor}</Text> : null}
                  {availability === 'already_introduced' ? <Text style={styles.availabilityReason}>Already introduced</Text> : null}
                  {availability === 'not_available' ? <Text style={styles.availabilityReason}>Not available for this pairing</Text> : null}
                  <View style={[styles.selectionMark, isSelected && styles.selectionMarkActive]}>{isSelected ? <Check size={13} color="#071310" /> : null}</View>
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
          <View style={styles.invitationPerson}><PersonAvatar person={otherPerson} size={58} /><View style={styles.headingCopy}><Text style={styles.invitationTitle}>Meet {otherPerson.fullName?.split(' ')[0] || 'this member'}?</Text><View style={styles.metaRow}><MapPin size={13} color="#9EB7B1" /><Text style={styles.metaText}>{[otherPerson.age, otherPerson.city].filter(Boolean).join(' · ') || 'Live now'}</Text></View></View></View>
          <Text style={styles.invitationCopy}>Your choice is private. The room will only continue if you both independently say yes.</Text>
          {activeRound.myResponse ? <View style={styles.waitingPill}><Text style={styles.waitingText}>Choice saved privately · waiting</Text></View> : <View style={styles.actionRow}><Pressable disabled={busyAction !== null} onPress={() => onRespond(activeRound.id, false)} style={styles.notNowAction}><X size={16} color="#D8C9BF" /><Text style={styles.notNowText}>Not now</Text></Pressable><Pressable disabled={busyAction !== null} onPress={() => onRespond(activeRound.id, true)} style={styles.primaryAction}><Text style={styles.primaryActionText}>I’m open</Text></Pressable></View>}
        </View>
      ) : activeRound?.state === 'both_accepted' && activeRound.isParticipant ? (
        <View style={styles.waitingPill}><Sparkles size={15} color="#D7B56D" /><Text style={styles.waitingText}>You both said yes. The host is preparing your introduction.</Text></View>
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

const styles = StyleSheet.create({
  panel: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#25423C', backgroundColor: '#0A201B', padding: 16, gap: 13 },
  memberPanel: { backgroundColor: '#091B17', paddingHorizontal: 16, paddingVertical: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#172F29' },
  headingCopy: { flex: 1, gap: 2 },
  eyebrow: { color: '#D7B56D', fontSize: 11, letterSpacing: 1.7, fontFamily: 'Manrope_700Bold' },
  title: { color: '#FFF7EC', fontSize: 17, fontFamily: 'PlayfairDisplay_700Bold' },
  helper: { color: '#9EB7B1', fontSize: 13, fontFamily: 'Manrope_500Medium' },
  candidateRail: { gap: 10, paddingRight: 10 },
  candidateCard: { width: 154, minHeight: 178, borderRadius: 20, padding: 13, gap: 7, backgroundColor: '#112923', borderWidth: 1, borderColor: '#29433D' },
  candidateSelected: { borderColor: '#D7B56D', backgroundColor: '#18312A' },
  candidateUnavailable: { opacity: 0.38 },
  avatar: { backgroundColor: '#18312A' },
  avatarFallback: { backgroundColor: '#21453B', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#826F46' },
  avatarInitial: { color: '#FFF7EC', fontSize: 19, fontFamily: 'Manrope_700Bold' },
  candidateName: { color: '#FFF7EC', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flexShrink: 1, color: '#9EB7B1', fontSize: 11, fontFamily: 'Manrope_500Medium' },
  intentText: { color: '#DCCDBF', fontSize: 11, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  availabilityReason: { color: '#C7B8AB', fontSize: 9, lineHeight: 13, fontFamily: 'Manrope_600SemiBold' },
  selectionMark: { position: 'absolute', right: 12, top: 12, width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#55706A', alignItems: 'center', justifyContent: 'center' },
  selectionMarkActive: { backgroundColor: '#D7B56D', borderColor: '#D7B56D' },
  selectionHint: { color: '#819A94', textAlign: 'center', fontSize: 12, fontFamily: 'Manrope_500Medium' },
  primaryAction: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#D7B56D', alignItems: 'center', justifyContent: 'center' },
  primaryActionText: { color: '#071310', fontSize: 13, fontFamily: 'Manrope_700Bold' },
  roundCard: { gap: 13, borderRadius: 22, padding: 14, backgroundColor: '#112923', borderWidth: 1, borderColor: '#35534C' },
  pairRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
  pairPerson: { width: 90, alignItems: 'center', gap: 6 },
  personName: { color: '#FFF7EC', fontSize: 12, fontFamily: 'Manrope_700Bold' },
  sparkBadge: { width: 35, height: 35, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2B3529' },
  roundStatus: { color: '#AFC2BD', textAlign: 'center', fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  signalList: { gap: 7 },
  sectionLabel: { color: '#D7B56D', fontSize: 10, letterSpacing: 1.4, fontFamily: 'Manrope_700Bold' },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  signalText: { flex: 1, color: '#E6DDD3', fontSize: 12, fontFamily: 'Manrope_500Medium' },
  sparkCard: { gap: 6, borderRadius: 15, padding: 12, backgroundColor: '#0A1C18' },
  sparkContext: { color: '#9EB7B1', fontSize: 11, fontFamily: 'Manrope_500Medium' },
  sparkQuestion: { color: '#FFF7EC', fontSize: 14, lineHeight: 21, fontFamily: 'PlayfairDisplay_700Bold' },
  actionRow: { flexDirection: 'row', gap: 9, justifyContent: 'center' },
  quietAction: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  quietActionText: { color: '#B9AAA1', fontSize: 12, fontFamily: 'Manrope_700Bold' },
  invitationCard: { gap: 13, borderRadius: 22, padding: 15, backgroundColor: '#112923', borderWidth: 1, borderColor: '#816E45' },
  invitationPerson: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  invitationTitle: { color: '#FFF7EC', fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  invitationCopy: { color: '#AFC2BD', fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  privateSparkCard: { gap: 13, borderRadius: 22, padding: 15, backgroundColor: '#17251F', borderWidth: 1, borderColor: '#B39558' },
  privateSparkHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  privateSparkTitle: { color: '#FFF7EC', fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  notNowAction: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#24302D' },
  notNowText: { color: '#D8C9BF', fontSize: 13, fontFamily: 'Manrope_700Bold' },
  waitingPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 18, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: '#1C302A' },
  waitingText: { flexShrink: 1, color: '#E9DDCE', textAlign: 'center', fontSize: 12, lineHeight: 17, fontFamily: 'Manrope_600SemiBold' },
  availability: { minHeight: 76, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#10231F', borderWidth: 1, borderColor: '#29413B' },
  availabilityOpen: { borderColor: '#71623F', backgroundColor: '#172B25' },
  availabilityTitle: { color: '#FFF7EC', fontSize: 13, fontFamily: 'Manrope_700Bold' },
  availabilityCopy: { maxWidth: 270, marginTop: 3, color: '#91A8A2', fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium' },
  toggle: { width: 42, height: 24, padding: 3, borderRadius: 12, backgroundColor: '#33453F' },
  toggleOpen: { backgroundColor: '#D7B56D' },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#E8E0D5' },
  toggleThumbOpen: { alignSelf: 'flex-end', backgroundColor: '#0C211D' },
  errorText: { color: '#E4A09B', textAlign: 'center', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
});
