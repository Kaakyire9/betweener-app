import Constants from 'expo-constants';

import { createLiveSessionLinks, type LiveAppIdentity } from './live-link-environment.ts';

const getRuntimeAppIdentity = (): LiveAppIdentity | null => {
  const identity = Constants.expoConfig?.extra?.appIdentity;
  return identity && typeof identity === 'object' ? identity as LiveAppIdentity : null;
};

export const createCurrentLiveSessionLinks = (sessionId: string) =>
  createLiveSessionLinks(sessionId, getRuntimeAppIdentity());
