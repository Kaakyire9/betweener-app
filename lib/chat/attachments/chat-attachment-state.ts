export const CHAT_ATTACHMENT_STATES = [
  'queued',
  'uploading',
  'uploaded',
  'validating',
  'ready',
  'failed',
  'cancelled',
  'deleted',
] as const;

export type ChatAttachmentState = (typeof CHAT_ATTACHMENT_STATES)[number];

const ALLOWED_TRANSITIONS: Readonly<Record<ChatAttachmentState, readonly ChatAttachmentState[]>> = {
  queued: ['uploading', 'cancelled', 'failed'],
  uploading: ['uploaded', 'queued', 'cancelled', 'failed'],
  uploaded: ['validating', 'cancelled', 'failed'],
  validating: ['ready', 'uploaded', 'cancelled', 'failed'],
  ready: ['deleted'],
  failed: ['queued', 'cancelled', 'deleted'],
  cancelled: ['deleted'],
  deleted: [],
};

export const canTransitionChatAttachment = (
  from: ChatAttachmentState,
  to: ChatAttachmentState,
) => from === to || ALLOWED_TRANSITIONS[from].includes(to);

export const assertChatAttachmentTransition = (
  from: ChatAttachmentState,
  to: ChatAttachmentState,
) => {
  if (!canTransitionChatAttachment(from, to)) {
    throw new Error(`invalid_chat_attachment_transition:${from}:${to}`);
  }
};
