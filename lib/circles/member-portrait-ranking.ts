const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getUtcPortraitDayKey = (date = new Date()) => date.toISOString().slice(0, 10);

export const selectDailyPortraitLead = <T,>(
  items: T[],
  scopeKey: string,
  getId: (item: T) => string,
  dayKey = getUtcPortraitDayKey(),
) => [...items].sort((left, right) => (
  stableHash(`${scopeKey}:${dayKey}:${getId(left)}`)
    - stableHash(`${scopeKey}:${dayKey}:${getId(right)}`)
))[0] ?? null;
