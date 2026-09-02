# Vibes V5.3 — Freshness and Outcome Learning

V5.3 keeps Supabase authoritative for eligibility, ranking, exposure history, and learning. The client owns only presentation and durable delivery of authenticated telemetry.

## Ranking contract

- V5.2 remains the reciprocal candidate generator.
- V5.3 widens the seed deck to 36–50 eligible candidates.
- Profiles already shown in the active client session move behind unseen profiles.
- Exposure cooldowns graduate through unseen, rested, week, recent, cooldown, and same-day buckets.
- Twelve percent of delivery positions are reserved for safe exploration and interleaved at approximately every seventh card.
- Profile opens, intro plays, and dwell still teach feature preferences, but their old exact-pair boost is neutralised before final ordering.
- Segment-specific weights supplement the global V5 taste model for For You, Nearby, and Active Now.
- Accepted Intents, accepted matches, and sustained two-way conversations provide authoritative downstream outcome evidence.

## Exposure lifecycle

Every V5.3 response includes opaque `session_id`, `request_id`, and `recommendation_id` values in `recommendation_reasons`.

1. The client marks the recommendation shown only when its card becomes active.
2. Card departure records actual dwell and an optional outcome.
3. Behaviour events use a client UUID and an idempotent Supabase RPC.
4. Failed telemetry is retained locally and retried on network recovery, app foreground, and a 30-second active interval.
5. The original `card_seen` event is updated at exposure close, allowing the existing taste learner to consume real dwell.

## Stable first paint

The Vibes screen no longer paints the internal recommendation cache and then replaces it with a live deck. It waits for the settled live rank. The outer offline snapshot is used only when live fetching is disabled, fails, or reaches the watchdog.

Async card-context enrichment may decorate a card but cannot reorder a server-ranked deck after it is visible.

## Resumable segment decks

V5.3 preserves the latest neutral card independently for For You, Nearby, and Active Now for 30 minutes. Returning from another segment, profile details, or a brief app background asks Supabase to pin that card at rank one only when it remains in the authoritative V5 candidate set.

Pass, Like, Signal, Intent, expiry, loss of eligibility, and an explicit refresh rotate normally. Profile-open and completed-intro outcomes preserve continuity because they represent consideration rather than a decision. The client never supplies a profile to force into the deck; Supabase derives the resume candidate from authenticated exposure history.

## Rollout

1. Apply `20260901120000_vibes_v5_3_freshness_outcome_learning.sql` before releasing the client.
2. Apply `20260901123000_fix_vibes_v5_3_request_id_ambiguity.sql` and `20260901124500_vibes_v5_3_resumable_decks.sql` in order.
3. Confirm `get_vibes_recommendations_v5_3` is executable by `authenticated`.
4. Confirm the existing `vibes-v5-taste-refresh` cron job calls the replaced worker every five minutes. If `pg_cron` is unavailable, invoke `rpc_process_vibes_v5_taste_jobs` with the service role externally.
5. Query `rpc_get_vibes_v5_3_health` with the service role and verify:
   - queue depth returns to zero;
   - oldest requested job does not continually age;
   - failed jobs remain zero;
   - requests and shown counts increase during testing;
   - unique profiles per session remains healthy;
   - pass, positive-action, accepted-Intent, accepted-match, and two-way-conversation metrics move as expected;
   - same-day repeat rate falls without blocks or reports rising.

## Manual validation

- Open each of For You, Nearby, and Active Now: a skeleton may appear, but no temporary profile should flash before the settled first card.
- Stay on a card for at least 12 seconds, then Pass. Verify its recommendation row contains dwell and `outcome = 'pass'`.
- Refresh: unseen candidates should lead while sufficient eligible profiles exist.
- Exhaust a deliberately small test pool: rested profiles may return instead of producing a false empty state.
- Disconnect the device, perform an action, reconnect, and verify the queued client event reaches `vibes_events` once.
- Open and finish an intro video. Verify `intro_completed` and the exposure outcome are recorded.
- Move For You to Nearby and back within 30 minutes. Verify the previous neutral For You card returns with `recommendation_reasons.resumed = true`.
- Background and reopen the app within 30 minutes. Verify the current neutral card remains first.
- Pass the card or explicitly refresh. Verify the previous card is not resumed.
- Accept an Intent or match and exchange messages in both directions. Run the taste worker and verify contextual/outcome weights are refreshed.
