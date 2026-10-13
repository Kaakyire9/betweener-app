import type {
  RelationshipGistEditorialAction,
  RelationshipGistEditorialRevision,
} from '@/features/relationship-gists/editorial/relationship-gist-editorial-v2';

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }>;
};

const unwrap = <T>(data: unknown, error: any): T => {
  if (error) throw error;
  return data as T;
};

export async function fetchRelationshipGistEditorialRevisions(
  client: RpcClient,
): Promise<RelationshipGistEditorialRevision[]> {
  const { data, error } = await client.rpc('rpc_admin_get_relationship_gist_editions');
  return unwrap<RelationshipGistEditorialRevision[]>(data ?? [], error);
}

export async function createRelationshipGistRevision(
  client: RpcClient,
  input: {
    editionId?: string | null;
    sourceRevisionId?: string | null;
    title: string;
    shortBody?: string | null;
    body: string;
    perspective: string;
    requiresSafetyReview: boolean;
  },
) {
  const { data, error } = await client.rpc('rpc_create_relationship_gist_revision', {
    p_edition_id: input.editionId ?? null,
    p_legacy_gist_id: null,
    p_source_revision_id: input.sourceRevisionId ?? null,
    p_title: input.title,
    p_short_body: input.shortBody ?? null,
    p_body: input.body,
    p_perspective: input.perspective,
    p_requires_safety_review: input.requiresSafetyReview,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function addRelationshipGistRevisionVariant(
  client: RpcClient,
  input: {
    revisionId: string;
    title: string;
    shortBody?: string | null;
    body: string;
    perspective: string;
  },
) {
  const { data, error } = await client.rpc('rpc_add_relationship_gist_revision_variant', {
    p_revision_id: input.revisionId,
    p_title: input.title,
    p_short_body: input.shortBody ?? null,
    p_body: input.body,
    p_perspective: input.perspective,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function transitionRelationshipGistRevision(
  client: RpcClient,
  input: {
    revisionId: string;
    action: RelationshipGistEditorialAction;
    scheduledFor?: string | null;
    reason?: string | null;
  },
) {
  const { data, error } = await client.rpc('rpc_transition_relationship_gist_revision', {
    p_revision_id: input.revisionId,
    p_action: input.action,
    p_scheduled_for: input.scheduledFor ?? null,
    p_reason: input.reason ?? null,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function createRelationshipGistRollbackRevision(
  client: RpcClient,
  input: { editionId: string; sourceRevisionId: string; reason: string },
) {
  const { data, error } = await client.rpc('rpc_create_relationship_gist_rollback_revision', {
    p_edition_id: input.editionId,
    p_source_revision_id: input.sourceRevisionId,
    p_reason: input.reason,
  });
  return unwrap<Record<string, unknown>>(data, error);
}
