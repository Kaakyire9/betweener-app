import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConnectPreferences } from '../domain/connect';

interface PreferencesPort {
  get(): Promise<ConnectPreferences>;
  set(voice: boolean, video: boolean): Promise<unknown>;
  setMedia?(media: 'voice' | 'video', enabled: boolean): Promise<unknown>;
}
/** Shared UI state only. The authenticated service and RPC retain all authority. */
export function useCallingPreferences(port: PreferencesPort, { autoLoad = true } = {}) {
  const owner = useMemo(() => ({ active: false, read: 0, write: 0, pending: false }), [port]);
  const [value, setValue] = useState<ConnectPreferences | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const read = useCallback(async () => {
    const version = ++owner.read;
    try {
      const next = await port.get();
      if (!owner.active || version !== owner.read) return null;
      if (typeof next?.voice !== 'boolean' || typeof next?.video !== 'boolean') throw Error('connect_unavailable');
      setValue({ voice: next.voice, video: next.video }); setError(false);
      return next;
    } catch {
      if (owner.active && version === owner.read) { setValue(null); setError(true); }
      return null;
    }
  }, [owner, port]);
  const refresh = useCallback(() => owner.active && !owner.pending ? read() : Promise.resolve(null), [owner, read]);
  useEffect(() => {
    owner.active = true; owner.pending = false; setValue(null); setBusy(false); setError(false);
    if (autoLoad) void refresh();
    return () => { owner.active = false; ++owner.read; ++owner.write; };
  }, [autoLoad, owner, refresh]);
  const setMedia = useCallback(async (media: 'voice' | 'video', enabled: boolean) => {
    if (!value || !owner.active || owner.pending) return false;
    // Video opt-in requires the atomic media-specific contract. Never persist a
    // cached voice/video pair as an implicit approval of the other media type.
    if (media === 'video' && !port.setMedia) { setError(true); return false; }
    const version = ++owner.write; ++owner.read; owner.pending = true; setBusy(true); setError(false);
    const current = () => owner.active && version === owner.write;
    try {
      if (port.setMedia) await port.setMedia(media, enabled);
      else await port.set(enabled, value.video);
      if (!current()) return false;
      // A resolved write is followed by authoritative readback, never optimistic opt-in.
      const result = await read();
      const confirmed = result !== null && result[media] === enabled;
      if (!confirmed && current()) setError(true);
      return confirmed;
    } catch {
      if (current()) { setValue(null); setError(true); }
      return false;
    } finally { if (current()) { owner.pending = false; setBusy(false); } }
  }, [owner, port, read, value]);
  const setVoice = useCallback((enabled: boolean) => setMedia('voice', enabled), [setMedia]);
  const setVideo = useCallback((enabled: boolean) => setMedia('video', enabled), [setMedia]);
  return { value, busy, error, refresh, setVoice, setVideo };
}
