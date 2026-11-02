import { useEffect, useRef } from 'react';

import { createEphemeralRealtimeTopic } from '@/lib/realtime/realtime-channel-topic';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes only to content-free Love Seat invalidations. Callers must refetch
 * their own audience-scoped RPC; event payloads are never treated as content.
 */
export function useCircleLoveSeatInvalidation({
  circleId,
  enabled,
  reload,
}: {
  circleId: string;
  enabled: boolean;
  reload: () => void | Promise<unknown>;
}) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!enabled || !circleId || typeof supabase.channel !== 'function') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(createEphemeralRealtimeTopic(`circle-love-seat-updates:${circleId}`))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'circle_love_seat_updates',
        filter: `circle_id=eq.${circleId}`,
      }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void reloadRef.current(), 120);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [circleId, enabled]);
}
