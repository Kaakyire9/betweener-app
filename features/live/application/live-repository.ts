import * as Crypto from 'expo-crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { LiveComment, LiveReactionKind, LiveSessionSnapshot, LiveSessionSummary, ScheduleLiveSessionInput } from './live-models.ts';
import {
  parseLiveComment,
  parseLiveSessionSnapshot,
  parseLiveSessionSummary,
} from './live-parsers.ts';

type RpcResult = Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
type LiveRpc = (name: string, args?: Record<string, unknown>) => RpcResult;

const rpc = supabase.rpc.bind(supabase) as unknown as LiveRpc;

const invoke = async (name: string, args?: Record<string, unknown>): Promise<unknown> => {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message || error.code || `live_rpc_failed:${name}`);
  return data;
};

export const liveRepository = {
  async listSessions(limit = 20): Promise<LiveSessionSummary[]> {
    const value = await invoke('rpc_list_live_sessions', { p_limit: limit, p_before: null });
    return Array.isArray(value) ? value.map(parseLiveSessionSummary) : [];
  },

  async getSnapshot(sessionId: string): Promise<LiveSessionSnapshot> {
    return parseLiveSessionSnapshot(
      await invoke('rpc_get_live_session_snapshot', { p_session_id: sessionId }),
    );
  },

  async canSchedule(): Promise<boolean> {
    return await invoke('rpc_can_schedule_live_session') === true;
  },

  async schedule(input: ScheduleLiveSessionInput): Promise<string> {
    const value = await invoke('rpc_schedule_live_session', {
      p_title: input.title,
      p_description: input.description,
      p_scheduled_start: input.scheduledStart,
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

  async join(sessionId: string): Promise<void> {
    await invoke('rpc_join_live_session', { p_session_id: sessionId });
  },

  async leave(sessionId: string): Promise<void> {
    await invoke('rpc_leave_live_session', { p_session_id: sessionId });
  },

  async heartbeat(sessionId: string): Promise<void> {
    await invoke('rpc_heartbeat_live_session', { p_session_id: sessionId });
  },

  async requestSeat(sessionId: string): Promise<void> {
    await invoke('rpc_request_live_seat', { p_session_id: sessionId });
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

  subscribe(sessionId: string, onChange: () => void): () => void {
    const channel: RealtimeChannel = supabase.channel(`live-session:${sessionId}:${Crypto.randomUUID()}`);
    const tables = ['live_participants', 'live_seat_requests', 'live_comments', 'live_reactions'];
    tables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `session_id=eq.${sessionId}` },
        onChange,
      );
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
