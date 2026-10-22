# Program compositor worker runbook

## Purpose

The C2 compositor is a persistent private worker. It subscribes to the Stream
RTC call as `studio-program-*`, renders the server-authoritative Program scene
inside an isolated Chromium/Xvfb display, mixes browser audio through a private
PulseAudio sink, and publishes one H.264/AAC RTMP Program output back to the
same Stream call.

The worker does not read or render reactions, private messages, Sparks,
ballots, matching decisions, or other private engagement data.

## Required environment

- `SUPABASE_URL`: exact project URL.
- `BROADCAST_COMPOSITOR_WORKER_TOKEN`: at least 32 random bytes and equal to
  the Edge Function secret with the same name.
- `PORT`: health and loopback renderer server, default `8080`.
- `BROADCAST_COMPOSITOR_MAX_SESSIONS`: default `1`, maximum `4`.

Provider secrets remain in `live-broadcast-orchestrator`. They are never placed
in this container.

## Build

Run from the repository root:

```bash
docker build -f apps/program-compositor-worker/Dockerfile -t betweener-program-compositor:c2 .
```

## Staged activation

1. Deploy the C1 and C2 migrations with every broadcast flag still `false`.
2. Deploy `live-broadcast-orchestrator` and set the shared worker token.
3. Start exactly one compositor replica and confirm `/healthz` returns `200`.
4. Enable `broadcast_compositor_enabled` only for the staging canary window.
5. Verify one `studio-program-*` RTMP participant, stable lease heartbeats, and
   scene changes without private data in the output.
6. Exercise worker death and replacement. The new generation must fence the old
   worker before it can heartbeat.
7. Disable the flag after the canary. HLS, recording, captions and clips remain
   separate later gates.

## Operational invariants

- One fenced compositor lease owns a Live at a time.
- Browser credentials are short-lived and exchanged only over loopback HTTP.
- The RTMP address and stream key are never logged.
- The renderer profile and audio sink are destroyed on release.
- An unhealthy renderer or media process releases the lease and fails closed.
