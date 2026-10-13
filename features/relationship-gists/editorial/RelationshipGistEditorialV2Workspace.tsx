import { AdminScreenShell } from '@/components/admin/AdminScreenShell';
import { Colors } from '@/constants/theme';
import { RelationshipGistAIStudio } from '@/features/relationship-gists/ai/RelationshipGistAIStudio';
import { RELATIONSHIP_GIST_AI_STUDIO_ENABLED } from '@/features/relationship-gists/config/relationship-gist-ai-flags';
import { RELATIONSHIP_GIST_PERSPECTIVES } from '@/features/relationship-gists/domain/relationship-gist';
import {
  addRelationshipGistRevisionVariant,
  createRelationshipGistRevision,
  createRelationshipGistRollbackRevision,
  fetchRelationshipGistEditorialRevisions,
  transitionRelationshipGistRevision,
} from '@/features/relationship-gists/editorial/relationship-gist-editorial-repository';
import {
  formatRelationshipGistSchedule,
  getRelationshipGistEditorialActions,
  type RelationshipGistEditorialAction,
  type RelationshipGistEditorialRevision,
} from '@/features/relationship-gists/editorial/relationship-gist-editorial-v2';
import {
  DENIED_RELATIONSHIP_GIST_EDITORIAL_PERMISSIONS,
  normalizeRelationshipGistEditorialPermissions,
} from '@/features/relationship-gists/editorial/relationship-gist-editorial-permissions';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type ComposerState = {
  variantRevisionId: string | null;
  editionId: string | null;
  sourceRevisionId: string | null;
  title: string;
  summary: string;
  body: string;
  perspective: string;
  requiresSafetyReview: boolean;
};

const EMPTY_COMPOSER: ComposerState = {
  variantRevisionId: null,
  editionId: null,
  sourceRevisionId: null,
  title: '',
  summary: '',
  body: '',
  perspective: 'general',
  requiresSafetyReview: false,
};

const ACTION_LABELS: Record<RelationshipGistEditorialAction, string> = {
  submit: 'Send to review',
  quality_approve: 'Quality approve',
  safety_approve: 'Safety approve',
  schedule: 'Schedule',
  cancel_schedule: 'Cancel schedule',
  publish: 'Publish',
  unpublish: 'Unpublish',
  archive: 'Archive',
};

export function RelationshipGistEditorialV2Workspace() {
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'light') === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [revisions, setRevisions] = useState<RelationshipGistEditorialRevision[]>([]);
  const [permissions, setPermissions] = useState(DENIED_RELATIONSHIP_GIST_EDITORIAL_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<RelationshipGistEditorialRevision | null>(null);
  const [scheduleValue, setScheduleValue] = useState('');
  const [rollbackTarget, setRollbackTarget] = useState<RelationshipGistEditorialRevision | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpc_get_my_relationship_gist_editorial_permissions');
      if (error) throw error;
      const nextPermissions = normalizeRelationshipGistEditorialPermissions(data);
      setPermissions(nextPermissions);
      if (!nextPermissions.canRead) {
        setRevisions([]);
        return;
      }
      setRevisions(await fetchRelationshipGistEditorialRevisions(supabase as any));
    } catch (error) {
      setPermissions(DENIED_RELATIONSHIP_GIST_EDITORIAL_PERMISSIONS);
      Alert.alert('Editorial', error instanceof Error ? error.message : 'Unable to load the editorial workflow.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveRevision = useCallback(async () => {
    if (!composer || !permissions.canDraft || working) return;
    if (composer.title.trim().length < 3 || composer.body.trim().length < 20) {
      Alert.alert('Revision', 'Add a clear title and at least 20 characters of guidance.');
      return;
    }
    setWorking(true);
    try {
      if (composer.variantRevisionId) {
        await addRelationshipGistRevisionVariant(supabase as any, {
          revisionId: composer.variantRevisionId,
          title: composer.title.trim(),
          shortBody: composer.summary.trim() || null,
          body: composer.body.trim(),
          perspective: composer.perspective,
        });
      } else {
        await createRelationshipGistRevision(supabase as any, {
          editionId: composer.editionId,
          sourceRevisionId: composer.sourceRevisionId,
          title: composer.title.trim(),
          shortBody: composer.summary.trim() || null,
          body: composer.body.trim(),
          perspective: composer.perspective,
          requiresSafetyReview: composer.requiresSafetyReview || composer.perspective === 'safety',
        });
      }
      setComposer(null);
      await load();
    } catch (error) {
      Alert.alert('Revision not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }, [composer, load, permissions.canDraft, working]);

  const runTransition = useCallback(async (
    revision: RelationshipGistEditorialRevision,
    action: RelationshipGistEditorialAction,
    scheduledFor?: string | null,
  ) => {
    if (working) return;
    setWorking(true);
    try {
      await transitionRelationshipGistRevision(supabase as any, {
        revisionId: revision.revision_id,
        action,
        scheduledFor,
      });
      setScheduleTarget(null);
      setScheduleValue('');
      await load();
    } catch (error) {
      Alert.alert('Transition blocked', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }, [load, working]);

  const requestAction = useCallback((
    revision: RelationshipGistEditorialRevision,
    action: RelationshipGistEditorialAction,
  ) => {
    if (action === 'schedule') {
      setScheduleTarget(revision);
      setScheduleValue('');
      return;
    }
    const destructive = action === 'unpublish' || action === 'archive';
    Alert.alert(ACTION_LABELS[action], `Move revision ${revision.revision_number} to the next editorial state?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: ACTION_LABELS[action],
        style: destructive ? 'destructive' : 'default',
        onPress: () => void runTransition(revision, action),
      },
    ]);
  }, [runTransition]);

  const schedule = useCallback(async () => {
    if (!scheduleTarget) return;
    const timestamp = Date.parse(scheduleValue);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now() + 60_000) {
      Alert.alert('Schedule', 'Enter a valid future ISO timestamp, including its timezone.');
      return;
    }
    await runTransition(scheduleTarget, 'schedule', new Date(timestamp).toISOString());
  }, [runTransition, scheduleTarget, scheduleValue]);

  const rollback = useCallback(async () => {
    if (!rollbackTarget || rollbackReason.trim().length < 5 || working) return;
    setWorking(true);
    try {
      await createRelationshipGistRollbackRevision(supabase as any, {
        editionId: rollbackTarget.edition_id,
        sourceRevisionId: rollbackTarget.revision_id,
        reason: rollbackReason.trim(),
      });
      setRollbackTarget(null);
      setRollbackReason('');
      await load();
    } catch (error) {
      Alert.alert('Rollback revision not created', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }, [load, rollbackReason, rollbackTarget, working]);

  const composerRevision = composer?.variantRevisionId
    ? revisions.find((revision) => revision.revision_id === composer.variantRevisionId)
    : null;
  const composerPerspectives = composerRevision
    ? RELATIONSHIP_GIST_PERSPECTIVES.filter((perspective) => (
      !composerRevision.perspectives.includes(perspective)
      && (perspective !== 'safety' || composerRevision.requires_safety_review)
    ))
    : [];

  return (
    <AdminScreenShell
      title="Editorial 2.0"
      subtitle="Immutable revisions with independent quality, safety and publication authority."
      capability="editorial"
      refreshing={loading}
      onRefresh={() => void load()}
    >
      <View style={styles.notice}>
        <MaterialCommunityIcons name="earth" size={20} color={theme.tint} />
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>Audience targeting is disabled</Text>
          <Text style={styles.noticeBody}>Every published Gist is global. No targeting control is shown until server enforcement exists.</Text>
        </View>
      </View>

      {permissions.canDraft ? (
        <TouchableOpacity style={styles.primaryButton} onPress={() => setComposer(EMPTY_COMPOSER)}>
          <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>New immutable edition</Text>
        </TouchableOpacity>
      ) : null}

      {RELATIONSHIP_GIST_AI_STUDIO_ENABLED ? (
        <RelationshipGistAIStudio permissions={permissions} onEditorialChanged={load} />
      ) : null}

      {revisions.map((revision) => {
        const actions = getRelationshipGistEditorialActions(revision, permissions);
        const scheduleInfo = formatRelationshipGistSchedule(revision.scheduled_for);
        return (
          <View key={revision.revision_id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.perspective}>{revision.perspective}</Text>
              <Text style={styles.status}>{revision.status.replace('_', ' ')}</Text>
            </View>
            <Text style={styles.title}>{revision.title}</Text>
            <Text style={styles.summary} numberOfLines={3}>{revision.short_body || revision.body}</Text>
            <Text style={styles.meta}>Revision {revision.revision_number} · server version {revision.lock_version}</Text>
            {revision.requires_safety_review ? (
              <Text style={styles.safety}>Safety approval required · {revision.safety_approved_at ? 'complete' : 'pending'}</Text>
            ) : null}
            <Text style={styles.meta}>Quality approval: {revision.quality_approved_at ? 'complete' : 'pending'}</Text>
            {scheduleInfo ? <Text style={styles.meta}>Scheduled: {scheduleInfo.local} · {scheduleInfo.iso}</Text> : null}
            <View style={styles.actions}>
              {permissions.canDraft ? (
                <Pressable style={styles.secondaryButton} onPress={() => setComposer({
                  variantRevisionId: null,
                  editionId: revision.edition_id,
                  sourceRevisionId: revision.revision_id,
                  title: revision.title,
                  summary: revision.short_body ?? '',
                  body: revision.body,
                  perspective: revision.perspective,
                  requiresSafetyReview: revision.requires_safety_review,
                })}>
                  <Text style={styles.secondaryButtonText}>New revision</Text>
                </Pressable>
              ) : null}
              {permissions.canDraft && revision.status === 'draft' && revision.perspectives.length < RELATIONSHIP_GIST_PERSPECTIVES.length ? (
                <Pressable style={styles.secondaryButton} onPress={() => {
                  const available = RELATIONSHIP_GIST_PERSPECTIVES.filter((perspective) => (
                    !revision.perspectives.includes(perspective)
                    && (perspective !== 'safety' || revision.requires_safety_review)
                  ));
                  if (!available.length) {
                    Alert.alert('Perspective variant', 'Create a safety-reviewed revision before adding a Safety variant.');
                    return;
                  }
                  setComposer({
                    variantRevisionId: revision.revision_id,
                    editionId: revision.edition_id,
                    sourceRevisionId: revision.revision_id,
                    title: '',
                    summary: '',
                    body: '',
                    perspective: available[0],
                    requiresSafetyReview: revision.requires_safety_review,
                  });
                }}>
                  <Text style={styles.secondaryButtonText}>Add perspective</Text>
                </Pressable>
              ) : null}
              {actions.map((action) => (
                <Pressable key={action} style={styles.secondaryButton} onPress={() => requestAction(revision, action)}>
                  <Text style={styles.secondaryButtonText}>{ACTION_LABELS[action]}</Text>
                </Pressable>
              ))}
              {permissions.canDraft && ['published', 'superseded', 'unpublished'].includes(revision.status) ? (
                <Pressable style={styles.secondaryButton} onPress={() => setRollbackTarget(revision)}>
                  <Text style={styles.secondaryButtonText}>Rollback as new revision</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}

      <Modal visible={composer != null} transparent animationType="fade" onRequestClose={() => setComposer(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{composer?.variantRevisionId ? 'Add perspective variant' : composer?.editionId ? 'Create new revision' : 'Create edition'}</Text>
              <TextInput style={styles.input} placeholder="Title" placeholderTextColor={theme.textMuted} value={composer?.title ?? ''} onChangeText={(value) => setComposer((state) => state ? { ...state, title: value } : state)} />
              <TextInput style={styles.input} placeholder="Card summary" placeholderTextColor={theme.textMuted} value={composer?.summary ?? ''} onChangeText={(value) => setComposer((state) => state ? { ...state, summary: value } : state)} />
              <TextInput style={[styles.input, styles.bodyInput]} multiline placeholder="Full guidance" placeholderTextColor={theme.textMuted} value={composer?.body ?? ''} onChangeText={(value) => setComposer((state) => state ? { ...state, body: value } : state)} />
              <View style={styles.actions}>
                {(composer?.variantRevisionId ? composerPerspectives : RELATIONSHIP_GIST_PERSPECTIVES).map((item) => (
                  <Pressable key={item} style={[styles.perspectiveButton, composer?.perspective === item && styles.perspectiveButtonActive]} onPress={() => setComposer((state) => state ? { ...state, perspective: item, requiresSafetyReview: state.requiresSafetyReview || item === 'safety' } : state)}>
                    <Text style={styles.secondaryButtonText}>{item}</Text>
                  </Pressable>
                ))}
              </View>
              {!composer?.variantRevisionId ? (
                <Pressable style={styles.secondaryButton} onPress={() => setComposer((state) => state ? { ...state, requiresSafetyReview: !state.requiresSafetyReview } : state)}>
                  <Text style={styles.secondaryButtonText}>{composer?.requiresSafetyReview ? 'Sensitive: safety review required' : 'Mark as sensitive'}</Text>
                </Pressable>
              ) : null}
              <View style={styles.modalActions}>
                <Pressable style={styles.secondaryButton} onPress={() => setComposer(null)}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
                <Pressable style={styles.primaryButton} onPress={() => void saveRevision()}><Text style={styles.primaryButtonText}>{working ? 'Saving…' : composer?.variantRevisionId ? 'Add variant' : 'Create revision'}</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={scheduleTarget != null} transparent animationType="fade" onRequestClose={() => setScheduleTarget(null)}>
        <View style={styles.overlay}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Schedule with timezone</Text>
          <Text style={styles.noticeBody}>Use ISO 8601, for example 2026-10-12T18:00:00+01:00.</Text>
          <TextInput style={styles.input} autoCapitalize="none" value={scheduleValue} onChangeText={setScheduleValue} placeholder="YYYY-MM-DDTHH:mm:ss+01:00" placeholderTextColor={theme.textMuted} />
          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={() => setScheduleTarget(null)}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
            <Pressable style={styles.primaryButton} onPress={() => void schedule()}><Text style={styles.primaryButtonText}>Schedule</Text></Pressable>
          </View>
        </View></View>
      </Modal>

      <Modal visible={rollbackTarget != null} transparent animationType="fade" onRequestClose={() => setRollbackTarget(null)}>
        <View style={styles.overlay}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Rollback by new revision</Text>
          <Text style={styles.noticeBody}>The published record remains immutable. A new draft will copy this revision.</Text>
          <TextInput style={styles.input} value={rollbackReason} onChangeText={setRollbackReason} placeholder="Reason for rollback" placeholderTextColor={theme.textMuted} />
          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={() => setRollbackTarget(null)}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
            <Pressable style={styles.primaryButton} onPress={() => void rollback()}><Text style={styles.primaryButtonText}>Create draft</Text></Pressable>
          </View>
        </View></View>
      </Modal>
    </AdminScreenShell>
  );
}

const createStyles = (theme: (typeof Colors)[keyof typeof Colors]) => StyleSheet.create({
  notice: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 18, backgroundColor: theme.backgroundSubtle, borderWidth: 1, borderColor: theme.outline, marginBottom: 14 },
  noticeCopy: { flex: 1, gap: 4 },
  noticeTitle: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 15 },
  noticeBody: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 13, lineHeight: 19 },
  card: { padding: 18, borderRadius: 20, backgroundColor: theme.backgroundSubtle, borderWidth: 1, borderColor: theme.outline, marginBottom: 14, gap: 7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  perspective: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7 },
  status: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 11, textTransform: 'uppercase' },
  title: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 25 },
  summary: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 14, lineHeight: 20 },
  meta: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 11, lineHeight: 16 },
  safety: { color: theme.accent, fontFamily: 'Archivo_700Bold', fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  primaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: theme.tint, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 14 },
  primaryButtonText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 12 },
  secondaryButton: { minHeight: 38, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: theme.outline, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 11, textTransform: 'capitalize' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', padding: 20 },
  modalCard: { maxHeight: '88%', borderRadius: 22, padding: 18, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.outline, gap: 12 },
  modalTitle: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 27, marginBottom: 10 },
  input: { minHeight: 48, borderWidth: 1, borderColor: theme.outline, borderRadius: 14, paddingHorizontal: 14, color: theme.text, backgroundColor: theme.backgroundSubtle, fontFamily: 'Archivo_400Regular', marginBottom: 10 },
  bodyInput: { minHeight: 170, paddingTop: 14, textAlignVertical: 'top' },
  perspectiveButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: theme.outline, alignItems: 'center', justifyContent: 'center' },
  perspectiveButtonActive: { borderColor: theme.tint, backgroundColor: theme.backgroundSubtle },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
});
