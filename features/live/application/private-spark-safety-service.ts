import { supabase } from '@/lib/supabase';

export type PrivateSparkSafetyContext = {
  privateSparkId: string;
  liveSessionId: string;
  reportedUserId: string;
  reportedProfileId: string;
};

export const reportPrivateSparkParticipant = async (
  context: PrivateSparkSafetyContext,
  reason: string,
) => {
  const { error } = await supabase.rpc('rpc_submit_report', {
    p_reported_id: context.reportedUserId,
    p_reason: reason,
    p_client_evidence: {
      entry_point: 'private_spark',
      private_spark_id: context.privateSparkId,
      live_session_id: context.liveSessionId,
      reported_profile_id: context.reportedProfileId,
      occurred_at: new Date().toISOString(),
      media_captured: false,
    },
  });
  if (error) throw error;
};

export const blockPrivateSparkParticipant = async (
  blockerUserId: string,
  blockedUserId: string,
) => {
  const { error } = await supabase.from('blocks').insert({
    blocker_id: blockerUserId,
    blocked_id: blockedUserId,
  });
  if (error && error.code !== '23505') throw error;
};
