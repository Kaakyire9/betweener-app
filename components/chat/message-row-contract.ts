import { Colors } from '@/constants/theme';
import type { ChatMediaAccessFailure } from '@/lib/chat/media/chat-media-access';
import type { MessageType } from './types';

/** Stable orchestration contract for the interactive message bubble. */
export type MessageRowItemProps = {
  item: MessageType; isMyMessage: boolean; showAvatar: boolean; showAvatarSpacer: boolean;
  isGroupedWithPrev: boolean; isGroupedWithNext: boolean; shouldAnimateEntry: boolean;
  isPlaying: boolean; isReactionOpen: boolean; isFocused: boolean; focusToken: number;
  timeLabel: string; userAvatar: string | null; currentUserId: string; peerName: string;
  imageSize?: { width: number; height: number }; cachedImageUrl?: string; cachedVideoUrl?: string;
  mediaUrisByPath?: Readonly<Record<string, string>>;
  mediaFailure?: ChatMediaAccessFailure; theme: typeof Colors.light; isDark: boolean; styles: any;
  onLongPress: (messageId: string) => void; onRetryFailedMessage: (messageId: string) => void;
  onToggleVoice: (messageId: string) => void; onFocus: (messageId: string) => void;
  onReply: (message: MessageType) => void; onReplyJump: (messageId: string) => void;
  onEditMessage: (message: MessageType) => void; onAddReaction: (messageId: string, emoji: string) => void;
  onCloseReactions: () => void; onOpenEditHistory: (message: MessageType) => void;
  onCopyMessage: (message: MessageType) => void; onTogglePin: (message: MessageType, isPinned: boolean) => void;
  onDeleteMessage: (message: MessageType) => void; isActionPinned: boolean;
  onOpenReactionSheet: (message: MessageType) => void;
  onViewImage: (message: MessageType, renderedUrl: string, albumIndex?: number) => void;
  onViewVideo: (message: MessageType, renderedUrl: string, albumIndex?: number) => void;
  onManageAlbumItem: (message: MessageType, albumIndex: number) => void;
  onOpenDocument: (message: MessageType) => void; onRefreshMedia: (message: MessageType) => void;
  onMediaLoadSuccess: (
    message: MessageType,
    renderedUri: string,
    nativeCacheUri?: string | null,
  ) => void;
  onRetryMedia: (message: MessageType) => void;
  onOpenLocation: (message: MessageType) => void; onStopLiveShare: (messageId: string) => void;
  onOpenViewOnce: (message: MessageType) => void; onAcceptDatePlan: (planId: string) => void;
  onSuggestAnotherTime: (invite: MessageType['dateInvite']) => void;
  onSuggestAnotherPlace: (invite: MessageType['dateInvite']) => void;
  onSuggestBoth: (invite: MessageType['dateInvite']) => void;
  onRescheduleDatePlan: (invite: MessageType['dateInvite']) => void;
  onCancelDatePlan: (planId: string) => void; onRequestDatePlanConcierge: (planId: string) => void;
  onAddDatePlanToCalendar: (invite: MessageType['dateInvite']) => void;
  datePlanActionId: string | null; datePlanCalendarActionId: string | null;
  viewOnceViewedByMe: boolean; viewOnceViewedByPeer: boolean;
  highlightQuery?: string; onHighlightPress?: (messageId: string) => void;
};
