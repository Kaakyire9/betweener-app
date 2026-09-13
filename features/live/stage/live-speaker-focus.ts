import { useEffect, useMemo, useRef, useState } from 'react';

export const LIVE_SPEAKER_ACQUIRE_DELAY_MS = 360;
export const LIVE_SPEAKER_SWITCH_DELAY_MS = 680;
export const LIVE_SPEAKER_RELEASE_DELAY_MS = 1_400;
export const LIVE_SPEAKER_MINIMUM_HOLD_MS = 2_400;

export type LiveSpeakerSignal = {
  userId: string;
  hasAudio: boolean;
  isSpeaking: boolean;
};

export type LiveSpeakerFocusPlan = {
  targetUserId: string | null;
  delayMs: number | null;
};

export const selectLeadingLiveSpeaker = (
  signals: readonly LiveSpeakerSignal[],
  focusedUserId: string | null,
): string | null => {
  const speaking = signals.filter((signal) => signal.hasAudio && signal.isSpeaking);
  if (focusedUserId && speaking.some((signal) => signal.userId === focusedUserId)) {
    return focusedUserId;
  }
  return speaking[0]?.userId ?? null;
};

/**
 * Plans focus without moving any native video surface. A speaker must be
 * sustained before acquisition, the current speaker receives a minimum hold,
 * and short pauses do not make the programme frame flicker.
 */
export const planLiveSpeakerFocus = (input: {
  focusedUserId: string | null;
  focusedAt: number;
  leadingSpeakerUserId: string | null;
  now: number;
}): LiveSpeakerFocusPlan => {
  if (input.focusedUserId === input.leadingSpeakerUserId) {
    return { targetUserId: input.focusedUserId, delayMs: null };
  }
  if (!input.leadingSpeakerUserId) {
    return {
      targetUserId: null,
      delayMs: input.focusedUserId ? LIVE_SPEAKER_RELEASE_DELAY_MS : null,
    };
  }
  if (!input.focusedUserId) {
    return {
      targetUserId: input.leadingSpeakerUserId,
      delayMs: LIVE_SPEAKER_ACQUIRE_DELAY_MS,
    };
  }
  const minimumHoldRemaining = Math.max(
    0,
    LIVE_SPEAKER_MINIMUM_HOLD_MS - (input.now - input.focusedAt),
  );
  return {
    targetUserId: input.leadingSpeakerUserId,
    delayMs: Math.max(LIVE_SPEAKER_SWITCH_DELAY_MS, minimumHoldRemaining),
  };
};

export const useStableLiveSpeakerFocus = (
  signals: readonly LiveSpeakerSignal[],
): string | null => {
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null);
  const focusedAtRef = useRef(0);
  const availableSignature = signals.map((signal) => signal.userId).join('|');
  const availableUserIds = useMemo(
    () => new Set(availableSignature ? availableSignature.split('|') : []),
    [availableSignature],
  );
  const leadingSpeakerUserId = selectLeadingLiveSpeaker(signals, focusedUserId);

  useEffect(() => {
    if (focusedUserId && !availableUserIds.has(focusedUserId)) {
      focusedAtRef.current = 0;
      setFocusedUserId(null);
      return undefined;
    }
    const plan = planLiveSpeakerFocus({
      focusedUserId,
      focusedAt: focusedAtRef.current,
      leadingSpeakerUserId,
      now: Date.now(),
    });
    if (plan.delayMs == null) return undefined;
    const timer = setTimeout(() => {
      focusedAtRef.current = Date.now();
      setFocusedUserId(plan.targetUserId);
    }, plan.delayMs);
    return () => clearTimeout(timer);
  }, [availableUserIds, focusedUserId, leadingSpeakerUserId]);

  return focusedUserId;
};
