import { createPrivateCameraPreview, PrivateCameraAllocationError, type PrivateCameraResource } from '../video/private-camera-preview.ts';
import { streamVideoClientLeaseRegistry, type StreamVideoClientLeaseRegistry } from '../../live/media/stream-video-client-leases.ts';
import { retainNativeCaptureTracks } from './native-capture-tracks.ts';

let nextPreview = 0;
/** Auth-bound native adapter; the controller calls start only after an explicit admitted Start. */
export function createNativePrivateCameraPreview(input: {
  userId: string; authEpoch: string; current(): boolean; registry?: StreamVideoClientLeaseRegistry;
}) {
  return createPrivateCameraPreview(async ownerCurrent => {
    const current = () => input.current() && ownerCurrent();
    if (!current()) throw Error('connect_native_owner_retired');
    let captures: ReturnType<typeof retainNativeCaptureTracks> = [];
    let stream: import('@stream-io/react-native-webrtc').MediaStream | null = null;
    let closed = false;
    const lease = (input.registry ?? streamVideoClientLeaseRegistry).acquireNativeExclusive(
      `connect-private-preview:${input.userId}:${input.authEpoch}:${++nextPreview}`, () => ({
        async disconnectUser() {
          if (closed) return;
          if (stream && !captures.length) captures = retainNativeCaptureTracks(stream);
          for (const track of captures) { track.enabled = false; track.stop(); }
          for (const track of captures) {
            if (track.readyState !== 'ended') throw Error('connect_camera_cleanup_unconfirmed');
            track.release?.();
          }
          closed = true; stream = null;
        },
      }));
    let render: PrivateCameraResource['presentation']['render'] = () => null;
    const resource: PrivateCameraResource = { stop: () => lease.release(), presentation: { render: () => current() && !closed ? render() : null } };
    try {
      if (!current()) throw Error('connect_native_owner_retired');
      // Installed native dependency, loaded only for the user's explicit camera action.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { mediaDevices, RTCView } = require('@stream-io/react-native-webrtc') as typeof import('@stream-io/react-native-webrtc');
      stream = await mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: 640, height: 480, frameRate: 24 } });
      captures = retainNativeCaptureTracks(stream);
      if (stream.getAudioTracks().length || !stream.getVideoTracks().length) throw Error('connect_camera_preview_invalid');
      if (!current()) { await lease.release(); throw Error('connect_native_owner_retired'); }
      render = () => {
          if (!current() || closed || !stream) return null;
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const React = require('react') as typeof import('react');
          return React.createElement(RTCView, { streamURL: stream.toURL(), mirror: true, objectFit: 'cover',
            style: { width: '100%', height: '100%' }, zOrder: 0, accessibilityLabel: 'Your private camera preview' });
      };
      return resource;
    } catch (error) {
      try { await lease.release(); }
      catch { throw new PrivateCameraAllocationError(resource); }
      throw error;
    }
  });
}
