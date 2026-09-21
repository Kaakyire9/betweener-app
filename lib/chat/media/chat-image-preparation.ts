import type * as ImagePicker from 'expo-image-picker';
import { Image as NativeImageCompressor } from 'react-native-compressor';

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
