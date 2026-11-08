import type { RelationshipGist } from '@/features/relationship-gists/domain/relationship-gist';
import { RELATIONSHIP_GIST_READER_V2_ENABLED } from '@/features/relationship-gists/config/relationship-gist-feature-flags';
import type { RelationshipGistMutationPatch } from '@/features/relationship-gists/sync/relationship-gist-outbox';

export type RelationshipGistDataClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }>;
  from: (table: string) => any;
};

export type RelationshipGistFetchResult = {
  data: RelationshipGist[];
  source: 'rpc' | 'legacy_table';
  primaryError: any | null;
};

export type RelationshipGistServerStateRow = {
  gist_id: string;
  saved: boolean;
  saved_version?: number | null;
  progress: number;
  last_read_at?: string | null;
  last_opened_at?: string | null;
  last_perspective?: string | null;
  last_anchor?: string | null;
  last_anchor_offset?: number | null;
  scroll_completed_at?: string | null;
  read_acknowledged_at?: string | null;
  reading_duration_ms?: number | null;
  updated_at?: string | null;
};

export type RelationshipGistMutationResult = {
  delivery: 'processed' | 'duplicate';
  savedOutcome: 'not_requested' | 'applied' | 'converged' | 'conflict';
  gistId: string;
  saved: boolean;
  savedVersion: number;
  progress: number;
  lastReadAt: string | null;
  lastOpenedAt: string | null;
  lastPerspective: string | null;
  lastAnchor: string | null;
  lastAnchorOffset: number | null;
  scrollCompletedAt: string | null;
  readAcknowledgedAt: string | null;
  readingDurationMs: number;
  updatedAt: string | null;
};

const LEGACY_STATE_COLUMNS =
  'gist_id,saved,progress,last_read_at,last_opened_at,last_perspective,updated_at';
const V2_STATE_COLUMNS = [
  LEGACY_STATE_COLUMNS,
  'saved_version,last_anchor,last_anchor_offset,scroll_completed_at',
  'read_acknowledged_at,reading_duration_ms',
].join(',');

const isMissingReaderStateV2Schema = (error: unknown) => {
  const code = String((error as { code?: unknown } | null)?.code ?? '').toUpperCase();
  const message = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase();
  return code === '42703' || code === 'PGRST204' || message.includes('saved_version');
};

const parseNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export async function fetchCurrentRelationshipGists(
  client: RelationshipGistDataClient,
  nowIso = new Date().toISOString(),
): Promise<RelationshipGistFetchResult> {
  const { data, error } = await client.rpc('rpc_get_global_relationship_gists');
  if (!error) {
    return {
      data: (data ?? []) as RelationshipGist[],
      source: 'rpc',
      primaryError: null,
    };
  }

  const { data: fallback, error: fallbackError } = await client
    .from('relationship_gists')
    .select('id,title,short_body,body,perspective,published_at,updated_at,circle_id')
    .eq('status', 'published')
    .is('circle_id', null)
    .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(24);

  if (fallbackError) throw fallbackError;
  return {
    data: (fallback ?? []) as RelationshipGist[],
    source: 'legacy_table',
    primaryError: error,
  };
}

export async function fetchRelationshipGistServerStates(
  client: RelationshipGistDataClient,
): Promise<{ rows: RelationshipGistServerStateRow[]; usedLegacyColumns: boolean }> {
  const v2 = await client.from('relationship_gist_user_states').select(V2_STATE_COLUMNS);
  if (!v2.error) {
    return { rows: (v2.data ?? []) as RelationshipGistServerStateRow[], usedLegacyColumns: false };
  }
  if (!isMissingReaderStateV2Schema(v2.error)) throw v2.error;

  const legacy = await client.from('relationship_gist_user_states').select(LEGACY_STATE_COLUMNS);
  if (legacy.error) throw legacy.error;
  return { rows: (legacy.data ?? []) as RelationshipGistServerStateRow[], usedLegacyColumns: true };
}

const normalizeMutationResult = (
  data: any,
  fallback: { gistId: string; patch: RelationshipGistMutationPatch },
): RelationshipGistMutationResult => ({
  delivery: data?.delivery === 'duplicate' ? 'duplicate' : 'processed',
  savedOutcome: ['applied', 'converged', 'conflict'].includes(data?.saved_outcome)
    ? data.saved_outcome
    : 'not_requested',
  gistId: String(data?.gist_id ?? fallback.gistId),
  saved: data?.saved === true,
  savedVersion: Math.max(0, Math.floor(parseNumber(data?.saved_version))),
  progress: Math.max(0, Math.min(1, parseNumber(data?.progress, fallback.patch.progress ?? 0))),
  lastReadAt: typeof data?.last_read_at === 'string' ? data.last_read_at : null,
  lastOpenedAt: typeof data?.last_opened_at === 'string' ? data.last_opened_at : null,
  lastPerspective: typeof data?.last_perspective === 'string' ? data.last_perspective : null,
  lastAnchor: typeof data?.last_anchor === 'string' ? data.last_anchor : null,
  lastAnchorOffset: Number.isFinite(Number(data?.last_anchor_offset))
    ? Number(data.last_anchor_offset)
    : null,
  scrollCompletedAt: typeof data?.scroll_completed_at === 'string' ? data.scroll_completed_at : null,
  readAcknowledgedAt: typeof data?.read_acknowledged_at === 'string' ? data.read_acknowledged_at : null,
  readingDurationMs: Math.max(0, Math.floor(parseNumber(data?.reading_duration_ms))),
  updatedAt: typeof data?.updated_at === 'string' ? data.updated_at : null,
});

export async function applyRelationshipGistMutation(
  client: RelationshipGistDataClient,
  input: {
    operationId: string;
    ownerUserId: string;
    gistId: string;
    patch: RelationshipGistMutationPatch;
  },
  options: { readerV2Enabled?: boolean } = {},
): Promise<RelationshipGistMutationResult> {
  const { patch } = input;
  const readerV2Enabled = options.readerV2Enabled ?? RELATIONSHIP_GIST_READER_V2_ENABLED;
  if (!readerV2Enabled) {
    throw Object.assign(new Error('relationship_gist_reader_v2_disabled'), {
      code: 'FEATURE_DISABLED',
    });
  }

  const { data, error } = await client.rpc('rpc_apply_relationship_gist_state_mutation_v2', {
    p_operation_id: input.operationId,
    p_owner_user_id: input.ownerUserId,
    p_gist_id: input.gistId,
    p_saved: patch.saved ?? null,
    p_expected_saved_version: patch.saved == null ? null : patch.expectedSavedVersion,
    p_progress: patch.progress ?? null,
    p_last_read_at: patch.lastReadAt ? new Date(patch.lastReadAt).toISOString() : null,
    p_mark_opened: patch.markOpened === true,
    p_last_perspective: patch.lastPerspective ?? null,
    p_last_anchor: patch.lastAnchor ?? null,
    p_last_anchor_offset: patch.lastAnchorOffset ?? null,
    p_scroll_completed: patch.scrollCompleted === true,
    p_read_acknowledged: patch.readAcknowledged === true,
    p_reading_duration_delta_ms: patch.readingDurationDeltaMs ?? null,
  });
  if (error) throw error;
  return normalizeMutationResult(data, input);
}
