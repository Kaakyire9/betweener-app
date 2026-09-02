import type { ProfileDisplayContext } from '@/lib/profile/profile-display-context';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

type Eligibility = { eligible: boolean; loading: boolean };

export function useRomanticEligibility(input: {
  targetProfileId?: string | null;
  context: ProfileDisplayContext;
  circleId?: string | null;
  disabled?: boolean;
}): Eligibility {
  const { targetProfileId, context, circleId, disabled = false } = input;
  const [state, setState] = useState<Eligibility>({ eligible: false, loading: !disabled });

  useEffect(() => {
    let active = true;
    if (disabled || !targetProfileId || context === 'circle-community') {
      setState({ eligible: false, loading: false });
      return () => { active = false; };
    }
    setState((current) => ({ ...current, loading: true }));
    void (supabase as any).rpc('rpc_get_romantic_eligibility', {
      p_target_profile_id: targetProfileId,
      p_context_type: context === 'circle-discover' ? 'circle' : 'global',
      p_context_id: context === 'circle-discover' ? circleId ?? null : null,
    }).then(({ data, error }: { data?: { eligible?: boolean }; error?: unknown }) => {
      if (!active) return;
      setState({ eligible: !error && data?.eligible === true, loading: false });
    });
    return () => { active = false; };
  }, [circleId, context, disabled, targetProfileId]);

  return state;
}
