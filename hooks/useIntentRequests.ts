import { supabase } from '@/lib/supabase';
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

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      await supabase.rpc('rpc_mark_expired_intent_requests');
      const { data } = await supabase
        .from('intent_requests')
        .select('*')
        .or(`recipient_id.eq.${userId},actor_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(200);
      setItems((data || []) as IntentRequest[]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

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
