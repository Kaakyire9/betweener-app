import { fetchPeerVisibilityPrefs } from "@/lib/peer-visibility";
import { supabase } from "@/lib/supabase";
import { fetchUsersPresence, type UserPresenceRow } from "@/lib/user-presence";
import {
  buildChatListEnrichmentPlan,
  getPeerUserIdsNeedingLocalHistory,
} from "@/lib/chat/sync/chat-list-enrichment-plan";

type RemoteConversationSummaryRow = {
  other_user_id: string;
  last_message_id: string;
  last_message_text: string;
  last_message_created_at: string;
  last_message_sender_id: string;
  last_message_receiver_id: string;
  last_message_is_read: boolean;
  last_message_delivered_at?: string | null;
  last_message_type?: string | null;
  last_message_is_view_once?: boolean | null;
  last_message_deleted_for_all?: boolean | null;
  last_message_edited_at?: string | null;
  last_message_reaction_emoji?: string | null;
  last_message_reaction_user_id?: string | null;
  last_message_reaction_created_at?: string | null;
  last_message_reaction_target_type?: string | null;
  last_activity_kind?: 'edit' | 'reaction' | null;
  last_activity_message_id?: string | null;
  last_activity_preview?: string | null;
  last_activity_at?: string | null;
  unread_count: number;
};

export type RemoteChatListMessageRow = {
  id: string;
  text: string;
  created_at: string;
  edited_at?: string | null;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
  delivered_at?: string | null;
  deleted_for_all?: boolean | null;
  message_type?: string | null;
  is_view_once?: boolean | null;
};

const withTimeoutFallback = async <T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } catch {
    return fallbackValue;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const fetchRemoteChatListMessageMeta = async (messageId: string) => {
  return supabase
    .from('messages')
    .select('id,sender_id,receiver_id,message_type,edited_at,text,is_view_once')
    .eq('id', messageId)
    .maybeSingle();
};

type RemoteChatListReactionPreview = {
  emoji: string;
  userId: string;
  createdAt: Date;
  targetType?: string;
};

const mergePresenceIntoProfileRows = <TRow extends { user_id?: string | null; online?: boolean | null; last_active?: string | null }>(
  rows: TRow[],
  presenceRows: UserPresenceRow[],
): TRow[] => {
  const presenceByUserId = new Map(
    (presenceRows || [])
      .filter((row) => typeof row?.user_id === 'string' && row.user_id.length > 0)
      .map((row) => [row.user_id, row] as const),
  );

  return rows.map((row) => {
    const userId = typeof row?.user_id === 'string' ? row.user_id : null;
    const presence = userId ? presenceByUserId.get(userId) : null;
    if (!presence) return row;
    return {
      ...row,
      online: typeof presence.online === 'boolean' ? presence.online : row.online ?? null,
      last_active: presence.last_active ?? row.last_active ?? null,
    };
  });
};

type FetchRemoteChatListNewMatchesArgs<TNewMatch> = {
  currentProfileId: string;
  userId: string;
  messagedPeerUserIds: Set<string>;
  getLocalThreadIdsWithMessages: (peerUserIds: string[]) => Promise<Set<string>>;
  buildMatch: (args: {
    profileRow: any;
    lastSeen: Date;
  }) => TNewMatch | null;
  getMatchProfileId: (match: TNewMatch) => string;
};

export const fetchRemoteChatListNewMatches = async <TNewMatch>({
  currentProfileId,
  userId,
  messagedPeerUserIds,
  getLocalThreadIdsWithMessages,
  buildMatch,
  getMatchProfileId,
}: FetchRemoteChatListNewMatchesArgs<TNewMatch>): Promise<TNewMatch[]> => {
  const startedAt = Date.now();
  console.log('[chat][new-matches][remote] start', {
    currentProfileId,
    userId,
    messagedPeerCount: messagedPeerUserIds.size,
  });
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id,user1_id,user2_id,status,updated_at')
    .eq('status', 'ACCEPTED')
    .or(`user1_id.eq.${currentProfileId},user2_id.eq.${currentProfileId}`)
    .order('updated_at', { ascending: false })
    .limit(60);

  if (error || !matches) {
    console.log('[chat][new-matches][remote] matches-fetch-error', {
      currentProfileId,
      userId,
      code: error?.code ?? null,
      message: error?.message ?? 'Failed to fetch new matches',
      durationMs: Date.now() - startedAt,
    });
    throw error ?? new Error('Failed to fetch new matches');
  }

  const otherProfileIds = Array.from(
    new Set(
      (matches as any[])
        .map((m) => (m.user1_id === currentProfileId ? m.user2_id : m.user1_id))
        .filter((v: any) => typeof v === 'string' && v.length > 0),
    ),
  );

  if (otherProfileIds.length === 0) {
    console.log('[chat][new-matches][remote] no-accepted-match-peers', {
      currentProfileId,
      userId,
      acceptedMatchCount: matches.length,
      durationMs: Date.now() - startedAt,
    });
    return [];
  }

  const { data: peerProfiles, error: peerProfilesError } = await supabase
    .from('profiles')
    .select('id,user_id,full_name,avatar_url,age,location,city,region,account_state,deleted_at,online,last_active,updated_at')
    .in('id', otherProfileIds);

  if (peerProfilesError || !peerProfiles) {
    console.log('[chat][new-matches][remote] peer-profiles-error', {
      currentProfileId,
      userId,
      peerProfileCount: otherProfileIds.length,
      code: peerProfilesError?.code ?? null,
      message: peerProfilesError?.message ?? 'Failed to fetch peer profiles for new matches',
      durationMs: Date.now() - startedAt,
    });
    throw peerProfilesError ?? new Error('Failed to fetch peer profiles for new matches');
  }

  const mergedPeerProfiles = mergePresenceIntoProfileRows(
    ((peerProfiles as any[] | null) ?? []),
    (await fetchUsersPresence((((peerProfiles as any[] | null) ?? []).map((row) => String(row?.user_id || ''))))).data,
  );

  const peerUserIds = Array.from(
    new Set(
      mergedPeerProfiles
        .map((profileRow) => (typeof profileRow?.user_id === 'string' ? profileRow.user_id : null))
        .filter((peerUserId): peerUserId is string => Boolean(peerUserId && userId)),
    ),
  );
  let cachedMessagedPeerUserIds = new Set<string>();
  let timedOutLocalHistoryChecks = 0;
  const peerUserIdsNeedingLocalHistory = getPeerUserIdsNeedingLocalHistory(
    peerUserIds,
    messagedPeerUserIds,
  );
  if (peerUserIdsNeedingLocalHistory.length > 0) {
    const localCheckStartedAt = Date.now();
    const localThreadIdsWithMessages = await withTimeoutFallback(
      getLocalThreadIdsWithMessages(peerUserIdsNeedingLocalHistory),
      1800,
      new Set<string>(),
    );
    cachedMessagedPeerUserIds = localThreadIdsWithMessages;
    if (cachedMessagedPeerUserIds.size === 0 && Date.now() - localCheckStartedAt >= 1750) {
      timedOutLocalHistoryChecks = peerUserIdsNeedingLocalHistory.length;
      console.log('[chat][new-matches][remote] local-history-batch-timeout', {
        currentProfileId,
        userId,
        peerUserCount: peerUserIdsNeedingLocalHistory.length,
        durationMs: Date.now() - localCheckStartedAt,
      });
    }
  }

  const next: TNewMatch[] = [];
  mergedPeerProfiles.forEach((profileRow) => {
    if (!profileRow?.id || !profileRow?.user_id) return;
    const hasLeft =
      Boolean(profileRow?.deleted_at) || String(profileRow?.account_state || '').toLowerCase() === 'deleted';
    if (hasLeft) return;
    const peerUserId = String(profileRow.user_id);
    if (messagedPeerUserIds.has(peerUserId) || cachedMessagedPeerUserIds.has(peerUserId)) return;
    const lastSeen = new Date(profileRow?.last_active || profileRow?.updated_at || Date.now());
    const mapped = buildMatch({ profileRow, lastSeen });
    if (mapped) {
      next.push(mapped);
    }
  });

  const order = new Map(otherProfileIds.map((id, idx) => [id, idx]));
  next.sort((a, b) => (order.get(getMatchProfileId(a)) ?? 0) - (order.get(getMatchProfileId(b)) ?? 0));
  const result = next.slice(0, 18);
  console.log('[chat][new-matches][remote] success', {
    currentProfileId,
    userId,
    acceptedMatchCount: matches.length,
    peerProfileCount: mergedPeerProfiles.length,
    cachedMessagedPeerCount: cachedMessagedPeerUserIds.size,
    timedOutLocalHistoryChecks,
    nextCount: result.length,
    durationMs: Date.now() - startedAt,
  });
  return result;
};

type FetchRemoteChatListConversationsArgs<TConversation, TFallbackPreview, TCurrentConversation> = {
  currentProfileId?: string | null;
  userId: string;
  currentConversationsByUserId: Map<string, TCurrentConversation>;
  readCachedThreadFallback: (peerUserId: string) => Promise<TFallbackPreview | null>;
  applyChatPrefs: (
    items: TConversation[],
    serverPrefs: Map<string, { muted: boolean; pinned: boolean }>,
  ) => Promise<TConversation[]>;
  buildConversation: (args: {
    otherUserId: string;
    entry?: {
      last: RemoteChatListMessageRow;
      unread: number;
      activity?: {
        kind: 'edit' | 'reaction';
        messageId: string;
        preview: string;
        createdAt: string;
      } | null;
    };
    fallbackPreview?: TFallbackPreview;
    profileRow: any;
    currentConversation?: TCurrentConversation;
    peerVisibility?: { archived?: boolean; hidden?: boolean } | undefined;
    blockStatus: 'blocked_by_me' | 'blocked_me' | null;
    reactionPreview?: RemoteChatListReactionPreview;
    matchedAt: Date;
  }) => TConversation | null;
};

export const fetchRemoteChatListConversations = async <
  TConversation,
  TFallbackPreview,
  TCurrentConversation,
>({
  currentProfileId,
  userId,
  currentConversationsByUserId,
  readCachedThreadFallback,
  applyChatPrefs,
  buildConversation,
}: FetchRemoteChatListConversationsArgs<TConversation, TFallbackPreview, TCurrentConversation>) => {
  const startedAt = Date.now();
  console.log('[chat][conversations][remote] start', {
    currentProfileId: currentProfileId ?? null,
    userId,
    currentConversationCount: currentConversationsByUserId.size,
  });
  const summariesRequest = supabase.rpc('rpc_get_chat_conversation_summaries', {
    p_limit: 200,
    p_offset: 0,
  });
  const acceptedMatchesRequest = currentProfileId
    ? supabase
        .from('matches')
        .select('user1_id,user2_id,updated_at,status')
        .eq('status', 'ACCEPTED')
        .or(`user1_id.eq.${currentProfileId},user2_id.eq.${currentProfileId}`)
        .order('updated_at', { ascending: false })
        .limit(60)
    : Promise.resolve({ data: null, error: null });
  const [
    { data: conversationSummaries, error },
    { data: acceptedMatches, error: acceptedMatchesError },
  ] = await Promise.all([summariesRequest, acceptedMatchesRequest]);

  if (error) {
    console.log('[chat][conversations][remote] summaries-error', {
      currentProfileId: currentProfileId ?? null,
      userId,
      code: error.code ?? null,
      message: error.message,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }

  const summaryRows = ((conversationSummaries || []) as RemoteConversationSummaryRow[]).filter(
    (row) => row?.other_user_id && row?.last_message_id,
  );
  console.log('[chat][conversations][remote] summaries-success', {
    currentProfileId: currentProfileId ?? null,
    userId,
    rawSummaryCount: Array.isArray(conversationSummaries) ? conversationSummaries.length : 0,
    usableSummaryCount: summaryRows.length,
    durationMs: Date.now() - startedAt,
  });
  const syncCursor =
    summaryRows.reduce<string | null>((latest, row) => {
      const value = row.last_message_created_at;
      if (!value) return latest;
      if (!latest) return value;
      return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
    }, null) ?? new Date().toISOString();

  const convoMap = new Map<string, {
    last: RemoteChatListMessageRow;
    unread: number;
    activity?: {
      kind: 'edit' | 'reaction';
      messageId: string;
      preview: string;
      createdAt: string;
    } | null;
  }>();
  const reactionPreviewByUser = new Map<string, RemoteChatListReactionPreview>();
  summaryRows.forEach((row) => {
    const reactionPreview =
      row.last_message_reaction_emoji &&
      row.last_message_reaction_user_id &&
      row.last_message_reaction_created_at
        ? {
            emoji: row.last_message_reaction_emoji,
            userId: row.last_message_reaction_user_id,
            createdAt: new Date(row.last_message_reaction_created_at),
            targetType: row.last_message_reaction_target_type ?? undefined,
          }
        : undefined;
    convoMap.set(row.other_user_id, {
      last: {
        id: row.last_message_id,
        text: row.last_message_text,
        created_at: row.last_message_created_at,
        sender_id: row.last_message_sender_id,
        receiver_id: row.last_message_receiver_id,
        is_read: row.last_message_is_read,
        delivered_at: row.last_message_delivered_at ?? null,
        deleted_for_all: row.last_message_deleted_for_all ?? false,
        message_type: row.last_message_type ?? 'text',
        is_view_once: row.last_message_is_view_once ?? false,
        edited_at: row.last_message_edited_at ?? null,
      },
      unread: Math.max(0, Number(row.unread_count) || 0),
      activity:
        row.last_activity_kind &&
        row.last_activity_message_id &&
        row.last_activity_preview &&
        row.last_activity_at
          ? {
              kind: row.last_activity_kind,
              messageId: row.last_activity_message_id,
              preview: row.last_activity_preview,
              createdAt: row.last_activity_at,
            }
          : null,
    });
    if (reactionPreview) {
      reactionPreviewByUser.set(row.other_user_id, reactionPreview);
    }
  });

  const otherUserIds = summaryRows.map((row) => row.other_user_id);

  const fallbackPreviewByUser = new Map<string, TFallbackPreview>();
  const fallbackMatchedAtByUser = new Map<string, Date>();
  const fallbackProfileByUser = new Map<string, any>();
  const acceptedProfileByUser = new Map<string, any>();

  if (currentProfileId) {
    if (acceptedMatchesError) {
      console.log('[chat][conversations][remote] accepted-matches-fallback-error', {
        currentProfileId,
        userId,
        code: acceptedMatchesError.code ?? null,
        message: acceptedMatchesError.message,
        durationMs: Date.now() - startedAt,
      });
    } else if (acceptedMatches) {
      console.log('[chat][conversations][remote] accepted-matches-fallback-success', {
        currentProfileId,
        userId,
        acceptedMatchCount: acceptedMatches.length,
        durationMs: Date.now() - startedAt,
      });
      const acceptedOtherProfileIds = Array.from(
        new Set(
          (acceptedMatches as any[])
            .map((m) => (m.user1_id === currentProfileId ? m.user2_id : m.user1_id))
            .filter((v: any) => typeof v === 'string' && v.length > 0),
        ),
      );
      const matchedAtByProfileId = new Map<string, Date>();
      (acceptedMatches as any[]).forEach((match) => {
        const peerProfileId = match.user1_id === currentProfileId ? match.user2_id : match.user1_id;
        if (!peerProfileId || matchedAtByProfileId.has(peerProfileId)) return;
        matchedAtByProfileId.set(
          peerProfileId,
          match.updated_at ? new Date(match.updated_at) : new Date(),
        );
      });

      if (acceptedOtherProfileIds.length > 0) {
        const { data: acceptedPeerProfiles, error: acceptedPeerProfilesError } = await supabase
          .from('profiles')
          .select('id,user_id,full_name,avatar_url,age,online,last_active,updated_at,account_state,deleted_at')
          .in('id', acceptedOtherProfileIds);

        if (acceptedPeerProfilesError) {
          console.log('[chat][conversations][remote] accepted-peer-profiles-error', {
            currentProfileId,
            userId,
            peerProfileCount: acceptedOtherProfileIds.length,
            code: acceptedPeerProfilesError.code ?? null,
            message: acceptedPeerProfilesError.message,
            durationMs: Date.now() - startedAt,
          });
        } else {
          console.log('[chat][conversations][remote] accepted-peer-profiles-success', {
            currentProfileId,
            userId,
            peerProfileCount: acceptedPeerProfiles?.length ?? 0,
            durationMs: Date.now() - startedAt,
          });
          const acceptedProfileRows = (acceptedPeerProfiles as any[] | null) ?? [];
          acceptedProfileRows.forEach((profileRow) => {
            if (typeof profileRow?.user_id === 'string' && profileRow.user_id.length > 0) {
              acceptedProfileByUser.set(profileRow.user_id, profileRow);
            }
          });
          await Promise.all(
            acceptedProfileRows.map(async (peerProfile) => {
              if (!peerProfile?.id || !peerProfile?.user_id) return;
              const hasLeft =
                Boolean(peerProfile?.deleted_at) ||
                String(peerProfile?.account_state || '').toLowerCase() === 'deleted';
              if (hasLeft) return;

              const peerUserId = String(peerProfile.user_id);
              if (convoMap.has(peerUserId)) return;

              const cachedPreview = await readCachedThreadFallback(peerUserId);
              if (!cachedPreview) return;

              fallbackPreviewByUser.set(peerUserId, cachedPreview);
              fallbackProfileByUser.set(peerUserId, peerProfile);
              fallbackMatchedAtByUser.set(
                peerUserId,
                matchedAtByProfileId.get(String(peerProfile.id)) ?? new Date(),
              );
            }),
          );
        }
      }
    }
  }

  const combinedOtherUserIds = Array.from(
    new Set([...otherUserIds, ...Array.from(fallbackPreviewByUser.keys())]),
  );

  if (combinedOtherUserIds.length === 0) {
    return {
      conversations: [] as TConversation[],
      syncCursor,
      combinedOtherUserIds,
    };
  }

  const enrichmentPlan = buildChatListEnrichmentPlan(
    combinedOtherUserIds,
    acceptedProfileByUser.keys(),
  );
  const { missingProfileUserIds } = enrichmentPlan;
  const profilesRequest =
    missingProfileUserIds.length > 0
      ? supabase
          .from('profiles')
          .select('user_id,full_name,avatar_url,age,online,last_active,updated_at,account_state,deleted_at')
          .in('user_id', missingProfileUserIds)
      : Promise.resolve({ data: [] as any[], error: null });
  const blocksRequest = supabase
    .from('blocks')
    .select('blocker_id,blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  const presenceRequest = fetchUsersPresence(enrichmentPlan.peerUserIds);
  const peerVisibilityRequest = fetchPeerVisibilityPrefs(userId, enrichmentPlan.peerUserIds);
  const chatPrefsRequest = supabase
    .from('chat_prefs')
    .select('peer_id,muted,pinned')
    .eq('user_id', userId)
    .in('peer_id', enrichmentPlan.peerUserIds);
  const enrichmentStartedAt = Date.now();
  const [
    { data: profilesData, error: profilesError },
    { data: blocksData, error: blocksError },
    presenceResult,
    peerVisibilityPrefs,
    { data: prefsData, error: prefsError },
  ] = await Promise.all([
    profilesRequest,
    blocksRequest,
    presenceRequest,
    peerVisibilityRequest,
    chatPrefsRequest,
  ]);

  if (profilesError) {
    console.log('[chat][conversations][remote] profiles-error', {
      currentProfileId: currentProfileId ?? null,
      userId,
      combinedOtherUserCount: combinedOtherUserIds.length,
      code: profilesError.code ?? null,
      message: profilesError.message,
      durationMs: Date.now() - startedAt,
    });
    throw profilesError;
  }
  console.log('[chat][conversations][remote] profiles-success', {
    currentProfileId: currentProfileId ?? null,
    userId,
    combinedOtherUserCount: combinedOtherUserIds.length,
    fetchedProfileCount: profilesData?.length ?? 0,
    reusedProfileCount: enrichmentPlan.reusedProfileCount,
    parallelEnrichmentDurationMs: Date.now() - enrichmentStartedAt,
    durationMs: Date.now() - startedAt,
  });

  if (blocksError) {
    console.log('[chat][conversations][remote] blocks-error', {
      userId,
      code: blocksError.code ?? null,
      message: blocksError.message,
      durationMs: Date.now() - startedAt,
    });
  }

  const blockStatusByUser = new Map<string, 'blocked_by_me' | 'blocked_me' | null>();
  (blocksData || []).forEach((row: { blocker_id: string; blocked_id: string }) => {
    if (row.blocker_id === userId) {
      blockStatusByUser.set(row.blocked_id, 'blocked_by_me');
    } else if (row.blocked_id === userId) {
      blockStatusByUser.set(row.blocker_id, 'blocked_me');
    }
  });

  const profileRowsByUser = new Map<string, any>(acceptedProfileByUser);
  ((profilesData as any[] | null) ?? []).forEach((profile) => {
    if (typeof profile?.user_id === 'string' && profile.user_id.length > 0) {
      profileRowsByUser.set(profile.user_id, profile);
    }
  });
  const mergedProfilesData = mergePresenceIntoProfileRows(
    Array.from(profileRowsByUser.values()),
    presenceResult.data,
  );
  const profileByUser = new Map(
    mergedProfilesData.map((profile: any) => [profile.user_id, profile]),
  );
  fallbackProfileByUser.forEach((profile, otherUserId) => {
    if (!profileByUser.has(otherUserId)) {
      profileByUser.set(otherUserId, profile);
    }
  });

  console.log('[chat][conversations][remote] peer-visibility-success', {
    userId,
    combinedOtherUserCount: combinedOtherUserIds.length,
    hiddenCount: Object.values(peerVisibilityPrefs).filter((row) => row?.hidden).length,
    archivedCount: Object.values(peerVisibilityPrefs).filter((row) => row?.archived).length,
    durationMs: Date.now() - startedAt,
  });
  const nextConversations = combinedOtherUserIds
    .map((otherUserId) => {
      if (peerVisibilityPrefs[otherUserId]?.hidden) return null;
      return buildConversation({
        otherUserId,
        entry: convoMap.get(otherUserId),
        fallbackPreview: fallbackPreviewByUser.get(otherUserId),
        profileRow: profileByUser.get(otherUserId),
        currentConversation: currentConversationsByUserId.get(otherUserId),
        peerVisibility: peerVisibilityPrefs[otherUserId],
        blockStatus: blockStatusByUser.get(otherUserId) ?? null,
        reactionPreview: reactionPreviewByUser.get(otherUserId),
        matchedAt: fallbackMatchedAtByUser.get(otherUserId) ?? new Date(),
      });
    })
    .filter((conversation): conversation is TConversation => Boolean(conversation));

  const serverPrefs = new Map<string, { muted: boolean; pinned: boolean }>();
  if (prefsError) {
    console.log('[chat][conversations][remote] chat-prefs-error', {
      userId,
      code: prefsError.code ?? null,
      message: prefsError.message,
      durationMs: Date.now() - startedAt,
    });
  }
  (prefsData || []).forEach((row: { peer_id: string; muted: boolean; pinned: boolean }) => {
    if (!row?.peer_id) return;
    serverPrefs.set(row.peer_id, { muted: Boolean(row.muted), pinned: Boolean(row.pinned) });
  });

  const conversations = await applyChatPrefs(nextConversations, serverPrefs);
  console.log('[chat][conversations][remote] success', {
    currentProfileId: currentProfileId ?? null,
    userId,
    combinedOtherUserCount: combinedOtherUserIds.length,
    nextConversationCount: nextConversations.length,
    finalConversationCount: conversations.length,
    serverPrefCount: serverPrefs.size,
    durationMs: Date.now() - startedAt,
  });

  return {
    conversations,
    syncCursor,
    combinedOtherUserIds,
  };
};
