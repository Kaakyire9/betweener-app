import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { Video as VideoCompressor, getRealPath } from 'react-native-compressor';

import { validateChatAttachment } from '@/lib/chat/attachment-policy';

const COMPRESS_WHEN_OVER_BYTES = 12 * 1024 * 1024;
const CHAT_VIDEO_MAX_DIMENSION = 1280;

type PrepareChatVideoInput = {
  uri: string;
  fileName: string;
  contentType: string;
  sizeBytes?: number | null;
  durationMs?: number | null;
  onProgress?: (progress: number) => void;
};

export type PreparedChatVideo = {
  uri: string;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  optimized: boolean;
};

const readFileSize = async (uri: string, knownSize?: number | null) => {
  if (typeof knownSize === 'number' && Number.isFinite(knownSize) && knownSize > 0) {
    return knownSize;
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
};

const mp4FileName = (fileName: string) => {
  const stem = fileName.replace(/\.[^/.]+$/, '').trim() || `video-${Date.now()}`;
  return `${stem}.mp4`;
};

export const prepareChatVideo = async ({
  uri,
  fileName,
  contentType,
  sizeBytes,
  durationMs,
  onProgress,
}: PrepareChatVideoInput): Promise<PreparedChatVideo> => {
  let sourceUri = uri;
  if (Platform.OS === 'android' && sourceUri.startsWith('content://')) {
    try {
      const realPath = await getRealPath(sourceUri, 'video');
      if (typeof realPath === 'string' && realPath.length > 0) sourceUri = realPath;
    } catch {
      // The compressor can handle many content URIs directly; keep the original as fallback.
    }
  }

  const sourceSize = await readFileSize(sourceUri, sizeBytes);
  const selectionError = validateChatAttachment({
    kind: 'video',
    fileName,
    mimeType: contentType,
    sizeBytes: sourceSize,
    durationMs,
  });
  if (selectionError) throw new Error(selectionError);

  let uploadUri = sourceUri;
  let optimized = false;
  if (sourceSize == null || sourceSize > COMPRESS_WHEN_OVER_BYTES) {
    try {
      const compressedUri = await VideoCompressor.compress(
        sourceUri,
        {
          compressionMethod: 'auto',
          maxSize: CHAT_VIDEO_MAX_DIMENSION,
          minimumFileSizeForCompress: 0,
        },
        (progress) => onProgress?.(Math.max(0, Math.min(1, Number(progress) || 0))),
      );
      if (typeof compressedUri === 'string' && compressedUri.length > 0) {
        uploadUri = compressedUri;
        optimized = compressedUri !== sourceUri;
      }
    } catch (error) {
      console.warn('[chat] video optimization failed; validating original', error);
    }
  }

  const uploadSize = await readFileSize(uploadUri);
  const uploadError = validateChatAttachment({
    kind: 'video',
    fileName,
    mimeType: contentType,
    sizeBytes: uploadSize,
    durationMs,
  }, 'upload');
  if (uploadError) throw new Error(uploadError);

  return {
    uri: uploadUri,
    fileName: optimized ? mp4FileName(fileName) : fileName,
    contentType: optimized ? 'video/mp4' : contentType,
    sizeBytes: uploadSize,
    optimized,
  };
};
