import * as FileSystem from 'expo-file-system/legacy';

import {
  CHAT_STORAGE_MINIMUM_RESERVE_BYTES,
  hasLocalStorageCapacity,
} from '@/lib/offline/storage-capacity-policy';

export const assertLocalStorageCapacity = async (
  requiredBytes: number,
  reserveBytes = CHAT_STORAGE_MINIMUM_RESERVE_BYTES,
) => {
  if (!Number.isFinite(requiredBytes) || requiredBytes <= 0) return;
  try {
    const freeBytes = await FileSystem.getFreeDiskStorageAsync();
    if (!hasLocalStorageCapacity({ freeBytes, requiredBytes, reserveBytes })) {
      const error = new Error('chat_storage_capacity_insufficient');
      (error as Error & { code?: string }).code = 'chat_storage_capacity_insufficient';
      throw error;
    }
  } catch (error) {
    if ((error as { code?: string })?.code === 'chat_storage_capacity_insufficient') throw error;
    // Unsupported free-space probes must not make otherwise valid devices unusable.
  }
};
