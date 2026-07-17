import type { FailedOfflineMutation, OfflineMutation } from '@/lib/offline/mutation-queue';

export type OfflineSyncScope =
  | 'moments'
  | 'circles'
  | 'chat'
  | 'intent'
  | 'profile'
  | 'discovery'
  | 'notifications'
  | 'other';

export type OfflineSyncDescriptor = {
  title: string;
  detail: string;
  icon: string;
  scope: OfflineSyncScope;
};

export const getOfflineSyncScopeLabel = (scope: OfflineSyncScope) => {
  switch (scope) {
    case 'moments':
      return 'Moments';
    case 'circles':
      return 'Circles';
    case 'chat':
      return 'Chat';
    case 'intent':
      return 'Intent';
    case 'profile':
      return 'Profile';
    case 'discovery':
      return 'Discovery';
    case 'notifications':
      return 'Notifications';
    default:
      return 'Offline';
  }
};

export const isFailedOfflineMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is FailedOfflineMutation => 'failedAt' in mutation;

export const describeOfflineSyncMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): OfflineSyncDescriptor => {
  switch (mutation.kind) {
    case 'swipe_sync':
      return {
        title: 'Discovery action not synced',
        detail: 'Your swipe decision is still local and has not reached the server yet.',
        icon: 'cards-heart-outline',
        scope: 'discovery',
      };
    case 'profile_image_reaction_sync':
      return {
        title: mutation.payload.emoji ? 'Photo reaction not synced' : 'Photo reaction removal not synced',
        detail: 'Your profile photo reaction is still local.',
        icon: 'image-heart-outline',
        scope: 'profile',
      };
    case 'chat_text_send':
      return {
        title: 'Message not sent',
        detail: 'Your message is still local and waiting to be delivered.',
        icon: 'message-text-outline',
        scope: 'chat',
      };
    case 'chat_reaction_sync':
      return {
        title: mutation.payload.emoji ? 'Message reaction not synced' : 'Message reaction removal not synced',
        detail: 'Your message reaction change is still local.',
        icon: 'message-reply-outline',
        scope: 'chat',
      };
    case 'chat_media_send':
      return {
        title:
          mutation.payload.mediaType === 'video'
            ? 'Video not sent'
            : mutation.payload.mediaType === 'document'
            ? 'Document not sent'
            : 'Photo not sent',
        detail: 'Your attachment is still local and has not been delivered yet.',
        icon:
          mutation.payload.mediaType === 'video'
            ? 'video-outline'
            : mutation.payload.mediaType === 'document'
            ? 'file-document-outline'
            : 'image-outline',
        scope: 'chat',
      };
    case 'chat_voice_send':
      return {
        title: 'Voice note not sent',
        detail: 'Your voice note is still local and has not been delivered yet.',
        icon: 'microphone-outline',
        scope: 'chat',
      };
    case 'intent_request_create':
      return {
        title: 'Intent request not sent',
        detail: 'Your intent action is still local and has not reached the other person yet.',
        icon: 'message-badge-outline',
        scope: 'intent',
      };
    case 'intent_request_decision':
      return {
        title: 'Intent decision not synced',
        detail: 'Your accept or pass decision is still local.',
        icon: 'gesture-tap-button',
        scope: 'intent',
      };
    case 'intent_request_cancel':
      return {
        title: 'Intent cancel not synced',
        detail: 'Your cancellation is still local and has not been applied yet.',
        icon: 'close-circle-outline',
        scope: 'intent',
      };
    case 'profile_update':
      return {
        title: 'Profile changes not synced',
        detail: 'Your latest profile edits are still local.',
        icon: 'account-edit-outline',
        scope: 'profile',
      };
    case 'profile_interests_update':
      return {
        title: 'Interest update not synced',
        detail: 'Your latest interests are still local.',
        icon: 'shape-outline',
        scope: 'profile',
      };
    case 'profile_media_sync':
      return {
        title: 'Profile media not synced',
        detail: 'Your avatar or gallery changes are still local.',
        icon: 'image-multiple-outline',
        scope: 'profile',
      };
    case 'notification_prefs_update':
      return {
        title: 'Notification settings not synced',
        detail: 'Your latest notification preference changes are still local.',
        icon: 'bell-cog-outline',
        scope: 'notifications',
      };
    case 'profile_gift_send':
      return {
        title: 'Gift not sent',
        detail: 'Your gift is saved locally and will send when the connection is stable again.',
        icon: 'gift-outline',
        scope: 'profile',
      };
    case 'profile_gift_reveal':
      return {
        title: 'Gift reveal not synced',
        detail: 'Your gift reveal is saved locally and still needs to finish syncing.',
        icon: 'gift-open-outline',
        scope: 'profile',
      };
    case 'profile_gift_archive':
      return {
        title: 'Gift archive not synced',
        detail: 'Your archive change is saved locally and still needs to finish syncing.',
        icon: 'archive-outline',
        scope: 'profile',
      };
    case 'profile_boost_create':
      return {
        title: mutation.payload.boostType === 'smart' ? 'Precision boost not launched' : 'Boost not launched',
        detail: 'Your boost recipe is saved locally and will launch when the connection is stable again.',
        icon: 'rocket-launch-outline',
        scope: 'profile',
      };
    case 'moment_text_create':
      return {
        title: 'Text Moment not posted',
        detail: 'Your text Moment is still local and needs to be sent again.',
        icon: 'format-text',
        scope: 'moments',
      };
    case 'moment_media_create':
      return {
        title: `${mutation.payload.type === 'video' ? 'Video' : 'Photo'} Moment not posted`,
        detail: 'This media Moment is still local and needs to be sent again.',
        icon: mutation.payload.type === 'video' ? 'video-outline' : 'image-outline',
        scope: 'moments',
      };
    case 'moment_delete':
      return {
        title: 'Moment delete did not finish',
        detail: 'This Moment is still visible because the delete did not sync yet.',
        icon: 'delete-outline',
        scope: 'moments',
      };
    case 'moment_reaction_sync':
      return {
        title: mutation.payload.emoji ? 'Moment reaction not synced' : 'Moment reaction removal not synced',
        detail: mutation.payload.emoji
          ? `Your ${mutation.payload.emoji} reaction is still local.`
          : 'Your reaction removal is still local.',
        icon: 'heart-outline',
        scope: 'moments',
      };
    case 'moment_comment_create':
      return {
        title: 'Moment comment not posted',
        detail: 'Your comment is still local and has not been posted yet.',
        icon: 'comment-outline',
        scope: 'moments',
      };
    case 'moment_comment_update':
      return {
        title: 'Moment comment edit not synced',
        detail: 'Your latest edit is still local and has not replaced the live comment yet.',
        icon: 'comment-edit-outline',
        scope: 'moments',
      };
    case 'moment_comment_delete':
      return {
        title: 'Moment comment delete not synced',
        detail: 'The comment is hidden locally, but the delete has not finished syncing yet.',
        icon: 'comment-remove-outline',
        scope: 'moments',
      };
    case 'moment_comment_reaction_sync':
      return {
        title: mutation.payload.reaction
          ? 'Moment comment reaction not synced'
          : 'Moment comment reaction removal not synced',
        detail: 'Your comment reaction change is still local.',
        icon: 'heart-outline',
        scope: 'moments',
      };
    case 'circle_pulse_comment_create':
      return {
        title: 'Circle comment not posted',
        detail: 'Your discussion reply is still local and has not been posted yet.',
        icon: 'comment-outline',
        scope: 'circles',
      };
    case 'circle_pulse_comment_update':
      return {
        title: 'Circle comment edit not synced',
        detail: 'Your latest discussion edit is still local.',
        icon: 'comment-edit-outline',
        scope: 'circles',
      };
    case 'circle_pulse_comment_delete':
      return {
        title: 'Circle comment delete not synced',
        detail: 'The discussion reply is hidden locally, but the delete has not finished syncing yet.',
        icon: 'comment-remove-outline',
        scope: 'circles',
      };
    case 'circle_pulse_comment_reaction_sync':
      return {
        title: mutation.payload.reaction
          ? 'Circle reaction not synced'
          : 'Circle reaction removal not synced',
        detail: 'Your discussion reaction change is still local.',
        icon: 'heart-outline',
        scope: 'circles',
      };
    case 'circle_pulse_comment_pin_sync':
      return {
        title: mutation.payload.pinned ? 'Pinned note not synced' : 'Pinned note update not synced',
        detail: mutation.payload.pinned
          ? 'Your pinned note change is still local.'
          : 'Your unpin action is still local.',
        icon: 'pin-outline',
        scope: 'circles',
      };
    case 'circle_pulse_comment_report_sync':
      return {
        title: 'Comment report not synced',
        detail: 'Your moderation report is still local.',
        icon: 'alert-octagon-outline',
        scope: 'circles',
      };
    default:
      return {
        title: 'Offline change not synced',
        detail: 'A local change still needs to be reviewed or retried.',
        icon: 'cloud-alert-outline',
        scope: 'other',
      };
  }
};
