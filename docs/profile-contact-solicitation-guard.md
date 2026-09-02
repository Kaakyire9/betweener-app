# Profile Contact & Solicitation Guard architecture

This document describes the reviewed, not-yet-deployed implementation in
`20260901140000_profile_contact_solicitation_guard.sql`.

## Trust boundaries

1. React Native performs a non-authoritative deterministic UX precheck.
2. `profile-guard-update` requires a Bearer token and calls Supabase Auth
   `getUser(accessToken)`. The verified returned `user.id` is the only owner ID.
3. The Edge Function merges changed text with the current profile, runs the
   database detector first, and invokes semantic classification only for an
   ambiguous deterministic `ALLOW`.
4. Only `service_role` can execute the write bridge. Its JSON keys are strictly
   allowlisted; ownership, moderation, identity, verification, account,
   subscription and entitlement fields are absent.
5. RLS and protected-field triggers reject direct arbitrary-text writes.
6. `can_profile_surface_publicly(profile_id)` is the canonical database
   predicate for stranger-facing selection. Relationship-scoped reads use
   `can_authenticated_user_view_profile` so existing matches and active Circle
   co-members remain readable.

No raw profile text, semantic prompt, or semantic score values are written to
moderation logs. The mobile response contains only stable decision codes and a
`semantic_used` boolean.

## Complete user-controlled profile field classification

“Direct protected” means a direct PostgREST write cannot bypass the validation
shown. Server-managed fields are listed separately because the user may cause a
legitimate transition but cannot choose their stored value.

| Field(s) | Public? | Free text? | Validation | Guarded server-side? | Direct protected? | Rendered/used by |
|---|---:|---:|---|---:|---:|---|
| `full_name` | Yes | Yes | deterministic + conditional semantic | Yes | Yes; Edge required | all profile cards, Discovery, Vibes, Intent, Compass, Circle, Live |
| `bio` | Yes | Yes | deterministic + conditional semantic | Yes | Yes; Edge required | full profile, Vibes, suggestions, closure |
| `occupation`, `education`, `looking_for` | Yes | Yes (`Other` supported) | deterministic + conditional semantic | Yes | Yes; Edge required | full profile, recommendations, compatibility |
| `roots_note` | Visibility-dependent | Yes | deterministic + conditional semantic | Yes | Yes; Edge required | Roots & Heritage/profile affinity |
| `future_ghana_plans` | Me/details currently; DB-readable with an authorized profile row | Yes | deterministic + conditional semantic | Yes | Yes; Edge required | Me profile details/diaspora data |
| prompt `prompt_title`, `answer`, `hint_text`, `guess_options` | Yes | Yes | deterministic + conditional semantic | Yes | Yes; Edge/service prompt RPC required | full profile featured/guess prompts |
| `city`, `region` | Yes | No; locality labels | max 100, letters/spaces/punctuation only, detector-safe; locality FK when selected | Yes | Yes; trigger validates direct writes | cards, full profile, Discovery, Vibes, Circle localization |
| `location` | Yes | No; derived display label | must equal a permitted city/region/country composition | Yes | Yes; trigger validates direct writes | cards, full profile, distance/location affinity |
| `last_ghana_visit` | No current stranger UI | No; legacy structured status/date | max 40, constrained characters, detector-safe | Yes | Yes; trigger validates direct writes | diaspora metadata only |
| `age`, `gender` | Yes | No | DB enum/range + onboarding controls | Yes | Existing DB constraints | cards and reciprocal eligibility |
| `religion`, `tribe`, `roots`, `roots_visibility` | Yes/visibility-dependent | No; controlled choices/lists | enum/controlled options and visibility constraint | Yes | Existing DB constraints plus bridge allowlist | full profile, affinity, recommendations |
| `height`, `exercise_frequency`, `smoking`, `drinking`, `has_children`, `wants_children`, `personality_type`, `love_language`, `living_situation`, `pets` | Yes | No; controlled choices | UI options and existing DB types; strict bridge key allowlist | Yes | Owner RLS + bridge allowlist | full profile and compatibility |
| `languages_spoken` | Yes | No; controlled list | array from picker | Yes | Owner RLS + bridge allowlist | full profile/compatibility |
| `min_age_interest`, `max_age_interest`, `age_preference_confirmed_at` | No | No | 18–99 and reciprocal DB logic | Yes | DB constraints + bridge allowlist | recommendation eligibility |
| `current_country`, `current_country_code`, `origin_country`, `origin_country_code`, `origin_country_source` | Country labels may render | No | country picker, ISO code, country-lock triggers | Yes | Existing country-integrity triggers + bridge allowlist | location/roots affinity and profile labels |
| `locality_geoname_id`, `locality_district`, `locality_admin1_code`, `locality_provider`, `latitude`, `longitude`, `location_precision`, `location_updated_at` | Coarsened derivatives may render | No | canonical locality hierarchy, coordinate ranges, privacy precision | Yes | Existing locality/privacy triggers + bridge allowlist | distance and location affinity |
| `avatar_url`, `hero_image_url`, `photos`, `profile_video` | Yes | No; media references | media upload/storage pipeline | Yes | Owner RLS + bridge allowlist | all visual profile surfaces |
| `relationship_compass` | Derived answers/results may affect discovery | No; structured JSON | Compass schema/application validation | Yes | bridge allowlist | Relationship Compass/recommendations |
| `years_in_diaspora` | Not currently stranger-rendered | No | numeric value | Yes | bridge allowlist | diaspora affinity |
| `onboarding_variant` | No | No | controlled onboarding variant | Yes | bridge allowlist | onboarding/country policy |
| `discoverable_in_vibes`, `matchmaking_mode` | No | No; user privacy controls | boolean + canonical eligibility | Existing owner setting paths | non-CLEAR state cannot become discoverable | all stranger surfacing |

User-associated but server-managed columns are not bridge-writable:
`id`, `user_id`, `profile_moderation_state`, `profile_completed`,
`identity_status`, identity/onboarding timestamps, phone number/verification,
verification level/scores, account state/pause data, subscription/entitlement
data, safety fields, AI scores, superlike balances, presence timestamps,
cryptographic keys, recovery/duplicate identity fields, and internal audit data.
Onboarding completion is an explicit service RPC that derives the transition
only after checking verified phone and required profile substance.

## Public surface audit

| Surface | Enforcement path |
|---|---|
| Main/direct profile browsing and Similar Profile opens | profiles SELECT RLS calls `can_authenticated_user_view_profile`; strangers require `can_profile_surface_publicly` |
| Vibes v3/v5/v5.3, boosted/second-look lanes | existing `discoverable_in_vibes` filters; moderation trigger guarantees every non-CLEAR state forces it false |
| Intent Suggested Moves and expired-request/Closure recommendations | V2 wrappers call `is_romantically_eligible`, now composed with the canonical predicate |
| Relationship Compass | calls `is_romantically_eligible` |
| Circle Home Picks and Circle discovery | calls `is_romantically_eligible`; ordinary active co-membership remains a relationship-scoped read |
| Quick Connect/public Live pairing | `live_quick_connect_pair_is_eligible` composes the canonical predicate for both profiles |
| Cross-session/quorum Live pooling | `live_pool_profile_is_enabled` composes the canonical predicate; downstream pool queries already use it |
| Profile prompts | guarded service insert; prompt read RPC uses relationship/public read eligibility |
| Existing matches, private chats, established connections | not removed by stranger eligibility; matched profiles remain readable |

## Semantic and flag behavior

Server database defaults are: enabled `true`, semantic `false`, enforcement
`ENFORCE`, backfill `false`. Missing/corrupt configuration resolves to the same
fail-safe values. The Edge environment semantic flag is an operator kill switch;
the app cannot set any flag.

| Deterministic result / context | AI? | Provider failure in ENFORCE |
|---|---:|---|
| obvious safe and non-ambiguous | No | allow through DB policy |
| phone/email/URL/platform CTA/paid-content/payment signal | No | deterministic rewrite/restrict decision |
| deterministic `ALLOW` plus ambiguous private/exclusive/elsewhere wording | Yes, only when both server semantic flags are enabled | `REQUIRE_REWRITE`; no content is published |
| ambiguous in REPORT_ONLY | Optional | allow and log metadata only |
| guard OFF | No | allow through strict write/structured validation boundary |

Semantic timeout is 4.5 seconds. The model is selected with
`PROFILE_GUARD_SEMANTIC_MODEL` (default `gpt-5-mini`). The Responses API uses a
strict JSON Schema and the runtime additionally requires exactly the expected
finite 0–1 score fields. AI can place a profile into `REVIEW_REQUIRED`; it never
permanently suspends a profile.

## Integration commands (not run)

```powershell
npx.cmd supabase db reset
npx.cmd supabase test db supabase/tests/profile_contact_solicitation_guard.sql
npx.cmd supabase functions serve profile-guard-update --no-verify-jwt
```

Then execute the local-only requests in
`supabase/tests/profile_guard_edge_auth.md`. The function performs its own
verified `getUser(token)` check even when the local gateway JWT check is disabled.
