# Relationship acceptance security remediation

> M1 local implementation now builds on this preserved repair. See
> [M1 implementation and validation](11-connect-v1-m1-implementation.md).
> The runtime exclusion below records the scope of the earlier M0 remediation.

Date: 2026-10-28. Local security remediation implemented. No deployment is
authorized or performed. Connect runtime implementation remains excluded.

## Root cause and attack routes

The baseline migration's `Matches insert by participants` and `Matches update by
participants` policies checked ownership of either profile, without requiring a
decision from the other participant. Client writes in ChatScreen.ensureMatch,
Intent.ensureMatch and profile-view.ensureProfileMatch manufactured `ACCEPTED`
rows. The status was then trusted by `can_users_chat` and other match consumers.
INSERT, UPDATE and UPSERT were vulnerable. The old Intent INSERT policy also
allowed sender-supplied accepted status/metadata. Signal receivers could modify
sender identity fields under an unrestricted receiver UPDATE policy.

Existing privileged match writers are the mutual-swipe trigger, recipient Intent
RPC, Private Spark exit RPC and internal-admin account merge. No additional Edge
Function acceptance writer was found; account deletion removes relationships and
`intent-jobs` invokes the privileged maintenance RPC. Source backfill/auto-closure
can produce request labels without an independent recipient decision, so those
labels cannot certify consent.

Sources: `20260713034644_remote_production_baseline.sql` (match policies,
`handle_mutual_swipe`, `rpc_decide_intent_request`, `rpc_admin_execute_account_merge_case`,
source policies/triggers); `20260816210000_private_spark_exit_decisions.sql`;
`components/chat/ChatScreen.tsx`; `app/(tabs)/intent.tsx`; `app/profile-view.tsx`;
`lib/chat/sync/chat-list-sync-service.ts`; `can_users_chat`; `is_match`; profile,
Circle and Vibes match-state consumers.

## Architecture and compatibility decision

Keep the existing `matches`, profiles, swipes, Intent Requests and Live data model.
Add private participant decision evidence, a verification sidecar and durable
revocation watermarks. Existing accepted labels/conversations are preserved, with
no destructive backfill. New sensitive authorizations must use the verified
relationship predicate, never `ACCEPTED` or the compatibility chat helper alone.

Revoke direct client match writes and direct Intent insertion. Guard privileged
accepted writes against missing independent proof. Narrow authenticated RPCs
derive actors from Auth and lock the same canonical profile pair as existing Live
matching. Each participant's recorded source action is separate; duplicate and
concurrent actions converge on one match. Block/rejection invalidates proof and
decisions; unblock does not restore them. Reject cannot be silently reactivated.

Historical pending Intent senders are independently identifiable from their
recipient-immutable request; a new authenticated recipient action can verify that
workflow. A revoked source cannot use client timestamps to bypass the watermark.
Historical signal sender fields were receiver-mutable, so those sources require
fresh verification rather than automatic attestation. Existing chats stay intact.
Explicit reconfirmation of an existing accepted relationship records only the
current user's decision; both participants must act before it becomes verified.

Admin account merge retains a private copy of the existing reviewed implementation.
Its public wrapper authenticates an internal admin and approved/scheduled case,
and issues transaction-bound copy permits only for actual source mappings. Copied
accepted labels remain unverified; source copying does not record fresh consent.
Permits are inaccessible to clients and removed before return. Arbitrary custom
GUCs or JWT role strings are not authorization markers.

The approved merge test also exposed two existing enum transport defects in the
legacy executor: staged text swipe actions and match statuses were reinserted into
enum columns without casts. The private implementation adds explicit
`public.swipe_action` / `public.match_status` casts, with migration-time signature
and projection checks. Approved legacy relationship copying then succeeds. An
existing target rejection blocks the merge before any copy rather than allowing
the legacy status-ranking logic to reactivate it.

## Implemented surfaces

| Boundary | Repair |
| --- | --- |
| Direct tables/API | Client match INSERT/UPDATE/DELETE grants removed; mutation policies removed; direct Intent INSERT removed. Match/source guards also protect privileged writers. |
| Intent creation/acceptance | Actor-derived creation wrapper preserves quotas and returns the same pending ID for identical retries. Recipient acceptance validates ownership, current accounts, expiry/revocation and pair lock before recording evidence. Duplicate decisions return their prior result without creating provenance. |
| Signal creation/acceptance | Existing sender RPC retained behind an authenticated pair-locked wrapper. `rpc_accept_profile_signal` validates the specific source, actual receiver, expiry and sender evidence. Sender/recipient IDs and source deadlines are immutable; terminal sources cannot be reopened by direct updates. |
| Cancel/reject/block | Cancel RPCs lock the pair before the source row, enforce ownership and are idempotent. Pair revocation invalidates prior evidence; block/unblock and acceptance races cannot resurrect it. Rejected matches cannot be reopened by ordinary acceptance or administrative copying. |
| Mutual swipes | Existing owner-authorized reciprocal swipe behavior retained, with proof creation and withdrawal invalidation. Old peer swipes may be independently verified on a fresh action only when the pair has no revocation watermark. |
| Live Private Spark | Original exit RPC and immutable per-user responses retained. A guarded source trigger records actual continue actions and independently checks protected older exit responses. Two choices establish the proof before the original match writer runs. Stage/Stream/native infrastructure is unchanged. |
| Historical compatibility | `can_users_chat` and accepted-match labels/IDs remain intact. `rpc_get_accepted_relationship` is a compatibility read, not a proof issuer. `rpc_is_relationship_mutually_verified` is the separate authoritative predicate for future sensitive use. |
| Client integration | All three direct match-creation/promotion callbacks removed. Intent/chat trust the actual recipient RPC result; profile/Intent Signal actions use the shared typed relationship service. No offline message, attachment, receipt, or chat contract changed. |
| Privileged maintenance | Backfill and scheduled Intent jobs restricted to service execution; anonymous mutation grants removed from relevant user RPCs. Private evidence/helpers/merge permits have no client or service direct-write grants. |

The existing `profile_signal_gestures` seen/dismissed UI remains available.
Reading a source never records acceptance. Calling preference metadata is not
consulted as relationship proof or calling permission.

## Historical verification strategy

- Existing `ACCEPTED` rows without independent evidence remain unverified. Preserve
  current chats; no deletion, rejection, mass status rewrite or speculative backfill.
- For an existing accepted relationship, each participant may explicitly invoke
  `rpc_reconfirm_relationship(peer)`. It records only that actor's decision. A
  read, navigation or one participant's confirmation cannot certify the peer.
  No client automatically invokes this command; a future confirmation surface
  must explain the action explicitly.
- For an old pending Signal, use the existing **Ask to chat / Intent Request**
  workflow: the sender sends a fresh request and the recipient explicitly accepts.
  This supplies independent evidence without requiring another Signal quota or
  purchase. The historical Signal can still be dismissed/cancelled normally.
- Historical pending Intent rows have recipient-immutable sender identity; a new
  actual recipient action can verify that source. Expired/cancelled/auto-closed
  rows cannot be revived. A forged client timestamp cannot defeat revocation.
- Merged historical labels stay unverified. Existing target rejections require
  separate resolution and are never silently outranked by copied accepted status.

These categories are evaluated per source/action, not by publishing user IDs or
assuming every legacy accepted row is either genuine or malicious.

## Migration and environment constraints

Migration: `20261028064220_relationship_acceptance_authority.sql`, created with
the repository CLI. It has not been applied to the shared app database, staging
or production. Tests use a schema-only disposable database in local Docker, plus
a separate loopback-only PostgREST container with a random test JWT key. No real
local users/messages/secrets are copied into test fixtures.

The source local ledger ends at `20260930120000`, older than October checkout
work. Validate this targeted change without replaying unrelated pending migrations
or resetting the shared development database. The clone excludes unrelated
database-bound pg_cron and GraphQL extension schemas; relationship/Auth/Live
objects and their role grants/RLS remain in scope.

## Validation, remaining risks and declarations

The previous M0 baseline was 91 selected passing Node
tests plus nine vulnerability-reproducing assertions. Its intended
`intent-request-decision.regression.test.ts` path did not exist, so it did not
provide real Intent authorization coverage. This remediation adds real database
allow/deny tests, concurrent connections and direct HTTP requests.

Final security run: **88/88 database assertions, six separate-connection race
cases and four direct HTTP attacks passed**. This includes all nine original
vulnerability paths as permanent deny-based regressions, actual approved and
rejection-conflicting admin merges, current account bans, historical timestamp
forgery, and actual Private Spark exit RPCs. Five new client command tests pass.

The six separate-connection cases are duplicate Intent acceptance, simultaneous
historical reconfirmation, crossed mutual swipes, block versus acceptance,
pass versus acceptance, and sender cancellation versus acceptance. No sequential
mock is presented as concurrency evidence. The four HTTP cases use actual
PostgREST with ordinary signed test-user JWTs: forged INSERT, UPDATE, UPSERT and
recipient RPC identity. No Stream/API provider call is made.

Other completed validation:

| Check | Result |
| --- | --- |
| Original M0 reproduction in untouched cloned schema | 9/9 reproduced before applying the repair |
| Original selected Node baseline | 91/91 pass again |
| Existing chat logic | 234/234 pass |
| Existing suggested Intent logic | 2/2 pass; actual authorization is additionally covered by SQL/HTTP tests |
| Hosted matching + Private Spark + new command adapter tests | 41/41 pass (36 existing matching tests, 5 new adapter tests) |
| Full Live logic suite | **504/508 pass; 4 FAIL** in pre-existing Live work listed below |
| App typecheck | PASS |
| Targeted ESLint for all changed TS/TSX/JS files | PASS |
| Live, EAS project, Android variant isolation | PASS; local configuration checks only |

Reproduction commands:

```powershell
node scripts/test-relationship-security.cjs
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test __tests__/relationship-commands.regression.test.ts __tests__/live-phase3-hosted-matching.regression.test.ts __tests__/live-private-spark.regression.test.ts
npm.cmd run test:chat-logic
npm.cmd run test:intent-logic
npm.cmd run test:live-logic
npm.cmd run typecheck
npm.cmd run verify:live-isolation
npm.cmd run verify:eas-project-isolation
npm.cmd run verify:android-variant
```

The database runner is a migration-boundary rehearsal against an **unpatched
local schema baseline**. It refuses an already-patched source rather than
removing security from the shared database. It copies schema only, creates
historical synthetic fixtures before applying the migration, checks actual TAP
assertions (not just psql's exit code), runs concurrent sessions and loopback HTTP,
then removes the isolated database/container. Permanent SQL regressions are in
`supabase/tests/relationship_acceptance_authority.sql`. Do not point the runner at
a hosted database or reset a shared database to satisfy its baseline condition.

Final cleanup checks confirmed zero remaining test databases/REST containers,
zero synthetic fixture accounts in the shared app database, no new proof table
in that database, and no `20261028064220` entry in its migration ledger. All
pre-existing git status entries remain; the only newly modified existing app
files are the three intended acceptance surfaces. Unrelated work was preserved.

## Required declarations

These declarations apply to the **reviewed local change and synthetic local
tests**, not a deployed backend or production dataset.

```text
RELATIONSHIP_WRITE_SECURITY = PASS
MUTUAL_ACCEPTANCE_INVARIANT = PASS
HISTORICAL_MATCH_PROVENANCE = CONDITIONAL_PASS
CHAT_REGRESSION = PASS
INTENT_REGRESSION = PASS
LIVE_MATCHING_REGRESSION = PASS
CONNECT_M1_SECURITY_GATE = PASS
```

`HISTORICAL_MATCH_PROVENANCE` is conditional because uncertain accepted labels
remain intact and are denied new sensitive authority until independently
verified. `LIVE_MATCHING_REGRESSION` covers the 36 matching regressions and actual
database Private Spark workflow; it does not turn the four full-Live-suite
failures below into passes. M1 domain work may proceed locally using the verified
predicate. Connect runtime has not been started, and no release readiness is
implied.

The four full-suite failures concern unchanged files that were already modified
at the start of remediation:

1. `live-auth-recovery.regression.test.ts`: catalogue auth predicate expectation
   versus `features/live/hooks/use-live-sessions.ts`.
2. `live-fullscreen-stage.regression.test.ts`: screen-share `fit="contain"`
   expectation in the current stage presentation changes.
3. `live-phase10g-studio-database.regression.test.ts`: repository snapshot RPC
   expectation versus `features/live/application/live-repository.ts`.
4. `live-room-safety.regression.test.ts`: compact Room Pulse line-count expectation
   versus `features/live/components/LiveConversationPanel.tsx`.

Those Live sources/tests were not edited to make this repair appear green. The
complete full-suite TAP log is at `tmp/relationship-security/live-regression.log`;
the database TAP log is at `tmp/relationship-security/database-regression.log`.
Do not sum overlapping regression suites as unique coverage.

## Limits and remaining risks

The tested database starts from the current local schema, whose migration ledger
is older than the October checkout. The isolated schema keeps actual relation
policies, grants and source workflows but excludes scheduler/GraphQL extension
objects. No hosted database or provider bypass/deployment result is claimed.
Source fixtures are synthetic, with push disabled; no notifications are sent.
Physical-device/UI canaries and a full current target migration rehearsal remain
deployment prerequisites. Broad RN UI suites were not run.

Historical chat compatibility intentionally retains uncertain accepted labels.
This does not prove every historical chat was legitimately formed. Future
sensitive authorization must call the verified predicate and still enforce its
own current account/block/privacy/media/feature policy. Verified relationship
status is not pre-match voice/video consent or a Stream membership token.

The migration copies reviewed legacy implementations behind private wrappers.
Its shape checks fail closed if the target executor has diverged; inspect and
adapt to the actual target schema rather than bypassing those checks. Historical
admin merges with conflicting target rejections are rejected for explicit review.
New helpers use fixed `pg_catalog` resolution and fully qualified application
objects; copied implementations explicitly put `pg_catalog` first and `pg_temp`
last. Client CREATE privilege on `public`, helper EXECUTE grants and evidence-table
RLS are checked by the database suite. This is targeted local catalog validation,
not a claimed hosted Supabase Advisor run.

No production prevalence or affected-user count is asserted. Historical data
categories are accepted labels without proof, independently verifiable current
source workflows, receiver-mutable old Signals, and administrative relationship
copies. Never publish user identities or retroactively certify uncertain labels.

## Rollback and deployment prerequisites

Deploy only with separate authorization, after a current target-schema review,
staging validation and coordinated client update. Old clients' direct match writes
will fail after the fix; release the RPC-aware client paths with the backend.
Existing verified/historical chats keep their match IDs and access contract.
Perform a current target schema/ACL review and the full migration-boundary
rehearsal against that schema before any authorized staging deployment. Resolve
or separately account for the four existing full-Live-suite failures. Review the
minimum supported client version; never restore unsafe write grants as a rolling
compatibility exception.

Prefer a forward correction. Do not restore unilateral write grants as a rollback.
Disable new acceptance entry points if necessary while retaining reads, existing
chat, block enforcement and consent evidence. Reverting client code alone would
reintroduce calls to revoked direct writes. Archive evidence under the product's
retention policy rather than deleting it during an incident. No deployed resource
requires rollback from this local work.
