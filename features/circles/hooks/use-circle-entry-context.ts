import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';

type ContextRow = {
  is_member?: boolean;
  reasons?: string[];
  priorities?: string[];
  completed_at?: string | null;
  skipped_at?: string | null;
  needs_entry?: boolean;
};

export function useCircleEntryContext(circleId: string, enabled: boolean) {
  const [context, setContext] = useState<ContextRow | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!circleId || !enabled) return;
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('rpc_get_my_circle_member_context', {
      p_circle_id: circleId,
    });
    if (!error) setContext((data ?? {}) as ContextRow);
    setLoading(false);
  }, [circleId, enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  const log = useCallback(async (eventType: string) => {
    await (supabase as any).rpc('rpc_log_circle_discovery_event', {
      p_circle_id: circleId,
      p_event_type: eventType,
    });
  }, [circleId]);

  const save = useCallback(async (input: {
    reasons: string[];
    priorities: string[];
    optIntoDating: boolean;
    skip?: boolean;
  }) => {
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('rpc_set_my_circle_member_context', {
        p_circle_id: circleId,
        p_reasons: input.reasons,
        p_priorities: input.priorities,
        p_skip: input.skip === true,
      });
      if (error) throw error;
      if (!input.skip && input.optIntoDating) {
        const preference = await (supabase as any).rpc('rpc_set_my_circle_dating_preference', {
          p_circle_id: circleId,
          p_opted_in: true,
          p_open_to_intents: true,
        });
        if (preference.error) throw preference.error;
        await log('dating_opted_in');
      }
      setContext((data ?? {}) as ContextRow);
    } finally {
      setSaving(false);
    }
  }, [circleId, log]);

  return { context, loading, saving, refresh, save, log };
}
