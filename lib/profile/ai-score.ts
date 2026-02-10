export const normalizeAiScorePercent = (raw: unknown): number | undefined => {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return undefined;

  // Your schema uses 0..100.
  const clamped = Math.max(0, Math.min(100, n));
  return clamped;
};

export const toRoundedPercentInt = (pct: number | undefined): number | undefined => {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return undefined;
  return Math.max(0, Math.min(100, Math.round(pct)));
};
