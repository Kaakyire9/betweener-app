import { useState } from 'react';

import { studioApi, type StudioOperatorConsole, type StudioRunCue } from '../api/studio-api.ts';

export function RunOfShowPanel({
  sessionId,
  consoleState,
  canEdit,
  onChanged,
}: {
  sessionId: string;
  consoleState: StudioOperatorConsole;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (cue: Omit<StudioRunCue, 'id'> & { id?: string }) => {
    setBusy(true);
    try { await studioApi.upsertRunCue(sessionId, cue); await onChanged(); }
    finally { setBusy(false); }
  };

  return <section className="panel stack-sm" data-testid="run-of-show">
    <div className="section-heading"><div><span className="eyebrow">RUN OF SHOW</span>
      <h2>{canEdit ? 'Producer cues' : 'Programme cues'}</h2></div>
      <span className="status-pill">{consoleState.cues.length}</span></div>
    <div className="cue-list">
      {consoleState.cues.length ? consoleState.cues.map((cue) => <article className="cue-row" key={cue.id}>
        <span>{String(cue.position).padStart(2, '0')}</span><div><strong>{cue.title}</strong>
          <small>{cue.cueType} · {cue.status}</small></div>
        {canEdit && cue.status !== 'complete' ? <button className="text-button" disabled={busy}
          onClick={() => void save({ ...cue, status: cue.status === 'live' ? 'complete' : 'live' })}>
          {cue.status === 'live' ? 'Complete' : 'Go'}</button> : null}
      </article>) : <p className="empty-copy">{canEdit
        ? 'No cues yet. Build the show before going live.'
        : 'No programme cues have been added yet.'}</p>}
    </div>
    {canEdit ? <div className="inline-compose"><input aria-label="New run-of-show cue" maxLength={120}
      placeholder="Add the next cue" value={title} onChange={(event) => setTitle(event.target.value)} />
      <button className="button button-secondary" disabled={busy || !title.trim()} onClick={() => {
        const nextTitle = title.trim(); setTitle('');
        void save({ position: consoleState.cues.length + 1, title: nextTitle, notes: null,
          cueType: 'note', status: 'pending', expectedAt: null });
      }}>Add</button></div> : null}
  </section>;
}
