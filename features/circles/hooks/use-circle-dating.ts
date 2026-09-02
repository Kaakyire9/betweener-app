import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useRef, useState } from 'react';

export type CircleDatingPreference = {
  isMember: boolean;
  optedIn: boolean;
  openToIntents: boolean;
};

export type CircleDatingCandidate = {
  profileId: string;
  fullName: string;
  age: number | null;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  lookingFor: string | null;
  verificationLevel: number;
  reasons: string[];
};

export type CircleDatingConnection = {
  requestId: string;
  peerProfileId: string;
  fullName: string;
  age: number | null;
  avatarUrl: string | null;
  direction: 'sent' | 'received';
  intentType: string;
  intentStatus: 'pending' | 'accepted' | 'matched';
  matchId: string | null;
  occurredAt: string;
};

type PreferenceRow = {
  is_member?: boolean;
  opted_in?: boolean;
  open_to_intents?: boolean;
};

type CandidateRow = {
  profile_id: string;
  full_name: string;
  age?: number | null;
  avatar_url?: string | null;
  city?: string | null;
  country?: string | null;
  looking_for?: string | null;
  verification_level?: number | null;
  reason?: string | null;
};

type ConnectionRow = {
  request_id: string;
  peer_profile_id: string;
  full_name: string;
  age?: number | null;
  avatar_url?: string | null;
  direction: 'sent' | 'received';
  intent_type: string;
  intent_status: 'pending' | 'accepted' | 'matched';
  match_id?: string | null;
  occurred_at: string;
};

const db = supabase as unknown as {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const parsePreference = (value: unknown): CircleDatingPreference => {
  const row = (value ?? {}) as PreferenceRow;
  return {
    isMember: row.is_member === true,
    optedIn: row.opted_in === true,
    openToIntents: row.open_to_intents !== false,
  };
};

const parseReasons = (value?: string | null) => String(value ?? 'Shared Circle')
  .split('·')
  .map((reason) => reason.trim())
  .filter(Boolean)
  .slice(0, 3);

const unavailableMessage = (message?: string) => {
  const normalized = String(message ?? '').toLowerCase();
  if (normalized.includes('could not find the function') || normalized.includes('schema cache')) {
    return 'Circle dating discovery needs the latest database migration.';
  }
  if (normalized.includes('circle_membership_required')) {
    return 'Join this Circle before using dating discovery.';
  }
  return message || 'Circle discovery could not load right now.';
};

export function useCircleDating(circleId: string, loadConnections = false) {
  const [preference, setPreference] = useState<CircleDatingPreference | null>(null);
  const [candidates, setCandidates] = useState<CircleDatingCandidate[]>([]);
  const [connections, setConnections] = useState<CircleDatingConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const impressedRef = useRef(new Set<string>());

  const logEvent = useCallback(async (
    eventType: string,
    targetProfileId?: string,
    metadata: Record<string, unknown> = {},
  ) => {
    await db.rpc('rpc_log_circle_discovery_event', {
      p_circle_id: circleId,
      p_event_type: eventType,
      p_target_profile_id: targetProfileId ?? null,
      p_metadata: {
        surface: loadConnections ? 'circle_connections' : 'circle_discover',
        ...metadata,
      },
    });
  }, [circleId, loadConnections]);

  const refresh = useCallback(async () => {
    if (!circleId) return;
    setLoading(true);
    setError(null);
    try {
      const preferenceResponse = await db.rpc('rpc_get_my_circle_dating_preference', { p_circle_id: circleId });
      if (preferenceResponse.error) throw new Error(unavailableMessage(preferenceResponse.error.message));
      const nextPreference = parsePreference(preferenceResponse.data);
      setPreference(nextPreference);

      if (loadConnections) {
        if (!nextPreference.isMember) {
          setConnections([]);
          return;
        }
        const response = await db.rpc('rpc_get_circle_dating_connections', { p_circle_id: circleId });
        if (response.error) throw new Error(unavailableMessage(response.error.message));
        setConnections(((response.data ?? []) as ConnectionRow[]).map((row) => ({
          requestId: row.request_id,
          peerProfileId: row.peer_profile_id,
          fullName: row.full_name,
          age: row.age ?? null,
          avatarUrl: row.avatar_url ?? null,
          direction: row.direction,
          intentType: row.intent_type,
          intentStatus: row.intent_status,
          matchId: row.match_id ?? null,
          occurredAt: row.occurred_at,
        })));
        return;
      }

      if (!nextPreference.optedIn) {
        setCandidates([]);
        return;
      }
      const response = await db.rpc('rpc_get_circle_dating_candidates_v2', { p_circle_id: circleId, p_limit: 40 });
      if (response.error) throw new Error(unavailableMessage(response.error.message));
      const nextCandidates = ((response.data ?? []) as CandidateRow[]).map((row) => ({
        profileId: row.profile_id,
        fullName: row.full_name,
        age: row.age ?? null,
        avatarUrl: row.avatar_url ?? null,
        city: row.city ?? null,
        country: row.country ?? null,
        lookingFor: row.looking_for ?? null,
        verificationLevel: Number(row.verification_level ?? 0),
        reasons: parseReasons(row.reason),
      }));
      setCandidates(nextCandidates);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Circle discovery could not load right now.');
    } finally {
      setLoading(false);
    }
  }, [circleId, loadConnections, logEvent]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const first = candidates[0];
    if (!first || impressedRef.current.has(first.profileId)) return;
    impressedRef.current.add(first.profileId);
    void logEvent('candidate_impression', first.profileId, { position: 0 });
  }, [candidates, logEvent]);

  const setOptedIn = useCallback(async (optedIn: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const response = await db.rpc('rpc_set_my_circle_dating_preference', {
        p_circle_id: circleId,
        p_opted_in: optedIn,
        p_open_to_intents: true,
      });
      if (response.error) throw new Error(unavailableMessage(response.error.message));
      setPreference(parsePreference(response.data));
      if (optedIn) void logEvent('dating_opted_in');
      if (!optedIn) setCandidates([]);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your discovery preference could not be saved.');
    } finally {
      setSaving(false);
    }
  }, [circleId, logEvent, refresh]);

  const passCandidate = useCallback(async (profileId: string) => {
    setCandidates((current) => current.filter((candidate) => candidate.profileId !== profileId));
    const response = await db.rpc('rpc_pass_circle_dating_candidate', {
      p_circle_id: circleId,
      p_target_profile_id: profileId,
    });
    if (response.error) setError(unavailableMessage(response.error.message));
    else void logEvent('candidate_passed', profileId);
  }, [circleId, logEvent]);

  return { preference, candidates, connections, loading, saving, error, refresh, setOptedIn, passCandidate, logEvent };
}
