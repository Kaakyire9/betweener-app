import { Colors } from '@/constants/theme';
import {
  relationshipGistAIErrorMessage,
  relationshipGistAIJobFailureMessage,
} from '@/features/relationship-gists/ai/relationship-gist-ai-errors';
import { RelationshipGistAIImagePanel } from '@/features/relationship-gists/ai/RelationshipGistAIImagePanel';
import { RELATIONSHIP_GIST_PERSPECTIVES } from '@/features/relationship-gists/domain/relationship-gist';
import {
  approveRelationshipGistAISpecialistReview,
  approveRelationshipGistAITopic,
  attestRelationshipGistAIClaims,
  createRelationshipGistAITopic,
  fetchRelationshipGistAIImageStudio,
  fetchRelationshipGistAIReviewQueue,
  fetchRelationshipGistAIStudio,
  generateRelationshipGistAIDraft,
  ownerAcknowledgeRelationshipGistAISpecialistReview,
  ownerAttestRelationshipGistAIClaims,
  ownerReviewRelationshipGistAISource,
  prepareRelationshipGistAIOwnerTopic,
  publishRelationshipGistAIOwnerReview,
  rejectRelationshipGistAIDraft,
  reviewRelationshipGistAISource,
  type RelationshipGistAIReviewItem,
  type RelationshipGistAIImageStudioSnapshot,
  type RelationshipGistAIStudioSnapshot,
} from '@/features/relationship-gists/ai/relationship-gist-ai-repository';
import type { RelationshipGistEditorialPermissions } from '@/features/relationship-gists/editorial/relationship-gist-editorial-permissions';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type TopicDraft = {
  key: string;
  title: string;
  brief: string;
  perspective: string;
  plannedFor: string;
};

const emptyTopic = (): TopicDraft => ({
  key: '',
  title: '',
  brief: '',
  perspective: 'general',
  plannedFor: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
});

export function RelationshipGistAIStudio({
  permissions,
  onEditorialChanged,
  refreshToken = 0,
}: {
  permissions: RelationshipGistEditorialPermissions;
  onEditorialChanged: () => Promise<void>;
  refreshToken?: number;
}) {
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'light') === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [snapshot, setSnapshot] = useState<RelationshipGistAIStudioSnapshot | null>(null);
  const [reviews, setReviews] = useState<RelationshipGistAIReviewItem[]>([]);
  const [imageStudio, setImageStudio] = useState<RelationshipGistAIImageStudioSnapshot>({ jobs: [], images: [] });
  const [imageBackendAvailable, setImageBackendAvailable] = useState(false);
  const [topicDraft, setTopicDraft] = useState<TopicDraft | null>(null);
  const [working, setWorking] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null | undefined>(undefined);
  const ownerReview = permissions.canDraft
    && permissions.canQualityApprove
    && permissions.canSafetyReview
    && permissions.canPublish
    && permissions.canArchive;

  const load = useCallback(async () => {
    const [studio, queue, imageryResult] = await Promise.all([
      fetchRelationshipGistAIStudio(supabase as any),
      fetchRelationshipGistAIReviewQueue(supabase as any),
      fetchRelationshipGistAIImageStudio(supabase as any)
        .then((value) => ({ value, error: null }))
        .catch((error) => ({ value: { jobs: [], images: [] } as RelationshipGistAIImageStudioSnapshot, error })),
    ]);
    setSnapshot(studio);
    setReviews(queue);
    setImageStudio(imageryResult.value);
    setImageBackendAvailable(!imageryResult.error);
    if (imageryResult.error) {
      logger.warn('[relationship-gist] ai_image_studio_unavailable', {
        code: String((imageryResult.error as any)?.code ?? 'unknown'),
      });
    }
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    void load().catch((error) => {
      Alert.alert('AI Editorial Studio', relationshipGistAIErrorMessage(error, 'Unable to load AI editorial state.'));
    });
  }, [load, refreshToken]);

  const run = useCallback(async (operation: () => Promise<unknown>) => {
    if (working) return;
    setWorking(true);
    try {
      await operation();
      await Promise.all([load(), onEditorialChanged()]);
    } catch (error) {
      await load().catch(() => undefined);
      Alert.alert('AI Editorial Studio', relationshipGistAIErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }, [load, onEditorialChanged, working]);

  const createTopic = useCallback(async () => {
    if (!topicDraft) return;
    if (topicDraft.title.trim().length < 3 || topicDraft.brief.trim().length < 20) {
      Alert.alert('Editorial topic', 'Add a title and a clear brief of at least 20 characters.');
      return;
    }
    const topicKey = (topicDraft.key.trim() || topicDraft.title.trim())
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96);
    if (topicKey.length < 3) {
      Alert.alert('Editorial topic', 'Add a topic key with at least three letters or numbers.');
      return;
    }
    await run(() => createRelationshipGistAITopic(supabase as any, {
      topicKey,
      title: topicDraft.title.trim(),
      brief: topicDraft.brief.trim(),
      perspective: topicDraft.perspective,
      plannedFor: topicDraft.plannedFor,
    }));
    setTopicDraft(null);
  }, [run, topicDraft]);

  const generateFromBrief = useCallback(async (topicId: string, status: string) => {
    await run(async () => {
      if (status === 'draft') {
        await prepareRelationshipGistAIOwnerTopic(supabase as any, topicId);
      }
      await generateRelationshipGistAIDraft(supabase as any, topicId, Crypto.randomUUID());
    });
  }, [run]);

  const confirmOwnerPublish = useCallback((revisionId: string, title: string) => {
    Alert.alert(
      'Publish this Gist?',
      `You are confirming that you reviewed “${title}”, resolved every source, checked its claims and completed each safety acknowledgement.`,
      [
        { text: 'Keep reviewing', style: 'cancel' },
        {
          text: 'Review complete — publish',
          onPress: () => void run(() => publishRelationshipGistAIOwnerReview(
            supabase as any,
            revisionId,
          )),
        },
      ],
    );
  }, [run]);

  if (!snapshot) return <Text style={styles.muted}>Loading AI Editorial Studio…</Text>;
  const activeTopics = snapshot.topics.filter((topic) => ['draft', 'approved'].includes(topic.status));
  const activeReviews = reviews.filter((review) => ['draft', 'in_review', 'approved'].includes(review.status));
  const jobSummary = snapshot.job_summary ?? {
    active_count: snapshot.jobs.filter((job) => ['queued', 'processing'].includes(job.status)).length,
    unresolved_failure_count: snapshot.jobs.filter((job) => job.status === 'failed').length,
    today_completed_count: 0,
    today_estimated_cost_microusd: 0,
  };
  const estimatedCost = `$${(Number(jobSummary.today_estimated_cost_microusd || 0) / 1_000_000).toFixed(4)}`;

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>AI-ASSISTED DRAFTING</Text>
          <Text style={styles.heading}>Editorial Studio</Text>
          <Text style={styles.muted}>Write the brief, let AI create a draft, then review and publish it yourself.</Text>
        </View>
        {permissions.canDraft ? (
          <TouchableOpacity style={styles.primaryButton} onPress={() => setTopicDraft(emptyTopic())}>
            <Text style={styles.primaryText}>New brief</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.warning}>
        <MaterialCommunityIcons name="alert-decagram-outline" size={19} color={theme.accent} />
        <Text style={styles.warningText}>AI suggestions are not verified citations. You must verify or reject every source and confirm the safety checks before publishing.</Text>
      </View>

      <Text style={styles.meta}>Environment: {snapshot.environment ?? 'not configured'} · server policy {snapshot.enabled ? 'enabled' : 'disabled'}</Text>

      {activeTopics.map((topic) => (
        <View key={topic.id} style={styles.card}>
          <Text style={styles.eyebrow}>EDITORIAL BRIEF · INSTRUCTIONS FOR AI</Text>
          <View style={styles.headingRow}>
            <Text style={styles.cardTitle}>{topic.topic_title}</Text>
            <Text style={styles.status}>{topic.status === 'draft' ? 'READY' : topic.status}</Text>
          </View>
          <Text style={styles.muted} numberOfLines={5}>{topic.topic_brief}</Text>
          <Text style={styles.meta}>This is your prompt—not AI-generated copy.</Text>
          <Text style={styles.meta}>{topic.requested_perspective} · planned {topic.planned_for}</Text>
          <View style={styles.actions}>
            {topic.status === 'draft'
              && !ownerReview
              && permissions.canQualityApprove
              && typeof currentUserId === 'string'
              && topic.created_by_user_id !== currentUserId ? (
              <Pressable style={styles.secondaryButton} onPress={() => void run(() => approveRelationshipGistAITopic(supabase as any, topic.id))}>
                <Text style={styles.secondaryText}>Approve brief</Text>
              </Pressable>
            ) : null}
            {['draft', 'approved'].includes(topic.status) && permissions.canDraft
              && (topic.status === 'approved' || (ownerReview && topic.created_by_user_id === currentUserId)) ? (
              <Pressable style={styles.primaryButton} onPress={() => void generateFromBrief(topic.id, topic.status)}>
                <Text style={styles.primaryText}>Generate AI draft</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}

      {activeReviews.map((review) => {
        const sourcesReady = review.sources.every((source) => source.verification_status !== 'unverified');
        const specialistChecksReady = review.specialist_reviews.every((item) => item.approved_at != null);
        const imageryReady = !imageStudio.images.some((image) => (
          image.revision_id === review.revision_id && image.status === 'generated'
        ));
        const readyToPublish = ownerReview
          && review.claims_verified_at != null
          && sourcesReady
          && specialistChecksReady
          && imageryReady
          && ['draft', 'in_review', 'approved'].includes(review.status);
        return (
        <View key={review.revision_id} style={styles.reviewCard}>
          <View style={styles.headingRow}>
            <Text style={styles.cardTitle}>{review.title}</Text>
            <Text style={styles.status}>AI DRAFT · {review.status}</Text>
          </View>
          <Text style={styles.muted}>{review.summary}</Text>
          <Text style={styles.body}>{review.body}</Text>
          <Text style={styles.callout}>Takeaway: {review.takeaway}</Text>
          <Text style={styles.callout}>Discussion prompt: {review.discussion_prompt}</Text>
          <Text style={styles.meta}>Safety: {review.safety_level} · {review.sensitive_topics.join(', ') || 'no sensitive topic declared'}</Text>
          <Text style={styles.muted}>{review.safety_rationale}</Text>

          <RelationshipGistAIImagePanel
            review={review}
            images={imageStudio.images}
            jobs={imageStudio.jobs}
            permissions={permissions}
            run={run}
            available={imageBackendAvailable}
            ownerReview={ownerReview}
          />

          {review.sources.map((source) => (
            <View key={source.id} style={styles.source}>
              <View style={styles.headingRow}>
                <Text style={styles.sourceTitle}>{source.title}</Text>
                <Text style={[styles.status, source.verification_status === 'unverified' && styles.unverified]}>{source.verification_status}</Text>
              </View>
              <Text style={styles.meta}>{source.publisher} · {source.url}</Text>
              <Text style={styles.muted}>{source.why_suggested}</Text>
              {permissions.canQualityApprove && source.verification_status === 'unverified' ? (
                <View style={styles.actions}>
                  <Pressable style={styles.secondaryButton} onPress={() => void run(() => (
                    ownerReview ? ownerReviewRelationshipGistAISource : reviewRelationshipGistAISource
                  )(supabase as any, source.id, 'verified'))}>
                    <Text style={styles.secondaryText}>Mark verified</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={() => void run(() => (
                    ownerReview ? ownerReviewRelationshipGistAISource : reviewRelationshipGistAISource
                  )(supabase as any, source.id, 'rejected'))}>
                    <Text style={styles.secondaryText}>Reject source</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}

          {review.specialist_reviews.map((specialist) => (
            <View key={specialist.review_type} style={styles.headingRow}>
              <Text style={styles.meta}>Safety check: {specialist.review_type} · {specialist.approved_at ? 'confirmed' : 'needs your confirmation'}</Text>
              {!specialist.approved_at && (review.can_specialist_approve || ownerReview) ? (
                <Pressable style={styles.secondaryButton} onPress={() => void run(() => (
                  ownerReview
                    ? ownerAcknowledgeRelationshipGistAISpecialistReview
                    : approveRelationshipGistAISpecialistReview
                )(supabase as any, review.revision_id, specialist.review_type))}>
                  <Text style={styles.secondaryText}>Confirm checked</Text>
                </Pressable>
              ) : null}
            </View>
          ))}

          <View style={styles.actions}>
            {permissions.canQualityApprove && !review.claims_verified_at ? (
              <Pressable style={styles.secondaryButton} onPress={() => void run(() => (
                ownerReview ? ownerAttestRelationshipGistAIClaims : attestRelationshipGistAIClaims
              )(supabase as any, review.revision_id))}>
                <Text style={styles.secondaryText}>Confirm claims checked</Text>
              </Pressable>
            ) : null}
            {permissions.canArchive && ['draft', 'in_review'].includes(review.status) ? (
              <Pressable style={styles.secondaryButton} onPress={() => Alert.alert('Reject AI draft', 'Archive this draft without publication?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reject', style: 'destructive', onPress: () => void run(() => rejectRelationshipGistAIDraft(supabase as any, review.revision_id, 'Rejected during human editorial review')) },
              ])}>
                <Text style={styles.secondaryText}>Reject draft</Text>
              </Pressable>
            ) : null}
          </View>
          {ownerReview ? (
            <View style={styles.ownerReviewPanel}>
              <Text style={styles.eyebrow}>YOUR PUBLISHING CHECKLIST</Text>
              <Text style={styles.checkItem}>{sourcesReady ? '✓' : '○'} Every source verified or rejected</Text>
              <Text style={styles.checkItem}>{review.claims_verified_at ? '✓' : '○'} Claims and wording checked</Text>
              <Text style={styles.checkItem}>{specialistChecksReady ? '✓' : '○'} Safety acknowledgements complete</Text>
              <Text style={styles.checkItem}>{imageryReady ? '✓' : '○'} Generated imagery approved or rejected</Text>
              <Pressable
                disabled={!readyToPublish || working}
                style={[styles.primaryButton, (!readyToPublish || working) && styles.disabledButton]}
                onPress={() => confirmOwnerPublish(review.revision_id, review.title)}
              >
                <Text style={styles.primaryText}>{readyToPublish ? 'Review complete — publish' : 'Complete checklist to publish'}</Text>
              </Pressable>
            </View>
          ) : null}
          <Text style={styles.meta}>To edit the copy first, use “New revision” below. AI provenance and the review checklist carry into the edited revision.</Text>
        </View>
        );
      })}

      <Pressable style={styles.activitySummary} onPress={() => setActivityExpanded((value) => !value)}>
        <View style={styles.headingCopy}>
          <Text style={styles.subheading}>AI activity</Text>
          <Text style={styles.meta}>
            {jobSummary.active_count} active · {jobSummary.unresolved_failure_count} need attention · {jobSummary.today_completed_count} completed today · {estimatedCost} today
          </Text>
        </View>
        <MaterialCommunityIcons name={activityExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={theme.textMuted} />
      </Pressable>
      {activityExpanded ? snapshot.jobs.map((job) => (
        <View key={job.id} style={styles.jobRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.sourceTitle}>{job.status}</Text>
            <Text style={styles.meta}>{job.model} · attempt {job.attempt_count} · {job.input_tokens ?? 0}+{job.output_tokens ?? 0} tokens</Text>
            {job.failure_code ? (
              <Text style={styles.failureText}>{relationshipGistAIJobFailureMessage(job.failure_code)}</Text>
            ) : null}
          </View>
          <Text style={styles.meta}>{job.estimated_cost_microusd == null
            ? job.status === 'failed' ? 'No billable usage recorded' : 'Cost pending'
            : `$${(job.estimated_cost_microusd / 1_000_000).toFixed(4)} estimated`}</Text>
        </View>
      )) : null}

      <Modal visible={topicDraft != null} transparent animationType="fade" onRequestClose={() => setTopicDraft(null)}>
        <View style={styles.overlay}><View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>New AI drafting brief</Text>
            <Text style={styles.muted}>This is an instruction for AI, not the finished Gist. After generation, you will review the actual copy before publishing.</Text>
            <TextInput style={styles.input} value={topicDraft?.key ?? ''} onChangeText={(key) => setTopicDraft((value) => value ? { ...value, key } : value)} placeholder="topic-key" placeholderTextColor={theme.textMuted} />
            <TextInput style={styles.input} value={topicDraft?.title ?? ''} onChangeText={(title) => setTopicDraft((value) => value ? { ...value, title } : value)} placeholder="Topic title" placeholderTextColor={theme.textMuted} />
            <TextInput multiline style={[styles.input, styles.brief]} value={topicDraft?.brief ?? ''} onChangeText={(brief) => setTopicDraft((value) => value ? { ...value, brief } : value)} placeholder="Editorial brief" placeholderTextColor={theme.textMuted} />
            <TextInput style={styles.input} value={topicDraft?.plannedFor ?? ''} onChangeText={(plannedFor) => setTopicDraft((value) => value ? { ...value, plannedFor } : value)} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textMuted} />
            <View style={styles.actions}>
              {RELATIONSHIP_GIST_PERSPECTIVES.map((perspective) => (
                <Pressable key={perspective} style={[styles.secondaryButton, topicDraft?.perspective === perspective && styles.selected]} onPress={() => setTopicDraft((value) => value ? { ...value, perspective } : value)}>
                  <Text style={styles.secondaryText}>{perspective}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.actions}>
              <Pressable style={styles.secondaryButton} onPress={() => setTopicDraft(null)}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
              <Pressable style={styles.primaryButton} onPress={() => void createTopic()}><Text style={styles.primaryText}>{working ? 'Saving…' : 'Save brief'}</Text></Pressable>
            </View>
          </ScrollView>
        </View></View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: (typeof Colors)[keyof typeof Colors]) => StyleSheet.create({
  section: { marginTop: 18, gap: 12 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 11, letterSpacing: 1.2 },
  heading: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 28 },
  subheading: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 22, marginTop: 8 },
  muted: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 12, lineHeight: 18 },
  body: { color: theme.text, fontFamily: 'Archivo_400Regular', fontSize: 13, lineHeight: 20 },
  meta: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 10, lineHeight: 15 },
  failureText: { color: theme.danger, fontFamily: 'Archivo_700Bold', fontSize: 10, lineHeight: 15 },
  warning: { flexDirection: 'row', gap: 9, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  warningText: { flex: 1, color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 11, lineHeight: 17 },
  card: { padding: 15, gap: 7, borderRadius: 16, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  reviewCard: { padding: 16, gap: 9, borderRadius: 18, borderWidth: 1, borderColor: theme.tint, backgroundColor: theme.backgroundSubtle },
  cardTitle: { flex: 1, color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 21 },
  status: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 9, textTransform: 'uppercase' },
  unverified: { color: theme.accent },
  callout: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 12, lineHeight: 18 },
  source: { padding: 12, gap: 5, borderRadius: 13, borderWidth: 1, borderColor: theme.outline },
  sourceTitle: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 12 },
  ownerReviewPanel: { gap: 7, marginTop: 6, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: theme.tint, backgroundColor: theme.background },
  checkItem: { color: theme.text, fontFamily: 'Archivo_400Regular', fontSize: 11, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  primaryButton: { minHeight: 38, paddingHorizontal: 13, borderRadius: 12, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 11 },
  secondaryButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: theme.outline, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 10, textTransform: 'capitalize' },
  selected: { borderColor: theme.tint, backgroundColor: theme.backgroundSubtle },
  disabledButton: { opacity: 0.45 },
  jobRow: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: theme.outline },
  activitySummary: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 20 },
  modalCard: { maxHeight: '88%', padding: 18, borderRadius: 20, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.outline },
  input: { minHeight: 46, marginTop: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.outline, color: theme.text, backgroundColor: theme.backgroundSubtle, fontFamily: 'Archivo_400Regular' },
  brief: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
});
