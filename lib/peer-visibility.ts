import { supabase } from "@/lib/supabase";

export type PeerVisibilityPref = {
  archived: boolean;
  hidden: boolean;
};

export const EMPTY_PEER_VISIBILITY_PREF: PeerVisibilityPref = {
  archived: false,
  hidden: false,
};

export const fetchPeerVisibilityPrefs = async (
  userId: string | null | undefined,
  peerUserIds: string[],
): Promise<Record<string, PeerVisibilityPref>> => {
  if (!userId || peerUserIds.length === 0) return {};

  const uniquePeerIds = Array.from(new Set(peerUserIds.filter((value) => typeof value === "string" && value.trim().length > 0)));
  if (uniquePeerIds.length === 0) return {};

  const { data, error } = await supabase
    .from("peer_visibility_prefs")
    .select("peer_user_id,archived,hidden")
    .eq("user_id", userId)
    .in("peer_user_id", uniquePeerIds);

  if (error) {
    console.log("[peer-visibility] fetch prefs error", error);
    return {};
  }

  const next: Record<string, PeerVisibilityPref> = {};
  (data || []).forEach((row: any) => {
    if (!row?.peer_user_id) return;
    next[String(row.peer_user_id)] = {
      archived: Boolean(row.archived),
      hidden: Boolean(row.hidden),
    };
  });
  return next;
};
