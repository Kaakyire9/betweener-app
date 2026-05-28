import { supabase } from "@/lib/supabase";

const MESSAGE_PAGE_SIZE = 500;
const MESSAGE_HIDE_BATCH_SIZE = 200;

export async function fetchConversationMessageIds(
  userId: string,
  peerUserId: string,
  pageSize: number = MESSAGE_PAGE_SIZE,
): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("messages")
      .select("id")
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${peerUserId}),and(sender_id.eq.${peerUserId},receiver_id.eq.${userId})`,
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const rows = ((data as { id: string }[] | null) ?? []).map((row) => row.id).filter(Boolean);
    ids.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}

export async function insertMessageHidesBatched(
  userId: string,
  peerUserId: string,
  messageIds: string[],
  batchSize: number = MESSAGE_HIDE_BATCH_SIZE,
) {
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const rows = messageIds.slice(i, i + batchSize).map((messageId) => ({
      message_id: messageId,
      user_id: userId,
      peer_id: peerUserId,
    }));

    const { error } = await supabase.from("message_hides").insert(rows);
    if (error) throw error;
  }
}
