type ReactionPreview = {
  text: string;
  createdAt: Date;
};

type ConversationActivity = {
  kind: 'edit' | 'reaction';
  messageId: string;
  preview: string;
  createdAt: Date;
};

type ResolveChatListPreviewArgs = {
  messagePreview: string;
  editedAt?: Date | null;
  reactionPreview?: ReactionPreview | null;
  isTyping: boolean;
};

export const formatConversationPreview = ({
  messagePreview,
  latestActivity,
  reactionEmoji,
  reactionUserId,
  currentUserId,
}: {
  messagePreview?: string | null;
  latestActivity?: ConversationActivity | null;
  reactionEmoji?: string | null;
  reactionUserId?: string | null;
  currentUserId?: string | null;
}) => {
  const fallbackPreview = messagePreview?.trim() || 'Start the conversation';
  if (latestActivity?.kind !== 'reaction') {
    return fallbackPreview;
  }

  const emoji = reactionEmoji?.trim();
  const reactedByCurrentUser =
    Boolean(currentUserId) && reactionUserId === currentUserId;
  const storedPreview = latestActivity.preview?.trim();

  if (
    storedPreview &&
    ((storedPreview.startsWith('You reacted') &&
      storedPreview.includes('to their message')) ||
      (storedPreview.startsWith('Reacted') &&
        storedPreview.includes('to your message')))
  ) {
    return storedPreview;
  }

  if (reactedByCurrentUser) {
    return emoji
      ? `You reacted ${emoji} to their message`
      : 'You reacted to their message';
  }

  return emoji
    ? `Reacted ${emoji} to your message`
    : 'Reacted to your message';
};

export const resolveChatListPreview = ({
  messagePreview,
  editedAt,
  reactionPreview,
  isTyping,
}: ResolveChatListPreviewArgs) => {
  const editedPreview = editedAt ? `Edited: ${messagePreview}` : messagePreview;

  return {
    previewText: isTyping ? 'Typing...' : editedPreview,
    visibleReactionPreview: reactionPreview?.text ?? null,
  };
};
