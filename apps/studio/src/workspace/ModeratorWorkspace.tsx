import type { StudioOperationalSnapshot } from '@betweener/live-program-domain';

import type { StudioOperatorConsole } from '../api/studio-api.ts';
import { friendlyReason } from '../lib/errors.ts';
import { useStudioMedia } from '../media/studio-media-context.tsx';
import { OperatorSafetyPanel } from '../operations/OperatorSafetyPanel.tsx';
import { PrivateOperationsChannel } from '../operations/PrivateOperationsChannel.tsx';
import { RunOfShowPanel } from '../operations/RunOfShowPanel.tsx';
import { ProgramRenderer } from '../program/ProgramRenderer.tsx';

export function ModeratorWorkspace({
  sessionId,
  snapshot,
  consoleState,
  consoleError,
  busy,
  onEmergency,
  onAcknowledge,
  onConsoleChanged,
}: {
  sessionId: string;
  snapshot: StudioOperationalSnapshot;
  consoleState: StudioOperatorConsole | null;
  consoleError: string | null;
  busy: boolean;
  onEmergency: () => void;
  onAcknowledge: (id: number) => void;
  onConsoleChanged: () => Promise<void>;
}) {
  const isOnAir = snapshot.session.status === 'live';
  const monitorCanConnect = ['backstage', 'live', 'ending'].includes(snapshot.session.status);
  const media = useStudioMedia();

  return <div className="moderator-workspace" data-testid="moderator-workspace">
    <section className="moderator-program stack-md">
      <section className={`monitor-card moderator-program-monitor ${isOnAir ? 'is-on-air' : ''}`}>
        <div className="monitor-header">
          <div><span className="eyebrow">PROGRAM MONITOR</span><strong>Read-only audience output</strong></div>
          <div className="monitor-actions">
            {!media.binding && monitorCanConnect ? <button className="text-button"
              disabled={media.connecting} onClick={() => void media.connect()}>
              {media.connecting ? 'Connecting…' : 'Connect monitor'}
            </button> : null}
            <span className={`status-pill program-badge ${isOnAir ? 'on-air' : ''}`}>
              {isOnAir ? 'ON AIR' : 'PROGRAM'} · v{snapshot.program.programVersion}
            </span>
          </div>
        </div>
        <ProgramRenderer state={snapshot.program} sources={snapshot.sources}
          label="Read-only Audience Program"
          emptySourceMessage="No programme source is on air yet. Waiting for the producer." />
        {media.error ? <p className="monitor-error" role="alert">{media.error}</p> : null}
      </section>

      <section className="panel moderator-room-overview" data-testid="moderation-overview">
        <div className="section-heading"><div><span className="eyebrow">MODERATION</span>
          <h2>Room protection</h2></div>
          <span className={`status-pill safety-${snapshot.safety.status}`}>{snapshot.safety.status}</span>
        </div>
        <div className="moderator-metrics">
          <div><strong>{snapshot.safety.activeHoldCount}</strong><span>Active holds</span></div>
          <div><strong>{friendlyReason(snapshot.program.scene)}</strong><span>Current scene</span></div>
          <div><strong>{friendlyReason(snapshot.session.status)}</strong><span>Broadcast state</span></div>
        </div>
        <p className="notice-copy">Monitor the live output and room safety here. Producer preparation and programme controls are intentionally unavailable.</p>
      </section>
    </section>

    <aside className="moderator-operations stack-md" aria-label="Moderator operations">
      {consoleState ? <>
        <OperatorSafetyPanel consoleState={consoleState}
          canTakeover={false} canModerate ownsControl={false} busy={busy}
          onTakeover={() => undefined} onEmergency={onEmergency}
          onAcknowledge={onAcknowledge} />
        <RunOfShowPanel sessionId={sessionId} consoleState={consoleState}
          canEdit={false} onChanged={onConsoleChanged} />
        <PrivateOperationsChannel sessionId={sessionId}
          consoleState={consoleState} onChanged={onConsoleChanged} />
      </> : <section className="panel loading-panel">Loading moderator operations…</section>}
      {consoleError ? <p className="error-copy" role="alert">{consoleError}</p> : null}
    </aside>
  </div>;
}
