interface ReceiverTrack { enabled: boolean; readyState: string; stop(): void }

/** Keep late retired-call callbacks away from a disposed native manager.
 * A dropped receiver is stopped, never treated as successfully decrypted media. */
export function createEncryptionTransformGuard<Sender, Receiver extends { track: ReceiverTrack | null }>(
  manager: { encrypt(sender: Sender, codec?: string, trackType?: string): void;
    decrypt(receiver: Receiver, userId: string, trackType?: string): void },
  current: () => boolean,
) {
  return {
    encrypt(sender: Sender, codec?: string, trackType?: string) {
      // The SDK attaches the sender's track only after this returns. Throwing
      // prevents a retired sender from publishing without a transform.
      if (!current()) throw Error('connect_e2ee_owner_retired');
      manager.encrypt(sender, codec, trackType);
    },
    decrypt(receiver: Receiver, userId: string, trackType?: string) {
      if (current()) { manager.decrypt(receiver, userId, trackType); return; }
      const track = receiver.track;
      if (!track) throw Error('connect_e2ee_retired_track_unconfirmed');
      if (track.readyState === 'ended') return;
      let failed = false;
      try { track.enabled = false; } catch { failed = true; }
      try { track.stop(); } catch { failed = true; }
      try { if (track.readyState !== 'ended' || track.enabled) failed = true; } catch { failed = true; }
      if (failed) throw Error('connect_e2ee_retired_track_unconfirmed');
    },
  };
}
