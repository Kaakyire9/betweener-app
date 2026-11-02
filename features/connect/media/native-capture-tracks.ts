import type { NativeTrack } from './native-owner-types.ts';

type CaptureStream = { getTracks(): NativeTrack[]; release?(tracks?: boolean): void };
/** Connect-owned SDK capture only. Never wraps Live or remote participant streams. */
export function retainNativeCaptureTracks(stream: CaptureStream): NativeTrack[] {
  const tracks = [...new Set(stream.getTracks())];
  const released = new Set<NativeTrack>();
  let detach: 'not_started' | 'submitted' | 'unknown' = 'not_started';
  return tracks.map(track => ({
    get enabled() { return track.enabled; },
    set enabled(value) { if (!released.has(track)) track.enabled = value; else if (value) throw new Error('connect_native_track_retired'); },
    get readyState() { return track.readyState; },
    stop() { if (!released.has(track)) track.stop(); },
    release() {
      if (released.has(track)) return;
      if (typeof track.release !== 'function' || typeof stream.release !== 'function') throw new Error('connect_native_release_unsupported');
      if (detach === 'unknown') throw new Error('connect_native_stream_release_unconfirmed');
      if (detach === 'not_started') {
        // Android stream disposal dereferences its members. Detach them while
        // native tracks still exist; later SDK release() sees an empty stream.
        detach = 'unknown'; stream.release(false); detach = 'submitted';
      }
      track.release(); released.add(track);
    },
  }));
}
