import { supabase } from '@/lib/supabase';

const POSITIVE_SWIPE_ACTIONS = ['LIKE', 'SUPERLIKE'] as const;
const ACTIVE_INTENT_STATUSES = ['pending', 'accepted', 'matched'] as const;
const ACTIVE_SIGNAL_STATUSES = ['sent', 'seen'] as const;

export const MOMENT_POSTING_EXPLAINER =
  'Moments work best after a first signal. Like someone, send an Intent, or exchange a Signal first so your Moment lands with context.';

export type MomentPostingEligibility = {
  canPost: boolean;
  hasIncomingLike: boolean;
  hasOutgoingLike: boolean;
  hasMutualLike: boolean;
  hasIncomingIntent: boolean;
  hasOutgoingIntent: boolean;
  hasMatchedIntent: boolean;
  hasIncomingSignal: boolean;
  hasOutgoingSignal: boolean;
  promptTitle: string | null;
  promptBody: string | null;
  nudgeTitle: string | null;
  nudgeBody: string | null;
};

const buildDefaultEligibility = (): MomentPostingEligibility => ({
  canPost: true,
  hasIncomingLike: false,
  hasOutgoingLike: false,
  hasMutualLike: false,
  hasIncomingIntent: false,
  hasOutgoingIntent: false,
  hasMatchedIntent: false,
  hasIncomingSignal: false,
  hasOutgoingSignal: false,
  promptTitle: null,
  promptBody: null,
  nudgeTitle: null,
  nudgeBody: null,
});

export const isMomentPostingEligibilityError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /row-level security policy.*table\s+"moments"/i.test(message) || /moment_signal_required/i.test(message);
};

export const getMomentPostingErrorMessage = (error: unknown) => {
  if (isMomentPostingEligibilityError(error)) {
    return MOMENT_POSTING_EXPLAINER;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Failed to create moment.';
};

export async function fetchMomentPostingEligibility(params: {
  profileId?: string | null;
}): Promise<MomentPostingEligibility> {
  const profileId = params.profileId ? String(params.profileId) : null;
  if (!profileId) {
    return {
      ...buildDefaultEligibility(),
      canPost: false,
      promptTitle: 'Moments need a relationship signal',
      promptBody: MOMENT_POSTING_EXPLAINER,
    };
  }

  const nowIso = new Date().toISOString();
  const [swipesResult, intentsResult, signalsResult] = await Promise.all([
    supabase
      .from('swipes')
      .select('swiper_id,target_id,action')
      .or(`swiper_id.eq.${profileId},target_id.eq.${profileId}`)
      .in('action', [...POSITIVE_SWIPE_ACTIONS]),
    supabase
      .from('intent_requests')
      .select('actor_id,recipient_id,status')
      .or(`actor_id.eq.${profileId},recipient_id.eq.${profileId}`)
      .in('status', [...ACTIVE_INTENT_STATUSES]),
    supabase
      .from('profile_signal_gestures')
      .select('sender_profile_id,receiver_profile_id,status,expires_at')
      .or(`sender_profile_id.eq.${profileId},receiver_profile_id.eq.${profileId}`)
      .in('status', [...ACTIVE_SIGNAL_STATUSES])
      .gt('expires_at', nowIso),
  ]);

  const next = buildDefaultEligibility();

  const swipeRows =
    (swipesResult.data as Array<{ swiper_id: string; target_id: string; action: string }> | null) ?? [];
  const intentRows =
    (intentsResult.data as Array<{ actor_id: string; recipient_id: string; status: string }> | null) ?? [];
  const signalRows =
    (signalsResult.data as Array<{
      sender_profile_id: string;
      receiver_profile_id: string;
      status: string;
      expires_at: string | null;
    }> | null) ?? [];

  if (swipeRows.length === 0 && intentRows.length === 0 && signalRows.length === 0) {
    if (swipesResult.error || intentsResult.error || signalsResult.error) {
      return next;
    }
  }

  const swipeByPeer = new Map<string, { incoming: boolean; outgoing: boolean }>();
  swipeRows.forEach((row) => {
    const peerId = row.swiper_id === profileId ? row.target_id : row.swiper_id;
    if (!peerId) return;
    const current = swipeByPeer.get(peerId) ?? { incoming: false, outgoing: false };
    if (row.target_id === profileId) current.incoming = true;
    if (row.swiper_id === profileId) current.outgoing = true;
    swipeByPeer.set(peerId, current);
  });
  swipeByPeer.forEach((signal) => {
    next.hasIncomingLike = next.hasIncomingLike || signal.incoming;
    next.hasOutgoingLike = next.hasOutgoingLike || signal.outgoing;
    next.hasMutualLike = next.hasMutualLike || (signal.incoming && signal.outgoing);
  });

  intentRows.forEach((row) => {
    const status = String(row.status || '').toLowerCase();
    if (row.recipient_id === profileId) next.hasIncomingIntent = true;
    if (row.actor_id === profileId) next.hasOutgoingIntent = true;
    if (status === 'matched' || status === 'accepted') next.hasMatchedIntent = true;
  });

  signalRows.forEach((row) => {
    if (row.receiver_profile_id === profileId) next.hasIncomingSignal = true;
    if (row.sender_profile_id === profileId) next.hasOutgoingSignal = true;
  });

  next.canPost = Boolean(
    next.hasIncomingLike ||
      next.hasOutgoingLike ||
      next.hasIncomingIntent ||
      next.hasOutgoingIntent ||
      next.hasIncomingSignal ||
      next.hasOutgoingSignal,
  );

  if (!next.canPost) {
    next.promptTitle = 'Moments need a relationship signal';
    next.promptBody = MOMENT_POSTING_EXPLAINER;
    return next;
  }

  if (next.hasIncomingLike || next.hasIncomingIntent || next.hasIncomingSignal || next.hasMutualLike) {
    next.nudgeTitle = 'Someone is already paying attention';
    next.nudgeBody = 'Go live with a Moment while the interest is warm and give them an easier opening.';
    return next;
  }

  if (next.hasOutgoingLike || next.hasOutgoingIntent || next.hasOutgoingSignal) {
    next.nudgeTitle = 'You already opened a door';
    next.nudgeBody = 'A fresh Moment gives that person something current and human to answer.';
  }

  return next;
}

export async function fetchMomentConversationState(params: {
  currentUserId?: string | null;
  peerUserId?: string | null;
}): Promise<{ hasConversation: boolean | null }> {
  const currentUserId = params.currentUserId ? String(params.currentUserId) : null;
  const peerUserId = params.peerUserId ? String(params.peerUserId) : null;
  if (!currentUserId || !peerUserId || currentUserId === peerUserId) {
    return { hasConversation: null };
  }

  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .or(
      `and(sender_id.eq.${currentUserId},receiver_id.eq.${peerUserId}),and(sender_id.eq.${peerUserId},receiver_id.eq.${currentUserId})`,
    );

  if (error) {
    return { hasConversation: null };
  }

  return { hasConversation: typeof count === 'number' ? count > 0 : false };
}
