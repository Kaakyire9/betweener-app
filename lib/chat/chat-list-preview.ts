type ReactionPreview = {
  text: string;
  createdAt: Date;
};

type ResolveChatListPreviewArgs = {
  messagePreview: string;
  editedAt?: Date | null;
  reactionPreview?: ReactionPreview | null;
  isTyping: boolean;
};

export const resolveChatListPreview = ({
  messagePreview,
  editedAt,
  reactionPreview,
  isTyping,
}: ResolveChatListPreviewArgs) => {
  const editedPreview = editedAt ? `Edited: ${messagePreview}` : messagePreview;
  const reactionIsNewest =
    Boolean(reactionPreview?.text) &&
    (!editedAt || (reactionPreview?.createdAt.getTime() ?? 0) > editedAt.getTime());
  const visibleReactionPreview = reactionIsNewest ? reactionPreview?.text ?? null : null;

  return {
    previewText: isTyping ? 'Typing...' : visibleReactionPreview ?? editedPreview,
    visibleReactionPreview,
  };
};
