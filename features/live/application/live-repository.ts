import * as Crypto from 'expo-crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { readFunctionErrorCode } from '../media/live-function-error.ts';
import type { LiveParticipantArrivalEvent } from './live-participant-arrivals.ts';
import type { LiveAudiencePoll, LiveChemistrySnapshot, LiveComment, LiveEventMediaInput, LiveHostedMatchingSnapshot, LiveJoinNotice, LivePrivateSpark, LivePrivateSparkExitDecision, LiveQuickConnectDecision, LiveQuickConnectHostAction, LiveQuickConnectHostSnapshot, LiveQuickConnectCreatorMode, LiveQuickConnectPoolSnapshot, LiveQuickConnectRoundSeconds, LiveQuickConnectSnapshot, LiveReactionKind, LiveRoomPulseSnapshot, LiveSessionSnapshot, LiveSessionSummary, ScheduleLiveSessionInput } from './live-models.ts';
import {
  parseLiveAudiencePoll,
  parseLiveComment,
  parseLiveChemistrySnapshot,
  parseLiveHostedMatchingSnapshot,
  parseLivePrivateSpark,
  parseLiveQuickConnectSnapshot,
  parseLiveQuickConnectHostSnapshot,
  parseLiveQuickConnectPoolSnapshot,
  parseLiveRoomPulseSnapshot,
  parseLiveSessionSnapshot,
  parseLiveSessionSummary,
} from './live-parsers.ts';

type RpcResult = Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
type LiveRpc = (name: string, args?: Record<string, unknown>) => RpcResult;

const rpc = supabase.rpc.bind(supabase) as unknown as LiveRpc;

export type LiveSessionRealtimeEvent = 'structure' | 'pulse';
export type LiveSessionRealtimeStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

const invoke = async (name: string, args?: Record<string, unknown>): Promise<unknown> => {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message || error.code || `live_rpc_failed:${name}`);
  return data;
};

export const liveRepository = {
  async listSessions(limit = 20): Promise<LiveSessionSummary[]> {
    const value = await invoke('rpc_list_live_studio_sessions', { p_limit: limit, p_before: null });
    return Array.isArray(value) ? value.map(parseLiveSessionSummary) : [];
  },

  async getSnapshot(sessionId: string): Promise<LiveSessionSnapshot> {
    return parseLiveSessionSnapshot(
      await invoke('rpc_get_live_session_snapshot', { p_session_id: sessionId }),
    );
  },

  async getRoomPulse(sessionId: string): Promise<LiveRoomPulseSnapshot> {
    return parseLiveRoomPulseSnapshot(
      await invoke('rpc_get_live_room_pulse', { p_session_id: sessionId }),
    );
  },

  async canSchedule(): Promise<boolean> {
    return await invoke('rpc_can_schedule_live_session') === true;
  },

  async schedule(input: ScheduleLiveSessionInput): Promise<string> {
    const value = await invoke('rpc_schedule_live_session_v2', {
      p_title: input.title,
      p_description: input.description,
      p_scheduled_start: input.scheduledStart,
      p_format: input.format ?? 'hosted_match_night',
      p_chemistry_first_enabled: input.chemistryFirstEnabled ?? false,
    });
    if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') {
      throw new Error('live_schedule_result_invalid');
    }
    return value.id;
  },

  async rsvp(sessionId: string, attending: boolean, openToIntroductions = false): Promise<void> {
    await invoke('rpc_rsvp_live_session', {
      p_session_id: sessionId,
      p_attending: attending,
      p_open_to_introductions: openToIntroductions,
    });
  },

  async updateEventMedia(sessionId: string, media: LiveEventMediaInput): Promise<void> {
    await invoke('rpc_update_live_event_media', {
      p_session_id: sessionId,
      p_poster_path: media.posterPath,
      p_teaser_video_path: media.teaserVideoPath,
      p_teaser_duration_seconds: media.teaserDurationSeconds,
    });
  },

  async join(sessionId: string): Promise<void> {
    await invoke('rpc_join_live_session', { p_session_id: sessionId });
  },

  async leave(sessionId: string): Promise<void> {
    await invoke('rpc_leave_live_session', { p_session_id: sessionId });
  },

  async leaveStage(sessionId: string): Promise<void> {
    await invoke('rpc_leave_live_stage', { p_session_id: sessionId });
  },

  async getMemberSummary(sessionId: string, profileId: string): Promise<LiveJoinNotice> {
    const value = await invoke('rpc_get_live_member_summary', {
      p_session_id: sessionId,
      p_profile_id: profileId,
    });
    if (!value || typeof value !== 'object') throw new Error('live_member_summary_invalid');
    const row = value as Record<string, unknown>;
    if (typeof row.userId !== 'string' || typeof row.profileId !== 'string') {
      throw new Error('live_member_summary_invalid');
    }
    return {
      userId: row.userId,
      profileId: row.profileId,
      fullName: typeof row.fullName === 'string' ? row.fullName : null,
      avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : null,
      joinedAt: typeof row.joinedAt === 'string' ? row.joinedAt : new Date().toISOString(),
      participantState: typeof row.participantState === 'string' ? row.participantState : 'unknown',
    };
  },

  async heartbeat(sessionId: string): Promise<void> {
    await invoke('rpc_heartbeat_live_session', { p_session_id: sessionId });
  },

  async getHostedMatching(sessionId: string): Promise<LiveHostedMatchingSnapshot> {
    const [hosted, privateSpark] = await Promise.all([
      invoke('live_hosted_matching_snapshot', { p_session_id: sessionId }),
      invoke('rpc_get_live_private_spark_snapshot', { p_session_id: sessionId }),
    ]);
    const snapshot = parseLiveHostedMatchingSnapshot(hosted);
    return {
      ...snapshot,
      privateSpark: privateSpark == null ? null : parseLivePrivateSpark(privateSpark),
    };
  },

  async getPrivateSpark(privateSparkId: string): Promise<LivePrivateSpark> {
    return parseLivePrivateSpark(await invoke('rpc_get_live_private_spark', {
      p_spark_id: privateSparkId,
    }));
  },

  async respondPrivateSpark(privateSparkId: string, accept: boolean): Promise<LivePrivateSpark> {
    return parseLivePrivateSpark(await invoke('rpc_respond_live_private_spark', {
      p_private_spark_id: privateSparkId,
      p_accept: accept,
    }));
  },

  async endPrivateSpark(privateSparkId: string, reason = 'left'): Promise<LivePrivateSpark> {
    const { data, error } = await supabase.functions.invoke('live-private-spark-control', {
      body: { privateSparkId, reason },
    });
    if (error) throw new Error(await readFunctionErrorCode(error));
    if (!data || typeof data !== 'object' || !('spark' in data)) {
      throw new Error('live_private_spark_end_result_invalid');
    }
    return parseLivePrivateSpark(data.spark);
  },

  async submitPrivateSparkExit(
    privateSparkId: string,
    decision: LivePrivateSparkExitDecision,
  ): Promise<LivePrivateSpark> {
    return parseLivePrivateSpark(await invoke('rpc_submit_live_private_spark_exit', {
      p_private_spark_id: privateSparkId,
      p_decision: decision,
    }));
  },

  async getPrivateSparkChemistry(privateSparkId: string): Promise<LiveChemistrySnapshot | null> {
    const value = await invoke('rpc_get_live_chemistry_for_private_spark', {
      p_private_spark_id: privateSparkId,
    });
    return value == null ? null : parseLiveChemistrySnapshot(value);
  },

  async getQuickConnectChemistry(pairingId: string): Promise<LiveChemistrySnapshot | null> {
    const value = await invoke('rpc_get_live_chemistry_for_quick_connect', {
      p_pairing_id: pairingId,
    });
    return value == null ? null : parseLiveChemistrySnapshot(value);
  },

  async offerChemistryReveal(conversationId: string): Promise<LiveChemistrySnapshot> {
    return parseLiveChemistrySnapshot(await invoke('rpc_offer_live_chemistry_reveal', {
      p_conversation_id: conversationId,
    }));
  },

  async markChemistryReady(conversationId: string): Promise<LiveChemistrySnapshot> {
    return parseLiveChemistrySnapshot(await invoke('rpc_set_live_chemistry_ready', {
      p_conversation_id: conversationId,
    }));
  },

  async joinQuickConnect(sessionId: string): Promise<LiveQuickConnectSnapshot> {
    return parseLiveQuickConnectSnapshot(await invoke('rpc_join_live_quick_connect', {
      p_session_id: sessionId,
    }));
  },

  async getQuickConnect(sessionId: string): Promise<LiveQuickConnectSnapshot> {
    return parseLiveQuickConnectSnapshot(await invoke('rpc_get_live_quick_connect', {
      p_session_id: sessionId,
    }));
  },

  async getQuickConnectPool(sessionId: string): Promise<LiveQuickConnectPoolSnapshot> {
    return parseLiveQuickConnectPoolSnapshot(await invoke('rpc_get_live_quick_connect_pool', {
      p_session_id: sessionId,
    }));
  },

  async signalQuickConnectInterest(sessionId: string, targetProfileId: string): Promise<void> {
    await invoke('rpc_signal_live_quick_connect_interest', {
      p_session_id: sessionId,
      p_target_profile_id: targetProfileId,
    });
  },

  async getQuickConnectHostControl(sessionId: string): Promise<LiveQuickConnectHostSnapshot> {
    return parseLiveQuickConnectHostSnapshot(await invoke('rpc_get_live_quick_connect_host_control', {
      p_session_id: sessionId,
    }));
  },

  async configureQuickConnectHostControl(
    sessionId: string,
    roundSeconds: LiveQuickConnectRoundSeconds,
    creatorMode: LiveQuickConnectCreatorMode,
  ): Promise<LiveQuickConnectHostSnapshot> {
    return parseLiveQuickConnectHostSnapshot(await invoke('rpc_configure_live_quick_connect', {
      p_session_id: sessionId,
      p_round_seconds: roundSeconds,
      p_creator_mode: creatorMode,
    }));
  },

  async controlQuickConnect(
    sessionId: string,
    action: LiveQuickConnectHostAction,
  ): Promise<LiveQuickConnectHostSnapshot> {
    return parseLiveQuickConnectHostSnapshot(await invoke('rpc_control_live_quick_connect', {
      p_session_id: sessionId,
      p_action: action,
    }));
  },

  async heartbeatQuickConnect(sessionId: string, connected: boolean): Promise<LiveQuickConnectSnapshot> {
    return parseLiveQuickConnectSnapshot(await invoke('rpc_heartbeat_live_quick_connect', {
      p_session_id: sessionId,
      p_connected: connected,
    }));
  },

  async decideQuickConnect(
    pairingId: string,
    decision: LiveQuickConnectDecision,
  ): Promise<LiveQuickConnectSnapshot> {
    return parseLiveQuickConnectSnapshot(await invoke('rpc_submit_live_quick_connect_decision', {
      p_pairing_id: pairingId,
      p_decision: decision,
    }));
  },

  async leaveQuickConnect(sessionId: string): Promise<void> {
    await invoke('rpc_leave_live_quick_connect', { p_session_id: sessionId });
  },

  async setIntroductionAvailability(sessionId: string, open: boolean): Promise<void> {
    await invoke('rpc_set_live_introduction_availability', {
      p_session_id: sessionId,
      p_open: open,
    });
  },

  async createMatchRound(
    sessionId: string,
    participantAUserId: string,
    participantBUserId: string,
    clientProposalId: string,
  ): Promise<LiveHostedMatchingSnapshot> {
    return parseLiveHostedMatchingSnapshot(await invoke('rpc_create_live_match_round', {
      p_session_id: sessionId,
      p_participant_a_user_id: participantAUserId,
      p_participant_b_user_id: participantBUserId,
      p_client_proposal_id: clientProposalId,
    }));
  },

  async respondMatchRound(matchRoundId: string, accept: boolean): Promise<LiveHostedMatchingSnapshot> {
    return parseLiveHostedMatchingSnapshot(await invoke('rpc_respond_live_match_round', {
      p_match_round_id: matchRoundId,
      p_accept: accept,
    }));
  },

  async transitionMatchRound(
    matchRoundId: string,
    targetState: 'public_introduction' | 'completed' | 'cancelled',
    sessionId?: string,
  ): Promise<LiveHostedMatchingSnapshot> {
    const transitioned = parseLiveHostedMatchingSnapshot(await invoke('rpc_transition_live_match_round', {
      p_match_round_id: matchRoundId,
      p_target_state: targetState,
    }));
    // The match-round RPC deliberately returns the public hosted-matching
    // projection. Private Spark consent is served by a separate, audience-
    // scoped projection so no consent data can leak through the host RPC.
    // Re-read the composed snapshot after completion so the offer appears
    // immediately instead of waiting for a realtime invalidation round-trip.
    if (targetState === 'completed') {
      if (!sessionId) throw new Error('live_session_id_required');
      return this.getHostedMatching(sessionId);
    }
    return transitioned;
  },

  async requestSeat(sessionId: string): Promise<void> {
    await invoke('rpc_request_live_seat', { p_session_id: sessionId });
  },

  async setStageRequestsOpen(sessionId: string, open: boolean): Promise<void> {
    await invoke('rpc_set_live_stage_requests_open', {
      p_session_id: sessionId,
      p_open: open,
    });
  },

  async setStageRequestCapacity(sessionId: string, capacity: number): Promise<void> {
    await invoke('rpc_set_live_stage_request_capacity', {
      p_session_id: sessionId,
      p_capacity: capacity,
    });
  },

  async withdrawSeatRequest(sessionId: string): Promise<void> {
    await invoke('rpc_withdraw_live_seat_request', { p_session_id: sessionId });
  },

  async resolveSeat(requestId: string, approve: boolean): Promise<void> {
    await invoke('rpc_resolve_live_seat_request', {
      p_request_id: requestId,
      p_approve: approve,
    });
  },

  async setStageParticipant(sessionId: string, targetUserId: string, onStage: boolean): Promise<void> {
    await invoke('rpc_set_live_stage_participant', {
      p_session_id: sessionId,
      p_target_user_id: targetUserId,
      p_on_stage: onStage,
    });
  },

  async createComment(sessionId: string, clientCommentId: string, body: string): Promise<LiveComment> {
    return parseLiveComment(await invoke('rpc_create_live_comment', {
      p_session_id: sessionId,
      p_client_comment_id: clientCommentId,
      p_body: body,
    }));
  },

  async listComments(sessionId: string, before: string | null, limit = 40): Promise<LiveComment[]> {
    const value = await invoke('rpc_list_live_comments', {
      p_session_id: sessionId,
      p_limit: limit,
      p_before: before,
    });
    return Array.isArray(value) ? value.map(parseLiveComment) : [];
  },

  async moderateComment(commentId: string): Promise<void> {
    await invoke('rpc_moderate_live_comment', { p_comment_id: commentId });
  },

  async reportComment(
    sessionId: string,
    comment: Pick<LiveComment, 'id' | 'userId'>,
    reason: 'harassment' | 'hate' | 'sexual_content' | 'spam' | 'impersonation' | 'unsafe_behaviour' | 'other' = 'other',
  ): Promise<void> {
    await invoke('rpc_report_live_content', {
      p_session_id: sessionId,
      p_client_report_id: Crypto.randomUUID(),
      p_reason: reason,
      p_details: null,
      p_target_user_id: comment.userId,
      p_target_comment_id: comment.id,
    });
  },

  async createReaction(sessionId: string, reaction: LiveReactionKind): Promise<void> {
    await invoke('rpc_create_live_reaction', {
      p_session_id: sessionId,
      p_client_event_id: Crypto.randomUUID(),
      p_reaction: reaction,
    });
  },

  async openAudiencePoll(
    sessionId: string,
    templateKey: string,
    durationSeconds = 90,
  ): Promise<LiveAudiencePoll> {
    return parseLiveAudiencePoll(await invoke('rpc_open_live_audience_poll', {
      p_session_id: sessionId,
      p_template_key: templateKey,
      p_client_request_id: Crypto.randomUUID(),
      p_duration_seconds: durationSeconds,
    }));
  },

  async voteAudiencePoll(pollId: string, optionId: string): Promise<LiveAudiencePoll> {
    return parseLiveAudiencePoll(await invoke('rpc_vote_live_audience_poll', {
      p_poll_id: pollId,
      p_option_id: optionId,
      p_client_vote_id: Crypto.randomUUID(),
    }));
  },

  async closeAudiencePoll(pollId: string): Promise<LiveAudiencePoll> {
    return parseLiveAudiencePoll(await invoke('rpc_close_live_audience_poll', {
      p_poll_id: pollId,
    }));
  },

  async moderateParticipant(
    sessionId: string,
    targetUserId: string,
    action: 'mute' | 'unmute' | 'remove' | 'suspend',
    reason?: string,
  ): Promise<void> {
    const { error } = await supabase.functions.invoke('live-control', {
      body: {
        sessionId,
        targetUserId,
        action,
        clientActionId: Crypto.randomUUID(),
        reason: reason ?? null,
      },
    });
    if (error) throw error;
  },

  async transitionSession(sessionId: string, expectedVersion: number, targetStatus: string): Promise<void> {
    await invoke('rpc_transition_live_session', {
      p_session_id: sessionId,
      p_expected_version: expectedVersion,
      p_target_status: targetStatus,
    });
  },

  subscribe(
    sessionId: string,
    onEvent: (event: LiveSessionRealtimeEvent) => void,
    onStatus?: (status: LiveSessionRealtimeStatus) => void,
    onParticipantJoined?: (event: LiveParticipantArrivalEvent) => void,
  ): () => void {
    const channel: RealtimeChannel = supabase.channel(`live-session:${sessionId}:${Crypto.randomUUID()}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_participants', filter: `session_id=eq.${sessionId}` },
      () => onEvent('structure'),
    );
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'live_participant_arrival_updates',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        if (!onParticipantJoined || payload.eventType === 'DELETE') return;
        const next = payload.new as Record<string, unknown>;
        if (
          typeof next.profile_id === 'string'
          && typeof next.arrived_at === 'string'
          && typeof next.version === 'number'
        ) {
          onParticipantJoined({
            profileId: next.profile_id,
            arrivedAt: next.arrived_at,
            version: next.version,
          });
        }
      },
    );
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_seat_requests', filter: `session_id=eq.${sessionId}` },
      () => onEvent('structure'),
    );
    // Session authority is invalidated through a content-free, audience-
    // scoped projection. Raw live_sessions rows remain server-owned and are
    // never exposed merely to make Realtime convenient.
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'live_session_structure_updates',
        filter: `session_id=eq.${sessionId}`,
      },
      () => onEvent('structure'),
    );
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_comments', filter: `session_id=eq.${sessionId}` },
      () => onEvent('pulse'),
    );
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'live_audience_poll_updates',
        filter: `session_id=eq.${sessionId}`,
      },
      () => onEvent('pulse'),
    );
    channel.subscribe((status) => onStatus?.(status as LiveSessionRealtimeStatus));
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  subscribeHostedMatching(sessionId: string, onChange: () => void): () => void {
    const channel: RealtimeChannel = supabase.channel(
      `live-hosted-matching:${sessionId}:${Crypto.randomUUID()}`,
    );
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_match_round_updates', filter: `session_id=eq.${sessionId}` },
      onChange,
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  subscribeChemistry(conversationId: string, onChange: () => void): () => void {
    const channel = supabase.channel(`live-chemistry:${conversationId}:${Crypto.randomUUID()}`);
    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'live_chemistry_updates',
      filter: `conversation_id=eq.${conversationId}`,
    }, onChange);
    channel.subscribe((status) => {
      // Reconcile after subscribe so an offer committed between the initial
      // fetch and subscription cannot be missed.
      if (status === 'SUBSCRIBED') onChange();
    });
    return () => { void supabase.removeChannel(channel); };
  },

  subscribeQuickConnect(sessionId: string, onChange: () => void): () => void {
    const channel = supabase.channel(`live-quick-connect:${sessionId}:${Crypto.randomUUID()}`);
    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'live_quick_connect_updates',
      filter: `session_id=eq.${sessionId}`,
    }, onChange);
    channel.subscribe((status) => {
      // Close the fetch/subscribe race: the host may open rotations after the
      // first join rejection but before realtime is fully attached.
      if (status === 'SUBSCRIBED') onChange();
    });
    return () => { void supabase.removeChannel(channel); };
  },

};
