export const CHAT_MEDIA_ALBUM_MAX_ITEMS = 10;
export const CHAT_MEDIA_ALBUM_PREVIEW_ITEMS = 4;
export const CHAT_MEDIA_ALBUM_UPLOAD_CONCURRENCY = 2;

export type ChatAlbumMediaType = 'image' | 'video';

export type ChatAlbumItemTransferState =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'uploaded'
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
  lastError?: string | null;
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
    const mediaType = item.mediaType ?? (item.contentType.startsWith('video/') ? 'video' : 'image');
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
