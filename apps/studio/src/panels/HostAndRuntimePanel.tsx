import { useCallback, useEffect, useState } from 'react';

import { studioApi, type LiveHostingManagement } from '../api/studio-api.ts';
import { errorMessage } from '../lib/errors.ts';

const formatTime = (value: string | null) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  : 'Manual end';

export function HostAndRuntimePanel({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<LiveHostingManagement | null>(null);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await studioApi.getHostingManagement(sessionId));
      setError(null);
    } catch (failure) {
      setError(errorMessage(failure, 'Host controls are unavailable.'));
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const run = async (operation: () => Promise<LiveHostingManagement>) => {
    setBusy(true);
    setError(null);
    try { setState(await operation()); }
    catch (failure) { setError(errorMessage(failure, 'The Live could not be updated.')); }
    finally { setBusy(false); }
  };

  if (!state) return <section className="panel"><span className="eyebrow">SESSION HOST</span><p className="muted compact">{error || 'Loading Host controls…'}</p></section>;

  return <section className="panel host-runtime-panel">
    <div className="section-heading"><div><span className="eyebrow">SESSION HOST</span><h2>{state.host.fullName || state.host.username || 'Host'}</h2></div>
      <span className="status-pill">{state.host.delegated ? 'Delegated' : 'Primary'}</span></div>
    {state.host.username ? <small className="muted">@{state.host.username}</small> : null}
    <div className="runtime-metrics">
      <div><strong>{state.traffic.audienceNow}</strong><small>Here now</small></div>
      <div><strong>{state.traffic.totalAttendees}</strong><small>Attended</small></div>
      <div><strong>{state.traffic.reactions}</strong><small>Reactions</small></div>
    </div>

    {state.canExtend ? <div className="runtime-controls">
      <div><span className="eyebrow">RUNTIME</span><p>{state.schedule.endPolicy === 'manual' ? 'Open until Host ends it' : `Ends ${formatTime(state.schedule.runtimeEndAt || state.schedule.scheduledEnd)}`}</p></div>
      <div className="button-row">
        <button className="button button-quiet" disabled={busy} onClick={() => void run(() => studioApi.extendRuntime(sessionId, { minutes: 30 }))}>+30 min</button>
        <button className="button button-quiet" disabled={busy} onClick={() => void run(() => studioApi.extendRuntime(sessionId, { minutes: 60 }))}>+60 min</button>
        <button className="button button-primary" disabled={busy || state.schedule.endPolicy === 'manual'} onClick={() => void run(() => studioApi.extendRuntime(sessionId, { keepOpen: true }))}>Keep open</button>
      </div>
    </div> : null}

    {state.canDelegateHosts ? <div className="host-assignment">
      <label><span className="eyebrow">HAND OFF THIS LIVE</span>
        <input value={username} onChange={(event) => setUsername(event.target.value.replace(/^@+/, ''))} placeholder="Exact @username" /></label>
      <button className="button button-secondary" disabled={busy || !username.trim()} onClick={() => void run(() => studioApi.delegateHost(sessionId, username.trim()))}>{state.host.delegated ? 'Replace Host' : 'Assign Host'}</button>
      {state.host.delegated ? <button className="text-button danger-text" disabled={busy} onClick={() => void run(() => studioApi.revokeHost(sessionId))}>Restore product owner</button> : null}
      <small className="muted">Access is private to this Live and expires when it ends.</small>
    </div> : null}
    {error ? <p className="error-banner compact" role="alert">{error}</p> : null}
  </section>;
}
