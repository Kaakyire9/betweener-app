import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConnectPreferences } from '../domain/connect';

interface PreferencesPort {
  get(): Promise<ConnectPreferences>;
  set(voice: boolean, video: boolean): Promise<unknown>;
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
  const setVoice = useCallback(async (voice: boolean) => {
    if (!value || !owner.active || owner.pending) return false;
    const version = ++owner.write; ++owner.read; owner.pending = true; setBusy(true); setError(false);
    const current = () => owner.active && version === owner.write;
    try {
      await port.set(voice, value.video);
      if (!current()) return false;
      // A resolved write is followed by authoritative readback, never optimistic opt-in.
      return await read() !== null;
    } catch {
      if (current()) { setValue(null); setError(true); }
      return false;
    } finally { if (current()) { owner.pending = false; setBusy(false); } }
  }, [owner, port, read, value]);
  return { value, busy, error, refresh, setVoice };
}
