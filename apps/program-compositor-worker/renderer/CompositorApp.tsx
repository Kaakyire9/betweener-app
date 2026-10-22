import { StreamCall, StreamVideo, StreamVideoClient, type Call } from '@stream-io/video-react-sdk';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  parseCompositorBootstrap,
  parseCompositorSnapshot,
  type CompositorBootstrap,
  type CompositorSnapshot,
} from './contracts.ts';
import { ProgramCanvas } from './ProgramCanvas.tsx';
import {
  compositorAdaptiveStageV2Flags,
  resolveCompositorAdaptiveStageShadow,
} from './adaptive-stage-shadow.ts';
import { compositorReleaseProvenance } from './release-provenance.ts';

type Runtime = { bootstrap: CompositorBootstrap; client: StreamVideoClient; call: Call };

const parameters = new URL(window.location.href).searchParams;
const sessionId = parameters.get('session') ?? '';
const nonce = parameters.get('nonce') ?? '';

const request = async (path: string, init?: RequestInit) => {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { ...init?.headers, 'x-compositor-nonce': nonce },
  });
  if (!response.ok) throw new Error(`broadcast_compositor_renderer_http_${response.status}`);
  return response.json() as Promise<unknown>;
};

const report = async (status: 'ready' | 'failed', reasonCode?: string) => {
  await request(`/internal/session/${sessionId}/readiness`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, reasonCode: reasonCode ?? null }),
  }).catch(() => undefined);
};

const reportDiagnostic = async (eventName: string, safeDetails: Record<string, unknown>) => {
  await request(`/internal/session/${sessionId}/diagnostic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      eventName,
      safeDetails: { ...safeDetails, ...compositorReleaseProvenance },
    }),
  }).catch(() => undefined);
};

export function CompositorApp() {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [snapshot, setSnapshot] = useState<CompositorSnapshot | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const lastShadowKey = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId || nonce.length < 32) {
      setFailure('broadcast_compositor_renderer_admission_invalid');
      return undefined;
    }
    let cancelled = false;
    let active: Runtime | null = null;
    const connect = async () => {
      try {
        const bootstrap = parseCompositorBootstrap(
          await request(`/internal/session/${sessionId}/bootstrap`),
        );
        const tokenProvider = async () => {
          const value = await request(`/internal/session/${sessionId}/token`, { method: 'POST' });
          const token = value && typeof value === 'object' && 'callToken' in value
            ? String(value.callToken) : '';
          if (!token) throw new Error('broadcast_compositor_token_invalid');
          return token;
        };
        const client = new StreamVideoClient({
          apiKey: bootstrap.apiKey,
          user: bootstrap.user,
          token: bootstrap.callToken,
          tokenProvider,
        });
        const call = client.call(bootstrap.call.type, bootstrap.call.id);
        await call.join({ create: false });
        if (cancelled) {
          await call.leave().catch(() => undefined);
          await client.disconnectUser().catch(() => undefined);
          return;
        }
        active = { bootstrap, client, call };
        setRuntime(active);
        setSnapshot(bootstrap.snapshot);
        document.body.dataset.compositorStatus = 'ready';
        await report('ready');
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'broadcast_compositor_renderer_failed';
        document.body.dataset.compositorStatus = 'failed';
        setFailure(reason);
        await report('failed', reason);
      }
    };
    void connect();
    return () => {
      cancelled = true;
      if (active) {
        void active.call.leave().catch(() => undefined);
        void active.client.disconnectUser().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!runtime) return undefined;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = parseCompositorSnapshot(
          await request(`/internal/session/${sessionId}/state`),
        );
        if (!cancelled) setSnapshot(next);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'broadcast_compositor_state_failed';
        if (!cancelled) setFailure(reason);
      }
    };
    const interval = window.setInterval(() => { void refresh(); }, 750);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [runtime]);

  useEffect(() => {
    if (!snapshot || !compositorAdaptiveStageV2Flags.shadow) return;
    const shadow = resolveCompositorAdaptiveStageShadow(snapshot);
    const key = `${snapshot.program.programVersion}:${shadow.plan?.planHash ?? shadow.events[0]?.details.reason_code ?? 'error'}`;
    if (lastShadowKey.current === key) return;
    lastShadowKey.current = key;
    shadow.events.forEach((event) => {
      console.info(event.name, { ...event.details, ...compositorReleaseProvenance });
      if (compositorAdaptiveStageV2Flags.diagnostics) {
        void reportDiagnostic(event.name, event.details);
      }
    });
  }, [snapshot]);

  const content = useMemo(() => {
    if (failure) return <main className="program-fallback"><p>BETWEENER LIVE</p><strong>Programme safe scene</strong></main>;
    if (!runtime || !snapshot) return <main className="program-fallback"><p>BETWEENER LIVE</p><strong>Preparing programme</strong></main>;
    return <StreamVideo client={runtime.client}><StreamCall call={runtime.call}>
      <ProgramCanvas snapshot={snapshot} />
    </StreamCall></StreamVideo>;
  }, [failure, runtime, snapshot]);

  return content;
}
