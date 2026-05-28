import { fetchConversationMessageIds, insertMessageHidesBatched } from "@/lib/chat/history";
import { supabase } from "@/lib/supabase";

export const upsertPeerVisibilityPref = async (
  userId: string,
  peerUserId: string,
  next: { archived: boolean; hidden: boolean },
) => {
  return supabase
    .from('peer_visibility_prefs')
    .upsert(
      {
        user_id: userId,
        peer_user_id: peerUserId,
        archived: next.archived,
        hidden: next.hidden,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,peer_user_id' },
    );
};

export const upsertChatPref = async (
  userId: string,
  peerUserId: string,
  next: { pinned: boolean; muted: boolean },
) => {
  return supabase
    .from('chat_prefs')
    .upsert(
      {
        user_id: userId,
        peer_id: peerUserId,
        pinned: next.pinned,
        muted: next.muted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,peer_id' },
    );
};

export const blockChatPeer = async (userId: string, peerUserId: string) => {
  return supabase.from('blocks').insert({
    blocker_id: userId,
    blocked_id: peerUserId,
  });
};

export const unblockChatPeer = async (userId: string, peerUserId: string) => {
  return supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', peerUserId);
};

export const submitChatPeerReport = async (peerUserId: string, reason: string) => {
  return supabase.rpc('rpc_submit_report', {
    p_reported_id: peerUserId,
    p_reason: reason,
  });
};

export const hideConversationMessagesForUser = async (userId: string, peerUserId: string) => {
  const messageIds = await fetchConversationMessageIds(userId, peerUserId);
  if (messageIds.length === 0) {
    return { ok: true as const, idsToHide: [] as string[] };
  }

  const { data: hiddenRows, error: hiddenError } = await supabase
    .from('message_hides')
    .select('message_id')
    .eq('user_id', userId)
    .eq('peer_id', peerUserId);

  if (hiddenError) {
    return { ok: false as const, error: hiddenError, idsToHide: [] as string[] };
  }

  const hiddenSet = new Set(((hiddenRows as { message_id: string }[] | null) ?? []).map((row) => row.message_id));
  const idsToHide = messageIds.filter((id) => !hiddenSet.has(id));
  if (idsToHide.length === 0) {
    return { ok: true as const, idsToHide };
  }

  await insertMessageHidesBatched(userId, peerUserId, idsToHide);
  return { ok: true as const, idsToHide };
};

export const hideConversationForUser = async (userId: string, peerUserId: string) => {
  const hideResult = await hideConversationMessagesForUser(userId, peerUserId);
  if (!hideResult.ok) {
    return hideResult;
  }

  const visibilityResult = await upsertPeerVisibilityPref(userId, peerUserId, {
    archived: false,
    hidden: true,
  });

  if (visibilityResult.error) {
    return { ok: false as const, error: visibilityResult.error, idsToHide: hideResult.idsToHide };
  }

  return { ok: true as const, idsToHide: hideResult.idsToHide };
};
