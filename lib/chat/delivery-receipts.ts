import { supabase } from '@/lib/supabase';

export const acknowledgeIncomingMessagesDelivered = async (
  userId: string,
  messageId?: string | null,
  peerUserId?: string | null,
) => {
  if (!userId) return;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  const expiresAtMs = Number(session?.expires_at ?? 0) * 1000;
  if (
    sessionError ||
    !session?.access_token ||
    session.user.id !== userId ||
    expiresAtMs <= Date.now() + 5_000
  ) {
    return;
  }

  const { error } = await supabase.rpc('rpc_acknowledge_messages_delivered' as never, {
    p_message_id: messageId ?? null,
    p_peer_user_id: peerUserId ?? null,
  } as never);
  if (error && typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[chat] delivery ack error', error);
  }
};
