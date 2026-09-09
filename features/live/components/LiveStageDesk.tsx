import * as Haptics from 'expo-haptics';
import { UsersRound } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type SeatRequest = { id: string; fullName: string | null };
type StagePerson = {
  id: string;
  userId: string;
  fullName: string | null;
  role: string;
  microphoneMutedByModerator: boolean;
};

export type LiveStageDeskProps = {
  backstage: readonly StagePerson[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onModerate: (userId: string, action: 'mute' | 'unmute' | 'remove') => void;
  onResolveSeat: (requestId: string, approved: boolean) => void;
  onSetOnStage: (userId: string, onStage: boolean) => void;
  maximumGuestSeats: number;
  occupiedGuestSeats: number;
  onSetStageRequestCapacity: (capacity: number) => void;
  seatRequests: readonly SeatRequest[];
  stageRequestsBusy?: boolean;
  stageRequestCapacity: number;
  stage: readonly StagePerson[];
  presentation?: 'overlay' | 'studio';
};

const haptic = () => void Haptics.selectionAsync().catch(() => undefined);

export const LiveStageDesk = memo(function LiveStageDesk({
  backstage,
  expanded,
  onExpandedChange,
  onModerate,
  onResolveSeat,
  onSetOnStage,
  maximumGuestSeats,
  occupiedGuestSeats,
  onSetStageRequestCapacity,
  seatRequests,
  stageRequestsBusy = false,
  stageRequestCapacity,
  stage,
  presentation = 'overlay',
}: LiveStageDeskProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const managedStage = stage.filter((participant) => participant.role !== 'host');
  const waitingCount = seatRequests.length + backstage.length;
  const confirmRemoval = (participant: StagePerson) => {
    Alert.alert(
      `Remove ${participant.fullName || 'this member'} from the Live?`,
      'They will leave the room and will not be able to rejoin this Live. To keep them watching, choose To audience instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove from Live',
          style: 'destructive',
          onPress: () => onModerate(participant.userId, 'remove'),
        },
      ],
    );
  };
  const isStudio = presentation === 'studio';
  const stageRequestsOpen = stageRequestCapacity > 0;
  const capacityOptions = Array.from(
    { length: Math.max(0, maximumGuestSeats) + 1 },
    (_, capacity) => capacity,
  );
  if (waitingCount === 0 && managedStage.length === 0 && !isStudio) return null;

  if (!expanded && !isStudio) {
    const countLabel = waitingCount > 0 ? `${waitingCount} waiting` : `${managedStage.length} on stage`;
    return (
      <Pressable
        accessibilityLabel={`Open Stage Desk, ${countLabel}`}
        accessibilityRole="button"
        onPress={() => {
          haptic();
          onExpandedChange(true);
        }}
        style={styles.pillPressable}
      >
        <LiveGlassSurface intensity={44} style={styles.pill}>
          <UsersRound size={14} color={visual.color.text} />
          <Text style={styles.pillLabel}>STAGE DESK</Text>
          <View style={styles.count}>
            <Text style={styles.countText}>{countLabel}</Text>
          </View>
        </LiveGlassSurface>
      </Pressable>
    );
  }

  return (
    <LiveGlassSurface intensity={48} style={[styles.panel, isStudio && styles.studioPanel]}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <UsersRound size={14} color={visual.color.teal} />
          <Text style={styles.title}>STAGE DESK</Text>
        </View>
        {!isStudio ? <Pressable
          accessibilityLabel="Collapse Stage Desk"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            haptic();
            onExpandedChange(false);
          }}
        >
          <Text style={styles.done}>Done</Text>
        </Pressable> : null}
      </View>
      {isStudio ? (
        <View style={styles.intakeControl}>
          <View style={styles.intakeCopy}>
            <View style={styles.intakeTitleRow}>
              <Text style={styles.intakeTitle}>STAGE REQUESTS</Text>
              <Text style={[styles.intakeStatus, stageRequestsOpen && styles.intakeStatusOpen]}>
                {stageRequestsOpen ? 'OPEN' : 'CLOSED'}
              </Text>
            </View>
            <Text style={styles.intakeBody}>
              {stageRequestsOpen
                ? 'Guests may privately ask to join. You still approve every seat.'
                : 'Guests can watch, but cannot request a seat.'}
            </Text>
          </View>
          <View accessibilityRole="radiogroup" style={styles.capacityOptions}>
            {capacityOptions.map((capacity) => {
              const selected = capacity === stageRequestCapacity;
              const unavailable = stageRequestsBusy || capacity < occupiedGuestSeats;
              return (
                <Pressable
                  accessibilityLabel={capacity === 0 ? 'Close stage requests' : `Open ${capacity} guest ${capacity === 1 ? 'seat' : 'seats'}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: unavailable }}
                  disabled={unavailable}
                  key={capacity}
                  onPress={() => {
                    haptic();
                    onSetStageRequestCapacity(capacity);
                  }}
                  style={[
                    styles.capacityOption,
                    unavailable && styles.capacityOptionDisabled,
                    selected && styles.capacityOptionSelected,
                  ]}
                >
                  <Text style={[styles.capacityOptionText, selected && styles.capacityOptionTextSelected]}>
                    {capacity === 0 ? 'Closed' : capacity}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {waitingCount === 0 && managedStage.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>The stage is settled.</Text>
          <Text style={styles.emptyBody}>
            {stageRequestsOpen
              ? 'Seat requests and backstage guests will appear here as they arrive.'
              : 'Open stage requests when you are ready to hear from the room.'}
          </Text>
        </View>
      ) : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        {seatRequests.map((request) => (
          <View key={request.id} style={styles.card}>
            <Text numberOfLines={1} style={styles.name}>{request.fullName || 'Member'}</Text>
            <Text style={styles.cardContext}>Asked to join the stage</Text>
            <View style={styles.actions}>
              <Pressable onPress={() => onResolveSeat(request.id, false)}><Text style={styles.secondary}>Pass</Text></Pressable>
              <Pressable onPress={() => onResolveSeat(request.id, true)} style={styles.primary}><Text style={styles.primaryText}>Invite</Text></Pressable>
            </View>
          </View>
        ))}
        {backstage.map((participant) => (
          <View key={participant.id} style={styles.card}>
            <Text numberOfLines={1} style={styles.name}>{participant.fullName || 'Member'}</Text>
            <Text style={styles.cardContext}>Ready backstage</Text>
            <View style={styles.actions}>
              <Pressable onPress={() => onSetOnStage(participant.userId, true)} style={styles.primary}>
                <Text style={styles.primaryText}>Bring on stage</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {managedStage.map((participant) => (
          <View key={participant.id} style={styles.card}>
            <Text numberOfLines={1} style={styles.name}>{participant.fullName || 'Member'}</Text>
            <Text style={styles.cardContext}>Currently on stage</Text>
            <View style={styles.actions}>
              <Pressable onPress={() => onModerate(participant.userId, participant.microphoneMutedByModerator ? 'unmute' : 'mute')}>
                <Text style={styles.secondary}>{participant.microphoneMutedByModerator ? 'Allow mic' : 'Mute'}</Text>
              </Pressable>
              <Pressable onPress={() => onSetOnStage(participant.userId, false)} style={styles.primary}>
                <Text style={styles.primaryText}>To audience</Text>
              </Pressable>
              <Pressable onPress={() => confirmRemoval(participant)}>
                <Text style={styles.remove}>Remove from Live</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>}
    </LiveGlassSurface>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  pillPressable: { alignSelf: 'flex-start', marginLeft: 12, marginTop: 7, borderRadius: 22 },
  pill: {
    minHeight: 38,
    borderRadius: 20,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: visual.color.surfaceTranslucent,
    borderColor: visual.color.borderStrong,
  },
  pillLabel: { color: visual.color.text, fontSize: 8, letterSpacing: 1.3, fontFamily: 'Manrope_800ExtraBold' },
  count: { minHeight: 22, paddingHorizontal: 9, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.tealSoft },
  countText: { color: visual.color.teal, fontSize: 9, fontFamily: 'Manrope_700Bold' },
  panel: { marginHorizontal: 12, marginTop: 7, borderRadius: 20, backgroundColor: visual.color.surfaceTranslucent, paddingVertical: 9, borderColor: visual.color.borderStrong },
  studioPanel: { marginHorizontal: 0, marginTop: 0, paddingVertical: 14, backgroundColor: visual.color.surfaceRaised },
  titleRow: { paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleCopy: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { color: visual.color.text, fontSize: 9, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  intakeControl: { marginHorizontal: 14, marginTop: 13, borderRadius: 16, borderWidth: 1, borderColor: visual.color.borderStrong, backgroundColor: visual.color.surface, paddingHorizontal: 13, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  intakeCopy: { flex: 1 },
  intakeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  intakeTitle: { color: visual.color.text, fontSize: 10, letterSpacing: 1.1, fontFamily: 'Manrope_800ExtraBold' },
  intakeStatus: { color: visual.color.textMuted, fontSize: 8, letterSpacing: 1, fontFamily: 'Manrope_800ExtraBold' },
  intakeStatusOpen: { color: visual.color.teal },
  intakeBody: { marginTop: 4, color: visual.color.textMuted, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium' },
  capacityOptions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  capacityOption: { minWidth: 32, minHeight: 32, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1, borderColor: visual.color.border, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surface },
  capacityOptionSelected: { borderColor: visual.color.teal, backgroundColor: visual.color.teal },
  capacityOptionDisabled: { opacity: 0.38 },
  capacityOptionText: { color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_700Bold' },
  capacityOptionTextSelected: { color: visual.color.accentContrast },
  done: { color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_700Bold' },
  content: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  emptyState: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  emptyTitle: { color: visual.color.text, fontSize: 15, fontFamily: 'Manrope_700Bold' },
  emptyBody: { marginTop: 5, color: visual.color.textMuted, fontSize: 11, lineHeight: 17, fontFamily: 'Manrope_500Medium' },
  card: { width: 184, borderRadius: 16, padding: 11, backgroundColor: visual.color.surface, borderWidth: 1, borderColor: visual.color.borderStrong },
  name: { color: visual.color.text, fontSize: 12, fontFamily: 'Manrope_700Bold' },
  cardContext: { color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 9 },
  secondary: { color: visual.color.textMuted, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  remove: { color: visual.color.danger, fontSize: 9, fontFamily: 'Manrope_700Bold' },
  primary: { minHeight: 28, paddingHorizontal: 11, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.teal },
  primaryText: { color: visual.color.accentContrast, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
});
