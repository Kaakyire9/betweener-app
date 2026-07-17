import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureSystemBubble from '@/components/signature/SignatureSystemBubble';
import {
  fetchMyCircleLoveSeatNominations,
  respondToCircleLoveSeatNomination,
} from '@/lib/circles/pulse/circle-pulse-service';
import type { CircleLoveSeatNomination } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';
import { useCirclePulseRefresh } from '@/lib/circles/pulse/use-circle-pulse-refresh';

type Props = {
  circleId: string;
  actorProfileId: string | null;
  onResponded: () => void | Promise<void>;
};

export default function CircleLoveSeatConsentSheet({ circleId, actorProfileId, onResponded }: Props) {
  const insets = useSafeAreaInsets();
  const palette = useCirclePulsePalette();
  const styles = useMemo(() => createStyles(insets.bottom, palette), [insets.bottom, palette]);
  const [nomination, setNomination] = useState<CircleLoveSeatNomination | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    if (!circleId || !actorProfileId) {
      setNomination(null);
      return;
    }
    try {
      const nominations = await fetchMyCircleLoveSeatNominations(actorProfileId, circleId);
      setNomination(nominations[0] ?? null);
    } catch {
      setNomination(null);
    }
  }, [actorProfileId, circleId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useCirclePulseRefresh({
    enabled: !!circleId && !!actorProfileId,
    reload,
  });

  const respond = async (accept: boolean) => {
    if (!nomination || !actorProfileId || submitting) return;
    setSubmitting(true);
    try {
      await respondToCircleLoveSeatNomination(nomination.id, actorProfileId, accept);
      setNomination(null);
      await onResponded();
      if (accept) {
        Alert.alert('Welcome to the Love Seat', 'You are now featured in this Circle. You can leave anytime.');
      }
    } catch (error) {
      Alert.alert('Love Seat', error instanceof Error ? error.message : 'Could not update this invitation right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={!!nomination} transparent animationType="slide" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.icon}>
            <MaterialCommunityIcons name="heart-outline" size={24} color={palette.purple} />
          </View>
          <Text style={styles.eyebrow}>Love Seat invitation</Text>
          <Text style={styles.title}>Step into the Love Seat?</Text>
          <Text style={styles.body}>
            You will be featured in {nomination?.circleName || 'this Circle'} so members can ask thoughtful questions and discover your profile.
          </Text>
          <SignatureSystemBubble system="love_seat" compact />
          {nomination?.quote ? <Text style={styles.quote}>&quot;{nomination.quote}&quot;</Text> : null}
          <Text style={styles.note}>This is opt-in. You can leave the Love Seat anytime.</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} disabled={submitting} onPress={() => void respond(false)}>
              <Text style={styles.secondaryText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} disabled={submitting} onPress={() => void respond(true)}>
              <Text style={styles.primaryText}>{submitting ? 'Updating' : 'Accept'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (bottomInset: number, palette: CirclePulsePalette) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.overlay },
    sheet: {
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: Math.max(bottomInset, 18),
      gap: 10,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: palette.purpleBorder,
      backgroundColor: palette.surface,
    },
    icon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.purpleSoft,
    },
    eyebrow: { color: palette.purple, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4 },
    title: { color: palette.text, fontSize: 24, fontFamily: 'PlayfairDisplay_700Bold' },
    body: { color: palette.textSoft, fontSize: 13, lineHeight: 19 },
    quote: { color: palette.teal, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
    note: { color: palette.textMuted, fontSize: 11, lineHeight: 16 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 4 },
    secondaryButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: palette.outline },
    secondaryText: { color: palette.text, fontSize: 12, fontWeight: '800' },
    primaryButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 20, backgroundColor: palette.tealStrong },
    primaryText: { color: palette.tealInk, fontSize: 12, fontWeight: '900' },
  });
