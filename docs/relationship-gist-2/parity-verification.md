# Relationship Gist 2.0 parity and deployment verification

Audit date: 2026-10-10 (Europe/London)
Mode: read-only local, Supabase, and EAS inspection
Repository: `C:\Projects\betweener-app`

## 1. Executive verdict

**PARTIAL PARITY — CONDITIONAL PLANNING**

Relationship Gist's core database objects and RPC signatures exist in both Betweener Staging and Betweener Production. The recorded Gist hardening migration (`20260831130000`) is present in both. Staging matches all 231 local migration versions; Production has 193 and is missing 38 local migrations, including the admin-capability model and the staging-only Gist fixtures.

Planning Gist 2.0 can continue, but implementation should not start against Production until the actual deployed function bodies, RLS policies, grants, constraints, indexes, and triggers are inspected through an approved read-only metadata connection. The authenticated CLI exposed migration history, generated type signatures, Edge Function inventory, and table statistics, but did not expose those database definitions without escalating to ad-hoc privileged SQL.

Critical findings:

- The local Creator Studio UI requires the `editorial` capability, but the local Gist editorial RPCs still authorize through broad `is_admin_user`. See [`app/admin-editorial.tsx:116`](../../app/admin-editorial.tsx#L116) and [`20260831130000_relationship_gist_hardening.sql:111`](../../supabase/migrations/20260831130000_relationship_gist_hardening.sql#L111).
- Production does not have `20261007180000_admin_operations_context.sql`; Staging records it as applied. Production therefore cannot be assumed to have the capability model.
- Staging table statistics estimate four Gists and one reader-state row; Production estimates zero Gists and zero reader-state rows. These are planner estimates, not exact counts.
- Current local staging/production app configuration is isolated. However, the old/shared EAS project `@kaakyire9/betweener` still contains historical staging builds and a `staging` OTA update group. Old installed builds using that project remain an isolation consideration.
- Creator Studio is untracked and absent from all inspected build commits. The reader RPC, state RPC, card integration, domain module, local state, and offline store are present in those commits, although `explore.tsx` differs from the current worktree.
- No Relationship Gist Edge Function, AI drafting worker, reaction system, reflection system, immutable revision model, or operational scheduling workflow is deployed or implemented.

## 2. Repository and worktree identity

| Item | Verified value |
|---|---|
| Absolute path | `C:\Projects\betweener-app` |
| Branch | `feature/betweener-live` |
| HEAD | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Upstream | `origin/feature/betweener-live` |
| Worktree | Dirty |
| Historical reference match | Branch and HEAD match the previous audit reference `feature/betweener-live` / `f560559`; complete dirty-file identity cannot be proven because the earlier audit did not record content hashes. |

The repository has a large pre-existing set of modified and untracked files. No existing work was altered by this audit. Relationship Gist-specific status:

| File | Classification |
|---|---|
| [`app/(tabs)/explore.tsx`](<../../app/(tabs)/explore.tsx>) | Modified but uncommitted |
| [`app/admin-editorial.tsx`](../../app/admin-editorial.tsx) | Untracked |
| [`components/circles/CirclesHomeCards.tsx`](../../components/circles/CirclesHomeCards.tsx) | Committed |
| [`features/relationship-gists/domain/relationship-gist.ts`](../../features/relationship-gists/domain/relationship-gist.ts) | Committed |
| [`lib/relationship-gists/local-state.ts`](../../lib/relationship-gists/local-state.ts) | Committed |
| [`lib/offline/circles-store.ts`](../../lib/offline/circles-store.ts) | Committed |
| [`__tests__/relationship-gist-hardening.test.ts`](../../__tests__/relationship-gist-hardening.test.ts) | Committed |
| [`20260831130000_relationship_gist_hardening.sql`](../../supabase/migrations/20260831130000_relationship_gist_hardening.sql) | Committed |
| [`20261007180000_admin_operations_context.sql`](../../supabase/migrations/20261007180000_admin_operations_context.sql) | Untracked |
| [`20261008090000_relationship_gist_staging_fixtures.sql`](../../supabase/migrations/20261008090000_relationship_gist_staging_fixtures.sql) | Untracked |

Other uncommitted migration: `20261007223000_circle_staging_readiness_hardening.sql` (untracked).

Relevant ignored paths were verified by rule without reading their contents:

- `.env` via `.gitignore:41`
- `.env.local` via `.gitignore:64`
- `.env.stream-audit.local` via `.gitignore:42`
- `google-services.staging.json` via `.gitignore:55`
- `GoogleService-Info.plist` via `.gitignore:56`
- `credentials.json` via `.gitignore:19`

## 3. Environment identity matrix

Source of truth: [`app.config.js:7-43`](../../app.config.js#L7) and [`eas.json:7-152`](../../eas.json#L7).

| Environment/profile | APP_VARIANT | Supabase | EAS project | iOS bundle / Android package | Channel | EAS environment | Status |
|---|---|---|---|---|---|---|---|
| Development | `staging` | `xsgzxadwuxuziubglvps` | `7f38a835-2da7-419b-a20b-e1a12e021547` | `com.aduboffour.betweener.staging` | `development` | `preview` | `VERIFIED_MATCH` locally |
| Preview | `staging` | `xsgzxadwuxuziubglvps` | `7f38a835-2da7-419b-a20b-e1a12e021547` | `com.aduboffour.betweener.staging` | `preview` | `preview` | `VERIFIED_MATCH` locally |
| Staging / Play / TestFlight | `staging` | `xsgzxadwuxuziubglvps` | `7f38a835-2da7-419b-a20b-e1a12e021547` | `com.aduboffour.betweener.staging` | `staging` | `preview` | `VERIFIED_MATCH` locally |
| Production verification | `production` | `jbyblhithbqwojhwlenv` | `7de6cdc4-8616-446f-99de-82764af3a7e6` | `com.aduboffour.betweener` | `production-verification` | `production` | `VERIFIED_MATCH` locally |
| Production | `production` | `jbyblhithbqwojhwlenv` | `7de6cdc4-8616-446f-99de-82764af3a7e6` | `com.aduboffour.betweener` | `production` | `production` | `VERIFIED_MATCH` locally |

Identity selection fails closed for unsupported variants and defaults an omitted variant to Production: [`app.config.js:39-43`](../../app.config.js#L39). EAS build-time guards verify the selected Supabase hostname and reject cross-environment RevenueCat products: [`app.config.js:142-186`](../../app.config.js#L142).

Supabase CLI project inventory verified both expected projects as active and healthy. The local Supabase link remained Staging throughout the audit; Production was always addressed explicitly by project reference. No `supabase link` was executed.

## 4. Local migration inventory

| Check | Result |
|---|---|
| Migration files | 231 |
| Unique versions | 231 |
| Duplicate versions | 0 |
| Filename-regex failures | 0 |
| Invalid calendar-like timestamps | 5 |
| Uncommitted migrations | 3 |

The five invalid timestamp-like versions are already accepted by the migration system and recorded remotely, but their minute components are not valid timestamps:

- `20260908216000_live_odo_phase10e_music_policy_hardening.sql`
- `20260908217000_live_odo_phase10e_configuration_authority.sql`
- `20260908218000_live_odo_phase10e_program_control_recovery.sql`
- `20260914126000_push_notification_atomic_rate_limits.sql`
- `20260914127000_push_notification_expiry_lifecycle.sql`

Uncommitted migrations:

- `20261007180000_admin_operations_context.sql`
- `20261007223000_circle_staging_readiness_hardening.sql`
- `20261008090000_relationship_gist_staging_fixtures.sql`

Relevant definitions:

- The Gist hardening migration adds the global-reader policy and RPC, editorial upsert, user-state table/RPC, grants, and revocations: [`20260831130000_relationship_gist_hardening.sql`](../../supabase/migrations/20260831130000_relationship_gist_hardening.sql).
- The admin-context migration introduces UI-facing capability resolution, including `editorial`: [`20261007180000_admin_operations_context.sql:38-63`](../../supabase/migrations/20261007180000_admin_operations_context.sql#L38).
- The fixture migration is guarded by staging environment/package assertions before inserting four fixed Gists: [`20261008090000_relationship_gist_staging_fixtures.sql:1-38`](../../supabase/migrations/20261008090000_relationship_gist_staging_fixtures.sql#L1).

Complete ordered local versions:

```text
20260713034644, 20260713034700, 20260713034800, 20260713220000, 20260713223000, 20260713224500,
20260714010000, 20260714011000, 20260714012000, 20260714013000, 20260714150000, 20260714151000,
20260715100000, 20260715103000, 20260715110000, 20260719120000, 20260719153000, 20260719173000,
20260719213000, 20260719223000, 20260720150000, 20260720183000, 20260720193000, 20260720194500,
20260720223000, 20260721103000, 20260722120000, 20260722143000, 20260729120000, 20260731113000,
20260731160000, 20260803120000, 20260803143000, 20260804120000, 20260804153000, 20260804190000,
20260812103000, 20260812113000, 20260812190000, 20260813100000, 20260813154500, 20260813173000,
20260813203000, 20260815060000, 20260815234500, 20260816090000, 20260816120000, 20260816150000,
20260816173000, 20260816180000, 20260816184500, 20260816200000, 20260816210000, 20260820120000,
20260820153000, 20260820203000, 20260821100000, 20260821130000, 20260821203000, 20260824110000,
20260824123000, 20260824170000, 20260824183000, 20260824210000, 20260825090000, 20260825120000,
20260825130000, 20260826100000, 20260826150000, 20260827090000, 20260827110000, 20260827123000,
20260828073000, 20260828100000, 20260828160000, 20260828190000, 20260829100000, 20260829150000,
20260829170000, 20260829210000, 20260829211500, 20260829213000, 20260829220000, 20260830100000,
20260830113000, 20260830160000, 20260831100000, 20260831113000, 20260831130000, 20260831233000,
20260901120000, 20260901123000, 20260901124500, 20260901133000, 20260901133100, 20260901133200,
20260901133300, 20260901140000, 20260902090000, 20260902103000, 20260902161000, 20260903100000,
20260903113000, 20260904100000, 20260904113000, 20260904130000, 20260905080000, 20260905092000,
20260905093000, 20260905100000, 20260905103000, 20260905110000, 20260905133000, 20260905150000,
20260905233000, 20260905234500, 20260905235900, 20260906100000, 20260906101000, 20260906102000,
20260906103000, 20260906104000, 20260906105000, 20260906140000, 20260906143000, 20260906144000,
20260906145000, 20260906153000, 20260906170000, 20260906171000, 20260906172000, 20260907100000,
20260907101000, 20260907102000, 20260907103000, 20260908100000, 20260908110000, 20260908120000,
20260908121000, 20260908122000, 20260908123000, 20260908124000, 20260908125000, 20260908130000,
20260908140000, 20260908141000, 20260908213000, 20260908214000, 20260908215000, 20260908216000,
20260908217000, 20260908218000, 20260909110000, 20260909120000, 20260909121000, 20260909122000,
20260909123000, 20260909124000, 20260909125000, 20260910100000, 20260910101000, 20260910120000,
20260910121000, 20260910122000, 20260910123000, 20260910124000, 20260910125000, 20260910130000,
20260911100000, 20260912080000, 20260912090000, 20260912100000, 20260912110000, 20260912180000,
20260912190000, 20260913113000, 20260913130000, 20260913143000, 20260913190000, 20260913200000,
20260913221500, 20260913224500, 20260913232000, 20260914090000, 20260914120000, 20260914121000,
20260914122000, 20260914123000, 20260914124000, 20260914125000, 20260914126000, 20260914127000,
20260915120000, 20260915121000, 20260915122000, 20260915123000, 20260915124000, 20260915125000,
20260915130000, 20260915131000, 20260915132000, 20260915133000, 20260915134000, 20260915135000,
20260915140000, 20260915141000, 20260916120000, 20260917120000, 20260917150000, 20260918120000,
20260919120000, 20260921120000, 20260921121000, 20260921122000, 20260921123000, 20260922100000,
20260923220000, 20260924100000, 20260924230000, 20260925090000, 20260926110000, 20260926111000,
20260926112000, 20260926113000, 20260929100000, 20260930120000, 20261006150000, 20261006170000,
20261007180000, 20261007223000, 20261008090000
```

## 5. Remote migration comparison

| Inventory | Count | Result |
|---|---:|---|
| Local | 231 | Baseline |
| Staging | 231 | Exact version-set match with Local |
| Production | 193 | Missing 38 Local versions |
| Remote-only Staging | 0 | None |
| Remote-only Production | 0 | None |

All Local + Staging, absent from Production:

```text
20260915120000, 20260915121000, 20260915122000, 20260915123000,
20260915124000, 20260915125000, 20260915130000, 20260915131000,
20260915132000, 20260915133000, 20260915134000, 20260915135000,
20260915140000, 20260915141000, 20260916120000, 20260917120000,
20260918120000, 20260919120000, 20260921120000, 20260921121000,
20260921122000, 20260921123000, 20260922100000, 20260923220000,
20260924100000, 20260924230000, 20260925090000, 20260926110000,
20260926111000, 20260926112000, 20260926113000, 20260929100000,
20260930120000, 20261006150000, 20261006170000, 20261007180000,
20261007223000, 20261008090000
```

Production does record `20260917150000` even though `20260917120000` and the preceding 15–16 September range are absent. This is a real migration-history divergence, not a simple “Production stopped at version X.”

Gist-specific classification:

| Migration | Local | Staging | Production |
|---|---|---|---|
| `20260831130000` Gist hardening | Present/committed | Recorded | Recorded |
| `20261007180000` admin capability context | Present/untracked | Recorded | Absent |
| `20261008090000` staging fixtures | Present/untracked | Recorded | Absent, as intended |

Migration-history parity is not treated as schema-definition parity.

## 6. Actual schema, RPC and RLS parity

### Verified remotely

Generated remote database types confirm both environments expose matching structures/signatures for:

- `relationship_gists`
- `relationship_gist_user_states`
- `rpc_get_global_relationship_gists()`
- `rpc_upsert_relationship_gist_user_state(uuid, boolean, double precision, timestamptz, boolean, text)`
- `rpc_admin_get_relationship_gists()`
- `rpc_upsert_relationship_gist_editorial(...)`
- `rpc_archive_relationship_gist_editorial(uuid, uuid)`
- `rpc_publish_relationship_gist(uuid)`

The two table shapes include the locally expected content, targeting, publication, creator, state, progress, save, and perspective columns. Foreign-key relationships to Gists, Profiles, and Circles appear in both generated type sets.

### Verified locally, remotely unverified at definition level

The local hardening migration defines:

- Authenticated global-reader policy: [`lines 11-25`](../../supabase/migrations/20260831130000_relationship_gist_hardening.sql#L11).
- Current global Gist RPC: [`lines 27-83`](../../supabase/migrations/20260831130000_relationship_gist_hardening.sql#L27).
- Broad-admin editorial upsert: [`lines 85-172`](../../supabase/migrations/20260831130000_relationship_gist_hardening.sql#L85).
- User-state table, constraints, index, RLS and grants: [`lines 179-222`](../../supabase/migrations/20260831130000_relationship_gist_hardening.sql#L179).
- User-state mutation RPC and grants: [`lines 224-318`](../../supabase/migrations/20260831130000_relationship_gist_hardening.sql#L224).
- Revocation of authenticated legacy Circle-scoped Gist mutation RPCs: [`lines 320-326`](../../supabase/migrations/20260831130000_relationship_gist_hardening.sql#L320).

The official CLI schema stream did not expose function bodies or DDL through the available output path. Therefore the following remain `UNVERIFIED` remotely despite matching migration records and type signatures:

- Normalized function bodies/checksums.
- RLS policy expressions.
- Exact execute/table grants.
- Constraints and validation state.
- Index definitions.
- Trigger definitions.
- Gist-specific scheduled jobs.

No Relationship Gist-named Edge Function was found in either environment. This matches the local architecture, where Gist operations are Postgres RPCs rather than Edge Functions.

## 7. Editorial authorization findings

**Overall: `EDITORIAL_AUTH_UNVERIFIED` remotely; `EDITORIAL_AUTH_MISMATCH` locally.**

Local Creator Studio requires `capability="editorial"`: [`app/admin-editorial.tsx:116`](../../app/admin-editorial.tsx#L116). The admin context gives editorial access to `super`, `operations`, and `moderation`, but not `support`: [`20261007180000_admin_operations_context.sql:38-50`](../../supabase/migrations/20261007180000_admin_operations_context.sql#L38).

The local editorial upsert only checks `public.is_admin_user(auth.uid())`: [`20260831130000_relationship_gist_hardening.sql:108-113`](../../supabase/migrations/20260831130000_relationship_gist_hardening.sql#L108). The archive, publish, and admin-list functions originate in the baseline and are only stripped of anonymous execution by the hardening migration. No later local migration upgrades them to a specific editorial capability.

Consequences:

- UI authorization and database authorization are not the same contract.
- A general internal admin could theoretically call an editorial RPC even if the UI hides Editorial.
- Staging has the capability-context migration, but that migration does not rewrite the Gist editorial RPCs.
- Production lacks the capability-context migration entirely.

No unauthorized mutation was attempted. Exact remote function bodies/grants were not obtainable through the approved read-only metadata commands, so the theoretical issue is not represented as a proven exploit against either remote environment.

## 8. Gist content inventory

Only non-sensitive planner estimates were inspected:

| Environment | Gists | Reader-state rows | Interpretation |
|---|---:|---:|---|
| Staging | estimated 4 | estimated 1 | Consistent with four staging fixture IDs and at least one reader-state row |
| Production | estimated 0 | estimated 0 | No evidence of deployed Production content or reader use |

The Staging fixture migration defines four published global rows for `general`, `culture`, `safety`, and `communication`: [`20261008090000_relationship_gist_staging_fixtures.sql:38-121`](../../supabase/migrations/20261008090000_relationship_gist_staging_fixtures.sql#L38). Its recorded application plus the estimated row count is strong evidence that those fixtures remain present, but exact counts/statuses were not queried.

The following requested aggregates remain `UNVERIFIED` because no approved exact-count/data inspection path was available:

- Draft, published, archived, scheduled, and current counts.
- Exact counts by perspective.
- Current-content existence for each perspective.
- Whether the one estimated state row has `saved=true`.

No private reader-state contents or member identifiers were read.

## 9. Reader-state persistence evidence

Local reader behavior is implemented and uses both AsyncStorage and Supabase:

- Server state hydration: [`app/(tabs)/explore.tsx:464-527`](<../../app/(tabs)/explore.tsx#L464>).
- Reader RPC fetch: [`app/(tabs)/explore.tsx:705`](<../../app/(tabs)/explore.tsx#L705>).
- Direct-table fallback: [`app/(tabs)/explore.tsx:750-763`](<../../app/(tabs)/explore.tsx#L750>).
- Local-first persistence and RPC synchronization: [`app/(tabs)/explore.tsx:1527-1559`](<../../app/(tabs)/explore.tsx#L1527>).
- Per-user local keying: [`lib/relationship-gists/local-state.ts:14-16`](../../lib/relationship-gists/local-state.ts#L14).
- Offline Circles snapshot: [`lib/offline/circles-store.ts:127-163`](../../lib/offline/circles-store.ts#L127).

Both remote databases expose the state table and mutation RPC signature. Staging statistics estimate one persisted row. Production estimates none. Exact save/progress values were intentionally not inspected.

Known compatibility weaknesses remain: server `saved` wins during hydration, failed existing-row mutations have no durable outbox, progress writes are debounced, and stored progress does not restore scroll position.

## 10. Mobile deployment provenance

### Remote evidence available from the old/shared EAS project

The default Production identity resolved EAS project `@kaakyire9/betweener` (`7de6cdc4-8616-446f-99de-82764af3a7e6`). Its five most recent builds were historical staging/development artifacts, not Production-profile releases:

| Platform/profile | Commit | Channel | Runtime | Finished |
|---|---|---|---|---|
| Android `playStaging` | `32b5d100a953a8fa4a91fe3e87b5739d58773469` | `staging` | `1.2.0` | 2026-10-02 |
| iOS `development` | `a768da46e1d60a30af85cde2678a203c676ad2a9` | `development` | `1.2.0` | 2026-09-30 |
| Android `development` | `a768da46e1d60a30af85cde2678a203c676ad2a9` | `development` | `1.2.0` | 2026-10-01 |
| iOS `testflightStaging` | `d8ac19d835c4eefd84623838f58dc5d4c2fd2f9a` | `staging` | `1.2.0` | 2026-09-30 |
| Android `staging` | `d8ac19d835c4eefd84623838f58dc5d4c2fd2f9a` | `staging` | `1.2.0` | 2026-09-30 |

The most recent OTA group in that project was Android branch/channel `staging`, runtime `1.2.0`, group `a9c8fcbd-190a-4211-9c7c-6fb3aef5586b`, message “Android RevenueCat staging isolation.”

Git object inspection of all three build commits proves:

- `explore.tsx`, the Gist domain module, local Gist state, and offline Circles store were present.
- `explore.tsx` contained both Gist reader and state RPC calls and `RelationshipGistCard` integration.
- `app/admin-editorial.tsx` was absent.
- The domain, local-state, and offline-store files match the current worktree.
- `explore.tsx` differs from the current worktree, so exact current reader UI parity is not proven.

### Unverified deployment provenance

- No Production-profile iOS or Android build appeared in the five-result query; this does not prove no older Production build exists.
- The dedicated Staging EAS project `7f38a835-2da7-419b-a20b-e1a12e021547` was not queried because selecting it requires changing `APP_VARIANT` for config resolution, which this audit forbids.
- Therefore, latest dedicated-project staging iOS/Android build identity and OTA state remain `UNVERIFIED`.

## 11. Backward compatibility risks

1. Installed clients call the zero-argument `rpc_get_global_relationship_gists()` and expect the existing seven-column response. Preserve it through an adapter.
2. The client falls back to direct `relationship_gists` reads. Removing table visibility or columns would break old clients.
3. Existing state uses `gist_id`; replacing IDs would orphan saves/progress unless an edition-ID mapping is introduced.
4. AsyncStorage uses `relationship-gist-local-state:v1:<user>` and the Circles snapshot uses schema version 1. New cache structures require versioned migration/invalidation.
5. The six perspective strings are persisted locally and remotely. Renaming them requires compatibility aliases and backfill.
6. Current publication ordering is based on `published_at`, `updated_at`, and ID. In-place edits can change “current” selection.
7. The native share payload has no stable deep link, so there is no deployed deep-link contract to preserve, but Gist 2.0 must add one additively.
8. Existing builds contain reader/state code but not Creator Studio. Database changes must support these reader-only clients throughout rollout.
9. Production currently has no estimated Gist content. Seeding Production would be a separate user-facing activation, not a schema-only change.

Recommended compatibility approach: additive edition/revision/variant tables, dual-read adapter, stable legacy IDs or mapping table, dual-write state during migration, feature flags, and delayed removal of the direct-table fallback.

## 12. Environment isolation findings

Verified current local safeguards:

- Distinct Supabase projects.
- Distinct EAS project IDs and update URLs.
- Distinct bundle/package IDs and URL schemes.
- Staging profiles select `preview`; Production selects `production`.
- Staging fixture SQL checks staging environment/package before inserting.
- Build-time config validates Supabase hostname and environment-specific commerce identifiers.

Unresolved risks:

- The old/shared Production EAS project still hosts staging builds and a staging OTA branch. Older builds tied to its update URL may still consume that branch.
- Dedicated Staging EAS build/update provenance is unverified in this audit.
- Creator Studio is untracked, so it has no reproducible build provenance.
- Future AI generation does not yet have an environment-bound queue. It must use per-project database jobs, per-environment secrets, environment provenance columns, and publish permissions that cannot cross projects.
- Migration history alone cannot prove Staging or Production RLS/grant parity.

No staging fixture migration exists in Production history. Current SQL also fails closed if its private environment/package assertion is not Staging.

## 13. Complete parity matrix

Only the required classifications are used.

| Capability | Local | Staging | Production | Evidence | Risk |
|---|---|---|---|---|---|
| `relationship_gists` table | `VERIFIED_MATCH` | `VERIFIED_MATCH` | `VERIFIED_MATCH` | Generated types + table stats | Full DDL not remotely checksummed |
| User-state table | `VERIFIED_MATCH` | `VERIFIED_MATCH` | `VERIFIED_MATCH` | Generated types + table stats | RLS/grants unverified remotely |
| Reader RPC signature | `VERIFIED_MATCH` | `VERIFIED_MATCH` | `VERIFIED_MATCH` | Generated remote types | Function body unverified |
| User-state RPC signature | `VERIFIED_MATCH` | `VERIFIED_MATCH` | `VERIFIED_MATCH` | Generated remote types | Function body unverified |
| Editorial RPC signatures | `VERIFIED_MATCH` | `VERIFIED_MATCH` | `VERIFIED_MATCH` | Generated remote types | Authorization body unverified |
| Editorial authorization | `VERIFIED_DIFFERENCE` | `UNVERIFIED` | `UNVERIFIED` | Local UI capability vs broad RPC check | Potential privilege overreach |
| Admin capability model | `LOCAL_ONLY` | `VERIFIED_MATCH` | `NOT_IMPLEMENTED` | Migration history | Production lacks context RPC/model |
| Gist RLS | `VERIFIED_MATCH` | `UNVERIFIED` | `UNVERIFIED` | Local migration only | Migration presence is insufficient proof |
| Published Gists | `UNVERIFIED` | `UNVERIFIED` | `UNVERIFIED` | Estimated rows only | Exact status/current counts unavailable |
| Reader-state persistence | `VERIFIED_MATCH` | `UNVERIFIED` | `UNVERIFIED` | Local flow; remote estimates 1 vs 0 | Exact saved/progress state private/unread |
| Offline reader implementation | `VERIFIED_MATCH` | `UNVERIFIED` | `UNVERIFIED` | Present in inspected historical commits | Exact deployed build/source uncertain |
| Creator Studio | `LOCAL_ONLY` | `UNVERIFIED` | `NOT_IMPLEMENTED` | Untracked and absent from inspected build commits | Not reproducible/deployed |
| Scheduling | `NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` | Column/query gate only | No editorial scheduling workflow |
| Revision history | `NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` | No revision/audit model | Published rows mutable |
| AI drafting | `NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` | No Gist AI Function/job | Must be human-reviewed and isolated |
| Reactions | `NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` | No Gist reaction objects | Separate moderation/RLS required |
| Reflections | `NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` | No private Gist reflection objects | Privacy boundary required |
| Migration history | `VERIFIED_MATCH` | `VERIFIED_MATCH` | `VERIFIED_DIFFERENCE` | 231/231/193 | Production missing 38 versions |
| Deployment provenance | `VERIFIED_MATCH` | `UNVERIFIED` | `VERIFIED_DIFFERENCE` | Local config vs old/shared EAS history | Historical staging artifacts in old project |

## 14. Blockers and unresolved uncertainties

Blocking safe implementation/deployment work, not product planning:

1. Actual remote Gist function bodies, RLS, grants, constraints, indexes, and triggers need an approved read-only catalog inspection.
2. Editorial RPCs must enforce the same explicit capability model as Creator Studio.
3. The untracked admin and fixture migrations/UI need a reviewed commit before they can be treated as reproducible source.
4. Dedicated Staging EAS build and OTA provenance must be queried without violating environment-selection safeguards.
5. Old/shared EAS staging channels/builds need an explicit retirement policy for installed historical clients.
6. Exact Staging content/status counts and saved-state aggregate need a privacy-safe read-only reporting path.
7. Production's 38-version divergence must be assessed migration-by-migration before any Production rollout; applying everything blindly is not recommended.

## 15. Recommended implementation prerequisites

### Safe to reuse

- Reader card/modal, accessibility, perspective parser and reading-time logic.
- Existing reader and state RPC signatures as compatibility facades.
- Per-user local storage namespace and Circles offline snapshot patterns.
- Supabase security-definer RPC approach after authorization hardening.
- Existing server-side structured-output, moderation, retry, and redacted telemetry patterns for AI drafts.
- Existing idempotent comment/reaction patterns as designs, not shared tables.

### Must fix first

- Backend editorial capability enforcement.
- Immutable edition/revision/variant model and publication audit trail.
- Review/approval and explicit unpublish/archive transitions.
- Durable offline mutation outbox and progress restoration.
- Server-enforced targeting or removal of misleading targeting fields.
- Remote catalog-level parity verification.

### Can be built independently

- Gist 2.0 domain types and validators.
- Analytics event contract.
- Deep-link contract and web fallback design.
- AI draft schema/prompt registry with publication disabled.
- Dedicated Saved Gists UX against the legacy facade.
- Private-reflection privacy specification.

### Requires separate approval

- Any database migration, Production migration reconciliation, backfill, or seed.
- Any RPC/RLS/grant change.
- Any Edge Function or AI worker deployment.
- Any EAS build, OTA publication, or channel cleanup.
- Any Production content publication or feature activation.

## 16. Safe rollout order

1. **Development/local:** commit the current Gist/admin baseline separately; add capability-enforced RPC contracts, immutable schema, compatibility adapters, cache migration, and test coverage.
2. **Staging schema:** apply additive migrations only after approved review; do not remove legacy tables/RPCs.
3. **Staging clients:** release internal development builds, then dedicated-project store builds; verify offline, old-client, and multi-device behavior.
4. **Staging editorial:** enable manual drafts/review first; AI drafts remain non-publishing. Verify audit trail and schedule transitions.
5. **Production preparation:** perform catalog-level read-only audit and classify all 38 missing migrations. Prepare a minimal approved migration set rather than assuming full Staging parity is desirable.
6. **Production additive deployment:** schema/RPC compatibility layer first, no content activation.
7. **Production client rollout:** observe compatibility and state migration before enabling Gist 2.0.
8. **Production editorial/content activation:** separate approval, staged publication, explicit rollback through a new revision.
9. **Legacy retirement:** only after installed-client adoption and historical EAS/OTA branch retirement are verified.

## 17. Verification commands and methods

All commands were non-mutating. Project references are identifiers, not credentials. Secret values were neither printed in this report nor used in command arguments.

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --branch
git status --porcelain=v1 -uall
git diff --name-only
git check-ignore -v -- .env .env.local .env.stream-audit.local `
  google-services.staging.json GoogleService-Info.plist credentials.json

npx.cmd --no-install supabase --version
npx.cmd --no-install supabase projects list
npx.cmd --no-install supabase migration list `
  --project-ref xsgzxadwuxuziubglvps --output-format json
npx.cmd --no-install supabase migration list `
  --project-ref jbyblhithbqwojhwlenv --output-format json
npx.cmd --no-install supabase gen types typescript `
  --project-id xsgzxadwuxuziubglvps
npx.cmd --no-install supabase gen types typescript `
  --project-id jbyblhithbqwojhwlenv
npx.cmd --no-install supabase inspect db table-stats `
  --project-ref xsgzxadwuxuziubglvps --output-format json
npx.cmd --no-install supabase inspect db table-stats `
  --project-ref jbyblhithbqwojhwlenv --output-format json
npx.cmd --no-install supabase functions list `
  --project-ref xsgzxadwuxuziubglvps --output-format json
npx.cmd --no-install supabase functions list `
  --project-ref jbyblhithbqwojhwlenv --output-format json

npx.cmd --no-install eas-cli build:list --platform all --limit 5 --non-interactive
npx.cmd --no-install eas-cli update:list --all --platform all --limit 5 --non-interactive

git cat-file -e <build-commit>:<path>
git show <build-commit>:app/(tabs)/explore.tsx
git diff --quiet <build-commit> -- <path>
git diff --check
```

CLI versions used:

- Supabase CLI `2.118.0`
- EAS CLI `24.11.0`

Not executed:

- No arbitrary SQL.
- No editorial or user-state RPC mutation.
- No exact private-state query.
- No migration apply/repair/pull/push.
- No project relink.
- No Edge Function deployment.
- No build, submission, or OTA publication.
- No automated test suite; this was a deployment/state audit, not a code-change validation run.

---

**PARTIAL PARITY — CONDITIONAL PLANNING**
