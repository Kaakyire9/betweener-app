export const CHAT_ATTACHMENT_LIMITS = {
  imageBytes: 15 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  videoDurationMs: 2 * 60 * 1000,
  documentBytes: 25 * 1024 * 1024,
} as const;

const SAFE_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

const SAFE_DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv',
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
export const validateChatAttachment = (candidate: ChatAttachmentCandidate): string | null => {
  const sizeBytes = Number(candidate.sizeBytes ?? 0);
  if (candidate.kind === 'image' && sizeBytes > CHAT_ATTACHMENT_LIMITS.imageBytes) {
    return `Choose an image smaller than ${formatLimit(CHAT_ATTACHMENT_LIMITS.imageBytes)}.`;
  }

  if (candidate.kind === 'video') {
    if (sizeBytes > CHAT_ATTACHMENT_LIMITS.videoBytes) {
      return `Choose a video smaller than ${formatLimit(CHAT_ATTACHMENT_LIMITS.videoBytes)}.`;
    }
    if (Number(candidate.durationMs ?? 0) > CHAT_ATTACHMENT_LIMITS.videoDurationMs) {
      return 'Choose a video that is 2 minutes or shorter.';
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
      (normalizedMime === 'application/octet-stream' && SAFE_DOCUMENT_EXTENSIONS.has(extension));
    if (!isSafeType) {
      return 'For safety, send a PDF, Word, Excel, PowerPoint, text, or CSV document.';
    }
  }

  return null;
};
