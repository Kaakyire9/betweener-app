import type { StudioOperationalSnapshot } from '@betweener/live-program-domain';
import { useEffect, useMemo, useState } from 'react';

import { studioApi } from '../api/studio-api.ts';

type CheckState = 'pending' | 'checking' | 'pass' | 'fail';
type PreflightState = {
  secure: CheckState;
  camera: CheckState;
  microphone: CheckState;
  bandwidth: CheckState;
  dj: CheckState;
};

const initialState: PreflightState = {
  secure: 'pending', camera: 'pending', microphone: 'pending', bandwidth: 'pending', dj: 'pass',
};

const connectionDownlink = (): number | null => {
  const connection = (navigator as Navigator & {
    connection?: { downlink?: number };
  }).connection;
  return typeof connection?.downlink === 'number' ? connection.downlink : null;
};

export function StudioPreflightPanel({
  sessionId,
  snapshot,
  onReadyChange,
}: {
  sessionId: string;
  snapshot: StudioOperationalSnapshot;
  onReadyChange: (ready: boolean) => void;
}) {
  const [checks, setChecks] = useState<PreflightState>(initialState);
  const [djRequired, setDjRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  const djReady = snapshot.sources.some((source) => source.type === 'dj_audio'
    && source.readiness === 'live' && source.health === 'healthy');
  const ready = useMemo(() => Object.values(checks).every((check) => check === 'pass'), [checks]);

  useEffect(() => { onReadyChange(ready); }, [onReadyChange, ready]);
  useEffect(() => {
    setChecks((current) => ({ ...current, dj: djRequired ? (djReady ? 'pass' : 'fail') : 'pass' }));
  }, [djReady, djRequired]);

  const runPreflight = async () => {
    setBusy(true);
    setChecks((current) => ({ ...current, secure: 'checking', camera: 'checking', microphone: 'checking', bandwidth: 'checking' }));
    const secure = window.isSecureContext ? 'pass' : 'fail';
    const downlink = connectionDownlink();
    const bandwidth = navigator.onLine && (downlink === null || downlink >= 3) ? 'pass' : 'fail';
    let camera: CheckState = 'fail';
    let microphone: CheckState = 'fail';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      camera = stream.getVideoTracks().length ? 'pass' : 'fail';
      microphone = stream.getAudioTracks().length ? 'pass' : 'fail';
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      camera = 'fail';
      microphone = 'fail';
    }
    const next: PreflightState = {
      secure, camera, microphone, bandwidth, dj: djRequired ? (djReady ? 'pass' : 'fail') : 'pass',
    };
    setChecks(next);
    setBusy(false);
    const passed = Object.values(next).every((check) => check === 'pass');
    await studioApi.recordOperationalEvent(
      sessionId,
      passed ? 'preflight_passed' : 'preflight_failed',
      passed ? 'info' : 'warning',
      { failedChecks: Object.entries(next).filter(([, state]) => state !== 'pass').map(([key]) => key) },
      !passed,
    ).catch(() => undefined);
  };

  return <section className="panel stack-sm" data-testid="studio-preflight">
    <div className="section-heading"><div><span className="eyebrow">PREFLIGHT</span>
      <h2>Ready to publish</h2></div><span className={`status-pill ${ready ? 'live-badge' : 'changed'}`}>
        {ready ? 'Passed' : 'Required'}</span></div>
    <div className="preflight-grid">
      {Object.entries(checks).map(([name, state]) => <div className="preflight-check" key={name}>
        <span className={`status-dot ${state === 'pass' ? 'healthy' : state === 'fail' ? 'lost' : ''}`} />
        <span>{name === 'secure' ? 'Secure browser' : name}</span><small>{state}</small>
      </div>)}
    </div>
    <label className="check-row"><input type="checkbox" checked={djRequired}
      onChange={(event) => setDjRequired(event.target.checked)} />DJ input is required for this show</label>
    <button className="button button-secondary" disabled={busy} onClick={() => void runPreflight()}>
      {busy ? 'Checking devices…' : 'Run camera, mic and network checks'}
    </button>
  </section>;
}
