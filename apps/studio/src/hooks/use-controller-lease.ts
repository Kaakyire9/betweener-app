import { useEffect, useRef, useState } from 'react';
import type { StudioOperationalSnapshot } from '@betweener/live-program-domain';

import { studioApi } from '../api/studio-api.ts';

export const studioControllerInstanceId = (): string => {
  const key = 'betweener-studio-controller-instance';
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(key, created);
  return created;
};

export const useControllerLease = ({
  snapshot,
  controllerInstanceId,
  onLeaseLost,
  onLeaseRenewed,
}: {
  snapshot: StudioOperationalSnapshot | null;
  controllerInstanceId: string;
  onLeaseLost: () => void;
  onLeaseRenewed: () => void;
}) => {
  const [renewing, setRenewing] = useState(false);
  const busy = useRef(false);
  const controller = snapshot?.program.controller;
  const ownsControl = controller?.source === 'studio_host'
    && controller.instanceId === controllerInstanceId;
  const sessionId = snapshot?.session.id;
  const controllerGeneration = controller?.generation;

  useEffect(() => {
    if (!ownsControl || !sessionId || controllerGeneration === undefined) return undefined;
    const renew = async () => {
      if (busy.current) return;
      busy.current = true;
      setRenewing(true);
      try {
        const result = await studioApi.renewControl({
          sessionId,
          controllerInstanceId,
          expectedControllerGeneration: controllerGeneration,
        });
        if (!result.renewed) onLeaseLost();
        else onLeaseRenewed();
      } catch {
        // A transient failure is allowed one lease window. The authoritative
        // expiry and the next refresh decide ownership.
      } finally {
        busy.current = false;
        setRenewing(false);
      }
    };
    const interval = window.setInterval(() => { void renew(); }, 10_000);
    return () => window.clearInterval(interval);
  }, [controllerGeneration, controllerInstanceId, onLeaseLost, onLeaseRenewed, ownsControl, sessionId]);

  return { ownsControl, renewing };
};
