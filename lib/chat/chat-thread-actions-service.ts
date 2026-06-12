import { supabase } from "@/lib/supabase";

export const ChatThreadActionsService = {
  markMessageRead(args: { messageId: string; currentUserId: string }) {
    const { messageId } = args;
    return supabase.rpc('rpc_mark_message_read' as never, {
      p_message_id: messageId,
    } as never);
  },

  markMessagesRead(args: { messageIds: string[]; currentUserId: string }) {
    return supabase.rpc('rpc_mark_messages_read' as never, {
      p_message_ids: args.messageIds,
    } as never);
  },

  editMessage(args: { messageId: string; newText: string }) {
    const { messageId, newText } = args;
    return supabase.rpc('edit_message', {
      message_id: messageId,
      new_text: newText,
    });
  },

  hideMessageForUser(args: { messageId: string; currentUserId: string; peerUserId: string }) {
    const { messageId, currentUserId, peerUserId } = args;
    return supabase.from('message_hides').insert({
      message_id: messageId,
      user_id: currentUserId,
      peer_id: peerUserId,
    });
  },

  deleteMessageForEveryone(args: { messageId: string; currentUserId: string; deletedAtIso: string }) {
    const { messageId, currentUserId, deletedAtIso } = args;
    return supabase
      .from('messages')
      .update({
        deleted_for_all: true,
        deleted_at: deletedAtIso,
        deleted_by: currentUserId,
      })
      .eq('id', messageId)
      .eq('sender_id', currentUserId);
  },

  pinMessageForUser(args: { messageId: string; currentUserId: string; peerUserId: string }) {
    const { messageId, currentUserId, peerUserId } = args;
    return supabase.from('message_pins').insert({
      message_id: messageId,
      user_id: currentUserId,
      peer_id: peerUserId,
    });
  },

  unpinMessageForUser(args: { messageId: string; currentUserId: string }) {
    const { messageId, currentUserId } = args;
    return supabase
      .from('message_pins')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', currentUserId);
  },
};
