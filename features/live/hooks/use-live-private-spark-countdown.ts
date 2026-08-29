import { useEffect, useState } from 'react';

export const getLivePrivateSparkRemainingSeconds = (
  expiresAt: string | null,
  nowMs = Date.now(),
): number | null => {
  if (!expiresAt) return null;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return null;
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1_000));
};

export const formatLivePrivateSparkRemainingTime = (seconds: number | null): string => {
  if (seconds === null) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

export const useLivePrivateSparkCountdown = (expiresAt: string | null) => {
  const [remainingSeconds, setRemainingSeconds] = useState(() => (
    getLivePrivateSparkRemainingSeconds(expiresAt)
  ));

  useEffect(() => {
    const update = () => setRemainingSeconds(
      getLivePrivateSparkRemainingSeconds(expiresAt),
    );
    update();
    if (!expiresAt) return undefined;
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return remainingSeconds;
};
