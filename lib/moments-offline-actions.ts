import { fetch as fetchNetInfo } from '@react-native-community/netinfo';

import type { MomentMetadata } from '@/lib/moment-text-style';
import {
  createMomentFromMediaStrict,
  createTextMomentStrict,
  deleteMomentStrict,
} from '@/lib/moments';
import { isLikelyNetworkError } from '@/lib/network';
import { stageOfflineMomentUpload } from '@/lib/offline/moments-store';
import {
  clearMomentMutationArtifacts,
  enqueueMomentDeleteMutation,
  enqueueMomentMediaCreateMutation,
  enqueueMomentTextCreateMutation,
  isOfflineMomentId,
} from '@/lib/offline/mutation-queue';

type MomentVisibility = 'public' | 'matches' | 'vibe_check_approved' | 'private';

type CreateMomentBase = {
  userId: string;
  visibility?: MomentVisibility;
  caption?: string | null;
  metadata?: MomentMetadata | null;
};

type CreateMediaMomentOfflineInput = CreateMomentBase & {
  type: 'photo' | 'video';
  uri: string;
  fileName: string;
  contentType: string;
};

type CreateTextMomentOfflineInput = CreateMomentBase & {
  textBody: string;
};

type DeleteMomentOfflineInput = {
  userId: string;
  momentId: string;
  mediaPath?: string | null;
};

export type MomentMutationResult = {
  status: 'synced' | 'queued';
  momentId: string;
  mediaPath?: string | null;
};

const buildOfflineMomentId = () =>
  `offline-moment:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

const getInternetReady = async () => {
  try {
    const state = await fetchNetInfo();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
};

export async function createMomentFromMediaOfflineSafe(
  input: CreateMediaMomentOfflineInput,
): Promise<MomentMutationResult> {
  const tempId = buildOfflineMomentId();
  const basePayload = {
    tempId,
    userId: input.userId,
    type: input.type,
    caption: input.caption ?? null,
    visibility: input.visibility ?? 'matches',
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  } as const;

  if (!(await getInternetReady())) {
    const stagedUri = await stageOfflineMomentUpload(input.uri, input.fileName);
    await enqueueMomentMediaCreateMutation({
      ...basePayload,
      localUri: stagedUri,
      fileName: input.fileName,
      contentType: input.contentType,
    });
    return { status: 'queued', momentId: tempId, mediaPath: stagedUri };
  }

  try {
    const result = await createMomentFromMediaStrict({
      userId: input.userId,
      type: input.type,
      uri: input.uri,
      caption: input.caption ?? null,
      visibility: input.visibility ?? 'matches',
      metadata: input.metadata ?? {},
    });
    return { status: 'synced', momentId: result.momentId, mediaPath: result.mediaPath };
  } catch (error) {
    const stage = (error as { stage?: string } | null)?.stage ?? null;
    if (!isLikelyNetworkError(error) || (stage && stage !== 'upload' && stage !== 'insert')) {
      throw error;
    }
    const stagedUri = await stageOfflineMomentUpload(input.uri, input.fileName);
    await enqueueMomentMediaCreateMutation({
      ...basePayload,
      localUri: stagedUri,
      fileName: input.fileName,
      contentType: input.contentType,
    });
    return { status: 'queued', momentId: tempId, mediaPath: stagedUri };
  }
}

export async function createTextMomentOfflineSafe(
  input: CreateTextMomentOfflineInput,
): Promise<MomentMutationResult> {
  const tempId = buildOfflineMomentId();
  const payload = {
    tempId,
    userId: input.userId,
    textBody: input.textBody,
    caption: input.caption ?? null,
    visibility: input.visibility ?? 'matches',
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  if (!(await getInternetReady())) {
    await enqueueMomentTextCreateMutation(payload);
    return { status: 'queued', momentId: tempId };
  }

  try {
    const result = await createTextMomentStrict({
      userId: input.userId,
      type: 'text',
      textBody: input.textBody,
      caption: input.caption ?? null,
      visibility: input.visibility ?? 'matches',
      metadata: input.metadata ?? {},
    });
    return { status: 'synced', momentId: result.momentId };
  } catch (error) {
    if (!isLikelyNetworkError(error)) {
      throw error;
    }
    await enqueueMomentTextCreateMutation(payload);
    return { status: 'queued', momentId: tempId };
  }
}

export async function deleteMomentOfflineSafe(input: DeleteMomentOfflineInput): Promise<{ status: 'synced' | 'queued' }> {
  if (isOfflineMomentId(input.momentId)) {
    await enqueueMomentDeleteMutation({
      userId: input.userId,
      momentId: input.momentId,
      mediaPath: input.mediaPath ?? null,
    });
    return { status: 'queued' };
  }

  if (!(await getInternetReady())) {
    await enqueueMomentDeleteMutation({
      userId: input.userId,
      momentId: input.momentId,
      mediaPath: input.mediaPath ?? null,
    });
    return { status: 'queued' };
  }

  try {
    await deleteMomentStrict({
      momentId: input.momentId,
      mediaPath: input.mediaPath ?? null,
    });
    await clearMomentMutationArtifacts(input.momentId);
    return { status: 'synced' };
  } catch (error) {
    if (!isLikelyNetworkError(error)) {
      throw error;
    }
    await enqueueMomentDeleteMutation({
      userId: input.userId,
      momentId: input.momentId,
      mediaPath: input.mediaPath ?? null,
    });
    return { status: 'queued' };
  }
}
