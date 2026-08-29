import { createIntentRequestOfflineSafe } from '@/lib/intents/offline-actions';
import { isLikelyNetworkError } from '@/lib/network';
import { enqueueSwipeSyncMutation } from '@/lib/offline/mutation-queue';
import { supabase } from '@/lib/supabase';

type LikeLiveMemberInput = {
  currentUserId: string;
  sessionId: string;
  targetProfileId: string;
  viewerProfileId: string;
};

/** Records a durable dating signal without making the Live UI own persistence. */
export async function likeLiveMember({
  currentUserId,
  sessionId,
  targetProfileId,
  viewerProfileId,
}: LikeLiveMemberInput): Promise<void> {
  if (viewerProfileId === targetProfileId) throw new Error('live_member_self_action');

  const { error } = await supabase.from('swipes').upsert(
    [{ swiper_id: viewerProfileId, target_id: targetProfileId, action: 'LIKE' }],
    { onConflict: 'swiper_id,target_id' },
  );

  if (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueSwipeSyncMutation({
      userId: viewerProfileId,
      targetId: targetProfileId,
      action: 'LIKE',
      mirrorIntent: true,
      message: null,
    });
    return;
  }

  // The swipe is authoritative. Mirroring it into Intent is best-effort and
  // keeps the receiver's Likes feed consistent with likes sent elsewhere.
  try {
    await createIntentRequestOfflineSafe({
      recipientId: targetProfileId,
      type: 'like_with_note',
      message: null,
      metadata: { source: 'live_room', live_session_id: sessionId, swipe_action: 'like' },
      actorProfileId: viewerProfileId,
      snapshotOwnerIds: [viewerProfileId, currentUserId],
    });
  } catch {
    // Best-effort mirror only; the canonical swipe has already succeeded.
  }
}
