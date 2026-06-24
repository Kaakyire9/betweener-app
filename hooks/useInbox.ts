import { supabase } from "@/lib/supabase";
import { peekCache, readCache, writeCache } from "@/lib/persisted-cache";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type InboxType =
  | "LIKE_RECEIVED"
  | "SUPERLIKE_RECEIVED"
  | "MESSAGE_REQUEST"
  | "NEW_MESSAGE"
  | "MOMENT_REACTION"
  | "MOMENT_COMMENT"
  | "GIFT_RECEIVED"
  | "MATCH_CREATED"
  | "SYSTEM";

export type InboxItem = {
  id: string;
  user_id: string;
  type: InboxType;
  actor_id?: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  title: string;
  body: string;
  created_at: string;
  read_at?: string | null;
  action_required: boolean;
  metadata?: Record<string, unknown> | null;
};

type InboxItemsListener = (items: InboxItem[]) => void;

const inboxItemsListeners = new Map<string, Set<InboxItemsListener>>();

const publishInboxItems = (userId: string, items: InboxItem[]) => {
  const listeners = inboxItemsListeners.get(userId);
  if (!listeners?.size) return;
  listeners.forEach((listener) => listener(items));
};

const subscribeInboxItems = (userId: string, listener: InboxItemsListener) => {
  const listeners = inboxItemsListeners.get(userId) ?? new Set<InboxItemsListener>();
  listeners.add(listener);
  inboxItemsListeners.set(userId, listeners);
  return () => {
    const current = inboxItemsListeners.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      inboxItemsListeners.delete(userId);
    }
  };
};

const sortInboxItems = (list: InboxItem[]) =>
  [...list].sort((a, b) => {
    const aNeeds = a.action_required ? 1 : 0;
    const bNeeds = b.action_required ? 1 : 0;
    if (aNeeds !== bNeeds) return bNeeds - aNeeds;
    const aUnread = a.read_at ? 0 : 1;
    const bUnread = b.read_at ? 0 : 1;
    if (aUnread !== bUnread) return bUnread - aUnread;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });

export const markSystemInboxItemsRead = async (
  userId: string,
  entityTypes: string[],
) => {
  const normalizedEntityTypes = Array.from(
    new Set(entityTypes.map((value) => String(value || "").trim()).filter(Boolean)),
  );
  if (!userId || normalizedEntityTypes.length === 0) return;

  const readAt = new Date().toISOString();
  const cacheKey = `cache:inbox:v1:${userId}`;
  const cached = await peekCache<InboxItem[]>(cacheKey);

  if (Array.isArray(cached)) {
    const next = sortInboxItems(
      cached.map((item) =>
        item.type === "SYSTEM" &&
        normalizedEntityTypes.includes(String(item.entity_type || "")) &&
        !item.read_at
          ? { ...item, read_at: readAt }
          : item,
      ),
    );
    await writeCache(cacheKey, next);
    publishInboxItems(userId, next);
  }

  await supabase
    .from("inbox_items")
    .update({ read_at: readAt })
    .eq("user_id", userId)
    .eq("type", "SYSTEM")
    .in("entity_type", normalizedEntityTypes)
    .is("read_at", null);
};

export const useInbox = (userId?: string | null) => {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFreshServerData, setHasFreshServerData] = useState(false);
  const [isUsingCachedSnapshot, setIsUsingCachedSnapshot] = useState(false);
  const [lastServerFetchAt, setLastServerFetchAt] = useState<number | null>(null);
  const [lastServerFetchFailedAt, setLastServerFetchFailedAt] = useState<number | null>(null);
  const cacheKey = userId ? `cache:inbox:v1:${userId}` : null;
  const recoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsCountRef = useRef(0);

  useEffect(() => {
    itemsCountRef.current = items.length;
  }, [items.length]);

  const commitItems = useCallback(
    (next: InboxItem[]) => {
      setItems(next);
      if (cacheKey) void writeCache(cacheKey, next);
      if (userId) publishInboxItems(userId, next);
    },
    [cacheKey, userId],
  );

  const applyItemsUpdate = useCallback(
    (updater: (current: InboxItem[]) => InboxItem[]) => {
      setItems((current) => {
        const next = sortInboxItems(updater(current));
        if (cacheKey) void writeCache(cacheKey, next);
        if (userId) publishInboxItems(userId, next);
        return next;
      });
    },
    [cacheKey, userId],
  );

  // Cached-first: show last items immediately, then refresh in background.
  useEffect(() => {
    if (!userId) {
      setHasFreshServerData(false);
      setIsUsingCachedSnapshot(false);
      setLastServerFetchAt(null);
      setLastServerFetchFailedAt(null);
      return;
    }
  }, [userId]);

  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    (async () => {
      const cached = await readCache<InboxItem[]>(cacheKey, 10 * 60_000);
      if (cancelled || !cached || !Array.isArray(cached)) return;
      if (itemsCountRef.current !== 0) return;
      setIsUsingCachedSnapshot(true);
      setItems(cached);
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const fetchInbox = useCallback(async () => {
    if (!userId) {
      commitItems([]);
      setHasFreshServerData(false);
      setIsUsingCachedSnapshot(false);
      setLastServerFetchAt(null);
      setLastServerFetchFailedAt(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inbox_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        setLastServerFetchFailedAt(Date.now());
        return;
      }
      const normalized = (data || []) as InboxItem[];
      const sorted = sortInboxItems(normalized);
      commitItems(sorted);
      setHasFreshServerData(true);
      setIsUsingCachedSnapshot(false);
      setLastServerFetchAt(Date.now());
      setLastServerFetchFailedAt(null);
    } finally {
      setLoading(false);
    }
  }, [commitItems, userId]);

  useEffect(() => {
    if (!userId) return;
    return subscribeInboxItems(userId, (nextItems) => {
      setItems((current) => {
        if (current === nextItems) return current;
        return nextItems;
      });
    });
  }, [userId]);

  useEffect(() => {
    void fetchInbox();
    if (!userId) return;

    const scheduleRecoveryFetch = () => {
      if (recoveryTimeoutRef.current) clearTimeout(recoveryTimeoutRef.current);
      recoveryTimeoutRef.current = setTimeout(() => {
        recoveryTimeoutRef.current = null;
        void fetchInbox();
      }, 250);
    };

    const channel = supabase
      .channel(`inbox-items:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inbox_items", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as InboxItem;
          if (!row?.id) return;
          applyItemsUpdate((current) =>
            payload.eventType === 'DELETE'
              ? current.filter((item) => item.id !== row.id)
              : [...current.filter((item) => item.id !== row.id), row],
          );
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleRecoveryFetch();
        }
      });

    return () => {
      if (recoveryTimeoutRef.current) clearTimeout(recoveryTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [applyItemsUpdate, fetchInbox, userId]);

  const markRead = useCallback(
    async (id: string) => {
      if (!userId) return;
      const readAt = new Date().toISOString();
      applyItemsUpdate((current) =>
        current.map((item) => (item.id === id && !item.read_at ? { ...item, read_at: readAt } : item)),
      );
      await supabase
        .from("inbox_items")
        .update({ read_at: readAt })
        .eq("id", id)
        .eq("user_id", userId);
    },
    [applyItemsUpdate, userId],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const readAt = new Date().toISOString();
    applyItemsUpdate((current) =>
      current.map((item) => (!item.read_at ? { ...item, read_at: readAt } : item)),
    );
    await supabase
      .from("inbox_items")
      .update({ read_at: readAt })
      .eq("user_id", userId)
      .is("read_at", null);
  }, [applyItemsUpdate, userId]);

  const resolveItem = useCallback(
    async (id: string) => {
      if (!userId) return;
      const readAt = new Date().toISOString();
      applyItemsUpdate((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                action_required: false,
                read_at: item.read_at ?? readAt,
              }
            : item,
        ),
      );
      await supabase
        .from("inbox_items")
        .update({ action_required: false, read_at: readAt })
        .eq("id", id)
        .eq("user_id", userId);
    },
    [applyItemsUpdate, userId],
  );

  const unreadCount = useMemo(() => items.filter((item) => !item.read_at).length, [items]);
  const actionRequiredCount = useMemo(() => items.filter((item) => item.action_required).length, [items]);
  const badgeCount = useMemo(
    () => items.filter((item) => item.action_required || !item.read_at).length,
    [items],
  );

  return {
    items,
    loading,
    refresh: fetchInbox,
    markRead,
    markAllRead,
    resolveItem,
    unreadCount,
    actionRequiredCount,
    badgeCount,
    freshness: {
      hasFreshServerData,
      isUsingCachedSnapshot,
      lastServerFetchAt,
      lastServerFetchFailedAt,
    },
  };
};
