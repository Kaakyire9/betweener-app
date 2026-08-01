export const CHAT_RESUMABLE_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;
export const CHAT_TUS_CHECKPOINT_MAX_AGE_MS = 23 * 60 * 60 * 1000;

export const buildChatUploadFingerprint = ({
  bucket,
  objectPath,
  byteSize,
  contentType,
}: {
  bucket: string;
  objectPath: string;
  byteSize: number;
  contentType: string;
}) => `chat:${bucket}:${objectPath}:${Math.max(0, Math.round(byteSize))}:${contentType}`;

export const createDirectStorageOrigin = (supabaseUrl: string) => {
  try {
    const url = new URL(supabaseUrl);
    if (url.hostname.endsWith('.supabase.co')) {
      url.hostname = url.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
    }
    return url.origin;
  } catch {
    return supabaseUrl.replace(/\/+$/, '');
  }
};

export const isFreshChatUploadCheckpoint = (
  creationTime: string,
  now = Date.now(),
) => {
  const createdAt = Date.parse(creationTime);
  return (
    Number.isFinite(createdAt) &&
    createdAt <= now &&
    now - createdAt < CHAT_TUS_CHECKPOINT_MAX_AGE_MS
  );
};
