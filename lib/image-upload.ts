import { supabase } from './supabase';

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
  error?: string;
}

/**
 * Upload an image to Supabase storage
 */
export async function uploadImage({
  userId,
  uri,
  bucket = 'profile-photos',
  folder,
  compress = true,
  maxWidth = 1080,
  maxHeight = 1080,
}: UploadImageOptions): Promise<UploadResult> {
  try {
    // Get file extension from URI
    const fileExtension = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const timestamp = Date.now();
    const fileName = `${timestamp}.${fileExtension}`;
    
    // Determine the full path
    const folderPath = folder || userId;
    const filePath = `${folderPath}/${fileName}`;

    // For React Native, we need to use the file URI directly
    // Create a file object that Supabase can handle
    const file = {
      uri,
      type: `image/${fileExtension}`,
      name: fileName,
    };

    // Upload to Supabase Storage using the file object
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file as any, {
        contentType: `image/${fileExtension}`,
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