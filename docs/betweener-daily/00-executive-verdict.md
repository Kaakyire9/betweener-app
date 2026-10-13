# Betweener Daily: executive verdict

## Verdict: CONDITIONAL GO

Betweener can ship a valuable Daily Play pilot on the existing Expo, Supabase, offline, Circles, moderation, and design foundations. The recommended MVP is one canonical `/daily` experience containing three short solo formats, optional private Daily Insights, and one opt-in cooperative Circle Garden. It must remain useful with no match, Circle, payment, or other person online.

Daily must not depend on Relationship Gist until the Gist publishing and reader-state defects below are repaired. The new reflection system must also be isolated from the existing `relationship_compass` discovery feature: that field currently feeds profile recommendations and is not a safe home for private game reflections (`app/relationship-compass.tsx:493`, `app/relationship-compass.tsx:592`, `app/relationship-compass.tsx:652`).

No tests were executed and no remote state was inspected during this audit. Findings describe the current local worktree, including uncommitted files.

## Top five blockers

1. **Name and data-boundary collision.** “Connection Compass” conflicts with the shipped Relationship/Love Compass, which writes to `profiles.relationship_compass` and requests recommendations. Use a separate `daily_reflection_*` model and preferably the user-facing name **Daily Insights** until product naming is approved.
2. **Gist editorial authority is too broad.** Gist mutation RPCs call the general `is_admin_user` check (`supabase/migrations/20260831130000_relationship_gist_hardening.sql:111`), while the newer UI capability model distinguishes editorial roles (`supabase/migrations/20261007180000_admin_operations_context.sql:38`). Backend enforcement must match the capability.
3. **Gist state is not durably offline-safe.** Local state has no outbox/conflict metadata (`lib/relationship-gists/local-state.ts:1`); the Circles screen only uploads local state when the server row is absent (`app/(tabs)/explore.tsx:499`). Save/unsave on an existing server row can be lost.
4. **No server-authoritative Daily domain exists.** Challenge versions, sessions, completions, real aggregates, reflection consent, Quest credits, editorial review, and RLS are all MISSING. Client completion cannot be trusted.
5. **No general Daily rollout/analytics control exists.** Economy has a feature-config pattern, but Daily has no server-owned kill switch, cohort assignment, exposure ledger, or privacy-safe event pipeline. A pilot cannot be evaluated safely without these.

## Recommended MVP

- A Vibes entry card and a Circles entry card both navigate to one `/daily` route; do not add a bottom tab.
- One server-selected, version-locked challenge per release day, playable alone in 1–3 minutes.
- Formats: What Would You Do?, Read the Room, and Date Rescue.
- Read the Room shows only real totals after a minimum threshold and never labels the majority “correct.”
- Daily Insights is opt-in, private, conservative, explainable, resettable, exportable, and disconnected from matching.
- A member may explicitly select one eligible Circle; a confirmed Daily completion contributes once per release day to a weekly cosmetic Connection Garden. No answers, player list, Sparks, streak pressure, or league.
- Gist remains an independent reader. An approved Daily package may link to an immutable published Gist revision; playing and reading never require one another.
- No public comments in MVP. Consented match comparison is a later pilot and requires mutual consent plus current server chat/block authorization.

## Critical product choices

- Approve “Daily Insights” or another non-conflicting name.
- Choose a launch clock. Recommendation: one global UTC release for the first pilot; regional calendars can follow once editorial capacity and traffic justify them.
- Set the aggregate privacy threshold. Recommendation: at least 20 valid completions per option set, with coarse counts/percentages and suppression below threshold.
- Approve initial Circle target formula and whether members can change their selected Circle before their daily contribution is committed.
- Select pilot audience only after actual eligible traffic and statistical power are measured.

## Delivery estimate

For one experienced engineer using Codex, including review and QA but excluding App Store review and waiting time:

| Phase | Likely effort |
|---|---:|
| Mandatory Gist repairs | 8–13 engineer-days |
| Daily foundation + editorial workflow | 12–18 engineer-days |
| Three playable formats + offline recovery | 12–18 engineer-days |
| Daily Insights | 7–11 engineer-days |
| Circle Garden | 7–11 engineer-days |
| Hardening, analytics, accessibility, staging pilot | 10–16 engineer-days |
| **Total likely** | **56–87 engineer-days** |

Optimistic: 45 days. Likely: 56–87 days. Pessimistic: 105 days. Add recurring human editorial/safety review; AI drafting reduces drafting effort, not accountability.

## Decision rule

Proceed only after the owner approves the choices in [08-open-questions-and-decisions.md](./08-open-questions-and-decisions.md). Implementation should begin with Gist correctness and an isolated Daily data boundary, not UI animation or retention mechanics.
