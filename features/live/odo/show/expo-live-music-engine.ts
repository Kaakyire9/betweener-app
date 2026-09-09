import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import type { LiveMusicEngine, LiveMusicPlaybackCommand } from './live-music-engine.ts';

export class ExpoLiveMusicEngine implements LiveMusicEngine {
  private player: AudioPlayer | null = null;

  async load(command: LiveMusicPlaybackCommand): Promise<void> {
    this.player?.pause();
    this.player?.remove();
    const player = createAudioPlayer(
      { uri: command.uri },
      { updateInterval: 500, keepAudioSessionActive: false },
    );
    player.loop = false;
    player.volume = Math.max(0, Math.min(0.5, command.volume));
    this.player = player;
    if (command.offsetSeconds > 0) await player.seekTo(command.offsetSeconds);
  }

  async play(): Promise<void> { this.player?.play(); }
  async pause(): Promise<void> { this.player?.pause(); }
  async seek(offsetSeconds: number): Promise<void> {
    await this.player?.seekTo(Math.max(0, offsetSeconds));
  }
  async setVolume(volume: number): Promise<void> {
    if (this.player) this.player.volume = Math.max(0, Math.min(0.5, volume));
  }
  async stop(): Promise<void> {
    this.player?.pause();
    await this.player?.seekTo(0);
  }
  async dispose(): Promise<void> {
    this.player?.pause();
    this.player?.remove();
    this.player = null;
  }
}
