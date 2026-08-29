import type { LiveChemistrySnapshot } from '../application/live-models.ts';

export type LiveChemistryAction = 'offer_reveal' | 'mark_ready' | 'waiting' | 'none';

export const canRenderLiveChemistryStage = (
  required: boolean,
  snapshot: LiveChemistrySnapshot | null,
): boolean => !required || snapshot?.state === 'revealed';

export const canPublishLiveChemistryVideo = canRenderLiveChemistryStage;

export const liveChemistryAction = (
  snapshot: LiveChemistrySnapshot | null,
): LiveChemistryAction => {
  if (!snapshot || snapshot.state !== 'concealed') return 'none';
  if (snapshot.myReady) return 'waiting';
  return snapshot.revealOfferedAt ? 'mark_ready' : 'offer_reveal';
};

export const liveChemistryContextLine = (
  value: string | number | null | undefined,
): string | null => {
  if (typeof value === 'number') return String(value);
  const normalized = value?.trim();
  return normalized || null;
};
