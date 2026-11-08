# Milestone 4 — Reader Engagement

## Scope

Milestone 4 adds edition-scoped reactions, owner-only private reflections, and payload-free reader analytics. It does not add public comments, public Reflections, Circle threads, matching/Compass inputs, Sparks rewards, or autonomous AI publication.

## Migration dependency

Apply in order only after authorization for the target environment:

1. `20261010120000_relationship_gist_editorial_capability_hardening.sql`
2. `20261010121000_relationship_gist_reader_state_idempotency.sql`
3. `20261010130000_relationship_gist_editorial_v2.sql`
4. `20261010150000_relationship_gist_reader_engagement.sql`

The Milestone 4 migration is additive. It does not depend on the Milestone 3 AI migration.

## Default-off rollout controls

All four values must remain absent or `false` until their staging gate is approved:

- `EXPO_PUBLIC_RELATIONSHIP_GIST_ENGAGEMENT_ENABLED`
- `EXPO_PUBLIC_RELATIONSHIP_GIST_REACTIONS_ENABLED`
- `EXPO_PUBLIC_RELATIONSHIP_GIST_REFLECTIONS_ENABLED`
- `EXPO_PUBLIC_RELATIONSHIP_GIST_ANALYTICS_ENABLED`

The master flag and each capability flag must both be `true` to expose that capability.

## Privacy and isolation boundaries

- Aggregate reaction counts are server-derived; reactor identities are never returned.
- One reaction is stored per authenticated user and stable edition. Its immutable revision remains attributable.
- Reflection text is owner-only, absent from AsyncStorage, mutation receipts, reader analytics, logs, matching, Connection Compass, and public surfaces.
- Analytics accepts a fixed event vocabulary and progress buckets only. It has no JSON payload or text column.
- Every mutation includes the expected account UUID; the server compares it with `auth.uid()` to reject auth-transition races.
- Direct table access is revoked. Authenticated clients use narrow security-definer RPCs with rate limits and idempotency keys.

## Recommended staging gates

1. Apply the dependency chain to an isolated staging database and rerun all M1–M4 pgTAP suites.
2. Verify two real accounts cannot read each other's reactions or Reflections through REST, GraphQL, RPC arguments, realtime, or backups exposed to clients.
3. Exercise offline reaction change/removal, app termination, reconnect, account switch, and duplicate delivery. Counts must remain server-authoritative throughout.
4. Verify reflection create/edit/delete online, failed-network retention in the editor, account logout clearing UI state, and permanent text deletion.
5. Inspect captured telemetry and device storage for article bodies, reflection text, sensitive profile fields, and raw responses; all must be absent.
6. Validate VoiceOver/TalkBack reaction selection, dynamic text, keyboard entry, reduced motion, and narrow Android layouts.
7. Enable flags capability-by-capability for internal testers, starting with analytics, then reactions, then Reflections. Observe RPC errors and rate limits before widening access.

## Rollback

First disable all four client flags. This removes every new UI/write path without changing legacy reader behaviour. If schema rollback is separately authorized, retain/export aggregate operational metrics as required, delete private Reflection data under the approved privacy procedure, then remove only the five Milestone 4 tables and five public RPCs. Do not roll back the Milestone 1 or 2 compatibility migrations.
