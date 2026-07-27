import { useChatThreadRealtime } from './use-chat-thread-realtime';

type StartRealtimeSubscription = () => (() => void) | void;

/** Single integration point for all focus-scoped thread realtime streams. */
export const useChatThreadRealtimeController = ({
  startMessages,
  startAncillary,
}: {
  startMessages: StartRealtimeSubscription;
  startAncillary: StartRealtimeSubscription;
}) => {
  useChatThreadRealtime(startMessages);
  useChatThreadRealtime(startAncillary);
};
