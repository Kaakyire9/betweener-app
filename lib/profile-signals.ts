import { supabase } from '@/lib/supabase';

type ProfileSignalInput = {
  profileId: string;
  targetProfileId: string;
  openedDelta?: number;
  liked?: boolean;
  introVideoStarted?: boolean;
  introVideoCompleted?: boolean;
  dwellDelta?: number;
};

export async function recordProfileSignal(input: ProfileSignalInput) {
  const {
    profileId,
    targetProfileId,
    openedDelta = 0,
    liked,
    introVideoStarted,
    introVideoCompleted,
    dwellDelta = 0,
  } = input;

  if (!profileId || !targetProfileId || profileId === targetProfileId) return;

  try {
    await supabase.rpc('rpc_upsert_profile_signal', {
      p_profile_id: profileId,
      p_target_profile_id: targetProfileId,
      p_opened_delta: openedDelta,
      p_liked: typeof liked === 'boolean' ? liked : null,
      p_intro_video_started: typeof introVideoStarted === 'boolean' ? introVideoStarted : null,
      p_intro_video_completed: typeof introVideoCompleted === 'boolean' ? introVideoCompleted : null,
      p_dwell_delta: dwellDelta,
    });
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[signals] record error', error);
    }
  }
}
