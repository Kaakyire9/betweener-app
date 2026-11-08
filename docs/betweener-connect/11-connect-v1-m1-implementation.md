# Connect V1 M1 implementation

> Historical M1 delivery. M2's read-only provider findings, local hardening and
> voice preview are now in [documents 13–15](14-connect-v1-m2-voice-implementation.md).
> The provider gate remains blocked; M1's earlier test counts are retained below.

Date: 2026-10-28. **Local implementation and isolated validation only.** No shared
app database, hosted Supabase project, Stream application, native configuration,
build, OTA or production flag was changed. M2 has not started.

## Declarations

```text
CONNECT_M1_DOMAIN = PASS
CONNECT_M1_AUTHORISATION = PASS
CONNECT_M1_STREAM_ADAPTER = CONDITIONAL_PASS
CONNECT_M1_STATE_MACHINE = PASS
CONNECT_M1_SECURITY_TESTS = PASS
CONNECT_M1_LIVE_ISOLATION = PASS
CONNECT_M2_READY = CONDITIONAL_PASS
```

PASS refers to the local code/database contract and recorded tests. Stream adapter
validation uses controlled fixtures and static checking against the actual pinned
SDK. **Real Stream permissions and direct API bypass tests are BLOCKED by the
deployment/configuration boundary.** Native ringing, media quality, physical-device
calling and production readiness are NOT_TESTED. M2 entry conditions are below.

## Files delivered

| Files | Purpose |
| --- | --- |
| `features/connect/domain/connect.ts` | Media/authorization/preferences/grants/participants/session/error types, lifecycle edges and connected-duration calculation |
| `features/connect/data/connect-repository.ts`, `connect-service.ts` | Injectable typed commands and existing Supabase transport; no caller identity or eligibility supplied by client |
| `supabase/migrations/20261028074908_connect_v1_foundation.sql` | Atomic additive database migration, generated using repository CLI; requires M0 remediation |
| `supabase/functions/_shared/connect-stream-adapter.ts` | Dedicated server-only Stream adapter and permission/settings validation |
| `supabase/functions/_shared/connect-provider-worker.ts` | Injectable durable-work orchestration and cancellation/deletion compensation |
| `supabase/functions/_shared/connect-environment.ts` | Local/staging identity validation; production rejected |
| `supabase/functions/_shared/connect-edge.ts` | Pinned server SDK/bootstrap, authenticated/service transports and safe responses |
| `supabase/functions/_shared/connect-webhook.ts` | Raw-body HMAC verification and bounded callback parsing |
| `supabase/functions/connect-credentials/{index.ts,deno.json}` | Authenticated credential endpoint with repeated admission check |
| `supabase/functions/connect-provider-worker/{index.ts,deno.json}` | Separately authenticated worker entrypoint; not scheduled or invoked |
| `supabase/functions/connect-webhook/{index.ts,deno.json}` | Signed provider callbacks that wake server reconciliation |
| `supabase/tests/connect_v1_authority.sql`, `supabase/tests/fixtures/connect_v1.sql` | Permanent ACL/RLS tests and synthetic fixture |
| `scripts/lib/connect-test-database.cjs`, `scripts/test-connect-security.cjs` | Schema-only disposable database, separate connections and loopback HTTP adversarial tests |
| `scripts/prepare-connect-edge-check.cjs` | Copies Edge sources to ignored temporary directory and removes `@ts-nocheck` for genuine Deno checking |
| `__tests__/connect-foundation.regression.test.ts` | Domain, transport, provider adapter/worker, environment and webhook tests |
| Documents 00–04 and 07–12 | Current status pointers, implementation evidence, limitations and manual provider checklist |

Existing Live/Quick Connect/Odo/chat/Intent/Auth/push/native/hosting implementation
files, app dependencies and M0 security code were not changed during M1.
Pre-existing uncommitted work was preserved. No chat/header/UI call entry was added.

## Database and authorization

Eight private RLS-enabled tables hold configuration, preferences, grants, sessions,
one occupancy row per Auth user across both call roles, successful-command rate
buckets, provider work and webhook digests. Client and service roles have no direct
table grants. Privileged helpers fix `search_path=pg_catalog`; public RPC execution
is explicitly restricted to authenticated users or the worker's service role.
See [Supabase's RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Authenticated APIs:

- `rpc_connect_check_eligibility`, `rpc_connect_create_call`.
- `rpc_connect_act`: `accept`, `decline`, `cancel`, `end`, with expected version and device ID.
- `rpc_connect_get_call`, `rpc_connect_get_history` (bounded, participant-scoped).
- `rpc_connect_get_preferences`, `rpc_connect_set_preferences`.
- `rpc_connect_request_grant`, `rpc_connect_get_grant`, `rpc_connect_decide_grant`, `rpc_connect_revoke_grant`.
- `rpc_connect_admission`: separate media credential authorization after acceptance.

Actors derive from `auth.uid()` and current profile/Auth rows. Account activity,
deletion, moderation, anonymity, bans, current profile ownership and both block
directions are checked. Matched calls use the **same hardened proof and current
eligibility predicate as M0's `rpc_is_relationship_mutually_verified`**, never an
accepted label alone. Sensitive eligibility does not call the compatibility chat
helper and does not create/reconfirm historical proof.

Pre-match grants bind an existing sender-owned Intent, exact requester/recipient
direction, explicitly requested media, recipient approval and server expiry
(at most 24 hours and no longer than the source Intent). Sender metadata/preferences
and Intent/chat acceptance never approve calling. Recipient voice-only approval
cannot authorize video or reverse-direction calling. Revocation, source removal,
expiry, blocking and the M0 revocation watermark deny subsequent admission.
Default preferences are voice/video off; users must explicitly enable availability.

The singleton config starts unconfigured with every switch false. Creation and
new acceptance/admission require enabled media, environment and provider switches.
A constraint prevents enabling the production configuration. Ordinary flag changes
allow established calls to refresh and end; safety revocations still fence access.
No public flag setter exists. Grant revocation and terminal cleanup work when
entry flags are disabled.

Pair locks follow the repaired relationship convention. Ordered user locks and
the single occupancy primary key resolve same-pair and different-pair collisions.
Creation idempotency binds actor, UUID key, peer, media, authorization, grant and
device. A different payload under the same key fails. Version checks reject stale
commands; one recipient device wins acceptance. Read APIs never certify consent.

New calls are limited to 5/minute/user, all successful create commands including
idempotent retries to 60; actions 90, token
admissions 20, grant changes 10, preferences 20, revocations 30, history 30,
eligibility 60 and reads 120. PostgreSQL exceptions roll back denied-attempt
increments; gateway throttling of rejected/anonymous traffic remains a rollout
requirement. These are initial non-production limits, not measured abuse targets.

## Lifecycle and reconciliation

`REQUESTED → RINGING → ACCEPTED → CONNECTING → ACTIVE → ENDING → ENDED`.
Declined/cancelled/missed/failed outcomes are absorbing. Busy creation returns
`connect_busy` without allocating a second session; BUSY also exists in the domain
and database transition model. Active transport loss enters RECONNECTING with a
30-second deadline. Setup is bounded to 60 seconds, ringing to 45 seconds, and
accepted/connecting to 60 seconds. A due-time sweep checks expiry and eligibility;
its ordered pair locking and rescheduling avoid repeatedly starving later calls.

Only the service worker can reconcile media from a server-side Stream GET. Both
distinct expected users in the same provider session are required for ACTIVE.
Acceptance or a signed session-start callback alone is insufficient. Session-ID
drift/unexpected membership fails closed. Call end time is immutable; duration is
null before connection, excludes setup/ringing and includes bounded reconnect grace.
Provider callback timestamps never backdate connected time.

Durable jobs use stable server-generated call UUIDs, leases, attempt counters and
backoff. Provider setup failure becomes FAILED after three unsuccessful attempts
and retains cleanup work. End is idempotent, including provider not-found code 16.
Occupancy stays reserved through terminal state until cleanup acknowledges the
provider end and in-flight creation settles. A late/stale creation acknowledgment
forces another cleanup generation. Duplicate sync callbacks preserve active work
leases; verified body digests deduplicate replay without storing payloads.

Block insertion immediately fences database state and enqueues termination.
Grant revocation does likewise. Other eligibility changes are caught on admission,
snapshot reads and maintenance. Cleanup jobs and the surviving peer's occupancy
survive Auth/profile/session deletion; only an opaque provider UUID is needed to end
an orphan call. Physical media termination still depends on a running worker and
provider availability; no instant termination guarantee is claimed.

## Stream integration and isolation

Uses the already installed mobile SDK family (RN 1.46.3, video-client 1.62.0,
WebRTC 145.4.1) and the existing Edge pin `@stream-io/node-sdk@0.7.63` plus
`@supabase/supabase-js@2.110.7`. No dependency change. All three Edge entrypoints
were type-checked with strict Deno settings against those exact packages.

The dedicated `betweener_connect` type must have empty ordinary/built-in grants,
read-only invitation membership and minimal voice/video member roles. Every
provision/token operation fetches the actual configured call type and rejects
unexpected grants/settings. Recording, captions/transcription, screen sharing,
frame/raw/individual recording, thumbnails, ingress and broadcasting must be
disabled; participant capacity must be two. The adapter never edits a call type.

Server creation uses two `connect_invited` members with no join permission, unique
server UUID, voice/video metadata, camera default off, `ring:true`, `notify:false`.
Only after Betweener acceptance can the credential endpoint promote members to
the media-specific role. It verifies actual provider membership and call identity,
issues a 120-second ordinary user token, then rechecks Betweener admission before
return. It deliberately avoids call tokens that automatically add membership.
See [Stream permissions](https://getstream.io/video/docs/api/call-types/permissions/)
and [server calls](https://getstream.io/video/docs/api/calls/).

No second native Stream client is instantiated. M0 identified that Live's existing
singleton retains its first admission-scoped token provider. M2 must resolve
Auth-owned client/token refresh and Live/Connect media ownership before connecting
this adapter to React Native. Reusing the installed packages does not make that
existing provider automatically suitable for private calls.

The webhook verifies HMAC over raw bytes with constant-time Web Crypto, bounds
body size and event age, and accepts only Connect call IDs. It only queues a fresh
provider GET; signed/custom/stale/client events cannot assert ACTIVE. Dedicated
server-only Connect credentials and a separate worker secret are required. No
token, secret, profile PII or raw provider payload is logged or persisted in events.

## Validation evidence

| Check | Result |
| --- | --- |
| New domain/adapter/worker/webhook/environment tests | **19/19 PASS**, controlled provider fixtures |
| Database ACL/RLS/search-path/production-fence assertions | **15/15 PASS**, actual local Postgres |
| Connect integration cases | **62/62 PASS**, includes five separate-connection races and six actual loopback HTTP attacks |
| Earlier relationship suite with Connect migration installed | **88/88 PASS** |
| Original selected regression baseline | **91/91 PASS** |
| Chat / suggested Intent logic | **234/234**, **2/2 PASS** |
| Hosted matching / Private Spark / relationship command adapter | **41/41 PASS** |
| Full Live/Quick Connect/Odo/Studio logic suite | **504/508**, same four baseline failures, no additional failing names/signatures |
| Application TypeScript | PASS |
| Edge strict Deno check with `@ts-nocheck` removed in isolated copies | PASS |
| Targeted ESLint, including normally ignored Edge sources using `--no-ignore` | PASS |
| Live / EAS / Android environment isolation | PASS, local configuration only |
| Shared database and disposable-resource cleanup | PASS; no Connect/M0 migration applied to the app database |
| Actual Stream configuration, ordinary-user provider bypass and provider traffic | **BLOCKED / NOT_TESTED**, zero real Stream calls |

The five real connection races cover duplicate creation, crossed same-pair calls,
overlapping different pairs, competing accepting devices, and block versus worker
snapshot. Other actual database cases cover unverified history, voice-only and
directional grants, expiry/revocation, source ownership, forged identity, account
bans, nullable duration, trusted two-user connection evidence, reconnect, flags,
stale terminal events, provider failure/late completion, and deletion cleanup.
Provider acknowledgments in database tests are synthetic service-side fixtures;
they are not provider delivery evidence.

The four unchanged Live failures are:

1. `live-auth-recovery.regression.test.ts`: “Live catalogue waits for real auth and reloads after auth recovery”.
2. `live-fullscreen-stage.regression.test.ts`: “screen-only Program output follows the selected canvas and offers a focused view”.
3. `live-phase10g-studio-database.regression.test.ts`: “audience Program output exposes no Studio access or private matching data”.
4. `live-room-safety.regression.test.ts`: “standard Room Pulse keeps a curated, readable note preview”.

An additional raw hard-delete experiment encountered the existing baseline Vibes
match-delete trigger's foreign-key ordering issue. The successful deletion test
uses the current `delete-account` match-first cleanup order, then a real synthetic
Auth hard-delete cascade. No Vibes/deletion code was changed; the actual hosted
account-deletion Edge workflow was not invoked.

Reproduce from the repository root (database runner targets local Docker only):

```powershell
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test __tests__/connect-foundation.regression.test.ts
node scripts/test-connect-security.cjs
node scripts/prepare-connect-edge-check.cjs
npm.cmd exec --yes --package=deno@2.5.4 -- deno check --no-lock --config tmp/connect-m1/edge/deno.json tmp/connect-m1/edge/connect-credentials/index.ts tmp/connect-m1/edge/connect-provider-worker/index.ts tmp/connect-m1/edge/connect-webhook/index.ts
npm.cmd run typecheck
npm.cmd run test:chat-logic
npm.cmd run test:intent-logic
npm.cmd run test:live-logic
npm.cmd run verify:live-isolation
npm.cmd run verify:eas-project-isolation
npm.cmd run verify:android-variant
```

The exact retained 91-test invocation remains in document 07. Logs are under
ignored `tmp/connect-m1/`. The schema-only runner preserves the old shared local
migration ledger, includes M0 before M1, copies no real user rows and removes its
database and separate REST container in `finally`. Local catalog checks are used;
no hosted Supabase Advisor or remote schema audit is claimed.

## Remaining gates, rollback and M2

Complete [the manual checklist](12-connect-v1-stream-configuration-checklist.md)
under separate authorization. Actual application identity, role exports, ordinary
user bypass denial, provider retry/ringing behavior, native background delivery,
worker scheduling, rate/retention policy and two-device media remain unverified.
API acceptance chooses a device; provider credentials identify an Auth user and
cannot independently enforce a physical-device boundary against that user's
already-held token. Timestamp-only history pagination can omit ties at a page
boundary; use a composite cursor before a history UI needs exact traversal.

M2 is conditionally ready to start from this tested foundation, after its provider
permission gate and shared Auth-owned RTC client design are satisfied. It still
needs separate authorization. Do not proceed directly to native ringing, physical
device or production claims.

Nothing deployed requires rollback. To remove local M1, remove only the new M1
artifacts/current-status documentation; preserve M0 relationship remediation and
unrelated work. For any later authorized rollout, disable Connect entry flags
first, keep authenticated terminal/revocation APIs and worker credentials running,
drain create/end jobs and verify provider termination before releasing occupancy.
Preserve consent/history according to the approved retention policy. Prefer a
forward correction; never restore unsafe match writes or weaken Live call types.
