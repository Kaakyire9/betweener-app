# Adaptive Stage Engine 2.0 — Milestone 1

Milestone 1 establishes one versioned scene contract and one deterministic shadow layout plan. It does not replace the current Program renderer or redesign the Live stage.

## Scope and boundaries

Adaptive Stage Engine owns only `ProgramStage` media composition. The Live header, Room Pulse/conversation panel, reactions, comments, input, scroll behavior, control dock and footer remain outside this boundary.

Current behavior remains authoritative:

- four human publishers by default;
- six publishers only for an explicitly enabled Live;
- Quick Connect remains two-person;
- V1 Studio, native and compositor renderers remain visible;
- no new scenes, layouts, choreography, recording or HLS behavior;
- the mobile Scene miniature percentage conversion is the only intended visible correction.

## Canonical contracts

`@betweener/live-program-domain` exports:

- `SCENE_MANIFEST_V2` with schema `2` and manifest `adaptive-stage-v2.0.0-m1`;
- all 21 existing Program scene IDs;
- exposure, slot semantics, accepted source types, required slots, occupancy, current canvas support, fallback chains and recording/privacy semantics;
- `LayoutPlanV2` with normalized `0..1` geometry;
- `resolveLayoutPlanV2`, a pure deterministic resolver that never reads RTC participant ordering;
- deterministic source-graph and plan hashes;
- deep `parseLayoutPlanV2`, `parseProgramState` and `parseProgramSources` validation;
- semantic V1/V2 comparison and safe telemetry event builders.

The restricted `private.live_scene_manifest_v2` table is the server mirror consumed by guarded TAKE validation. Repository parity tests compare its scene/version coverage to the TypeScript manifest. It is RLS-enabled and unavailable directly to members.

## Identity and source safety

V2 resolves only Program-assigned source keys. Studio, native PiP and compositor code no longer substitutes:

- the first RTC participant;
- the first two RTC participants;
- the first four RTC participants.

Aggregate Quick Connect pool/pair sources render their authored visual placeholder until their authoritative source graph contains a renderable provider. Missing identity is a diagnostic, never permission to display another person.

## Authoritative TAKE validation

The server validates under the existing per-Live Program transaction lock:

- manifest and scene version;
- supported canvas;
- source-graph version;
- source key shape and same-session existence;
- readiness and health;
- slot-to-source-type compatibility;
- required slots;
- distinct source keys;
- distinct human identities;
- human identity completeness;
- stage admission or Studio publication authority;
- authoritative Quick Connect pool/pair sources;
- Quick Connect two-person capacity;
- current `maximum_publishers` under lock;
- four-person default and six-person opt-in;
- `large_panel_enabled` for more than four humans;
- existing Program/controller version fences, AAL2 and capabilities.

Studio publication checks for a source owner use a private subject-safe predicate. They do not reuse the public helper whose capability checks are intentionally bound to the current authenticated user.

Existing V1 RPC signatures remain available and use the hardened validator. Updated Studio/mobile clients use graph- and manifest-fenced RPCs. Accepted commands may record manifest version, source graph version and shadow plan hash.

## Source graph versioning

`live_program_source_updates.version` remains the server-authoritative monotonic graph version. A guarded RPC refreshes logical sources and returns that version immediately before TAKE. No-op logical source refreshes no longer increment the graph version.

Client-only hashing exists only for cheap shadow-plan identity and never replaces the database fence.

## Flags and rollout

Flags:

- `adaptive_stage_v2_shadow_enabled`
- `adaptive_stage_v2_diagnostics_enabled`
- `adaptive_stage_v2_studio_render_enabled`
- `adaptive_stage_v2_native_render_enabled`
- `adaptive_stage_v2_compositor_render_enabled`

Environment equivalents use `VITE_...` for web workers/Studio and `EXPO_PUBLIC_...` for native. Safe shared defaults are all off. Studio/native default only shadow generation on in a staging build when no explicit override exists. All V2 renderer flags remain off.

Shadow resolution consumes existing metadata only. It creates no RTC connection, duplicate subscription, hidden video or second compositor.

## Telemetry

Safe events contain session/program/version/scene/canvas/capacity/count/hash data, never media or private engagement content:

- `adaptive_stage_v2_shadow_plan_generated`
- `adaptive_stage_v2_shadow_match`
- `adaptive_stage_v2_shadow_divergence`
- `adaptive_stage_v2_invalid_assignment_rejected`
- `adaptive_stage_v2_manifest_mismatch`
- `adaptive_stage_v2_source_identity_missing`
- `adaptive_stage_v2_arbitrary_fallback_prevented`
- `adaptive_stage_v2_plan_generation_error`

Studio parity events use a private diagnostic RPC/table. Native uses redacted application telemetry. The compositor uses container diagnostics. Shadow failure is isolated from V1 rendering.

## Validation matrix

Local gates:

1. `npm.cmd run test:adaptive-stage-m1`
2. `npm.cmd run test:live-phase10g`
3. `npm.cmd run test:live-studio-phase-b`
4. `npm.cmd run test:live-phase-c2`
5. `npm.cmd run typecheck`
6. `npm.cmd run studio:typecheck`
7. targeted lint for changed files
8. rollback-only pgTAP: `supabase/tests/database/adaptive_stage_engine_milestone_1_test.sql`

Staging acceptance must cover standard four-person, opt-in six-person, screen share, source loss, stale graph, outdated manifest and malformed assignments. Verify visible V1 output, Room Pulse and footer are unchanged.

## Rollback

Immediate behavioral rollback:

1. set all Adaptive Stage V2 render flags to false;
2. set shadow and diagnostics flags to false if diagnostics cause load;
3. keep V1 renderers active;
4. redeploy the prior Studio/mobile/compositor revisions if client rollback is required.

The migration is additive. Do not delete audit rows or rewrite migration history. If the new guarded RPCs must be bypassed during an incident, roll clients back to compatible V1/V2 RPC callers while retaining the hardened V1 validator unless a confirmed validator regression requires a forward repair.

## Deferred to Milestone 2+

- new visual layouts and scene-family UI;
- five/six-person editorial redesign;
- stage morphing and speaker focus;
- Stage Intelligence and Auto Director;
- dual broadcast, HLS, recording, clips and highlights;
- full cross-platform pixel screenshot harness.

Milestone 2 must not begin until staging semantic divergence for supported stable scenes is effectively zero and the completion report marks readiness.
