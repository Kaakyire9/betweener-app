import * as Haptics from 'expo-haptics';
import { Sparkles } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { LiveChemistrySnapshot } from '../application/index.ts';
import { liveChemistryAction, liveChemistryContextLine } from '../domain/live-chemistry.ts';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

type Props = {
  required: boolean;
  snapshot: LiveChemistrySnapshot | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onOfferReveal: () => void;
  onReady: () => void;
  onRetry: () => void;
};

export function LiveChemistryOverlay({
  required, snapshot, loading, busy, error, onOfferReveal, onReady, onRetry,
}: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const action = liveChemistryAction(snapshot);
  const context = useMemo(() => snapshot ? [
    snapshot.otherPersonContext.age == null ? null : `Age ${snapshot.otherPersonContext.age}`,
    snapshot.otherPersonContext.city?.trim() ? `City: ${snapshot.otherPersonContext.city.trim()}` : null,
    snapshot.otherPersonContext.lookingFor?.trim()
      ? `Intention: ${snapshot.otherPersonContext.lookingFor.trim()}`
      : null,
    ...snapshot.otherPersonContext.values.map((value) => {
      const normalized = liveChemistryContextLine(value);
      return normalized ? `Values: ${normalized}` : null;
    }),
  ].filter((value): value is string => Boolean(value)) : [], [snapshot]);

  useEffect(() => {
    if (snapshot?.state !== 'revealed') return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }).start();
  }, [opacity, snapshot?.state]);

  if (!required || snapshot?.state === 'revealed' || snapshot?.state === 'ended') return null;
  const name = snapshot?.otherPersonContext.fullName?.trim() || 'Your conversation';
  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="auto">
      <View style={styles.halo} />
      <View style={styles.content}>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          fadingEdgeLength={18}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <View style={styles.icon}><Sparkles color={LIVE_VISUAL.color.gold} size={23} /></View>
          <Text style={styles.eyebrow}>CHEMISTRY FIRST</Text>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.copy}>Stay with the conversation before the full picture appears.</Text>
          {context.length ? (
            <View style={styles.contextRow}>
              {context.slice(0, 5).map((item, index) => (
                <View key={`${item}:${index}`} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>
              ))}
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.actionArea}>
          {loading || (!snapshot && !error) ? <ActivityIndicator color={LIVE_VISUAL.color.gold} /> : null}
          {error ? (
            <View style={styles.errorArea}>
              <Text style={styles.error}>This private reveal could not be verified yet. Video remains protected.</Text>
              <Pressable disabled={busy} onPress={onRetry} style={styles.retryButton}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : null}
          {!error && !loading && snapshot && action === 'offer_reveal' ? (
            <Pressable disabled={busy} onPress={onOfferReveal} style={styles.button}>
              <Text style={styles.buttonText}>{busy ? 'Offering...' : 'Offer a reveal'}</Text>
            </Pressable>
          ) : null}
          {!error && !loading && snapshot && action === 'mark_ready' ? (
            <Pressable disabled={busy} onPress={onReady} style={styles.button}>
              <Text style={styles.buttonText}>{busy ? 'Holding...' : "I'm ready to reveal"}</Text>
            </Pressable>
          ) : null}
          {!error && !loading && snapshot && action === 'waiting' ? (
            <View style={styles.waiting}><Text style={styles.waitingText}>Keep talking a little longer.</Text></View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 8, overflow: 'hidden', backgroundColor: '#06110FF2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 16 },
  halo: { position: 'absolute', width: 330, height: 330, borderRadius: 999, backgroundColor: '#8B73D62E', shadowColor: '#8B73D6', shadowOpacity: 0.45, shadowRadius: 80 },
  content: { width: '100%', maxWidth: 390, maxHeight: '100%', flex: 1, alignItems: 'center' },
  scroll: { width: '100%', flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, paddingTop: 2, paddingBottom: 8 },
  icon: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#D7B56D66', backgroundColor: '#D7B56D16', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  eyebrow: { color: LIVE_VISUAL.color.gold, fontSize: 12, fontWeight: '800', letterSpacing: 2.4 },
  title: { color: LIVE_VISUAL.color.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 30, textAlign: 'center', marginTop: 8 },
  copy: { color: LIVE_VISUAL.color.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 14 },
  chip: { borderWidth: 1, borderColor: LIVE_VISUAL.color.borderStrong, backgroundColor: '#FFFFFF0D', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, maxWidth: '100%' },
  chipText: { color: LIVE_VISUAL.color.oat, fontSize: 13 },
  actionArea: { width: '100%', minHeight: 54, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  button: { width: '100%', maxWidth: 280, borderRadius: 999, backgroundColor: LIVE_VISUAL.color.gold, paddingHorizontal: 24, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#10201C', fontSize: 15, fontWeight: '800' },
  waiting: { borderRadius: 999, borderWidth: 1, borderColor: '#8B73D666', backgroundColor: '#8B73D620', paddingHorizontal: 20, paddingVertical: 13 },
  waitingText: { color: '#D8CCFA', fontWeight: '700' },
  errorArea: { alignItems: 'center' },
  error: { color: '#F0AAA5', fontSize: 12, textAlign: 'center' },
  retryButton: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: '#D7B56D66' },
  retryText: { color: LIVE_VISUAL.color.gold, fontSize: 13, fontWeight: '800' },
});
