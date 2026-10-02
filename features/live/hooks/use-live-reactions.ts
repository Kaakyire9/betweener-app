import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appendLiveReactionBurst,
  emptyLiveReactionSummary,
  liveRepository,
  newestLiveReactionSummary,
  type LiveReactionBurst,
  type LiveReactionEvent,
  type LiveReactionKind,
  type LiveReactionSummary,
} from '../application/index.ts';

const MAX_SEEN_EVENT_IDS = 256;
const CLIENT_RATE_LIMIT = 18;
const CLIENT_RATE_WINDOW_MS = 10_000;
const FEEDBACK_DURATION_MS = 2_400;

type Options = {
  enabled: boolean;
  sessionId: string;
};

export const useLiveReactions = ({ enabled, sessionId }: Options) => {
  const [bursts, setBursts] = useState<readonly LiveReactionBurst[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [summary, setSummary] = useState<LiveReactionSummary>(() => emptyLiveReactionSummary(sessionId));
  const activeSessionIdRef = useRef(sessionId);
  const seenEventIdsRef = useRef(new Set<string>());
  const seenEventOrderRef = useRef<string[]>([]);
  const sentAtRef = useRef<number[]>([]);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_DURATION_MS);
  }, []);

  const rememberEvent = useCallback((eventId: string) => {
    if (seenEventIdsRef.current.has(eventId)) return false;
    seenEventIdsRef.current.add(eventId);
    seenEventOrderRef.current.push(eventId);
    if (seenEventOrderRef.current.length > MAX_SEEN_EVENT_IDS) {
      const expired = seenEventOrderRef.current.shift();
      if (expired) seenEventIdsRef.current.delete(expired);
    }
    return true;
  }, []);

  activeSessionIdRef.current = sessionId;

  const applySummary = useCallback((incoming: LiveReactionSummary) => {
    if (incoming.sessionId !== activeSessionIdRef.current) return;
    setSummary((current) => newestLiveReactionSummary(current, incoming));
  }, []);

  const receive = useCallback((event: LiveReactionEvent) => {
    if (event.sessionId !== activeSessionIdRef.current) return;
    if (event.summary) applySummary(event.summary);
    if (!rememberEvent(event.eventId)) return;
    setBursts((current) => appendLiveReactionBurst(current, event));
  }, [applySummary, rememberEvent]);

  useEffect(() => {
    setBursts([]);
    setFeedback(null);
    setSummary(emptyLiveReactionSummary(sessionId));
    seenEventIdsRef.current.clear();
    seenEventOrderRef.current = [];
    sentAtRef.current = [];
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    let active = true;
    const refreshSummary = () => {
      void liveRepository.getReactionSummary(sessionId)
        .then((nextSummary) => {
          if (active) applySummary(nextSummary);
        })
        .catch(() => undefined);
    };
    const unsubscribe = liveRepository.subscribeReactions(sessionId, receive, (status) => {
      if (status === 'SUBSCRIBED') refreshSummary();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applySummary, enabled, receive, sessionId]);

  const send = useCallback(async (reaction: LiveReactionKind): Promise<boolean> => {
    if (!enabled || !sessionId) return false;
    const now = Date.now();
    sentAtRef.current = sentAtRef.current.filter((sentAt) => now - sentAt < CLIENT_RATE_WINDOW_MS);
    if (sentAtRef.current.length >= CLIENT_RATE_LIMIT) {
      showFeedback('Let the room breathe for a moment.');
      return false;
    }
    sentAtRef.current.push(now);
    const eventId = Crypto.randomUUID();
    receive({
      eventId,
      sessionId,
      reaction,
      emittedAt: new Date(now).toISOString(),
    });
    try {
      const receipt = await liveRepository.createReaction(sessionId, eventId, reaction);
      receive(receipt);
      return true;
    } catch {
      showFeedback('Reaction not shared. Check your connection.');
      return false;
    }
  }, [enabled, receive, sessionId, showFeedback]);

  const dismissBurst = useCallback((burstId: string) => {
    setBursts((current) => current.filter((burst) => burst.id !== burstId));
  }, []);

  return { bursts, dismissBurst, feedback, send, summary };
};
