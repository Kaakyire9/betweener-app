import { StreamVideoClient, type Call } from '@stream-io/video-react-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudioOperationalSnapshot } from '@betweener/live-program-domain';

import { studioApi } from '../api/studio-api.ts';
import { errorMessage } from '../lib/errors.ts';
import { AudioMeter } from './AudioMeter.tsx';
import { useAudioMeter } from './use-audio-meter.ts';
import { studioSourceKey } from './StudioMediaControls.tsx';

type DjBinding = {
  client: StreamVideoClient;
  call: Call;
  handle: { deviceId: string; unregister: () => void };
  input: MediaStream;
  output: MediaStream;
  context: AudioContext;
  gain: GainNode;
  providerUserId: string;
};

export function StudioDjSource({
  snapshot,
  controllerInstanceId,
  onChanged,
}: {
  snapshot: StudioOperationalSnapshot;
  controllerInstanceId: string;
  onChanged: () => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [binding, setBinding] = useState<DjBinding | null>(null);
  const bindingRef = useRef<DjBinding | null>(null);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const level = useAudioMeter(binding?.input);
  const key = useMemo(
    () => studioSourceKey(controllerInstanceId, 'dj_audio'),
    [controllerInstanceId],
  );
  const inProgram = snapshot.program.sourceAssignments.audio_atmosphere === key;

  const stop = useCallback(async (reasonCode = 'dj_input_stopped') => {
    const current = bindingRef.current;
    bindingRef.current = null;
    setBinding(null);
    if (!current) return;
    await current.call.microphone.disable().catch(() => undefined);
    current.handle.unregister();
    current.input.getTracks().forEach((track) => track.stop());
    await current.call.leave().catch(() => undefined);
    await current.client.disconnectUser().catch(() => undefined);
    await current.context.close().catch(() => undefined);
    await studioApi.endSource(snapshot.session.id, key, reasonCode).catch(() => undefined);
    onChanged();
  }, [key, onChanged, snapshot.session.id]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const available = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === 'audioinput');
    setDevices(available);
    if (selectedDeviceId && !available.some((device) => device.deviceId === selectedDeviceId)) {
      setError('The selected DJ/audio-interface input is no longer available.');
      if (bindingRef.current) void stop('dj_input_disconnected');
    }
  }, [selectedDeviceId, stop]);

  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => () => { void stop(); }, [stop]);

  useEffect(() => {
    const current = bindingRef.current;
    if (!current) return;
    current.gain.gain.setTargetAtTime(
      muted || !inProgram ? 0 : volume,
      current.context.currentTime,
      0.02,
    );
    void studioApi.upsertSource({
      sessionId: snapshot.session.id,
      sourceKey: key,
      sourceType: 'dj_audio',
      sourceRole: 'atmosphere_audio',
      providerUserId: current.providerUserId,
      hasVideo: false,
      hasAudio: true,
      readiness: inProgram ? 'live' : 'ready',
      health: 'healthy',
      muted: muted || !inProgram,
    });
  }, [inProgram, key, muted, snapshot.session.id, volume]);

  useEffect(() => {
    if (!binding) return undefined;
    const timer = window.setInterval(() => {
      void studioApi.upsertSource({
        sessionId: snapshot.session.id,
        sourceKey: key,
        sourceType: 'dj_audio',
        sourceRole: 'atmosphere_audio',
        providerUserId: binding.providerUserId,
        hasVideo: false,
        hasAudio: true,
        readiness: inProgram ? 'live' : 'ready',
        health: 'healthy',
        muted: muted || !inProgram,
      });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [binding, inProgram, key, muted, snapshot.session.id]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const input = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
        },
        video: false,
      });
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(input);
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      // The dedicated DJ publication must be silent while it is only armed in
      // Preview. The Program-assignment effect opens this gain after TAKE.
      gain.gain.value = muted || !inProgram ? 0 : volume;
      source.connect(gain).connect(destination);
      const admission = await studioApi.requestMediaAdmission(
        snapshot.session.id,
        controllerInstanceId,
        'dj_audio',
      );
      const client = new StreamVideoClient({
        apiKey: admission.apiKey,
        user: admission.user,
        token: admission.token,
        tokenProvider: async () => (
          await studioApi.requestMediaAdmission(
            snapshot.session.id, controllerInstanceId, 'dj_audio'
          )
        ).token,
      });
      const call = client.call(admission.call.type, admission.call.id);
      await call.join({ create: false });
      const handle = call.microphone.registerVirtualDevice({
        label: 'Betweener Studio DJ input',
        getUserMedia: async () => ({ stream: destination.stream }),
      });
      await call.microphone.select(handle.deviceId);
      await call.microphone.enable();
      const next: DjBinding = {
        client, call, handle, input, output: destination.stream,
        context, gain, providerUserId: admission.user.id,
      };
      bindingRef.current = next;
      setBinding(next);
      input.getAudioTracks()[0]?.addEventListener('ended', () => {
        void stop('dj_input_disconnected');
      }, { once: true });
      await studioApi.upsertSource({
        sessionId: snapshot.session.id,
        sourceKey: key,
        sourceType: 'dj_audio',
        sourceRole: 'atmosphere_audio',
        providerUserId: admission.user.id,
        hasVideo: false,
        hasAudio: true,
        readiness: inProgram ? 'live' : 'ready',
        health: 'healthy',
        muted: muted || !inProgram,
      });
      await refreshDevices();
      onChanged();
    } catch (failure) {
      setError(errorMessage(failure, 'DJ input could not start.'));
    } finally {
      setBusy(false);
    }
  };

  if (!snapshot.access.canUseExternalAudio) return null;
  return (
    <div className="stack-sm studio-subsection">
      <div className="section-heading compact-heading">
        <div><span className="eyebrow">PRO INPUT</span><h3>DJ / audio interface</h3></div>
        <span className={`status-dot ${binding ? 'healthy' : ''}`} aria-hidden="true" />
      </div>
      <p className="notice-copy">Use a separate browser-visible input. Headphones are strongly recommended.</p>
      <label className="field-label">Input device
        <select disabled={Boolean(binding)} value={selectedDeviceId}
          onChange={(event) => setSelectedDeviceId(event.target.value)}>
          <option value="">System default</option>
          {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Audio input ${index + 1}`}
          </option>)}
        </select>
      </label>
      <AudioMeter level={level} label="DJ input" />
      <p className="notice-copy">{binding
        ? inProgram ? 'On Program. The room can hear this input.' : 'Armed in Preview. TAKE a scene with this atmosphere bus to make it audible.'
        : 'Disconnected. Nothing from this input reaches the room.'}</p>
      <label className="range-row">Level
        <input type="range" min="0" max="1" step="0.01" value={volume}
          onChange={(event) => setVolume(Number(event.target.value))} />
        <output>{Math.round(volume * 100)}%</output>
      </label>
      <div className="button-row">
        <button className="button button-secondary" disabled={busy}
          onClick={() => void (binding ? stop() : start())}>
          {busy ? 'Working…' : binding ? 'Stop DJ input' : 'Start DJ input'}
        </button>
        {binding ? <button className={`button ${muted ? 'button-danger' : 'button-quiet'}`}
          onClick={() => setMuted((value) => !value)}>{muted ? 'Unmute' : 'Mute'}</button> : null}
      </div>
      {error ? <p className="error-copy" role="alert">{error}</p> : null}
    </div>
  );
}
