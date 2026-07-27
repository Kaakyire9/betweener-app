type LocalFileInfo = {
  exists: boolean;
  size?: number | null;
};

const isUsableByteSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * The staged file is the exact payload uploaded to storage. Its on-disk size
 * must therefore win over picker metadata, which becomes stale after media
 * normalization or video compression.
 */
export const resolveAuthoritativeAttachmentByteSize = ({
  localFileInfo,
  declaredByteSize,
}: {
  localFileInfo: LocalFileInfo;
  declaredByteSize?: number | null;
}): number | null => {
  if (localFileInfo.exists && isUsableByteSize(localFileInfo.size)) {
    return Math.round(localFileInfo.size);
  }
  return isUsableByteSize(declaredByteSize) ? Math.round(declaredByteSize) : null;
};

export const normalizeAttachmentDurationMs = (value?: number | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
};
