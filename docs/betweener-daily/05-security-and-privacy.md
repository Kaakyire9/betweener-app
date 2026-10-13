# Security and privacy specification

## Security posture

Daily answers and reflections are private account data. The client may present cached content and pending progress but cannot certify completion, compute an authoritative aggregate, create insight evidence, or award Quest credit. Every authority-changing operation is an authenticated, transactional RPC with owner checks, version locks and idempotency keys.

## Threat model

| Threat | Severity | Required mitigation | Verification |
|---|---|---|---|
| RLS bypass/cross-account answer read | Critical | Deny direct table access; own-row RLS; security-definer RPC with fixed `search_path` and `auth.uid()`; no service secret in client. | pgTAP as user A/B/anon; REST attempts; function ownership audit. |
| General admin escalates to publisher | Critical | Capability table enforced in SQL; separate draft/review/publish/withdraw capabilities; audited events; AI role cannot publish. | Negative pgTAP for every role/capability combination. |
| Client forges completion/path | High | Server validates current node, option ownership, full path and content version under row lock. | Invalid-node/option/path integration and fuzz tests. |
| Duplicate farming/replay | High | One session per user/calendar/release; operation UUIDs; unique completion and one Quest credit per user/release; transaction locks. | Concurrent RPC/load tests and offline replay. |
| Stale/expired/withdrawn offline mutation | High | Server time/window and package status checks on every operation; bounded grace; withdrawal overrides. | DST/travel/expiry/withdrawal E2E. |
| Queue replays after account switch | Critical | Owner-partitioned cache/outbox; stop drains on auth generation change; purge memory and reject owner mismatch. Existing owner checks are reusable (`lib/offline/mutation-queue.ts:3385`). | A→logout→B device test, restart and delayed network. |
| Circle answer leakage | High | Contribution accepts completed session ID only; stores no option/response; aggregate progress only; no contributor list. | Schema/RPC response inspection and cross-member tests. |
| Ineligible/removed member contributes | Medium | Check active membership and Circle/quest status in same transaction; freeze target at quest open. | Join/leave/archive race tests. |
| Blocked user comparison | High | Mutual consent plus current accepted match and `can_users_chat` at invite, accept and read; revoke on block/unmatch. | Block-before/after-consent integration tests. |
| Aggregate inference/differencing | High | Minimum threshold, coarse percentage rounding/total bands, delayed fixed snapshots, no small filters or Circle slices. | Repeated-query/differencing tests and privacy review. |
| Sensitive profiling | High | Allow-listed non-clinical dimensions; no protected/faith/health/abuse mappings; thresholds; sources; exclude/reset/delete; no matching use. | Mapping validator, data-flow audit, product copy review. |
| AI prompt injection/malformed output | High | Treat briefs/Gists as data; strict schema; no tool/publish permission; code/link rejection; human approval. | Adversarial fixtures and permission tests. |
| Unsafe/biased content | High | automated checks plus specialist review triggers, immutable provenance, withdrawal switch. | Red-team content set and branch preview evidence. |
| Harassment/spam | Medium now, High with comparison/comments | No public comments; comparison rate limit, silent decline, report/block; never auto-message. | Rate-limit and abuse-flow E2E. |
| Notification abuse/leak | High | Notifications excluded from pilot; later explicit opt-in/quiet hours, generic private copy, environment provenance and rate cap. | Staging-only delivery and payload privacy tests. |
| Raw answer in logs/analytics | High | Event names use IDs/category only; redact operation payloads; Sentry context allow-list. | Log-capture tests and observability review. |

## Privacy rules

- **Private by default:** raw responses and Daily Insights are visible only to their owner. Editors, Circle admins, matches and customer support do not receive them.
- **Purpose separation:** raw answers serve resume/result; optional reflection evidence requires separate consent; matching/recommendation use requires another future consent and is disabled in MVP.
- **Circle minimization:** Circle gets `{credited, aggregate count, stage}`. It receives no option, result, dimension, insight or player identity.
- **Comparison minimization:** only two mutually consenting, currently authorized matches see the explicitly agreed comparison. Consent can be withdrawn; a subsequent block/unmatch revokes access.
- **No fabricated social proof:** below-threshold aggregates are withheld. Staff/test responses are excluded.
- **No raw-answer telemetry:** analytics may use challenge public ID, revision, format, step index and anonymous option category ID only if necessary; access-controlled product analytics must not contain free text or result body.

## Consent UX

Daily Play needs no insight consent. Before the first eligible reflection event:

> “Save selected game choices to your private Daily Insights? They stay private, do not change who you see, and can be excluded or deleted anytime.”

Actions: “Save private insights” and “Not now.” No preselected toggle. A settings page shows status, purposes, source plays, export/delete/reset actions and a separate disabled-by-default “Use for future recommendations” control. Withdrawing stops new events immediately; member chooses whether to retain existing reflections or delete them.

Quest confirmation:

> “Add one completion to [Circle]’s garden? Your answer stays private. Members see only the total.”

Comparison invitation states exactly what will be revealed, to whom, for how long, and that declining sends no signal.

## Data lifecycle

Proposed defaults require legal/privacy approval:

| Data | Retention/action |
|---|---|
| Published content/revisions/audit | Retain for integrity/legal audit; archive from player access; unsafe content suppressed. |
| Incomplete sessions/responses | Delete or de-identify after 30 days. |
| Completed raw responses | 12 months maximum for user history/quality, then delete or irreversibly aggregate; offer earlier delete. |
| Reflection preferences/events | Until user deletes/withdraws with delete; exclude immediately; account deletion cascades. |
| Quest contributions | Keep user link through active week + 30 days for fraud/support, then de-identify while retaining aggregate milestone. |
| Aggregate snapshots | Retain coarse non-identifying snapshot; never retain released tiny slices. |
| Editorial provenance/reviews | Retain under company audit schedule; restrict access. |
| Product analytics | 13 months or shorter; pseudonymous ID; no raw answer; document separately. |
| Idempotency/security receipts | Minimum useful retry/fraud window, e.g. 30–90 days, then scheduled cleanup. |

Account deletion must cascade sessions, raw responses, reflection events/preferences and identifiable contributions, then recompute or safely retain thresholded aggregates only where re-identification is no longer reasonably possible. The existing delete-account Edge Function (`supabase/functions/delete-account/index.ts:333`) is a hook point but requires an explicit Daily deletion test. Export should include own sessions/choices, consent history, exclusions and Quest receipts in understandable JSON/CSV; it must not expose aggregate contributor data.

## UK GDPR assessment

Before pilot, document controller/purposes, lawful basis per purpose, processors/subprocessors, international transfers, retention and data-subject workflows. Contract necessity may support basic game progress; legitimate interests might support minimal service analytics after balancing; optional reflections and comparison should use explicit, granular consent where appropriate. Do not treat consent for play as consent for profiling, recommendations or marketing.

A DPIA is strongly recommended before Daily Insights or match comparison because repeated relationship choices can create inferred preference profiles, even when non-clinical. Assess protected/special-category inference risk, vulnerable users, children/age controls, automated decision-making, model/provider data flow and aggregate re-identification. Daily Insights must have no legal or similarly significant automated effect and no hidden ranking influence.

## Operational controls

- Server-owned Daily kill switch, per-format switches and minimum client schema.
- Immediate content withdrawal independent of app release/OTA.
- Capability and publication audit alerts.
- Rate limits on start/answer/complete/contribute/comparison.
- Monitoring for duplicate conflicts, invalid-option rate, aggregate suppression anomalies, RLS denials, AI validation failures, reports/blocks and crashes.
- Incident playbook: disable starts → withdraw affected content → preserve audit evidence → assess exposure → notify privacy/security leads → remediate/test → separately approve restoration.

No production data or remote environment was inspected in this audit; compliance conclusions require counsel and a verified data-flow review.
