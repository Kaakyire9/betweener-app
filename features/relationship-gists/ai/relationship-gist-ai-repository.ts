export type RelationshipGistAITopic = {
  id: string;
  environment: string;
  topic_key: string;
  topic_title: string;
  topic_brief: string;
  requested_perspective: string;
  planned_for: string;
  status: 'draft' | 'approved' | 'cancelled' | 'consumed';
  created_by_user_id: string;
  approved_by_user_id: string | null;
};

export type RelationshipGistAIJob = {
  id: string;
  topic_id: string;
  status: string;
  model: string;
  attempt_count: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_microusd: number | null;
  cost_estimate_status: 'configured' | 'unconfigured';
  generated_revision_id: string | null;
  failure_code: string | null;
  retryable: boolean;
  created_at: string;
};

export type RelationshipGistAISource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  why_suggested: string;
  verification_status: 'unverified' | 'verified' | 'rejected';
};

export type RelationshipGistAISpecialistReview = {
  review_type: string;
  approved_at: string | null;
};

export type RelationshipGistAIReviewItem = {
  revision_id: string;
  edition_id: string;
  revision_number: number;
  status: string;
  title: string;
  summary: string | null;
  body: string;
  perspective: string;
  takeaway: string;
  discussion_prompt: string;
  safety_level: string;
  sensitive_topics: string[];
  safety_rationale: string;
  human_edited: boolean;
  claims_verified_at: string | null;
  sources: RelationshipGistAISource[];
  specialist_reviews: RelationshipGistAISpecialistReview[];
  can_specialist_approve: boolean;
  created_at: string;
};

export type RelationshipGistAIStudioSnapshot = {
  environment: string | null;
  enabled: boolean;
  topics: RelationshipGistAITopic[];
  jobs: RelationshipGistAIJob[];
};

export type RelationshipGistAIImageJob = {
  id: string;
  revision_id: string;
  perspective: string;
  status: string;
  model: string;
  quality: string;
  estimated_cost_microusd: number | null;
  failure_code: string | null;
  created_at: string;
};

export type RelationshipGistAIImage = {
  id: string;
  revision_id: string;
  perspective: string;
  status: 'generated' | 'approved' | 'rejected' | 'superseded';
  storage_path: string;
  alt_text: string;
  width: number;
  height: number;
  created_at: string;
};

export type RelationshipGistAIImageStudioSnapshot = {
  jobs: RelationshipGistAIImageJob[];
  images: RelationshipGistAIImage[];
};

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }>;
  functions: {
    invoke: (name: string, options: { body: Record<string, unknown> }) => PromiseLike<{ data: unknown; error: any }>;
  };
};

const unwrap = <T>(data: unknown, error: any): T => {
  if (error) throw error;
  return data as T;
};

export async function fetchRelationshipGistAIStudio(client: RpcClient) {
  const { data, error } = await client.rpc('rpc_get_relationship_gist_ai_studio');
  return unwrap<RelationshipGistAIStudioSnapshot>(data, error);
}

export async function fetchRelationshipGistAIReviewQueue(client: RpcClient) {
  const { data, error } = await client.rpc('rpc_get_relationship_gist_ai_review_queue');
  return unwrap<RelationshipGistAIReviewItem[]>(data ?? [], error);
}

export async function createRelationshipGistAITopic(client: RpcClient, input: {
  topicKey: string;
  title: string;
  brief: string;
  perspective: string;
  plannedFor: string;
}) {
  const { data, error } = await client.rpc('rpc_create_relationship_gist_ai_topic', {
    p_topic_key: input.topicKey,
    p_topic_title: input.title,
    p_topic_brief: input.brief,
    p_requested_perspective: input.perspective,
    p_planned_for: input.plannedFor,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function approveRelationshipGistAITopic(client: RpcClient, topicId: string) {
  const { data, error } = await client.rpc('rpc_approve_relationship_gist_ai_topic', {
    p_topic_id: topicId,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function generateRelationshipGistAIDraft(
  client: RpcClient,
  topicId: string,
  idempotencyKey: string,
) {
  const { data, error } = await client.functions.invoke('relationship-gist-ai-draft', {
    body: { topicId, idempotencyKey },
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function prepareRelationshipGistAIOwnerTopic(client: RpcClient, topicId: string) {
  const { data, error } = await client.rpc('rpc_prepare_relationship_gist_ai_owner_topic', {
    p_topic_id: topicId,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function fetchRelationshipGistAIImageStudio(client: RpcClient) {
  const { data, error } = await client.rpc('rpc_get_relationship_gist_ai_image_studio');
  return unwrap<RelationshipGistAIImageStudioSnapshot>(data ?? { jobs: [], images: [] }, error);
}

export async function generateRelationshipGistAIImage(
  client: RpcClient,
  revisionId: string,
  perspective: string,
  idempotencyKey: string,
) {
  const { data, error } = await client.functions.invoke('relationship-gist-ai-image', {
    body: { revisionId, perspective, idempotencyKey },
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function reviewRelationshipGistAIImage(
  client: RpcClient,
  imageId: string,
  decision: 'approve' | 'reject',
  altText: string,
) {
  const { data, error } = await client.rpc('rpc_review_relationship_gist_ai_image', {
    p_image_id: imageId,
    p_decision: decision,
    p_alt_text: altText,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function ownerReviewRelationshipGistAIImage(
  client: RpcClient,
  imageId: string,
  decision: 'approve' | 'reject',
  altText: string,
) {
  const { data, error } = await client.rpc('rpc_owner_review_relationship_gist_ai_image', {
    p_image_id: imageId,
    p_decision: decision,
    p_alt_text: altText,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function attestRelationshipGistAIClaims(client: RpcClient, revisionId: string) {
  const { data, error } = await client.rpc('rpc_attest_relationship_gist_ai_claims', {
    p_revision_id: revisionId,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function ownerAttestRelationshipGistAIClaims(client: RpcClient, revisionId: string) {
  const { data, error } = await client.rpc('rpc_owner_attest_relationship_gist_ai_claims', {
    p_revision_id: revisionId,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function reviewRelationshipGistAISource(
  client: RpcClient,
  sourceId: string,
  status: 'verified' | 'rejected',
) {
  const { data, error } = await client.rpc('rpc_review_relationship_gist_ai_source', {
    p_source_id: sourceId,
    p_status: status,
    p_note: null,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function ownerReviewRelationshipGistAISource(
  client: RpcClient,
  sourceId: string,
  status: 'verified' | 'rejected',
) {
  const { data, error } = await client.rpc('rpc_owner_review_relationship_gist_ai_source', {
    p_source_id: sourceId,
    p_status: status,
    p_note: null,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function approveRelationshipGistAISpecialistReview(
  client: RpcClient,
  revisionId: string,
  reviewType: string,
) {
  const { data, error } = await client.rpc('rpc_approve_relationship_gist_specialist_review', {
    p_revision_id: revisionId,
    p_review_type: reviewType,
    p_note: null,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function ownerAcknowledgeRelationshipGistAISpecialistReview(
  client: RpcClient,
  revisionId: string,
  reviewType: string,
) {
  const { data, error } = await client.rpc('rpc_owner_acknowledge_relationship_gist_ai_specialist_review', {
    p_revision_id: revisionId,
    p_review_type: reviewType,
    p_note: null,
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function publishRelationshipGistAIOwnerReview(
  client: RpcClient,
  revisionId: string,
) {
  const { data, error } = await client.rpc('rpc_publish_relationship_gist_ai_owner_review', {
    p_revision_id: revisionId,
    p_confirmation: 'I reviewed this Gist and accept publishing responsibility.',
  });
  return unwrap<Record<string, unknown>>(data, error);
}

export async function rejectRelationshipGistAIDraft(
  client: RpcClient,
  revisionId: string,
  reason: string,
) {
  const { data, error } = await client.rpc('rpc_reject_relationship_gist_ai_draft', {
    p_revision_id: revisionId,
    p_reason: reason,
  });
  return unwrap<Record<string, unknown>>(data, error);
}
