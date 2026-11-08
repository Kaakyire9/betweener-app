import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getMyCircleInvitationCount } from '@/lib/circles/circle-invitations';
import { createEphemeralRealtimeTopic } from '@/lib/realtime/realtime-channel-topic';
import { supabase } from '@/lib/supabase';

export function useCircleInvitationCount(profileId: string | null | undefined) {
  const [count, setCount] = useState(0);

  const reload = useCallback(async () => {
    if (!profileId) {
      setCount(0);
      return;
    }

    try {
      setCount(await getMyCircleInvitationCount(profileId));
    } catch {
      setCount(0);
    }
  }, [profileId]);

  useEffect(() => {
    void reload();
    if (!profileId) return;

    const channel = supabase
      .channel(createEphemeralRealtimeTopic(`circle-invitations:${profileId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'circle_invitations',
          filter: `invited_profile_id=eq.${profileId}`,
        },
        () => {
          void reload();
        },
      )
      .subscribe();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });

    return () => {
      void supabase.removeChannel(channel);
      subscription.remove();
    };
  }, [reload]);

  return { count, reload };
}
