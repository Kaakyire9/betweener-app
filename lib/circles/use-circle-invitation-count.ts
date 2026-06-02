import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getMyCircleInvitationCount } from '@/lib/circles/circle-invitations';

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
    const timer = setInterval(() => void reload(), 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [reload]);

  return { count, reload };
}
