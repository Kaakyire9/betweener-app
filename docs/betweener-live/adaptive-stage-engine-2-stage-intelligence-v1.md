# Adaptive Stage Engine 2.0 — Stage Intelligence V1

Status: implementation and local visual verification complete. Hosted staging deployment was not applied.

## Product boundary

- `Recommended now` is produced by a deterministic, platform-neutral domain engine.
- Hard eligibility runs before additive scoring and stable ranking.
- Studio shows at most three contextual recommendations plus a separate safe fallback.
- Recommendations can update Preview only. They cannot TAKE, CUT, mutate Program, or acquire controller authority.
- Guarded TAKE remains the server-authoritative boundary for source graph, health, capacity, admission, manifest, and version checks.
- No private matching, Spark, message, outcome, contact, hidden moderation, or per-user Pulse data enters the engine or telemetry.
- Sustained-speaker input remains `null` in the current Studio integration. Speaker Focus stays available in the full Scene Library but is not promoted without a real future Focus Engine signal.

## Rollout gates

Stage Intelligence requires both:

```text
VITE_ADAPTIVE_STAGE_M2_ENABLED=true
VITE_ADAPTIVE_STAGE_M2_STAGE_INTELLIGENCE_ENABLED=true
```

Both default to false. Program, native, compositor, Room Pulse, and production output are unchanged.

## Contextual examples

| Live context | Ranked recommendations |
| --- | --- |
| 1-person Host | Host focus |
| Host + 2 guests | Host-led trio; Balanced trio |
| Host + 5 guests, six authorized | Host-led six; Balanced six; Event panel six |
| Screen Share active with Host + 2 | Screen + panel; Screen discussion; Screen + speaker |
| Active Quick Connect pair | Pair focus; Host + guest; Balanced duo |
| Quick Connect pool waiting | Host + room; Room focus; Host focus |
| Audience Pulse active | Audience pulse; Host focus |
| Low liquidity with no people | Odo moment |

Screen-family recommendations are absent when Screen Share is absent. Safety-required mode returns only Safe intermission. A suitable current scene becomes `Keep current` when the improvement threshold, minimum dwell, recent-history, or manual-lock stability policy applies.

## Studio presentation

- Contextual cards show title, factual reason, factual chip, confidence label, and Preview.
- `Keep current` is presented as on-air and has no Preview action.
- Branded intermission is visually separated as the safe fallback.
- Exhaustive manual browsing remains below recommendations under People, Present, Engage, Intermission & safety, and Advanced families.
- The layout collapses to one recommendation column on compact Studio widths.

## Telemetry

The bounded event allowlist contains:

- `stage_recommendations_generated`
- `stage_recommendation_previewed`
- `stage_recommendation_accepted`
- `stage_recommendation_ignored`
- `stage_manual_scene_selected`
- `stage_hold_current_recommended`

Payloads contain only scene/strategy, rank, reason codes, occupancy bucket, canvas, Program/source-graph versions, confidence band, and bounded time-to-action. Participant identities are excluded. New `stage_*` writes require authorized Studio view access.

## Verification evidence

- Stage Intelligence regression: 19/19 passed.
- Full Live logic regression: 506/506 passed.
- Studio Phase B and on-air team regression: 19/19 passed.
- Existing Adaptive Stage M2.1 regression: 19/19 passed.
- Existing Phase 10G regression: 44/44 passed.
- Studio Playwright scenarios: 8/8 passed with committed Windows screenshot baselines.
- Root TypeScript check: passed.
- Studio build and Studio TypeScript check: passed.
- Targeted ESLint: passed with zero warnings.
- SQL migration chain: executed successfully in one staging transaction and rolled back.
- Rollback readback: no M2 flag columns and no Stage Intelligence event names persisted remotely.

## Completion

```text
STAGE_INTELLIGENCE_V1 = PASS
RECOMMENDED_NOW_CONTEXTUAL = PASS
STATIC_CORE_LIST_REMOVED = YES
SCREEN_ABSENT_FILTER = PASS
CAPACITY_AWARE = PASS
ROLE_AWARE = PASS
PAIR_AWARE = PASS
POOL_AWARE = PASS
PULSE_AWARE = PASS
SAFETY_AWARE = PASS
CANVAS_AWARE = PASS
SOURCE_HEALTH_AWARE = PASS
HOLD_CURRENT = PASS
REASON_CODES = PASS
TELEMETRY = PASS
PROGRAM_OUTPUT_MODIFICATIONS = NONE
NATIVE_MODIFICATIONS = NONE
COMPOSITOR_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```

Stop after Stage Intelligence V1. Focus Engine, Stage Morphing, Quick Connect choreography, Auto Director, Rhythm Intelligence, predictive prewarming, and Odo automatic TAKE remain out of scope.
