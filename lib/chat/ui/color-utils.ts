/** Converts a hex color to a clamped rgba color for chat surfaces. */
export const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(
    normalized.length === 3
      ? normalized.split('').map((character) => character + character).join('')
      : normalized,
    16,
  );
  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;
  return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
};
