export const formatRemainingTime = (expiresAt: Date | null | undefined, now: number) => {
  if (!expiresAt) return 'Live';
  const diffMs = expiresAt.getTime() - now;
  if (diffMs <= 0) return 'Live ended';
  const totalMinutes = Math.ceil(diffMs / 60000);
  if (totalMinutes < 60) return `Ends in ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `Ends in ${hours}h` : `Ends in ${hours}h ${minutes}m`;
};

export const formatDateInviteWhen = (date: Date) =>
  `${date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} at ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;

export const formatFileSize = (bytes?: number | null) => {
  if (bytes == null || Number.isNaN(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) return `${megabytes.toFixed(1)} MB`;
  return `${(megabytes / 1024).toFixed(1)} GB`;
};

export const getFileTypeLabel = (mimeType?: string | null, fileName?: string | null) => {
  const mime = mimeType?.toLowerCase() ?? '';
  const extension = fileName?.split('.').pop()?.toLowerCase() ?? '';
  if (mime.includes('pdf') || extension === 'pdf') return 'PDF';
  if (mime.includes('msword') || extension === 'doc') return 'DOC';
  if (mime.includes('wordprocessingml') || extension === 'docx') return 'DOCX';
  if (mime.includes('presentation') || extension === 'ppt' || extension === 'pptx') return 'PPT';
  if (mime.includes('spreadsheet') || extension === 'xls' || extension === 'xlsx') return 'XLS';
  if (mime.includes('zip') || extension === 'zip') return 'ZIP';
  if (mime.includes('plain') || extension === 'txt' || extension === 'text') return 'TXT';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(extension)) return 'Image';
  if (mime.startsWith('video/') || ['mp4', 'mov'].includes(extension)) return 'Video';
  return extension ? extension.toUpperCase() : 'File';
};

export const formatIntentTypeLabel = (type?: string | null) => {
  switch (type) {
    case 'connect': return 'Connect request';
    case 'date_request': return 'Date request';
    case 'like_with_note': return 'Like with message';
    case 'circle_intro': return 'Circle intro';
    default: return 'Request';
  }
};

export const formatIntentExpiresIn = (iso?: string | null, now = Date.now()) => {
  if (!iso) return '';
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return '';
  return `${Math.ceil(Math.max(0, timestamp - now) / 3_600_000)}h`;
};
