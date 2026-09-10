import { useState } from 'react';
import type { StudioOperationalSnapshot } from '@betweener/live-program-domain';

import { studioApi } from '../api/studio-api.ts';
import { errorMessage, friendlyReason } from '../lib/errors.ts';

function Panel({
  eyebrow,
  title,
  status,
  children,
}: React.PropsWithChildren<{ eyebrow: string; title: string; status?: string }>) {
  return (
    <section className="panel operational-panel">
      <div className="section-heading compact-heading">
        <div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div>
        {status ? <span className="status-pill">{status}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function OperationalPanels({
  snapshot,
  ownsControl,
  onChanged,
}: {
  snapshot: StudioOperationalSnapshot;
  ownsControl: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(snapshot.music.volume);

  const run = async (name: string, operation: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try { await operation(); onChanged(); }
    catch (failure) { setError(errorMessage(failure, `${name} failed.`)); }
    finally { setBusy(null); }
  };

  return (
    <div className="right-panels stack-md">
      <Panel eyebrow="ODO DIRECTOR" title={snapshot.odo.state.replaceAll('_', ' ')}
        status={snapshot.odo.healthy ? 'Healthy' : 'Degraded'}>
        <dl className="detail-list">
          <div><dt>Show state</dt><dd>{snapshot.show.state.replaceAll('_', ' ')}</dd></div>
          <div><dt>Current scene</dt><dd>{snapshot.program.scene.replaceAll('_', ' ')}</dd></div>
          <div><dt>Next check</dt><dd>{snapshot.show.nextWakeAt ? 'Scheduled' : ownsControl ? 'Human control' : 'Waiting'}</dd></div>
        </dl>
        <p className="notice-copy">{snapshot.show.reasonCode
          ? friendlyReason(snapshot.show.reasonCode) : 'Authoritative state is current.'}</p>
        {!ownsControl && snapshot.program.controller.source === 'odo' ? (
          <button className="button button-quiet" disabled={busy !== null}
            onClick={() => void run('Odo refresh', () => studioApi.wakeShowDirector(snapshot.session.id))}>
            Reconcile Odo now
          </button>
        ) : null}
      </Panel>

      <Panel eyebrow="QUICK CONNECT" title="Rotation" status={snapshot.quickConnect.state}>
        <div className="metric-grid">
          <div><strong>{snapshot.quickConnect.poolCount}</strong><span>Pool</span></div>
          <div><strong>{snapshot.quickConnect.eligiblePairCount}</strong><span>Eligible</span></div>
          <div><strong>{snapshot.quickConnect.activePairCount}</strong><span>Active</span></div>
          <div><strong>{snapshot.quickConnect.completedRoundCount}</strong><span>Complete</span></div>
        </div>
        <p className="notice-copy">AutoMatcher is server-authoritative. Compatibility edges stay private.</p>
        <button className="button button-secondary" disabled={!ownsControl || busy !== null}
          onClick={() => void run('Finish connections', () => (
            studioApi.finishCurrentConnections(snapshot.session.id)
          ))}>Finish current connections</button>
      </Panel>

      <Panel eyebrow="PROGRAMME MUSIC" title={snapshot.music.status} status={
        snapshot.music.enabled ? 'Policy ready' : 'Disabled'
      }>
        <label className="range-row">Programme level
          <input type="range" min="0" max="0.5" step="0.01" value={musicVolume}
            disabled={!ownsControl || !snapshot.music.enabled}
            onChange={(event) => setMusicVolume(Number(event.target.value))}
            onPointerUp={() => void run('Music level', () => studioApi.controlMusic({
              sessionId: snapshot.session.id, action: 'set_volume', volume: musicVolume,
            }))} />
          <output>{Math.round(musicVolume * 100)}%</output>
        </label>
        <div className="button-row">
          <button className="button button-quiet" disabled={!ownsControl || !snapshot.music.enabled || busy !== null}
            onClick={() => void run('Music pause', () => studioApi.controlMusic({
              sessionId: snapshot.session.id,
              action: snapshot.music.status === 'paused' ? 'resume' : 'pause',
            }))}>{snapshot.music.status === 'paused' ? 'Resume' : 'Pause'}</button>
          <button className="button button-quiet" disabled={!ownsControl || !snapshot.music.enabled || busy !== null}
            onClick={() => void run('Music next', () => studioApi.controlMusic({
              sessionId: snapshot.session.id, action: 'next',
            }))}>Next</button>
          <button className="button button-quiet" disabled={!ownsControl || !snapshot.music.enabled || busy !== null}
            onClick={() => void run('Music ducking', () => studioApi.controlMusic({
              sessionId: snapshot.session.id,
              action: snapshot.music.status === 'ducked' ? 'unduck' : 'duck',
            }))}>{snapshot.music.status === 'ducked' ? 'Unduck' : 'Duck'}</button>
        </div>
      </Panel>

      <Panel eyebrow="ROOM TOOLS" title="Pulse & Sparks" status={
        snapshot.audiencePulse.open ? 'Pulse open' : 'Ready'
      }>
        <button className="button button-secondary"
          disabled={!ownsControl || snapshot.audiencePulse.open || busy !== null}
          onClick={() => void run('Audience Pulse', () => studioApi.openAudiencePulse(snapshot.session.id))}>
          Open a 90-second Audience Pulse
        </button>
        <p className="notice-copy">Conversation Sparks remain grounded in the active round and are delivered by the existing Odo flow. Studio never receives Private Spark media or private choices.</p>
      </Panel>

      <Panel eyebrow="SAFETY" title="Room protection" status={snapshot.safety.status}>
        <dl className="detail-list"><div><dt>Active holds</dt><dd>{snapshot.safety.activeHoldCount}</dd></div></dl>
        <p className="notice-copy">Safety policy always outranks Studio and Odo. Detailed cases require the separate moderation capability.</p>
      </Panel>
      {error ? <p className="error-banner" role="alert">{error}</p> : null}
    </div>
  );
}
