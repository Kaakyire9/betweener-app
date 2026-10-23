import { useCallback, useEffect, useState } from 'react';
import type { LiveMusicCatalogue, StudioOperationalSnapshot } from '@betweener/live-program-domain';

import { studioApi } from '../api/studio-api.ts';
import { errorMessage, friendlyReason } from '../lib/errors.ts';
import { MusicLibraryAdminUpload } from './MusicLibraryAdminUpload.tsx';

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
  const [musicCatalogue, setMusicCatalogue] = useState<LiveMusicCatalogue | null>(null);
  const [selectedMusic, setSelectedMusic] = useState('');
  const programmeAudio = snapshot.sources.find(
    (source) => source.key === 'system:programme_audio',
  );
  const musicActive = ['playing', 'ducked', 'fading'].includes(snapshot.music.status);
  const programmeAudioStatus = !snapshot.music.enabled
    ? 'Disabled'
    : !musicActive
      ? 'Ready'
      : programmeAudio?.readiness === 'live' && programmeAudio.health === 'healthy'
        ? 'On Stream'
        : programmeAudio?.health === 'lost' || programmeAudio?.health === 'degraded'
          ? 'Degraded'
          : 'Starting';

  const loadMusicCatalogue = useCallback(async () => {
    const catalogue = await studioApi.getMusicCatalogue(snapshot.session.id);
    setMusicCatalogue(catalogue);
    setSelectedMusic((selected) => selected
      || (snapshot.music.trackId ? `track:${snapshot.music.trackId}` : '')
      || (catalogue.tracks[0] ? `track:${catalogue.tracks[0].id}` : '')
      || (catalogue.playlists[0] ? `playlist:${catalogue.playlists[0].id}` : ''));
  }, [snapshot.music.trackId, snapshot.session.id]);

  useEffect(() => setMusicVolume(snapshot.music.volume), [snapshot.music.volume]);
  useEffect(() => {
    void loadMusicCatalogue()
      .catch((failure) => {
        setError(errorMessage(failure, 'Music library failed to load.'));
      });
  }, [loadMusicCatalogue]);

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

      <Panel eyebrow="PROGRAMME MUSIC" title={snapshot.music.status} status={programmeAudioStatus}>
        <div className="music-library-control">
          <div className="music-library-art" aria-hidden="true"><span>♫</span><strong>BETWEENER</strong></div>
          <div className="music-library-picker">
            <label className="field-label">Approved global library
              <select value={selectedMusic} disabled={!ownsControl || !snapshot.music.enabled || busy !== null}
                onChange={(event) => setSelectedMusic(event.target.value)}>
                {musicCatalogue?.playlists.length ? <optgroup label="Playlists">
                  {musicCatalogue.playlists.map((playlist) => (
                    <option key={playlist.id} value={`playlist:${playlist.id}`}>{playlist.name}</option>
                  ))}
                </optgroup> : null}
                <optgroup label="Tracks">
                  {(musicCatalogue?.tracks ?? []).map((track) => (
                    <option key={track.id} value={`track:${track.id}`}>{track.title} — {track.artist}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <button className="button button-primary" disabled={!ownsControl || !snapshot.music.enabled || !selectedMusic || busy !== null}
              onClick={() => void run('Music play', () => {
                const [kind, id] = selectedMusic.split(':', 2);
                return studioApi.controlMusic({
                  sessionId: snapshot.session.id,
                  action: kind === 'playlist' ? 'play_playlist' : 'play_track',
                  ...(kind === 'playlist' ? { playlistId: id } : { trackId: id }),
                });
              })}>Play on programme</button>
          </div>
        </div>
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
          <button className={`button ${snapshot.music.repeatMode === 'one' ? 'button-live' : 'button-quiet'}`}
            aria-pressed={snapshot.music.repeatMode === 'one'}
            disabled={!ownsControl || !snapshot.music.enabled || busy !== null}
            onClick={() => void run('Repeat one', () => studioApi.controlMusic({
              sessionId: snapshot.session.id,
              action: snapshot.music.repeatMode === 'one' ? 'repeat_off' : 'repeat_one',
            }))}>Repeat 1</button>
          <button className={`button ${snapshot.music.repeatMode === 'all' ? 'button-live' : 'button-quiet'}`}
            aria-pressed={snapshot.music.repeatMode === 'all'}
            disabled={!ownsControl || !snapshot.music.enabled || busy !== null}
            onClick={() => void run('Repeat all', () => studioApi.controlMusic({
              sessionId: snapshot.session.id,
              action: snapshot.music.repeatMode === 'all' ? 'repeat_off' : 'repeat_all',
            }))}>Repeat All</button>
        </div>
        {!snapshot.music.enabled ? (
          <p className="notice-copy">Programme Music is off in the Odo rollout. Enable it only after at least one licensed catalogue track is approved.</p>
        ) : null}
        {snapshot.music.enabled ? (
          <p className="notice-copy">Programme Music is published once as a protected Stream audio source. Phones and Studio control it; audience devices only receive the shared call mix.</p>
        ) : null}
        {programmeAudio?.failureReasonCode ? (
          <p className="error-banner" role="alert">Programme Audio: {friendlyReason(programmeAudio.failureReasonCode)}</p>
        ) : null}
        {musicCatalogue?.canManageLibrary ? (
          <MusicLibraryAdminUpload onUploaded={() => void loadMusicCatalogue()} />
        ) : null}
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
