export type ForegroundChatMessageEvent = {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string | null;
  message_type: string | null;
  is_view_once: boolean | null;
};

type ForegroundChatMessageListener = (event: ForegroundChatMessageEvent) => void;

const foregroundChatMessageListeners = new Set<ForegroundChatMessageListener>();

export const emitForegroundChatMessage = (event: ForegroundChatMessageEvent) => {
  foregroundChatMessageListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // best effort only
    }
  });
};

export const subscribeForegroundChatMessages = (
  listener: ForegroundChatMessageListener,
) => {
  foregroundChatMessageListeners.add(listener);
  return () => {
    foregroundChatMessageListeners.delete(listener);
  };
};
