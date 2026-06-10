import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface UploadImageOptions {
  userId: string;
  uri: string;
  bucket?: string;
  folder?: string;
  compress?: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

export interface UploadResult {
  publicUrl: string;
  path: string;
  previewUri?: string;
  error?: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const readFileAsUint8Array = async (uri: string) => {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Uint8Array(byteNumbers);
};

/**
 * Upload an image to Supabase storage
 */
export async function uploadImage({
  userId,
  uri,
  bucket = 'profile-photos',
  folder,
  compress = true,
  maxWidth: _maxWidth = 1080,
  maxHeight: _maxHeight = 1080,
}: UploadImageOptions): Promise<UploadResult> {
  try {
    let uploadUri = uri;
    const normalizedUri = uri.split('?')[0] || uri;
    const shouldNormalizeToJpeg =
      normalizedUri.startsWith('file://') ||
      normalizedUri.startsWith('content://') ||
      normalizedUri.startsWith('ph://') ||
      normalizedUri.startsWith('assets-library://');

    if (shouldNormalizeToJpeg) {
      const manipulateResult = await manipulateAsync(
        uri,
        [],
        {
          compress: compress ? 0.88 : 1,
          format: SaveFormat.JPEG,
        },
      );
      uploadUri = manipulateResult.uri;
    }

    const uploadNormalizedUri = uploadUri.split('?')[0] || uploadUri;
    const uploadFileExtension = shouldNormalizeToJpeg
      ? 'jpeg'
      : uploadNormalizedUri.split('.').pop()?.toLowerCase() || 'jpg';
    const normalizedExtension = uploadFileExtension === 'jpg' ? 'jpeg' : uploadFileExtension;
    const fallbackMimeType =
      MIME_BY_EXTENSION[uploadFileExtension] || MIME_BY_EXTENSION[normalizedExtension] || 'image/jpeg';
    const timestamp = Date.now();
    const fileName = `${timestamp}.${normalizedExtension}`;
    
    // Determine the full path
    const folderPath = folder || userId;
    const filePath = `${folderPath}/${fileName}`;

    const bytes = await readFileAsUint8Array(uploadUri);
    const contentType = fallbackMimeType;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, bytes, {
        contentType,
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      console.error('Upload error:', error);
      return {
        publicUrl: '',
        path: '',
        error: error.message,
      };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return {
      publicUrl,
      path: filePath,
      previewUri: uploadUri,
    };
  } catch (error) {
    console.error('Upload image error:', error);
    return {
      publicUrl: '',
      path: '',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Delete an image from Supabase storage
 */
export async function deleteImage(
  filePath: string,
  bucket: string = 'profile-photos'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      console.error('Delete error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Delete image error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * List all images for a user
 */
export async function listUserImages(
  userId: string,
  bucket: string = 'profile-photos'
): Promise<{ files: string[]; error?: string }> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(userId);

    if (error) {
      console.error('List files error:', error);
      return {
        files: [],
        error: error.message,
      };
    }

    // Return only image files
    const imageFiles = data
      ?.filter(file => file.name.match(/\.(jpg|jpeg|png|webp|heic)$/i))
      .map(file => `${userId}/${file.name}`) || [];

    return { files: imageFiles };
  } catch (error) {
    console.error('List user images error:', error);
    return {
      files: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get public URL for a storage file
 */
export function getPublicUrl(
  filePath: string,
  bucket: string = 'profile-photos'
): string {
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);
    
  return publicUrl;
}
