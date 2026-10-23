import { useState } from 'react';

import { studioApi } from '../api/studio-api.ts';
import { errorMessage } from '../lib/errors.ts';

const MOODS = [
  'warm', 'chill', 'afrobeats_light', 'soul', 'upbeat', 'reflective',
  'instrumental', 'closing',
] as const;

export function MusicLibraryAdminUpload({
  onUploaded,
}: {
  onUploaded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('Betweener');
  const [mood, setMood] = useState<(typeof MOODS)[number]>('warm');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [licenseReference, setLicenseReference] = useState('');
  const [containsVocals, setContainsVocals] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      await studioApi.uploadMusicTrack({
        file,
        title: title.trim(),
        artist: artist.trim(),
        mood,
        durationSeconds: Math.round(Number(durationSeconds)),
        licenseReference: licenseReference.trim(),
        containsVocals,
      });
      setFile(null);
      setTitle('');
      setDurationSeconds('');
      setLicenseReference('');
      setContainsVocals(false);
      setOpen(false);
      setMessage('Track published to the global library.');
      onUploaded();
    } catch (failure) {
      setMessage(errorMessage(failure, 'Track upload failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="music-admin">
      <button className="text-button" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Close library uploader' : '+ Add licensed track'}
      </button>
      {open ? <div className="music-admin-form">
        <label className="field-label">Audio file
          <input accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav" type="file"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, ''));
            }} />
        </label>
        <label className="field-label">Title
          <input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field-label">Artist
          <input maxLength={120} value={artist} onChange={(event) => setArtist(event.target.value)} />
        </label>
        <div className="music-admin-grid">
          <label className="field-label">Mood
            <select value={mood} onChange={(event) => setMood(event.target.value as (typeof MOODS)[number])}>
              {MOODS.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <label className="field-label">Duration (seconds)
            <input inputMode="numeric" min="10" max="7200" type="number" value={durationSeconds}
              onChange={(event) => setDurationSeconds(event.target.value)} />
          </label>
        </div>
        <label className="field-label">Licence reference
          <input maxLength={240} placeholder="Provider, plan, receipt or project reference"
            value={licenseReference} onChange={(event) => setLicenseReference(event.target.value)} />
        </label>
        <label className="check-row"><input type="checkbox" checked={containsVocals}
          onChange={(event) => setContainsVocals(event.target.checked)} /> Contains vocals</label>
        <button className="button button-primary" type="button" disabled={busy || !file || !title.trim()
          || !artist.trim() || !licenseReference.trim() || Number(durationSeconds) < 10}
          onClick={() => void upload()}>{busy ? 'Publishing…' : 'Publish globally'}</button>
      </div> : null}
      {message ? <p className={message.includes('published') ? 'success-copy' : 'error-copy'} role="status">{message}</p> : null}
    </div>
  );
}
