# Betweener Live documentation

This directory is the durable source of truth for continuing Betweener Live
across development threads.

Read in this order:

1. [`master-plan.md`](./master-plan.md) — product constitution, complete
   requirement ledger, phase sequence and cross-phase UX rules.
2. [`handoff.md`](./handoff.md) — current implementation status, repository
   map, validation evidence, active Phase 9 deployment status and the next safe
   task.
3. [`phase1-operations.md`](./phase1-operations.md) — historical Phase 1
   deployment notes. Later native background-continuity and PiP work supersedes
   some of its original beta restrictions; use the handoff for current status.

## New-thread instruction

Use this exact opening message:

> Continue Betweener Live from `docs/betweener-live/README.md`. Read
> `master-plan.md` and `handoff.md` completely before changing code. Work on
> branch `feature/betweener-live`, starting from the current branch tip. Treat
> Supabase as product authority and the RTC provider as media transport only.
> Phase 7 Quick Connect has completed three-account development validation.
> Phase 8 has been reported working in development. Continue with Phase 9
> deployment/device validation, and retain the broader Phase 7/8 matrices as
> TestFlight/Play closed-testing scale gates.

Do not rely on chat history as the only specification. Update the handoff after
each coherent implementation or device-testing pass.
