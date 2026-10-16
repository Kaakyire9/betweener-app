import type { StudioOperatorConsole } from '../api/studio-api.ts';

export function OperatorSafetyPanel({
  consoleState,
  canTakeover,
  canModerate,
  ownsControl,
  busy,
  onTakeover,
  onEmergency,
  onAcknowledge,
}: {
  consoleState: StudioOperatorConsole;
  canTakeover: boolean;
  canModerate: boolean;
  ownsControl: boolean;
  busy: boolean;
  onTakeover: () => void;
  onEmergency: () => void;
  onAcknowledge: (id: number) => void;
}) {
  const openAlerts = consoleState.alerts.filter((alert) => alert.requiresAcknowledgement
    && !alert.acknowledgedAt);
  const standby = consoleState.operators.filter((operator) => operator.readiness !== 'offline');
  return <section className="panel stack-sm" data-testid="operator-continuity">
    <div className="section-heading"><div><span className="eyebrow">CONTINUITY & SAFETY</span>
      <h2>Operator resilience</h2></div><span className="status-pill">{consoleState.operatorRole}</span></div>
    <div className="operator-list">
      {standby.map((operator) => <div key={`${operator.userId}:${operator.controllerInstanceId}`}>
        <span className={`status-dot ${operator.readiness === 'primary' ? 'healthy' : ''}`} />
        <span>{operator.operatorRole}</span><small>{operator.readiness}</small>
      </div>)}
      {!standby.length ? <p className="error-copy">No redundant operator is online.</p> : null}
    </div>
    <div className="button-row">
      {canTakeover && !ownsControl ? <button className="button button-secondary" disabled={busy}
        onClick={onTakeover}>Take producer control</button> : null}
      {(canTakeover || canModerate) ? <button className="button button-danger emergency-button"
        disabled={busy} onClick={onEmergency}>Emergency safe scene</button> : null}
    </div>
    {openAlerts.length ? <div className="alert-list"><strong>{openAlerts.length} alerts need attention</strong>
      {openAlerts.map((alert) => <div key={alert.id}><span>{alert.eventType}</span>
        {canModerate ? <button className="text-button" onClick={() => onAcknowledge(alert.id)}>Acknowledge</button> : null}
      </div>)}</div> : <p className="success-copy">No unacknowledged operational alerts.</p>}
  </section>;
}
