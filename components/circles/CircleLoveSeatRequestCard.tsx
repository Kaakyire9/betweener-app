import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { CircleLoveSeatRequest } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

const chairFront = require('@/assets/images/circle-pulse/love-seat/chair-front.png');

type Props = {
  request: CircleLoveSeatRequest | null;
  loading?: boolean;
  onJoinQueue: (note?: string | null) => Promise<void>;
  onLeaveQueue: () => void;
};

export default function CircleLoveSeatRequestCard({
  request,
  loading = false,
  onJoinQueue,
  onLeaveQueue,
}: Props) {
  const palette = useCirclePulsePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const queued = Boolean(request);
  const [note, setNote] = useState('');

  const joinQueue = async () => {
    await onJoinQueue(note);
    setNote('');
  };

  return (
    <LinearGradient colors={palette.warmIntroGradient} style={styles.card}>
      <View style={styles.chairStage}>
        <Image source={chairFront} style={styles.chairImage} contentFit="contain" />
        {queued ? (
          <View style={styles.privateBadge}>
            <MaterialCommunityIcons name="shield-check" size={13} color={palette.tealInk} />
          </View>
        ) : null}
      </View>
      <View style={styles.copy}>
        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow}>{queued ? 'PRIVATE REQUEST' : 'YOUR TURN'}</Text>
          {queued ? <Text style={styles.privatePill}>HOSTS ONLY</Text> : null}
        </View>
        <Text style={styles.title}>{queued ? 'You’re in the Love Seat queue' : 'Could the next Love Seat be yours?'}</Text>
        <Text style={styles.body}>
          {queued
            ? 'Only Circle hosts can see your request. It expires automatically after 7 days.'
            : 'Privately let the hosts know you would like to be considered. Nothing appears publicly unless you are selected and accept.'}
        </Text>
      </View>
      {!queued ? (
        <View style={styles.noteBlock}>
          <Text style={styles.noteLabel}>A private note for the hosts (optional)</Text>
          <TextInput
            accessibilityLabel="Private Love Seat request note"
            value={note}
            onChangeText={setNote}
            placeholder="Why would you enjoy taking the Love Seat?"
            placeholderTextColor={palette.textFaint}
            maxLength={500}
            multiline
            style={styles.noteInput}
          />
          <Text style={styles.noteCount}>{note.length}/500 · visible only to Circle hosts</Text>
        </View>
      ) : null}
      <TouchableOpacity
        accessibilityLabel={queued ? 'Leave private Love Seat queue' : 'Request the Love Seat privately'}
        disabled={loading}
        style={[styles.action, queued && styles.actionQueued]}
        onPress={queued ? onLeaveQueue : () => void joinQueue()}
      >
        <MaterialCommunityIcons name={queued ? 'close' : 'hand-heart-outline'} size={16} color={queued ? palette.textSoft : palette.tealInk} />
        <Text style={[styles.actionText, queued && styles.actionTextQueued]}>
          {loading ? 'Updating' : queued ? 'Leave queue' : 'Request privately'}
        </Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const createStyles = (palette: CirclePulsePalette) => StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: palette.purpleBorder,
    borderRadius: 22,
    padding: 15,
    gap: 11,
  },
  chairStage: {
    width: 78,
    height: 68,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.purpleBorder,
    backgroundColor: palette.purpleSoft,
    overflow: 'hidden',
  },
  chairImage: {
    width: 72,
    height: 64,
  },
  privateBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.tealStrong,
  },
  copy: { gap: 4 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { color: palette.purple, fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 1.3 },
  privatePill: {
    color: palette.textMuted,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.9,
    borderWidth: 1,
    borderColor: palette.outline,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  title: { color: palette.text, fontSize: 19, lineHeight: 24, fontFamily: 'PlayfairDisplay_700Bold' },
  body: { color: palette.textSoft, fontSize: 11, lineHeight: 17 },
  noteBlock: { gap: 5 },
  noteLabel: { color: palette.textSoft, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  noteInput: {
    minHeight: 74,
    borderWidth: 1,
    borderColor: palette.outline,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.text,
    backgroundColor: palette.surfaceMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlignVertical: 'top',
  },
  noteCount: { color: palette.textFaint, fontSize: 9, lineHeight: 13, textAlign: 'right' },
  action: {
    minHeight: 42,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: palette.tealStrong,
  },
  actionQueued: {
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surfaceMuted,
  },
  actionText: { color: palette.tealInk, fontSize: 11, fontWeight: '900' },
  actionTextQueued: { color: palette.textSoft },
});
