# Milestone 5H-C — Relationship Gist staging security hardening

Date: 2026-10-11

Scope: isolated local release candidate only

Baseline: `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a`

## Result

The two trigger-only `SECURITY DEFINER` functions identified during the staging deployment review are now hardened locally by a forward-only migration:

- `public.relationship_gist_ai_clone_provenance()`;
- `public.relationship_gist_ai_enforce_review_gate()`.

The migration revokes direct `EXECUTE` from `PUBLIC`, `anon`, `authenticated`, and `service_role`. It does not replace either function, alter function ownership, change trigger logic, or touch unrelated grants. PostgreSQL trigger invocation remains available through the two existing enabled trigger bindings.

No remote migration was applied.

## Local implementation

| Artifact | Purpose | SHA-256 |
| --- | --- | --- |
| `supabase/migrations/20261011170000_relationship_gist_trigger_function_execute_hardening.sql` | Exact-signature revocation and postcondition assertions | `42CA85CA878E4506F42FEE1E12B7E5EA3CBBDD24FA5BC98452551F9AB7D894AB` |
| `supabase/tests/database/relationship_gist_trigger_function_execute_hardening_test.sql` | PUBLIC, anonymous, authenticated, service-role, trigger-binding and compatibility tests | `DAB3F73494AF3E219B1F912F9E8C7467E87159EB8122DB53AFF180F9F6CC4A85` |

The migration fails closed if either exact zero-argument signature is missing. Its postcondition block verifies:

1. no PUBLIC `EXECUTE` ACL remains;
2. `anon`, `authenticated`, and `service_role` cannot execute either function;
3. `relationship_gist_ai_clone_provenance_trigger` remains enabled on `public.relationship_gist_revisions` and points to the exact provenance function;
4. `relationship_gist_ai_review_gate_trigger` remains enabled on the same table and points to the exact review-gate function.

Owner privileges are not changed. Trigger execution continues under PostgreSQL's normal trigger and `SECURITY DEFINER` semantics.

## Disposable database validation

The migration was applied only to the positively isolated local project `gist2-5hc-20261011` on PostgreSQL port `55322`. The project used its own Docker project identity and ports. It was not linked to Supabase Staging or Production.

The complete local migration sequence required a temporary, disposable-only staging identity shim in the copied `20261006150000_push_environment_provenance_hardening.sql`, because that unrelated push migration deliberately rejects unknown local webhook hosts. The shim existed only in the temporary harness; the release-candidate migration was not altered.

| Validation | Result |
| --- | --- |
| All candidate migrations through `20261011170000` | PASS |
| New trigger-function hardening pgTAP | PASS, 18/18 |
| Existing Gist pgTAP suites | PASS, 196/196 |
| Gist pgTAP total after hardening | PASS, 214/214 |
| Focused `supabase/tests/database` directory, including membership regression | PASS, 275/275 |
| Legacy reader RPC signatures | PASS |
| Editorial permissions and transition RPC compatibility | PASS |
| Provenance cloning and review-gate workflow | PASS through existing AI editorial suite |

A recursive repository-wide pgTAP run executed 920 assertions. It passed 915 and reported five failures in the unrelated `content_safety_moderation.sql` suite: assertions 19, 20, 22, 23, and 27. All seven focused database files, every Gist test, and the new security test passed. This task did not modify or diagnose the unrelated moderation suite, so those failures are recorded rather than attributed to the Gist change.

## Disposable authenticated-role canary design

No staging accounts or rows were created in this milestone.

Use five unique, test-only Supabase Auth identities. Each identity requires a matching active `profiles` row. Assign only the following `internal_admins.role` rows:

| Identity | `internal_admins.role` | Expected Gist permissions |
| --- | --- | --- |
| Support canary | `support` | all false; no editorial read |
| Moderation canary | `moderation` | read and safety review only |
| Operations canary | `operations` | read, draft, publish, and archive; no quality or safety approval |
| Super-admin canary | `super_admin` | all current editorial capabilities |
| Ordinary-member canary | no row | all false |

Minimum safe read-only canaries:

1. authenticate each identity independently;
2. call `rpc_get_my_relationship_gist_editorial_permissions()` and compare the exact matrix above;
3. call `rpc_admin_get_relationship_gists()` only for moderation, operations, and super admin and verify support/member receive `editorial_read_forbidden`;
4. verify both hardened trigger-function names remain unavailable through PostgREST for every identity;
5. verify `rpc_get_global_relationship_gists()` remains readable under the existing reader policy;
6. do not call publish, archive, schedule, revision, reaction, Reflection, or AI mutation RPCs against live staging content.

Mutation-boundary canaries require a separately approved disposable Gist edition and must use unique fixture IDs. They should prove support/member denial, moderation safety-only authority, operations publication authority, super-admin quality authority, self-approval separation, and immutable audit events. Delete the fixture edition only through the approved forward cleanup procedure; do not edit existing staging Gists.

Cleanup requirements:

- remove the four temporary `internal_admins` rows;
- remove test-only profiles and Auth users after checking for dependent rows;
- remove any separately approved fixture edition, reader state, audit events, AI jobs, reactions, and Reflections in dependency-safe order;
- confirm existing Gist counts and hashes are unchanged;
- retain only redacted pass/fail evidence, never tokens or private profile data.

## Rollback

Before remote deployment, remove the new migration and test from the isolated candidate and restore the prior 55-file manifest/patch.

After an authorized staging deployment, do not down-migrate. If a compatibility problem appears, keep every Gist 2.0 flag disabled and ship a reviewed forward migration restoring only the minimum required grant. Direct execution of these trigger functions is not required by the client, Edge Function, or service role.

## Remaining authorization

- The new migration has not been applied to staging.
- The five staging canary identities have not been created.
- No live authenticated role canary has been executed.
- Feature flags remain disabled.

`SECURITY_HARDENING_LOCAL = PASS`

`STAGING_SECURITY_MIGRATION_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`COMMITS = NONE`
