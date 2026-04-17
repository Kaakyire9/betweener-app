export type NetworkQualitySnapshot = {
  activeSlowRequests: number;
  slowUntil: number;
};

type NetworkQualityListener = (snapshot: NetworkQualitySnapshot) => void;

type NetworkQualityMonitor = {
  originalFetch: typeof fetch;
  listeners: Set<NetworkQualityListener>;
  snapshot: NetworkQualitySnapshot;
  emit: () => void;
};

declare global {
  // Kept on globalThis so Fast Refresh does not stack multiple fetch wrappers.
  var __BETWEENER_NETWORK_QUALITY_MONITOR__: NetworkQualityMonitor | undefined;
}

const SLOW_REQUEST_THRESHOLD_MS = 4200;
const SLOW_VISIBLE_HOLD_MS = 6500;
const SLOW_RECOVERY_HOLD_MS = 4200;

const IGNORED_URL_PARTS = [
  'sentry.io',
  'clients3.google.com/generate_204',
  'localhost:',
  '127.0.0.1:',
];

const getRequestUrl = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();

  const maybeUrl = (input as { url?: unknown })?.url;
  return typeof maybeUrl === 'string' ? maybeUrl : '';
};

const shouldTrackRequest = (input: RequestInfo | URL) => {
  const url = getRequestUrl(input);
  if (!/^https?:\/\//i.test(url)) return false;

  const lowerUrl = url.toLowerCase();
  return !IGNORED_URL_PARTS.some((part) => lowerUrl.includes(part));
};

const createSnapshot = (snapshot: NetworkQualitySnapshot): NetworkQualitySnapshot => ({
  activeSlowRequests: snapshot.activeSlowRequests,
  slowUntil: snapshot.slowUntil,
});

const ensureNetworkQualityMonitor = () => {
  if (globalThis.__BETWEENER_NETWORK_QUALITY_MONITOR__) {
    return globalThis.__BETWEENER_NETWORK_QUALITY_MONITOR__;
  }

  if (typeof globalThis.fetch !== 'function') {
    return null;
  }

  const originalFetch = globalThis.fetch.bind(globalThis) as typeof fetch;

  const monitor: NetworkQualityMonitor = {
    originalFetch,
    listeners: new Set<NetworkQualityListener>(),
    snapshot: {
      activeSlowRequests: 0,
      slowUntil: 0,
    },
    emit: () => {
      const snapshot = createSnapshot(monitor.snapshot);
      monitor.listeners.forEach((listener) => listener(snapshot));
    },
  };

  const markSlow = () => {
    monitor.snapshot.slowUntil = Math.max(monitor.snapshot.slowUntil, Date.now() + SLOW_VISIBLE_HOLD_MS);
    monitor.emit();
  };

  const patchedFetch: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldTrackRequest(input)) {
      return originalFetch(input, init);
    }

    let completed = false;
    let countedAsSlow = false;

    const slowTimer = setTimeout(() => {
      if (completed) return;
      countedAsSlow = true;
      monitor.snapshot.activeSlowRequests += 1;
      markSlow();
    }, SLOW_REQUEST_THRESHOLD_MS);

    return originalFetch(input, init).finally(() => {
      completed = true;
      clearTimeout(slowTimer);

      if (!countedAsSlow) return;

      monitor.snapshot.activeSlowRequests = Math.max(0, monitor.snapshot.activeSlowRequests - 1);
      monitor.snapshot.slowUntil = Math.max(monitor.snapshot.slowUntil, Date.now() + SLOW_RECOVERY_HOLD_MS);
      monitor.emit();
    });
  }) as typeof fetch;

  globalThis.fetch = patchedFetch;
  globalThis.__BETWEENER_NETWORK_QUALITY_MONITOR__ = monitor;

  return monitor;
};

export const getNetworkQualitySnapshot = (): NetworkQualitySnapshot => {
  const monitor = ensureNetworkQualityMonitor();
  return monitor ? createSnapshot(monitor.snapshot) : { activeSlowRequests: 0, slowUntil: 0 };
};

export const subscribeToNetworkQuality = (listener: NetworkQualityListener) => {
  const monitor = ensureNetworkQualityMonitor();
  if (!monitor) return () => undefined;

  monitor.listeners.add(listener);
  listener(createSnapshot(monitor.snapshot));

  return () => {
    monitor.listeners.delete(listener);
  };
};
