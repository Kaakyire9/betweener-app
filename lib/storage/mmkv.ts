import { createMMKV, type MMKV } from 'react-native-mmkv';

import { captureException } from '@/lib/telemetry/sentry';

let storage: MMKV | null | undefined;

const getStorage = () => {
  if (storage !== undefined) return storage;
  try {
    storage = createMMKV({ id: 'betweener.boot' });
  } catch (error) {
    storage = null;
    captureException(error, { where: 'createMMKV:betweener.boot' });
  }
  return storage;
};

export const getString = (key: string): string | undefined => getStorage()?.getString(key);

export const setString = (key: string, value: string): void => {
  getStorage()?.set(key, value);
};

export const getBoolean = (key: string): boolean | undefined => getStorage()?.getBoolean(key);

export const setBoolean = (key: string, value: boolean): void => {
  getStorage()?.set(key, value);
};

export const getNumber = (key: string): number | undefined => getStorage()?.getNumber(key);

export const setNumber = (key: string, value: number): void => {
  getStorage()?.set(key, value);
};

export const deleteKey = (key: string): void => {
  getStorage()?.remove(key);
};

export const getAllKeys = (): string[] => getStorage()?.getAllKeys() ?? [];
