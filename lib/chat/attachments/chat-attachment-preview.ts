import * as FileSystem from 'expo-file-system/legacy';
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

const PREVIEW_EDGE = 640;
const PREVIEW_QUALITY = 0.72;
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
  const localUri = await ImageCompressor.compress(sourceUri, {
    compressionMethod: 'manual',
    maxWidth: PREVIEW_EDGE,
    maxHeight: PREVIEW_EDGE,
    quality: PREVIEW_QUALITY,
    input: 'uri',
    output: 'jpg',
    returnableOutputType: 'uri',
  });
  const metadata = await getImageMetaData(localUri).catch(() => null);
  const dimensions = normalizeChatPreviewDimensions({
    width: metadata?.ImageWidth ?? fallbackWidth,
    height: metadata?.ImageHeight ?? fallbackHeight,
    maxEdge: PREVIEW_EDGE,
  });
  return {
    localUri,
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
    const normalized = await createJpegPreview(
      thumbnail.path,
      thumbnail.width,
      thumbnail.height,
    );
    return persistPreview(
      normalized.localUri,
      args.attachmentId,
      normalized.width,
      normalized.height,
    );
  }

  const normalized = await createJpegPreview(
    args.localUri,
    args.width,
    args.height,
  );
  return persistPreview(
    normalized.localUri,
    args.attachmentId,
    normalized.width,
    normalized.height,
  );
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
