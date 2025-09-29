import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

export interface SimpleUploadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

/**
 * Simple, reliable image upload for React Native + Supabase
 */
export async function uploadImageSimple(
  uri: string, 
  userId: string, 
  bucket: string = 'profile-photos'
): Promise<SimpleUploadResult> {
  try {
    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      return { success: false, error: 'File does not exist' };
    }

    // Generate unique filename
    const fileExtension = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${Date.now()}.${fileExtension}`;
    const filePath = `${userId}/${fileName}`;

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    // Convert base64 to blob-like object for Supabase
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    // Upload to Supabase
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, byteArray, {
        contentType: `image/${fileExtension}`,
        upsert: false,
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return { success: true, publicUrl };

  } catch (error) {
    console.error('Upload error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}