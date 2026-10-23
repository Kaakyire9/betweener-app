# Adaptive Stage Engine 2.0 — Milestone 2.1 Studio Preview

Status: implementation and local visual review complete; hosted staging deployment intentionally not applied because the remote migration ledger is divergent.

## Safety boundary

- The renderer is available only when both `VITE_ADAPTIVE_STAGE_M2_ENABLED=true` and `VITE_ADAPTIVE_STAGE_M2_STUDIO_PREVIEW_ENABLED=true`.
- Both variables default to false. The database gates also default to false.
- M2 Preview is local to Studio. It cannot call `studioApi`, build a TAKE command, mutate source assignments, or increment Program version.
- While M2 Preview is open, TAKE/CUT and their keyboard shortcuts are disabled.
- Program, native and compositor M2 render flags remain false and no viewer renderer changed.
- Controlled fixtures use neutral identities. Authoritative mode binds the exact `sourceKey`, `ownerUserId` and `providerUserId`; missing or duplicate owners fail explicitly.

## Canonical people layout book

| Strategy | Intent | Occupancy | Roles | Portrait | Landscape | Square | Status | Visual notes |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `solo_cinematic` | solo focus | 1 | equal | full frame | full frame | not authored | ready | Most neutral solo composition. |
| `solo_host` | host-led | 1 | Host hero | full frame | full frame | not authored | ready | Recommended solo Host default. |
| `solo_presentation_support` | solo focus | 1 | presenter | full frame | full frame | not authored | ready | Reserved for presenter-led moments. |
| `balanced_duo` | balanced conversation | 2 | equal | stacked | side-by-side | not authored | ready | Strong non-hierarchical conversation. |
| `host_guest_interview` | host-led discussion | 2 | Host hero + guest | 62/38 stack | 64/36 split | not authored | ready | Recommended interview default. |
| `speaker_focus_duo` | speaker focus | 2 | active speaker hero | 62/38 stack | 64/36 split | not authored | ready | Explicit focus only; no focus engine. |
| `match_pair` | match introduction | 2 | current pair | stacked | side-by-side | not authored | ready | Pair-first treatment without choreography. |
| `balanced_trio` | balanced conversation | 3 | equal | three rows | three columns | not authored | ready | Landscape feels more panel-like. |
| `host_hero_plus_2` | host-led discussion | 3 | Host hero + two | hero over pair | hero + side stack | not authored | ready | Recommended three-person default. |
| `speaker_focus_trio` | speaker focus | 3 | speaker hero + two | hero over pair | hero + side stack | not authored | ready | Clear active-speaker hierarchy. |
| `pair_plus_host` | pair focus | 3 | pair + Host | hero over pair | hero + side stack | not authored | ready | Visual preview only. |
| `classic_2x2` | panel discussion | 4 | equal | 2×2 | 2×2 | not authored | ready | Familiar; closest to conferencing-grid feel. |
| `host_hero_plus_3` | host-led discussion | 4 | Host hero + three | hero over strip | hero + side stack | not authored | ready | Recommended four-person editorial default. |
| `speaker_hero_plus_3` | speaker focus | 4 | speaker hero + three | hero over strip | hero + side stack | not authored | ready | Strong focus; supporting faces become compact. |
| `balanced_panel_4` | balanced conversation | 4 | equal | 2×2 | 2×2 | not authored | ready | Use when hierarchy is undesirable. |
| `host_hero_plus_4` | host-led discussion | 5 | Host hero + four | hero + 2×2 | hero + 2×2 | not authored | ready | Recommended five-person portrait default. |
| `balanced_five` | balanced conversation | 5 | equal | 2 over 3 | 3 over 2 | not authored | ready | Recommended five-person landscape default. |
| `speaker_plus_4` | speaker focus | 5 | speaker hero + four | hero + 2×2 | hero + 2×2 | not authored | ready | Supporting labels use compact disclosure. |
| `editorial_five` | panel discussion | 5 | presenter hero + four | hero + 2×2 | hero + 2×2 | not authored | ready | Works best with an explicit presenter. |
| `balanced_six` | balanced conversation | 6 | equal | 2×3 | 3×2 | not authored | ready | Recommended six-person landscape default. |
| `host_led_six` | host-led discussion | 6 | Host hero + five | hero + 2 + 3 | hero + 2 + 3 | not authored | ready | Recommended six-person portrait default. |
| `speaker_focus_six` | speaker focus | 6 | speaker hero + five | hero + 2 + 3 | hero + 2 + 3 | not authored | ready | Smallest supporting faces; use deliberately. |
| `event_panel_six` | panel discussion | 6 | equal | 2×3 | 3×2 | not authored | ready | Most formal panel treatment. |

## Visual evidence

Committed Playwright goldens:

- [People portrait](../../apps/studio/e2e/m2-preview.spec.ts-snapshots/m2-people-portrait-9-16-mocked-media-win32.png)
- [People landscape](../../apps/studio/e2e/m2-preview.spec.ts-snapshots/m2-people-landscape-16-9-mocked-media-win32.png)
- [Screen share portrait](../../apps/studio/e2e/m2-preview.spec.ts-snapshots/m2-screen-portrait-9-16-mocked-media-win32.png)
- [Screen share landscape](../../apps/studio/e2e/m2-preview.spec.ts-snapshots/m2-screen-landscape-16-9-mocked-media-win32.png)
- [Editorial moments portrait](../../apps/studio/e2e/m2-preview.spec.ts-snapshots/m2-moments-portrait-9-16-mocked-media-win32.png)
- [Editorial moments landscape](../../apps/studio/e2e/m2-preview.spec.ts-snapshots/m2-moments-landscape-16-9-mocked-media-win32.png)
- [Media states portrait](../../apps/studio/e2e/m2-preview.spec.ts-snapshots/m2-states-portrait-9-16-mocked-media-win32.png)
- [Media states landscape](../../apps/studio/e2e/m2-preview.spec.ts-snapshots/m2-states-landscape-16-9-mocked-media-win32.png)

The harness route is `/?e2eHarness=m2-preview&review={people|screen|moments|states}&canvas={portrait_9_16|landscape_16_9}` and exists only in Vite development builds.

## Honest visual findings

- Six-person portrait is readable after responsive label disclosure, but supporting faces are necessarily small. It should be used for planned panels, not ordinary conversation.
- `classic_2x2`, `balanced_panel_4`, `balanced_five`, `balanced_six` and `event_panel_six` can feel like conferencing grids. Host-led variants preserve more Betweener editorial character.
- Five/six-person compact tiles intentionally reduce role and mute metadata to protect faces and names.
- Screen + six-panel layouts preserve presentation readability and identity, but subtle facial expression will be limited on small Studio monitors.
- The controlled fixtures validate composition, camera-off, reconnecting and degraded states; real multi-device publisher acceptance remains a later gate.

## Recommended defaults

| Occupancy | Portrait | Landscape |
| ---: | --- | --- |
| 1 | `solo_host` | `solo_host` |
| 2 | `host_guest_interview` | `host_guest_interview` |
| 3 | `host_hero_plus_2` | `host_hero_plus_2` |
| 4 | `host_hero_plus_3` | `host_hero_plus_3` |
| 5 | `host_hero_plus_4` | `balanced_five` |
| 6 | `host_led_six` | `balanced_six` |

These are design recommendations only. Program defaults are unchanged.

## Gates and hosted state

| Gate | Local default | Hosted staging value |
| --- | --- | --- |
| M2 master | false | not deployed; no persisted M2 columns |
| Studio Preview | false | not deployed; no persisted M2 columns |
| Program | false | false / unchanged |
| Native | false | false / unchanged |
| Compositor | false | false / unchanged |

Both M2 migrations passed a transaction-scoped staging validation with every value false. The transaction was rolled back, and readback confirmed `persisted_m2_column_count = 0`. Broad deployment is blocked by the pre-existing migration-ledger mismatch: remote `20261022141705` has no matching local migration while local `20261022134658` is absent remotely.

## Readiness

```text
M2.1_STUDIO_PREVIEW = PASS
M2_LAYOUT_VISUALIZATION = PASS
FIVE_PERSON_VISUAL_REVIEW = READY
SIX_PERSON_VISUAL_REVIEW = READY
SCREEN_SHARE_VISUAL_REVIEW = READY
CAMERA_OFF_PRESENTATION = PASS
RECONNECT_PRESENTATION = PASS
PROGRAM_OUTPUT_MODIFICATIONS = NONE
NATIVE_M2_MODIFICATIONS = NONE
COMPOSITOR_M2_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```

Stop after M2.1. Do not start M2.2, native/compositor M2 rendering, focus scoring, stage morphing or Quick Connect choreography without review approval.
