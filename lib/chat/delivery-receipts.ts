import { supabase } from '@/lib/supabase';

export const acknowledgeIncomingMessagesDelivered = async (
  userId: string,
  messageId?: string | null,
) => {
  if (!userId) return;

  let query = supabase
    .from('messages')
    .update({ delivered_at: new Date().toISOString() })
    .eq('receiver_id', userId)
    .neq('sender_id', userId)
    .is('delivered_at', null);

  if (messageId) {
    query = query.eq('id', messageId);
  }

  const { error } = await query;
  if (error && typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[chat] delivery ack error', error);
  }
};
