import { supabase } from '@/lib/supabase';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert } from 'react-native';

export function useImagePicker() {
  const [image, setImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Sorry, we need camera roll permissions to upload photos.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const manipulatedImage = await manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 500, height: 500 } }],
          { compress: 0.8, format: SaveFormat.JPEG }
        );
        setImage(manipulatedImage.uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
      console.error('Image picker error:', error);
    }
  };

  const uploadImage = async (uri: string, bucket: string = 'profiles'): Promise<string | null> => {
    setIsUploading(true);
    try {
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

      // Read file as array buffer for React Native
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileBody = new Uint8Array(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, fileBody, {
          contentType: `image/${fileExt}`,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
      return data.publicUrl;
    } catch (error) {
      console.error('Image upload error:', error);
      Alert.alert('Upload Error', 'Failed to upload image');
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const reset = () => {
    setImage(null);
  };

  return {
    image,
    isUploading,
    pickImage,
    uploadImage,
    reset,
    setImage,
  };
}