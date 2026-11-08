export const CHAT_REPLY_SWIPE_MAX_DISTANCE = 72;
export const CHAT_REPLY_SWIPE_TRIGGER_DISTANCE = 52;

export const shouldClaimReplySwipe = (translationX: number, translationY: number) =>
  translationX > 8 && translationX > Math.abs(translationY) * 1.5;

export const shouldCommitReplySwipe = (translationX: number, velocityX: number) =>
  translationX >= CHAT_REPLY_SWIPE_TRIGGER_DISTANCE ||
  (translationX >= 28 && velocityX >= 0.55);

export const clampReplySwipeDistance = (translationX: number) =>
  Math.max(0, Math.min(translationX, CHAT_REPLY_SWIPE_MAX_DISTANCE));
