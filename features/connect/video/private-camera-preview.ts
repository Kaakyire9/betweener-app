import type { ReactNode } from 'react';

export interface PrivateVideoPresentation { render(): ReactNode }
export interface PrivateCameraResource { presentation: PrivateVideoPresentation; stop(): Promise<void> }
/** Keep a failed allocation reachable until its own cleanup is acknowledged. */
export class PrivateCameraAllocationError extends Error {
  readonly resource: PrivateCameraResource;
  constructor(resource: PrivateCameraResource) { super('connect_camera_cleanup_unconfirmed'); this.resource = resource; }
}
export interface PrivateCameraPreview {
  start(current: () => boolean): Promise<void>;
  stop(): Promise<void>;
  presentation(): PrivateVideoPresentation | null;
  released(): boolean;
}

/** Local capture ownership only. No peer connection, participant token, client or publication. */
export function createPrivateCameraPreview(open: (current: () => boolean) => Promise<PrivateCameraResource>): PrivateCameraPreview {
  let epoch = 0, resource: PrivateCameraResource | null = null;
  let pending: Promise<PrivateCameraResource> | null = null, stopping: Promise<void> | null = null;
  let visible = false;
  const preview: PrivateCameraPreview = {
    async start(current) {
      const stopped = preview.stop(), generation = epoch;
      await stopped;
      const active = () => epoch === generation && current();
      if (!active()) return;
      const opening = Promise.resolve().then(() => open(active)); pending = opening;
      try {
        const next = await opening;
        resource = next;
        if (!active()) {
          // Retiring this allocation must not cancel a newer Start waiting for it.
          if (stopping) await stopping;
          else { await next.stop(); if (resource === next) resource = null; }
          return;
        }
        visible = true;
      } catch (error) {
        if (error instanceof PrivateCameraAllocationError) resource = error.resource;
        throw error;
      } finally { if (pending === opening) pending = null; }
    },
    stop() {
      ++epoch; visible = false;
      if (stopping) return stopping;
      const opening = pending;
      const operation = (async () => {
        // A late allocation must be stopped before a connected camera can own the device.
        const next = resource ?? (opening ? await opening.catch(error => error instanceof PrivateCameraAllocationError ? error.resource : null) : null);
        if (pending === opening) pending = null;
        if (next) { resource = next; await next.stop(); if (resource === next) resource = null; }
      })();
      stopping = operation.finally(() => { stopping = null; });
      return stopping;
    },
    presentation: () => visible && resource ? resource.presentation : null,
    released: () => !resource && !pending && !stopping,
  };
  return preview;
}
