import type { MessageRowItemProps } from './message-row-contract';

const equalUriMaps = (
  left?: Readonly<Record<string, string>>,
  right?: Readonly<Record<string, string>>,
) => {
  if (left === right) return true;
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  return leftEntries.length === rightEntries.length &&
    leftEntries.every(([path, uri]) => right?.[path] === uri);
};

/**
 * Keeps virtualized rows stable when unrelated thread state changes.
 * The row component intentionally owns animation state, so this comparison is
 * explicit instead of relying on a shallow comparison.
 */
export const areMessageRowPropsEqual = (
  prev: Readonly<MessageRowItemProps>,
  next: Readonly<MessageRowItemProps>,
) =>
  prev.item === next.item &&
  prev.isMyMessage === next.isMyMessage &&
  prev.showAvatar === next.showAvatar &&
  prev.showAvatarSpacer === next.showAvatarSpacer &&
  prev.isGroupedWithPrev === next.isGroupedWithPrev &&
  prev.isGroupedWithNext === next.isGroupedWithNext &&
  prev.shouldAnimateEntry === next.shouldAnimateEntry &&
  prev.isPlaying === next.isPlaying &&
  prev.isReactionOpen === next.isReactionOpen &&
  prev.isFocused === next.isFocused &&
  prev.focusToken === next.focusToken &&
  prev.isActionPinned === next.isActionPinned &&
  prev.onRetryFailedMessage === next.onRetryFailedMessage &&
  prev.onOpenReactionSheet === next.onOpenReactionSheet &&
  prev.onEditMessage === next.onEditMessage &&
  prev.onOpenEditHistory === next.onOpenEditHistory &&
  prev.onOpenViewOnce === next.onOpenViewOnce &&
  prev.onAcceptDatePlan === next.onAcceptDatePlan &&
  prev.onSuggestAnotherTime === next.onSuggestAnotherTime &&
  prev.onSuggestAnotherPlace === next.onSuggestAnotherPlace &&
  prev.onSuggestBoth === next.onSuggestBoth &&
  prev.onRescheduleDatePlan === next.onRescheduleDatePlan &&
  prev.onCancelDatePlan === next.onCancelDatePlan &&
  prev.onRequestDatePlanConcierge === next.onRequestDatePlanConcierge &&
  prev.onAddDatePlanToCalendar === next.onAddDatePlanToCalendar &&
  prev.datePlanActionId === next.datePlanActionId &&
  prev.datePlanCalendarActionId === next.datePlanCalendarActionId &&
  prev.viewOnceViewedByMe === next.viewOnceViewedByMe &&
  prev.viewOnceViewedByPeer === next.viewOnceViewedByPeer &&
  prev.timeLabel === next.timeLabel &&
  prev.userAvatar === next.userAvatar &&
  prev.currentUserId === next.currentUserId &&
  prev.peerName === next.peerName &&
  prev.onReplyJump === next.onReplyJump &&
  prev.highlightQuery === next.highlightQuery &&
  prev.onHighlightPress === next.onHighlightPress &&
  prev.imageSize?.width === next.imageSize?.width &&
  prev.imageSize?.height === next.imageSize?.height &&
  prev.cachedImageUrl === next.cachedImageUrl &&
  prev.cachedVideoUrl === next.cachedVideoUrl &&
  prev.mediaFailure === next.mediaFailure &&
  equalUriMaps(prev.mediaUrisByPath, next.mediaUrisByPath) &&
  prev.onRefreshMedia === next.onRefreshMedia &&
  prev.onMediaLoadSuccess === next.onMediaLoadSuccess &&
  prev.onRetryMedia === next.onRetryMedia;
