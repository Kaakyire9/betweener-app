import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseLiveCreationDraft,
  type LiveCreationDraft,
} from './live-creation-draft.ts';

export const loadLiveCreationDraft = async (
  storageKey: string,
  circleId: string | null,
) => {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    return parseLiveCreationDraft(JSON.parse(raw), circleId);
  } catch {
    return null;
  }
};

export const saveLiveCreationDraft = async (
  storageKey: string,
  draft: LiveCreationDraft,
) => {
  await AsyncStorage.setItem(storageKey, JSON.stringify(draft));
};

export const clearLiveCreationDraft = async (storageKey: string) => {
  await AsyncStorage.removeItem(storageKey);
};
