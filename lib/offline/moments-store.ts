import { cacheOfflineImage, getOfflineImageUri } from '@/lib/offline/image-store';
import { readOfflineState, removeOfflineEnvelope, writeOfflineEnvelope } from '@/lib/offline/core';
import { cacheOfflineVideo, getOfflineVideoUri } from '@/lib/offline/video-store';
import * as FileSystem from 'expo-file-system/legacy';

const MOMENTS_SNAPSHOT_VERSION = 1;
const OFFLINE_MOMENT_UPLOAD_DIR = `${FileSystem.documentDirectory ?? ''}offline-moment-uploads/`;
const MOMENTS_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 60 * 1000;
const MOMENT_DETAIL_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 60 * 1000;
const STAGED_OFFLINE_MOMENT_UPLOAD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type MomentSnapshotRow = {
  id: string;
  user_id: string;
  type: 'video' | 'photo' | 'text';
  media_url: string | null;
  metadata?: unknown;
  thumbnail_url?: string | null;
  text_body?: string | null;
  caption?: string | null;
  created_at: string;
  expires_at: string;
  visibility?: string;
  is_deleted: boolean;
};

type MomentProfileSnapshotRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type MomentsFeedSnapshot = {
  moments: MomentSnapshotRow[];
  profilesById: Record<string, MomentProfileSnapshotRow>;
};

export type OwnMomentsSnapshot = {
  moments: MomentSnapshotRow[];
  reactionCounts: Record<string, number>;
  commentCounts: Record<string, number>;
  viewCounts?: Record<string, number>;
  viewTimeInsights?: MomentViewTimeInsightSnapshotRow[];
  viewerSegments?: MomentViewerSegmentsSnapshot | null;
  recentViewersByMomentId?: Record<string, MomentRecentViewerSnapshotRow[]>;
};

export type MomentViewTimeInsightSnapshotRow = {
  localHour: number;
  weekdayBucket: number;
  viewCount: number;
};

export type MomentViewerSegmentsSnapshot = {
  totalViewers: number;
  matchedViewers: number;
  nonMatchViewers: number;
  ghanaViewers: number;
  abroadViewers: number;
  repeatViewers: number;
  firstTimeViewers: number;
};

export type MomentRecentViewerSnapshotRow = {
  viewerUserId: string;
  viewedAt: string;
  profileId: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  currentCountryCode: string | null;
  isMatch: boolean;
  viewedMomentCount: number;
  isRepeatViewer: boolean;
};

export type MomentCommentSnapshotRow = {
  id: string;
  moment_id: string;
  user_id: string;
  body: string;
  created_at: string;
  parent_comment_id: string | null;
  is_deleted: boolean;
};

export type MomentReactorSnapshotRow = {
  id: string;
  emoji: string;
  user_id: string;
  created_at: string;
};

export type MomentCommentThreadSnapshot = {
  comments: MomentCommentSnapshotRow[];
  profilesByUserId: Record<string, MomentProfileSnapshotRow>;
};

export type MomentReactorsSnapshot = {
  reactions: MomentReactorSnapshotRow[];
  profilesByUserId: Record<string, MomentProfileSnapshotRow>;
};

export type CreateOwnMomentSnapshotInput = {
  id: string;
  userId: string;
  type: 'video' | 'photo' | 'text';
  mediaUrl?: string | null;
  metadata?: unknown;
  thumbnailUrl?: string | null;
  textBody?: string | null;
  caption?: string | null;
  visibility?: string;
  createdAt?: string;
  expiresAt?: string;
};

const buildMomentsFeedSnapshotKey = (userId: string) =>
  `offline:moments:feed:v${MOMENTS_SNAPSHOT_VERSION}:${userId}`;

const buildOwnMomentsSnapshotKey = (userId: string) =>
  `offline:moments:own:v${MOMENTS_SNAPSHOT_VERSION}:${userId}`;

const buildMomentCommentsSnapshotKey = (userId: string, momentId: string) =>
  `offline:moments:comments:v${MOMENTS_SNAPSHOT_VERSION}:${userId}:${momentId}`;

const buildMomentReactorsSnapshotKey = (userId: string, momentId: string) =>
  `offline:moments:reactors:v${MOMENTS_SNAPSHOT_VERSION}:${userId}:${momentId}`;

const buildMomentMediaSourceKey = (moment: Pick<MomentSnapshotRow, 'id' | 'type' | 'media_url'>) => {
  const source = moment.media_url || moment.id;
  return `moment-media:${moment.type}:${source}`;
};

const buildMomentDetailSnapshotKeys = (userId: string, momentId: string) => [
  buildMomentCommentsSnapshotKey(userId, momentId),
  buildMomentReactorsSnapshotKey(userId, momentId),
];

const createEmptyOwnMomentsSnapshot = (): OwnMomentsSnapshot => ({
  moments: [],
  reactionCounts: {},
  commentCounts: {},
  viewCounts: {},
  viewTimeInsights: [],
  viewerSegments: null,
  recentViewersByMomentId: {},
});

const sanitizeFileName = (fileName: string) =>
  fileName
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || `moment-${Date.now()}`;

const getMomentRemoteUri = (
  moment: Pick<MomentSnapshotRow, 'id' | 'type' | 'media_url'>,
  remoteByMomentId?: Record<string, string>,
) => {
  if (moment.id && remoteByMomentId?.[moment.id]) return remoteByMomentId[moment.id];
  if (moment.media_url?.startsWith('http')) return moment.media_url;
  return null;
};

const isActiveMomentRow = (moment: MomentSnapshotRow) =>
  !moment.is_deleted && new Date(moment.expires_at).getTime() > Date.now();

const pruneCounts = (momentIds: Set<string>, counts?: Record<string, number>) =>
  Object.entries(counts ?? {}).reduce<Record<string, number>>((acc, [momentId, count]) => {
    if (momentIds.has(momentId)) {
      acc[momentId] = count;
    }
    return acc;
  }, {});

const pruneFeedSnapshot = (snapshot: MomentsFeedSnapshot): MomentsFeedSnapshot => ({
  ...snapshot,
  moments: snapshot.moments.filter(isActiveMomentRow),
});

const pruneViewTimeInsights = (
  rows?: MomentViewTimeInsightSnapshotRow[],
): MomentViewTimeInsightSnapshotRow[] =>
  Array.isArray(rows)
    ? rows
        .filter(
          (row) =>
            Number.isFinite(row?.localHour) &&
            Number.isFinite(row?.weekdayBucket) &&
            Number.isFinite(row?.viewCount),
        )
        .map((row) => ({
          localHour: Number(row.localHour),
          weekdayBucket: Number(row.weekdayBucket),
          viewCount: Number(row.viewCount),
        }))
    : [];

const pruneViewerSegments = (
  viewerSegments?: MomentViewerSegmentsSnapshot | null,
): MomentViewerSegmentsSnapshot | null => {
  if (!viewerSegments) return null;
  return {
    totalViewers: Number(viewerSegments.totalViewers || 0),
    matchedViewers: Number(viewerSegments.matchedViewers || 0),
    nonMatchViewers: Number(viewerSegments.nonMatchViewers || 0),
    ghanaViewers: Number(viewerSegments.ghanaViewers || 0),
    abroadViewers: Number(viewerSegments.abroadViewers || 0),
    repeatViewers: Number(viewerSegments.repeatViewers || 0),
    firstTimeViewers: Number(viewerSegments.firstTimeViewers || 0),
  };
};

const pruneRecentViewersByMomentId = (
  momentIds: Set<string>,
  recentViewersByMomentId?: Record<string, MomentRecentViewerSnapshotRow[]>,
) =>
  Object.entries(recentViewersByMomentId ?? {}).reduce<
    Record<string, MomentRecentViewerSnapshotRow[]>
  >((acc, [momentId, viewers]) => {
    if (!momentIds.has(momentId) || !Array.isArray(viewers)) {
      return acc;
    }
    acc[momentId] = viewers
      .filter((viewer) => viewer?.viewerUserId && viewer?.viewedAt)
      .map((viewer) => ({
        viewerUserId: String(viewer.viewerUserId),
        viewedAt: String(viewer.viewedAt),
        profileId: viewer.profileId ? String(viewer.profileId) : null,
        fullName: viewer.fullName ?? null,
        avatarUrl: viewer.avatarUrl ?? null,
        currentCountryCode: viewer.currentCountryCode ?? null,
        isMatch: Boolean(viewer.isMatch),
        viewedMomentCount: Number(viewer.viewedMomentCount || 0),
        isRepeatViewer: Boolean(viewer.isRepeatViewer),
      }))
      .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());
    return acc;
  }, {});

const pruneOwnSnapshot = (snapshot: OwnMomentsSnapshot): OwnMomentsSnapshot => {
  const moments = snapshot.moments.filter(isActiveMomentRow);
  const momentIds = new Set(moments.map((moment) => moment.id));
  return {
    moments,
    reactionCounts: pruneCounts(momentIds, snapshot.reactionCounts),
    commentCounts: pruneCounts(momentIds, snapshot.commentCounts),
    viewCounts: pruneCounts(momentIds, snapshot.viewCounts),
    viewTimeInsights: pruneViewTimeInsights(snapshot.viewTimeInsights),
    viewerSegments: pruneViewerSegments(snapshot.viewerSegments),
    recentViewersByMomentId: pruneRecentViewersByMomentId(
      momentIds,
      snapshot.recentViewersByMomentId,
    ),
  };
};

const pruneMomentCommentThreadSnapshot = (
  snapshot: MomentCommentThreadSnapshot,
): MomentCommentThreadSnapshot => ({
  ...snapshot,
  comments: snapshot.comments
    .filter((comment) => !comment.is_deleted)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
});

const pruneMomentReactorsSnapshot = (
  snapshot: MomentReactorsSnapshot,
): MomentReactorsSnapshot => ({
  ...snapshot,
  reactions: snapshot.reactions.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  ),
});

async function readFreshSnapshot<T>(key: string): Promise<T | null> {
  const state = await readOfflineState<T>(key);
  if (!state.data) return null;
  if (state.isStale) {
    await removeOfflineEnvelope(key);
    return null;
  }
  return state.data;
}

async function removeMomentDetailSnapshots(userId: string, momentIds: Iterable<string>) {
  const keys = Array.from(momentIds)
    .filter(Boolean)
    .flatMap((momentId) => buildMomentDetailSnapshotKeys(userId, momentId));
  await Promise.all(keys.map((key) => removeOfflineEnvelope(key)));
}

export async function readMomentsFeedSnapshot(userId: string): Promise<MomentsFeedSnapshot | null> {
  const snapshot = await readFreshSnapshot<MomentsFeedSnapshot>(buildMomentsFeedSnapshotKey(userId));
  if (!snapshot) return null;
  const pruned = pruneFeedSnapshot(snapshot);
  const removedMomentIds = snapshot.moments
    .filter((moment) => !pruned.moments.some((entry) => entry.id === moment.id))
    .map((moment) => moment.id);
  if (pruned.moments.length !== snapshot.moments.length) {
    await writeMomentsFeedSnapshot(userId, pruned);
    await removeMomentDetailSnapshots(userId, removedMomentIds);
  }
  return pruned;
}

export async function writeMomentsFeedSnapshot(
  userId: string,
  snapshot: MomentsFeedSnapshot,
): Promise<void> {
  await writeOfflineEnvelope(buildMomentsFeedSnapshotKey(userId), pruneFeedSnapshot(snapshot), {
    kind: 'moments-feed-snapshot',
    staleAfterMs: MOMENTS_SNAPSHOT_MAX_AGE_MS,
  });
}

export async function readOwnMomentsSnapshot(userId: string): Promise<OwnMomentsSnapshot | null> {
  const snapshot = await readFreshSnapshot<OwnMomentsSnapshot>(buildOwnMomentsSnapshotKey(userId));
  if (!snapshot) return null;
  const pruned = pruneOwnSnapshot(snapshot);
  const removedMomentIds = snapshot.moments
    .filter((moment) => !pruned.moments.some((entry) => entry.id === moment.id))
    .map((moment) => moment.id);
  if (
    pruned.moments.length !== snapshot.moments.length ||
    Object.keys(pruned.reactionCounts).length !== Object.keys(snapshot.reactionCounts ?? {}).length ||
    Object.keys(pruned.commentCounts).length !== Object.keys(snapshot.commentCounts ?? {}).length ||
    Object.keys(pruned.viewCounts ?? {}).length !== Object.keys(snapshot.viewCounts ?? {}).length ||
    Object.keys(pruned.recentViewersByMomentId ?? {}).length !==
      Object.keys(snapshot.recentViewersByMomentId ?? {}).length
  ) {
    await writeOwnMomentsSnapshot(userId, pruned);
    await removeMomentDetailSnapshots(userId, removedMomentIds);
  }
  return pruned;
}

export async function writeOwnMomentsSnapshot(
  userId: string,
  snapshot: OwnMomentsSnapshot,
): Promise<void> {
  await writeOfflineEnvelope(buildOwnMomentsSnapshotKey(userId), pruneOwnSnapshot(snapshot), {
    kind: 'moments-own-snapshot',
    staleAfterMs: MOMENTS_SNAPSHOT_MAX_AGE_MS,
  });
}

export async function mergeOwnMomentsSnapshot(
  userId: string,
  patch: Partial<OwnMomentsSnapshot>,
): Promise<OwnMomentsSnapshot> {
  const current = (await readOwnMomentsSnapshot(userId)) ?? createEmptyOwnMomentsSnapshot();
  const next: OwnMomentsSnapshot = {
    ...current,
    ...patch,
    moments: patch.moments ?? current.moments,
    reactionCounts: patch.reactionCounts ?? current.reactionCounts,
    commentCounts: patch.commentCounts ?? current.commentCounts,
    viewCounts: patch.viewCounts ?? current.viewCounts ?? {},
    viewTimeInsights: patch.viewTimeInsights ?? current.viewTimeInsights ?? [],
    viewerSegments:
      patch.viewerSegments === undefined ? current.viewerSegments ?? null : patch.viewerSegments,
    recentViewersByMomentId:
      patch.recentViewersByMomentId ?? current.recentViewersByMomentId ?? {},
  };
  await writeOwnMomentsSnapshot(userId, next);
  return next;
}

export async function readOwnMomentRecentViewersSnapshot(
  userId: string,
  momentId: string,
): Promise<MomentRecentViewerSnapshotRow[]> {
  const snapshot = await readOwnMomentsSnapshot(userId);
  return snapshot?.recentViewersByMomentId?.[momentId] ?? [];
}

export async function writeOwnMomentRecentViewersSnapshot(
  userId: string,
  momentId: string,
  viewers: MomentRecentViewerSnapshotRow[],
): Promise<OwnMomentsSnapshot> {
  const current = (await readOwnMomentsSnapshot(userId)) ?? createEmptyOwnMomentsSnapshot();
  const nextRecentViewersByMomentId = {
    ...(current.recentViewersByMomentId ?? {}),
    [momentId]: viewers,
  };
  return mergeOwnMomentsSnapshot(userId, {
    recentViewersByMomentId: nextRecentViewersByMomentId,
  });
}

export async function readMomentCommentsSnapshot(
  userId: string,
  momentId: string,
): Promise<MomentCommentThreadSnapshot | null> {
  const snapshot = await readFreshSnapshot<MomentCommentThreadSnapshot>(
    buildMomentCommentsSnapshotKey(userId, momentId),
  );
  if (!snapshot) return null;
  const pruned = pruneMomentCommentThreadSnapshot(snapshot);
  if (pruned.comments.length !== snapshot.comments.length) {
    await writeMomentCommentsSnapshot(userId, momentId, pruned);
  }
  return pruned;
}

export async function writeMomentCommentsSnapshot(
  userId: string,
  momentId: string,
  snapshot: MomentCommentThreadSnapshot,
): Promise<void> {
  await writeOfflineEnvelope(
    buildMomentCommentsSnapshotKey(userId, momentId),
    pruneMomentCommentThreadSnapshot(snapshot),
    { kind: 'moment-comments-snapshot', staleAfterMs: MOMENT_DETAIL_SNAPSHOT_MAX_AGE_MS },
  );
}

export async function upsertMomentCommentSnapshot(
  userId: string,
  momentId: string,
  comment: MomentCommentSnapshotRow,
  profile?: MomentProfileSnapshotRow | null,
): Promise<MomentCommentThreadSnapshot> {
  const current = (await readMomentCommentsSnapshot(userId, momentId)) ?? {
    comments: [],
    profilesByUserId: {},
  };
  const next: MomentCommentThreadSnapshot = {
    comments: [comment, ...current.comments.filter((entry) => entry.id !== comment.id)],
    profilesByUserId: {
      ...current.profilesByUserId,
      ...(profile && comment.user_id ? { [comment.user_id]: profile } : {}),
    },
  };
  await writeMomentCommentsSnapshot(userId, momentId, next);
  return next;
}

export async function patchMomentCommentSnapshot(
  userId: string,
  momentId: string,
  commentId: string,
  updater: (comment: MomentCommentSnapshotRow) => MomentCommentSnapshotRow | null,
): Promise<MomentCommentThreadSnapshot | null> {
  const current = await readMomentCommentsSnapshot(userId, momentId);
  if (!current) return null;
  const nextComments = current.comments
    .map((comment) => (comment.id === commentId ? updater(comment) : comment))
    .filter((comment): comment is MomentCommentSnapshotRow => Boolean(comment));
  const next = {
    ...current,
    comments: nextComments,
  };
  await writeMomentCommentsSnapshot(userId, momentId, next);
  return next;
}

export async function replaceMomentCommentSnapshotId(
  userId: string,
  momentId: string,
  previousCommentId: string,
  nextComment: MomentCommentSnapshotRow,
): Promise<MomentCommentThreadSnapshot | null> {
  return patchMomentCommentSnapshot(userId, momentId, previousCommentId, () => nextComment);
}

export async function removeMomentCommentSnapshot(
  userId: string,
  momentId: string,
  commentId: string,
): Promise<MomentCommentThreadSnapshot | null> {
  return patchMomentCommentSnapshot(userId, momentId, commentId, () => null);
}

export async function moveMomentCommentsSnapshot(
  userId: string,
  fromMomentId: string,
  toMomentId: string,
): Promise<MomentCommentThreadSnapshot | null> {
  if (!fromMomentId || !toMomentId || fromMomentId === toMomentId) {
    return readMomentCommentsSnapshot(userId, toMomentId);
  }
  const [source, target] = await Promise.all([
    readMomentCommentsSnapshot(userId, fromMomentId),
    readMomentCommentsSnapshot(userId, toMomentId),
  ]);
  if (!source && !target) return null;
  const nextComments = [
    ...(source?.comments ?? []).map((comment) => ({
      ...comment,
      moment_id: toMomentId,
    })),
    ...(target?.comments ?? []),
  ].filter(
    (comment, index, array) => array.findIndex((entry) => entry.id === comment.id) === index,
  );
  const next: MomentCommentThreadSnapshot = {
    comments: nextComments,
    profilesByUserId: {
      ...(target?.profilesByUserId ?? {}),
      ...(source?.profilesByUserId ?? {}),
    },
  };
  await writeMomentCommentsSnapshot(userId, toMomentId, next);
  await removeOfflineEnvelope(buildMomentCommentsSnapshotKey(userId, fromMomentId));
  return next;
}

export async function readMomentReactorsSnapshot(
  userId: string,
  momentId: string,
): Promise<MomentReactorsSnapshot | null> {
  const snapshot = await readFreshSnapshot<MomentReactorsSnapshot>(
    buildMomentReactorsSnapshotKey(userId, momentId),
  );
  if (!snapshot) return null;
  const pruned = pruneMomentReactorsSnapshot(snapshot);
  if (pruned.reactions.length !== snapshot.reactions.length) {
    await writeMomentReactorsSnapshot(userId, momentId, pruned);
  }
  return pruned;
}

export async function writeMomentReactorsSnapshot(
  userId: string,
  momentId: string,
  snapshot: MomentReactorsSnapshot,
): Promise<void> {
  await writeOfflineEnvelope(
    buildMomentReactorsSnapshotKey(userId, momentId),
    pruneMomentReactorsSnapshot(snapshot),
    { kind: 'moment-reactors-snapshot', staleAfterMs: MOMENT_DETAIL_SNAPSHOT_MAX_AGE_MS },
  );
}

export async function upsertMomentReactorSnapshot(
  userId: string,
  momentId: string,
  reaction: MomentReactorSnapshotRow,
  profile?: MomentProfileSnapshotRow | null,
): Promise<MomentReactorsSnapshot> {
  const current = (await readMomentReactorsSnapshot(userId, momentId)) ?? {
    reactions: [],
    profilesByUserId: {},
  };
  const nextReactions = [
    reaction,
    ...current.reactions.filter((entry) => entry.user_id !== reaction.user_id),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const next: MomentReactorsSnapshot = {
    reactions: nextReactions,
    profilesByUserId: {
      ...current.profilesByUserId,
      ...(profile && reaction.user_id ? { [reaction.user_id]: profile } : {}),
    },
  };
  await writeMomentReactorsSnapshot(userId, momentId, next);
  return next;
}

export async function removeMomentReactorSnapshot(
  userId: string,
  momentId: string,
  reactorUserId: string,
): Promise<MomentReactorsSnapshot | null> {
  const current = await readMomentReactorsSnapshot(userId, momentId);
  if (!current) return null;
  const next: MomentReactorsSnapshot = {
    ...current,
    reactions: current.reactions.filter((entry) => entry.user_id !== reactorUserId),
  };
  await writeMomentReactorsSnapshot(userId, momentId, next);
  return next;
}

export async function moveMomentReactorsSnapshot(
  userId: string,
  fromMomentId: string,
  toMomentId: string,
): Promise<MomentReactorsSnapshot | null> {
  if (!fromMomentId || !toMomentId || fromMomentId === toMomentId) {
    return readMomentReactorsSnapshot(userId, toMomentId);
  }
  const [source, target] = await Promise.all([
    readMomentReactorsSnapshot(userId, fromMomentId),
    readMomentReactorsSnapshot(userId, toMomentId),
  ]);
  if (!source && !target) return null;
  const nextReactions = [
    ...(source?.reactions ?? []),
    ...(target?.reactions ?? []),
  ].filter(
    (reaction, index, array) =>
      array.findIndex((entry) => entry.user_id === reaction.user_id) === index,
  );
  const next: MomentReactorsSnapshot = {
    reactions: nextReactions,
    profilesByUserId: {
      ...(target?.profilesByUserId ?? {}),
      ...(source?.profilesByUserId ?? {}),
    },
  };
  await writeMomentReactorsSnapshot(userId, toMomentId, next);
  await removeOfflineEnvelope(buildMomentReactorsSnapshotKey(userId, fromMomentId));
  return next;
}

const buildSnapshotMoment = (input: CreateOwnMomentSnapshotInput): MomentSnapshotRow => {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return {
    id: input.id,
    user_id: input.userId,
    type: input.type,
    media_url: input.mediaUrl ?? null,
    metadata: input.metadata ?? null,
    thumbnail_url: input.thumbnailUrl ?? null,
    text_body: input.textBody ?? null,
    caption: input.caption ?? null,
    created_at: createdAt,
    expires_at: expiresAt,
    visibility: input.visibility ?? 'matches',
    is_deleted: false,
  };
};

async function ensureOfflineMomentUploadDir() {
  if (!FileSystem.documentDirectory) return null;
  const info = await FileSystem.getInfoAsync(OFFLINE_MOMENT_UPLOAD_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(OFFLINE_MOMENT_UPLOAD_DIR, { intermediates: true });
    return OFFLINE_MOMENT_UPLOAD_DIR;
  }
  try {
    const fileNames = await FileSystem.readDirectoryAsync(OFFLINE_MOMENT_UPLOAD_DIR);
    const expirationCutoff = Date.now() - STAGED_OFFLINE_MOMENT_UPLOAD_MAX_AGE_MS;
    await Promise.all(
      fileNames.map(async (fileName) => {
        const targetUri = `${OFFLINE_MOMENT_UPLOAD_DIR}${fileName}`;
        try {
          const fileInfo = await FileSystem.getInfoAsync(targetUri);
          const modifiedAtValue =
            'modificationTime' in fileInfo ? fileInfo.modificationTime : undefined;
          const modifiedAtMs =
            typeof modifiedAtValue === 'number'
              ? modifiedAtValue * 1000
              : typeof modifiedAtValue === 'string'
                ? new Date(modifiedAtValue).getTime()
                : 0;
          if (fileInfo.exists && modifiedAtMs > 0 && modifiedAtMs < expirationCutoff) {
            await FileSystem.deleteAsync(targetUri, { idempotent: true });
          }
        } catch {
          // Best effort cleanup only.
        }
      }),
    );
  } catch {
    // Best effort cleanup only.
  }
  return OFFLINE_MOMENT_UPLOAD_DIR;
}

export async function appendOwnMomentSnapshot(
  userId: string,
  input: CreateOwnMomentSnapshotInput,
): Promise<OwnMomentsSnapshot> {
  const current = (await readOwnMomentsSnapshot(userId)) ?? createEmptyOwnMomentsSnapshot();
  const nextMoment = buildSnapshotMoment(input);
  const next: OwnMomentsSnapshot = {
    moments: [nextMoment, ...current.moments.filter((moment) => moment.id !== nextMoment.id)],
    reactionCounts: {
      ...current.reactionCounts,
      [nextMoment.id]: current.reactionCounts[nextMoment.id] ?? 0,
    },
    commentCounts: {
      ...current.commentCounts,
      [nextMoment.id]: current.commentCounts[nextMoment.id] ?? 0,
    },
    viewCounts: {
      ...(current.viewCounts ?? {}),
      [nextMoment.id]: current.viewCounts?.[nextMoment.id] ?? 0,
    },
    viewTimeInsights: current.viewTimeInsights ?? [],
    viewerSegments: current.viewerSegments ?? null,
    recentViewersByMomentId: {
      ...(current.recentViewersByMomentId ?? {}),
      [nextMoment.id]: current.recentViewersByMomentId?.[nextMoment.id] ?? [],
    },
  };
  await writeOwnMomentsSnapshot(userId, next);
  return next;
}

export async function replaceOwnMomentSnapshot(
  userId: string,
  previousMomentId: string,
  input: CreateOwnMomentSnapshotInput,
): Promise<OwnMomentsSnapshot> {
  const current = (await readOwnMomentsSnapshot(userId)) ?? createEmptyOwnMomentsSnapshot();
  const nextMoment = buildSnapshotMoment(input);
  const existingIndex = current.moments.findIndex((moment) => moment.id === previousMomentId);
  const existingCountsReaction =
    current.reactionCounts[previousMomentId] ?? current.reactionCounts[nextMoment.id] ?? 0;
  const existingCountsComment =
    current.commentCounts[previousMomentId] ?? current.commentCounts[nextMoment.id] ?? 0;
  const existingCountsView =
    current.viewCounts?.[previousMomentId] ?? current.viewCounts?.[nextMoment.id] ?? 0;
  const nextMoments =
    existingIndex >= 0
      ? current.moments.map((moment, index) => (index === existingIndex ? nextMoment : moment))
      : [nextMoment, ...current.moments.filter((moment) => moment.id !== nextMoment.id)];
  const reactionCounts = { ...current.reactionCounts };
  const commentCounts = { ...current.commentCounts };
  const viewCounts = { ...(current.viewCounts ?? {}) };
  const recentViewersByMomentId = { ...(current.recentViewersByMomentId ?? {}) };
  delete reactionCounts[previousMomentId];
  delete commentCounts[previousMomentId];
  delete viewCounts[previousMomentId];
  const previousRecentViewers =
    recentViewersByMomentId[previousMomentId] ?? recentViewersByMomentId[nextMoment.id] ?? [];
  delete recentViewersByMomentId[previousMomentId];
  reactionCounts[nextMoment.id] = existingCountsReaction;
  commentCounts[nextMoment.id] = existingCountsComment;
  viewCounts[nextMoment.id] = existingCountsView;
  recentViewersByMomentId[nextMoment.id] = previousRecentViewers;
  const next: OwnMomentsSnapshot = {
    moments: nextMoments,
    reactionCounts,
    commentCounts,
    viewCounts,
    viewTimeInsights: current.viewTimeInsights ?? [],
    viewerSegments: current.viewerSegments ?? null,
    recentViewersByMomentId,
  };
  await writeOwnMomentsSnapshot(userId, next);
  return next;
}

export async function removeOwnMomentSnapshot(userId: string, momentId: string): Promise<OwnMomentsSnapshot | null> {
  const current = await readOwnMomentsSnapshot(userId);
  if (!current) return null;
  const reactionCounts = { ...current.reactionCounts };
  const commentCounts = { ...current.commentCounts };
  const viewCounts = { ...(current.viewCounts ?? {}) };
  const recentViewersByMomentId = { ...(current.recentViewersByMomentId ?? {}) };
  delete reactionCounts[momentId];
  delete commentCounts[momentId];
  delete viewCounts[momentId];
  delete recentViewersByMomentId[momentId];
  const next: OwnMomentsSnapshot = {
    moments: current.moments.filter((moment) => moment.id !== momentId),
    reactionCounts,
    commentCounts,
    viewCounts,
    viewTimeInsights: current.viewTimeInsights ?? [],
    viewerSegments: current.viewerSegments ?? null,
    recentViewersByMomentId,
  };
  await writeOwnMomentsSnapshot(userId, next);
  await removeMomentDetailSnapshots(userId, [momentId]);
  return next;
}

export async function appendMomentsFeedSnapshot(
  userId: string,
  input: CreateOwnMomentSnapshotInput,
): Promise<MomentsFeedSnapshot> {
  const current = (await readMomentsFeedSnapshot(userId)) ?? {
    moments: [],
    profilesById: {},
  };
  const nextMoment = buildSnapshotMoment(input);
  const next: MomentsFeedSnapshot = {
    ...current,
    moments: [nextMoment, ...current.moments.filter((moment) => moment.id !== nextMoment.id)],
  };
  await writeMomentsFeedSnapshot(userId, next);
  return next;
}

export async function replaceMomentInFeedSnapshot(
  userId: string,
  previousMomentId: string,
  input: CreateOwnMomentSnapshotInput,
): Promise<MomentsFeedSnapshot> {
  const current = (await readMomentsFeedSnapshot(userId)) ?? {
    moments: [],
    profilesById: {},
  };
  const nextMoment = buildSnapshotMoment(input);
  const existingIndex = current.moments.findIndex((moment) => moment.id === previousMomentId);
  const next: MomentsFeedSnapshot = {
    ...current,
    moments:
      existingIndex >= 0
        ? current.moments.map((moment, index) => (index === existingIndex ? nextMoment : moment))
        : [nextMoment, ...current.moments.filter((moment) => moment.id !== nextMoment.id)],
  };
  await writeMomentsFeedSnapshot(userId, next);
  return next;
}

export async function removeMomentFromFeedSnapshot(
  userId: string,
  momentId: string,
): Promise<MomentsFeedSnapshot | null> {
  const current = await readMomentsFeedSnapshot(userId);
  if (!current) return null;
  const next: MomentsFeedSnapshot = {
    ...current,
    moments: current.moments.filter((moment) => moment.id !== momentId),
  };
  await writeMomentsFeedSnapshot(userId, next);
  await removeMomentDetailSnapshots(userId, [momentId]);
  return next;
}

export async function resolveOfflineMomentMediaMap(
  moments: Pick<MomentSnapshotRow, 'id' | 'type' | 'media_url'>[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    moments.map(async (moment) => {
      if (!moment.media_url) return [moment.id, null] as const;
      if (moment.media_url.startsWith('file://')) return [moment.id, moment.media_url] as const;
      const sourceKey = buildMomentMediaSourceKey(moment);
      const localUri =
        moment.type === 'video'
          ? await getOfflineVideoUri(sourceKey)
          : await getOfflineImageUri(sourceKey);
      return [moment.id, localUri] as const;
    }),
  );

  return entries.reduce<Record<string, string>>((acc, [momentId, uri]) => {
    if (uri) acc[momentId] = uri;
    return acc;
  }, {});
}

export async function primeOfflineMomentMedia(
  moments: Pick<MomentSnapshotRow, 'id' | 'type' | 'media_url'>[],
  remoteByMomentId?: Record<string, string>,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    moments.map(async (moment) => {
      const remoteUri = getMomentRemoteUri(moment, remoteByMomentId);
      if (!remoteUri) return [moment.id, null] as const;
      const sourceKey = buildMomentMediaSourceKey(moment);
      const localUri =
        moment.type === 'video'
          ? await cacheOfflineVideo(sourceKey, remoteUri)
          : await cacheOfflineImage(sourceKey, remoteUri);
      return [moment.id, localUri] as const;
    }),
  );

  return entries.reduce<Record<string, string>>((acc, [momentId, uri]) => {
    if (uri) acc[momentId] = uri;
    return acc;
  }, {});
}

export async function stageOfflineMomentUpload(sourceUri: string, fileName: string) {
  const dir = await ensureOfflineMomentUploadDir();
  if (!dir) return sourceUri;
  if (sourceUri.startsWith(dir)) return sourceUri;

  const safeName = sanitizeFileName(fileName);
  const stagedUri = `${dir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: stagedUri });
  return stagedUri;
}

export async function removeStagedOfflineMomentUpload(uri?: string | null) {
  if (!uri || !uri.startsWith(OFFLINE_MOMENT_UPLOAD_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best effort cleanup only.
  }
}
