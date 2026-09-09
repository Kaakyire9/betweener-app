import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { liveRepository } from '../../application/live-repository.ts';
import type {
  OdoCopilotState,
  OdoCopilotSuggestion,
  OdoCopilotTask,
} from './odo-copilot-contracts.ts';
import { odoCopilotNoActionMessage } from './odo-copilot-contracts.ts';

export type LiveOdoCopilotController = {
  state: OdoCopilotState | null;
  loading: boolean;
  busyTask: OdoCopilotTask | null;
  busySuggestionId: string | null;
  roundAvailable: boolean;
  error: string | null;
  notice: string | null;
  refresh: () => Promise<void>;
  request: (task: OdoCopilotTask) => Promise<void>;
  use: (suggestion: OdoCopilotSuggestion) => Promise<void>;
  another: (suggestion: OdoCopilotSuggestion) => Promise<void>;
  dismiss: (suggestion: OdoCopilotSuggestion) => Promise<void>;
};

const friendlyError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'odo_copilot_unavailable';
  if (message.includes('lease_held')) return 'Odo is finishing another suggestion.';
  if (message.includes('stale') || message.includes('expired')) return 'That moment has changed. Ask Odo again.';
  if (message.includes('disabled')) return 'Odo Copilot is not available right now.';
  return 'Odo could not prepare a suggestion. Try again.';
};

export const useLiveOdoCopilot = (options: {
  enabled: boolean;
  sessionId: string;
  roundId: string | null;
  onUsed?: () => void | Promise<void>;
}): LiveOdoCopilotController => {
  const [state, setState] = useState<OdoCopilotState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyTask, setBusyTask] = useState<OdoCopilotTask | null>(null);
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!options.enabled) return;
    setLoading(true);
    try {
      const next = await liveRepository.getOdoCopilot(options.sessionId);
      if (mounted.current) {
        setState(next);
        setError(null);
      }
    } catch (caught) {
      if (mounted.current) setError(friendlyError(caught));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [options.enabled, options.sessionId]);

  useEffect(() => {
    if (options.enabled) void refresh();
  }, [options.enabled, refresh]);

  useEffect(() => {
    setNotice(null);
  }, [options.enabled, options.sessionId]);

  const request = useCallback(async (task: OdoCopilotTask) => {
    if ((task === 'conversation_spark' || task === 'pair_narration') && !options.roundId) {
      setError('Start a pair before asking Odo for this suggestion.');
      return;
    }
    setBusyTask(task);
    setError(null);
    setNotice(null);
    try {
      const suggestion = await liveRepository.requestOdoCopilotSuggestion({
        sessionId: options.sessionId,
        task,
        roundId: task === 'conversation_spark' || task === 'pair_narration'
          ? options.roundId
          : null,
      });
      await liveRepository.manageOdoCopilotSuggestion(suggestion.id, 'shown');
      await refresh();
      if (mounted.current && suggestion.type === 'no_action') {
        setNotice(odoCopilotNoActionMessage(task));
      }
    } catch (caught) {
      if (mounted.current) setError(friendlyError(caught));
    } finally {
      if (mounted.current) setBusyTask(null);
    }
  }, [options.roundId, options.sessionId, refresh]);

  const use = useCallback(async (suggestion: OdoCopilotSuggestion) => {
    setBusySuggestionId(suggestion.id);
    setError(null);
    setNotice(null);
    try {
      await liveRepository.useOdoCopilotSuggestion(suggestion.id);
      await Promise.resolve(options.onUsed?.());
      await refresh();
    } catch (caught) {
      if (mounted.current) setError(friendlyError(caught));
      await refresh();
    } finally {
      if (mounted.current) setBusySuggestionId(null);
    }
  }, [options.onUsed, refresh]);

  const dismiss = useCallback(async (suggestion: OdoCopilotSuggestion) => {
    setBusySuggestionId(suggestion.id);
    setNotice(null);
    try {
      await liveRepository.manageOdoCopilotSuggestion(suggestion.id, 'dismiss');
      await refresh();
    } catch (caught) {
      if (mounted.current) setError(friendlyError(caught));
    } finally {
      if (mounted.current) setBusySuggestionId(null);
    }
  }, [refresh]);

  const another = useCallback(async (suggestion: OdoCopilotSuggestion) => {
    setBusySuggestionId(suggestion.id);
    setNotice(null);
    try {
      await liveRepository.manageOdoCopilotSuggestion(suggestion.id, 'regenerate');
      await request(suggestion.task);
    } catch (caught) {
      if (mounted.current) setError(friendlyError(caught));
    } finally {
      if (mounted.current) setBusySuggestionId(null);
    }
  }, [request]);

  return useMemo(() => ({
    state, loading, busyTask, busySuggestionId, error, notice,
    roundAvailable: options.roundId !== null,
    refresh, request, use, another, dismiss,
  }), [another, busySuggestionId, busyTask, dismiss, error, loading, notice,
    options.roundId, refresh, request, state, use]);
};
