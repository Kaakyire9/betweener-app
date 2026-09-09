import { Sparkles } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LiveMatchRound } from '../application/index.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type Props = {
  round: LiveMatchRound;
};

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || 'Member';

export function LivePublicIntroductionCard({ round }: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  if (round.state !== 'public_introduction') return null;
  return (
    <View style={styles.root}>
      <View style={styles.eyebrowRow}>
        <Sparkles color={visual.color.purple} size={14} />
        <Text style={styles.eyebrow}>THOUGHTFUL INTRODUCTION</Text>
      </View>
      <Text style={styles.title}>
        {firstName(round.participantA.fullName)} meets {firstName(round.participantB.fullName)}
      </Text>
      {round.connectionSignals[0] ? (
        <Text style={styles.signal}>{round.connectionSignals[0].text}</Text>
      ) : null}
      {round.conversationSpark ? (
        <View style={styles.spark}>
          <Text style={styles.context}>{round.conversationSpark.context}</Text>
          <Text style={styles.question}>“{round.conversationSpark.question}”</Text>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: {
    marginHorizontal: 14,
    marginVertical: 8,
    padding: 14,
    gap: 6,
    borderRadius: 18,
    backgroundColor: visual.color.surfaceRaised,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrow: { color: visual.color.purple, fontSize: 9, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  title: { color: visual.color.text, fontSize: 17, fontFamily: 'PlayfairDisplay_700Bold' },
  signal: { color: visual.color.teal, fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  spark: { marginTop: 3, gap: 3 },
  context: { color: visual.color.textMuted, fontSize: 10, fontFamily: 'Manrope_500Medium' },
  question: { color: visual.color.text, fontSize: 13, lineHeight: 19, fontFamily: 'Manrope_600SemiBold' },
});
