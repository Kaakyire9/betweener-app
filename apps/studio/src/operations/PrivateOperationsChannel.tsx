import { useState } from 'react';

import { studioApi, type StudioOperatorConsole, type StudioPrivateMessage } from '../api/studio-api.ts';

export function PrivateOperationsChannel({
  sessionId,
  consoleState,
  onChanged,
}: {
  sessionId: string;
  consoleState: StudioOperatorConsole;
  onChanged: () => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<StudioPrivateMessage['audience']>('all');
  const [busy, setBusy] = useState(false);
  const role = consoleState.operatorRole;
  const audiences: StudioPrivateMessage['audience'][] = role === 'supervisor'
    ? ['all', 'producers', 'moderators']
    : role === 'producer' ? ['all', 'producers']
      : role === 'moderator' ? ['all', 'moderators'] : ['all'];

  const send = async () => {
    const message = body.trim();
    if (!message) return;
    setBusy(true);
    try {
      await studioApi.postPrivateMessage(sessionId, audience, message);
      setBody('');
      await onChanged();
    } finally { setBusy(false); }
  };

  return <section className="panel stack-sm" data-testid="private-operations-channel">
    <div className="section-heading"><div><span className="eyebrow">PRIVATE COMMS</span>
      <h2>Operations channel</h2></div><span className="status-pill">Private</span></div>
    <div className="message-list" aria-live="polite">
      {consoleState.messages.length ? consoleState.messages.map((message) => <div key={message.id}>
        <strong>{message.audience}</strong><span>{message.body}</span>
        <small>{new Date(message.createdAt).toLocaleTimeString()}</small>
      </div>) : <p className="empty-copy">No operator messages.</p>}
    </div>
    <div className="inline-compose"><select aria-label="Message audience" value={audience}
      onChange={(event) => setAudience(event.target.value as StudioPrivateMessage['audience'])}>
      {audiences.map((value) => <option key={value} value={value}>{value}</option>)}
    </select><input aria-label="Private operator message" maxLength={500} value={body}
      placeholder="Message the operations team" onChange={(event) => setBody(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter') void send(); }} />
      <button className="button button-secondary" disabled={busy || !body.trim()}
        onClick={() => void send()}>Send</button></div>
  </section>;
}
