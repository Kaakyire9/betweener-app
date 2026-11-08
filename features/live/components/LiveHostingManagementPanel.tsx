import { Clock3, Gauge, RotateCcw, UserRoundCog, UsersRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { LiveHostingManagementController } from '../hooks/use-live-hosting-management.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const formatTime = (value: string | null) => {
  if (!value) return 'No automatic end';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Scheduled';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getErrorCopy = (error: string | null) => {
  if (!error) return null;
  if (error.includes('profile_not_found')) return 'We could not find that active @username.';
  if (error.includes('assignment_unavailable')) return 'Host handoff closes when the Live begins.';
  if (error.includes('daily_limit')) return 'Scheduled Live time is capped at 24 hours. Use Keep open instead.';
  if (error.includes('forbidden')) return 'You do not have permission to change this Live.';
  return 'That change could not be saved. Please try again.';
};

export function LiveHostingManagementPanel({
  controller,
}: {
  controller: LiveHostingManagementController;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const [username, setUsername] = useState('');
  const { snapshot } = controller;

  if (controller.loading && !snapshot) {
    return <View style={styles.loading}><ActivityIndicator color={visual.teal} /></View>;
  }
  if (!snapshot) {
    return <View style={styles.card}><Text style={styles.error}>{getErrorCopy(controller.error)}</Text></View>;
  }

  const hostLabel = snapshot.host.fullName || snapshot.host.username || 'Host';
  const endLabel = snapshot.schedule.endPolicy === 'manual'
    ? 'Open until Host ends it'
    : `Ends ${formatTime(snapshot.schedule.runtimeEndAt || snapshot.schedule.scheduledEnd)}`;

  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <View style={styles.hostRow}>
          {snapshot.host.avatarUrl ? (
            <Image source={{ uri: snapshot.host.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}><UserRoundCog color={visual.teal} size={20} /></View>
          )}
          <View style={styles.hostCopy}>
            <Text style={styles.eyebrow}>{snapshot.host.delegated ? 'SESSION HOST' : 'PRIMARY HOST'}</Text>
            <Text style={styles.hostName}>{hostLabel}</Text>
            {snapshot.host.username ? <Text style={styles.username}>@{snapshot.host.username}</Text> : null}
          </View>
          <View style={styles.statusPill}><Text style={styles.statusText}>{snapshot.status.toUpperCase()}</Text></View>
        </View>

        <View style={styles.metrics}>
          <View style={styles.metric}><UsersRound color={visual.teal} size={16} /><Text style={styles.metricValue}>{snapshot.traffic.audienceNow}</Text><Text style={styles.metricLabel}>here now</Text></View>
          <View style={styles.metric}><Gauge color={visual.purple} size={16} /><Text style={styles.metricValue}>{snapshot.traffic.totalAttendees}</Text><Text style={styles.metricLabel}>attended</Text></View>
          <View style={styles.metric}><Text style={styles.reactionMark}>✦</Text><Text style={styles.metricValue}>{snapshot.traffic.reactions}</Text><Text style={styles.metricLabel}>reactions</Text></View>
        </View>
      </View>

      {snapshot.canExtend ? (
        <View style={styles.card}>
          <View style={styles.sectionHeading}><Clock3 color={visual.teal} size={18} /><Text style={styles.sectionTitle}>Runtime</Text></View>
          <Text style={styles.runtime}>{endLabel}</Text>
          <Text style={styles.help}>Extend as the room grows, or keep it open until you choose End Live.</Text>
          <View style={styles.actionRow}>
            {[30, 60].map((minutes) => (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                disabled={controller.busyAction != null}
                onPress={() => void controller.extend(minutes)}
                style={styles.secondaryButton}
              ><Text style={styles.secondaryButtonText}>+{minutes} min</Text></Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              disabled={controller.busyAction != null || snapshot.schedule.endPolicy === 'manual'}
              onPress={() => void controller.keepOpen()}
              style={[styles.primaryButton, snapshot.schedule.endPolicy === 'manual' && styles.disabled]}
            >
              {controller.busyAction === 'keep_open' ? <ActivityIndicator color={visual.accentContrast} size="small" /> : <Text style={styles.primaryButtonText}>Keep open</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {snapshot.canDelegateHosts ? (
        <View style={styles.card}>
          <View style={styles.sectionHeading}><UserRoundCog color={visual.purple} size={18} /><Text style={styles.sectionTitle}>Session Host</Text></View>
          <Text style={styles.help}>Assign one trusted person by exact @username. Access is only for this Live and expires when it ends.</Text>
          <View style={styles.inputRow}>
            <Text style={styles.at}>@</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => setUsername(value.replace(/^@+/, ''))}
              placeholder="username"
              placeholderTextColor={visual.textMuted}
              style={styles.input}
              value={username}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!username.trim() || controller.busyAction != null}
              onPress={() => void controller.delegate(username.trim())}
              style={[styles.assignButton, (!username.trim() || controller.busyAction != null) && styles.disabled]}
            >
              {controller.busyAction === 'delegate' ? <ActivityIndicator color={visual.accentContrast} size="small" /> : <Text style={styles.primaryButtonText}>{snapshot.host.delegated ? 'Replace' : 'Assign'}</Text>}
            </Pressable>
          </View>
          {snapshot.host.delegated ? (
            <Pressable accessibilityRole="button" disabled={controller.busyAction != null} onPress={() => void controller.revoke()} style={styles.revokeButton}>
              <RotateCcw color={visual.dangerText} size={15} />
              <Text style={styles.revokeText}>Restore product owner as Host</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {controller.error ? <Text style={styles.error}>{getErrorCopy(controller.error)}</Text> : null}
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  stack: { gap: 14 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 18, borderRadius: 22, borderWidth: 1, borderColor: visual.borderStrong, backgroundColor: visual.surfaceRaised },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: visual.borderStrong },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.tealSoft },
  hostCopy: { flex: 1 },
  eyebrow: { color: visual.teal, fontSize: 9, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  hostName: { marginTop: 3, color: visual.text, fontSize: 17, fontFamily: 'Manrope_800ExtraBold' },
  username: { marginTop: 1, color: visual.textMuted, fontSize: 11, fontFamily: 'Manrope_500Medium' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: visual.tealSoft },
  statusText: { color: visual.teal, fontSize: 8, letterSpacing: 1, fontFamily: 'Manrope_800ExtraBold' },
  metrics: { marginTop: 18, flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: visual.surfaceSoft },
  metricValue: { marginTop: 4, color: visual.text, fontSize: 18, fontFamily: 'Manrope_800ExtraBold' },
  metricLabel: { color: visual.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  reactionMark: { color: visual.gold, fontSize: 17 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: visual.text, fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  runtime: { marginTop: 13, color: visual.text, fontSize: 14, fontFamily: 'Manrope_700Bold' },
  help: { marginTop: 7, color: visual.textMuted, fontSize: 11, lineHeight: 17, fontFamily: 'Manrope_500Medium' },
  actionRow: { marginTop: 16, flexDirection: 'row', gap: 8 },
  secondaryButton: { flex: 1, minHeight: 42, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.borderStrong, backgroundColor: visual.surfaceSoft },
  secondaryButtonText: { color: visual.text, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  primaryButton: { flex: 1.15, minHeight: 42, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.teal },
  primaryButtonText: { color: visual.accentContrast, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  inputRow: { marginTop: 15, minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, borderWidth: 1, borderColor: visual.borderStrong, borderRadius: 20, backgroundColor: visual.surfaceSoft },
  at: { color: visual.teal, fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  input: { flex: 1, minHeight: 46, paddingHorizontal: 5, color: visual.text, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  assignButton: { minWidth: 74, minHeight: 38, marginRight: 5, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.teal },
  revokeButton: { marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 40 },
  revokeText: { color: visual.dangerText, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  error: { color: visual.dangerText, fontSize: 11, lineHeight: 17, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  disabled: { opacity: 0.42 },
});
