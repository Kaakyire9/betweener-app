import type { StreamVideoClient } from '@stream-io/video-react-native-sdk';

const leaseCounts = new Map<StreamVideoClient, number>();
let activeClient: StreamVideoClient | null = null;

/** Makes an already-authenticated Live client available to native background-call events. */
export function registerStreamVideoBackgroundClient(client: StreamVideoClient): void {
  leaseCounts.set(client, (leaseCounts.get(client) ?? 0) + 1);
  activeClient = client;
}

export function unregisterStreamVideoBackgroundClient(client: StreamVideoClient): void {
  const nextCount = (leaseCounts.get(client) ?? 0) - 1;
  if (nextCount > 0) {
    leaseCounts.set(client, nextCount);
    return;
  }

  leaseCounts.delete(client);
  if (activeClient === client) {
    activeClient = [...leaseCounts.keys()].at(-1) ?? null;
  }
}

export function getStreamVideoBackgroundClient(): StreamVideoClient | undefined {
  return activeClient ?? undefined;
}
