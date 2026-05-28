import { supabase } from "@/lib/supabase";

export const ChatThreadRemoteService = {
  removeReaction(args: { messageId: string; currentUserId: string }) {
    const { messageId, currentUserId } = args;
    return supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', currentUserId);
  },

  upsertReaction(args: { messageId: string; currentUserId: string; emoji: string }) {
    const { messageId, currentUserId, emoji } = args;
    return supabase
      .from('message_reactions')
      .upsert(
        {
          message_id: messageId,
          user_id: currentUserId,
          emoji,
        },
        { onConflict: 'message_id,user_id' },
      );
  },

  markViewOnceSeen(args: { messageId: string; currentUserId: string }) {
    const { messageId, currentUserId } = args;
    return supabase
      .from('message_views')
      .upsert(
        {
          message_id: messageId,
          viewer_id: currentUserId,
        },
        { onConflict: 'message_id,viewer_id' },
      );
  },

  blockUser(args: { blockerId: string; blockedId: string }) {
    const { blockerId, blockedId } = args;
    return supabase
      .from('blocks')
      .insert({ blocker_id: blockerId, blocked_id: blockedId });
  },

  unblockUser(args: { blockerId: string; blockedId: string }) {
    const { blockerId, blockedId } = args;
    return supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);
  },

  fetchHiddenMessages(args: { currentUserId: string; peerUserId: string }) {
    const { currentUserId, peerUserId } = args;
    return supabase
      .from('message_hides')
      .select('message_id')
      .eq('user_id', currentUserId)
      .eq('peer_id', peerUserId);
  },

  fetchChatPrefs(args: { currentUserId: string; peerUserId: string }) {
    const { currentUserId, peerUserId } = args;
    return supabase
      .from('chat_prefs')
      .select('muted,pinned')
      .eq('user_id', currentUserId)
      .eq('peer_id', peerUserId)
      .maybeSingle();
  },

  upsertChatPrefs(args: {
    currentUserId: string;
    peerUserId: string;
    muted: boolean;
    pinned: boolean;
    updatedAtIso: string;
  }) {
    const { currentUserId, peerUserId, muted, pinned, updatedAtIso } = args;
    return supabase
      .from('chat_prefs')
      .upsert(
        {
          user_id: currentUserId,
          peer_id: peerUserId,
          muted,
          pinned,
          updated_at: updatedAtIso,
        },
        { onConflict: 'user_id,peer_id' },
      );
  },

  fetchMessageReactions(args: { messageIds: string[] }) {
    return supabase
      .from('message_reactions')
      .select('message_id,user_id,emoji,created_at')
      .in('message_id', args.messageIds);
  },

  fetchViewOnceStatus(args: { messageIds: string[] }) {
    return supabase
      .from('message_views')
      .select('message_id,viewer_id')
      .in('message_id', args.messageIds);
  },

  fetchBlockStatus(args: { currentUserId: string; peerUserId: string }) {
    const { currentUserId, peerUserId } = args;
    return supabase
      .from('blocks')
      .select('blocker_id,blocked_id')
      .or(
        `and(blocker_id.eq.${currentUserId},blocked_id.eq.${peerUserId}),and(blocker_id.eq.${peerUserId},blocked_id.eq.${currentUserId})`,
      );
  },

  submitReport(args: {
    reportedId: string;
    reason: string;
    evidenceMessageId?: string | null;
    clientEvidence: {
      entry_point: string;
      message_type: string | null;
    };
  }) {
    const { reportedId, reason, evidenceMessageId, clientEvidence } = args;
    return supabase.rpc('rpc_submit_report', {
      p_reported_id: reportedId,
      p_reason: reason,
      p_evidence_message_id: evidenceMessageId ?? null,
      p_client_evidence: clientEvidence,
    });
  },

  sendDatePlan(args: {
    recipientProfileId: string;
    scheduledForIso: string;
    placeName: string;
    placeAddress?: string | null;
    placeSource: string;
    placeBadges: string[];
    placeSummary?: string | null;
    city?: string | null;
    lat: number;
    lng: number;
    note?: string | null;
    venueId?: string | null;
    parentPlanId?: string | null;
    responseKind?: string | null;
    replyToMessageId?: string | null;
  }) {
    return supabase.rpc('rpc_send_date_plan', {
      p_recipient_profile_id: args.recipientProfileId,
      p_scheduled_for: args.scheduledForIso,
      p_place_name: args.placeName,
      p_place_address: args.placeAddress ?? null,
      p_place_source: args.placeSource,
      p_place_badges: args.placeBadges,
      p_place_summary: args.placeSummary ?? null,
      p_city: args.city ?? null,
      p_lat: args.lat,
      p_lng: args.lng,
      p_note: args.note ?? null,
      p_venue_id: args.venueId ?? null,
      p_parent_plan_id: args.parentPlanId ?? null,
      p_response_kind: args.responseKind ?? null,
      p_reply_to_message_id: args.replyToMessageId ?? null,
    });
  },

  acceptDatePlan(args: { planId: string }) {
    return supabase.rpc('rpc_accept_date_plan', {
      p_plan_id: args.planId,
    });
  },

  cancelDatePlan(args: { planId: string }) {
    return supabase.rpc('rpc_cancel_date_plan', {
      p_plan_id: args.planId,
    });
  },

  requestDatePlanConcierge(args: { planId: string; note?: string | null }) {
    return supabase.rpc('rpc_request_date_plan_concierge', {
      p_plan_id: args.planId,
      p_note: args.note ?? null,
    });
  },
};
