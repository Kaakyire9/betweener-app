import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clock3, Radio, ShieldCheck, Sparkles } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type LiveVisualTheme, useLiveVisualTheme } from '@/features/live/components/live-visual-tokens.ts';
import { useLiveAlwaysOnQuickConnect } from '@/features/live/hooks/use-live-always-on-quick-connect.ts';

export default function LiveQuickConnectOpportunityScreen() {
  const { opportunityId } = useLocalSearchParams<{ opportunityId: string }>();
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const { snapshot, loading, pendingAction, error, respond, refresh } =
    useLiveAlwaysOnQuickConnect();
  const opportunity = snapshot?.opportunity?.id === opportunityId
    ? snapshot.opportunity
    : null;
  const ready = opportunity?.state === 'live' && !!opportunity.sessionId;
  const accepted = opportunity?.myState === 'accepted';

  return (
    <LinearGradient
      colors={visual.isDark
        ? [visual.color.canvas, visual.color.surface, visual.color.surfaceSoft]
        : [visual.color.canvas, visual.color.surface, visual.color.tealSoft]}
      style={styles.root}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to Live" onPress={() => router.replace('/live')} style={styles.iconButton}>
            <ArrowLeft size={22} color={visual.color.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Quick Connect</Text>
          <View style={styles.iconButton}><ShieldCheck size={19} color={visual.color.teal} /></View>
        </View>

        <View style={styles.content}>
          <View style={styles.heroIcon}><Sparkles size={27} color={visual.color.accentContrast} /></View>
          <Text style={styles.eyebrow}>PRIVATE FORMATION</Text>
          <Text style={styles.title}>
            {ready ? 'Your room is ready.' : accepted ? 'Making room for a thoughtful connection.' : 'A Quick Connect is forming.'}
          </Text>
          <Text style={styles.body}>
            {ready
              ? 'Enter when you are ready. Your camera and microphone remain under your control.'
              : accepted
                ? 'You are in. We are waiting privately for a viable group—no names or responses are shared.'
                : 'You marked yourself available. Choose only if the moment still works for you.'}
          </Text>

          <View style={styles.card}>
            {loading ? <ActivityIndicator color={visual.color.teal} /> : opportunity ? (
              <>
                <View style={styles.statusRow}>
                  <Radio size={17} color={visual.color.teal} />
                  <View style={styles.statusCopy}>
                    <Text style={styles.statusLabel}>{ready ? 'LIVE IS READY' : accepted ? 'FORMING PRIVATELY' : 'INVITATION'}</Text>
                    <Text style={styles.statusMeta}>
                      {opportunity.acceptedCount} accepted · {opportunity.minimumCount} minimum
                    </Text>
                  </View>
                  <Clock3 size={17} color={visual.color.textMuted} />
                </View>

                {ready ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.replace({
                      pathname: '/live/[sessionId]',
                      params: { sessionId: opportunity.sessionId! },
                    })}
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryText}>Enter Live</Text>
                  </Pressable>
                ) : accepted ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={pendingAction !== null}
                    onPress={() => void respond('withdraw')}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryText}>Withdraw</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      disabled={pendingAction !== null}
                      onPress={() => void respond('accept')}
                      style={styles.primaryButton}
                    >
                      {pendingAction === 'accept'
                        ? <ActivityIndicator size="small" color={visual.color.accentContrast} />
                        : <Text style={styles.primaryText}>I’m in</Text>}
                    </Pressable>
                    <View style={styles.choiceRow}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={pendingAction !== null}
                        onPress={() => void respond('not_now')}
                        style={styles.secondaryButton}
                      >
                        <Text style={styles.secondaryText}>Not now</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={pendingAction !== null}
                        onPress={() => void respond('not_tonight')}
                        style={styles.secondaryButton}
                      >
                        <Text style={styles.secondaryText}>Not tonight</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={styles.expiredTitle}>This formation has closed.</Text>
                <Text style={styles.expiredBody}>No response is held against you. Return to Live whenever you want to be available again.</Text>
                <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Check again</Text>
                </Pressable>
              </>
            )}
            {error ? <Text style={styles.error}>That choice did not save. Please try again.</Text> : null}
          </View>

          <Text style={styles.privacy}>Availability is not consent to media, pairing, or a private spark. Each remains a separate choice.</Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: { minHeight: 70, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerTitle: { flex: 1, textAlign: 'center', color: visual.color.text, fontSize: 17, fontFamily: 'Archivo_700Bold' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 38, alignItems: 'center' },
  heroIcon: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.teal, marginBottom: 20 },
  eyebrow: { color: visual.color.teal, fontSize: 10, letterSpacing: 2, fontFamily: 'Manrope_800ExtraBold' },
  title: { maxWidth: 350, color: visual.color.text, fontSize: 34, lineHeight: 41, textAlign: 'center', marginTop: 10, fontFamily: 'PlayfairDisplay_700Bold' },
  body: { maxWidth: 350, color: visual.color.textMuted, fontSize: 13, lineHeight: 21, textAlign: 'center', marginTop: 13, fontFamily: 'Manrope_500Medium' },
  card: { width: '100%', maxWidth: 420, borderRadius: 26, borderWidth: 1, borderColor: visual.color.borderStrong, backgroundColor: visual.color.surfaceRaised, padding: 19, gap: 14, marginTop: 30 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 18, backgroundColor: visual.color.tealSoft },
  statusCopy: { flex: 1 },
  statusLabel: { color: visual.color.teal, fontSize: 9, letterSpacing: 1.3, fontFamily: 'Manrope_800ExtraBold' },
  statusMeta: { color: visual.color.text, fontSize: 11, marginTop: 3, fontFamily: 'Manrope_700Bold' },
  primaryButton: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.teal },
  primaryText: { color: visual.color.accentContrast, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  choiceRow: { flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surfaceSoft, paddingHorizontal: 14 },
  secondaryText: { color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  expiredTitle: { color: visual.color.text, fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  expiredBody: { color: visual.color.textMuted, fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium' },
  privacy: { maxWidth: 350, color: visual.color.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 22, fontFamily: 'Manrope_600SemiBold' },
  error: { color: visual.color.danger, fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
});
