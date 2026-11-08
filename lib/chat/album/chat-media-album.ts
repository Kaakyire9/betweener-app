export const CHAT_MEDIA_ALBUM_MAX_ITEMS = 10;
export const CHAT_MEDIA_ALBUM_PREVIEW_ITEMS = 4;
export const CHAT_MEDIA_ALBUM_DEFAULT_UPLOAD_CONCURRENCY = 2;
export const CHAT_MEDIA_ALBUM_MAX_UPLOAD_CONCURRENCY = 4;

export const resolveChatMediaAlbumUploadConcurrency = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return CHAT_MEDIA_ALBUM_DEFAULT_UPLOAD_CONCURRENCY;
  return Math.max(1, Math.min(CHAT_MEDIA_ALBUM_MAX_UPLOAD_CONCURRENCY, Math.trunc(parsed)));
};

export const CHAT_MEDIA_ALBUM_UPLOAD_CONCURRENCY = resolveChatMediaAlbumUploadConcurrency(
  process.env.EXPO_PUBLIC_CHAT_ALBUM_UPLOAD_CONCURRENCY,
);

export type ChatAlbumUploadBucket =
  | 'chat-attachment-staging-v1-2'
  | 'chat-media';

export type ChatAlbumMediaType = 'image' | 'video';

export type ChatAlbumItemTransferState =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'uploaded'
  | 'cancelling'
  | 'retryable_failed'
  | 'terminal_failed'
  | 'cancelled';

export type DurableChatAlbumItem = {
  attachmentId: string;
  index: number;
  mediaType: ChatAlbumMediaType;
  localUri: string;
  fileName: string;
  contentType: string;
  transferState: ChatAlbumItemTransferState;
  attemptCount: number;
  uploadProgress?: number | null;
  lastError?: string | null;
  uploadCompleted?: boolean;
};

export const resolveChatAlbumItemMediaType = (item: {
  mediaType?: ChatAlbumMediaType;
  contentType: string;
}): ChatAlbumMediaType => item.mediaType ?? (
  item.contentType.toLowerCase().startsWith('video/') ? 'video' : 'image'
);

/**
 * Images enter the v1.2 moderation staging bucket. Videos remain in the private
 * media bucket. This must be resolved per item: using the album's first item
 * makes mixed albums selection-order dependent.
 */
export const resolveChatAlbumUploadBucket = (
  item: { mediaType?: ChatAlbumMediaType; contentType: string },
): ChatAlbumUploadBucket => resolveChatAlbumItemMediaType(item) === 'image'
  ? 'chat-attachment-staging-v1-2'
  : 'chat-media';

export const clampChatAlbumUploadProgress = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
};

export type ChatAlbumSendStage =
  | { kind: 'preparing'; progress: 0 }
  | { kind: 'uploading'; progress: number }
  | { kind: 'checking_safety'; progress: 1 };

/** Derives user-facing progress from the durable per-item transfer snapshot. */
export const getChatAlbumSendStage = (items: readonly {
  transferState?: ChatAlbumItemTransferState;
  uploadProgress?: number | null;
}[]): ChatAlbumSendStage | null => {
  const trackedItems = items.filter((item) => item.transferState !== undefined);
  if (trackedItems.length === 0) return null;
  if (trackedItems.some((item) => item.transferState === 'preparing')) {
    return { kind: 'preparing', progress: 0 };
  }
  if (trackedItems.every((item) => item.transferState === 'uploaded')) {
    return { kind: 'checking_safety', progress: 1 };
  }
  const progress = trackedItems.reduce((total, item) => {
    if (item.transferState === 'uploaded') return total + 1;
    if (item.transferState === 'uploading') {
      return total + clampChatAlbumUploadProgress(item.uploadProgress);
    }
    return total;
  }, 0) / trackedItems.length;
  return { kind: 'uploading', progress };
};

export const updateChatAlbumItemTransfer = <T extends {
  attachmentId: string;
  transferState?: ChatAlbumItemTransferState;
  uploadProgress?: number | null;
  lastError?: string | null;
}>(
  items: readonly T[],
  attachmentId: string,
  patch: Partial<T>,
): T[] => items.map((item) => item.attachmentId === attachmentId
  ? { ...item, ...patch }
  : item);

export const removeChatAlbumItemFromComposition = <T extends {
  attachmentId: string;
  index?: number;
}>(items: readonly T[], attachmentId: string): (T & { index: number })[] => {
  if (!items.some((item) => item.attachmentId === attachmentId)) {
    throw new Error('chat_album_attachment_not_found');
  }
  const remaining = items.filter((item) => item.attachmentId !== attachmentId);
  if (remaining.length < 1) throw new Error('chat_album_cannot_remove_last_item');
  return remaining.map((item, index) => ({ ...item, index }));
};

export const prepareChatAlbumItemsForAttempt = <T extends {
  attachmentId: string;
  transferState?: ChatAlbumItemTransferState;
  uploadProgress?: number | null;
  attemptCount?: number;
  lastError?: string | null;
  uploadCompleted?: boolean;
}>(items: readonly T[], retryAttachmentIds?: readonly string[]): T[] => {
  const retrySet = retryAttachmentIds?.length ? new Set(retryAttachmentIds) : null;
  return items.map((item) => {
    const shouldAttempt = !retrySet || retrySet.has(item.attachmentId);
    if (item.transferState === 'uploaded') return { ...item };
    if (item.uploadCompleted === true && shouldAttempt) {
      return {
        ...item,
        transferState: 'uploaded',
        uploadProgress: 1,
        lastError: null,
      };
    }
    if (!shouldAttempt) return { ...item };
    return {
      ...item,
      transferState: 'uploading',
      uploadProgress: 0,
      attemptCount: (item.attemptCount ?? 0) + 1,
      lastError: null,
    };
  });
};

export type ChatAlbumLayout =
  | { kind: 'single'; visibleCount: 1; hiddenCount: 0 }
  | { kind: 'split'; visibleCount: 2; hiddenCount: 0 }
  | { kind: 'hero-stack'; visibleCount: 3; hiddenCount: 0 }
  | { kind: 'grid'; visibleCount: 4; hiddenCount: number };

export const getChatAlbumLayout = (count: number): ChatAlbumLayout => {
  const safeCount = Math.max(1, Math.min(CHAT_MEDIA_ALBUM_MAX_ITEMS, Math.trunc(count)));
  if (safeCount === 1) return { kind: 'single', visibleCount: 1, hiddenCount: 0 };
  if (safeCount === 2) return { kind: 'split', visibleCount: 2, hiddenCount: 0 };
  if (safeCount === 3) return { kind: 'hero-stack', visibleCount: 3, hiddenCount: 0 };
  return {
    kind: 'grid',
    visibleCount: CHAT_MEDIA_ALBUM_PREVIEW_ITEMS,
    hiddenCount: Math.max(0, safeCount - CHAT_MEDIA_ALBUM_PREVIEW_ITEMS),
  };
};

export const normalizeDurableChatAlbumItems = <T extends {
  attachmentId: string;
  index?: number;
  mediaType?: ChatAlbumMediaType;
  contentType: string;
}>(items: readonly T[]): (T & { index: number; mediaType: ChatAlbumMediaType })[] => {
  if (items.length < 1 || items.length > CHAT_MEDIA_ALBUM_MAX_ITEMS) {
    throw new Error('chat_album_item_count_invalid');
  }
  const seen = new Set<string>();
  return items.map((item, index) => {
    if (!item.attachmentId || seen.has(item.attachmentId)) {
      throw new Error('chat_album_attachment_identity_invalid');
    }
    seen.add(item.attachmentId);
    const mediaType = resolveChatAlbumItemMediaType(item);
    if (mediaType !== 'image' && mediaType !== 'video') {
      throw new Error('chat_album_media_type_invalid');
    }
    if (item.index !== undefined && item.index !== index) {
      throw new Error('chat_album_order_invalid');
    }
    return { ...item, index, mediaType };
  });
};

export class ChatAlbumWorkError extends Error {
  readonly failures: readonly { index: number; error: unknown }[];

  constructor(failures: readonly { index: number; error: unknown }[]) {
    super('chat_album_item_work_failed');
    this.name = 'ChatAlbumWorkError';
    this.failures = failures;
  }
}

/** Preserves the actionable cause when the bounded worker handled one item. */
export const unwrapSingleChatAlbumWorkError = (error: unknown): unknown =>
  error instanceof ChatAlbumWorkError && error.failures.length === 1
    ? error.failures[0].error
    : error;

/** Runs work concurrently while preserving the exact input order in the result. */
export const mapChatAlbumItemsBounded = async <T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = CHAT_MEDIA_ALBUM_UPLOAD_CONCURRENCY,
): Promise<R[]> => {
  const limit = Math.max(1, Math.min(items.length || 1, Math.trunc(concurrency)));
  const results = new Array<R>(items.length);
  const failures: { index: number; error: unknown }[] = [];
  let cursor = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        failures.push({ index, error });
      }
    }
  });
  await Promise.all(runners);
  if (failures.length > 0) {
    failures.sort((left, right) => left.index - right.index);
    throw new ChatAlbumWorkError(failures);
  }
  return results;
};

export const canEditChatAlbumComposition = (state: string | null | undefined) =>
  state === 'queued' || state === 'preparing' || state === 'uploading' || state === 'retryable_failed';
