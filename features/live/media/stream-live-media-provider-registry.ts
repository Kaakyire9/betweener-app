import { StreamLiveMediaProvider } from './stream-live-media-provider.ts';

type ProviderEntry = {
  provider: StreamLiveMediaProvider;
  leaseCount: number;
  disposeTimer: ReturnType<typeof setTimeout> | null;
};

export type StreamLiveMediaProviderLease = {
  provider: StreamLiveMediaProvider;
  release(): void;
};

const PROVIDER_DISPOSE_GRACE_MS = 1_500;
const providers = new Map<string, ProviderEntry>();

/**
 * Owns one transport provider per Live session. The grace period bridges
 * StrictMode/Fast Refresh and route hand-offs without allowing an obsolete
 * cleanup to disconnect the replacement screen's Stream client.
 */
export const acquireStreamLiveMediaProvider = (
  sessionId: string,
): StreamLiveMediaProviderLease => {
  const key = sessionId.trim();
  let entry = providers.get(key);
  if (!entry) {
    entry = {
      provider: new StreamLiveMediaProvider(),
      leaseCount: 0,
      disposeTimer: null,
    };
    providers.set(key, entry);
  }

  if (entry.disposeTimer) clearTimeout(entry.disposeTimer);
  entry.disposeTimer = null;
  entry.leaseCount += 1;
  let released = false;

  return {
    provider: entry.provider,
    release() {
      if (released) return;
      released = true;
      entry!.leaseCount = Math.max(0, entry!.leaseCount - 1);
      if (entry!.leaseCount > 0) return;
      entry!.disposeTimer = setTimeout(() => {
        if (entry!.leaseCount > 0 || providers.get(key) !== entry) return;
        providers.delete(key);
        entry!.disposeTimer = null;
        void entry!.provider.dispose();
      }, PROVIDER_DISPOSE_GRACE_MS);
    },
  };
};
