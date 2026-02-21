import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

// In this app, some tables are keyed by `profiles.id` (not `auth.users.id`).
// This helper ensures screens/badges can reliably operate on a "profile id"
// even when the AuthProvider has not finished hydrating `profile` yet.
export const useResolvedProfileId = (userId?: string | null, profileIdFromContext?: string | null) => {
  const [profileId, setProfileId] = useState<string | null>(profileIdFromContext ?? null);

  useEffect(() => {
    let cancelled = false;

    if (profileIdFromContext) {
      setProfileId(profileIdFromContext);
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
        setProfileId(data?.id ?? null);
      } catch {
        if (cancelled) return;
        setProfileId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileIdFromContext, userId]);

  return { profileId };
};

