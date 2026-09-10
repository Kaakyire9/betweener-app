import {
  parseStudioOperationalSnapshot,
  type ProgramSourceHealth,
  type ProgramSourceReadiness,
  type ProgramSourceRole,
  type ProgramSourceType,
  type StudioOperationalSnapshot,
  type StudioSessionSummary,
  type StudioTakeCommand,
} from '@betweener/live-program-domain';

import { supabase } from '../lib/supabase.ts';

type CommandResult = {
  applied: boolean;
  reasonCode: string;
  snapshot: StudioOperationalSnapshot;
};

export type StudioMediaAdmission = {
  schemaVersion: 1;
  apiKey: string;
  token: string;
  expiresAt: string;
  sessionId: string;
  sourceKind: 'studio_host' | 'host_camera' | 'host_microphone' | 'screen_share' | 'dj_audio';
  sourceKey: string;
  user: { id: string; name: string };
  call: { provider: 'stream'; type: string; id: string; cid: string };
  capabilities: {
    sendAudio: boolean;
    sendVideo: boolean;
    screenShare: boolean;
    screenShareAudio: boolean;
  };
};

const rpc = async <T>(name: string, parameters: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw new Error(error.message || `${name}_failed`);
  return data as T;
};

const parseCommandResult = (value: unknown): CommandResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('live_studio_command_contract_invalid');
  }
  const candidate = value as Record<string, unknown>;
  const snapshot = parseStudioOperationalSnapshot(candidate.snapshot);
  if (typeof candidate.applied !== 'boolean' || typeof candidate.reasonCode !== 'string'
    || !snapshot) throw new Error('live_studio_command_contract_invalid');
  return { applied: candidate.applied, reasonCode: candidate.reasonCode, snapshot };
};

export const studioApi = {
  async listSessions(): Promise<StudioSessionSummary[]> {
    const value = await rpc<unknown>('rpc_list_live_studio_control_sessions_v1', { p_limit: 60 });
    if (!Array.isArray(value)) throw new Error('live_studio_sessions_contract_invalid');
    return value as StudioSessionSummary[];
  },

  async getSnapshot(sessionId: string): Promise<StudioOperationalSnapshot> {
    const value = await rpc<unknown>('rpc_get_live_studio_snapshot_v1', {
      p_session_id: sessionId,
    });
    const parsed = parseStudioOperationalSnapshot(value);
    if (!parsed) throw new Error('live_studio_snapshot_contract_invalid');
    return parsed;
  },

  async takeControl(input: {
    sessionId: string;
    controllerInstanceId: string;
    expectedControllerGeneration: number;
    expectedProgramVersion: number;
    commandId: string;
  }): Promise<CommandResult> {
    return parseCommandResult(await rpc('rpc_studio_take_live_program_control_v1', {
      p_session_id: input.sessionId,
      p_controller_instance_id: input.controllerInstanceId,
      p_expected_controller_generation: input.expectedControllerGeneration,
      p_expected_program_version: input.expectedProgramVersion,
      p_command_id: input.commandId,
    }));
  },

  async renewControl(input: {
    sessionId: string;
    controllerInstanceId: string;
    expectedControllerGeneration: number;
  }): Promise<{ renewed: boolean; reasonCode: string; leaseExpiresAt?: string }> {
    return rpc('rpc_studio_renew_live_program_control_v1', {
      p_session_id: input.sessionId,
      p_controller_instance_id: input.controllerInstanceId,
      p_expected_controller_generation: input.expectedControllerGeneration,
    });
  },

  async takeProgram(command: StudioTakeCommand): Promise<CommandResult> {
    return parseCommandResult(await rpc('rpc_studio_take_live_program_v1', {
      p_session_id: command.sessionId,
      p_controller_instance_id: command.controllerInstanceId,
      p_expected_controller_generation: command.expectedControllerGeneration,
      p_expected_program_version: command.expectedProgramVersion,
      p_command_id: command.commandId,
      p_scene: command.scene,
      p_target_canvas: command.targetCanvas,
      p_source_assignments: command.sourceAssignments,
      p_transition: command.transition,
    }));
  },

  async resumeOdo(input: {
    sessionId: string;
    controllerInstanceId: string;
    expectedControllerGeneration: number;
    commandId: string;
  }): Promise<CommandResult> {
    return parseCommandResult(await rpc('rpc_studio_resume_live_odo_v1', {
      p_session_id: input.sessionId,
      p_controller_instance_id: input.controllerInstanceId,
      p_expected_controller_generation: input.expectedControllerGeneration,
      p_command_id: input.commandId,
    }));
  },

  async upsertSource(input: {
    sessionId: string;
    sourceKey: string;
    sourceType: ProgramSourceType;
    sourceRole: ProgramSourceRole;
    providerUserId: string;
    hasVideo: boolean;
    hasAudio: boolean;
    readiness: ProgramSourceReadiness;
    health: ProgramSourceHealth;
    muted?: boolean;
    failureReasonCode?: string | null;
  }): Promise<void> {
    await rpc('rpc_studio_upsert_live_program_source_v1', {
      p_session_id: input.sessionId,
      p_source_key: input.sourceKey,
      p_source_type: input.sourceType,
      p_source_role: input.sourceRole,
      p_provider_user_id: input.providerUserId,
      p_has_video: input.hasVideo,
      p_has_audio: input.hasAudio,
      p_readiness: input.readiness,
      p_health: input.health,
      p_muted: input.muted ?? false,
      p_failure_reason_code: input.failureReasonCode ?? null,
    });
  },

  async endSource(sessionId: string, sourceKey: string, reasonCode: string): Promise<void> {
    await rpc('rpc_studio_end_live_program_source_v1', {
      p_session_id: sessionId,
      p_source_key: sourceKey,
      p_reason_code: reasonCode,
    });
  },

  async requestMediaAdmission(
    sessionId: string,
    controllerInstanceId: string,
    sourceKind: StudioMediaAdmission['sourceKind'],
  ): Promise<StudioMediaAdmission> {
    const { data, error } = await supabase.functions.invoke('live-studio-media-token', {
      body: { sessionId, controllerInstanceId, sourceKind },
    });
    if (error) throw new Error(error.message || 'live_studio_media_unavailable');
    if (!data || data.schemaVersion !== 1 || typeof data.token !== 'string') {
      throw new Error('live_studio_media_contract_invalid');
    }
    return data as StudioMediaAdmission;
  },

  async controlMusic(input: {
    sessionId: string;
    action: 'pause' | 'resume' | 'next' | 'set_volume' | 'set_mood' | 'duck' | 'unduck' | 'stop';
    volume?: number;
    mood?: string;
  }): Promise<void> {
    const value = await rpc<Record<string, unknown>>('rpc_host_control_live_music_v1', {
      p_session_id: input.sessionId,
      p_action: input.action,
      p_track_id: null,
      p_playlist_id: null,
      p_volume: input.volume ?? null,
      p_mood: input.mood ?? null,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (value.applied !== true) throw new Error(String(value.reasonCode ?? 'live_music_action_failed'));
  },

  async finishCurrentConnections(sessionId: string): Promise<void> {
    const value = await rpc<Record<string, unknown>>('rpc_finish_live_odo_quick_connect_v1', {
      p_session_id: sessionId,
    });
    if (value.draining !== true) {
      throw new Error(String(value.reasonCode ?? 'quick_connect_finish_failed'));
    }
  },

  async startSession(sessionId: string): Promise<StudioOperationalSnapshot> {
    const targets: Record<string, string | undefined> = {
      scheduled: 'confirmed', waiting_for_quorum: 'confirmed',
      confirmed: 'backstage', backstage: 'live',
    };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const snapshot = await studioApi.getSnapshot(sessionId);
      if (snapshot.session.status === 'live' || snapshot.session.status === 'ending') {
        return snapshot;
      }
      const target = targets[snapshot.session.status];
      if (!target) throw new Error(`live_session_start_unavailable:${snapshot.session.status}`);
      try {
        await rpc('rpc_transition_live_session', {
          p_session_id: sessionId,
          p_expected_version: snapshot.session.version,
          p_target_status: target,
        });
      } catch (failure) {
        if (failure instanceof Error && failure.message.includes('live_session_version_conflict')) {
          continue;
        }
        throw failure;
      }
    }
    throw new Error('live_session_version_conflict');
  },

  async endSession(sessionId: string): Promise<void> {
    const value = await rpc<Record<string, unknown>>('rpc_end_live_session_v1', {
      p_session_id: sessionId,
    });
    if (value.status !== 'ended') throw new Error('live_session_end_incomplete');
  },

  async openAudiencePulse(sessionId: string): Promise<void> {
    await rpc('rpc_open_live_audience_poll', {
      p_session_id: sessionId,
      p_template_key: 'host_question_next_topic',
      p_client_request_id: crypto.randomUUID(),
      p_duration_seconds: 90,
    });
  },

  async wakeShowDirector(sessionId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('live-odo-show-director', {
      body: { sessionId },
    });
    if (error) throw new Error(error.message || 'odo_show_director_unavailable');
    if (!data || data.ok !== true) throw new Error('odo_show_director_unavailable');
  },

  subscribe(sessionId: string, invalidate: () => void): () => void {
    const channel = supabase.channel(`studio-program:${sessionId}:${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_odo_show_updates',
        filter: `session_id=eq.${sessionId}`,
      }, invalidate)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_program_source_updates',
        filter: `session_id=eq.${sessionId}`,
      }, invalidate)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  },
};
