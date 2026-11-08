interface PublisherTrack { kind: string; enabled: boolean; readyState: string; stop(): void; release?(): void }
interface Publisher { dispose(): Promise<void>; getPublishedTracks(): PublisherTrack[] }

/** Manual peer disposal transfers ownership away from the SDK's live call.
 * DeviceManager.disable can then stop/release capture without sending a late
 * stopPublish through an already closed publisher. Retain clones independently
 * so a hung/failed disposal never prevents their immediate hard stop. */
export function createNativePublisherRetirement<P extends Publisher>(call: { publisher?: P }) {
  const retained = new Set<PublisherTrack>();
  const tracks = () => {
    for (const track of call.publisher?.getPublishedTracks() ?? []) retained.add(track);
    return [...retained];
  };
  return {
    tracks,
    async dispose() {
      const publisher = call.publisher;
      if (!publisher) return;
      // Retain references before disposal clears transceiver caches. A failed
      // inspection cannot prevent the independent peer-close request.
      try { tracks(); } catch { /* Previously observed tracks remain owned. */ }
      try {
        // The pinned SDK closes the peer before its first await. Transfer the
        // reference immediately afterwards; the owner still awaits disposal.
        const disposal = publisher.dispose();
        if (call.publisher === publisher) call.publisher = undefined;
        await disposal;
      } catch (error) {
        // Keep an uncertain peer visible for SDK retry and release inspection.
        // Never overwrite a peer created by an in-flight reconnect.
        if (!call.publisher) call.publisher = publisher;
        throw error;
      }
    },
  };
}
