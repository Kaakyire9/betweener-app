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

const usableDimension = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Preview files are generated inside a bounded square. Some Android codecs do
 * not expose the compressed JPEG dimensions, so picker dimensions can leak in
 * here even though they describe the original multi-megapixel asset. Keep the
 * aspect ratio while canonicalising the metadata to the preview's real bound.
 */
export const normalizeChatPreviewDimensions = ({
  width,
  height,
  maxEdge = 640,
}: {
  width?: number | null;
  height?: number | null;
  maxEdge?: number;
}): { width: number; height: number } => {
  const safeMaxEdge = usableDimension(maxEdge) ? Math.max(1, Math.round(maxEdge)) : 640;
  if (!usableDimension(width) || !usableDimension(height)) {
    return { width: safeMaxEdge, height: safeMaxEdge };
  }

  const scale = Math.min(1, safeMaxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};
