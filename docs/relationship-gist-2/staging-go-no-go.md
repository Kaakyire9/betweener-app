# Relationship Gist 2.0 — Staging Go/No-Go

Audit date: 2026-10-11
Decision: **NO-GO**

| Gate | Status | Evidence / condition |
| --- | --- | --- |
| 1. Repository reproducibility | CONDITIONAL_PASS | Local validation passed, hashes are stable and migration order is deterministic; release source is still a 136-entry dirty worktree with untracked Gist and unrelated files |
| 2. Migration dependency safety | PASS | Remote ledger has exactly 231 applied entries through the staging fixture; the five reviewed Gist migrations are the only pending entries and all live prerequisites exist |
| 3. Staging schema compatibility | PASS | Live baseline tables, extensions, columns, RPC signatures, RLS, grants, policies, indexes, triggers and constraints were inspected read-only and match the expected predecessor schema |
| 4. Environment isolation | PASS | EAS API, preview environment, app config and negative verifiers agree on dedicated staging EAS/Supabase/app identities; `.env*` is excluded from EAS archives |
| 5. AI worker readiness | CONDITIONAL_PASS | Local real Edge Runtime and mocked modules passed; function is not deployed, AI migration/policy are pending, required enable/environment secrets are absent, and real provider remains pending |
| 6. Feature-flag safety | PASS | Exact mobile flags are literal-`true`, build/OTA-time and absent from EAS preview; account-scoped queues are retained while disabled; server AI additionally fails closed |
| 7. Old-client compatibility | CONDITIONAL_PASS | Legacy RPC signatures/adapters passed local tests; migrated staging and physical devices remain unverified |
| 8. Data preservation | CONDITIONAL_PASS | Baseline is recorded: 4/4 published fixture Gists and 1 reader-state row (0 saved); post-migration preservation still requires snapshot rehearsal and postcondition comparison |
| 9. Local validation coverage | CONDITIONAL_PASS | TypeScript, lint, 41/41 Node, 17/17 Jest, 196/196 pgTAP, persistent DB and mocked Edge Runtime passed; real OpenAI and physical-device paths remain pending |
| 10. Deployment runbook completeness | PASS | Dependency-gated, target-verified phases, stop conditions, evidence and forward-safe recovery are documented |

## Genuine blockers

1. Produce a clean, reviewed release candidate; the current dirty worktree cannot be deployment input.
2. Rehearse the five exact migrations against an approved staging-equivalent snapshot and compare the recorded 4-Gist/1-reader-state baseline after migration.
3. Regenerate/review Supabase types from the migrated target schema.
4. Produce dedicated `testflightStaging` and `playStaging` artifacts only under future build authorization; none currently exist in the dedicated EAS project.
5. Complete iOS/Android physical-device QA and a separately budgeted real-provider canary before feature activation.

## Verified identities

- Supabase host/project ref: `xsgzxadwuxuziubglvps` (configuration, Management API, ledger and server-owned staging identity verified).
- EAS: `@kaakyire9/betweener-staging`, `7f38a835-2da7-419b-a20b-e1a12e021547`.
- iOS/Android: `com.aduboffour.betweener.staging`.
- Updates URL: `https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547`.
- Store staging channel: `staging`; branch currently has zero update groups.
- Completed dedicated development builds use channel `development`, runtime `1.2.0`, commit `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a`.

## Authorization decision

No staging deployment may begin from this result. The preflight is conditionally sound, but a clean release candidate, snapshot rehearsal and a new explicit authorization are required for migrations. Separate authorization remains required for secrets, Edge Function deployment, policy rows, builds, OTA publication or a real OpenAI request.

`STAGING_PREFLIGHT = CONDITIONAL_PASS`

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
