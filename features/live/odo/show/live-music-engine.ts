export type LiveMusicPlaybackCommand = {
  uri: string;
  offsetSeconds: number;
  volume: number;
};

/** Platform-neutral boundary. Odo controls logical music state, never a player. */
export interface LiveMusicEngine {
  load(command: LiveMusicPlaybackCommand): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(offsetSeconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
export class NoopLiveMusicEngine implements LiveMusicEngine {
  async load(_command: LiveMusicPlaybackCommand): Promise<void> {}
  async play(): Promise<void> {}
  async pause(): Promise<void> {}
  async seek(_offsetSeconds: number): Promise<void> {}
  async setVolume(_volume: number): Promise<void> {}
  async stop(): Promise<void> {}
  async dispose(): Promise<void> {}
}
