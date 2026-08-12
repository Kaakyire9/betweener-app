import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/** Owns focus-scoped realtime subscription cleanup for a chat thread. */
export const useChatThreadRealtime = (start: () => (() => void) | void) => {
  useFocusEffect(useCallback(() => start() ?? (() => {}), [start]));
};
