import * as FileSystem from 'expo-file-system/legacy';
import { AppState, Platform } from 'react-native';
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

const waitForForeground = async () => {
  if (AppState.currentState === 'active') return;
  await new Promise<void>((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      subscription.remove();
      resolve();
    });
    // Close the foreground transition race between the initial check and
    // listener registration.
    if (AppState.currentState === 'active') {
      subscription.remove();
      resolve();
    }
  });
};

const compressVideo = async (
  sourceUri: string,
  onProgress?: (progress: number) => void,
) => VideoCompressor.compress(
  sourceUri,
  {
    compressionMethod: 'auto',
    maxSize: CHAT_VIDEO_MAX_DIMENSION,
    minimumFileSizeForCompress: 0,
  },
  (progress) => onProgress?.(Math.max(0, Math.min(1, Number(progress) || 0))),
);

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
    let movedToBackground = false;
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') movedToBackground = true;
    });
    try {
      let compressedUri: string;
      try {
        compressedUri = await compressVideo(sourceUri, onProgress);
      } catch (error) {
        if (!movedToBackground && AppState.currentState === 'active') throw error;
        await waitForForeground();
        onProgress?.(0);
        compressedUri = await compressVideo(sourceUri, onProgress);
      }
      if (typeof compressedUri === 'string' && compressedUri.length > 0) {
        uploadUri = compressedUri;
        optimized = compressedUri !== sourceUri;
      }
    } catch (error) {
      console.warn('[chat] video optimization failed; validating original', error);
    } finally {
      appStateSubscription.remove();
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
