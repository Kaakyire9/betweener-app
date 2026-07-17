import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { type StudioNote, type StudioTheme, withAlpha } from './model';

type Props = {
  theme: StudioTheme;
  notes: StudioNote[];
  onPress: () => void;
};

export default function ProfileStudioNotesCard({ theme, notes, onPress }: Props) {
  const readyCount = notes.filter((note) => note.status === 'ready').length;
  const summary = readyCount >= 3 ? 'Your profile opens well.' : `${notes.length} suggestions`;
  const detail = readyCount >= 3 ? 'Balanced and clear.' : notes[0]?.title ?? 'Open notes';

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.notesSummaryCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
    >
      <View style={styles.notesSummaryHeader}>
        <Text style={[styles.notesSummaryTitle, { color: theme.text }]}>Studio notes</Text>
        <View style={[styles.notesSummaryPill, { backgroundColor: withAlpha(theme.tint, '12'), borderColor: withAlpha(theme.tint, '28') }]}>
          <Text style={[styles.notesSummaryPillText, { color: theme.tint }]}>{summary}</Text>
        </View>
      </View>
      <Text style={[styles.notesSummaryDetail, { color: theme.textMuted }]}>{detail}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  notesSummaryCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  notesSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  notesSummaryTitle: {
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
  },
  notesSummaryPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  notesSummaryPillText: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
  },
  notesSummaryDetail: {
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
  },
});
