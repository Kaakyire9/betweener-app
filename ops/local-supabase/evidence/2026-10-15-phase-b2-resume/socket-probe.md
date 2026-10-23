# Phase B2 bounded Docker socket probe

- Image: `haproxy:3.2.26-alpine@sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2`
- Platform: `linux/amd64`
- Pull policy: `never`
- Fixture: `ops/local-supabase/tests/vector-docker-api-proxy/probe-docker-api.sh`
- Probe result: **FAIL**
- Daemon identity comparison: **BLOCKED**
- Post-probe capture (UTC): `2026-10-15T13:24:17.0701269Z`

## Controls retained

The disposable container used `--network none`, no published ports, no privileged mode or host namespace, a read-only root filesystem, read-only explicit bind mounts for `/var/run/docker.sock` and `/probe.sh`, UID/GID `99:99` with supplementary GID `0`, all capabilities dropped, `no-new-privileges`, 32 MiB memory, 0.10 CPU, 32 PIDs, no restart policy, and the fixed non-interactive `/probe.sh` entrypoint. Each permitted request had a five-second timeout. The script permits only GET `/_ping`, `/version`, and `/info`, and exits on the first non-200 response.

## Result

The actual socket-access attempt used temporary container `betweener-phase-b2-socket-probe-3182491a8ae748078ef1594d5d8ca8ae`. It reached the mounted socket, but the first request failed:

```text
Unexpected response for /_ping: HTTP/1.1 500 Internal Server Error
```

The process exited non-zero. The script stopped immediately, so it did not request `/version` or `/info` and retained no daemon identity fields from the socket. No mutation request or negative security test was sent.

The independently selected `desktop-linux` context reported:

```text
ID=f88969ab-ece5-4d31-bed0-8fd8830c6b40
Name=docker-desktop
ServerVersion=29.8.1
OSType=linux
Architecture=x86_64
```

Because the socket side did not return `/info`, the actual daemon identity cannot be compared. This is a blocked comparison, not evidence of an identity mismatch.

An earlier invocation named `betweener-phase-b2-socket-probe-70267da4a4064d1cafc0ccba105a8f1c` was rejected by the Docker CLI before container creation because the repository-relative probe-fixture path was wrong. No socket was mounted or accessed in that invocation, and absence of a container was verified before the corrected invocation.

## Cleanup and resource comparison

- Failed probe container: force-removed in the command's `finally` block
- Probe-label remainder check: `NONE`
- Containers: `13` before and `13` after (`12` active)
- Images: `38` before and `38` after (`12` active)
- Local volumes: `5` before and `5` after (`3` active)
- Networks: `5` after, matching the prior baseline
- Build-cache records: `28` before and `28` after
- Vector: same ID `c15603c0e7be96c7da13a132a66879c483db5c2f1dab3ae37bd1a891f96edb20`, exited, restart count `45`, original Supabase network only
- Edge Runtime: same ID `d27f2b3817737e23f5c2cd0dff7d8683acebd4a8fe70e169f073f7b23ac6599b`, running, restart count `0`
- Analytics: same ID `f980ea1b72b4968008f5f8e9be65fd16823e61aa3e493c2409407982e4d575f7`, running/healthy, restart count `0`
- Database: same ID `475904e1caa691d0cfa7fcb1bdf91b24925a7c097494e4f8e500c572e58c9437`, running/healthy, restart count `0`
- Audio: same ID `f29c212dde0fb8802f106d1a5d8e001e8c59646262ec33ee928495eb1841a314`, running/healthy, restart count `0`, bridge network
- `[analytics].enabled`: remains `false`
- C: free: `34,713,542,656` bytes

No permanent proxy or network was created, no existing container was attached/recreated/restarted, Vector remained stopped, and no cleanup/prune or Docker Desktop setting change was performed.
