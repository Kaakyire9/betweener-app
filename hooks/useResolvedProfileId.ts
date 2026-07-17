import { supabase } from '@/lib/supabase';
import { useEffect, useRef, useState } from 'react';

// In this app, some tables are keyed by `profiles.id` (not `auth.users.id`).
// This helper ensures screens/badges can reliably operate on a "profile id"
// even when the AuthProvider has not finished hydrating `profile` yet.
export const useResolvedProfileId = (userId?: string | null, profileIdFromContext?: string | null) => {
  const [profileId, setProfileId] = useState<string | null>(profileIdFromContext ?? null);
  const lastResolvedRef = useRef<{ userId: string; profileId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (profileIdFromContext) {
      setProfileId(profileIdFromContext);
      if (userId) {
        lastResolvedRef.current = { userId, profileId: profileIdFromContext };
      }
      return () => {
        cancelled = true;
      };
    }

    if (!userId) {
      setProfileId(null);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const { data } = await supabase.from('profiles').select('id').eq('user_id', userId).maybeSingle();
        if (cancelled) return;
        const nextProfileId =
          data?.id ??
          (lastResolvedRef.current?.userId === userId ? lastResolvedRef.current.profileId : null);
        if (data?.id) {
          lastResolvedRef.current = { userId, profileId: data.id };
        }
        setProfileId(nextProfileId);
      } catch {
        if (cancelled) return;
        setProfileId((prev) => prev ?? (lastResolvedRef.current?.userId === userId ? lastResolvedRef.current.profileId : null));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileIdFromContext, userId]);

  return { profileId };
};
