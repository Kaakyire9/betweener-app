# Architecture and data-model specification

> All SQL in this document is a proposal for review. It is not a migration and was not executed.

## Target architecture

```text
Vibes/Circles/Gist entry cards
             │
             ▼
       Expo Router /daily
             │
   immutable cache + owner-scoped outbox
             │
             ▼
Supabase authenticated RPC boundary
 ├─ schedule/content resolver
 ├─ version-locked session transaction
 ├─ answer validation + completion receipt
 ├─ thresholded aggregate projection
 ├─ private Daily Insights projection
 └─ Circle membership + quest credit transaction
             │
             ▼
Postgres RLS tables + scheduled aggregation/publication jobs

Admin web/mobile surface → privileged editorial RPCs → draft/review/publish audit
AI drafting Edge Function → schema/safety checks → draft only → human approval
```

No Redis or separate game backend is justified for MVP. Postgres transactions, unique constraints, scheduled jobs and immutable versioned JSON are enough at the illustrative loads in this plan.

## Scheduling decision

Recommended pilot: a **global UTC release day**. `release_key` is the UTC date, and all users share the same challenge public ID. The UI localizes `available_at`/`closes_at` using IANA timezone data but never computes eligibility from the device clock.

Alternatives:

| Model | Benefit | Cost/risk | Recommendation |
|---|---|---|---|
| Global UTC | One shared challenge and aggregate; simplest editorial/operations. | Day changes at an awkward local time for some users. | MVP. |
| Ghana/UK regions | Better release time; still limited calendars. | Travel/region assignment, duplicated aggregates, two editorial schedules. | Phase 2 if traffic supports thresholds. |
| User-local day | Natural local midnight. | DST, travel farming, fractured IDs/aggregates, complex closure. | Do not use for MVP. |

Server stores UTC timestamps and a calendar/region key. If regional release is later approved, assign the calendar at session start from a server-owned account region, lock it on the session, and use an IANA zone (`Africa/Accra`, `Europe/London`). Never trust device timezone to earn a second completion. DST is resolved by the database timezone rules. Travel does not change an existing session or release-day entitlement.

Default windows: available 24 hours, start allowed until close, accepted in-progress completion for a 2-hour grace period if content remains published. Withdrawn content closes immediately. Server clock controls all transitions.

## Proposed domain model

IDs exposed to clients should be random UUIDs. Store authored executable structure as normalized nodes/options, not JavaScript. Result content is declarative text/media references only.

```sql
-- PROPOSAL ONLY — NOT EXECUTABLE FROM THIS DOCUMENT
create type daily_format as enum ('what_would_you_do','read_the_room','date_rescue');
create type daily_publication_status as enum ('draft','in_review','scheduled','published','withdrawn','archived');
create type daily_session_status as enum ('started','in_progress','completed','expired','withdrawn');

create table daily_runtime_config (
  environment text primary key check (environment in ('development','staging','production')),
  enabled boolean not null default false,
  insights_enabled boolean not null default false,
  circle_quests_enabled boolean not null default false,
  comparisons_enabled boolean not null default false,
  cohort_percent numeric(5,2) not null default 0 check (cohort_percent between 0 and 100),
  minimum_schema_version integer not null default 1,
  kill_reason text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table daily_content_packages (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  locale text not null,
  region text not null default 'global',
  title text not null check (char_length(title) between 1 and 120),
  status daily_publication_status not null default 'draft',
  schema_version integer not null check (schema_version between 1 and 20),
  revision integer not null check (revision > 0),
  supersedes_id uuid references daily_content_packages(id),
  linked_gist_revision_id uuid null,
  available_at timestamptz,
  closes_at timestamptz,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region, locale, available_at),
  check (closes_at is null or available_at is null or closes_at > available_at),
  check (status <> 'published' or (approved_by is not null and approved_at is not null))
);

create table daily_challenges (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references daily_content_packages(id) on delete cascade,
  format daily_format not null,
  title text not null,
  intro text not null,
  estimated_seconds integer not null check (estimated_seconds between 30 and 300),
  content_note text,
  editorial_context text,
  aggregate_min_count integer not null default 20 check (aggregate_min_count >= 10),
  created_at timestamptz not null default now(),
  unique (package_id)
);

create table daily_challenge_nodes (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references daily_challenges(id) on delete cascade,
  node_key text not null check (node_key ~ '^[a-z0-9_]{1,40}$'),
  node_kind text not null check (node_kind in ('question','prediction','ending')),
  prompt text not null,
  result_body text,
  display_order smallint not null check (display_order >= 0),
  unique (challenge_id, node_key)
);

create table daily_challenge_options (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references daily_challenge_nodes(id) on delete cascade,
  option_key text not null check (option_key ~ '^[a-z0-9_]{1,40}$'),
  label text not null check (char_length(label) between 1 and 240),
  result_title text,
  result_body text,
  next_node_key text,
  compass_mapping jsonb not null default '{}'::jsonb,
  display_order smallint not null check (display_order >= 0),
  unique (node_id, option_key),
  check (jsonb_typeof(compass_mapping) = 'object')
);

create table daily_challenge_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references daily_challenges(id),
  package_revision integer not null,
  release_key date not null,
  calendar_key text not null default 'global_utc',
  status daily_session_status not null default 'started',
  current_node_key text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  client_operation_id uuid not null,
  completion_receipt uuid,
  updated_at timestamptz not null default now(),
  unique (user_id, release_key, calendar_key),
  unique (user_id, client_operation_id),
  unique (completion_receipt)
);

create table daily_challenge_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references daily_challenge_sessions(id) on delete cascade,
  node_id uuid not null references daily_challenge_nodes(id),
  option_id uuid not null references daily_challenge_options(id),
  response_kind text not null check (response_kind in ('choice','prediction')),
  client_operation_id uuid not null,
  accepted_at timestamptz not null default now(),
  unique (session_id, node_id, response_kind),
  unique (session_id, client_operation_id)
);

create table daily_aggregate_snapshots (
  challenge_id uuid not null references daily_challenges(id) on delete cascade,
  node_id uuid not null references daily_challenge_nodes(id) on delete cascade,
  snapshot_version bigint generated always as identity,
  eligible_total integer not null check (eligible_total >= 0),
  distribution jsonb not null,
  publishable boolean not null,
  computed_at timestamptz not null default now(),
  primary key (challenge_id, node_id, snapshot_version)
);

create table daily_reflection_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  consent_state text not null default 'not_asked'
    check (consent_state in ('not_asked','granted','withdrawn')),
  consented_at timestamptz,
  withdrawn_at timestamptz,
  recommendations_consent boolean not null default false,
  updated_at timestamptz not null default now()
);

create table daily_reflection_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  response_id uuid not null references daily_challenge_responses(id) on delete cascade,
  dimension text not null check (dimension in
    ('communication','planning','repair','social_energy','affection')),
  weight numeric(4,3) not null check (weight between -1 and 1),
  mapping_version integer not null,
  excluded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, response_id, dimension)
);

create table circle_quests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  quest_key text not null,
  week_start date not null,
  week_end date not null,
  target integer not null check (target between 3 and 1000),
  eligible_members_at_open integer not null check (eligible_members_at_open >= 0),
  status text not null check (status in ('scheduled','active','completed','expired','archived')),
  created_at timestamptz not null default now(),
  unique (circle_id, week_start),
  check (week_end > week_start)
);

create table circle_quest_contributions (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references circle_quests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references daily_challenge_sessions(id),
  release_key date not null,
  client_operation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, release_key),
  unique (quest_id, session_id),
  unique (user_id, client_operation_id)
);

create table daily_editorial_jobs (
  id uuid primary key default gen_random_uuid(),
  calendar_date date not null,
  locale text not null,
  brief jsonb not null,
  status text not null check (status in ('queued','drafting','failed','drafted','cancelled')),
  model_provider text,
  model_id text,
  prompt_version text,
  provider_request_id text,
  token_usage jsonb,
  error_code text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (calendar_date, locale)
);

create table daily_editorial_reviews (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references daily_content_packages(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id),
  decision text not null check (decision in ('changes_requested','approved','rejected')),
  checklist jsonb not null,
  notes text,
  created_at timestamptz not null default now()
);

create table daily_publication_events (
  id bigint generated always as identity primary key,
  package_id uuid not null references daily_content_packages(id),
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('scheduled','published','withdrawn','rolled_back','archived')),
  reason text,
  occurred_at timestamptz not null default now()
);

create index daily_packages_window_idx on daily_content_packages(region, locale, available_at, closes_at)
  where status = 'published';
create index daily_sessions_user_recent_idx on daily_challenge_sessions(user_id, release_key desc);
create index daily_responses_aggregate_idx on daily_challenge_responses(node_id, option_id, accepted_at);
create index daily_reflection_user_idx on daily_reflection_events(user_id, created_at desc)
  where excluded_at is null;
create index circle_quest_progress_idx on circle_quest_contributions(quest_id, created_at);
```

`linked_gist_revision_id` must reference a new immutable Gist revision table after the prerequisite Gist redesign; do not point at the currently mutable row. Validate graph integrity and Compass mappings in a privileged validation function before review and publication: root exists, every non-ending option has a valid next node, endings have none, graph is acyclic/reachable, format step limits are enforced, and mappings use the allow-list/bounds.

An additional `daily_challenge_results` table is not needed for MVP: immutable authored results live on versioned ending nodes/options, while the user’s resolved path is derived from locked responses. If results later gain independent localization or media lifecycles, split them into a revision-owned result table without changing session history.

## RLS/access matrix

Direct client writes to authoritative tables are denied; security-definer RPCs set `search_path`, validate `auth.uid()`, and use least privilege.

| Resource | Authenticated member | Editorial reviewer | Publisher | Service role/job |
|---|---|---|---|---|
| Published package/challenge/options | Read current eligible projection through RPC; no draft access | Read assigned drafts/preview | Read all | Full scoped job access |
| Own sessions/responses | Read own; mutate only through RPC | No access | No access | Support only through audited procedure |
| Other answers/raw distributions | No access | No access | No access | Aggregator only |
| Aggregate snapshots | Read only publishable coarse projection through RPC | Preview with synthetic/approved data only | Same | Compute/write |
| Reflection preferences/events | Own read; consent/exclude/delete through RPC | No access | No access | Deletion/export job only |
| Circle quest | Active members read aggregate quest state | No access | No access | Create/roll over |
| Contributions | Member sees own receipt plus aggregate count, never member list | No access | No access | Transaction/aggregate only |
| Editorial jobs/reviews/events | No access | Capability-scoped create/read/review | Capability-scoped schedule/publish/withdraw | Draft worker may create draft, never approve/publish |
| Runtime config | Read eligible projection through fetch RPC only | No direct mutation | Capability-scoped mutation | Monitoring may read; no implicit enable |

RLS tests must verify anonymous denial, cross-user denial, cross-Circle denial, removed member denial, blocked-user comparison denial, AI/service function inability to publish, and general-admin-without-editorial-capability denial.

## Server-authoritative RPC contracts

All responses include `schemaVersion`, `serverTime`, and a stable `requestId`. Errors are structured: `{ "error": { "code", "message", "retryable", "details" } }`; details contain no private answer.

### Fetch current

`rpc_daily_get_current({ locale, cachedPublicId?, cachedRevision? })`

```json
{
  "schemaVersion": 1,
  "serverTime": "2026-10-10T12:00:00Z",
  "state": "available",
  "releaseKey": "2026-10-10",
  "package": { "publicId": "uuid", "revision": 3, "format": "read_the_room", "availableAt": "...", "closesAt": "...", "content": {} },
  "resume": null,
  "feature": { "dailyInsights": true, "circleGarden": false }
}
```

Errors: `DAILY_DISABLED`, `NO_ELIGIBLE_CONTENT`, `CLIENT_SCHEMA_UNSUPPORTED`.

### Start/resume

`rpc_daily_start({ packagePublicId, revision, operationId })` returns `{ sessionId, status, currentNode, expiresAt, acknowledgedOperationId }`. Replay of `operationId` returns the same result. Version mismatch returns `CONTENT_VERSION_MISMATCH` with a safe refetch instruction. `rpc_daily_resume({ sessionId })` returns only the caller’s acknowledged path.

### Answer

`rpc_daily_answer({ sessionId, nodeKey, optionKey, responseKind, operationId })`

```json
{
  "accepted": true,
  "idempotent": false,
  "sessionStatus": "in_progress",
  "nextNode": { "nodeKey": "step_2", "prompt": "...", "options": [] },
  "outcome": null
}
```

The transaction locks the session, checks owner/status/version/window/current node, validates the option belongs to the node, inserts once, and advances deterministically. Errors: `NOT_SESSION_OWNER`, `INVALID_NODE`, `INVALID_OPTION`, `STALE_STEP`, `CONTENT_WITHDRAWN`, `SESSION_EXPIRED`, `OPERATION_CONFLICT`.

### Complete/result/aggregate

`rpc_daily_complete({ sessionId, operationId })` validates the full required path, inserts one receipt, marks completed and returns authored result. It does not trust client score/path or award Quest credit automatically.

`rpc_daily_result({ sessionId })` returns own authored outcome, aggregate state (`available|gathering|withheld`) and optional immutable Gist link. Aggregate response includes a coarse total band (`20–49`, `50–99`, `100+`) and rounded percentages; it does not expose raw timestamps, filters or tiny slices. Prediction and choice distributions remain distinct.

### Daily Insights

- `rpc_daily_reflection_consent({ consent: true|false, recommendationsConsent: false, operationId })`
- `rpc_daily_reflection_get()` → dimension copy, evidence count/day count, visible source cards, never raw score.
- `rpc_daily_reflection_exclude({ responseId, excluded: true, operationId })`
- `rpc_daily_reflection_reset({ confirmationToken, operationId })`
- `rpc_daily_reflection_delete({ operationId })`

The server derives events from validated option mappings only after explicit consent. Withdrawal stops new derivation. Exclusion/recalculation is transactional. Recommendation consent is separate and remains false in MVP.

### Circle contribution

`rpc_daily_contribute_to_circle({ sessionId, circleId, operationId })` locks the completed session and active quest, validates active membership and one-credit-per-user/release-day globally, inserts only a completion reference, and returns `{ credited, idempotent, stage, confirmedCount, target }`. It never receives or returns an option ID. Errors include `SESSION_NOT_COMPLETED`, `NOT_ACTIVE_MEMBER`, `ALREADY_CONTRIBUTED_TODAY`, `QUEST_CLOSED`, `CIRCLE_ARCHIVED`.

### Consented comparison (future, off by default)

- `rpc_daily_comparison_invite({ sessionId, matchUserId, operationId })`
- `rpc_daily_comparison_respond({ invitationId, accept, operationId })`
- `rpc_daily_comparison_get({ invitationId })`

At invite, response, and read time: require both sessions for the same challenge/version, an accepted/current match, `can_users_chat`, no blocks, both users’ separate comparison consent, and non-expired invitation. Return only authored comparison copy/option labels both agreed to reveal. Never create a match/message.

### Editorial approval/publication

- `rpc_daily_submit_review({ packageId, operationId })` validates schema/graph and freezes the draft hash.
- `rpc_daily_review({ packageId, draftHash, decision, checklist, notes, operationId })` requires reviewer capability and rejects self-review where policy requires separation.
- `rpc_daily_schedule({ packageId, draftHash, availableAt, closesAt, operationId })` requires publisher capability, an approval for the same hash and a collision-free calendar slot.
- `rpc_daily_withdraw({ packageId, reason, operationId })` requires withdraw capability and immediately invalidates runtime caches.

Each returns the immutable revision, publication status and audit-event ID. Errors include `CAPABILITY_REQUIRED`, `DRAFT_CHANGED`, `REVIEW_REQUIRED`, `CALENDAR_CONFLICT`, `INVALID_GRAPH` and `ALREADY_WITHDRAWN`. The AI/service drafting role is explicitly denied these RPCs.

## Offline, recovery and conflict rules

- Public content cache key: `daily:content:v1:<calendar>:<releaseKey>:<publicId>:<revision>`.
- Private state/outbox key includes Supabase user UUID. On auth generation change, stop drain, clear in-memory state, and load only the new owner’s partition.
- Outbox operations: `daily_start`, `daily_answer`, `daily_complete`, `daily_reflection_exclude`, `daily_circle_contribute`; each uses UUID, owner, session, expected node/version, created time, attempts and last error.
- Cache never turns a local path into authoritative completion. UI labels it “pending confirmation.” Aggregates, reflection evidence and garden credit wait for acknowledgement.
- Retry transient network/5xx with existing bounded backoff. Do not retry validation, expiry, withdrawal, owner, or version errors.
- Device restart hydrates cache/outbox. Foreground/network triggers drain through the existing owner checks.
- Multi-device: row lock + unique user/release session. First valid response for a node wins; second differing answer returns `OPERATION_CONFLICT` and authoritative resume state. Do not silently overwrite.
- If content expires while pending, server may accept only if the session began before close and is within grace. Withdrawal always wins.

## Aggregate privacy

Compute from one completed primary choice per user/release, excluding staff/test/invalidated sessions. Publish no distribution below `aggregate_min_count`. Round percentages to 5-point increments, use total bands, prohibit demographic/Circle/location filters in MVP, delay snapshots (for example 15 minutes), and serve the same cached snapshot to prevent differencing. Never fabricate or seed votes. Low participation returns `gathering`, not zeros.

## Performance and cost budgets

Budgets are targets, not measured current performance:

- Cached pregame usable within 500 ms; cold eligible fetch p95 under 1.5 s on a normal mobile connection.
- Answer RPC p95 under 700 ms; optimistic selection animation may run, but branch/result waits for acknowledgement online.
- JS frame work under 8 ms typical; 60 fps transitions, static reduced-motion fallback; Daily route incremental memory under 35 MB excluding shared runtime.
- Initial content JSON under 80 KB gzip, optional image under 250 KB, no autoplay video.

Illustrative daily load (not actual traffic), assuming 1 session, 4 responses, 1 completion, 30% insight event generation, 35% Quest contribution:

| Daily players | Reads/day (approx.) | Writes/day (approx.) | Notes |
|---:|---:|---:|---|
| 1,000 | 8k–12k | 6k–8k | Postgres/RPC and scheduled aggregate are ample. |
| 10,000 | 80k–120k | 60k–80k | Index response/owner paths; snapshot aggregates. |
| 100,000 | 0.8m–1.2m | 0.6m–0.8m | Partition/archive event data, batch aggregation, load-test connection/RPC limits. |

AI drafts once per locale/day, so inference cost is driven by editorial variants, not players. Human review is the dominant recurring cost. Images should be optional and reused; analytics should batch. Push is excluded from pilot. Reassess storage retention at 10k+ daily players and never retain raw analytics payloads indefinitely.

Illustrative capacity/cost inputs for estimation (not vendor quotes): about 6–8 authoritative row writes and 8–12 reads per completed player; 1–3 cached RPC invocations per step depending on resume; one batch aggregate scan per challenge snapshot; roughly 2–5 KB of raw relational data per completed session before indexes/overhead. At 100k daily players that is approximately 0.2–0.5 GB/day of raw new session/response data, so retention/partitioning must be measured against real row size. Edge Function use is limited to editorial drafting/validation and operational jobs; gameplay remains database RPC-based. Plan 1–3 bounded model calls plus human review per package, optional shared image assets rather than per-player generation, batched analytics delivery, and zero Daily notification sends in MVP. Obtain actual Supabase, model, image-CDN and analytics prices before approval.
