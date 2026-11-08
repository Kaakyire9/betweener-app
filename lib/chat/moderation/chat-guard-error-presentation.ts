export type ChatGuardFailureAction = 'send' | 'retry' | 'edit';

type ChatGuardFailureInput = {
  action?: ChatGuardFailureAction;
  code?: unknown;
  restrictedUntil?: unknown;
};

export type ChatGuardFailurePresentation = {
  title: string;
  message: string;
  outboxMessage: string;
};

const parseRestrictionExpiry = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const expiry = new Date(value);
  return Number.isNaN(expiry.getTime()) ? null : expiry;
};

export const formatChatRestrictionExpiry = (
  value: unknown,
  locale?: string,
) => {
  const expiry = parseRestrictionExpiry(value);
  if (!expiry) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(expiry);
};

export const getChatGuardFailurePresentation = ({
  action = 'send',
  code,
  restrictedUntil,
}: ChatGuardFailureInput): ChatGuardFailurePresentation => {
  const normalizedCode = String(code ?? '').trim().toUpperCase();
  const editTitle = action === 'edit' ? 'Edit not saved' : 'Message not sent';

  if (normalizedCode === 'MESSAGING_TEMPORARILY_RESTRICTED') {
    const formattedExpiry = formatChatRestrictionExpiry(restrictedUntil);
    const retryCopy = formattedExpiry
      ? `You can message again after ${formattedExpiry}.`
      : 'Please try again after the temporary pause ends.';
    const message = `Your account is temporarily unable to send messages following recent safety decisions. ${retryCopy}`;

    return {
      title: 'Messaging temporarily paused',
      message,
      outboxMessage: message,
    };
  }

  if (normalizedCode === 'MESSAGE_REPHRASE_REQUIRED') {
    const message = action === 'edit'
      ? 'Please rephrase this edit and try again. It was not added to an admin queue.'
      : 'Please rephrase this message and try again. It was not sent or added to an admin queue.';
    return { title: editTitle, message, outboxMessage: 'Please rephrase before sending.' };
  }

  if (normalizedCode === 'MESSAGE_REVIEW_REQUIRED') {
    const message = action === 'edit'
      ? 'This edit is being held for a safety review.'
      : 'This message is being held for a safety review.';
    return { title: editTitle, message, outboxMessage: message };
  }

  if (normalizedCode === 'MESSAGE_CONTENT_NOT_ALLOWED') {
    const message = 'Please remove solicitation, threats, scams, or unsafe content and try again.';
    return { title: editTitle, message, outboxMessage: 'Message does not meet Betweener safety rules.' };
  }

  const message = action === 'edit'
    ? 'Unable to update this message right now.'
    : action === 'retry'
      ? 'Unable to resend this message right now.'
      : 'Unable to send this message right now.';
  return {
    title: action === 'edit' ? 'Edit message' : action === 'retry' ? 'Retry failed' : 'Message not sent',
    message,
    outboxMessage: message,
  };
};
