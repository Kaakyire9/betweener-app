import type { StudioSessionSummary } from '@betweener/live-program-domain';

import { friendlyReason } from '../lib/errors.ts';

export function StudioSessionPicker({
  sessions,
  loading,
  error,
  onOpen,
  onRefresh,
}: {
  sessions: readonly StudioSessionSummary[];
  loading: boolean;
  error: string | null;
  onOpen: (sessionId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <main className="session-shell">
      <header className="page-header">
        <div><p className="eyebrow">BETWEENER STUDIO</p><h1>Choose a programme.</h1>
          <p className="muted">Open an approved Live as an observer, then take control when needed.</p>
        </div>
        <button className="button button-secondary" onClick={onRefresh}>Refresh</button>
      </header>
      {error ? <p className="error-banner" role="alert">{error}</p> : null}
      {loading ? <div className="loading-panel">Loading Studio sessions…</div> : null}
      {!loading && sessions.length === 0 ? (
        <div className="empty-panel"><strong>No Studio sessions available</strong>
          <p>Studio must be enabled and your closed-beta access must include View.</p></div>
      ) : (
        <div className="session-grid">
          {sessions.map((session) => <article className="session-card" key={session.id}>
            <div className="session-card-top"><span className={`status-dot ${session.health}`} />
              <span className="status-pill">{friendlyReason(session.status)}</span></div>
            <p className="eyebrow">{session.ownershipType === 'system' ? 'ALWAYS-ON · ODO' : 'HOSTED LIVE'}</p>
            <h2>{session.title}</h2>
            <dl className="detail-list">
              <div><dt>Controller</dt><dd>{friendlyReason(session.controllerSource)}</dd></div>
              <div><dt>Programme</dt><dd>{friendlyReason(session.programScene)}</dd></div>
              <div><dt>In room</dt><dd>{session.participantCount}</dd></div>
            </dl>
            <button className="button button-primary" onClick={() => onOpen(session.id)}>
              Open programme
            </button>
          </article>)}
        </div>
      )}
    </main>
  );
}
