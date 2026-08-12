import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { MessageType } from "@/components/chat/types";
import { subscribeChatOptionsPrefsPreview } from "@/lib/chat-options-bus";
import { ChatRepository } from "@/lib/chat/local/chat-db";
import { ChatThreadRemoteService } from "@/lib/chat/chat-thread-remote-service";
import {
  buildViewOnceStatusFromReceipts,
  mergeViewOnceStatusMaps,
  type ViewOnceStatusMap,
} from "@/lib/chat/view-once-status";
import { supabase } from "@/lib/supabase";

type ReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
};

type UseChatThreadStateSyncArgs = {
  userId?: string | null;
  routeId: string;
  conversationId?: string | null;
  chatPrefsPeerUserId?: string | null;
  activePeerMessageUserId?: string | null;
  peerResolved: boolean;
  chatPrefsStorageKey: string;
  blockedByMeValue: string;
  blockedByThemValue: string;
  hiddenMessageIds: string[];
  hiddenMessageIdsRef: MutableRefObject<Set<string>>;
  updateHiddenMessageIds: (ids: string[]) => void;
  setMessages: Dispatch<SetStateAction<MessageType[]>>;
  setViewOnceStatus: Dispatch<
    SetStateAction<Record<string, { viewedByMe: boolean; viewedByPeer: boolean }>>
  >;
  viewOnceStatusRef: MutableRefObject<
    Record<string, { viewedByMe: boolean; viewedByPeer: boolean }>
  >;
};

const areReactionListsEqual = (
  left: MessageType["reactions"] | undefined,
  right: MessageType["reactions"] | undefined,
) => {
  const leftItems = left ?? [];
  const rightItems = right ?? [];
  if (leftItems.length !== rightItems.length) return false;
  for (let index = 0; index < leftItems.length; index += 1) {
    const leftItem = leftItems[index];
    const rightItem = rightItems[index];
    if (!rightItem) return false;
    if (leftItem.userId !== rightItem.userId || leftItem.emoji !== rightItem.emoji) {
      return false;
    }
  }
  return true;
};

export const useChatThreadStateSync = ({
  userId,
  routeId,
  conversationId,
  chatPrefsPeerUserId,
  activePeerMessageUserId,
  peerResolved,
  chatPrefsStorageKey,
  blockedByMeValue,
  blockedByThemValue,
  hiddenMessageIds,
  hiddenMessageIdsRef,
  updateHiddenMessageIds,
  setMessages,
  setViewOnceStatus,
  viewOnceStatusRef,
}: UseChatThreadStateSyncArgs) => {
  const [isChatMuted, setIsChatMuted] = useState(false);
  const [isChatPinned, setIsChatPinned] = useState(false);
  const [chatPrefsLoaded, setChatPrefsLoaded] = useState(false);
  const [blockStatus, setBlockStatus] = useState<string | null>(null);
  const chatPrefsHydratedRef = useRef(false);
  const chatPrefsStateRef = useRef({ muted: false, pinned: false });
  const pendingChatPrefsOverrideRef = useRef<{ muted: boolean; pinned: boolean } | null>(null);
  const chatPrefsSignatureRef = useRef("");

  const applyViewOnceStatuses = useCallback((incoming: ViewOnceStatusMap) => {
    viewOnceStatusRef.current = mergeViewOnceStatusMaps(viewOnceStatusRef.current, incoming);
    setViewOnceStatus((prev) => mergeViewOnceStatusMaps(prev, incoming));
  }, [setViewOnceStatus, viewOnceStatusRef]);

  const persistChatPrefsLocalSnapshot = useCallback(
    async (nextMuted: boolean, nextPinned: boolean) => {
      if (!conversationId && !routeId) return;
      try {
        const raw = await AsyncStorage.getItem(chatPrefsStorageKey);
        const parsed = raw ? JSON.parse(raw) : {};
        const nextSnapshot = { muted: nextMuted, pinned: nextPinned };
        if (conversationId) {
          parsed[conversationId] = nextSnapshot;
        }
        if (routeId && routeId !== conversationId) {
          parsed[routeId] = nextSnapshot;
        }
        await AsyncStorage.setItem(chatPrefsStorageKey, JSON.stringify(parsed));
      } catch {
        // Ignore local persistence failures here.
      }
    },
    [chatPrefsStorageKey, conversationId, routeId],
  );

  const refreshLocalChatPrefs = useCallback(async () => {
    if (!conversationId && !routeId) return;
    try {
      const raw = await AsyncStorage.getItem(chatPrefsStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const prefs = (conversationId && parsed?.[conversationId]) || (routeId && parsed?.[routeId]) || {};
      const nextMuted =
        typeof prefs.muted === "boolean" ? Boolean(prefs.muted) : chatPrefsStateRef.current.muted;
      const nextPinned =
        typeof prefs.pinned === "boolean" ? Boolean(prefs.pinned) : chatPrefsStateRef.current.pinned;
      chatPrefsStateRef.current = {
        muted: nextMuted,
        pinned: nextPinned,
      };
      setIsChatMuted((prev) => (prev === nextMuted ? prev : nextMuted));
      setIsChatPinned((prev) => (prev === nextPinned ? prev : nextPinned));
    } catch {
      // Ignore storage read failures here.
    }
  }, [chatPrefsStorageKey, conversationId, routeId]);

  const applyChatPrefsState = useCallback(
    (nextPrefs: { muted: boolean; pinned: boolean }) => {
      pendingChatPrefsOverrideRef.current = nextPrefs;
      chatPrefsStateRef.current = nextPrefs;
      setIsChatMuted((prev) => (prev === nextPrefs.muted ? prev : nextPrefs.muted));
      setIsChatPinned((prev) => (prev === nextPrefs.pinned ? prev : nextPrefs.pinned));
      void persistChatPrefsLocalSnapshot(nextPrefs.muted, nextPrefs.pinned);
    },
    [persistChatPrefsLocalSnapshot],
  );

  const fetchHiddenMessages = useCallback(async () => {
    if (!userId || !activePeerMessageUserId) return;
    const { data, error } = await ChatThreadRemoteService.fetchHiddenMessages({
      currentUserId: userId,
      peerUserId: activePeerMessageUserId,
    });
    if (error) {
      console.log("[chat] fetch hidden messages error", error);
      return;
    }
    const ids = (data || []).map((row: { message_id: string }) => row.message_id);
    updateHiddenMessageIds(ids);
    void ChatRepository.deleteMessages(userId, activePeerMessageUserId, ids).catch((deleteError) =>
      console.log("[chat] delete hidden local messages error", deleteError),
    );
  }, [activePeerMessageUserId, updateHiddenMessageIds, userId]);

  const syncMessageReactions = useCallback(async (messageIds: string[]) => {
    if (!userId || messageIds.length === 0) return;
    const uniqueIds = Array.from(new Set(messageIds)).filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
    );
    if (uniqueIds.length === 0) return;
    const { data, error } = await ChatThreadRemoteService.fetchMessageReactions({ messageIds: uniqueIds });
    if (error) {
      console.log("[chat] fetch reactions error", error);
      return;
    }
    const grouped = new Map<string, MessageType["reactions"]>();
    (data || []).forEach((row: ReactionRow) => {
      if (!row.message_id || !row.user_id || !row.emoji) return;
      const existing = grouped.get(row.message_id) ?? [];
      const index = existing.findIndex((reaction) => reaction.userId === row.user_id);
      const nextReaction = { userId: row.user_id, emoji: row.emoji };
      if (index >= 0) {
        existing[index] = nextReaction;
        grouped.set(row.message_id, [...existing]);
      } else {
        grouped.set(row.message_id, [...existing, nextReaction]);
      }
    });
    const idSet = new Set(uniqueIds);
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((msg) => {
        if (!idSet.has(msg.id)) return msg;
        const nextReactions = grouped.get(msg.id) ?? [];
        if (areReactionListsEqual(msg.reactions, nextReactions)) return msg;
        changed = true;
        return { ...msg, reactions: nextReactions };
      });
      return changed ? next : prev;
    });
  }, [setMessages, userId]);

  const hydrateLocalViewOnceStatus = useCallback(async (messageIds: string[]) => {
    if (!userId || messageIds.length === 0) return;
    const uniqueIds = Array.from(new Set(messageIds)).filter(Boolean);
    if (uniqueIds.length === 0) return;
    try {
      const localRows = await ChatRepository.getViewOnceStatuses(userId, uniqueIds, {
        priority: 'user-blocking',
      });
      const localStatuses: ViewOnceStatusMap = Object.fromEntries(
        localRows.map((row) => [
          row.message_id,
          {
            viewedByMe: row.viewed_by_me === 1,
            viewedByPeer: row.viewed_by_peer === 1,
          },
        ]),
      );
      applyViewOnceStatuses(localStatuses);
    } catch (error) {
      console.log("[chat] fetch local view-once status error", error);
    }
  }, [applyViewOnceStatuses, userId]);

  const syncViewOnceStatus = useCallback(async (messageIds: string[]) => {
    if (!userId || !conversationId || messageIds.length === 0) return;
    const uniqueIds = Array.from(new Set(messageIds)).filter(Boolean);
    if (uniqueIds.length === 0) return;

    await hydrateLocalViewOnceStatus(uniqueIds);

    const { data, error } = await ChatThreadRemoteService.fetchViewOnceStatus({ messageIds: uniqueIds });
    if (error) {
      console.log("[chat] fetch view-once status error", error);
      return;
    }
    const remoteStatuses = buildViewOnceStatusFromReceipts({
      receipts: data ?? [],
      currentUserId: userId,
      peerUserId: conversationId,
    });
    applyViewOnceStatuses(remoteStatuses);
    const durableStatuses = Object.entries(remoteStatuses).map(([messageId, status]) => ({
      messageId,
      ...status,
    }));
    if (durableStatuses.length > 0) {
      void ChatRepository.upsertViewOnceStatuses(userId, conversationId, durableStatuses, {
        priority: 'background',
      }).catch((localError) => {
        console.log("[chat] persist view-once status error", localError);
      });
    }
  }, [applyViewOnceStatuses, conversationId, hydrateLocalViewOnceStatus, userId]);

  const applyReactionUpdate = useCallback((row: ReactionRow, mode: "upsert" | "delete") => {
    if (!row?.message_id || !row.user_id) return;
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== row.message_id) return msg;
        const reactions = msg.reactions ?? [];
        if (mode === "delete") {
          return {
            ...msg,
            reactions: reactions.filter((reaction) => reaction.userId !== row.user_id),
          };
        }
        const index = reactions.findIndex((reaction) => reaction.userId === row.user_id);
        if (index >= 0) {
          const next = [...reactions];
          next[index] = { userId: row.user_id, emoji: row.emoji };
          return { ...msg, reactions: next };
        }
        return { ...msg, reactions: [...reactions, { userId: row.user_id, emoji: row.emoji }] };
      }),
    );
  }, [setMessages]);

  const fetchBlockStatus = useCallback(async () => {
    if (!userId || !conversationId) return;
    const { data, error } = await ChatThreadRemoteService.fetchBlockStatus({
      currentUserId: userId,
      peerUserId: conversationId,
    });
    if (error) {
      console.log("[chat] fetch block status error", error);
      setBlockStatus(null);
      return;
    }
    const rows = (data || []) as { blocker_id: string; blocked_id: string }[];
    if (rows.length === 0) {
      setBlockStatus(null);
      return;
    }
    const blockedByMe = rows.some((row) => row.blocker_id === userId);
    const blockedByThem = rows.some((row) => row.blocker_id === conversationId);
    setBlockStatus(blockedByMe ? blockedByMeValue : blockedByThem ? blockedByThemValue : null);
  }, [blockedByMeValue, blockedByThemValue, conversationId, userId]);

  useEffect(() => {
    let isMounted = true;
    if (!conversationId) return;
    setChatPrefsLoaded(false);
    chatPrefsHydratedRef.current = false;
    chatPrefsSignatureRef.current = "";
    const loadPrefs = async () => {
      let localMuted = false;
      let localPinned = false;
      let hasLocalPrefs = false;
      try {
        const raw = await AsyncStorage.getItem(chatPrefsStorageKey);
        const parsed = raw ? JSON.parse(raw) : {};
        const hasConversationPrefs = conversationId
          ? Object.prototype.hasOwnProperty.call(parsed ?? {}, conversationId)
          : false;
        const hasRoutePrefs = routeId ? Object.prototype.hasOwnProperty.call(parsed ?? {}, routeId) : false;
        hasLocalPrefs = hasConversationPrefs || hasRoutePrefs;
        const prefs = (conversationId && parsed?.[conversationId]) || (routeId && parsed?.[routeId]) || {};
        localMuted = Boolean(prefs.muted);
        localPinned = Boolean(prefs.pinned);
      } catch {
        localMuted = false;
        localPinned = false;
      }

      let nextMuted = localMuted;
      let nextPinned = localPinned;

      if (userId && chatPrefsPeerUserId) {
        const { data, error } = await ChatThreadRemoteService.fetchChatPrefs({
          currentUserId: userId,
          peerUserId: chatPrefsPeerUserId,
        });
        if (!isMounted) return;
        if (hasLocalPrefs) {
          nextMuted = localMuted;
          nextPinned = localPinned;
          setIsChatMuted((prev) => (prev === nextMuted ? prev : nextMuted));
          setIsChatPinned((prev) => (prev === nextPinned ? prev : nextPinned));
          if (error || !data || Boolean(data.muted) !== nextMuted || Boolean(data.pinned) !== nextPinned) {
            const { error: syncError } = await ChatThreadRemoteService.upsertChatPrefs({
              currentUserId: userId,
              peerUserId: chatPrefsPeerUserId,
              muted: nextMuted,
              pinned: nextPinned,
              updatedAtIso: new Date().toISOString(),
            });
            if (syncError) {
              console.log("[chat] chat prefs local-first sync error", syncError);
            }
          }
        } else if (!error && data) {
          nextMuted = Boolean(data.muted);
          nextPinned = Boolean(data.pinned);
          setIsChatMuted((prev) => (prev === nextMuted ? prev : nextMuted));
          setIsChatPinned((prev) => (prev === nextPinned ? prev : nextPinned));
          await persistChatPrefsLocalSnapshot(nextMuted, nextPinned);
        } else {
          setIsChatMuted((prev) => (prev === localMuted ? prev : localMuted));
          setIsChatPinned((prev) => (prev === localPinned ? prev : localPinned));
        }
      } else {
        if (!isMounted) return;
        setIsChatMuted((prev) => (prev === localMuted ? prev : localMuted));
        setIsChatPinned((prev) => (prev === localPinned ? prev : localPinned));
      }

      const pendingOverride = pendingChatPrefsOverrideRef.current;
      if (pendingOverride) {
        nextMuted = pendingOverride.muted;
        nextPinned = pendingOverride.pinned;
        setIsChatMuted((prev) => (prev === nextMuted ? prev : nextMuted));
        setIsChatPinned((prev) => (prev === nextPinned ? prev : nextPinned));
        await persistChatPrefsLocalSnapshot(nextMuted, nextPinned);
      }

      if (isMounted) {
        chatPrefsSignatureRef.current = JSON.stringify({
          conversationId,
          userId: userId ?? null,
          muted: nextMuted,
          pinned: nextPinned,
        });
        chatPrefsHydratedRef.current = true;
        setChatPrefsLoaded(true);
      }
    };
    void loadPrefs();
    return () => {
      isMounted = false;
    };
  }, [chatPrefsPeerUserId, chatPrefsStorageKey, conversationId, persistChatPrefsLocalSnapshot, routeId, userId]);

  useEffect(() => {
    chatPrefsStateRef.current = {
      muted: isChatMuted,
      pinned: isChatPinned,
    };
  }, [isChatMuted, isChatPinned]);

  useEffect(() => {
    if (!userId || !activePeerMessageUserId) return;
    const channel = supabase
      .channel(`message_hides:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_hides",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { message_id: string; peer_id?: string | null };
          if (row.peer_id && row.peer_id !== activePeerMessageUserId) return;
          const nextSet = new Set(hiddenMessageIdsRef.current);
          nextSet.add(row.message_id);
          updateHiddenMessageIds(Array.from(nextSet));
          setMessages((prev) => prev.filter((msg) => msg.id !== row.message_id));
          void ChatRepository.deleteMessages(userId, activePeerMessageUserId, [row.message_id]).catch((deleteError) =>
            console.log("[chat] delete realtime hidden local message error", deleteError),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activePeerMessageUserId, hiddenMessageIdsRef, setMessages, updateHiddenMessageIds, userId]);

  useEffect(() => {
    if (!userId || !conversationId) return;
    const channel = supabase
      .channel(`blocks:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "blocks",
          filter: `blocker_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { blocker_id: string; blocked_id: string };
          if (row.blocked_id !== conversationId) return;
          setBlockStatus(blockedByMeValue);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "blocks",
          filter: `blocked_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { blocker_id: string; blocked_id: string };
          if (row.blocker_id !== conversationId) return;
          setBlockStatus(blockedByThemValue);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "blocks",
          filter: `blocker_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.old as { blocker_id: string; blocked_id: string };
          if (row.blocked_id !== conversationId) return;
          void fetchBlockStatus();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "blocks",
          filter: `blocked_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.old as { blocker_id: string; blocked_id: string };
          if (row.blocker_id !== conversationId) return;
          void fetchBlockStatus();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [blockedByMeValue, blockedByThemValue, conversationId, fetchBlockStatus, userId]);

  useEffect(() => {
    if (!userId || !chatPrefsPeerUserId) return;
    const channel = supabase
      .channel(`chat_prefs:${userId}:${chatPrefsPeerUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_prefs",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as { peer_id?: string; muted?: boolean; pinned?: boolean } | undefined;
          if (!row || row.peer_id !== chatPrefsPeerUserId) return;
          if (typeof row.muted === "boolean") {
            setIsChatMuted((prev) => (prev === row.muted ? prev : row.muted));
          }
          if (typeof row.pinned === "boolean") {
            setIsChatPinned((prev) => (prev === row.pinned ? prev : row.pinned));
          }
          chatPrefsSignatureRef.current = JSON.stringify({
            conversationId,
            userId: userId ?? null,
            muted: typeof row.muted === "boolean" ? row.muted : isChatMuted,
            pinned: typeof row.pinned === "boolean" ? row.pinned : isChatPinned,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatPrefsPeerUserId, conversationId, isChatMuted, isChatPinned, userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId || !conversationId) return () => {};
      void fetchBlockStatus();
      return () => {};
    }, [conversationId, fetchBlockStatus, userId]),
  );

  useEffect(() => {
    if (!routeId) return () => {};
    return subscribeChatOptionsPrefsPreview(routeId, (preview) => {
      applyChatPrefsState({
        muted: typeof preview.muted === "boolean" ? preview.muted : chatPrefsStateRef.current.muted,
        pinned: typeof preview.pinned === "boolean" ? preview.pinned : chatPrefsStateRef.current.pinned,
      });
    });
  }, [applyChatPrefsState, routeId]);

  useEffect(() => {
    if (hiddenMessageIds.length === 0) return;
    setMessages((prev) => prev.filter((msg) => !hiddenMessageIdsRef.current.has(msg.id)));
  }, [hiddenMessageIds, hiddenMessageIdsRef, setMessages]);

  useEffect(() => {
    if (!peerResolved || !chatPrefsLoaded || !chatPrefsHydratedRef.current || !chatPrefsPeerUserId) return;
    const nextSignature = JSON.stringify({
      conversationId: chatPrefsPeerUserId,
      userId: userId ?? null,
      muted: isChatMuted,
      pinned: isChatPinned,
    });
    if (chatPrefsSignatureRef.current === nextSignature) return;
    chatPrefsSignatureRef.current = nextSignature;
    const persistPrefs = async () => {
      await persistChatPrefsLocalSnapshot(isChatMuted, isChatPinned);
      const pendingOverride = pendingChatPrefsOverrideRef.current;
      if (
        pendingOverride &&
        pendingOverride.muted === isChatMuted &&
        pendingOverride.pinned === isChatPinned
      ) {
        pendingChatPrefsOverrideRef.current = null;
      }
      if (!userId) return;
      const { error } = await ChatThreadRemoteService.upsertChatPrefs({
        currentUserId: userId,
        peerUserId: chatPrefsPeerUserId,
        muted: isChatMuted,
        pinned: isChatPinned,
        updatedAtIso: new Date().toISOString(),
      });
      if (error) {
        console.log("[chat] chat prefs upsert error", error);
      }
    };
    void persistPrefs();
  }, [
    chatPrefsLoaded,
    chatPrefsPeerUserId,
    isChatMuted,
    isChatPinned,
    peerResolved,
    persistChatPrefsLocalSnapshot,
    userId,
  ]);

  return {
    isChatMuted,
    isChatPinned,
    chatPrefsLoaded,
    blockStatus,
    setBlockStatus,
    chatPrefsStateRef,
    applyChatPrefsState,
    refreshLocalChatPrefs,
    fetchHiddenMessages,
    syncMessageReactions,
    hydrateLocalViewOnceStatus,
    syncViewOnceStatus,
    applyReactionUpdate,
    fetchBlockStatus,
  };
};
