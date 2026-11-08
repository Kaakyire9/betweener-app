# Relationship Gist 2.0 — Milestone 5E Release Manifest

Baseline: branch `feature/betweener-live`, HEAD `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a`, captured 2026-10-11.

Status legend: `M` = tracked file modified in the pre-existing dirty worktree; `U` = untracked implementation file. `Required` means required in the eventual Relationship Gist 2.0 release candidate, not authorization to stage or commit it now.

## Database migrations

| File / SHA-256 | Status | Milestone | Required | Purpose / dependency |
| --- | --- | --- | --- | --- |
| `supabase/migrations/20261010120000_relationship_gist_editorial_capability_hardening.sql`<br>`0092210F46A61B74DC49EA142E8D8B6D761EB1506690032CF2C303B0BBB4F5F7` | U | M1 | Yes | Action-scoped editorial authority; depends on legacy Gists and `internal_admins` |
| `supabase/migrations/20261010121000_relationship_gist_reader_state_idempotency.sql`<br>`61E976B1B03C14E1FD90700120D6A44BE4196499996E6CB81877AAB4C078660A` | U | M1 | Yes | Durable account-scoped mutation receipts; depends on legacy reader state |
| `supabase/migrations/20261010130000_relationship_gist_editorial_v2.sql`<br>`972E90BE9D161B2BE717BE35CDE261E96FE166F1A26C6CF63FAF62ADACDF4A0C` | U | M2 | Yes | Stable editions, immutable revisions, variants, audit, Saved Library; depends on M1 |
| `supabase/migrations/20261010140000_relationship_gist_ai_editorial_studio.sql`<br>`5F13C20D090982700CC44963A0A85715AC5CD05F75FBB72D02351520E3D1D41F` | U | M3 | Yes | Topic calendar, jobs, provenance and specialist review; depends on M2 and `pg_trgm` |
| `supabase/migrations/20261010150000_relationship_gist_reader_engagement.sql`<br>`1216CD8D3340ACEA6EF13C99E364E528E92E0AB83027C389DDD085DE35E27E64` | U | M4 | Yes | Reactions, private Reflections, receipts and payload-free events; depends on M2 |

Deployment order is fixed as listed. All five migrations are additive. Migration 3 backfills each global legacy Gist into one stable edition/revision; rollout must stop if any eligible legacy Gist remains unbound.

## Mobile/runtime source

| File / SHA-256 | Status | Milestone | Required | Purpose / dependency |
| --- | --- | --- | --- | --- |
| `app/(tabs)/explore.tsx`<br>`A2E891FF09E21408D9250A0523ACD51C96E074735385975093098A7F2BB6B80B` | M, mixed | M1–M4 | Yes | Canonical reader and Circles entry; depends on auth, theme, network/offline, Gist repositories and engagement |
| `app/saved-gists.tsx`<br>`746CF6B33A3F232952A4D99C9B3459A6D21C44E1CFF49B0628642E0B58BC0C9C` | U | M2 | Yes | Account-scoped Saved Library and resume route |
| `features/relationship-gists/domain/relationship-gist.ts`<br>`946DB165CE3D10B6E46CD53ADC20B1E75110E267F89B5AB9A5DF8A104D995D8E` | M | M1–M4 | Yes | Stable domain, perspective, reader progress and resume contracts |
| `features/relationship-gists/config/relationship-gist-feature-flags.ts`<br>`8E82294259C3BB7272C6A5E98EB71C6A92C66980350558A78B6E169E0D064404` | U | M1/M4 | Yes | Default-off Reader V2 and engagement gates |
| `features/relationship-gists/config/relationship-gist-editorial-v2-flags.ts`<br>`63B7F5D490CDFBF037331BCC012E25B8D1BC3893610C8C51F46293ABE14231C4` | U | M2 | Yes | Default-off editorial/Saved Library gate |
| `features/relationship-gists/config/relationship-gist-ai-flags.ts`<br>`EF901AEA145565B7037EFF345661FD3F842F2D29F3E31D8710FFEDC02289AE8C` | U | M3 | Yes | Default-off AI Studio gate |
| `features/relationship-gists/data/relationship-gist-repository.ts`<br>`2E9B7070608CD8F409F1FD9DF7D073C8C0E7FD1F464A3E4A7665E20A14A3442F` | U | M1 | Yes | Legacy/V2 reader compatibility adapter |
| `features/relationship-gists/data/relationship-gist-saved-repository.ts`<br>`3C0D77335169BF6A892A295107692E4AE9BA98E420668456B581F62910EE0F94` | U | M2 | Yes | Saved Library fetch/cache and account-scoped offline state |
| `features/relationship-gists/sync/relationship-gist-outbox.ts`<br>`726CCACB6F802F75ADA3EB40F05D10500608AA0CF17413C89E0DBC3168BC28C0` | U | M1 | Yes | Durable version-aware account outbox |
| `features/relationship-gists/hooks/use-relationship-gist-reader-state.ts`<br>`4ED11C8F26ABB622D86474E650AE4A3F1D10A79766286E297032A99CCE3F9EBB` | U | M1/M2 | Yes | Reader state lifecycle, auth-epoch race protection and sync |
| `lib/relationship-gists/local-state.ts`<br>`74F8584722BFEE45ACE2C87AD87BEB6AB6A1F5BC6AD1547ACADDE77AE53397D7` | M | M1 | Yes | Existing AsyncStorage compatibility and local-state migration |
| `features/relationship-gists/editorial/relationship-gist-editorial-permissions.ts`<br>`6A676E8EF6FAFE48DB477C21E9C846D68D51D2717F294DB1F2D8B3EF9F5E3942` | U | M1 | Yes | Fail-closed action permission model |
| `features/relationship-gists/editorial/relationship-gist-editorial-repository.ts`<br>`F5EE56DCE97CE98EDD62D9B1701C819625647ABED6F4B5AF70454C590B9DA13E` | U | M2 | Yes | Editorial transition repository |
| `features/relationship-gists/editorial/relationship-gist-editorial-v2.ts`<br>`583A0FB5FA0C501F378573E767C3F854C79F09637EDCF3CE7DB8FF063A6CC078` | U | M2 | Yes | Lifecycle/action/scheduling client contract |
| `features/relationship-gists/editorial/RelationshipGistEditorialV2Workspace.tsx`<br>`F86C19586E989AD58AAA351714BA5185059819615E9C14678F715105CCE4D54B` | U | M2 | Yes | Human editorial workspace; depends on permissions/repository/theme |
| `features/relationship-gists/ai/relationship-gist-ai-repository.ts`<br>`0A79F0AF4302CAA4B541673470EE97CCE484F7EF88DB37A2C396443D35B09A9E` | U | M3 | Yes | Topic/job/review client repository |
| `features/relationship-gists/ai/RelationshipGistAIStudio.tsx`<br>`E7D43704608EDDD3601D665B06BCC226A01D31671525CA90835717BE4894AEAF` | U | M3 | Yes | Default-off AI-assisted draft UI; human review only |
| `features/relationship-gists/engagement/relationship-gist-engagement.ts`<br>`B26EC62A7D1F3DA5C99D3801A1E12F4DD8E1CD317F145D10CE325EBBDE6B8F3A` | U | M4 | Yes | Reaction/analytics finite contracts |
| `features/relationship-gists/engagement/relationship-gist-engagement-outbox.ts`<br>`804D19733E46EF4F331BB3A602B204B214B2CB39A5FCC068A3CFCD9BE92AC54E` | U | M4 | Yes | Offline reaction/reflection/event intent handling |
| `features/relationship-gists/engagement/relationship-gist-engagement-repository.ts`<br>`C2E34B86B28E9F1D480D9724B45B4E0BCA14521BF0D9AC5D563BE2645223934A` | U | M4 | Yes | Server-authoritative engagement mutations/aggregates |
| `features/relationship-gists/hooks/use-relationship-gist-engagement.ts`<br>`5D56C0EA6CB6E25E4DAF73F30C04385D451F3134A8D419A3FE2153EC8A30E737` | U | M4 | Yes | Account/edition-scoped engagement lifecycle |
| `features/relationship-gists/components/RelationshipGistEngagementPanel.tsx`<br>`A44D8A1CB974D77802A421E894938BB0D9B912B8C3AEA41E6737631EA383A2D4` | U | M4 | Yes | Accessible reaction and private Reflection controls |

## Edge Function source

| File / SHA-256 | Status | Milestone | Required | Purpose / dependency |
| --- | --- | --- | --- | --- |
| `supabase/functions/_shared/relationship-gist-ai/contracts.ts`<br>`904175E52ACC412ABECBC74014F4BC5A7A690CF66820B16B5F94625A6CEFFE7E` | U | M3 | Yes | Versioned strict output, moderation and review schema |
| `supabase/functions/_shared/relationship-gist-ai/provider.ts`<br>`0B669E1E8AA4DB0DFCB124BD2360360CFBEC63AF2C3FE9EEBD3E97CC407A19A8` | U | M3 | Yes | Non-retained structured generation with bounded retry |
| `supabase/functions/_shared/relationship-gist-ai/telemetry.ts`<br>`D591E6984C2B10F43E838330587091086EB09CF5FB11957F21B0B9E81F0D5B94` | U | M3 | Yes | Redacted token/cost telemetry |
| `supabase/functions/relationship-gist-ai-draft/index.ts`<br>`16B4EA659B23AFC3671C360F614F6F51C3B401635D8B7D702C75B5AA5AD03C5D` | U | M3 | Yes | Auth/environment/editorial gate and draft-only orchestration |
| `supabase/functions/relationship-gist-ai-draft/config.toml`<br>`902F16C83253EA7E85C560EA383DDBE9CA7697269F66EA84D9CA37AC73A0F649` | U | M3 | Yes | Function auth configuration |
| `supabase/functions/relationship-gist-ai-draft/deno.json`<br>`40D51AF1137D5C317C822A865651A4644646E571121B20D532720F538D620C65` | U | M3 | Yes | Deno dependency/import configuration |

## Database and client tests

| File / SHA-256 | Status | Milestone | Required | Purpose |
| --- | --- | --- | --- | --- |
| `supabase/tests/database/relationship_gist_editorial_capabilities_test.sql`<br>`5AA3C759391702CA4A2431C250A19C70DC46C47B22FAC49EC91B1708B65E3E2E` | U | M1 | Yes | 23 authorization assertions |
| `supabase/tests/database/relationship_gist_reader_state_v2_test.sql`<br>`0999BC10D85C441A82E79E566D75293B89ED7D5497EE3CD46EC9C3737792CBB5` | U | M1 | Yes | 33 idempotency/account isolation assertions |
| `supabase/tests/database/relationship_gist_editorial_v2_test.sql`<br>`7B91BF95E37841D35A0A27E93DF3F16A7F25BFC141E8CA1D8DAD2C20DAAF1633` | U | M2 | Yes | 43 lifecycle/compatibility assertions |
| `supabase/tests/database/relationship_gist_ai_editorial_studio_test.sql`<br>`9F0A0257F169820F539938DED4C156FFA27C8E01299B3C57541B11E96A66E776` | U | M3 | Yes | 48 AI authority/provenance assertions |
| `supabase/tests/database/relationship_gist_reader_engagement_test.sql`<br>`A26CBD7DAD8C67C852C764D66356D848E3D1455F6C34AA45284342F15F9B417E` | U | M4 | Yes | 49 privacy/engagement assertions |
| `__tests__/relationship-gist-hardening.test.ts`<br>`24B4C3477049A3962FFB5046F1EEE618B73729A2EFC8FE952D4BFF0646D37DA4` | M | Legacy/M1 | Yes | Existing reader/Circles regressions |
| `__tests__/relationship-gist-foundation-hardening.test.ts`<br>`1285823CA6FF21F197F114614551EB8B39B68009C1F10568666B10E5A954174C` | U | M1 | Yes | Foundation and compatibility contracts |
| `__tests__/relationship-gist-outbox.interaction.test.ts`<br>`E1F3C8C9569291AA0C244A7748725D454D4D399A931AEDD59CC19327565CC096` | U | M1 | Yes | Recovery, duplicate and conflict behavior |
| `__tests__/relationship-gist-reader-v2-isolation.interaction.test.ts`<br>`1A58A3F378379C9F057347DF8EA625C3E50D1F4AA1BB02E151110897FD034E0D` | U | M1 | Yes | Flag/legacy/account isolation |
| `__tests__/relationship-gist-editorial-v2.regression.test.ts`<br>`08C561391A025B590CE5A3C52B458D8FD3544CD8CAFE699E019E8987F3FC6951` | U | M2 | Yes | Lifecycle UI and mixed-surface preservation |
| `__tests__/relationship-gist-saved-library.interaction.test.ts`<br>`3EE7E2375C1913D50A0F2CB6E1B706C187E5C300017595E3CD3B8AE024D976F4` | U | M2 | Yes | Saved Library account/cache behavior |
| `__tests__/relationship-gist-ai-contracts.regression.test.ts`<br>`32955C2BD4FAA5E6B9DE4C2CD29F92031FA1A72A6092AF0BC4663AE93A161D43` | U | M3 | Yes | Strict schema/provider/retry/cost contracts |
| `__tests__/relationship-gist-ai-security.regression.test.ts`<br>`FE26240B77B8CEAC0F6A2BD766F8164601F919B0D95AF461B52A278DE108BE03` | U | M3 | Yes | Default-off and draft-only authority |
| `__tests__/relationship-gist-reader-engagement.regression.test.ts`<br>`5A6270E1BF019490C85B4AEBD6E6BF3261784AEB8A9E51C37E00BD66589012CD` | U | M4 | Yes | Privacy/flags/accessibility contracts |
| `__tests__/relationship-gist-engagement-outbox.interaction.test.ts`<br>`5884AF9CE68B540E344CDBFE3F5C7128DFC99A2E104B2A72290A286B45F8E405` | U | M4 | Yes | Offline engagement intent behavior |

## Generated schema contract

| File / SHA-256 | Status | Milestone | Required | Finding |
| --- | --- | --- | --- | --- |
| `supabase/types/database.ts`<br>`8F7D841324FFD34B6A47F3D8A3AEDA899003F3D3EE442EF466D01B44B09BC3E8` | M, shared | M1–M4 | Yes | Current file does not contain the new Gist tables/RPCs; regenerate from the migrated target schema before freezing the release candidate |

Temporary generated schema SHA-256: `05C5A06181C496EAF01A3D44A516833DABD590082DA8F31F052F93CA7003D745`. It contained the required new symbols but was deliberately not copied into the worktree.

## Shared dependencies inspected, not owned by this release extraction

| File | SHA-256 | Worktree state | Use |
| --- | --- | --- | --- |
| `constants/theme.ts` | `D901A571611896840A8FA62B0F8D112C416334CA94897A26A611FB2D4299718A` | Clean | Light/dark theme contract |
| `hooks/use-color-scheme.ts` | `67A04C1C09F3CA82D17D44BF92FAC299FB29FE26AD080843CEC59A3557F421D3` | Clean | Theme selection |
| `lib/auth-context.tsx` | `3DC35385F5FFB092F44582BCCA1419599669A479B5BE7753AD0F6892903C0724` | M, unrelated/mixed | Account identity and logout lifecycle |
| `lib/supabase.ts` | `6DCA7B0F6ECD52DB4CA45C8E0C88DECB960EAD35ED21BE63C95BEB33783E3FAD` | M, unrelated/mixed | Supabase client |
| `lib/network-state.ts` | `D939F6DB969AB4B1EF1801A588608533FF310A5396EA4F56D06892348563DE37` | Clean | Offline detection |
| `lib/offline/circles-store.ts` | `716885759A4A796C68FB4BC79CDEFFDB83F48F7077CD70169B58A7B62BE3940F` | Clean | Existing Circles snapshot path |
| `lib/offline/image-store.ts` | `EB5317C54CB16466DAE3754EEC221CDE5B5A567D9C8C10745A944233CAB2E646` | Clean | Existing offline image path |
| `app/_layout.tsx` | `0EEACCE0A4E54A6CB40DE354641D18F5A5EE248A5074D90E9B215939CCF88878` | Clean | File-based route host |
| `package.json` | `DDE8B55514FFF74A093878C1BDF609E5131DBC961718D8B08FA1F8E1B5A2E552` | M, unrelated/mixed | Existing scripts/dependencies; no Milestone 5E install |
| `package-lock.json` | `A0E99934E0BCCA3AD15E8B47D44D208AF235968E639A1FBD78AA9D549B96D6D4` | Clean | Dependency lock |

## Mixed-file risk and extraction method

`app/(tabs)/explore.tsx` is the highest-risk mixed file: its working blob is `dc64762df2f4f7174d02ae331b79b02793346d1c`, while HEAD is `a57f2e8f031e218816aa399a290fcc8da7395982`; the current diff is 350 additions and 282 deletions and combines Circles, Live and Gist work. `lib/auth-context.tsx`, `lib/supabase.ts`, `package.json` and `supabase/types/database.ts` are also shared dirty files.

Safe release preparation must:

1. create a dedicated release-candidate branch/worktree only after explicit authorization;
2. freeze this manifest's hashes;
3. include the five migrations and isolated Gist modules by explicit path;
4. extract only reviewed Gist hunks from `explore.tsx`, preserving every Circles/Live/admin/auth hunk;
5. treat shared auth/Supabase/package changes as separate prerequisites, not silently absorb them into Gist 2.0;
6. regenerate `supabase/types/database.ts` from the migrated release database, review the complete generated diff and rerun all gates;
7. recalculate every hash after extraction. Any hash change invalidates this manifest and requires rerun.

Automatic commit selection from the current dirty worktree is unsafe. No staging, commit or extraction was performed in Milestone 5E.

`RELEASE_CANDIDATE_REPRODUCIBLE = CONDITIONAL`

`COMMITS = NONE`
