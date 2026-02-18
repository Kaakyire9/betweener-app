import { supabase } from '@/lib/supabase';
import { readCache, writeCache } from '@/lib/persisted-cache';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type IntentRequestType = 'connect' | 'date_request' | 'like_with_note' | 'circle_intro';
export type IntentRequestStatus = 'pending' | 'accepted' | 'passed' | 'expired' | 'cancelled';

export type IntentRequest = {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: IntentRequestType;
  message?: string | null;
  suggested_time?: string | null;
  suggested_place?: string | null;
  status: IntentRequestStatus;
  created_at: string;
  expires_at: string;
  metadata?: Record<string, unknown> | null;
};

const isExpired = (req: IntentRequest) => {
  if (req.status !== 'pending') return false;
  const ts = Date.parse(req.expires_at);
  return Number.isNaN(ts) ? false : ts < Date.now();
};

export const useIntentRequests = (userId?: string | null) => {
  const [items, setItems] = useState<IntentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const cacheKey = userId ? `cache:intent_requests:v1:${userId}` : null;

  // Cached-first: hydrate last known list quickly, then refresh in background.
  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    (async () => {
      const cached = await readCache<IntentRequest[]>(cacheKey, 10 * 60_000);
      if (cancelled || !cached || !Array.isArray(cached)) return;
      setItems((prev) => (prev.length === 0 ? cached : prev));
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      // Best-effort cleanup; don't fail the screen if this errors.
      try {
        await supabase.rpc('rpc_mark_expired_intent_requests');
      } catch {}

      const { data, error } = await supabase
        .from('intent_requests')
        .select('*')
        .or(`recipient_id.eq.${userId},actor_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) return;
      const next = (data || []) as IntentRequest[];
      setItems(next);
      if (cacheKey) void writeCache(cacheKey, next);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, userId]);

  useEffect(() => {
    void refresh();
    if (!userId) return;

    const incomingChannel = supabase
      .channel(`intent-requests:recipient:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intent_requests', filter: `recipient_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();

    const outgoingChannel = supabase
      .channel(`intent-requests:actor:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intent_requests', filter: `actor_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(incomingChannel);
      supabase.removeChannel(outgoingChannel);
    };
  }, [refresh, userId]);

  const incoming = useMemo(() => items.filter((item) => item.recipient_id === userId), [items, userId]);
  const sent = useMemo(() => items.filter((item) => item.actor_id === userId), [items, userId]);
  const badgeCount = useMemo(
    () => incoming.filter((item) => item.status === 'pending' && !isExpired(item)).length,
    [incoming],
  );

  return {
    items,
    incoming,
    sent,
    loading,
    refresh,
    badgeCount,
  };
};
