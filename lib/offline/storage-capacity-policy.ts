export const CHAT_STORAGE_MINIMUM_RESERVE_BYTES = 256 * 1024 * 1024;

export const hasLocalStorageCapacity = ({
  freeBytes,
  requiredBytes,
  reserveBytes = CHAT_STORAGE_MINIMUM_RESERVE_BYTES,
}: {
  freeBytes: number;
  requiredBytes: number;
  reserveBytes?: number;
}) =>
  Number.isFinite(freeBytes) &&
  Number.isFinite(requiredBytes) &&
  freeBytes - Math.max(0, requiredBytes) >= Math.max(0, reserveBytes);
