import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import {
  cancelCircleInvitation,
  inviteProfileToCircle,
  listSentCircleInvitations,
  searchCircleInviteCandidates,
  type CircleInviteCandidate,
  type SentCircleInvitation,
} from '@/lib/circles/circle-invitations';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  visible: boolean;
  circleId: string;
  circleName: string;
  actorProfileId: string | null;
  onClose: () => void;
};

const AGE_FILTERS = [
  { label: 'Any age', min: null, max: null },
  { label: '18-27', min: 18, max: 27 },
  { label: '28-39', min: 28, max: 39 },
  { label: '40+', min: 40, max: null },
] as const;

export default function CircleInviteSheet({ visible, circleId, circleName, actorProfileId, onClose }: Props) {
  const palette = useCirclePulsePalette();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette, insets.bottom), [insets.bottom, palette]);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [interest, setInterest] = useState('');
  const [ageIndex, setAgeIndex] = useState(0);
  const [candidates, setCandidates] = useState<CircleInviteCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'discover' | 'sent'>('discover');
  const [sendingProfileId, setSendingProfileId] = useState<string | null>(null);
  const [cancellingInvitationId, setCancellingInvitationId] = useState<string | null>(null);
  const [sentProfileIds, setSentProfileIds] = useState<Set<string>>(new Set());
  const [sentInvitations, setSentInvitations] = useState<SentCircleInvitation[]>([]);
  const selectedAge = AGE_FILTERS[ageIndex];

  const loadSentInvitations = useCallback(async () => {
    if (!visible || !circleId || !actorProfileId) return;
    try {
      setSentInvitations(await listSentCircleInvitations(circleId, actorProfileId));
    } catch (error) {
      Alert.alert('Circle invitations', error instanceof Error ? error.message : 'Could not load sent invitations.');
    }
  }, [actorProfileId, circleId, visible]);

  useEffect(() => {
    if (visible) void loadSentInvitations();
  }, [loadSentInvitations, visible]);

  useEffect(() => {
    if (!visible || !circleId || !actorProfileId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchCircleInviteCandidates({
        circleId,
        actorProfileId,
        search: query,
        country,
        interest,
        minAge: selectedAge.min,
        maxAge: selectedAge.max,
      })
        .then((rows) => {
          if (!cancelled) setCandidates(rows);
        })
        .catch((error) => {
          if (!cancelled) Alert.alert('Circle invitations', error instanceof Error ? error.message : 'Could not search right now.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [actorProfileId, circleId, country, interest, query, selectedAge.max, selectedAge.min, visible]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setCountry('');
      setInterest('');
      setAgeIndex(0);
      setCandidates([]);
      setSentProfileIds(new Set());
      setSentInvitations([]);
      setMode('discover');
    }
  }, [visible]);

  const shareExternalInvite = async () => {
    try {
      await Share.share({
        message: `You are invited to ${circleName} on Betweener. Open the Circle and choose whether to join.\n\nOpen in Betweener: betweenerapp://circles/${circleId}\n\nWeb fallback: https://getbetweener.com/circles/${circleId}`,
      });
    } catch {
      Alert.alert('Share invitation', 'Could not open sharing right now.');
    }
  };

  const sendInternalInvite = async (candidate: CircleInviteCandidate) => {
    if (!actorProfileId || sendingProfileId) return;
    setSendingProfileId(candidate.profileId);
    try {
      await inviteProfileToCircle(circleId, actorProfileId, candidate.profileId);
      setSentProfileIds((current) => new Set(current).add(candidate.profileId));
      await loadSentInvitations();
    } catch (error) {
      Alert.alert('Circle invitation', error instanceof Error ? error.message : 'Could not send the invitation.');
    } finally {
      setSendingProfileId(null);
    }
  };

  const withdrawInvitation = (invitation: SentCircleInvitation) => {
    if (!actorProfileId || cancellingInvitationId) return;
    Alert.alert(
      'Withdraw invitation?',
      `${invitation.fullName} will no longer be able to accept this Circle invitation.`,
      [
        { text: 'Keep invitation', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => {
            setCancellingInvitationId(invitation.id);
            void cancelCircleInvitation(invitation.id, actorProfileId)
              .then(() => loadSentInvitations())
              .catch((error) => {
                Alert.alert('Circle invitations', error instanceof Error ? error.message : 'Could not withdraw the invitation.');
              })
              .finally(() => setCancellingInvitationId(null));
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <BlurViewSafe intensity={42} tint={palette.dark ? 'dark' : 'light'} style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Private Circle invitations</Text>
                <Text style={styles.title}>Invite with intention</Text>
                <Text style={styles.subtitle}>Members decide whether to step into {circleName}.</Text>
              </View>
              <Pressable accessibilityLabel="Close Circle invitations" style={styles.iconButton} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={19} color={palette.text} />
              </Pressable>
            </View>

            <TouchableOpacity style={styles.shareButton} onPress={() => void shareExternalInvite()}>
              <View style={styles.shareIcon}>
                <MaterialCommunityIcons name="share-variant-outline" size={18} color={palette.teal} />
              </View>
              <View style={styles.shareCopy}>
                <Text style={styles.shareTitle}>Share an external invite</Text>
                <Text style={styles.shareSubtitle}>Send a private link outside Betweener. Joining still requires consent.</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textMuted} />
            </TouchableOpacity>

            <View style={styles.modeControl}>
              <TouchableOpacity style={[styles.modeButton, mode === 'discover' && styles.modeButtonActive]} onPress={() => setMode('discover')}>
                <MaterialCommunityIcons name="account-search-outline" size={16} color={mode === 'discover' ? palette.teal : palette.textMuted} />
                <Text style={[styles.modeText, mode === 'discover' && styles.modeTextActive]}>Discover</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modeButton, mode === 'sent' && styles.modeButtonActive]} onPress={() => setMode('sent')}>
                <MaterialCommunityIcons name="send-check-outline" size={16} color={mode === 'sent' ? palette.teal : palette.textMuted} />
                <Text style={[styles.modeText, mode === 'sent' && styles.modeTextActive]}>Sent ({sentInvitations.length})</Text>
              </TouchableOpacity>
            </View>

            {mode === 'discover' ? (
              <>
            <View style={styles.searchShell}>
              <MaterialCommunityIcons name="magnify" size={19} color={palette.teal} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search members"
                placeholderTextColor={palette.textMuted}
                style={styles.searchInput}
              />
            </View>
            <View style={styles.filterRow}>
              <TextInput
                value={country}
                onChangeText={setCountry}
                placeholder="Country"
                placeholderTextColor={palette.textMuted}
                style={styles.filterInput}
              />
              <TextInput
                value={interest}
                onChangeText={setInterest}
                placeholder="Interest"
                placeholderTextColor={palette.textMuted}
                style={styles.filterInput}
              />
            </View>
            <ScrollView style={styles.ageScroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ageRow}>
              {AGE_FILTERS.map((option, index) => (
                <TouchableOpacity
                  key={option.label}
                  style={[styles.agePill, index === ageIndex && styles.agePillActive]}
                  onPress={() => setAgeIndex(index)}
                >
                  <Text style={[styles.agePillText, index === ageIndex && styles.agePillTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>Betweener members</Text>
              <Text style={styles.resultMeta}>{loading ? 'Searching' : `${candidates.length} found`}</Text>
            </View>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
              {!loading && candidates.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="account-search-outline" size={28} color={palette.teal} />
                  <Text style={styles.emptyTitle}>No matching members yet</Text>
                  <Text style={styles.emptyText}>Adjust the filters or share an external invitation.</Text>
                </View>
              ) : null}
              {candidates.map((candidate) => {
                const sent = sentProfileIds.has(candidate.profileId);
                const sending = sendingProfileId === candidate.profileId;
                return (
                  <View key={candidate.profileId} style={styles.candidateCard}>
                    {candidate.avatarUrl ? (
                      <Image source={{ uri: candidate.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <MaterialCommunityIcons name="account-outline" size={20} color={palette.teal} />
                      </View>
                    )}
                    <View style={styles.candidateCopy}>
                      <Text style={styles.candidateName} numberOfLines={1}>
                        {candidate.fullName}{candidate.age ? `, ${candidate.age}` : ''}
                      </Text>
                      <Text style={styles.candidateMeta} numberOfLines={1}>
                        {[candidate.location, candidate.country].filter(Boolean).join(' / ') || 'Location private'}
                      </Text>
                      {candidate.interests.length > 0 ? (
                        <Text style={styles.candidateInterests} numberOfLines={1}>{candidate.interests.join(' / ')}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      accessibilityLabel={`Invite ${candidate.fullName}`}
                      disabled={sent || !!sendingProfileId}
                      style={[styles.inviteButton, sent && styles.inviteButtonSent]}
                      onPress={() => void sendInternalInvite(candidate)}
                    >
                      <Text style={[styles.inviteButtonText, sent && styles.inviteButtonTextSent]}>
                        {sent ? 'Sent' : sending ? 'Sending' : 'Invite'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
              </>
            ) : (
              <>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultTitle}>Pending invitations</Text>
                  <Text style={styles.resultMeta}>{sentInvitations.length} awaiting reply</Text>
                </View>
                <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                  {sentInvitations.length === 0 ? (
                    <View style={styles.emptyState}>
                      <MaterialCommunityIcons name="send-outline" size={28} color={palette.teal} />
                      <Text style={styles.emptyTitle}>No pending invitations</Text>
                      <Text style={styles.emptyText}>Invitations waiting for a response will appear here.</Text>
                    </View>
                  ) : null}
                  {sentInvitations.map((invitation) => (
                    <View key={invitation.id} style={styles.candidateCard}>
                      {invitation.avatarUrl ? (
                        <Image source={{ uri: invitation.avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <MaterialCommunityIcons name="account-outline" size={20} color={palette.teal} />
                        </View>
                      )}
                      <View style={styles.candidateCopy}>
                        <Text style={styles.candidateName} numberOfLines={1}>
                          {invitation.fullName}{invitation.age ? `, ${invitation.age}` : ''}
                        </Text>
                        <Text style={styles.candidateMeta} numberOfLines={1}>
                          {invitation.location || 'Awaiting their decision'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        accessibilityLabel={`Withdraw invitation for ${invitation.fullName}`}
                        disabled={!!cancellingInvitationId}
                        style={styles.withdrawButton}
                        onPress={() => withdrawInvitation(invitation)}
                      >
                        <Text style={styles.withdrawButtonText}>
                          {cancellingInvitationId === invitation.id ? 'Withdrawing' : 'Withdraw'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </BlurViewSafe>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (palette: CirclePulsePalette, bottomInset: number) => StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: palette.overlay },
  keyboardArea: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    height: '90%',
    maxHeight: 780,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Math.max(bottomInset, 14),
    gap: 12,
    overflow: 'hidden',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: palette.purpleBorder,
    backgroundColor: palette.dark ? 'rgba(7,30,34,0.86)' : 'rgba(255,249,243,0.94)',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: palette.outline },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { color: palette.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase' },
  title: { color: palette.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 23 },
  subtitle: { color: palette.textMuted, fontSize: 12, lineHeight: 17 },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.surfaceMuted },
  shareButton: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: palette.tealBorder, backgroundColor: palette.tealSoft },
  shareIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceMuted },
  shareCopy: { flex: 1, gap: 3 },
  shareTitle: { color: palette.text, fontSize: 13, fontWeight: '900' },
  shareSubtitle: { color: palette.textMuted, fontSize: 11, lineHeight: 15 },
  searchShell: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.surfaceMuted },
  searchInput: { flex: 1, color: palette.text, fontSize: 13 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterInput: { flex: 1, minHeight: 42, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.outline, color: palette.text, backgroundColor: palette.surfaceMuted, fontSize: 12 },
  modeControl: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 15, borderWidth: 1, borderColor: palette.outlineSoft, backgroundColor: palette.surfaceMuted },
  modeButton: { flex: 1, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11 },
  modeButtonActive: { backgroundColor: palette.tealSoft },
  modeText: { color: palette.textMuted, fontSize: 11, fontWeight: '800' },
  modeTextActive: { color: palette.teal },
  ageScroller: { flexGrow: 0, maxHeight: 34 },
  ageRow: { gap: 7 },
  agePill: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.surfaceMuted },
  agePillActive: { borderColor: palette.tealBorder, backgroundColor: palette.tealSoft },
  agePillText: { color: palette.textMuted, fontSize: 11, fontWeight: '800' },
  agePillTextActive: { color: palette.teal },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultTitle: { color: palette.text, fontSize: 13, fontWeight: '900' },
  resultMeta: { color: palette.textMuted, fontSize: 11, fontWeight: '700' },
  list: { flex: 1 },
  listContent: { gap: 9, paddingBottom: 12 },
  emptyState: { alignItems: 'center', gap: 7, paddingVertical: 28 },
  emptyTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
  emptyText: { maxWidth: 240, color: palette.textMuted, textAlign: 'center', fontSize: 12, lineHeight: 17 },
  candidateCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 15, borderWidth: 1, borderColor: palette.outlineSoft, backgroundColor: palette.surfaceMuted },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.tealSoft },
  candidateCopy: { flex: 1, minWidth: 0, gap: 2 },
  candidateName: { color: palette.text, fontSize: 13, fontWeight: '900' },
  candidateMeta: { color: palette.textMuted, fontSize: 11 },
  candidateInterests: { color: palette.purpleStrong, fontSize: 10, fontWeight: '700' },
  inviteButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 17, backgroundColor: palette.tealStrong },
  inviteButtonSent: { borderWidth: 1, borderColor: palette.tealBorder, backgroundColor: palette.tealSoft },
  inviteButtonText: { color: palette.tealInk, fontSize: 11, fontWeight: '900' },
  inviteButtonTextSent: { color: palette.teal },
  withdrawButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, borderColor: palette.purpleBorder, backgroundColor: palette.purpleSoft },
  withdrawButtonText: { color: palette.purpleStrong, fontSize: 10, fontWeight: '900' },
});
