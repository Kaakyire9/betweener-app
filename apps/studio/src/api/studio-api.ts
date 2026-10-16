import {
  parseLiveMusicCatalogue,
  parseStudioOperationalSnapshot,
  type LiveMusicCatalogue,
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

export type StudioOperatorRole = 'viewer' | 'producer' | 'moderator' | 'supervisor';
export type StudioRunCue = {
  id: string;
  position: number;
  title: string;
  notes: string | null;
  cueType: 'note' | 'scene' | 'speaker' | 'music' | 'moderation' | 'break' | 'end';
  status: 'pending' | 'ready' | 'live' | 'complete' | 'skipped';
  expectedAt: string | null;
};
export type StudioPrivateMessage = {
  id: number;
  senderUserId: string;
  audience: 'all' | 'producers' | 'moderators';
  body: string;
  createdAt: string;
};
export type StudioOperatorPresence = {
  userId: string;
  controllerInstanceId: string;
  operatorRole: StudioOperatorRole;
  readiness: 'standby' | 'ready' | 'primary' | 'offline';
  lastSeenAt: string;
};
export type StudioOperationalAlert = {
  id: number;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  details: Record<string, unknown>;
  requiresAcknowledgement: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
};
export type StudioOperatorConsole = {
  schemaVersion: 1;
  serverNow: string;
  operatorRole: StudioOperatorRole;
  aal2: boolean;
  cues: StudioRunCue[];
  messages: StudioPrivateMessage[];
  operators: StudioOperatorPresence[];
  alerts: StudioOperationalAlert[];
};

export type StudioPublicationControl = {
  schemaVersion: 1;
  serverNow: string;
  sessionId: string;
  status: string;
  version: number;
  scheduledStart: string | null;
  startWindowClosesAt: string | null;
  broadcastAuthority: 'mobile_host' | 'studio_producer';
  currentAal: 'aal1' | 'aal2';
  canOpenBackstage: boolean;
  canStart: boolean;
  canSetAuthority: boolean;
  requiresStepUp: boolean;
  controlSurface: 'mobile' | 'studio';
};

export type StudioMediaAdmission = {
  schemaVersion: 1;
  apiKey: string;
  token: string;
  expiresAt: string;
  sessionId: string;
  sourceKind: 'studio_host' | 'host_camera' | 'host_microphone' | 'screen_share' | 'dj_audio'
    | 'program_monitor';
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

export type LiveHostingManagement = {
  schemaVersion: 1;
  serverNow: string;
  sessionId: string;
  title: string;
  status: string;
  canDelegateHosts: boolean;
  canExtend: boolean;
  host: {
    userId: string;
    profileId: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
    delegated: boolean;
  };
  schedule: {
    scheduledStart: string | null;
    scheduledEnd: string | null;
    runtimeEndAt: string | null;
    durationMinutes: number;
    endPolicy: 'scheduled' | 'manual';
    lastExtendedAt: string | null;
  };
  traffic: { audienceNow: number; totalAttendees: number; reactions: number };
};

const parseHostingManagement = (value: unknown): LiveHostingManagement => {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (candidate?.schemaVersion !== 1 || typeof candidate.sessionId !== 'string'
    || !candidate.host || !candidate.schedule || !candidate.traffic) {
    throw new Error('live_hosting_management_contract_invalid');
  }
  return candidate as LiveHostingManagement;
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

const parseOperatorConsole = (value: unknown): StudioOperatorConsole => {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (candidate?.schemaVersion !== 1 || typeof candidate.serverNow !== 'string'
    || !['viewer', 'producer', 'moderator', 'supervisor'].includes(String(candidate.operatorRole))
    || typeof candidate.aal2 !== 'boolean' || !Array.isArray(candidate.cues)
    || !Array.isArray(candidate.messages) || !Array.isArray(candidate.operators)
    || !Array.isArray(candidate.alerts)) {
    throw new Error('live_studio_operator_console_contract_invalid');
  }
  return candidate as unknown as StudioOperatorConsole;
};

export const studioApi = {
  async getHostingManagement(sessionId: string): Promise<LiveHostingManagement> {
    return parseHostingManagement(await rpc('rpc_get_live_hosting_management_v1', {
      p_session_id: sessionId,
    }));
  },

  async delegateHost(sessionId: string, username: string): Promise<LiveHostingManagement> {
    return parseHostingManagement(await rpc('rpc_admin_delegate_live_host_v1', {
      p_session_id: sessionId,
      p_username: username,
    }));
  },

  async revokeHost(sessionId: string): Promise<LiveHostingManagement> {
    return parseHostingManagement(await rpc('rpc_admin_revoke_live_host_v1', {
      p_session_id: sessionId,
    }));
  },

  async extendRuntime(
    sessionId: string,
    options: { minutes?: number; keepOpen?: boolean },
  ): Promise<LiveHostingManagement> {
    return parseHostingManagement(await rpc('rpc_extend_live_session_v1', {
      p_session_id: sessionId,
      p_extension_minutes: options.minutes ?? null,
      p_keep_open: options.keepOpen === true,
    }));
  },
  async getMusicCatalogue(sessionId: string): Promise<LiveMusicCatalogue> {
    const parsed = parseLiveMusicCatalogue(await rpc(
      'rpc_get_live_music_catalogue_v1',
      { p_session_id: sessionId },
    ));
    if (!parsed) throw new Error('live_music_catalogue_invalid');
    return parsed;
  },

  async uploadMusicTrack(input: {
    file: File;
    title: string;
    artist: string;
    mood: string;
    durationSeconds: number;
    licenseReference: string;
    containsVocals: boolean;
  }): Promise<{ trackId: string }> {
    const form = new FormData();
    form.set('file', input.file);
    form.set('title', input.title);
    form.set('artist', input.artist);
    form.set('mood', input.mood);
    form.set('durationSeconds', String(input.durationSeconds));
    form.set('licenseReference', input.licenseReference);
    form.set('containsVocals', String(input.containsVocals));
    const { data, error } = await supabase.functions.invoke('live-music-library-admin', {
      body: form,
    });
    if (error) throw new Error(error.message || 'live_music_upload_failed');
    if (!data || data.ok !== true || typeof data.trackId !== 'string') {
      throw new Error(String(data?.error ?? 'live_music_upload_invalid'));
    }
    return { trackId: data.trackId };
  },

  async listSessions(): Promise<StudioSessionSummary[]> {
    const value = await rpc<unknown>('rpc_list_live_studio_control_sessions_v1', { p_limit: 60 });
    if (!Array.isArray(value)) throw new Error('live_studio_sessions_contract_invalid');
    return value as StudioSessionSummary[];
  },

  async getSnapshot(sessionId: string): Promise<StudioOperationalSnapshot> {
    const [value, repeat] = await Promise.all([
      rpc<unknown>('rpc_get_live_studio_snapshot_v1', { p_session_id: sessionId }),
      rpc<{ repeatMode: unknown }>('rpc_get_live_music_repeat_mode_v1', {
        p_session_id: sessionId,
      }),
    ]);
    const candidate = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
    const music = candidate?.music && typeof candidate.music === 'object'
      && !Array.isArray(candidate.music)
      ? candidate.music as Record<string, unknown>
      : null;
    const hydrated = candidate && music
      ? { ...candidate, music: { ...music, repeatMode: repeat.repeatMode } }
      : value;
    const parsed = parseStudioOperationalSnapshot(hydrated);
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
    return parseCommandResult(await rpc('rpc_studio_take_live_program_v2', {
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
    action: 'play_track' | 'play_playlist' | 'pause' | 'resume' | 'next' | 'set_volume' | 'set_mood'
      | 'duck' | 'unduck' | 'stop' | 'repeat_off' | 'repeat_one' | 'repeat_all';
    trackId?: string;
    playlistId?: string;
    volume?: number;
    mood?: string;
  }): Promise<void> {
    const value = await rpc<Record<string, unknown>>('rpc_host_control_live_music_v1', {
      p_session_id: input.sessionId,
      p_action: input.action,
      p_track_id: input.trackId ?? null,
      p_playlist_id: input.playlistId ?? null,
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
    let control = await this.getPublicationControl(sessionId);
    if (control.broadcastAuthority !== 'studio_producer') {
      throw new Error('This Live is assigned to the mobile host. Switch it to Studio control first.');
    }
    if (!['backstage', 'live', 'ending'].includes(control.status)) {
      control = await rpc<StudioPublicationControl>('rpc_open_live_backstage_v1', {
        p_session_id: sessionId,
        p_expected_version: control.version,
        p_command_id: crypto.randomUUID(),
      });
    }
    await rpc<StudioPublicationControl>('rpc_start_live_session_v2', {
      p_session_id: sessionId,
      p_expected_version: control.version,
      p_command_id: crypto.randomUUID(),
    });
    const value = await rpc<unknown>('rpc_get_live_studio_snapshot_v1', { p_session_id: sessionId });
    const parsed = parseStudioOperationalSnapshot(value);
    if (!parsed) throw new Error('live_studio_snapshot_contract_invalid');
    return parsed;
  },

  async endSession(sessionId: string): Promise<void> {
    const control = await this.getPublicationControl(sessionId);
    const value = await rpc<StudioPublicationControl>('rpc_end_live_session_v2', {
      p_session_id: sessionId,
      p_expected_version: control.version,
      p_command_id: crypto.randomUUID(),
    });
    if (value.status !== 'ended') throw new Error('live_session_end_incomplete');
  },

  async getPublicationControl(sessionId: string): Promise<StudioPublicationControl> {
    return rpc<StudioPublicationControl>('rpc_get_live_publication_control_v1', {
      p_session_id: sessionId,
    });
  },

  async setBroadcastAuthority(
    sessionId: string,
    expectedVersion: number,
    authority: StudioPublicationControl['broadcastAuthority'],
  ): Promise<StudioPublicationControl> {
    return rpc<StudioPublicationControl>('rpc_set_live_broadcast_authority_v1', {
      p_session_id: sessionId,
      p_expected_version: expectedVersion,
      p_broadcast_authority: authority,
      p_command_id: crypto.randomUUID(),
    });
  },

  async getOperatorConsole(sessionId: string): Promise<StudioOperatorConsole> {
    return parseOperatorConsole(await rpc('rpc_get_live_studio_operator_console_v1', {
      p_session_id: sessionId,
    }));
  },

  async heartbeatOperator(
    sessionId: string,
    controllerInstanceId: string,
    readiness: StudioOperatorPresence['readiness'],
  ): Promise<void> {
    await rpc('rpc_studio_operator_heartbeat_v1', {
      p_session_id: sessionId,
      p_controller_instance_id: controllerInstanceId,
      p_readiness: readiness,
    });
  },

  async upsertRunCue(sessionId: string, cue: Omit<StudioRunCue, 'id'> & { id?: string }): Promise<void> {
    await rpc('rpc_studio_upsert_run_cue_v1', {
      p_session_id: sessionId,
      p_cue_id: cue.id ?? null,
      p_position: cue.position,
      p_title: cue.title,
      p_notes: cue.notes,
      p_cue_type: cue.cueType,
      p_status: cue.status,
      p_expected_at: cue.expectedAt,
    });
  },

  async postPrivateMessage(
    sessionId: string,
    audience: StudioPrivateMessage['audience'],
    body: string,
  ): Promise<void> {
    await rpc('rpc_studio_post_private_message_v1', {
      p_session_id: sessionId, p_audience: audience, p_body: body,
    });
  },

  async recordOperationalEvent(
    sessionId: string,
    eventType: string,
    severity: StudioOperationalAlert['severity'],
    details: Record<string, unknown> = {},
    requiresAcknowledgement = false,
  ): Promise<void> {
    await rpc('rpc_studio_record_operational_event_v1', {
      p_session_id: sessionId, p_event_type: eventType, p_severity: severity,
      p_details: details, p_requires_acknowledgement: requiresAcknowledgement,
    });
  },

  async acknowledgeAlert(sessionId: string, eventId: number): Promise<void> {
    await rpc('rpc_studio_acknowledge_alert_v1', {
      p_session_id: sessionId, p_event_id: eventId,
    });
  },

  async emergencySafeScene(sessionId: string, reason: string): Promise<CommandResult> {
    return parseCommandResult(await rpc('rpc_studio_emergency_safe_scene_v1', {
      p_session_id: sessionId, p_reason: reason,
    }));
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
