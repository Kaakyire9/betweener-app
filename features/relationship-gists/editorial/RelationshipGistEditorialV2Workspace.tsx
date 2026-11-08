import { AdminScreenShell } from '@/components/admin/AdminScreenShell';
import { Colors } from '@/constants/theme';
import { RelationshipGistAIStudio } from '@/features/relationship-gists/ai/RelationshipGistAIStudio';
import { relationshipGistAIErrorMessage } from '@/features/relationship-gists/ai/relationship-gist-ai-errors';
import {
  createRelationshipGistAIRevisionTopic,
  generateRelationshipGistAIDraft,
} from '@/features/relationship-gists/ai/relationship-gist-ai-repository';
import { RELATIONSHIP_GIST_AI_STUDIO_ENABLED } from '@/features/relationship-gists/config/relationship-gist-ai-flags';
import { RELATIONSHIP_GIST_PERSPECTIVES } from '@/features/relationship-gists/domain/relationship-gist';
import {
  addRelationshipGistRevisionVariant,
  createRelationshipGistRevision,
  createRelationshipGistRollbackRevision,
  fetchRelationshipGistEditorialRevisions,
  publishRelationshipGistOwnerReview,
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
import { RelationshipGistManualCoverField } from '@/features/relationship-gists/editorial/RelationshipGistManualCoverField';
import {
  uploadRelationshipGistManualCover,
  type RelationshipGistManualCoverDraft,
} from '@/features/relationship-gists/editorial/relationship-gist-manual-cover';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
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
  cover: RelationshipGistManualCoverDraft | null;
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
  cover: null,
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
  const [coverTarget, setCoverTarget] = useState<RelationshipGistEditorialRevision | null>(null);
  const [coverDraft, setCoverDraft] = useState<RelationshipGistManualCoverDraft | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [aiRevisionTarget, setAIRevisionTarget] = useState<RelationshipGistEditorialRevision | null>(null);
  const [aiRevisionInstruction, setAIRevisionInstruction] = useState('');
  const [aiRefreshToken, setAIRefreshToken] = useState(0);

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

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    void load();
  }, [load]);

  const saveRevision = useCallback(async () => {
    if (!composer || !permissions.canDraft || working) return;
    if (composer.title.trim().length < 3 || composer.body.trim().length < 20) {
      Alert.alert('Revision', 'Add a clear title and at least 20 characters of guidance.');
      return;
    }
    if (composer.cover && composer.cover.altText.trim().length < 10) {
      Alert.alert('Cover image', 'Describe the image in at least 10 characters for members using screen readers.');
      return;
    }
    setWorking(true);
    let revisionSaved = false;
    try {
      let result: Record<string, unknown>;
      if (composer.variantRevisionId) {
        result = await addRelationshipGistRevisionVariant(supabase as any, {
          revisionId: composer.variantRevisionId,
          title: composer.title.trim(),
          shortBody: composer.summary.trim() || null,
          body: composer.body.trim(),
          perspective: composer.perspective,
        });
      } else {
        result = await createRelationshipGistRevision(supabase as any, {
          editionId: composer.editionId,
          sourceRevisionId: composer.sourceRevisionId,
          title: composer.title.trim(),
          shortBody: composer.summary.trim() || null,
          body: composer.body.trim(),
          perspective: composer.perspective,
          requiresSafetyReview: composer.requiresSafetyReview || composer.perspective === 'safety',
        });
      }
      revisionSaved = true;
      const revisionId = String(result.revision_id ?? '');
      if (composer.cover && revisionId) {
        await uploadRelationshipGistManualCover({
          revisionId,
          perspective: composer.perspective,
          cover: composer.cover,
        });
      }
      setComposer(null);
      await load();
    } catch (error) {
      if (revisionSaved) {
        setComposer(null);
        await load();
        Alert.alert(
          'Gist saved without its cover',
          `${error instanceof Error ? error.message : 'The image could not be uploaded.'} Add the cover from the saved revision and try again.`,
        );
      } else {
        Alert.alert('Revision not saved', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setWorking(false);
    }
  }, [composer, load, permissions.canDraft, working]);

  const saveCover = useCallback(async () => {
    if (!coverTarget || !coverDraft || working) return;
    if (coverDraft.altText.trim().length < 10) {
      Alert.alert('Cover image', 'Describe the image in at least 10 characters for members using screen readers.');
      return;
    }
    setWorking(true);
    try {
      await uploadRelationshipGistManualCover({
        revisionId: coverTarget.revision_id,
        perspective: coverTarget.perspective,
        cover: coverDraft,
      });
      setCoverTarget(null);
      setCoverDraft(null);
      await load();
    } catch (error) {
      Alert.alert('Cover not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }, [coverDraft, coverTarget, load, working]);

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

  const ownerReview = permissions.canDraft
    && permissions.canQualityApprove
    && permissions.canSafetyReview
    && permissions.canPublish
    && permissions.canArchive;

  const publishManualRevision = useCallback((revision: RelationshipGistEditorialRevision) => {
    Alert.alert(
      'Review and publish?',
      revision.requires_safety_review
        ? 'Confirm that you reviewed the copy, checked its safety implications, and accept publishing responsibility.'
        : 'Confirm that you reviewed this Gist and accept publishing responsibility.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Review complete — publish',
          onPress: () => void (async () => {
            if (working) return;
            setWorking(true);
            try {
              await publishRelationshipGistOwnerReview(supabase as any, {
                revisionId: revision.revision_id,
                safetyAcknowledged: revision.requires_safety_review,
              });
              await load();
            } catch (error) {
              Alert.alert('Publishing blocked', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setWorking(false);
            }
          })(),
        },
      ],
    );
  }, [load, working]);

  const reviseWithAI = useCallback(async () => {
    if (!aiRevisionTarget || aiRevisionInstruction.trim().length < 10 || working) return;
    setWorking(true);
    try {
      const topic = await createRelationshipGistAIRevisionTopic(
        supabase as any,
        aiRevisionTarget.revision_id,
        aiRevisionInstruction.trim(),
      );
      await generateRelationshipGistAIDraft(supabase as any, topic.topic_id, Crypto.randomUUID());
      setAIRevisionTarget(null);
      setAIRevisionInstruction('');
      setAIRefreshToken((value) => value + 1);
      await load();
      Alert.alert(
        'AI revision ready',
        'A new draft revision was created. The published Gist remains unchanged until you review and publish it.',
      );
    } catch (error) {
      setAIRefreshToken((value) => value + 1);
      Alert.alert(
        'AI revision not created',
        relationshipGistAIErrorMessage(error, 'Please try again.'),
      );
    } finally {
      setWorking(false);
    }
  }, [aiRevisionInstruction, aiRevisionTarget, load, working]);

  const composerRevision = composer?.variantRevisionId
    ? revisions.find((revision) => revision.revision_id === composer.variantRevisionId)
    : null;
  const composerPerspectives = composerRevision
    ? RELATIONSHIP_GIST_PERSPECTIVES.filter((perspective) => (
      !composerRevision.perspectives.includes(perspective)
      && (perspective !== 'safety' || composerRevision.requires_safety_review)
    ))
    : [];
  const activeStatuses = ['draft', 'in_review', 'approved', 'scheduled'];
  const activeManualRevisions = revisions.filter((revision) => (
    activeStatuses.includes(revision.status) && !revision.ai_generated
  ));
  const publishedRevisions = revisions.filter((revision) => revision.status === 'published');
  const historicalRevisions = revisions.filter((revision) => (
    !activeStatuses.includes(revision.status) && revision.status !== 'published'
  ));

  const renderRevisionCard = (revision: RelationshipGistEditorialRevision, compact = false) => {
    const canOwnerPublishManual = ownerReview
      && !revision.ai_generated
      && revision.authored_by_user_id === currentUserId
      && ['draft', 'in_review', 'approved'].includes(revision.status);
    const actions = canOwnerPublishManual ? [] : getRelationshipGistEditorialActions(revision, permissions);
    const scheduleInfo = formatRelationshipGistSchedule(revision.scheduled_for);
    return (
      <View key={revision.revision_id} style={[styles.card, compact && styles.compactCard]}>
        <View style={styles.cardHeader}>
          <Text style={styles.perspective}>{revision.perspective}</Text>
          <Text style={styles.status}>{revision.status.replace('_', ' ')}</Text>
        </View>
        <Text style={styles.title}>{revision.title}</Text>
        <Text style={styles.summary} numberOfLines={compact ? 2 : 3}>{revision.short_body || revision.body}</Text>
        <Text style={styles.meta}>Revision {revision.revision_number} · server version {revision.lock_version}</Text>
        {!compact && revision.requires_safety_review ? (
          <Text style={styles.safety}>Safety review required · {revision.safety_approved_at ? 'complete' : 'confirm when publishing'}</Text>
        ) : null}
        {!compact && !canOwnerPublishManual ? (
          <Text style={styles.meta}>Quality approval: {revision.quality_approved_at ? 'complete' : 'pending'}</Text>
        ) : null}
        {scheduleInfo ? <Text style={styles.meta}>Scheduled: {scheduleInfo.local} · {scheduleInfo.iso}</Text> : null}
        <View style={styles.actions}>
          {compact && revision.status === 'published' ? (
            <Pressable style={styles.secondaryButton} onPress={() => router.push(`/gists/${revision.legacy_gist_id}`)}>
              <Text style={styles.secondaryButtonText}>View live</Text>
            </Pressable>
          ) : null}
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
              cover: null,
            })}>
              <Text style={styles.secondaryButtonText}>New revision</Text>
            </Pressable>
          ) : null}
          {compact && revision.status === 'published' && ownerReview && RELATIONSHIP_GIST_AI_STUDIO_ENABLED ? (
            <Pressable style={styles.secondaryButton} onPress={() => {
              setAIRevisionTarget(revision);
              setAIRevisionInstruction('');
            }}>
              <Text style={styles.secondaryButtonText}>Revise with AI</Text>
            </Pressable>
          ) : null}
          {!compact && permissions.canDraft && revision.status === 'draft' && revision.perspectives.length < RELATIONSHIP_GIST_PERSPECTIVES.length ? (
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
                title: '', summary: '', body: '', perspective: available[0],
                requiresSafetyReview: revision.requires_safety_review, cover: null,
              });
            }}>
              <Text style={styles.secondaryButtonText}>Add perspective</Text>
            </Pressable>
          ) : null}
          {canOwnerPublishManual ? (
            <Pressable style={styles.primaryInlineButton} onPress={() => publishManualRevision(revision)}>
              <Text style={styles.primaryButtonText}>Review & publish</Text>
            </Pressable>
          ) : actions.map((action) => (
            <Pressable key={action} style={styles.secondaryButton} onPress={() => requestAction(revision, action)}>
              <Text style={styles.secondaryButtonText}>{ACTION_LABELS[action]}</Text>
            </Pressable>
          ))}
          {!compact && permissions.canDraft && permissions.canQualityApprove && ['draft', 'in_review'].includes(revision.status) ? (
            <Pressable style={styles.secondaryButton} onPress={() => { setCoverTarget(revision); setCoverDraft(null); }}>
              <Text style={styles.secondaryButtonText}>Add or replace cover</Text>
            </Pressable>
          ) : null}
          {!compact && permissions.canDraft && ['superseded', 'unpublished'].includes(revision.status) ? (
            <Pressable style={styles.secondaryButton} onPress={() => setRollbackTarget(revision)}>
              <Text style={styles.secondaryButtonText}>Rollback as new revision</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <AdminScreenShell
      title="Relationship Gist Studio"
      subtitle="Human editorial workflow with AI-assisted drafting and imagery when enabled."
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
          <Text style={styles.primaryButtonText}>Create Gist</Text>
        </TouchableOpacity>
      ) : null}

      {RELATIONSHIP_GIST_AI_STUDIO_ENABLED ? (
        <RelationshipGistAIStudio
          permissions={permissions}
          onEditorialChanged={load}
          refreshToken={aiRefreshToken}
        />
      ) : null}

      {activeManualRevisions.length ? <Text style={styles.sectionTitle}>Needs your attention</Text> : null}
      {activeManualRevisions.map((revision) => renderRevisionCard(revision))}

      {publishedRevisions.length ? <Text style={styles.sectionTitle}>Published Gists</Text> : null}
      {publishedRevisions.map((revision) => renderRevisionCard(revision, true))}

      {historicalRevisions.length ? (
        <Pressable style={styles.historyToggle} onPress={() => setHistoryExpanded((value) => !value)}>
          <Text style={styles.sectionTitle}>History ({historicalRevisions.length})</Text>
          <MaterialCommunityIcons name={historyExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={theme.textMuted} />
        </Pressable>
      ) : null}
      {historyExpanded ? historicalRevisions.map((revision) => renderRevisionCard(revision, true)) : null}

      <Modal visible={aiRevisionTarget != null} transparent animationType="fade" onRequestClose={() => setAIRevisionTarget(null)}>
        <View style={styles.overlay}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Revise with AI</Text>
          <Text style={styles.noticeBody}>Describe the change you want. AI creates a new immutable draft; “{aiRevisionTarget?.title}” stays published until you approve its replacement.</Text>
          <TextInput
            style={[styles.input, styles.revisionInstruction]}
            multiline
            value={aiRevisionInstruction}
            onChangeText={setAIRevisionInstruction}
            placeholder="For example: shorten the guidance, make it warmer, and keep the practical takeaway."
            placeholderTextColor={theme.textMuted}
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={() => setAIRevisionTarget(null)}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
            <Pressable disabled={aiRevisionInstruction.trim().length < 10 || working} style={[styles.primaryInlineButton, (aiRevisionInstruction.trim().length < 10 || working) && styles.disabledButton]} onPress={() => void reviseWithAI()}>
              <Text style={styles.primaryButtonText}>{working ? 'Creating…' : 'Create AI revision'}</Text>
            </Pressable>
          </View>
        </View></View>
      </Modal>

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
              {permissions.canDraft && permissions.canQualityApprove ? (
                <RelationshipGistManualCoverField
                  value={composer?.cover ?? null}
                  onChange={(cover) => setComposer((state) => state ? { ...state, cover } : state)}
                  disabled={working}
                />
              ) : null}
              <View style={styles.modalActions}>
                <Pressable style={styles.secondaryButton} onPress={() => setComposer(null)}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
                <Pressable style={styles.primaryButton} onPress={() => void saveRevision()}><Text style={styles.primaryButtonText}>{working ? 'Saving…' : composer?.variantRevisionId ? 'Add variant' : 'Create revision'}</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={coverTarget != null} transparent animationType="fade" onRequestClose={() => setCoverTarget(null)}>
        <View style={styles.overlay}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Editorial cover</Text>
          <Text style={styles.noticeBody}>Add a human-selected cover for “{coverTarget?.title}”. The previous approved cover will be superseded.</Text>
          <RelationshipGistManualCoverField value={coverDraft} onChange={setCoverDraft} disabled={working} />
          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={() => { setCoverTarget(null); setCoverDraft(null); }}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
            <Pressable disabled={!coverDraft || working} style={[styles.primaryButton, (!coverDraft || working) && styles.disabledButton]} onPress={() => void saveCover()}><Text style={styles.primaryButtonText}>{working ? 'Uploading…' : 'Use this image'}</Text></Pressable>
          </View>
        </View></View>
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
  compactCard: { paddingVertical: 15 },
  sectionTitle: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 24, marginTop: 12, marginBottom: 10 },
  historyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  perspective: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7 },
  status: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 11, textTransform: 'uppercase' },
  title: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 25 },
  summary: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 14, lineHeight: 20 },
  meta: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 11, lineHeight: 16 },
  safety: { color: theme.accent, fontFamily: 'Archivo_700Bold', fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  primaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: theme.tint, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 14 },
  primaryInlineButton: { minHeight: 38, paddingHorizontal: 13, borderRadius: 12, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 12 },
  secondaryButton: { minHeight: 38, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: theme.outline, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 11, textTransform: 'capitalize' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', padding: 20 },
  modalCard: { maxHeight: '88%', borderRadius: 22, padding: 18, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.outline, gap: 12 },
  modalTitle: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 27, marginBottom: 10 },
  input: { minHeight: 48, borderWidth: 1, borderColor: theme.outline, borderRadius: 14, paddingHorizontal: 14, color: theme.text, backgroundColor: theme.backgroundSubtle, fontFamily: 'Archivo_400Regular', marginBottom: 10 },
  bodyInput: { minHeight: 170, paddingTop: 14, textAlignVertical: 'top' },
  revisionInstruction: { minHeight: 120, paddingTop: 14, textAlignVertical: 'top' },
  perspectiveButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: theme.outline, alignItems: 'center', justifyContent: 'center' },
  perspectiveButtonActive: { borderColor: theme.tint, backgroundColor: theme.backgroundSubtle },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  disabledButton: { opacity: 0.55 },
});
