import {
  RELATIONSHIP_GIST_ANALYTICS_ENABLED,
  RELATIONSHIP_GIST_REACTIONS_ENABLED,
  RELATIONSHIP_GIST_REFLECTIONS_ENABLED,
} from '@/features/relationship-gists/config/relationship-gist-feature-flags';
import type {
  RelationshipGistEngagementSnapshot,
  RelationshipGistEngagementSource,
  RelationshipGistReaction,
  RelationshipGistReaderEventType,
} from '@/features/relationship-gists/engagement/relationship-gist-engagement';

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
};

const featureDisabled = () => Object.assign(new Error('relationship_gist_engagement_disabled'), {
  code: 'FEATURE_DISABLED',
});

const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

const parseSnapshot = (value: any): RelationshipGistEngagementSnapshot => ({
  gistId: String(value?.gist_id ?? ''),
  editionId: String(value?.edition_id ?? ''),
  revisionId: String(value?.revision_id ?? ''),
  reaction: value?.reaction ?? null,
  reactionRevisionId: value?.reaction_revision_id ?? null,
  reactionCounts: {
    helpful: count(value?.reaction_counts?.helpful),
    resonated: count(value?.reaction_counts?.resonated),
    made_me_think: count(value?.reaction_counts?.made_me_think),
  },
  reflection: value?.reflection ? {
    body: String(value.reflection.body ?? ''),
    revisionId: String(value.reflection.revision_id ?? ''),
    createdAt: String(value.reflection.created_at ?? ''),
    updatedAt: String(value.reflection.updated_at ?? ''),
  } : null,
});

export async function fetchRelationshipGistEngagement(client: RpcClient, gistId: string) {
  if (
    !RELATIONSHIP_GIST_REACTIONS_ENABLED
    && !RELATIONSHIP_GIST_REFLECTIONS_ENABLED
    && !RELATIONSHIP_GIST_ANALYTICS_ENABLED
  ) {
    throw featureDisabled();
  }
  const { data, error } = await client.rpc('rpc_get_relationship_gist_engagement', {
    p_gist_id: gistId,
  });
  if (error) throw error;
  return parseSnapshot(data);
}

export async function setRelationshipGistReaction(client: RpcClient, input: {
  operationId: string;
  ownerUserId: string;
  gistId: string;
  revisionId: string;
  reaction: RelationshipGistReaction | null;
  source: RelationshipGistEngagementSource;
}) {
  if (!RELATIONSHIP_GIST_REACTIONS_ENABLED) throw featureDisabled();
  const { data, error } = await client.rpc('rpc_set_relationship_gist_reaction', {
    p_operation_id: input.operationId,
    p_owner_user_id: input.ownerUserId,
    p_gist_id: input.gistId,
    p_revision_id: input.revisionId,
    p_reaction: input.reaction,
    p_source: input.source,
  });
  if (error) throw error;
  return data;
}

export async function upsertRelationshipGistReflection(client: RpcClient, input: {
  operationId: string;
  ownerUserId: string;
  gistId: string;
  revisionId: string;
  body: string;
  source: RelationshipGistEngagementSource;
}) {
  if (!RELATIONSHIP_GIST_REFLECTIONS_ENABLED) throw featureDisabled();
  const { data, error } = await client.rpc('rpc_upsert_relationship_gist_reflection', {
    p_operation_id: input.operationId,
    p_owner_user_id: input.ownerUserId,
    p_gist_id: input.gistId,
    p_revision_id: input.revisionId,
    p_body: input.body,
    p_source: input.source,
  });
  if (error) throw error;
  return data;
}

export async function deleteRelationshipGistReflection(client: RpcClient, input: {
  operationId: string;
  ownerUserId: string;
  gistId: string;
  revisionId: string;
  source: RelationshipGistEngagementSource;
}) {
  if (!RELATIONSHIP_GIST_REFLECTIONS_ENABLED) throw featureDisabled();
  const { data, error } = await client.rpc('rpc_delete_relationship_gist_reflection', {
    p_operation_id: input.operationId,
    p_owner_user_id: input.ownerUserId,
    p_gist_id: input.gistId,
    p_revision_id: input.revisionId,
    p_source: input.source,
  });
  if (error) throw error;
  return data;
}

export async function recordRelationshipGistReaderEvent(client: RpcClient, input: {
  clientEventId: string;
  ownerUserId: string;
  gistId: string;
  revisionId: string;
  eventType: RelationshipGistReaderEventType;
  progressBucket?: 0 | 25 | 50 | 75 | 100 | null;
  source: RelationshipGistEngagementSource;
  sessionId?: string | null;
}) {
  if (!RELATIONSHIP_GIST_ANALYTICS_ENABLED) throw featureDisabled();
  const { data, error } = await client.rpc('rpc_record_relationship_gist_reader_event', {
    p_client_event_id: input.clientEventId,
    p_owner_user_id: input.ownerUserId,
    p_gist_id: input.gistId,
    p_revision_id: input.revisionId,
    p_event_type: input.eventType,
    p_progress_bucket: input.progressBucket ?? null,
    p_source: input.source,
    p_session_id: input.sessionId ?? null,
  });
  if (error) throw error;
  return data;
}
