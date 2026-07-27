import type { MessageType } from '@/components/chat/types';

export type TextRetryPlan = {
  clientMessageId: string;
  sendingMessage: MessageType;
};

/** Creates the durable optimistic state for a failed text-message retry. */
export const createTextRetryPlan = ({
  message,
  now = Date.now(),
}: {
  message: MessageType;
  now?: number;
}): TextRetryPlan => {
  const clientMessageId =
    message.clientMessageId ??
    (message.id.startsWith('temp-') ? message.id : `retry-${message.id}-${now}`);

  return {
    clientMessageId,
    sendingMessage: {
      ...message,
      clientMessageId,
      status: 'sending',
    },
  };
};

export const getAttachmentRetryStatus = (networkReady: boolean) =>
  networkReady ? 'sending' as const : 'queued' as const;

/** Network failures remain retryable and should not show a terminal alert. */
export const shouldShowAttachmentRetryFailure = (isNetworkFailure: boolean) => !isNetworkFailure;
