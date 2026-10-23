import { isMissingIdempotentRpc } from '@/lib/offline/idempotent-rpc';
import { supabase } from '@/lib/supabase';

export async function replaceProfileInterestsAtomic(input: {
  profileId: string;
  interests: string[];
  clientOperationId: string;
}) {
  const { profileId, interests, clientOperationId } = input;
  const { error } = await supabase.rpc('rpc_replace_profile_interests_v2' as any, {
    p_profile_id: profileId,
    p_interest_names: interests,
    p_client_operation_id: clientOperationId,
  });
  if (!error) return;
  if (!isMissingIdempotentRpc(error)) throw error;

  const { data: interestData, error: interestError } = interests.length
    ? await supabase.from('interests').select('id, name').in('name', interests)
    : { data: [], error: null };
  if (interestError) throw interestError;
  if ((interestData?.length ?? 0) !== interests.length) {
    throw new Error('The interest catalog is still syncing. Please try again shortly.');
  }

  const { error: deleteError } = await supabase
    .from('profile_interests')
    .delete()
    .eq('profile_id', profileId);
  if (deleteError) throw deleteError;

  if (!interestData?.length) return;
  const { error: insertError } = await supabase.from('profile_interests').insert(
    interestData.map((interest) => ({
      profile_id: profileId,
      interest_id: interest.id,
    })),
  );
  if (insertError) throw insertError;
}
