# Screen Presentation Fit V1

Screen Presentation Fit V1 makes screen-share presentation deterministic across Studio,
native audience rendering and the compositor. It does not change Room Pulse, comments,
the composer, reactions or the Live footer.

## Authority

- `contentMode` is safe source metadata owned by the authorized Studio publisher.
- `screenFitMode` is Program presentation state. Studio edits it in Preview and commits it
  only through the version/source-graph-fenced TAKE or CUT flow.
- Track width and height come from `MediaStreamTrack.getSettings()` and are reconciled while
  the source remains live. No pixels, OCR output or frame-derived data are stored.

## Policy

- Fit always uses `contain` with the static Betweener matte.
- Fill always uses centered `cover` after producer Preview.
- Auto fills only explicitly identified media when total required crop is at most 10%.
- Documents, presentations, demos and unknown content resolve to Fit in Auto.
- Missing dimensions conservatively use a 16:9 fallback and expose a fallback reason.

The canonical implementation is
`packages/live-program-domain/src/screen-presentation-fit-v1.ts`.

## Flags

All flags are default-off:

- Studio: `VITE_SCREEN_FIT_V1_ENABLED=true`
- Native: `EXPO_PUBLIC_SCREEN_FIT_V1_ENABLED=true`
- Compositor: `VITE_SCREEN_FIT_V1_ENABLED=true`
- Internal Studio Fit Lab: `VITE_SCREEN_FIT_LAB_ENABLED=true`
- Database configuration: `screen_fit_v1_enabled=false`,
  `screen_fit_lab_enabled=false`

No flag is enabled by the migration.

## Internal Fit Lab

In Studio development mode, enable both Studio flags and open:

`/?e2eHarness=screen-fit-lab`

The Lab contains Auto/Fit/Fill across portrait, square and landscape, plus document,
presentation, media, embedded-subtitle, edge-text, Screen + Host, Screen + Panel and
Screen Discussion fixtures.

## Rollback

Disable the three renderer flags first. Legacy renderer behavior remains available.
The additive columns and RPCs can remain deployed while disabled. Do not down-migrate a
live schema; use a reviewed forward repair if database rollback is required.
