import { ShieldCheck, UserRoundCog, UserRoundX } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  LiveStudioSessionOperator,
  LiveStudioSessionOperatorRole,
} from '../application/live-models.ts';
import type { LiveOperatorManagementController } from '../hooks/use-live-operator-management.ts';
import { LiveStepUpSheet } from './LiveStepUpSheet.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const ROLES: readonly {
  value: LiveStudioSessionOperatorRole;
  label: string;
  description: string;
}[] = [
  { value: 'moderator', label: 'Moderator', description: 'Safety, alerts and private operator communications.' },
  { value: 'producer', label: 'Producer', description: 'Programme control, media publishing and broadcast actions.' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to the programme monitor.' },
];

type ExpiryChoice = 'event' | 'day' | 'week';
type PendingOperation =
  | {
      kind: 'assign';
      email: string;
      operatorRole: LiveStudioSessionOperatorRole;
      expiresAt: string | null;
    }
  | { kind: 'revoke'; userId: string };

const operatorLabel = (operator: LiveStudioSessionOperator) =>
  operator.fullName?.trim()
  || (operator.username ? `@${operator.username}` : '')
  || operator.email;

const formatExpiry = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Expiry unavailable'
    : `Until ${new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)}`;
};

const readableError = (value: string) => {
  if (value.includes('account_not_found')) return 'No active Betweener account uses that exact email.';
  if (value.includes('profile_unavailable')) return 'That account must finish its active Betweener profile first.';
  if (value.includes('assignment_closed')) return 'Operators cannot be added after a Live has ended or been cancelled.';
  if (value.includes('expiry_invalid')) return 'Choose an access window between 15 minutes and 30 days.';
  if (value.includes('admin_required')) return 'Only an authorized Live administrator can manage operators.';
  if (value.includes('step_up_required')) return 'Verify your authenticator before changing operator access.';
  return 'Operator access could not be updated. Refresh and try again.';
};

export function LiveOperatorAssignmentPanel({
  controller,
}: {
  controller: LiveOperatorManagementController;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<LiveStudioSessionOperatorRole>('moderator');
  const [expiry, setExpiry] = useState<ExpiryChoice>('event');
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [stepUpVisible, setStepUpVisible] = useState(false);
  const normalizedEmail = email.trim().toLowerCase();
  const activeOperators = controller.snapshot?.operators.filter(
    (operator) => operator.status === 'active',
  ) ?? [];
  const inactiveCount = (controller.snapshot?.operators.length ?? 0) - activeOperators.length;
  const canAssign = controller.snapshot?.canAssign === true
    && normalizedEmail.includes('@')
    && !controller.assigning
    && controller.busyUserId == null;

  const expiresAt = () => {
    if (expiry === 'event') return null;
    const duration = expiry === 'day' ? 24 : 24 * 7;
    return new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
  };

  const requestAssignment = () => {
    if (!canAssign) return;
    setPending({ kind: 'assign', email: normalizedEmail, operatorRole: role, expiresAt: expiresAt() });
    setStepUpVisible(true);
  };

  const requestRevocation = (operator: LiveStudioSessionOperator) => {
    Alert.alert(
      `Remove ${operator.operatorRole} access?`,
      `${operatorLabel(operator)} will immediately lose access to this programme in Studio.`,
      [
        { text: 'Keep access', style: 'cancel' },
        {
          text: 'Remove access',
          style: 'destructive',
          onPress: () => {
            setPending({ kind: 'revoke', userId: operator.userId });
            setStepUpVisible(true);
          },
        },
      ],
    );
  };

  const completePendingOperation = async () => {
    if (!pending) return;
    const succeeded = pending.kind === 'assign'
      ? await controller.assign({
          email: pending.email,
          operatorRole: pending.operatorRole,
          expiresAt: pending.expiresAt,
          note: `Assigned from Live management as ${pending.operatorRole}`,
        })
      : await controller.revoke(pending.userId);
    if (!succeeded) return;
    if (pending.kind === 'assign') setEmail('');
    setPending(null);
    setStepUpVisible(false);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <View style={styles.headingIcon}><UserRoundCog size={18} color={visual.teal} /></View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>STUDIO TEAM</Text>
          <Text style={styles.title}>Assign operators</Text>
          <Text style={styles.description}>
            Access is private to this Live, requires an authenticator and expires automatically.
          </Text>
        </View>
        {controller.loading ? <ActivityIndicator color={visual.teal} size="small" /> : null}
      </View>

      {controller.snapshot?.canAssign ? (
        <View style={styles.composer}>
          <Text style={styles.label}>EXACT ACCOUNT EMAIL</Text>
          <TextInput
            accessibilityLabel="Operator account email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="operator@example.com"
            placeholderTextColor={visual.textMuted}
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>RESPONSIBILITY</Text>
          <View style={styles.roleList}>
            {ROLES.map((option) => {
              const selected = role === option.value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option.value}
                  onPress={() => setRole(option.value)}
                  style={[styles.role, selected && styles.roleSelected]}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                  <View style={styles.roleCopy}>
                    <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>{option.label}</Text>
                    <Text style={styles.roleDescription}>{option.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>ACCESS WINDOW</Text>
          <View style={styles.expiryRow}>
            {([
              ['event', 'After Live'],
              ['day', '24 hours'],
              ['week', '7 days'],
            ] as const).map(([value, label]) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: expiry === value }}
                key={value}
                onPress={() => setExpiry(value)}
                style={[styles.expiry, expiry === value && styles.expirySelected]}
              >
                <Text style={[styles.expiryText, expiry === value && styles.expiryTextSelected]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!canAssign}
            onPress={requestAssignment}
            style={[styles.assignButton, !canAssign && styles.disabled]}
          >
            {controller.assigning ? <ActivityIndicator color={visual.accentContrast} size="small" /> : (
              <><ShieldCheck size={17} color={visual.accentContrast} /><Text style={styles.assignText}>Verify & assign</Text></>
            )}
          </Pressable>
        </View>
      ) : controller.loading ? null : (
        <Text style={styles.closed}>This Live is closed to new operator assignments.</Text>
      )}

      {controller.error ? (
        <Pressable accessibilityRole="button" onPress={controller.clearError} style={styles.errorCard}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>{readableError(controller.error)}</Text>
          <Text style={styles.dismiss}>Dismiss</Text>
        </Pressable>
      ) : null}

      <View style={styles.rosterHeading}>
        <Text style={styles.rosterTitle}>Assigned to this Live</Text>
        <Text style={styles.count}>{activeOperators.length}</Text>
      </View>
      {activeOperators.length === 0 ? (
        <Text style={styles.empty}>No additional Studio operators are assigned.</Text>
      ) : activeOperators.map((operator) => (
        <View key={operator.assignmentId} style={styles.operatorRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{operatorLabel(operator).slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.operatorCopy}>
            <Text numberOfLines={1} style={styles.operatorName}>{operatorLabel(operator)}</Text>
            <Text numberOfLines={1} style={styles.operatorEmail}>{operator.email}</Text>
            <Text style={styles.operatorExpiry}>{formatExpiry(operator.expiresAt)}</Text>
          </View>
          <View style={styles.operatorActions}>
            <Text style={styles.roleBadge}>{operator.operatorRole.toUpperCase()}</Text>
            <Pressable
              accessibilityLabel={`Remove ${operatorLabel(operator)} from this Live`}
              disabled={controller.busyUserId != null || controller.assigning}
              onPress={() => requestRevocation(operator)}
              style={styles.revokeButton}
            >
              {controller.busyUserId === operator.userId
                ? <ActivityIndicator color={visual.danger} size="small" />
                : <UserRoundX size={17} color={visual.danger} />}
            </Pressable>
          </View>
        </View>
      ))}
      {inactiveCount > 0 ? (
        <Text style={styles.history}>{inactiveCount} expired or revoked assignment{inactiveCount === 1 ? '' : 's'} retained in the audit trail.</Text>
      ) : null}

      <LiveStepUpSheet
        actionLabel={pending?.kind === 'revoke' ? 'Remove access' : 'Assign operator'}
        onCancel={() => { setPending(null); setStepUpVisible(false); }}
        onVerified={completePendingOperation}
        visible={stepUpVisible}
      />
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  panel: { marginBottom: 4, padding: 15, borderRadius: 23, gap: 14, backgroundColor: visual.surfaceSoft, borderWidth: 1, borderColor: visual.borderStrong },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  headingIcon: { width: 39, height: 39, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.tealSoft },
  headingCopy: { flex: 1 },
  eyebrow: { color: visual.teal, fontSize: 8, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 3, color: visual.text, fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  description: { marginTop: 4, color: visual.textMuted, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium' },
  composer: { gap: 9 },
  label: { marginTop: 2, color: visual.textMuted, fontSize: 8, letterSpacing: 1.1, fontFamily: 'Manrope_800ExtraBold' },
  input: { height: 49, paddingHorizontal: 14, borderRadius: 16, color: visual.text, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border, fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  roleList: { gap: 7 },
  role: { minHeight: 59, padding: 10, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  roleSelected: { borderColor: visual.teal, backgroundColor: visual.tealSoft },
  radio: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: visual.textMuted },
  radioSelected: { borderColor: visual.teal, backgroundColor: visual.teal },
  roleCopy: { flex: 1 },
  roleLabel: { color: visual.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  roleLabelSelected: { color: visual.teal },
  roleDescription: { marginTop: 2, color: visual.textMuted, fontSize: 9, lineHeight: 13, fontFamily: 'Manrope_500Medium' },
  expiryRow: { flexDirection: 'row', gap: 7 },
  expiry: { flex: 1, minHeight: 37, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  expirySelected: { borderColor: visual.teal, backgroundColor: visual.tealSoft },
  expiryText: { color: visual.textMuted, fontSize: 9, fontFamily: 'Manrope_700Bold' },
  expiryTextSelected: { color: visual.teal },
  assignButton: { minHeight: 48, marginTop: 3, paddingHorizontal: 16, borderRadius: 24, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.teal },
  assignText: { color: visual.accentContrast, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  disabled: { opacity: 0.42 },
  closed: { color: visual.textMuted, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_600SemiBold' },
  errorCard: { padding: 11, borderRadius: 15, gap: 5, backgroundColor: visual.dangerSoft, borderWidth: 1, borderColor: visual.danger },
  error: { color: visual.dangerText, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_600SemiBold' },
  dismiss: { color: visual.dangerText, fontSize: 8, letterSpacing: 0.7, fontFamily: 'Manrope_800ExtraBold' },
  rosterHeading: { marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rosterTitle: { color: visual.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  count: { minWidth: 25, height: 25, borderRadius: 13, textAlign: 'center', textAlignVertical: 'center', color: visual.teal, backgroundColor: visual.tealSoft, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  empty: { padding: 11, borderRadius: 14, color: visual.textMuted, backgroundColor: visual.surface, fontSize: 9, lineHeight: 14, fontFamily: 'Manrope_500Medium' },
  operatorRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: visual.border },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.tealSoft },
  avatarText: { color: visual.teal, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  operatorCopy: { flex: 1 },
  operatorName: { color: visual.text, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  operatorEmail: { marginTop: 1, color: visual.textMuted, fontSize: 8, fontFamily: 'Manrope_500Medium' },
  operatorExpiry: { marginTop: 3, color: visual.textMuted, fontSize: 8, fontFamily: 'Manrope_600SemiBold' },
  operatorActions: { alignItems: 'flex-end', gap: 7 },
  roleBadge: { color: visual.teal, fontSize: 7, letterSpacing: 0.8, fontFamily: 'Manrope_800ExtraBold' },
  revokeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.dangerSoft },
  history: { color: visual.textMuted, fontSize: 8, lineHeight: 13, textAlign: 'center', fontFamily: 'Manrope_500Medium' },
});
