import { Sparkles } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import type { LiveMatchRound } from '../application/index.ts';

type Props = {
  round: LiveMatchRound;
};

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || 'Member';

export function LivePublicIntroductionCard({ round }: Props) {
  if (round.state !== 'public_introduction') return null;
  return (
    <View style={styles.root}>
      <View style={styles.eyebrowRow}>
        <Sparkles color="#D7B56D" size={14} />
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

const styles = StyleSheet.create({
  root: {
    marginHorizontal: 14,
    marginVertical: 8,
    padding: 14,
    gap: 6,
    borderRadius: 18,
    backgroundColor: '#132721',
    borderWidth: 1,
    borderColor: '#74633F',
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrow: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  title: { color: '#FFF7EC', fontSize: 17, fontFamily: 'PlayfairDisplay_700Bold' },
  signal: { color: '#73D3BC', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  spark: { marginTop: 3, gap: 3 },
  context: { color: '#9FB4AE', fontSize: 10, fontFamily: 'Manrope_500Medium' },
  question: { color: '#F5EDE2', fontSize: 13, lineHeight: 19, fontFamily: 'Manrope_600SemiBold' },
});
