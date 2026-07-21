export const CHAT_ATTACHMENT_LIMITS = {
  imageBytes: 15 * 1024 * 1024,
  /** Raw videos may be larger because they are optimized before upload. */
  videoSourceBytes: 750 * 1024 * 1024,
  /** Keep headroom below the chat-media bucket's 100 MB object limit. */
  videoUploadBytes: 90 * 1024 * 1024,
  /** Whole-file encryption is memory-bound; keep view-once videos conservative. */
  viewOnceVideoBytes: 25 * 1024 * 1024,
  videoDurationMs: 2 * 60 * 1000,
  documentBytes: 50 * 1024 * 1024,
} as const;

export const CHAT_DOCUMENT_PICKER_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  'text/rtf',
  'application/vnd.apple.pages',
  'application/vnd.apple.numbers',
  'application/vnd.apple.keynote',
] as const;

const SAFE_DOCUMENT_MIME_TYPES = new Set<string>(CHAT_DOCUMENT_PICKER_MIME_TYPES);

const SAFE_DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv',
  'rtf', 'pages', 'numbers', 'key',
]);

const extensionOf = (fileName?: string | null) =>
  String(fileName || '').split('.').pop()?.trim().toLowerCase() || '';

const formatLimit = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export type ChatAttachmentCandidate = {
  kind: 'image' | 'video' | 'document';
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null;
};

export type ChatAttachmentValidationPhase = 'selection' | 'upload';

export const validateChatAttachment = (
  candidate: ChatAttachmentCandidate,
  phase: ChatAttachmentValidationPhase = 'selection',
): string | null => {
  const sizeBytes = Number(candidate.sizeBytes ?? 0);
  if (candidate.kind === 'image' && sizeBytes > CHAT_ATTACHMENT_LIMITS.imageBytes) {
    return `Choose an image smaller than ${formatLimit(CHAT_ATTACHMENT_LIMITS.imageBytes)}.`;
  }

  if (candidate.kind === 'video') {
    if (Number(candidate.durationMs ?? 0) > CHAT_ATTACHMENT_LIMITS.videoDurationMs) {
      return 'Choose a video that is 2 minutes or shorter.';
    }
    const limit = phase === 'upload'
      ? CHAT_ATTACHMENT_LIMITS.videoUploadBytes
      : CHAT_ATTACHMENT_LIMITS.videoSourceBytes;
    if (sizeBytes > limit) {
      return phase === 'upload'
        ? 'This video could not be reduced enough to send. Try trimming it, then send it again.'
        : `Choose a video smaller than ${formatLimit(limit)}.`;
    }
  }

  if (candidate.kind === 'document') {
    if (sizeBytes > CHAT_ATTACHMENT_LIMITS.documentBytes) {
      return `Choose a document smaller than ${formatLimit(CHAT_ATTACHMENT_LIMITS.documentBytes)}.`;
    }
    const normalizedMime = String(candidate.mimeType || '').toLowerCase();
    const extension = extensionOf(candidate.fileName);
    const isSafeType =
      SAFE_DOCUMENT_MIME_TYPES.has(normalizedMime) ||
      SAFE_DOCUMENT_EXTENSIONS.has(extension);
    if (!isSafeType) {
      return 'For safety, send a PDF, Word, Excel, PowerPoint, Pages, Numbers, Keynote, RTF, text, or CSV document.';
    }
  }

  return null;
};
