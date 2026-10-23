# Dependency-ordered implementation roadmap

All paths, migrations and PRs below are proposals. Nothing was implemented or executed in this audit.

## PR sequence

| PR | Scope and proposed paths | Acceptance criteria | Risk / rollback | Likely effort |
|---|---|---|---|---:|
| 1. Gist authorization | New migration for editorial capabilities/RPC enforcement; pgTAP under `supabase/tests/database/`; update `lib/admin/` callers. | General admin without editorial grant denied; editor cannot publish; publisher actions audited. | Locking editors out. Roll back function definitions only after security review. | 2–3 d |
| 2. Gist revisions/scheduling | Proposed `relationship_gist_editions`, `relationship_gist_revisions`, publication events; editor preview/schedule/rollback in `app/admin-editorial.tsx` or extracted admin components. | Published revision immutable; all schedules UTC/localized; rollback/withdraw audited; every lens belongs to same edition. | Data migration complexity. Dual-read and backfill before switch. | 3–5 d |
| 3. Gist reader extraction/state | `features/relationship-gists/components/`, `services/`, owner-scoped outbox; saved route; slim `app/(tabs)/explore.tsx`. | Save/unsave survives offline/restart; old saved revision accessible; explicit lens choice; read without Daily. | Reader regression. Feature-flag new route and retain adapter temporarily. | 3–5 d |
| 4. Daily DB foundation | New reviewed migration for package/challenge/node/option/session/response/editorial tables and RLS; generated types; pgTAP. | All owner/capability/RLS cases pass; no direct client writes; no production execution. | Schema flaw. Additive migration; disable via flag. | 5–7 d |
| 5. Editorial validator/drafting | `supabase/functions/daily-editorial-draft/`, shared schemas/validators; admin calendar/review/branch preview. | AI produces draft only; injection/malformed content rejected; every branch previewed; human approval required. | Unsafe content/cost. Disable worker key/flag; human-authored content still works. | 5–8 d |
| 6. Daily runtime APIs | SQL RPCs for current/start/resume/answer/complete/result; aggregate snapshot job; API types in `features/daily/api/`. | Version lock, server clock, row locking, operation replay and withdrawal behavior proven. | Race/duplicate. Kill switch blocks starts; preserve receipts. | 5–7 d |
| 7. Daily client shell | `app/daily/index.tsx`, `features/daily/components/`, reducer/service/cache; Vibes and Circles entry adapters. | One canonical route; all states; no new tab; works solo/offline pending; theme/accessibility basics. | Navigation/performance. Hide entries with flag. | 4–6 d |
| 8. Three game renderers | `features/daily/formats/`; fixtures/domain tests. | All formats/schema branches render; invalid content fails closed; replay produces no credit. | Format divergence. Shared primitives/schema and per-format flags. | 5–8 d |
| 9. Durable offline/auth recovery | Daily queue adapter or modular extension under `lib/offline/`; recovery tests. | Restart/network/A→B/multi-device cases pass; provisional state unmistakable. | Cross-account leak. Disable offline starts while retaining online play if necessary. | 3–5 d |
| 10. Daily Insights | `features/daily-insights/`, preference/event RPCs and My Insights route. | Consent, thresholds, source, exclude/reset/delete/export; no access/write to existing `relationship_compass`. | Profiling/privacy. Disable derivation and keep delete controls available. | 7–11 d |
| 11. Circle Garden | Quest/contribution migration/RPC; `features/daily/circle-garden/`; Circles entry card. | One Circle/day, active membership, frozen target, aggregate-only UI, fair rollover. | Membership races. Disable contribution flag; solo Daily unaffected. | 7–11 d |
| 12. Analytics/hardening | Daily event batching, dashboards/alerts, accessibility/performance/load/security tests; runbooks. | Exact denominators, no raw answers in logs, SLO/guardrail alerts, physical-device sign-off. | Telemetry privacy. Disable event emission; runtime independent. | 6–9 d |
| 13. Authorized staging pilot prep | Environment-specific fixtures, staging-only migration/deploy commands, editorial rehearsal and QA checklist—only after approval. | Verified staging identity, clean gates, no prod targets, kill/withdraw tested. | Wrong environment. Independent identity proof and explicit approval. | 4–7 d |
| 14. Match comparison (post-MVP) | Consent/invitation tables and RPCs; existing chat authorization integration. | Mutual consent, current match/chat auth, block revocation, no auto-message. | Abuse/privacy. Keep flag off/remove invitations. | 5–8 d |

## Dependencies

```text
Gist auth ─┬─ Gist revisions ─ Gist reader repair ─ optional Daily↔Gist link
           └─ editorial capability reused by Daily

Daily DB ─ Daily APIs ─ Daily client ─ format renderers ─ offline hardening
    └──── editorial validator/content ────────────────┘
                      │
                      ├─ Daily Insights
                      └─ Circle Garden
All MVP paths ─ analytics/security/accessibility ─ authorized staging pilot
```

The solo pilot may proceed after PRs 1–9 and 12 if Gist linking, Insights and Garden remain disabled. Do not compress capability/RLS, idempotency or offline account-isolation work to accelerate visual delivery.

## Estimates

One experienced engineer using Codex, with timely product/security review:

- optimistic: 45 engineer-days;
- likely: 56–87 engineer-days;
- pessimistic: 105 engineer-days, driven by Gist backfill, editorial iteration, accessibility and multi-device defects.

Calendar time will be longer when human editorial, legal/privacy, design, QA, staged observation and store review are included. Recurring work: roughly 2–4 editor hours per standard content package plus specialist review for sensitive topics; weekly quality sampling, buffer management and incident coverage. These are planning ranges, not measured productivity.

## Release sequence

1. Owner approves decisions and feature/data names.
2. Feature branch; local unit/component/pgTAP work with synthetic data.
3. Local full gates and dependency/security review.
4. Development builds and physical-device/offline/accessibility testing.
5. Explicitly authorize staging; independently verify EAS/Supabase/Firebase/RevenueCat/Stream identity before any command.
6. Apply staging-only migrations/functions and load reviewed fixtures.
7. Editorial dry run, security/privacy QA, rollback/withdraw rehearsal.
8. Separately approve production migrations and feature-flagged pilot.
9. Randomized measurement through agreed window; go/iterate/stop review.

Production rollout must be independently authorized. OTA can ship compatible JS UI, but schema/RPC/native/runtime compatibility must be reviewed per change; do not assume an OTA can roll back database state.

## Explicit MVP exclusions

- Sparks rewards, purchasing or farming;
- competitive leagues, individual leaderboards or streak penalties;
- Oware, virtual city and Live Game Nights;
- unrestricted comments or public user-generated prompts;
- autonomous AI publishing;
- Live/Odo/Quick Connect rebuild;
- compatibility scores/percentages or matching influence;
- push reminders until opt-in, quiet hours and abuse controls are separately approved;
- a new bottom tab or new state-management framework.

## Definition of done for pilot

- Solo experience remains complete with Insights/Garden/Gist off.
- All server-authority, RLS, idempotency, aggregate and account-switch gates pass.
- Human-reviewed 14-day buffer exists for each launch locale.
- Kill switch and per-content withdrawal are demonstrated in staging.
- Daily Insights has approved DPIA/privacy copy or remains off.
- Real traffic baseline and pre-registered experiment plan exist.
- Monitoring/runbooks have named owners.
- Explicit staging and production approvals are recorded separately.
