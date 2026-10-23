import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import {
  createVideoThumbnail,
  getImageMetaData,
  Image as ImageCompressor,
} from 'react-native-compressor';

import type { ChatAttachmentKind } from '@/lib/chat/attachment-lifecycle';
import { normalizeChatPreviewDimensions } from '@/lib/chat/attachments/chat-attachment-metadata';
import {
  getOfflineCacheOwnerDirectory,
  getOfflineCacheOwnerDirectoryForId,
} from '@/lib/offline/cache-scope';

export const CHAT_ATTACHMENT_PREVIEW_TARGET_BYTES = 160 * 1024;
// Performance budget only. A valid preview may exceed this without blocking a send.
export const CHAT_ATTACHMENT_PREVIEW_MAX_BYTES = 256 * 1024;
const CHAT_ATTACHMENT_PREVIEW_UPLOAD_MAX_BYTES = 1024 * 1024;
const PREVIEW_PROFILES = [
  { maxEdge: 640, quality: 0.58 },
  { maxEdge: 512, quality: 0.5 },
  { maxEdge: 448, quality: 0.44 },
  { maxEdge: 384, quality: 0.38 },
  { maxEdge: 320, quality: 0.32 },
] as const;
const PREVIEW_EDGE = PREVIEW_PROFILES[0].maxEdge;
const PREVIEW_QUALITY = PREVIEW_PROFILES[0].quality;
const PREVIEW_ROOT = `${FileSystem.cacheDirectory ?? ''}chat-attachment-previews/`;

export type ChatAttachmentPreview = {
  localUri: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  byteSize: number | null;
};

const getPreviewDirectory = async () => {
  if (!PREVIEW_ROOT) throw new Error('chat_preview_cache_unavailable');
  const ownerDirectory = await getOfflineCacheOwnerDirectory();
  const directory = `${PREVIEW_ROOT}${ownerDirectory}/`;
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
  return directory;
};

const persistPreview = async (
  sourceUri: string,
  attachmentId: string,
  width: number,
  height: number,
): Promise<ChatAttachmentPreview> => {
  const previewDirectory = await getPreviewDirectory();
  const target = `${previewDirectory}${attachmentId}.jpg`;
  await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
  await FileSystem.copyAsync({ from: sourceUri, to: target });
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) throw new Error('chat_preview_generation_failed');
  return {
    localUri: target,
    mimeType: 'image/jpeg',
    width,
    height,
    byteSize: 'size' in info && typeof info.size === 'number' ? info.size : null,
  };
};

const createJpegPreview = async (
  sourceUri: string,
  fallbackWidth?: number | null,
  fallbackHeight?: number | null,
) => {
  const sourceInfo = await FileSystem.getInfoAsync(sourceUri).catch(() => null);
  const sourceByteSize = sourceInfo?.exists && 'size' in sourceInfo
    && typeof sourceInfo.size === 'number'
    ? sourceInfo.size
    : null;
  // A preview should be meaningfully cheaper than an already-small prepared
  // image. The fixed ceiling alone can otherwise accept a recompressed JPEG
  // that is marginally larger than its source.
  const effectiveTargetBytes = sourceByteSize !== null && sourceByteSize > 0
    ? Math.min(CHAT_ATTACHMENT_PREVIEW_TARGET_BYTES, Math.floor(sourceByteSize * 0.75))
    : CHAT_ATTACHMENT_PREVIEW_TARGET_BYTES;
  let localUri: string | null = null;
  let byteSize: number | null = null;
  let selectedProfile: { maxEdge: number; quality: number } | null = null;
  for (const profile of PREVIEW_PROFILES) {
    try {
      const nextUri = await ImageCompressor.compress(sourceUri, {
        compressionMethod: 'manual',
        maxWidth: profile.maxEdge,
        maxHeight: profile.maxEdge,
        quality: profile.quality,
        input: 'uri',
        output: 'jpg',
        returnableOutputType: 'uri',
      });
      const info = await FileSystem.getInfoAsync(nextUri);
      const nextSize = info.exists && 'size' in info && typeof info.size === 'number'
        ? info.size
        : null;
      if (localUri && localUri !== sourceUri && localUri !== nextUri) {
        await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
      }
      localUri = nextUri;
      byteSize = nextSize;
      selectedProfile = profile;
      if (byteSize !== null && byteSize <= effectiveTargetBytes) break;
    } catch {
      // The ImageManipulator fallback below handles codec-specific compressor failures.
    }
  }

  if (!localUri || byteSize === null || byteSize <= 0
    || byteSize > CHAT_ATTACHMENT_PREVIEW_TARGET_BYTES) {
    const sourceMetadata = await getImageMetaData(sourceUri).catch(() => null);
    const sourceWidth = sourceMetadata?.ImageWidth ?? fallbackWidth;
    const sourceHeight = sourceMetadata?.ImageHeight ?? fallbackHeight;
    const resize = typeof sourceHeight === 'number' && typeof sourceWidth === 'number'
      && sourceHeight > sourceWidth
      ? { height: 320 }
      : { width: 320 };
    try {
      const fallback = await manipulateAsync(sourceUri, [{ resize }], {
        compress: 0.3,
        format: SaveFormat.JPEG,
      });
      const fallbackInfo = await FileSystem.getInfoAsync(fallback.uri);
      const fallbackSize = fallbackInfo.exists && 'size' in fallbackInfo
        && typeof fallbackInfo.size === 'number'
        ? fallbackInfo.size
        : null;
      if (fallbackSize !== null && fallbackSize > 0
        && (byteSize === null || byteSize <= 0 || fallbackSize < byteSize)) {
        if (localUri && localUri !== sourceUri && localUri !== fallback.uri) {
          await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
        }
        localUri = fallback.uri;
        byteSize = fallbackSize;
        selectedProfile = { maxEdge: 320, quality: 0.3 };
      } else if (fallback.uri !== sourceUri) {
        await FileSystem.deleteAsync(fallback.uri, { idempotent: true }).catch(() => undefined);
      }
    } catch {
      // A valid compressor result remains usable even when it misses the soft target.
    }
  }

  if (!localUri || byteSize === null || byteSize <= 0
    || byteSize > CHAT_ATTACHMENT_PREVIEW_UPLOAD_MAX_BYTES) {
    if (localUri && localUri !== sourceUri) {
      await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
    }
    throw new Error('chat_preview_generation_failed');
  }

  if (__DEV__) {
    console.log('[chat][preview] generated', {
      sourceBytes: sourceByteSize,
      previewBytes: byteSize,
      targetBytes: CHAT_ATTACHMENT_PREVIEW_TARGET_BYTES,
      effectiveTargetBytes,
      softMaxBytes: CHAT_ATTACHMENT_PREVIEW_MAX_BYTES,
      softMaxExceeded: byteSize > CHAT_ATTACHMENT_PREVIEW_MAX_BYTES,
      maxEdge: selectedProfile?.maxEdge ?? null,
      quality: selectedProfile?.quality ?? null,
    });
  }
  const metadata = await getImageMetaData(localUri).catch(() => null);
  const dimensions = normalizeChatPreviewDimensions({
    width: metadata?.ImageWidth ?? fallbackWidth,
    height: metadata?.ImageHeight ?? fallbackHeight,
    maxEdge: selectedProfile?.maxEdge ?? PREVIEW_EDGE,
  });
  return {
    localUri,
    byteSize,
    ...dimensions,
  };
};

export const createChatAttachmentPreview = async (args: {
  attachmentId: string;
  kind: ChatAttachmentKind;
  localUri: string;
  width?: number | null;
  height?: number | null;
}): Promise<ChatAttachmentPreview | null> => {
  if (args.kind !== 'image' && args.kind !== 'video') return null;

  if (args.kind === 'video') {
    const thumbnail = await createVideoThumbnail(args.localUri, {
      quality: PREVIEW_QUALITY,
    });
    let normalized: Awaited<ReturnType<typeof createJpegPreview>> | null = null;
    try {
      normalized = await createJpegPreview(
        thumbnail.path,
        thumbnail.width,
        thumbnail.height,
      );
      return await persistPreview(
        normalized.localUri,
        args.attachmentId,
        normalized.width,
        normalized.height,
      );
    } finally {
      if (normalized?.localUri && normalized.localUri !== thumbnail.path) {
        await FileSystem.deleteAsync(normalized.localUri, { idempotent: true })
          .catch(() => undefined);
      }
      await FileSystem.deleteAsync(thumbnail.path, { idempotent: true }).catch(() => undefined);
    }
  }

  const normalized = await createJpegPreview(
    args.localUri,
    args.width,
    args.height,
  );
  try {
    return await persistPreview(
      normalized.localUri,
      args.attachmentId,
      normalized.width,
      normalized.height,
    );
  } finally {
    if (normalized.localUri !== args.localUri) {
      await FileSystem.deleteAsync(normalized.localUri, { idempotent: true })
        .catch(() => undefined);
    }
  }
};

export const removeChatAttachmentPreview = async (uri?: string | null) => {
  if (!uri || !uri.startsWith(PREVIEW_ROOT)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
};

export const clearChatAttachmentPreviewsForOwner = async (ownerUserId: string) => {
  if (!ownerUserId || !PREVIEW_ROOT) return;
  const ownerDirectory = await getOfflineCacheOwnerDirectoryForId(ownerUserId);
  await FileSystem.deleteAsync(`${PREVIEW_ROOT}${ownerDirectory}/`, {
    idempotent: true,
  }).catch(() => undefined);
};
