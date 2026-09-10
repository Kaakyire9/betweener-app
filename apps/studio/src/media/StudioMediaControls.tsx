import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProgramSourceType, StudioOperationalSnapshot } from '@betweener/live-program-domain';

import { studioApi } from '../api/studio-api.ts';
import { errorMessage } from '../lib/errors.ts';
import { AudioMeter } from './AudioMeter.tsx';
import { useAudioMeter } from './use-audio-meter.ts';
import { useStudioMedia } from './studio-media-context.tsx';

const sourceKey = (instanceId: string, type: ProgramSourceType) =>
  `studio:${instanceId.replaceAll('-', '')}:${type}`;

export function StudioMediaControls({
  snapshot,
  controllerInstanceId,
  onChanged,
}: {
  snapshot: StudioOperationalSnapshot;
  controllerInstanceId: string;
  onChanged: () => void;
}) {
  const media = useStudioMedia();
  const call = media.binding?.call;
  const admission = media.binding?.admission;
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [includeScreenAudio, setIncludeScreenAudio] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const microphoneLevel = useAudioMeter(call?.microphone.state.mediaStream);
  const hostCameraKey = useMemo(
    () => sourceKey(controllerInstanceId, 'host_camera'),
    [controllerInstanceId],
  );
  const hostMicrophoneKey = useMemo(
    () => sourceKey(controllerInstanceId, 'host_microphone'),
    [controllerInstanceId],
  );
  const screenKey = useMemo(
    () => sourceKey(controllerInstanceId, 'screen_share'),
    [controllerInstanceId],
  );
  const screenAudioKey = useMemo(
    () => sourceKey(controllerInstanceId, 'screen_share_audio'),
    [controllerInstanceId],
  );
  const canShareAudio = admission?.capabilities.screenShareAudio === true;

  useEffect(() => {
    if (!call) {
      setCameras([]);
      setMicrophones([]);
      return undefined;
    }
    const cameraSubscription = call.camera.listDevices().subscribe(setCameras);
    const microphoneSubscription = call.microphone.listDevices().subscribe(setMicrophones);
    return () => {
      cameraSubscription.unsubscribe();
      microphoneSubscription.unsubscribe();
    };
  }, [call]);

  const upsert = useCallback(async (input: {
    key: string;
    type: 'host_camera' | 'host_microphone' | 'screen_share' | 'screen_share_audio';
    hasVideo: boolean;
    hasAudio: boolean;
    muted?: boolean;
  }) => {
    if (!admission) return;
    await studioApi.upsertSource({
      sessionId: snapshot.session.id,
      sourceKey: input.key,
      sourceType: input.type,
      sourceRole: input.type === 'host_microphone' ? 'host_audio'
        : input.type === 'screen_share_audio' ? 'screen_audio' : 'visual',
      providerUserId: admission.user.id,
      hasVideo: input.hasVideo,
      hasAudio: input.hasAudio,
      readiness: 'live',
      health: 'healthy',
      muted: input.muted,
    });
  }, [admission, snapshot.session.id]);

  useEffect(() => {
    if (!admission || (!cameraOn && !microphoneOn && !screenOn)) return undefined;
    const heartbeat = () => {
      if (cameraOn) void upsert({ key: hostCameraKey, type: 'host_camera', hasVideo: true, hasAudio: false });
      if (microphoneOn) void upsert({ key: hostMicrophoneKey, type: 'host_microphone', hasVideo: false, hasAudio: true });
      if (screenOn) void upsert({ key: screenKey, type: 'screen_share', hasVideo: true, hasAudio: false });
    };
    const timer = window.setInterval(heartbeat, 15_000);
    return () => window.clearInterval(timer);
  }, [admission, cameraOn, hostCameraKey, hostMicrophoneKey, microphoneOn, screenKey, screenOn, upsert]);

  const run = async (name: string, operation: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try {
      await operation();
      onChanged();
    } catch (failure) {
      setError(errorMessage(failure, `${name} failed.`));
    } finally {
      setBusy(null);
    }
  };

  const toggleCamera = () => run('Camera', async () => {
    if (!call) return;
    if (cameraOn) {
      await call.camera.disable();
      await studioApi.endSource(snapshot.session.id, hostCameraKey, 'host_camera_stopped');
      setCameraOn(false);
    } else {
      await call.camera.enable();
      await upsert({ key: hostCameraKey, type: 'host_camera', hasVideo: true, hasAudio: false });
      setCameraOn(true);
    }
  });

  const toggleMicrophone = () => run('Microphone', async () => {
    if (!call) return;
    if (microphoneOn) {
      await call.microphone.disable();
      await studioApi.endSource(snapshot.session.id, hostMicrophoneKey, 'host_microphone_stopped');
      setMicrophoneOn(false);
    } else {
      await call.microphone.enable();
      await upsert({ key: hostMicrophoneKey, type: 'host_microphone', hasVideo: false, hasAudio: true });
      setMicrophoneOn(true);
    }
  });

  const stopScreenShare = useCallback(async (reasonCode = 'screen_share_stopped') => {
    if (!call) return;
    await call.screenShare.disable();
    await studioApi.endSource(snapshot.session.id, screenKey, reasonCode).catch(() => undefined);
    await studioApi.endSource(snapshot.session.id, screenAudioKey, reasonCode).catch(() => undefined);
    setScreenOn(false);
    onChanged();
  }, [call, onChanged, screenAudioKey, screenKey, snapshot.session.id]);

  const toggleScreen = () => run('Screen share', async () => {
    if (!call || !admission) return;
    if (screenOn) return stopScreenShare();
    call.screenShare.setSettings({ maxFramerate: 15, maxBitrate: 1_500_000, contentHint: 'detail' });
    if (includeScreenAudio && admission.capabilities.screenShareAudio) {
      call.screenShare.enableScreenShareAudio();
    } else {
      call.screenShare.disableScreenShareAudio();
    }
    await call.screenShare.enable();
    const stream = call.screenShare.state.mediaStream;
    const hasAudio = Boolean(stream?.getAudioTracks().length);
    await upsert({ key: screenKey, type: 'screen_share', hasVideo: true, hasAudio: false });
    if (hasAudio) {
      await upsert({
        key: screenAudioKey,
        type: 'screen_share_audio',
        hasVideo: false,
        hasAudio: true,
      });
    }
    stream?.getVideoTracks()[0]?.addEventListener('ended', () => {
      void stopScreenShare('screen_share_ended_by_browser');
    }, { once: true });
    setScreenOn(true);
  });

  if (!snapshot.access.canPublish) {
    return <p className="empty-copy">Browser publishing is not enabled for this producer.</p>;
  }
  if (!media.binding) {
    return (
      <div className="stack-sm">
        <p className="muted compact">Connect only when you are ready to grant browser media access.</p>
        <button className="button button-secondary" disabled={media.connecting} onClick={() => void media.connect()}>
          {media.connecting ? 'Connecting…' : 'Connect studio media'}
        </button>
        {media.error ? <p className="error-copy" role="alert">{media.error}</p> : null}
      </div>
    );
  }

  return (
    <div className="stack-sm">
      <label className="field-label">Camera
        <select value={call?.camera.state.selectedDevice ?? ''}
          onChange={(event) => void run('Camera switch', async () => {
            await call?.camera.select(event.target.value || undefined);
          })}>
          <option value="">System default</option>
          {cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Camera ${index + 1}`}
          </option>)}
        </select>
      </label>
      <button className={`button ${cameraOn ? 'button-live' : 'button-secondary'}`}
        disabled={busy !== null} onClick={() => void toggleCamera()}>
        {cameraOn ? 'Stop camera' : 'Start camera'}
      </button>
      <label className="field-label">Microphone
        <select value={call?.microphone.state.selectedDevice ?? ''}
          onChange={(event) => void run('Microphone switch', async () => {
            await call?.microphone.select(event.target.value || undefined);
          })}>
          <option value="">System default</option>
          {microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Microphone ${index + 1}`}
          </option>)}
        </select>
      </label>
      <AudioMeter level={microphoneLevel} label="Host microphone" />
      <p className="notice-copy">The Studio microphone uses distributed audio and is heard immediately when started. Keep it off unless this producer is speaking in the room.</p>
      <button className={`button ${microphoneOn ? 'button-live' : 'button-secondary'}`}
        disabled={busy !== null} onClick={() => void toggleMicrophone()}>
        {microphoneOn ? 'Mute microphone' : 'Start microphone'}
      </button>
      {snapshot.access.canScreenShare ? (
        <>
          <label className="check-row">
            <input type="checkbox" checked={includeScreenAudio}
              disabled={!canShareAudio || screenOn}
              onChange={(event) => setIncludeScreenAudio(event.target.checked)} />
            Include screen audio (distributed-audio mode)
          </label>
          {!canShareAudio ? (
            <p className="notice-copy">Screen audio is unavailable by policy. Video sharing still works.</p>
          ) : includeScreenAudio ? (
            <p className="notice-copy">Screen audio is sent directly by the browser once sharing starts. Keep it off while preparing Preview.</p>
          ) : null}
          <button className={`button ${screenOn ? 'button-danger' : 'button-secondary'}`}
            disabled={busy !== null} onClick={() => void toggleScreen()}>
            {screenOn ? 'Stop sharing' : 'Share a screen'}
          </button>
        </>
      ) : null}
      <button className="text-button" onClick={() => void media.disconnect()}>Disconnect studio media</button>
      {error ? <p className="error-copy" role="alert">{error}</p> : null}
    </div>
  );
}

export { sourceKey as studioSourceKey };
