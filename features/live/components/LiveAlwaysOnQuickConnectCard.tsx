import { Clock3, Radio, ShieldCheck, Sparkles, Square } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { getLiveAlwaysOnAvailabilityErrorMessage } from '../always-on/live-always-on-errors.ts';
import { useLiveAlwaysOnQuickConnect } from '../hooks/use-live-always-on-quick-connect.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type Props = {
  onOpenOpportunity: (opportunityId: string) => void;
};

const formatRemaining = (milliseconds: number) => {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes} min`;
};

export function LiveAlwaysOnQuickConnectCard({ onOpenOpportunity }: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const { snapshot, loading, pendingAction, error, setAvailability } =
    useLiveAlwaysOnQuickConnect();
  const errorMessage = getLiveAlwaysOnAvailabilityErrorMessage(error);
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!loading && (!snapshot || !snapshot.available)) return null;
  const availability = snapshot?.availability ?? null;
  const opportunity = snapshot?.opportunity ?? null;
  const remainingMs = availability
    ? new Date(availability.expiresAt).getTime() - Date.now()
    : 0;
  const notTonightRemainingMs = availability?.notTonightUntil
    ? new Date(availability.notTonightUntil).getTime() - Date.now()
    : 0;
  const cooldownRemainingMs = availability?.cooldownUntil
    ? new Date(availability.cooldownUntil).getTime() - Date.now()
    : 0;
  const quietRemainingMs = Math.max(notTonightRemainingMs, cooldownRemainingMs);
  const quietMode = notTonightRemainingMs >= cooldownRemainingMs
    ? 'not_tonight'
    : 'cooldown';
  const isQuiet = availability?.status === 'paused' && quietRemainingMs > 0;
  const isActive = !!availability
    && ['available', 'reserved', 'consumed'].includes(availability.status)
    && remainingMs > 0;
  const hasExpiredWindow = !!availability
    && ['available', 'reserved', 'expired'].includes(availability.status)
    && remainingMs <= 0;

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.iconWell}>
          <Radio size={19} color={visual.color.teal} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>QUICK CONNECT · AVAILABLE NOW</Text>
          <Text style={styles.title}>
            {isActive
              ? 'You are open to a moment.'
              : isQuiet
                ? 'We’ll keep this moment quiet.'
                : 'Meet someone, while you are free.'}
          </Text>
        </View>
        <ShieldCheck size={18} color={visual.color.teal} />
      </View>

      <Text style={styles.body}>
        Availability is private and time-limited. Being online never opts you in, and every invitation still asks first.
      </Text>

      {loading ? <ActivityIndicator color={visual.color.teal} /> : isActive ? (
        <View style={styles.activePanel}>
          <View style={styles.activeCopy}>
            <Clock3 size={16} color={visual.color.teal} />
            <View>
              <Text style={styles.activeLabel}>{opportunity ? 'A private opportunity is forming' : 'Available now'}</Text>
              <Text style={styles.activeMeta}>{formatRemaining(remainingMs)} remaining</Text>
            </View>
          </View>
          {opportunity ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenOpportunity(opportunity.id)}
              style={styles.primaryButton}
            >
              <Sparkles size={15} color={visual.color.accentContrast} />
              <Text style={styles.primaryText}>
                {opportunity.myState === 'invited' ? 'Review invitation' : 'View formation'}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              disabled={pendingAction !== null}
              onPress={() => void setAvailability(30)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>Extend 30 min</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={pendingAction !== null}
              onPress={() => void setAvailability(0)}
              style={styles.stopButton}
            >
              <Square size={13} color={visual.color.textMuted} />
              <Text style={styles.stopText}>Stop</Text>
            </Pressable>
          </View>
        </View>
      ) : isQuiet ? (
        <View style={styles.quietPanel}>
          <Clock3 size={16} color={visual.color.purple} />
          <View style={styles.quietCopy}>
            <Text style={styles.quietLabel}>
              {quietMode === 'not_tonight' ? 'Not tonight is active' : 'Invitation pause is active'}
            </Text>
            <Text style={styles.activeMeta}>
              You won’t receive another invitation for {formatRemaining(quietRemainingMs)}.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.durationChoices}>
          {hasExpiredWindow ? (
            <View style={styles.expiredPanel}>
              <Clock3 size={16} color={visual.color.teal} />
              <View style={styles.expiredCopy}>
                <Text style={styles.activeLabel}>Your availability window ended.</Text>
                <Text style={styles.activeMeta}>
                  No invitation was sent during this window. Choose another time whenever you like.
                </Text>
              </View>
            </View>
          ) : null}
          <View style={styles.durationRow}>
            {(snapshot?.durationOptionsMinutes ?? [15, 30, 60]).map((duration) => (
              <Pressable
                key={duration}
                accessibilityLabel={`Be available for ${duration} minutes`}
                accessibilityRole="button"
                disabled={pendingAction !== null}
                onPress={() => void setAvailability(duration)}
                style={[styles.durationButton, duration === 30 && styles.durationRecommended]}
              >
                {pendingAction === `duration:${duration}`
                  ? <ActivityIndicator size="small" color={visual.color.accentContrast} />
                  : <Text style={[styles.durationText, duration === 30 && styles.durationRecommendedText]}>{duration} min</Text>}
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
    backgroundColor: visual.color.surfaceRaised,
    padding: 19,
    gap: 14,
    marginTop: 18,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1 },
  iconWell: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.tealSoft },
  eyebrow: { color: visual.color.teal, fontSize: 9, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  title: { color: visual.color.text, fontSize: 18, lineHeight: 23, marginTop: 3, fontFamily: 'PlayfairDisplay_700Bold' },
  body: { color: visual.color.textMuted, fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium' },
  activePanel: { borderRadius: 20, padding: 14, gap: 12, backgroundColor: visual.color.tealSoft, borderWidth: 1, borderColor: visual.color.border },
  activeCopy: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activeLabel: { color: visual.color.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  activeMeta: { color: visual.color.textMuted, fontSize: 10, marginTop: 2, fontFamily: 'Manrope_600SemiBold' },
  quietPanel: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, padding: 14, backgroundColor: visual.color.purpleSoft, borderWidth: 1, borderColor: visual.color.border },
  quietCopy: { flex: 1 },
  quietLabel: { color: visual.color.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  actionRow: { flexDirection: 'row', gap: 9 },
  durationChoices: { gap: 12 },
  durationRow: { flexDirection: 'row', gap: 9 },
  expiredPanel: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, padding: 14, backgroundColor: visual.color.tealSoft, borderWidth: 1, borderColor: visual.color.border },
  expiredCopy: { flex: 1 },
  durationButton: { flex: 1, minHeight: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surfaceSoft },
  durationRecommended: { backgroundColor: visual.color.teal, borderColor: visual.color.teal },
  durationText: { color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  durationRecommendedText: { color: visual.color.accentContrast },
  primaryButton: { minHeight: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, backgroundColor: visual.color.teal },
  primaryText: { color: visual.color.accentContrast, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  secondaryButton: { flex: 1, minHeight: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  secondaryText: { color: visual.color.teal, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  stopButton: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: visual.color.border },
  stopText: { color: visual.color.textMuted, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  error: { color: visual.color.danger, fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
});
