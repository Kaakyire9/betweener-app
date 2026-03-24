import { supabase } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/persisted-cache";
import { useCallback, useEffect, useMemo, useState } from "react";

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

export const useInbox = (userId?: string | null) => {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const cacheKey = userId ? `cache:inbox:v1:${userId}` : null;

  // Cached-first: show last items immediately, then refresh in background.
  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    (async () => {
      const cached = await readCache<InboxItem[]>(cacheKey, 10 * 60_000);
      if (cancelled || !cached || !Array.isArray(cached)) return;
      setItems((prev) => (prev.length === 0 ? cached : prev));
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const fetchInbox = useCallback(async () => {
    if (!userId) {
      setItems([]);
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
      if (error) return;
      const normalized = (data || []) as InboxItem[];
      const sorted = sortInboxItems(normalized);
      setItems(sorted);
      if (cacheKey) void writeCache(cacheKey, sorted);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, userId]);

  useEffect(() => {
    void fetchInbox();
    if (!userId) return;

    const channel = supabase
      .channel(`inbox-items:${userId}`)
      // Server-side: insert inbox_items from triggers/edge functions for swipes, messages, matches, moments.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inbox_items", filter: `user_id=eq.${userId}` },
        () => void fetchInbox(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInbox, userId]);

  const markRead = useCallback(
    async (id: string) => {
      if (!userId) return;
      await supabase
        .from("inbox_items")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
    },
    [userId],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from("inbox_items")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
  }, [userId]);

  const resolveItem = useCallback(
    async (id: string) => {
      if (!userId) return;
      await supabase
        .from("inbox_items")
        .update({ action_required: false, read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
    },
    [userId],
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
  };
};
