let ephemeralTopicSequence = 0;

/**
 * Creates a per-subscription topic for database-backed Realtime channels.
 *
 * Supabase Realtime reuses channels by topic. React Strict Mode and Fast
 * Refresh can remount an effect before asynchronous channel removal finishes,
 * so a Postgres Changes subscription must not reuse its previous topic.
 *
 * Do not use this for Broadcast or Presence channels: those topics are shared
 * coordination addresses and must remain stable across clients.
 */
export function createEphemeralRealtimeTopic(baseTopic: string) {
  ephemeralTopicSequence = (ephemeralTopicSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${baseTopic}:${Date.now().toString(36)}:${ephemeralTopicSequence.toString(36)}`;
}
