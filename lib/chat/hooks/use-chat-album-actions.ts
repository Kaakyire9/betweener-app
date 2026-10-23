import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { Alert } from 'react-native';

import type { MessageType } from '@/components/chat/types';
import { transitionMessageLifecycleRecord } from '@/lib/chat/message-state';
import { ChatOutboxService } from '@/lib/chat/outbox/chat-outbox-service';

type UseChatAlbumActionsParams = {
  networkReady: boolean;
  setMessages: Dispatch<SetStateAction<MessageType[]>>;
  userId?: string | null;
};

export function useChatAlbumActions({
  networkReady,
  setMessages,
  userId,
}: UseChatAlbumActionsParams) {
  return useCallback((message: MessageType, albumIndex: number) => {
    if (!userId || message.senderId !== userId) return;
    if (!['queued', 'sending', 'failed'].includes(message.status ?? '')) return;

    const mediaItem = message.mediaItems?.find((entry) => entry.index === albumIndex);
    if (!mediaItem) return;

    const localMessageId = message.clientMessageId ?? message.id;
    const isActiveUpload = message.status === 'queued' || message.status === 'sending';
    const failedAttachmentIds = new Set((message.mediaItems ?? [])
      .filter((entry) => entry.transferState === 'retryable_failed' || entry.transferState === 'terminal_failed')
      .map((entry) => entry.attachmentId));
    const remainingSuccessfulCount = (message.mediaItems?.length ?? 0) - failedAttachmentIds.size;

    const restoreRemovedItem = () => {
      setMessages((current) => current.map((entry) => entry.id === message.id
        ? {
            ...entry,
            mediaItems: entry.mediaItems?.map((candidate) =>
              candidate.attachmentId === mediaItem.attachmentId
                ? {
                    ...candidate,
                    transferState: mediaItem.transferState,
                    transferError: mediaItem.transferError,
                  }
                : candidate),
          }
        : entry));
    };

    const restoreRetryItem = () => {
      setMessages((current) => current.map((entry) => entry.id === message.id
        ? {
            ...entry,
            status: 'failed',
            mediaItems: entry.mediaItems?.map((candidate) =>
              candidate.attachmentId === mediaItem.attachmentId
                ? {
                    ...candidate,
                    transferState: mediaItem.transferState,
                    transferError: mediaItem.transferError,
                  }
                : candidate),
          }
        : entry));
    };

    const removeItem = () => {
      setMessages((current) => current.map((entry) => entry.id === message.id
        ? {
            ...entry,
            mediaItems: entry.mediaItems?.map((candidate) => candidate.attachmentId === mediaItem.attachmentId
              ? { ...candidate, transferState: 'cancelling', transferError: null }
              : candidate),
          }
        : entry));

      void ChatOutboxService.removeAlbumItem(userId, localMessageId, mediaItem.attachmentId)
        .then((result) => {
          if (!result.changed) {
            restoreRemovedItem();
            Alert.alert(
              'Album unchanged',
              'This item could not be removed. The album may already be finalised or the cancellation could not be confirmed.',
            );
            return;
          }

          setMessages((current) => current.map((entry) => entry.id === message.id
            ? {
                ...entry,
                status: 'queued',
                mediaExpectedCount: result.remainingCount,
                mediaItems: entry.mediaItems
                  ?.filter((candidate) => candidate.attachmentId !== mediaItem.attachmentId)
                  .map((candidate, index) => ({ ...candidate, index })),
              }
            : entry));
        })
        .catch(() => {
          restoreRemovedItem();
          Alert.alert(
            'Unable to update album',
            'The item is still part of the album. Check your connection and try again.',
          );
        });
    };

    const cancelAlbum = () => {
      void ChatOutboxService.cancelMessage(userId, localMessageId)
        .then((cancelled) => {
          if (!cancelled) {
            Alert.alert(
              'Unable to cancel album',
              'The cancellation could not be confirmed. Check your connection and try again.',
            );
            return;
          }
          setMessages((current) => current.filter((entry) => entry.id !== message.id));
        })
        .catch(() => {
          Alert.alert('Unable to cancel album', 'Check your connection and try again.');
        });
    };

    const confirmSendRemaining = () => {
      Alert.alert(
        'Send successful items?',
        `This will remove ${failedAttachmentIds.size} failed ${failedAttachmentIds.size === 1 ? 'item' : 'items'} and send the remaining ${remainingSuccessfulCount}.`,
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Send remaining',
            onPress: () => {
              void ChatOutboxService.sendRemainingAlbumItems(userId, localMessageId)
                .then((requeued) => {
                  if (!requeued) {
                    Alert.alert('Album unchanged', 'The remaining composition could not be confirmed. Please try again.');
                    return;
                  }
                  setMessages((current) => current.map((entry) => entry.id === message.id
                    ? {
                        ...entry,
                        status: 'queued',
                        mediaExpectedCount: remainingSuccessfulCount,
                        mediaItems: entry.mediaItems
                          ?.filter((candidate) => !failedAttachmentIds.has(candidate.attachmentId))
                          .map((candidate, index) => ({ ...candidate, index })),
                      }
                    : entry));
                })
                .catch(() => {
                  Alert.alert('Album unchanged', 'The remaining composition could not be confirmed. Please try again.');
                });
            },
          },
        ],
      );
    };

    Alert.alert(
      isActiveUpload ? 'Manage album upload' : 'Album item',
      `${isActiveUpload ? 'Uploading' : 'Item'} ${albumIndex + 1} of ${message.mediaItems?.length ?? 1}.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: isActiveUpload ? 'Cancel this item' : 'Remove item',
          style: 'destructive',
          onPress: removeItem,
        },
        ...(isActiveUpload ? [{
          text: 'Cancel whole album',
          style: 'destructive' as const,
          onPress: cancelAlbum,
        }] : [{
          text: 'Retry this item',
          onPress: () => {
            setMessages((current) => current.map((entry) => entry.id === message.id
              ? {
                  ...transitionMessageLifecycleRecord({
                    message: entry,
                    event: networkReady ? 'send_started' : 'retry_requested',
                  }),
                  mediaItems: entry.mediaItems?.map((candidate) => candidate.attachmentId === mediaItem.attachmentId
                    ? { ...candidate, transferState: 'queued', transferError: null }
                    : candidate),
                }
              : entry));
            void ChatOutboxService.retryAlbumItem(userId, localMessageId, mediaItem.attachmentId)
              .then((requeued) => {
                if (!requeued) {
                  restoreRetryItem();
                  Alert.alert('Retry unavailable', 'This item can no longer be retried from this device.');
                }
              })
              .catch(() => {
                restoreRetryItem();
                Alert.alert('Retry unavailable', 'This item could not be retried. Check your connection and try again.');
              });
          },
        }, ...(remainingSuccessfulCount > 0 && failedAttachmentIds.size > 0 ? [{
          text: 'Send successful items',
          onPress: confirmSendRemaining,
        }] : []), {
          text: 'Cancel whole album',
          style: 'destructive' as const,
          onPress: cancelAlbum,
        }]),
      ],
    );
  }, [networkReady, setMessages, userId]);
}
