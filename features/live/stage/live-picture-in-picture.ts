import {
  isStudioPresentationScene,
  type ProgramSource,
  type ProgramSourceSlot,
  type ProgramState,
} from '@betweener/live-program-domain';

export type LivePictureInPictureProgramSource = {
  providerUserId: string;
  trackType: 'screenShareTrack' | 'videoTrack';
  fit: 'contain' | 'cover';
};

const PICTURE_IN_PICTURE_SOURCE_PRIORITY: readonly ProgramSourceSlot[] = [
  'pip',
  'primary',
  'host',
];

const isUsableVideoSource = (source: ProgramSource): boolean => (
  source.hasVideo
  && Boolean(source.providerUserId?.trim())
  && (source.readiness === 'ready' || source.readiness === 'live')
  && source.health !== 'lost'
);

/**
 * Resolves one stable native PiP visual from the authoritative Studio scene.
 * Studio may explicitly assign `pip`; otherwise the primary screen share wins,
 * followed by the host camera. Non-Studio scenes keep normal active-speaker PiP.
 */
export const resolveLivePictureInPictureProgramSource = (
  program: ProgramState | null,
  sources: readonly ProgramSource[],
): LivePictureInPictureProgramSource | null => {
  if (!program || !isStudioPresentationScene(program.scene)) return null;
  const sourcesByKey = new Map(sources.map((source) => [source.key, source]));

  for (const slot of PICTURE_IN_PICTURE_SOURCE_PRIORITY) {
    const sourceKey = program.sourceAssignments[slot];
    const source = sourceKey ? sourcesByKey.get(sourceKey) : undefined;
    if (!source || !isUsableVideoSource(source) || !source.providerUserId) continue;
    const screenShare = source.type === 'screen_share';
    return {
      providerUserId: source.providerUserId,
      trackType: screenShare ? 'screenShareTrack' : 'videoTrack',
      fit: screenShare ? 'contain' : 'cover',
    };
  }

  return null;
};
