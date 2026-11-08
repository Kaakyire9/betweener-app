interface AudioTrack { kind: string; enabled: boolean; readyState: string; stop(): void }
interface MicrophonePausePort {
  current(): boolean;
  capture(): readonly AudioTrack[];
  published(): readonly AudioTrack[];
  status(): string;
  setStatus(status: 'enabled' | 'disabled'): void;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

/** Call-owned encrypted audio only. Pause the source and every sender clone
 * together; keep their encryptors and transceivers attached across ordinary mute.
 * End still stops all tracks independently of SDK/network completion. */
export function createNativeMicrophonePause(port: MicrophonePausePort) {
  let paused: Set<AudioTrack> | null = null;
  const assertCurrent = () => { if (!port.current()) throw Error('connect_native_owner_retired'); };
  const tracks = () => {
    const audio = (items: readonly AudioTrack[]) => items.filter(track => track.kind === 'audio' && track.readyState === 'live');
    const capture = audio(port.capture()), published = audio(port.published());
    return { capture, published, all: new Set([...capture, ...published]) };
  };
  const silence = (items: Iterable<AudioTrack>, stop = false) => {
    let failed = false;
    for (const track of items) {
      try { track.enabled = false; } catch { failed = true; }
      if (stop) { try { track.stop(); } catch { failed = true; } }
      try { if (track.enabled || (stop && track.readyState !== 'ended')) failed = true; } catch { failed = true; }
    }
    if (failed) throw Error('connect_native_microphone_pause_unconfirmed');
  };
  const sameTracks = (live: Set<AudioTrack>, expected: Set<AudioTrack>) => live.size === expected.size && [...expected].every(track => live.has(track));
  return {
    mute() {
      assertCurrent();
      const live = tracks();
      // A fresh muted join has no microphone to start or pause.
      if (!live.all.size && port.status() === 'disabled' && !paused) return;
      paused = new Set([...(paused ?? []), ...live.all]);
      silence(paused);
      if (!live.capture.length || !live.published.length || !sameTracks(live.all, paused)) throw Error('connect_native_microphone_pause_changed');
      port.setStatus('disabled');
    },
    enforce() {
      if (!paused) return;
      assertCurrent();
      const live = tracks();
      silence(new Set([...paused, ...live.all]));
      if (!sameTracks(live.all, paused)) throw Error('connect_native_microphone_pause_changed');
    },
    async enable() {
      assertCurrent();
      if (!paused) { await port.enable(); return; }
      const expected = paused, live = tracks();
      silence(new Set([...expected, ...live.all]));
      if (!sameTracks(live.all, expected)) throw Error('connect_native_microphone_pause_changed');
      try {
        for (const track of expected) track.enabled = true;
        assertCurrent();
        if ([...expected].some(track => !track.enabled || track.readyState !== 'live')) throw Error('connect_native_microphone_pause_unconfirmed');
        // Clear before the synchronous SDK status observer runs.
        paused = null; port.setStatus('enabled');
      } catch (error) { paused = expected; silence(expected); throw error; }
    },
    async stop() {
      const owned = new Set(paused ?? []); paused = null;
      let failed = false;
      try { for (const track of tracks().all) owned.add(track); } catch { failed = true; }
      try { silence(owned, true); } catch { failed = true; }
      // A failed local request must not suppress the independent SDK stop.
      await port.disable();
      if (failed) throw Error('connect_native_microphone_pause_unconfirmed');
    },
  };
}
