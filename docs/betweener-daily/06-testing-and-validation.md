# Testing, analytics and validation plan

## Audit test status

No commands, test suites, builds, devices, migrations or remote checks were run for this specification. Existing test files and CI configuration were inspected only. All items below are proposed gates, not passing results.

## Proposed test layout

```text
__tests__/
  daily-domain.test.ts
  daily-scheduling.test.ts
  daily-offline-queue.test.ts
  daily-insights.test.ts
  daily-circle-garden.test.ts
  daily-accessibility.interaction.test.tsx
  daily-gist-link.regression.test.ts
  daily-match-comparison.security.test.ts
supabase/tests/database/
  daily_content_rls_test.sql
  daily_session_transactions_test.sql
  daily_aggregate_privacy_test.sql
  daily_reflection_privacy_test.sql
  daily_circle_quest_test.sql
  daily_editorial_capabilities_test.sql
e2e/
  daily-solo.yaml
  daily-offline-recovery.yaml
  daily-account-switch.yaml
  daily-accessibility.yaml
fixtures/daily/
  each-format-valid.json
  malformed-graphs.json
  unsafe-ai-outputs.json
  dst-and-travel.json
```

## Test matrix

| Layer | Required coverage |
|---|---|
| Unit/domain | Parse every supported schema; reject unknown schema, oversized copy, invalid mapping, missing root, cycles, unreachable endings, cross-node option, invalid Read-the-Room prediction and every sample branch/result. |
| Scheduling | Global release boundaries, server clock, UTC date, `Europe/London` DST spring/fall, `Africa/Accra`, travel mid-session, late start, grace completion, expiry and withdrawal. |
| Components | Pregame, each format, pending/confirmed/error/withdrawn, thresholded aggregate, Insight consent/insufficient evidence, Circle selector/garden stages, Gist card and font scaling. |
| RPC/integration | Start/resume/answer/complete/result; version locks; invalid answers; idempotent same operation; conflict on reused operation with different payload; row-lock races; no client-certified completion. |
| pgTAP/RLS | Anonymous denial, own/cross-user, raw aggregate denial, editor/reviewer/publisher separation, service draft cannot publish, active/removed Circle member, cross-Circle, account deletion cascade. |
| Offline | Cold cache, lost response after server commit, operation replay, process death, device restart, network flap, backoff/dead letter, expired/withdrawn queued action and no aggregate/Quest confirmation before ack. |
| Auth recovery | User A queues; logout; user B login; drain must never replay A. Token refresh/transient failure must not sign out. Account deletion clears cache/outbox. |
| Multi-device | Simultaneous starts converge on one session; same answer replays; different answer conflicts; only one completion and one Circle credit. |
| Insights | Consent/not-now/withdraw; allow-listed eligible mappings; excluded categories; evidence/day thresholds; conservative copy; source visibility; exclude/recalculate; reset/delete/export; no write to `profiles.relationship_compass`. |
| Circle Garden | Explicit selection, one Circle/day, active membership, frozen fair target, small Circle minimum, joining/leaving, switch next day, archive, rollover, expiry and concurrent contribution. |
| Aggregates | Real completions only; test/staff exclusion; below threshold suppression; coarse rounding; delayed stable snapshot; no filter/differencing; separate choice/prediction. |
| Gist regression | Read without play; play without Gist; immutable revision link; saved/archive access; offline save and unsave convergence; lens semantics; withdrawal behavior. |
| Comparison | Mutual consent, same version, current accepted match, `can_users_chat`, blocks before/after, expiry/withdrawal, silent decline, no auto-message/match. |
| AI/editorial | JSON attacks, prompt injection, malformed graphs, unsafe/bias fixtures, similarity, factual source requirements, reviewer conflict, all-branch preview, schedule, immutable publish, rollback/withdraw. |
| Accessibility | VoiceOver and TalkBack order/labels/announcements; switch control; 200% fonts; contrast; reduced motion; touch targets; screen reader pending/error state. |
| Devices | At least one physical midrange Android, low-memory Android/emulator, current iPhone and oldest supported iOS device; poor network/background/foreground. |
| Security/load | RPC fuzzing, IDOR, role escalation, rate limits, operation replay, 100 concurrent completes per challenge, aggregate job at illustrative 100k daily players. |

## CI and release gates

Each PR must pass existing lint/typecheck/Expo Doctor gates plus targeted Daily tests. Database PRs require a disposable local Supabase reset and the full Daily pgTAP/RLS suite. Before staging: dependency audit, generated types check against the explicitly verified staging ref, migration lint, rollback rehearsal and fixture validation. Before pilot: physical-device accessibility, offline/account-switch E2E, performance profile, privacy/security review and editorial dry run.

Do not use `.github/workflows/supabase-types.yml` unchanged for staging validation because the inspected workflow contains a production project reference. Correct environment isolation must be separately approved and implemented before any remote generation.

## Analytics contract

Use a server-assigned experiment/cohort ID and release ID. Batch privacy-safe events. Common properties: event schema, UTC timestamp, pseudonymous user ID, app version, environment, challenge public ID/revision, format, release key, surface, network state and experiment cell. Exclude copy, raw answer labels/text, Compass scores, Circle name and match identity.

| Event | Numerator | Required denominator/exposure |
|---|---|---|
| `daily_entry_impression` | Visible ≥50% for ≥1 second | Eligible app opens on a surface where card could render |
| `daily_start` | Server-created/reused session after tap | Unique eligible card impressions |
| `daily_step_acknowledged` | Server-accepted step | Started sessions reaching that step; option ID restricted/internal |
| `daily_complete` | Server-confirmed first completion | Unique started sessions |
| `daily_result_view` | Result visible ≥1 second | Server-confirmed completions |
| `daily_aggregate_view` | Publishable aggregate visible | Completed Read-the-Room sessions eligible for a snapshot |
| `daily_gist_open` | Linked Gist opened | Results with an eligible Gist link shown |
| `daily_insight_consent` | Grant/decline/withdraw action | Users actually shown consent prompt |
| `daily_insight_view` | My Daily Insights opened | Consented users with/without enough evidence, reported separately |
| `daily_quest_offer` | Eligible contribution UI shown | Completed users with ≥1 eligible Circle |
| `daily_quest_credit` | Server-confirmed unique credit | Quest offers; duplicate replays excluded |
| `daily_comparison_invite/accept` | Server-confirmed actions | Eligible comparison offers/invitations; future only |
| `daily_conversation_start/reply` | Existing chat events attributed to accepted comparison within predeclared window | Accepted comparisons with current chat auth; never inspect content |
| `daily_error` | Classified client/server failure | Relevant RPC attempts/sessions, by operation and retryability |

Operational metrics: fetch/answer latency, cache hit, pending duration, retry/dead-letter rate, conflict rate, aggregate suppression rate, publication failures, AI validator failures, crash-free sessions and withdrawal propagation time.

## Primary outcome and cohort

Primary metric: D7 and D30 retained use among a **pre-treatment cohort** with no inbound accepted match/message in a fixed lookback window defined before assignment. Eligibility is evaluated and frozen before exposure; treatment-created matches/messages never remove a user from the cohort.

- D7 denominator: randomized eligible users with a qualifying app open on day 0 and adequate observation window.
- D7 numerator: denominator users with any meaningful authenticated app session on days 6–8, pre-registered.
- D30 uses days 28–32.
- Report intention-to-treat first; per-protocol play analysis is secondary and non-causal.

Secondary metrics: starts/impression, completion/start, distinct play days, repeat weeks, insight revisits/eligible consented users, Quest credits/offers, Gist meaningful reads/link views, and attributed conversation starts plus replies.

Guardrails: blocks and reports per active user, comparison declines, push opt-outs (if ever introduced), uninstalls where measurable, crashes/ANRs, editorial/moderation hours, content withdrawals, and dating outcome deterioration (accepted matches/conversations/dates using existing definitions).

## Experiment design

Cells:

1. control — existing app;
2. Play — solo Daily only;
3. Play + Daily Insights;
4. Play + Daily Insights + Circle Garden.

Randomize server-side at user level, persist assignment, exclude employees/test accounts and do not change cells mid-test. Roll out sequentially if traffic cannot support four arms. Actual eligible traffic, baseline D7/D30, variance, minimum detectable effect, power, alpha, attrition and experiment duration must be calculated before launch. No traffic was accessed here, so no sample size or uplift is invented.

### Go / iterate / stop rules

- **Go:** pre-registered primary metric clears the agreed confidence interval/MDE, no material guardrail deterioration beyond approved margins, and operations meet SLOs.
- **Iterate:** completion/qualitative enjoyment is healthy but retention is inconclusive, or one optional layer harms completion without safety/privacy breach. Keep only the independently valuable layer and re-test.
- **Stop:** credible increase in blocks/reports, privacy/security incident, hidden matching influence, crash/ANR regression over release threshold, sustained content-safety burden above staffed capacity, or primary metric confidently worsens beyond the pre-agreed non-inferiority margin.

The numerical MDE, non-inferiority and guardrail margins are owner/data decisions based on actual baseline and risk tolerance; they must be recorded in the analysis plan before exposure.

## Staged validation

1. Internal editorial sandbox with synthetic accounts; no notifications.
2. Authorized staging migration and physical-device QA after environment identity proof.
3. Staff/dogfood cohort with raw operational monitoring but no production inference.
4. Small production pilot behind server kill switch and separate approval.
5. Holdout evaluation through D30; publish decision memo.
6. Expand formats/regions only after privacy thresholds and editorial capacity are demonstrated.

Rollback limitations: OTA can remove entry UI but cannot undo persisted choices or a bad publication. Therefore server kill switch, content withdrawal, permission revocation and tested data repair procedures are mandatory before pilot.
