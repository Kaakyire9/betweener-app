import type { MessageType } from "@/components/chat/types";

const getMediaItemsRevision = (message: MessageType) =>
  (message.mediaItems ?? [])
    .map((item) =>
      [
        item.attachmentId,
        item.index,
        item.storagePath,
        item.mimeType ?? '',
        item.width ?? '',
        item.height ?? '',
        item.byteSize ?? '',
        item.localUri ?? '',
        item.signedUrl ?? '',
      ].join(':'),
    )
    .join(',');

/**
 * Captures every message field that can materially change a rendered row.
 *
 * Attachment lifecycle metadata is deliberately included. A realtime INSERT
 * can arrive before attachment finalization, so the later canonical row may
 * have the same id/text/status while adding the storage path needed to render
 * the media. Treating those rows as equal leaves the receiver on a permanent
 * "Preparing media" placeholder.
 */
export const getChatMessageRevisionKey = (message: MessageType) =>
  [
    message.id,
    message.clientMessageId ?? '',
    message.text,
    message.senderId,
    message.timestamp.getTime(),
    message.type,
    message.status ?? '',
    message.deletedForAll ? 'deleted' : 'active',
    message.deletedAt?.getTime() ?? 0,
    message.deletedBy ?? '',
    message.editedAt?.getTime() ?? 0,
    message.replyToId ?? '',
    message.isViewOnce ? 'view-once' : '',
    message.encryptedMedia ? 'encrypted' : '',
    message.encryptedMediaPath ?? '',
    message.encryptedKeySender ?? '',
    message.encryptedKeyReceiver ?? '',
    message.encryptedKeyNonce ?? '',
    message.encryptedMediaNonce ?? '',
    message.encryptedMediaAlg ?? '',
    message.encryptedMediaMime ?? '',
    message.encryptedMediaSize ?? '',
    message.storagePath ?? '',
    message.mediaExpectedCount ?? '',
    getMediaItemsRevision(message),
    message.imageUrl ?? '',
    message.videoUrl ?? '',
    message.offlineImageUri ?? '',
    message.offlineVideoUri ?? '',
    message.document
      ? [
          message.document.name,
          message.document.url,
          message.document.sizeLabel ?? '',
          message.document.typeLabel ?? '',
        ].join(':')
      : '',
    message.voiceMessage
      ? [
          message.voiceMessage.audioPath ?? '',
          message.voiceMessage.duration,
          message.voiceMessage.waveform.join(','),
        ].join(':')
      : '',
    message.location
      ? [
          message.location.lat,
          message.location.lng,
          message.location.label,
          message.location.address ?? '',
          message.location.live ? 'live' : '',
          message.location.expiresAt?.getTime() ?? '',
        ].join(':')
      : '',
    message.dateInvite
      ? [
          message.dateInvite.planId ?? '',
          message.dateInvite.status ?? '',
          message.dateInvite.scheduledFor.getTime(),
          message.dateInvite.placeName,
          message.dateInvite.conciergeRequested ? 'concierge' : '',
        ].join(':')
      : '',
    message.sticker
      ? [message.sticker.emoji, message.sticker.name, message.sticker.color].join(':')
      : '',
    message.reactions?.map((reaction) => `${reaction.userId}:${reaction.emoji}`).join(',') ?? '',
  ].join('\u001f');

export const preserveUnchangedMessageReferences = (
  currentMessages: MessageType[],
  nextMessages: MessageType[],
  getMessageKey: (message: MessageType) => string,
) => {
  if (nextMessages.length === 0) {
    return currentMessages.length === 0 ? currentMessages : nextMessages;
  }

  const currentById = new Map(
    currentMessages.map((message) => [message.id, message] as const),
  );
  let listChanged = currentMessages.length !== nextMessages.length;

  const reconciled = nextMessages.map((nextMessage, index) => {
    const currentMessage = currentById.get(nextMessage.id);
    const resolvedMessage =
      currentMessage && getMessageKey(currentMessage) === getMessageKey(nextMessage)
        ? currentMessage
        : nextMessage;

    if (!listChanged && currentMessages[index] !== resolvedMessage) {
      listChanged = true;
    }

    return resolvedMessage;
  });

  return listChanged ? reconciled : currentMessages;
};
