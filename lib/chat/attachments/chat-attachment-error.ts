export type ChatAttachmentFailurePresentation = {
  title: string;
  message: string;
  retryable: boolean;
};

const normalizeErrorCode = (value: unknown) => String(value ?? '').trim().toLowerCase();

const MODERATION_REJECTION_ERROR_CODES = new Set([
  'image_content_not_allowed',
  'image_review_required',
]);

/** A conclusive media-policy decision, never a transport/provider outage. */
export const isChatMediaModerationRejection = (value: unknown) => {
  const code = normalizeErrorCode(value);
  if (MODERATION_REJECTION_ERROR_CODES.has(code)) return true;
  return Array.from(MODERATION_REJECTION_ERROR_CODES).some((candidate) =>
    code.includes(candidate),
  );
};

export const isChatMediaProviderUnavailable = (value: unknown) => {
  const code = normalizeErrorCode(value);
  return code === 'image_moderation_unavailable' ||
    code === 'encrypted_image_moderation_unavailable' ||
    code === 'image_moderation_rate_limited' ||
    code === 'content_moderation_record_failed' ||
    code.startsWith('attachment_finalize_http_5') ||
    code === 'attachment_finalize_http_429';
};

const TERMINAL_ATTACHMENT_ERROR_CODES = new Set([
  'attachment_content_mismatch',
  'attachment_metadata_invalid',
  'attachment_size_invalid',
  'attachment_source_missing',
  'attachment_upload_not_authorized',
  'image_content_not_allowed',
  'image_review_required',
  'caption_content_not_allowed',
  'caption_rephrase_required',
  'caption_review_required',
  'caption_too_long',
  'attachment_inspection_not_available',
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
  if (code === 'caption_content_not_allowed' || code === 'caption_rephrase_required') {
    return {
      title: 'Caption needs editing',
      message: 'Edit the album caption to remove contact promotion, payment requests, or prohibited content, then try again.',
      retryable: false,
    };
  }
  if (code === 'caption_too_long') {
    return {
      title: 'Caption is too long',
      message: 'Shorten the album caption to 2,000 characters or fewer, then try again.',
      retryable: false,
    };
  }
  if (code === 'caption_review_required') {
    return {
      title: 'Caption not approved',
      message: 'This caption could not be approved automatically. Edit it before sending the album.',
      retryable: false,
    };
  }
  if (code === 'attachment_inspection_not_available') {
    return {
      title: 'Media type unavailable',
      message: 'This media type is not available in this version yet. Remove it and send the supported items.',
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
  if (code === 'album_items_incomplete') {
    return {
      title: 'Album needs attention',
      message: 'One or more photos could not be sent. Retry, replace, or remove the unfinished photos.',
      retryable: true,
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
    code === 'encrypted_image_moderation_unavailable' ||
    code === 'image_moderation_rate_limited' ||
    code === 'caption_moderation_unavailable' ||
    code === 'caption_moderation_rate_limited' ||
    code === 'content_moderation_record_failed' ||
    code.startsWith('attachment_finalize_http_5') ||
    code === 'attachment_finalize_http_429'
  ) {
    return {
      title: 'Couldn’t check this photo',
      message: 'Something interrupted the safety check. Try again.',
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
    code.startsWith('caption_') ||
    code === 'attachment_finalize_http_429' ||
    code.startsWith('attachment_finalize_http_5')
  ) {
    return 'Safety check delayed · Retrying';
  }
  return 'Upload interrupted · Retrying';
};
