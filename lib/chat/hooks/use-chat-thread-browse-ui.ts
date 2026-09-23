import { useCallback, useMemo, useState } from "react";

import type { MessageType } from "@/components/chat/types";
import { extractChatLinks } from '@/lib/chat/links/chat-link-policy';
import { getMessageMediaItems } from '@/lib/chat/media-album';

export type MediaHubItem = {
  id: string;
  type: "image" | "video";
  url?: string | null;
  thumbnailUrl?: string | null;
  albumIndex: number;
  timestamp: Date;
  message: MessageType;
};

export const buildChatMediaHubItems = (
  messages: readonly MessageType[],
  mediaUrisByPath: Readonly<Record<string, string>> = {},
): MediaHubItem[] => messages
  .filter((msg) => (
    !msg.deletedForAll &&
    !msg.isViewOnce &&
    (msg.type === "image" || msg.type === "video")
  ))
  .flatMap((msg) => getMessageMediaItems(msg).map((mediaItem, albumIndex) => {
    const storageUri = mediaItem.storagePath
      ? mediaUrisByPath[mediaItem.storagePath]
      : null;
    const previewUri = mediaItem.previewStoragePath
      ? mediaUrisByPath[mediaItem.previewStoragePath]
      : null;
    const legacyUri = mediaItem.type === 'image'
      ? (msg.offlineImageUri ?? msg.imageUrl)
      : (msg.offlineVideoUri ?? msg.videoUrl);
    const url = mediaItem.localUri ?? storageUri ?? mediaItem.signedUrl ?? legacyUri;
    const thumbnailUrl = mediaItem.localPreviewUri
      ?? previewUri
      ?? mediaItem.previewSignedUrl
      ?? (mediaItem.type === 'image' ? url : msg.previewUrl)
      ?? null;
    return {
      id: `${msg.id}:${mediaItem.attachmentId}:${albumIndex}`,
      type: mediaItem.type,
      url,
      thumbnailUrl,
      albumIndex,
      timestamp: msg.timestamp,
      message: msg,
    };
  }))
  .filter((item) => Boolean(
    item.url ||
    item.thumbnailUrl ||
    getMessageMediaItems(item.message)[item.albumIndex]?.storagePath,
  ))
  .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());

type LinkHubItem = {
  id: string;
  url: string;
  timestamp: Date;
  snippet: string;
};

type DocHubItem = {
  id: string;
  name: string;
  url: string;
  typeLabel: string | null;
  sizeLabel: string | null;
  timestamp: Date;
  message: MessageType;
};

type UseChatThreadBrowseUiArgs = {
  chatSearchQuery: string;
  renderedMessages: MessageType[];
  remoteSearchResults?: MessageType[];
  pinnedMessageCount: number;
  primaryPinnedMessage: MessageType | null;
  jumpToMessage: (messageId: string) => void;
  mediaUrisByPath?: Readonly<Record<string, string>>;
};

export const useChatThreadBrowseUi = ({
  chatSearchQuery,
  renderedMessages,
  remoteSearchResults = [],
  pinnedMessageCount,
  primaryPinnedMessage,
  jumpToMessage,
  mediaUrisByPath = {},
}: UseChatThreadBrowseUiArgs) => {
  const [pinnedSheetVisible, setPinnedSheetVisible] = useState(false);
  const [pinnedBannerExpanded, setPinnedBannerExpanded] = useState(false);

  const openPinnedSheet = useCallback(() => {
    if (pinnedMessageCount === 0) return;
    setPinnedSheetVisible(true);
  }, [pinnedMessageCount]);

  const closePinnedSheet = useCallback(() => {
    setPinnedSheetVisible(false);
  }, []);

  const trimmedChatSearchQuery = chatSearchQuery.trim();

  const searchResults = useMemo(() => {
    const query = trimmedChatSearchQuery.toLowerCase();
    if (!query) return [];
    const merged = new Map<string, MessageType>();
    [...remoteSearchResults, ...renderedMessages].forEach((message) => merged.set(message.id, message));
    return Array.from(merged.values()).filter((msg) => {
      if (msg.deletedForAll) return false;
      if (msg.type !== "text") return false;
      return (msg.text || "").toLowerCase().includes(query);
    });
  }, [remoteSearchResults, renderedMessages, trimmedChatSearchQuery]);

  const matchMessageIds = useMemo(() => searchResults.map((result) => result.id), [searchResults]);
  const matchMessageIdSet = useMemo(() => new Set(matchMessageIds), [matchMessageIds]);

  const mediaItems = useMemo<MediaHubItem[]>(() => {
    return buildChatMediaHubItems(renderedMessages, mediaUrisByPath);
  }, [mediaUrisByPath, renderedMessages]);

  const linkItems = useMemo<LinkHubItem[]>(() => {
    const items: LinkHubItem[] = [];
    renderedMessages.forEach((msg) => {
      if (msg.deletedForAll || msg.type !== "text" || !msg.text) return;
      extractChatLinks(msg.text).forEach((link) => {
        items.push({
          id: msg.id,
          url: link.normalizedUrl,
          timestamp: msg.timestamp,
          snippet: msg.text || "",
        });
      });
    });
    return items.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
  }, [renderedMessages]);

  const docItems = useMemo<DocHubItem[]>(() => {
    return renderedMessages
      .filter((msg) => !msg.deletedForAll && msg.type === "document" && (msg.document?.url || msg.storagePath))
      .map((msg) => ({
        id: msg.id,
        name: msg.document?.name || "Document",
        url: msg.document?.url || "",
        typeLabel: msg.document?.typeLabel || null,
        sizeLabel: msg.document?.sizeLabel || null,
        timestamp: msg.timestamp,
        message: msg,
      }))
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
  }, [renderedMessages]);

  const jumpToNextMatch = useCallback(
    (messageId: string) => {
      if (matchMessageIds.length === 0) return;
      const index = matchMessageIds.indexOf(messageId);
      const nextId = matchMessageIds[(index + 1) % matchMessageIds.length] || matchMessageIds[0];
      jumpToMessage(nextId);
    },
    [jumpToMessage, matchMessageIds],
  );

  const togglePinnedBanner = useCallback(() => {
    if (pinnedMessageCount === 0) return;
    setPinnedBannerExpanded((prev) => !prev);
  }, [pinnedMessageCount]);

  const handlePinnedJump = useCallback(() => {
    if (!primaryPinnedMessage) return;
    jumpToMessage(primaryPinnedMessage.id);
    setPinnedBannerExpanded(false);
  }, [jumpToMessage, primaryPinnedMessage]);

  const handlePinnedSeeAll = useCallback(() => {
    openPinnedSheet();
    setPinnedBannerExpanded(false);
  }, [openPinnedSheet]);

  return {
    pinnedSheetVisible,
    pinnedBannerExpanded,
    setPinnedBannerExpanded,
    openPinnedSheet,
    closePinnedSheet,
    trimmedChatSearchQuery,
    searchResults,
    matchMessageIds,
    matchMessageIdSet,
    mediaItems,
    linkItems,
    docItems,
    jumpToNextMatch,
    togglePinnedBanner,
    handlePinnedJump,
    handlePinnedSeeAll,
  };
};
