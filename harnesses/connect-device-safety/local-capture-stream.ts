import type { NativeTrack } from '../../features/connect/media/native-owner-types.ts';
import type { LocalStream } from './local-session.ts';

/** Owns one fresh getUserMedia stream, never SDK/shared/remote streams. */
export function ownLocalCaptureStream(stream: LocalStream): LocalStream {
  const tracks = [...new Set(stream.getTracks())];
  const released = new Set<NativeTrack>();
  let detach: 'not_started' | 'submitted' | 'unknown' = 'not_started';
  const detachStream = () => {
    if (detach === 'submitted') return;
    if (detach === 'unknown') throw new Error('device_harness_stream_detach_unconfirmed');
    // The pinned RN implementation removes native stream membership BEFORE
    // disposing the stream. Queue this while every native track is still valid;
    // otherwise Android removeTrack/dispose can dereference a disposed track.
    detach = 'unknown';
    stream.release(false);
    detach = 'submitted'; // Bridge submission only, never an OS/device ACK.
  };
  const owned = tracks.map((track): NativeTrack => ({
    get enabled() { return track.enabled; },
    set enabled(value) {
      if (!released.has(track)) track.enabled = value;
      else if (value) throw new Error('device_harness_track_released');
    },
    get readyState() { return track.readyState; },
    stop() { if (!released.has(track)) track.stop(); },
    release() {
      if (released.has(track)) return;
      if (typeof track.release !== 'function') throw new Error('device_harness_track_release_unsupported');
      detachStream();
      track.release();
      released.add(track);
    },
  }));
  return {
    // Retain inspection/cleanup handles after the raw stream empties its list.
    getTracks: () => [...owned],
    toURL: () => stream.toURL(),
    release(releaseTracks) {
      if (releaseTracks !== false || released.size !== tracks.length) {
        throw new Error('device_harness_track_release_unconfirmed');
      }
      detachStream();
    },
  };
}
