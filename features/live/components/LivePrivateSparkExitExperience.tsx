import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Heart, Sparkles, UserRoundCheck } from 'lucide-react-native';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  LivePrivateSparkExitDecision,
  LivePrivateSparkExitOutcome,
} from '../application/live-models.ts';
import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

type Props = {
  busy: boolean;
  error: string | null;
  myDecision: LivePrivateSparkExitDecision | null;
  onDecision: (decision: LivePrivateSparkExitDecision) => void;
  onOpenChat: () => void;
  onReturn: () => void;
  otherName: string;
  outcome: LivePrivateSparkExitOutcome;
};

const choices: readonly {
  decision: LivePrivateSparkExitDecision;
  label: string;
  description: string;
}[] = [
  {
    decision: 'continue',
    label: 'I’d like to continue',
    description: 'Open a conversation only if they choose this too.',
  },
  {
    decision: 'friendship',
    label: 'Friendship feels right',
    description: 'Save this privately as your preference.',
  },
  {
    decision: 'not_this_time',
    label: 'Not this time',
    description: 'Close the moment kindly and privately.',
  },
] as const;

export const LivePrivateSparkExitExperience = memo(function LivePrivateSparkExitExperience({
  busy,
  error,
  myDecision,
  onDecision,
  onOpenChat,
  onReturn,
  otherName,
  outcome,
}: Props) {
  if (outcome === 'mutual_connection') {
    return (
      <Frame>
        <View style={styles.mutualMark}>
          <Heart color="#F5E8FA" fill="#A884D7" size={27} />
        </View>
        <Text style={styles.eyebrow}>A MUTUAL SPARK</Text>
        <Text style={styles.title}>You both felt it.</Text>
        <Text style={styles.copy}>
          Your private choices aligned. Continue with {otherName} in a conversation that belongs to you both.
        </Text>
        <Pressable accessibilityRole="button" onPress={onOpenChat} style={styles.primaryButton}>
          <Text style={styles.primaryText}>Start your conversation</Text>
          <ArrowRight color="#09201B" size={17} />
        </Pressable>
      </Frame>
    );
  }

  if (myDecision) {
    return (
      <Frame>
        <View style={styles.savedMark}>
          <UserRoundCheck color="#85D0BE" size={24} />
        </View>
        <Text style={styles.eyebrow}>CHOICE SAVED PRIVATELY</Text>
        <Text style={styles.title}>
          {outcome === 'pending' ? 'Your answer is safe with us.' : 'Thank you for being honest.'}
        </Text>
        <Text style={styles.copy}>
          {outcome === 'pending'
            ? 'We will only reveal a mutual connection—never either person’s private answer.'
            : 'This moment is complete. Neither person’s private choice will be shared.'}
        </Text>
        <Pressable accessibilityRole="button" onPress={onReturn} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Return to Live</Text>
        </Pressable>
      </Frame>
    );
  }

  return (
    <Frame>
      <View style={styles.savedMark}>
        <Sparkles color="#D9C4F3" size={23} />
      </View>
      <Text style={styles.eyebrow}>JUST BETWEEN YOU</Text>
      <Text style={styles.title}>How did that connection feel?</Text>
      <Text style={styles.copy}>
        Your answer stays private. A connection opens only when you both choose to continue.
      </Text>
      <View style={styles.choiceList}>
        {choices.map((choice) => (
          <Pressable
            accessibilityHint={choice.description}
            accessibilityRole="button"
            disabled={busy}
            key={choice.decision}
            onPress={() => onDecision(choice.decision)}
            style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
          >
            <View style={styles.choiceCopy}>
              <Text style={styles.choiceLabel}>{choice.label}</Text>
              <Text style={styles.choiceDescription}>{choice.description}</Text>
            </View>
            {busy ? <ActivityIndicator color={LIVE_VISUAL.color.purple} size="small" /> : <ArrowRight color="#CDBAF0" size={17} />}
          </Pressable>
        ))}
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>That choice could not be saved yet. Please try again.</Text> : null}
    </Frame>
  );
});

const Frame = ({ children }: { children: React.ReactNode }) => (
  <LinearGradient colors={['#071512', '#07110F', '#0E1117']} style={styles.root}>
    <View pointerEvents="none" style={styles.glow} />
    <LiveGlassSurface intensity={48} style={styles.card}>{children}</LiveGlassSurface>
    <View style={styles.privacyRow}>
      <Heart color="#8B73D6" size={12} />
      <Text style={styles.privacyText}>No private choice is shown to the other person.</Text>
    </View>
  </LinearGradient>
);

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 42 },
  glow: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: '#8B73D61C' },
  card: { width: '100%', maxWidth: 430, paddingHorizontal: 22, paddingVertical: 26, borderRadius: 30, alignItems: 'center', borderColor: '#A994D849', backgroundColor: '#071512DE' },
  mutualMark: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8B73D63D', borderWidth: 1, borderColor: '#C6AFE96B' },
  savedMark: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17302A', borderWidth: 1, borderColor: '#70BDAA45' },
  eyebrow: { marginTop: 15, color: '#CDB9ED', fontSize: 9, letterSpacing: 2.1, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 8, color: '#FFF7EC', fontSize: 27, lineHeight: 34, textAlign: 'center', fontFamily: 'PlayfairDisplay_700Bold' },
  copy: { marginTop: 10, maxWidth: 330, color: '#A8BBB5', fontSize: 12, lineHeight: 19, textAlign: 'center', fontFamily: 'Manrope_500Medium' },
  choiceList: { width: '100%', marginTop: 22, gap: 9 },
  choice: { minHeight: 68, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF0A', borderWidth: 1, borderColor: '#FFFFFF17' },
  choicePressed: { backgroundColor: '#8B73D622', borderColor: '#B7A1E052' },
  choiceCopy: { flex: 1 },
  choiceLabel: { color: '#F7EDDE', fontSize: 13, fontFamily: 'Manrope_700Bold' },
  choiceDescription: { marginTop: 3, color: '#8FA49E', fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium' },
  primaryButton: { width: '100%', minHeight: 52, marginTop: 24, paddingHorizontal: 19, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#C7E2D6' },
  primaryText: { color: '#09201B', fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  secondaryButton: { width: '100%', minHeight: 50, marginTop: 23, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: LIVE_VISUAL.color.borderStrong },
  secondaryText: { color: LIVE_VISUAL.color.purple, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  error: { marginTop: 12, color: '#F0BFC0', fontSize: 10, lineHeight: 15, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  privacyRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 7 },
  privacyText: { color: '#7F928D', fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
});
