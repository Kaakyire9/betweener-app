import type * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getImageMetaData,
  Image as NativeImageCompressor,
} from 'react-native-compressor';
import {
  canReuseChatImageWithoutCompression,
  CHAT_IMAGE_QUALITY_PROFILES,
  shouldPreserveAnimatedChatImage,
  type ChatImageSendQuality,
} from '@/lib/chat/media/chat-image-quality-policy';

export type { ChatImageSendQuality } from '@/lib/chat/media/chat-image-quality-policy';

const imageSize = async (uri: string, knownSize?: number | null) => {
  if (typeof knownSize === 'number' && Number.isFinite(knownSize) && knownSize > 0) {
    return knownSize;
  }
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  return info?.exists && 'size' in info && typeof info.size === 'number' ? info.size : null;
};

const replaceImageExtension = (fileName: string, extension: string) => {
  const stem = fileName.replace(/\.[^/.]+$/, '').trim() || `image-${Date.now()}`;
  return `${stem}.${extension}`;
};

export const normalizeHeicImage = async (
  asset: ImagePicker.ImagePickerAsset,
  fallbackName: string,
) => {
  const mime = asset.mimeType?.toLowerCase() ?? '';
  const name = fallbackName || `image-${Date.now()}`;
  const lowerName = name.toLowerCase();
  const isHeic = mime === 'image/heic'
    || mime === 'image/heif'
    || lowerName.endsWith('.heic')
    || lowerName.endsWith('.heif');

  if (!isHeic) {
    return {
      uri: asset.uri,
      fileName: name,
      contentType: mime || 'image/jpeg',
    };
  }

  const convertedUri = await NativeImageCompressor.compress(asset.uri, {
    compressionMethod: 'manual',
    maxWidth: 4096,
    maxHeight: 4096,
    quality: 0.92,
    input: 'uri',
    output: 'jpg',
    returnableOutputType: 'uri',
  });
  let jpegName = name.replace(/\.(heic|heif)$/i, '.jpg');
  if (!/\.[a-z0-9]+$/i.test(jpegName)) jpegName = `${jpegName}.jpg`;
  return {
    uri: convertedUri,
    fileName: jpegName,
    contentType: 'image/jpeg',
  };
};

export type PreparedChatImage = {
  uri: string;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  optimized: boolean;
  quality: ChatImageSendQuality;
};

/**
 * Produces a bounded chat copy without mutating the picker asset. Standard
 * quality is tuned for quick messaging; HD keeps substantially more detail.
 * Animated GIFs are preserved because raster recompression would destroy the
 * animation.
 */
export const prepareChatImageForSend = async (
  asset: ImagePicker.ImagePickerAsset,
  fallbackName: string,
  quality: ChatImageSendQuality = 'standard',
): Promise<PreparedChatImage> => {
  const startedAt = Date.now();
  const profile = CHAT_IMAGE_QUALITY_PROFILES[quality];
  const normalized = await normalizeHeicImage(asset, fallbackName);
  const sourceSize = await imageSize(
    normalized.uri,
    normalized.uri === asset.uri ? asset.fileSize : null,
  );
  const sourceMime = normalized.contentType.toLowerCase();

  if (shouldPreserveAnimatedChatImage(sourceMime, normalized.fileName)) {
    const prepared = {
      ...normalized,
      sizeBytes: sourceSize,
      width: asset.width ?? null,
      height: asset.height ?? null,
      optimized: normalized.uri !== asset.uri,
      quality,
    };
    if (__DEV__) console.log('[chat][image-preparation] complete', {
      durationMs: Date.now() - startedAt,
      quality,
      sourceBytes: sourceSize,
      preparedBytes: sourceSize,
      optimized: prepared.optimized,
      preservedAnimation: true,
    });
    return prepared;
  }

  const sourceAlreadyFits = canReuseChatImageWithoutCompression({
    mime: sourceMime,
    byteSize: sourceSize,
    width: asset.width,
    height: asset.height,
    quality,
  });
  if (sourceAlreadyFits) {
    const prepared = {
      ...normalized,
      sizeBytes: sourceSize,
      width: asset.width ?? null,
      height: asset.height ?? null,
      optimized: normalized.uri !== asset.uri,
      quality,
    };
    if (__DEV__) console.log('[chat][image-preparation] complete', {
      durationMs: Date.now() - startedAt,
      quality,
      sourceBytes: sourceSize,
      preparedBytes: sourceSize,
      optimized: prepared.optimized,
      preservedAnimation: false,
    });
    return prepared;
  }

  const compress = (uri: string, maxEdge: number, compressionQuality: number) =>
    NativeImageCompressor.compress(uri, {
      compressionMethod: 'manual',
      maxWidth: maxEdge,
      maxHeight: maxEdge,
      quality: compressionQuality,
      input: 'uri',
      output: 'jpg',
      returnableOutputType: 'uri',
    });

  let preparedUri = await compress(normalized.uri, profile.maxEdge, profile.quality);
  let preparedSize = await imageSize(preparedUri);
  if (preparedSize !== null && preparedSize > profile.targetBytes) {
    preparedUri = await compress(
      preparedUri,
      profile.fallbackMaxEdge,
      profile.fallbackQuality,
    );
    preparedSize = await imageSize(preparedUri);
  }
  const metadata = await getImageMetaData(preparedUri).catch(() => null);

  const prepared = {
    uri: preparedUri,
    fileName: replaceImageExtension(normalized.fileName, 'jpg'),
    contentType: 'image/jpeg',
    sizeBytes: preparedSize,
    width: Number(metadata?.ImageWidth) || asset.width || null,
    height: Number(metadata?.ImageHeight) || asset.height || null,
    optimized: preparedUri !== asset.uri,
    quality,
  };
  if (__DEV__) console.log('[chat][image-preparation] complete', {
    durationMs: Date.now() - startedAt,
    quality,
    sourceBytes: sourceSize,
    preparedBytes: preparedSize,
    optimized: true,
    preservedAnimation: false,
  });
  return prepared;
};
