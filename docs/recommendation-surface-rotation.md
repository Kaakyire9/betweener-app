# Recommendation Surface Rotation

Four ordered migrations upgrade the person-recommendation surfaces outside Vibes. Supabase remains the authority for reciprocal eligibility, ranking, stable delivery fields, and exposure history.

## Product policy

| Surface | Stability window | Rotation behavior |
| --- | --- | --- |
| Intent Suggested | UTC day | Keeps the same deliberate set for the day; profiles seen during earlier days move through 72-hour and 14-day freshness tiers. |
| Relationship Compass | UTC day per saved Compass version | Server-ranks the curated field from the saved Compass; 7-day and 21-day exposure tiers prevent one person dominating. |
| Circle discovery | UTC day per Circle | Reorders the eligible member list daily. It does not hide eligible members or turn the directory into a swipe deck. |
| Circle Home Picks | 72 hours | Keeps the same cross-Circle portraits for three days, then leads with unseen/rested compatible members. |
| Closure to Clarity | Seven days per closed Intent | Preserves a coherent recovery field instead of changing the story on every reopen. |

Warm Introductions are excluded because a host curates them. Circle People is excluded because it is a community directory. Neither should rotate as an algorithmic dating surface.

## Engine upgrades

- Intent Suggested retains its mature taste, quality, diversity, and outcome seed model. The V2 delivery RPC re-checks `is_romantically_eligible`, removing relaxed reciprocal-age fallbacks before delivery.
- Relationship Compass no longer queries and scores recent Profiles on the client. `rpc_get_relationship_compass_profiles` applies central eligibility, active Match/Intent/pass suppression, hard Compass `must` choices, soft Compass scoring, deterministic exploration, and exposure freshness.
- Circle Home Picks and Circle discovery retain their existing contextual compatibility models. Persisted batches stop a newly logged impression from changing the next render.
- Circle discovery now requests up to 40 eligible members. Rotation changes ordering only.
- Closure to Clarity retains its target-relative three-lane model, but its V2 delivery RPC removes candidates who fail current reciprocal global eligibility.
- `profile_recommendation_batches` and `profile_recommendation_events` are RLS-enabled and revoked from client roles. Clients receive display fields only, never scores, rejection reasons, or batch internals.
- A guarded daily cleanup retains 45 days of batch/event history. If `pg_cron` is unavailable, schedule `rpc_cleanup_profile_recommendation_rotation` externally with the service role.

## Deployment

Apply these migrations in order, then regenerate remote Supabase types:

1. `20260901133000_recommendation_rotation_foundation.sql`
2. `20260901133100_intent_closure_recommendation_rotation.sql`
3. `20260901133200_relationship_compass_recommendation_engine.sql`
4. `20260901133300_circle_recommendation_rotation.sql`

Each migration is independently transactional. Apply all four before releasing the updated client; the client intentionally calls the V2 RPCs and does not fall back to raw profile queries.

The sequence must come after:

- `20260831100000_circle_contextual_discovery_engine.sql`
- `20260831233000_circle_home_pick_rotation.sql`
- the production baseline containing Suggested Moves and Closure to Clarity

## Validation

From the SQL editor, after opening each surface with a test account:

```sql
select public.rpc_get_profile_recommendation_rotation_health();

select
  surface,
  context_key,
  bucket_key,
  count(*) as candidates,
  min(rank) as first_rank,
  max(rank) as last_rank
from public.profile_recommendation_batches
where created_at >= timezone('utc', now()) - interval '24 hours'
group by surface, context_key, bucket_key
order by surface, context_key;

select
  surface,
  event_type,
  count(*) as events,
  count(distinct viewer_profile_id) as viewers,
  count(distinct candidate_profile_id) as candidates
from public.profile_recommendation_events
where created_at >= timezone('utc', now()) - interval '24 hours'
group by surface, event_type
order by surface, event_type;
```

Manual checks:

1. Open Intent Suggested, navigate away, return, background the app, and reopen it. The same daily set and order should remain unless an Intent/action makes a candidate ineligible.
2. Open Relationship Compass twice on the same day. The same field should remain. A saved Compass refresh after its 24-hour gate should create a new versioned field.
3. Confirm blocked, matched, pending-Intent, recently passed, and reciprocal-age-ineligible profiles never appear in Relationship Compass.
4. Open Circle Picks several times over 72 hours. The same ordered field should remain; after the bucket changes, unseen/rested Picks should lead.
5. Open Circle Discover several times in one day. Order should remain stable and all returned eligible members should still be available. Re-check the next UTC day for a refreshed front order.
6. Reopen the same Closure to Clarity journey. Its three narrative lanes should remain coherent for the seven-day field.
7. Confirm an impression row is written once per profile/bucket for Relationship Compass and Closure to Clarity.

The service-role health RPC is deliberately unavailable to authenticated clients.
