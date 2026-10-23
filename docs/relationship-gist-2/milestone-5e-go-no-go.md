# Relationship Gist 2.0 — Milestone 5E Go/No-Go

Decision date: 2026-10-11 (Europe/London)

## Decision

`MILESTONE_5E = CONDITIONAL_PASS`

The five-migration rehearsal, data preservation, installed-client compatibility, authorization boundaries, offline behavior, engagement privacy, mocked AI failure behavior and interrupted rollout recovery passed. The implementation is not yet a reproducible release candidate because the generated database types are stale and Gist integration remains mixed with unrelated dirty-worktree changes.

This decision does not authorize staging deployment.

## Gate summary

| Gate | Status | Evidence |
| --- | --- | --- |
| Positively identified disposable target | PASS | Two unique project IDs, ports, labels and containers verified; existing local stack excluded |
| Staging-equivalent baseline | PASS | Synthetic equivalent of the verified 231-migration/four-Gist baseline; no personal data |
| Five migrations in exact order | PASS | 236-entry final ledger; exact SHA-256 values recorded |
| Legacy compatibility | PASS | Authenticated legacy reader returned four Gists at every partial migration state; RPC signatures retained |
| Data preservation/backfill | PASS | Four Gists and reader state retained; four editions/revisions created; zero missing backfills |
| Persistent editorial lifecycle | PASS | Separate committed transactions plus PostgreSQL restart/reconnect |
| Offline/account isolation | PASS | 33 pgTAP assertions and 17 Jest interaction tests include duplicate, stale, reconnect and account-switch paths |
| Engagement privacy/security | PASS | 49 pgTAP assertions; one active reaction, private Reflection isolation, payload-free analytics |
| Failure recovery | PASS | Partial states safe; migration-5 failure atomic; clean retry succeeded |
| Concurrent publication | PASS | One winner, one fail-closed result, one publish audit event |
| AI provider exhaustion | PASS | Mocked provider stopped at 2/2 attempts; no real request or publication |
| TypeScript/lint/tests | PASS | TypeScript clean; scoped lint clean; Node 47/47; Jest 17/17; pgTAP 196/196 |
| Generated schema types | FAIL | Checked-in types lack every new Gist table/RPC sampled from the migrated schema |
| Reproducible source extraction | CONDITIONAL | `explore.tsx` and shared auth/Supabase/type files are mixed with unrelated work |
| Real OpenAI verification | PENDING | No approved budget/credential; no request made |
| Physical-device validation | PENDING | Existing iOS/Android matrix not executed in this milestone |

## Genuine remaining blockers

1. Regenerate and review `supabase/types/database.ts` from a database containing all five migrations. The current checked-in file lacks `relationship_gist_editions`, `relationship_gist_revisions`, AI jobs, reactions, Reflections and the transition RPC.
2. Produce an isolated release-candidate source set. `app/(tabs)/explore.tsx` is a large mixed Circles/Live/Gist diff; shared auth, Supabase and package files are also dirty. Do not commit the whole worktree as a Gist release.
3. Recalculate the manifest hashes and rerun TypeScript, lint, Node/Jest, pgTAP, persistent lifecycle and `git diff --check` from that exact isolated candidate.
4. Before enabling AI in staging, complete the separately controlled real-provider check with an explicit maximum budget, staging-only credentials, fictional content, cost/provenance evidence and proof of no publication authority.
5. Before user exposure, execute the approved physical-device matrix on iOS and Android, including offline termination/reconnect, account switching, accessibility, reduced motion and default-off flag behavior.

The use of a synthetic-equivalent rather than sanitized staging snapshot is disclosed, but it is not itself a migration failure. Before staging execution, take an approved backup and rerun the preflight against current target metadata and volume.

## Recommended staged rollout plan

Every phase requires new explicit authorization.

1. **Freeze candidate:** isolate the manifest paths, surgically review mixed files, regenerate database types, keep all Gist 2.0 flags off and rerun local gates.
2. **Staging preflight:** verify staging project identity, migration ledger, extensions, four legacy Gists, reader-state count, admin roles, backup/restore readiness and zero unexpected schema drift.
3. **Database-only staging migration:** apply the five exact hashes in order with flags off. Stop on any missing prerequisite, warning outside the known idempotent notices, legacy-count change, orphan, duplicate edition, incomplete backfill or signature drift.
4. **Read-only verification:** confirm the 236-version ledger, legacy payloads/timestamps, reader state, edition/revision cardinality, RLS/grants, function ownership and authenticated legacy reader behavior.
5. **Function deployment disabled:** deploy the reviewed AI function only after database verification; retain server and client AI flags off. Run auth/environment/draft-only probes with mocked or explicitly budgeted provider access.
6. **Internal Reader V2/Saved Library cohort:** enable only for named staging testers, monitor outbox receipts, account isolation, crash/error telemetry and legacy fallback.
7. **Engagement cohort:** enable reactions/Reflections separately; verify aggregate accuracy, private text isolation, rate limits and delete semantics.
8. **AI editorial cohort:** enable only for authorized editors after real-provider validation; publication remains human-only.
9. **Physical-device sign-off:** complete iOS/Android online/offline/accessibility evidence before any wider staging recommendation.

## Stop/rollback strategy

- **Before migration commit:** stop immediately on identity mismatch, ledger drift, missing extension, backup failure or prerequisite mismatch. Make no schema change.
- **During migration:** each file is transactional. On failure, verify no partial objects, correct only the proven prerequisite and retry the unchanged hash. Never mark a failed migration applied manually.
- **After migration, before flags:** keep all client/server flags off. Legacy clients remain the primary rollback path.
- **Client behavior:** disable Reader V2, Saved Library, engagement and AI independently. Never let legacy sync drain V2 outboxes; preserve account-scoped pending intent.
- **AI:** disable the server policy/flag and stop claims. Queued jobs remain inspectable; workers cannot publish.
- **Editorial content:** unpublish through the audited transition or roll back by creating a new revision. Never rewrite immutable published revisions.
- **Database:** migrations are additive; prefer a reviewed fix-forward migration. Do not drop new tables/functions during incident response. Restore the approved backup only for confirmed integrity loss and only through an independently authorized recovery procedure.
- **Source/Edge:** return to the previously verified artifact while flags stay off; retain database additions and receipts for forensic review.

## Final status

`MIGRATION_REHEARSAL = PASS`

`SNAPSHOT_TYPE = SYNTHETIC_EQUIVALENT`

`LEGACY_COMPATIBILITY = PASS`

`DATA_PRESERVATION = PASS`

`RELEASE_CANDIDATE_REPRODUCIBLE = CONDITIONAL`

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
