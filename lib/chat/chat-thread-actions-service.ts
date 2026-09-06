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

  markThreadRead(args: { peerUserId: string; currentUserId: string }) {
    return supabase.rpc('rpc_mark_chat_thread_read' as never, {
      p_peer_user_id: args.peerUserId,
    } as never);
  },

  async editMessage(args: { messageId: string; newText: string }) {
    const { messageId, newText } = args;
    const { data, error } = await supabase.functions.invoke('private-message-guard-send', {
      body: {
        action: 'edit',
        messageId,
        text: newText,
        messageType: 'text',
      },
    });
    const result = (data ?? {}) as { ok?: boolean; code?: string; message?: unknown };
    if (error) return { data: null, error };
    if (result.ok === false) {
      return {
        data: null,
        error: Object.assign(new Error(result.code ?? 'MESSAGE_CONTENT_NOT_ALLOWED'), {
          code: result.code ?? 'MESSAGE_CONTENT_NOT_ALLOWED',
        }),
      };
    }
    return { data: result.message ?? null, error: null };
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
    return supabase.rpc('rpc_delete_chat_message_for_everyone' as never, {
      p_message_id: args.messageId,
    } as never);
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
