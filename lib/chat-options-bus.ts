type ChatOptionsAction =
  | 'view-profile'
  | 'search-chat'
  | 'media-hub'
  | 'suggest-date'
  | 'toggle-mute'
  | 'toggle-pin'
  | 'clear-chat'
  | 'toggle-block'
  | 'report-user';

type ChatOptionsActionPayload = {
  type: ChatOptionsAction;
  force?: boolean;
  value?: boolean;
};

const pendingActions = new Map<string, ChatOptionsActionPayload>();
type ChatOptionsFeedbackPayload = {
  label: string;
  icon: string;
};
const pendingFeedback = new Map<string, ChatOptionsFeedbackPayload>();
type ChatOptionsPrefsPreview = {
  muted?: boolean;
  pinned?: boolean;
};

const prefsPreviewListeners = new Map<string, Set<(preview: ChatOptionsPrefsPreview) => void>>();

export function queueChatOptionsAction(targetId: string, action: ChatOptionsActionPayload) {
  if (!targetId) return;
  pendingActions.set(targetId, action);
}

export function consumeChatOptionsAction(targetId: string): ChatOptionsActionPayload | null {
  if (!targetId) return null;
  const action = pendingActions.get(targetId) ?? null;
  if (action) {
    pendingActions.delete(targetId);
  }
  return action;
}

export function queueChatOptionsFeedback(targetId: string, feedback: ChatOptionsFeedbackPayload) {
  if (!targetId) return;
  pendingFeedback.set(targetId, feedback);
}

export function consumeChatOptionsFeedback(targetId: string): ChatOptionsFeedbackPayload | null {
  if (!targetId) return null;
  const feedback = pendingFeedback.get(targetId) ?? null;
  if (feedback) {
    pendingFeedback.delete(targetId);
  }
  return feedback;
}

export function publishChatOptionsPrefsPreview(targetId: string, preview: ChatOptionsPrefsPreview) {
  if (!targetId) return;
  const listeners = prefsPreviewListeners.get(targetId);
  if (!listeners || listeners.size === 0) return;
  listeners.forEach((listener) => {
    try {
      listener(preview);
    } catch {
      // Ignore listener errors so one broken subscriber does not block others.
    }
  });
}

export function subscribeChatOptionsPrefsPreview(
  targetId: string,
  listener: (preview: ChatOptionsPrefsPreview) => void
) {
  if (!targetId) return () => {};
  const listeners = prefsPreviewListeners.get(targetId) ?? new Set<(preview: ChatOptionsPrefsPreview) => void>();
  listeners.add(listener);
  prefsPreviewListeners.set(targetId, listeners);
  return () => {
    const current = prefsPreviewListeners.get(targetId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      prefsPreviewListeners.delete(targetId);
    }
  };
}

export type {
  ChatOptionsAction,
  ChatOptionsActionPayload,
  ChatOptionsFeedbackPayload,
  ChatOptionsPrefsPreview,
};
