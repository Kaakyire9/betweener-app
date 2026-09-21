export type ChatAttachmentFailurePresentation = {
  title: string;
  message: string;
  retryable: boolean;
};

const normalizeErrorCode = (value: unknown) => String(value ?? '').trim().toLowerCase();

const TERMINAL_ATTACHMENT_ERROR_CODES = new Set([
  'attachment_content_mismatch',
  'attachment_metadata_invalid',
  'attachment_size_invalid',
  'attachment_source_missing',
  'attachment_upload_not_authorized',
  'image_content_not_allowed',
  'image_review_required',
  'invalid_attachment_batch',
  'invalid_attachment_batch_item',
  'unsupported_attachment',
]);

export const isTerminalChatAttachmentError = (value: unknown) => {
  const code = normalizeErrorCode(value);
  return TERMINAL_ATTACHMENT_ERROR_CODES.has(code) ||
    code.startsWith('attachment_finalize_http_4') &&
      !code.endsWith('_408') &&
      !code.endsWith('_409') &&
      !code.endsWith('_429');
};

export const getChatAttachmentFailurePresentation = (
  value: unknown,
): ChatAttachmentFailurePresentation => {
  const code = normalizeErrorCode(value);

  if (code === 'image_content_not_allowed') {
    return {
      title: 'Photo not sent',
      message: 'This image appears to contain nudity, sexual content, or other prohibited material. Choose another photo.',
      retryable: false,
    };
  }
  if (code === 'image_review_required') {
    return {
      title: 'Photo not approved',
      message: 'This image could not be approved automatically. Choose another photo.',
      retryable: false,
    };
  }
  if (code === 'attachment_size_invalid') {
    return {
      title: 'Photo is too large',
      message: 'Choose a smaller photo and try again.',
      retryable: false,
    };
  }
  if (code === 'attachment_content_mismatch' || code === 'unsupported_attachment') {
    return {
      title: 'Photo format not supported',
      message: 'Choose a JPG, PNG, or another supported image.',
      retryable: false,
    };
  }
  if (code === 'attachment_source_missing') {
    return {
      title: 'Photo is no longer available',
      message: 'Choose the photo again to send it.',
      retryable: false,
    };
  }
  if (code === 'attachment_upload_not_authorized') {
    return {
      title: 'Photo upload unavailable',
      message: 'This photo could not be uploaded securely. Sign in again, then choose the photo once more.',
      retryable: false,
    };
  }
  if (isTerminalChatAttachmentError(code)) {
    return {
      title: 'Photo not sent',
      message: 'This photo could not be accepted. Choose another photo.',
      retryable: false,
    };
  }
  if (
    code === 'image_moderation_unavailable' ||
    code === 'image_moderation_rate_limited' ||
    code === 'content_moderation_record_failed' ||
    code.startsWith('attachment_finalize_http_5') ||
    code === 'attachment_finalize_http_429'
  ) {
    return {
      title: 'Safety check unavailable',
      message: 'We could not check this photo right now. Try again shortly.',
      retryable: true,
    };
  }

  return {
    title: 'Photo not sent',
    message: 'We could not send this photo. Check your connection and try again.',
    retryable: true,
  };
};

export const getChatAttachmentRetryLabel = (value: unknown) => {
  const code = normalizeErrorCode(value);
  if (
    code.includes('moderation') ||
    code === 'attachment_finalize_http_429' ||
    code.startsWith('attachment_finalize_http_5')
  ) {
    return 'Safety check delayed · Retrying';
  }
  return 'Upload interrupted · Retrying';
};
