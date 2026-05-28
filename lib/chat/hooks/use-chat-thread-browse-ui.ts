import { useCallback, useMemo, useState } from "react";

import type { MessageType } from "@/components/chat/types";

type MediaHubItem = {
  id: string;
  type: "image" | "video";
  url?: string | null;
  timestamp: Date;
};

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
};

type UseChatThreadBrowseUiArgs = {
  chatSearchQuery: string;
  renderedMessages: MessageType[];
  pinnedMessageCount: number;
  primaryPinnedMessage: MessageType | null;
  jumpToMessage: (messageId: string) => void;
};

export const useChatThreadBrowseUi = ({
  chatSearchQuery,
  renderedMessages,
  pinnedMessageCount,
  primaryPinnedMessage,
  jumpToMessage,
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
    return renderedMessages.filter((msg) => {
      if (msg.deletedForAll) return false;
      if (msg.type !== "text") return false;
      return (msg.text || "").toLowerCase().includes(query);
    });
  }, [renderedMessages, trimmedChatSearchQuery]);

  const matchMessageIds = useMemo(() => searchResults.map((result) => result.id), [searchResults]);
  const matchMessageIdSet = useMemo(() => new Set(matchMessageIds), [matchMessageIds]);

  const mediaItems = useMemo<MediaHubItem[]>(() => {
    return renderedMessages
      .filter((msg) => !msg.deletedForAll && (msg.type === "image" || msg.type === "video"))
      .map((msg) => ({
        id: msg.id,
        type: msg.type as "image" | "video",
        url: msg.type === "image" ? (msg.offlineImageUri ?? msg.imageUrl) : (msg.offlineVideoUri ?? msg.videoUrl),
        timestamp: msg.timestamp,
      }))
      .filter((item) => Boolean(item.url));
  }, [renderedMessages]);

  const linkItems = useMemo<LinkHubItem[]>(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const items: LinkHubItem[] = [];
    renderedMessages.forEach((msg) => {
      if (msg.deletedForAll || msg.type !== "text" || !msg.text) return;
      const matches = msg.text.match(urlRegex);
      if (!matches) return;
      matches.forEach((url) => {
        items.push({
          id: msg.id,
          url,
          timestamp: msg.timestamp,
          snippet: msg.text || "",
        });
      });
    });
    return items;
  }, [renderedMessages]);

  const docItems = useMemo<DocHubItem[]>(() => {
    return renderedMessages
      .filter((msg) => !msg.deletedForAll && msg.type === "document" && msg.document?.url)
      .map((msg) => ({
        id: msg.id,
        name: msg.document?.name || "Document",
        url: msg.document?.url || "",
        typeLabel: msg.document?.typeLabel || null,
        sizeLabel: msg.document?.sizeLabel || null,
        timestamp: msg.timestamp,
      }))
      .filter((item) => Boolean(item.url));
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
