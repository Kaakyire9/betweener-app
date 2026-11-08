import { createAudioPlayer } from 'expo-audio';
import { useEffect, useSyncExternalStore } from 'react';
import type { VoiceController } from '../voice/voice-controller';
import { connectRingtone } from '../voice/ringtone';

const sources = { incoming: require('../../../assets/audio/connect-incoming.wav'), outgoing: require('../../../assets/audio/connect-ringback.wav') };

/** Foreground tones only. No microphone, background service or global audio-mode changes. */
export function ConnectRingtone({ controller }: { controller: VoiceController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const tone = connectRingtone(state);
  useEffect(() => {
    if (!tone) return;
    let player: ReturnType<typeof createAudioPlayer>;
    try {
      player = createAudioPlayer(sources[tone]);
      player.loop = true; player.volume = tone === 'incoming' ? 0.65 : 0.35; player.play();
    } catch {
      try { player?.remove(); } catch { /* Playback is optional; answering remains available. */ }
      return;
    }
    return () => {
      try { player.pause(); } catch { /* Still release the player. */ }
      try { player.remove(); } catch { /* Call teardown remains independent. */ }
    };
  }, [tone]);
  return null;
}
