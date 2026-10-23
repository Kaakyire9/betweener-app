import { useMemo, useState } from 'react';

import type { StudioTeamOperatorRole, StudioTeamPerson } from '../api/studio-api.ts';
import { useStudioTeam } from '../hooks/use-studio-team.ts';

const OPERATOR_ROLES: readonly { value: StudioTeamOperatorRole; label: string }[] = [
  { value: 'moderator', label: 'Moderator' },
  { value: 'producer', label: 'Producer' },
  { value: 'viewer', label: 'Viewer' },
];

const personLabel = (person: Pick<StudioTeamPerson, 'fullName' | 'username' | 'email'>) =>
  person.fullName || (person.username ? `@${person.username}` : person.email) || 'Team member';

export function StudioTeamPanel({
  sessionId,
  authorize,
}: {
  sessionId: string;
  authorize: (label: string, operation: () => Promise<void>) => Promise<void>;
}) {
  const team = useStudioTeam(sessionId);
  const [operatorEmail, setOperatorEmail] = useState('');
  const [operatorRole, setOperatorRole] = useState<StudioTeamOperatorRole>('moderator');
  const [hostEmail, setHostEmail] = useState('');
  const activeOperators = useMemo(
    () => team.snapshot?.operators.filter((operator) => operator.status === 'active') ?? [],
    [team.snapshot?.operators],
  );
  const activeHosts = useMemo(
    () => team.snapshot?.onAirHosts.filter((host) => host.status === 'active') ?? [],
    [team.snapshot?.onAirHosts],
  );
  const canManage = team.snapshot?.canManageTeam === true;
  const disabled = team.busy !== null;

  const assignOperator = async () => {
    const email = operatorEmail.trim().toLowerCase();
    if (!email.includes('@') || !canManage) return;
    await authorize(`assign ${operatorRole}`, async () => {
      if (await team.assignOperator(email, operatorRole)) setOperatorEmail('');
    });
  };

  const assignHost = async () => {
    const email = hostEmail.trim().toLowerCase();
    if (!email.includes('@') || !canManage) return;
    await authorize('assign on-air co-host', async () => {
      if (await team.assignHost(email)) setHostEmail('');
    });
  };

  if (team.loading && !team.snapshot) {
    return <section className="panel"><span className="eyebrow">TEAM &amp; ROLES</span>
      <p className="muted compact">Loading the on-air team...</p></section>;
  }

  if (!team.snapshot) {
    return <section className="panel"><span className="eyebrow">TEAM &amp; ROLES</span>
      <p className="error-copy">{team.error || 'Studio team is unavailable.'}</p></section>;
  }

  return <section className="panel studio-team-panel" data-testid="studio-team-panel">
    <div className="section-heading"><div><span className="eyebrow">TEAM &amp; ROLES</span>
      <h2>On-air crew</h2></div><span className="status-pill">{activeOperators.length + activeHosts.length + 1}</span></div>

    <div className="team-primary-host">
      <span className="status-dot healthy" />
      <div><strong>{personLabel({ ...team.snapshot.primaryHost, email: null })}</strong>
        <small>Primary Host · ownership preserved</small></div>
    </div>

    <div className="studio-subsection stack-sm">
      <div className="section-heading compact-heading"><div><span className="eyebrow">STUDIO OPERATORS</span>
        <h3>Production access</h3></div></div>
      {activeOperators.length ? <div className="team-roster">{activeOperators.map((operator) => (
        <div className="team-member" key={operator.assignmentId}>
          <div><strong>{personLabel(operator)}</strong><small>{operator.operatorRole}</small></div>
          {canManage ? <button className="text-button danger-text" disabled={disabled}
            onClick={() => void authorize('remove operator', async () => {
              await team.revokeOperator(operator.userId);
            })}>Remove</button> : null}
        </div>
      ))}</div> : <p className="muted compact">No additional Studio operators.</p>}
      {canManage ? <div className="team-composer">
        <input aria-label="Operator account email" autoComplete="email" inputMode="email"
          placeholder="operator@example.com" value={operatorEmail}
          onChange={(event) => setOperatorEmail(event.target.value)} />
        <select aria-label="Operator role" value={operatorRole}
          onChange={(event) => setOperatorRole(event.target.value as StudioTeamOperatorRole)}>
          {OPERATOR_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
        </select>
        <button className="button button-secondary" disabled={disabled || !operatorEmail.includes('@')}
          onClick={() => void assignOperator()}>Assign operator</button>
      </div> : null}
    </div>

    <div className="studio-subsection stack-sm">
      <div className="section-heading compact-heading"><div><span className="eyebrow">ON-AIR HOSTS</span>
        <h3>Live room authority</h3></div></div>
      <p className="muted compact team-explainer">Co-hosts can operate the room while the original creator remains the Primary Host.</p>
      {activeHosts.length ? <div className="team-roster">{activeHosts.map((host) => (
        <div className="team-member" key={host.assignmentId}>
          <div><strong>{personLabel(host)}</strong><small>Co-host</small></div>
          {canManage ? <button className="text-button danger-text" disabled={disabled}
            onClick={() => void authorize('remove on-air co-host', async () => {
              await team.revokeHost(host.userId);
            })}>Remove</button> : null}
        </div>
      ))}</div> : <p className="muted compact">No additional on-air hosts.</p>}
      {canManage ? <div className="team-composer team-composer-host">
        <input aria-label="Co-host account email" autoComplete="email" inputMode="email"
          placeholder="host@example.com" value={hostEmail}
          onChange={(event) => setHostEmail(event.target.value)} />
        <button className="button button-live" disabled={disabled || !hostEmail.includes('@')}
          onClick={() => void assignHost()}>Add co-host</button>
      </div> : <p className="muted compact">Only an AAL2-verified Live administrator can change this roster.</p>}
    </div>

    {team.error ? <p className="error-banner compact" role="alert">{team.error}</p> : null}
  </section>;
}
