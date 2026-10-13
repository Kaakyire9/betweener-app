# Relationship Gist 2.0 local engineering plan

Plan date: 2026-10-10 (Europe/London)

Target: Betweener v1.2.0

Execution boundary: local worktree and local tests only

Milestone represented: 0 — reproducible baseline and change plan

## 1. Milestone 0 verdict

**CONDITIONAL PASS**

The existing Gist reader can be upgraded incrementally without replacing its public data model or changing installed-client contracts. The first implementation milestone must remain isolated from the unrelated Circles/Live edits already present in `app/(tabs)/explore.tsx`, and its database authorization must query the baseline `internal_admins.role` data directly rather than depend on `20261007180000_admin_operations_context.sql`, which Production does not record.

No source file or migration was changed in Milestone 0. This document is the only new deliverable.

## 2. Verified repository baseline

| Item | Verified value |
|---|---|
| Repository | `C:\Projects\betweener-app` |
| Branch | `feature/betweener-live` |
| HEAD | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Worktree | Dirty before Milestone 0 |
| Remote access in this milestone | None |
| Local database used | No |

### Gist, admin, and migration files present before this plan

| Path | Git state before plan | SHA-256 |
|---|---|---|
| `docs/relationship-gist-2/parity-verification.md` | Untracked | `0D91755778BC091BAD0562062BFC02CD8D99E1CC8C44D3BB402847F4A220BFA6` |
| `app/(tabs)/explore.tsx` | Modified | `46065D3ABF8CF3961E447804DD173359FB91B4F524E3E9F3DE87BBC7B803E094` |
| `app/admin-editorial.tsx` | Untracked | `87911D675542325856C45E59530294379E56F9D7009B46B2E7741A50FE0BF3F1` |
| `components/circles/CirclesHomeCards.tsx` | Tracked/unchanged | `3CA7967D8C694EEC8F3C12C98C8A810B6291E70F8331107D40AA7F410DC2E007` |
| `features/relationship-gists/domain/relationship-gist.ts` | Tracked/unchanged | `57D55413045CB6D83098C36719C28793EADC547773A2CD4BFC161AF66EBEC7B0` |
| `lib/relationship-gists/local-state.ts` | Tracked/unchanged | `F170C32747107F0CEB1507E073FCD6A412C27F887797ABCDFC9A59A23B55A4FA` |
| `lib/offline/circles-store.ts` | Tracked/unchanged | `716885759A4A796C68FB4BC79CDEFFDB83F48F7077CD70169B58A7B62BE3940F` |
| `__tests__/relationship-gist-hardening.test.ts` | Tracked/unchanged | `D3E890402ADA7C1201F22B22B493CDE6D5C6B7FFD1E7F41BA56FC093F4D5EB4B` |
| `supabase/migrations/20260831130000_relationship_gist_hardening.sql` | Tracked/unchanged | `E18AC8AF47FA4E0ABE1D60D746D1A86F32E4EF91ED649E1D677476F553D3E7FE` |
| `supabase/migrations/20261007180000_admin_operations_context.sql` | Untracked | `33D1843981FBF5D1B3E0789F553610F4E9DCBC90ADD739553A1FB11DA50863F8` |
| `supabase/migrations/20261008090000_relationship_gist_staging_fixtures.sql` | Untracked | `6249F6B9109741F2F91A28A841D860BA8A5FECF6CFADD1AA9B4964270D465A9E` |

`supabase/migrations/20261007223000_circle_staging_readiness_hardening.sql` is also an untracked, pre-existing migration. The worktree contains many additional user changes across authentication, admin, Circles, Live, tests, `package.json`, and generated Supabase types. They are outside Gist 2.0 and must not be staged, reverted, reformatted, or absorbed into Gist commits.

### Overlap risk

`app/(tabs)/explore.tsx` is the only direct source overlap. Its current uncommitted changes implement Circles/Live loading, retry, and discoverability behavior rather than Gist 2.0. Milestone 1 must:

1. hash and diff this file again immediately before editing;
2. extract existing Gist blocks without rewriting adjacent Circles/Live code;
3. use narrow patches and review the final diff by hunk;
4. stop if the file changes concurrently or clean extraction cannot be proven.

The untracked `app/admin-editorial.tsx` and migrations belong to the user's existing work. They may be extended only in the explicitly approved milestone and must not be renamed or replaced.

## 3. Current implementation trace

### Public reader path

1. `app/(tabs)/explore.tsx` loads `rpc_get_global_relationship_gists()`.
2. If the RPC is unavailable, it selects published global rows from `relationship_gists` directly.
3. `buildVisibleRelationshipGistPerspectives` and `buildRelationshipGistSelectionOrder` choose among the six legacy perspective strings.
4. `RelationshipGistCard` in `components/circles/CirclesHomeCards.tsx` opens the reader modal.
5. `buildRelationshipGistReaderContent` parses lead, sections, and takeaway.
6. Native Share handles sharing; the Circles card and route remain the only discovery entry.

The zero-argument read RPC currently returns exactly:

```text
id, title, short_body, body, perspective, published_at, updated_at
```

That signature and column order are installed-client contracts.

### Reader-state path

- AsyncStorage uses `relationship-gist-local-state:v1:<userId-or-guest>`.
- Hydration merges local state with `relationship_gist_user_states`.
- Writes update AsyncStorage first and then call the six-argument `rpc_upsert_relationship_gist_user_state`.
- Progress is monotonic on the server, but save/unsave has no durable local outbox, acknowledgement, or conflict token.
- Persistence failures are swallowed.
- A debounce timer can be cleared during unmount without flushing its latest progress.
- Scroll progress is stored, but no stable content anchor is restored after layout.
- Short content is marked 100% as soon as content height fits the viewport.
- Async completions are keyed by user ID but are not guarded by a reader-specific auth epoch.

### Editorial path

- `app/admin-editorial.tsx` is UI-gated by the broad `editorial` admin capability.
- The current editor lists with `rpc_admin_get_relationship_gists`, writes through `rpc_upsert_relationship_gist_editorial`, and archives through `rpc_archive_relationship_gist_editorial`.
- The existing upsert accepts `draft` or `published` and mutates a published row in place.
- Database authorization is based on broad `is_admin_user(auth.uid())`, not an action-specific editorial policy.
- The baseline `internal_admins` table and its constrained roles exist independently of the later admin-context migration.
- Anonymous execute is revoked by `20260831130000_relationship_gist_hardening.sql`, but server-side least privilege between support, moderation, operations, and super-admin is absent.

### Environment and deployment boundary

- `app.config.js` defaults an omitted `APP_VARIANT` to Production.
- Staging is selected only by explicit `APP_VARIANT=staging` and has a distinct Supabase project.
- No local database was proven disposable in Milestone 0. SQL tests therefore remain unexecuted until a future milestone verifies a local Supabase URL and container ownership before reset/test commands.
- No remote function definition, RLS body, grant, data row, build, or deployment is assumed from this plan.

## 4. Compatibility contract

The following must remain valid through all milestones:

| Contract | Preservation rule |
|---|---|
| `rpc_get_global_relationship_gists()` | Keep zero arguments and the existing seven-column result. New readers may use a separate versioned RPC. |
| `rpc_upsert_relationship_gist_user_state(uuid, boolean, double precision, timestamptz, boolean, text)` | Keep signature and semantics for old clients. Add an idempotent v2 RPC rather than replacing it. |
| Direct `relationship_gists` fallback | Retain legacy columns, authenticated published-row read policy, and current filters until installed-client retirement is separately approved. |
| `gist_id` reader state | Preserve as the legacy stable identifier. New edition/revision records map to it. |
| Six perspective strings | Preserve `general`, `christian`, `muslim`, `culture`, `safety`, `communication`. |
| AsyncStorage v1 | Read and preserve `relationship-gist-local-state:v1:<user>`. Add versioned state/outbox keys; never delete v1 during migration. |
| Circles snapshot v1 | Keep the current snapshot schema readable. Add optional fields only through a versioned adapter. |
| Native share and accessibility | Preserve native Share, accessibility labels, reduced-motion handling, focus, and no nested preview scroll. |
| Existing discovery | Keep the Circles card and existing paths; do not add a bottom tab. |

## 5. Change-impact matrix

| Concern | Current owner | Current weakness | Proposed owner/change | Compatibility impact |
|---|---|---|---|---|
| Gist fetch/fallback | `app/(tabs)/explore.tsx` | Screen owns transport and fallback details | `features/relationship-gists/data/relationship-gist-repository.ts` | Same RPC and direct-table fallback |
| Reader orchestration | `app/(tabs)/explore.tsx` | State, timers, network, modal UI coupled | `hooks/use-relationship-gist-reader.ts` plus `components/RelationshipGistReader.tsx` | Adapter preserves props/visual behavior |
| Local reader state | `lib/relationship-gists/local-state.ts` | Silent failure; no dirty fields or ack | Versioned feature storage with observable typed failures | v1 remains readable and unchanged |
| Offline mutations | Fire-and-forget RPC | Save toggle can be lost; no replay | Gist-owned durable outbox modeled on `lib/offline/mutation-queue.ts` | Old mutation RPC remains callable |
| Server idempotency | None for Gist state | Duplicate/reordered mutations | Versioned mutation RPC using existing `app_mutation_receipts` pattern | New client only; old RPC unchanged |
| Multi-device saves | Last server arrival silently wins | Stale offline toggle can overwrite newer state | Saved-state revision precondition and explicit conflict result | New v2 RPC only |
| Progress completion | Offset/height calculation | Short articles complete immediately | Layout-ready + foreground dwell for short content; scroll threshold for long content | Stored range remains 0..1 |
| Resume | Numeric progress only | No reliable scroll restoration | Stable section anchor + intra-section offset with progress fallback | Legacy progress still honored |
| Auth isolation | User-keyed storage | In-flight result can cross auth transition | Owner ID/profile ID + reader auth epoch checked before apply/drain | No shared guest private state |
| Editorial authorization | Broad `is_admin_user` | Support/general admin may reach mutations | SQL action predicate based directly on `internal_admins.role` | Existing RPC signatures retained |
| Editorial lifecycle | Mutable gist row | Publishing resets timestamps/content in place | Edition/variant/immutable revision/publication/audit model | Dual materialization to legacy row |
| Perspective model | Independent articles; religious inference | No linked topic identity; implicit sensitive inference | Linked optional variants; neutral default; explicit lens choice | Legacy strings and rows remain |
| Targeting | Fields/UI imply targeting | Server enforcement unproven | Hide claims until server-enforced selector exists | Global old reader remains safe |
| AI drafting | None | N/A | Gist-specific server draft job and schema; human-only approval | No impact when flag disabled |
| Reactions | None | N/A | Gist-specific revision-bound private rows and safe aggregates | Independent from Moments/Circle Pulse |
| Reflections | None | N/A | Dedicated owner-only storage/outbox | Never enters Circle, Chat, Compass, or Daily |

## 6. Dependency-ordered migration sequence

These filenames are reserved proposals. Before creation, re-list migrations and stop on any version/name collision. Historical and staging-fixture migrations are never edited.

| Order | Proposed additive migration | Milestone | Purpose |
|---:|---|---:|---|
| 1 | `20261010120000_relationship_gist_editorial_capability_hardening.sql` | 1 | Action-specific role predicate; harden existing admin list/upsert/publish/archive RPC bodies and grants without depending on `rpc_get_my_admin_context`. |
| 2 | `20261010121000_relationship_gist_reader_state_idempotency.sql` | 1 | Add reader-state revision/anchor fields, idempotent v2 mutation RPC, conflict result, indexes, ownership checks, and receipt cleanup compatibility. |
| 3 | `20261010122000_relationship_gist_editorial_model_v2.sql` | 2 | Editions, optional perspective variants, immutable revisions, publication records, transition/audit events, RLS, and transition RPCs. |
| 4 | `20261010123000_relationship_gist_legacy_adapter_v2.sql` | 2 | Dual-read/materialization adapter, stable legacy `gist_id` mapping, new reader/library RPCs, and old seven-column contract tests. |
| 5 | `20261010124000_relationship_gist_ai_draft_jobs.sql` | 3 | Environment-bound draft jobs, attempts, provenance, review metadata, rate/concurrency constraints, and service-role draft-only grants. |
| 6 | `20261010125000_relationship_gist_engagement.sql` | 4 | Revision-bound Helpful/Resonated/Made-me-think reactions, idempotent mutation RPC, safe aggregate RPC, rate limits, and deletion behavior. |
| 7 | `20261010130000_relationship_gist_private_reflections.sql` | 4 | Owner-only private reflections with create/update/delete/export and account-deletion behavior. |

An idempotent, reviewable backfill is planned as `scripts/relationship-gist-2/build-legacy-edition-backfill.sql`. It will not execute automatically inside a migration and will not be run against any remote environment without separate authorization. It must emit a dry-run inventory, map each legacy row once, preserve every legacy ID, and be safe to repeat.

### Dependency-safe editorial role contract

Milestone 1 should implement the following default matrix unless the owner changes it before approval:

| Action | operations | moderation | support | super_admin | anonymous/non-admin |
|---|---:|---:|---:|---:|---:|
| read editorial queue | Allow | Allow | Deny | Allow | Deny |
| create/update draft | Allow | Deny | Deny | Allow | Deny |
| review/approve | Deny in M1; reserved for M2 | Allow in M2 | Deny | Allow | Deny |
| publish/schedule | Allow | Deny | Deny | Allow | Deny |
| archive/withdraw | Allow | Deny | Deny | Allow | Deny |

The SQL predicate will read `public.internal_admins` directly, require `auth.uid()`, use a fixed `search_path`, validate actor-profile ownership, and never trust a client-supplied role. Existing RPC names/signatures stay in place, but their bodies call the action predicate. A separate permissions RPC may return booleans for UI presentation; it is not the authority.

Production's missing admin-context migration is therefore not a dependency. Production rollout remains blocked pending its separate migration-history and deployed-definition review.

### Reader-state v2 transaction contract

The new mutation API should accept an operation ID, gist ID, dirty-field patch, expected saved-state revision, and optional stable anchor. It should:

1. derive the profile from `auth.uid()`;
2. lock by authenticated user + operation ID;
3. return a prior receipt for duplicate delivery;
4. validate that the target is a currently readable global Gist;
5. merge progress monotonically;
6. apply save/unsave only when the expected save revision matches;
7. return `applied`, `duplicate`, or `conflict` with authoritative state;
8. write state and receipt in the same transaction.

Conflict policy is deliberately explicit:

- Matching revisions apply and increment the saved-state revision.
- A duplicate operation returns its original result.
- A stale mutation that already requests the authoritative value is acknowledged as converged.
- A stale mutation requesting a different value is not silently replayed over newer device state. It remains locally visible as a conflict with Retry/Use-current-state choices.
- Progress always merges by maximum; timestamps merge by maximum; perspective uses the latest acknowledged explicit selection.

This is deterministic, protects newer device intent, and prevents silent loss. It is safer than trusting client clocks or blind last-arrival-wins.

The outbox will be Gist-owned rather than expanding the already large global mutation queue. It will reuse its proven conventions: owner-scoped records, UUID operation IDs, eight bounded attempts, exponential retry, foreground/network drain, failed-item retention, and telemetry containing codes/counts only. Queue records must contain `ownerUserId`, `ownerProfileId`, and a reader auth epoch. Logout clears visible state immediately and suspends, rather than reassigns, the old owner's records. A different account can never display or drain them.

## 7. Feature flags and rollback

### Flags

Create a Gist-specific flag adapter; do not add Gist flags to economy configuration.

| Flag | Default | Purpose |
|---|---:|---|
| `relationship_gist_reader_v2_enabled` | Off | Select extracted reader/outbox path; legacy path remains available. |
| `relationship_gist_editorial_v2_enabled` | Off | Expose edition/revision workflow in Creator Studio. |
| `relationship_gist_ai_drafts_enabled` | Off | Permit draft-job creation; never grants approval/publication. |
| `relationship_gist_reactions_enabled` | Off | Expose reaction controls and aggregate counts. |
| `relationship_gist_private_reflections_enabled` | Off | Expose owner-only reflection UI. |

Client flags must fail closed on missing/malformed config. Production must additionally force all new flags off until a separate production authorization, following the existing environment-bound economy flag pattern. A build-time flag may enable local tests, but a server kill switch is required before any pilot.

### Rollback rules

- UI rollback: disable the relevant flag; keep legacy reader/card paths.
- Reader sync rollback: stop new v2 enqueue/drain; preserve v1 state and v2 pending records for repair/export. Never delete a user's queue during rollback.
- Database rollback: additive tables/columns remain. Revoke new RPC execute rights or forward-fix functions; do not restore broad admin authorization.
- Editorial rollback: withdraw the publication pointer or publish a corrective immutable revision. Never mutate a published revision.
- AI rollback: disable job creation/provider invocation; human-authored drafts remain functional.
- Engagement rollback: hide writes, preserve deletion/export access and existing private data.
- OTA rollback cannot undo schema or publication state. Server kill switches and forward-only repair are mandatory.

## 8. Milestone plan and file-by-file edits

### Milestone 1 — security, reader reliability, feature extraction

Planned files:

- Add `supabase/migrations/20261010120000_relationship_gist_editorial_capability_hardening.sql`.
- Add `supabase/migrations/20261010121000_relationship_gist_reader_state_idempotency.sql`.
- Add `supabase/tests/database/relationship_gist_editorial_capabilities_test.sql`.
- Add `supabase/tests/database/relationship_gist_reader_state_v2_test.sql`.
- Add `features/relationship-gists/data/relationship-gist-repository.ts` for read RPC, state hydration, direct-table fallback, and typed failure mapping.
- Add `features/relationship-gists/sync/relationship-gist-outbox.ts` for owner-scoped durable mutations and drain policy.
- Add `features/relationship-gists/hooks/use-relationship-gists.ts` for list/cache/fallback orchestration.
- Add `features/relationship-gists/hooks/use-relationship-gist-reader.ts` for visible state, auth epoch, progress flush, resume, save conflict, and AppState behavior.
- Add `features/relationship-gists/components/RelationshipGistReader.tsx` by extracting the existing modal with minimal visual change.
- Add `features/relationship-gists/config/relationship-gist-feature-flags.ts` with local-safe defaults.
- Update `features/relationship-gists/domain/relationship-gist.ts` with typed anchors and layout-ready progress policy while keeping the existing exports.
- Update `lib/relationship-gists/local-state.ts` to read v1 and expose typed/observable writes; do not change or delete the v1 key.
- Narrowly update `app/(tabs)/explore.tsx` to use feature hooks/components while preserving all adjacent Circles/Live hunks.
- Update `app/admin-editorial.tsx` to consume action permissions and hide/disable unauthorized actions; server RPC remains authoritative.
- Update `supabase/types/database.ts` only from an explicitly verified disposable local schema, otherwise defer generated types and use local narrow RPC types.
- Extend `__tests__/relationship-gist-hardening.test.ts`; add focused domain, repository, outbox, reader component, and auth-switch tests.

Progress completion policy: a short article is not complete merely because it fits. It becomes complete only after layout is ready, the reader is foregrounded, and a minimum eight-second active dwell has elapsed; long content uses the scroll threshold. The exact dwell is an owner-adjustable product constant and must be fake-timer tested.

Acceptance criteria:

- Role-matrix SQL tests deny support, anonymous, and wrong-action roles.
- Old read/state RPC signatures and direct-table fallback tests pass.
- Save → offline → unsave → restart → reconnect produces one authoritative unsaved result.
- Duplicate operation IDs do not reapply; bounded retry reaches a visible terminal state.
- Concurrent-device revision conflict is explicit and never silently overwrites the newer state.
- User A logout removes A's visible Gist state; User B cannot hydrate or drain A's queue.
- Latest progress flushes on background, close, and unmount.
- Layout-ready resume restores a stable section anchor with numeric progress fallback.
- Offline stale content is labeled and remains readable; unavailable current content has a truthful empty state.
- Native share, perspectives, accessibility, reduced motion, Circles card, and navigation remain intact.

### Milestone 2 — immutable editorial model and library

Planned files:

- Add migrations 3 and 4 from the sequence and the idempotent backfill script.
- Add `features/relationship-gists/editorial/` modules for edition list, revision editor, review queue, transition controls, schedule preview, and audit history.
- Refactor `app/admin-editorial.tsx` into a route shell over those modules.
- Add `features/relationship-gists/library/` for For You, Saved, Continue Reading, supported topic shelves, unavailable-state explanations, and deep-link adapters.
- Add a canonical Gist route while preserving the existing Circles entry and reader adapter.
- Version cache envelopes without deleting v1 local state or Circles snapshot data.

Acceptance criteria:

- Published revisions are immutable; correction/rollback creates a new revision.
- Only authorized server transitions can move draft → review → approved → scheduled/published → superseded/unpublished/archived.
- Every transition records actor, time, prior/new state, revision, and reason where required.
- One edition may have only the variants editors actually provide; no fabricated lens.
- New UI defaults to neutral General and stores explicit lens choice. Legacy religion-based selection remains confined to the old-reader adapter while installed clients are supported.
- Targeting controls are hidden unless server selection and precedence are implemented and tested.
- Existing saves/progress and legacy IDs survive backfill and cache migration.
- Both old and new reader fixtures pass against the compatibility layer.

### Milestone 3 — AI-assisted drafts

Planned files:

- Add migration 5.
- Add `supabase/functions/relationship-gist-draft/` with Gist-specific prompt, strict response schema, validation, moderation, retry, cost/timeout limits, and redacted telemetry.
- Reuse provider/structured-output/content-safety primitives from existing Odo/OpenAI code without importing its prompts, roles, or Live assumptions.
- Add admin draft-job status, variant preview, risk labels, source-verification checklist, and explicit human review controls.
- Add local provider mocks and contract/security tests.

Acceptance criteria:

- AI/service roles can create drafts only and cannot approve, publish, set current, or modify published revisions.
- Prompt input excludes private member data.
- Invalid, unsafe, duplicate, stereotyped, unsupported medical/faith/safety, or malformed output fails closed.
- Source suggestions are visibly unverified until reviewed.
- Provider failure leaves current published content untouched and allows human drafting.

### Milestone 4 — engagement, discovery, and analytics

Planned files:

- Add migrations 6 and 7.
- Add Gist-specific reaction, aggregate, private-reflection, library, analytics, and optional digest modules.
- Reuse moderation/idempotency techniques, not Circle/Moment ownership tables or authorization.

Recommended reaction rule: exactly one active reaction per user per immutable revision; choosing another changes it, tapping the active reaction removes it. This is understandable, prevents count inflation, and makes revision semantics explicit.

Acceptance criteria:

- Reactions are idempotent, rate-limited, revision-bound, removable, private at row level, and exposed publicly only as privacy-reviewed aggregates.
- Private reflections support create/edit/delete/export and account deletion; no other product surface receives them.
- Library, Saved, and Continue Reading work without a new bottom tab.
- Telemetry contains event IDs/status/counts but no article body, private reflection, or sensitive profile attribute.
- Digest notifications remain disabled until separately authorized with opt-in and quiet hours.

### Milestone 5 — local release-candidate preparation

Planned outputs:

- Full local regression evidence and physical-device test plan.
- Staging-only additive migration order and read-only verification queries.
- Editorial review SOP and content withdrawal/rollback rehearsal.
- Feature-flag and environment-identity checklist.
- Risk treatment for Production's 38 missing migrations and old/shared EAS staging artifacts.

Acceptance criteria:

- All local unit/component/SQL/static gates pass or every skip is explicit.
- Old clients can still read, save, resume, and use fallback.
- Cached withdrawn/unpublished behavior and emergency kill switch are tested.
- No remote command is executed; staging work requires a new explicit approval.

## 9. Test matrix

| Layer | Cases | Planned command/gate |
|---|---|---|
| Domain | Parsing, read time, six perspectives, stable anchors, short/long progress | Node focused tests |
| Storage | v1 compatibility, corrupt JSON, write failure, versioned migration, account keys | Jest/Node unit tests with AsyncStorage mock |
| Repository | RPC success, missing-RPC fallback, direct-table error, unavailable/offline stale cache | Jest mocked Supabase tests |
| Outbox | enqueue/ack/duplicate, eight retries, restart, terminal failure, network/foreground drain | Jest fake storage/network/timers |
| Auth isolation | A→logout→B, stale async completion, owner mismatch, suspended A queue | Interaction tests modeled on auth recovery tests |
| Multi-device | matching revision, converged duplicate, stale conflicting save/unsave | SQL + repository contract tests |
| Reader component | resume after layout, background/unmount flush, short dwell, share, focus, reduced motion | React Native Testing Library/Jest |
| Editorial SQL | every role/action, anonymous denial, forged actor profile, grants/search path | pgTAP in disposable local Supabase only |
| Legacy DB | zero-arg seven-column RPC, old state signature, direct table select, six perspectives | pgTAP and static contract checks |
| Editorial lifecycle | invalid transitions, immutable revisions, schedule UTC, withdraw/rollback audit | pgTAP + domain tests |
| AI | strict schema, moderation, injection, retry/idempotency, role cannot publish | Deno/unit tests with local mocks |
| Engagement/privacy | own/cross-user rows, aggregates, reaction change/remove, reflection delete/export | pgTAP + client tests |
| Repository gates | TypeScript, lint, Expo Doctor as relevant, focused/full suites, whitespace | `npm.cmd run typecheck`, `npm.cmd run lint`, `npx.cmd expo-doctor`, focused tests, `git diff --check` |

SQL execution gate:

1. Inspect `supabase status` without linking.
2. Prove the URL is local loopback and the project is disposable.
3. Record migration inventory and target before any reset/test.
4. If those checks fail, do not run SQL; retain static tests and report pgTAP as unexecuted.

## 10. Security, privacy, and offline invariants

- All privileged actions derive identity from `auth.uid()` and check the requested action server-side.
- Security-definer functions use explicit schema qualification and fixed `search_path`.
- Client/UI capability checks are presentation only.
- No service key, provider secret, private reader state, article body, or reflection appears in client telemetry.
- Reader state, queues, reactions, and reflections are owner-scoped and cascade/delete consistently with account deletion.
- No automatic religious inference is introduced. Milestone 2 moves new UI to neutral default and explicit lens selection while retaining an old-client adapter.
- Offline content is labeled stale; withdrawn content does not silently appear current after a successful refresh.
- Dirty mutations are not discarded on app close, persistence failure, logout, or retry exhaustion.
- Multi-device conflict outcomes are explicit and testable.
- AI never publishes, changes current content, or uses private member data.
- Relationship Gist remains separate from Relationship Compass, matching, Live, Chat, Sparks, Circles authorization, and Betweener Daily.

## 11. Open decisions and risks

Approval of Milestone 1 will accept the recommended defaults below unless the owner specifies changes:

1. **Role split:** operations drafts/publishes/archives; moderation reviews/approves once Milestone 2 exists; support has no editorial access; super-admin has all actions.
2. **Save conflict:** server revision conflict wins automatically only when both sides already agree; otherwise show explicit Retry/Use-current-state rather than overwrite silently.
3. **Short-read completion:** eight seconds of active foreground dwell after layout before 100%.
4. **Reaction semantics:** one active reaction per user per immutable revision.
5. **Lens behavior:** preserve existing selection in Milestone 1; move new UI to neutral General + explicit user choice in Milestone 2.
6. **Targeting:** hide/disable country, city, and tag claims until a server-authoritative selector is separately designed and tested.

Unresolved risks:

- The exact deployed Production/Staging function bodies, RLS expressions, grants, constraints, indexes, and triggers remain unverified; no remote inference is acceptable.
- Production lacks 38 local migrations, including admin context, so no broad migration push can be used as a Gist rollout strategy.
- `app/(tabs)/explore.tsx` contains unrelated uncommitted work and is the main local collision risk.
- Creator Studio and three recent migrations are untracked; losing or accidentally staging them with unrelated work would damage provenance.
- A local disposable Supabase instance has not yet been proven, so pgTAP execution is pending.
- Installed builds on the historical shared EAS project may continue to use legacy contracts and must remain supported until separately retired.

## 12. Milestone 1 approval gate

Before implementation:

- Reconfirm branch, HEAD, full status, and hashes.
- Confirm no concurrent change to `app/(tabs)/explore.tsx` or `app/admin-editorial.tsx`.
- Re-list migrations and reserve non-colliding versions.
- Accept or amend the six decisions above.
- Explicitly authorize **Milestone 1 only**.

Milestone 1 must stop after its focused tests and evidence report. It must not begin immutable editorial modeling, AI drafting, reactions, reflections, staging deployment, or Production work.

## 13. Safety confirmation

```text
PRODUCTION_MODIFICATIONS = NONE
STAGING_MODIFICATIONS = NONE
DEPLOYMENTS = NONE
COMMITS = NONE
REMOTE_CONNECTIONS = NONE
NEW_MIGRATIONS_CREATED = NONE
NEW_MIGRATIONS_EXECUTED_LOCALLY = NONE
```
