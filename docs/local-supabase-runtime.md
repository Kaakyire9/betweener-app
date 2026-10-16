# Local Supabase runtime maintenance

This runbook covers the local-only repair for Supabase Vector's Docker log source. The explicitly approved Phase C deployment completed on 2026-10-15; future deployment changes still require their own approval. Hosted staging, production, Docker Desktop settings, and unrelated containers are out of scope.

## Phase C controlled local deployment (2026-10-15)

The approved per-service `json-file` policy (`max-size=5m`, `max-file=2`) was added and verified in rendered Compose, isolated missing/incorrect fixtures, and a disposable exact-image container. Docker rotation was not stress-tested, and the policy is not a total proxy or analytics disk-space limit.

The repeated preflight matched the accepted daemon, container, volume, network, image, sink, and worktree baselines. The wrapper then created only the planned proxy and internal network, attached the existing Vector container while retaining its Supabase network, and started Vector after verifying the created proxy's logging and security configuration plus its private alias. `[analytics].enabled` is `true`.

Vector opened the real Docker event stream and watched container logs. A unique request to an inventoried no-match Kong path returned a local, no-redirect 404; the marker appeared once in Kong's log and once in the existing local analytics tables. Vector and the proxy remained running with zero restart increments through a 684-second observation. Edge Runtime, database, analytics, audio, all existing container identities, and all five volumes were preserved. Full evidence: `ops/local-supabase/evidence/2026-10-15-phase-c-complete/report.md`.

Normal Docker Desktop/Supabase restart and CLI recreation persistence remain `NOT_TESTED`. On success, the approved state was intentionally left running.

## Historical Phase C preflight block (2026-10-15)

Controlled local deployment was authorised but stopped before mutation because the tested Compose file has no per-container logging configuration. Docker's active default is `json-file`, existing default container log options are empty, and no inherited `log-driver`/`log-opts` were configured in the inspected Docker Desktop or daemon settings. Deploying that file would violate the explicit bounded-log-rotation requirement.

`Plan` passed with the expected daemon, stopped Vector identity, original Supabase network, analytics disabled, and no proxy/network collision. The analytics line and implementation hashes were recorded. No analytics edit, proxy/network creation, Vector attachment/start, marker request, or rollback occurred. Phase C requires separate approval to add and test explicit bounded proxy logging before preflight can be repeated. Evidence: `ops/local-supabase/evidence/2026-10-15-phase-c/preflight-blocked.md`.

## B2 result (2026-10-15)

| Gate | Result | Evidence |
| --- | --- | --- |
| `IMAGE_IDENTITY` | `PASS` | Registry and local linux/amd64 descriptor both equal `sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2`. |
| `IMAGE_SECURITY_REVIEW` | `PASS` | Authenticated Docker Scout 1.24.0 completed online against the exact cached linux/amd64 digest: 30 packages indexed, `0C 0H 0M 0L`, with human-readable and SARIF evidence saved. The advisory-database timestamp and HAProxy component identification were not exposed. |
| `HAPROXY_CONFIG_VALIDATION` | `PASS` | HAProxy 3.2.26 `-c` passed in the pinned image; unset and empty `DOCKER_BACKEND` both failed. |
| `MOCK_ALLOWLIST_TESTS` | `PASS` | All allowed, denied, canonical-path, query, hardening, health, and streaming cases passed against a synthetic backend. |
| `SOCKET_API_CONNECTIVITY` | `PASS` | A probe-side stdin-EOF defect caused the original failure. After a mock-proven minimal correction, the constrained real-socket probe received HTTP 200 and `OK` from GET `/_ping`. |
| `DOCKER_DAEMON_IDENTITY_MATCH` | `PASS` | Socket-side ID `f88969ab-ece5-4d31-bed0-8fd8830c6b40`, name `docker-desktop`, server 29.8.1, and API 1.56 match explicit context `desktop-linux`. |
| `LIVE_VECTOR_DEPLOYMENT` | `NOT PERFORMED` | No permanent proxy or network was created. |
| `VECTOR_END_TO_END_LOG_DELIVERY` | `NOT TESTED` | Vector remained stopped. |
| `NORMAL_START_PERSISTENCE` | `NOT TESTED` | No Docker Desktop or Supabase restart was performed. |

## Image evidence

- Reference: `haproxy:3.2.26-alpine@sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2`
- Registry index: `sha256:254e6370f01cd654e0744edf607c67f33777c1b6a9dc0d4b28bcba7171460122`
- Platform: `linux/amd64`
- Local image ID and descriptor: the approved manifest digest above
- Version: HAProxy `3.2.26-3e0f11a`; socat `1.8.1.3`
- Base: Alpine `3.24`; image annotation base digest `sha256:d56c381f961d307a21b3ca004cf1e3910f106644aefb1f43e654c8a56c4fd395`
- Created: `2026-10-14T20:17:38Z`
- Size: `67,030,647` local unpacked bytes (63.93 MiB); `20,636,673` registry bytes (19.68 MiB)
- Docker Hub public tag metadata: active, last updated `2026-10-15T11:56:59Z`

Installed packages:

```text
.haproxy-rundeps 20261014.201738
alpine-baselayout 3.7.2-r1; alpine-baselayout-data 3.7.2-r1
alpine-keys 2.6-r0; alpine-release 3.24.2-r0
apk-tools 3.0.8-r0; libapk 3.0.8-r0
busybox 1.37.0-r31; busybox-binsh 1.37.0-r31; ssl_client 1.37.0-r31
ca-certificates 20260909-r0; ca-certificates-bundle 20260909-r0
libcrypto3 3.5.9-r0; libssl3 3.5.9-r0
libncursesw 6.6_p20260516-r0; ncurses-terminfo-base 6.6_p20260516-r0
lua5.4-libs 5.4.8-r0
musl 1.2.6-r2; musl-utils 1.2.6-r2
pcre2 10.49-r0; readline 8.3.3-r1; scanelf 1.3.9-r1
socat 1.8.1.3-r0; zlib 1.3.2-r1
```

Security evidence and its limit:

- Authenticated Docker Scout 1.24.0 completed online on 2026-10-15 against the exact cached digest and `linux/amd64` platform. It indexed 30 packages and reported `0C 0H 0M 0L` / `No vulnerable packages detected`; saved SARIF contained zero rules and zero results. Scout reported that 1.26.0 exists, but tooling was not upgraded.
- Scout did not expose an advisory-database timestamp, explicit distribution identity, package inventory, or HAProxy component identification in its zero-finding output. Database timestamp is therefore **NOT EXPOSED** and HAProxy scanner coverage is not demonstrated by the report. Successful online analysis at the recorded scan time is the available scanner-freshness evidence.
- Alpine 3.24 `main.json` was last modified `2026-10-13T20:27:09Z`; `community.json` was last modified `2026-10-14T23:40:46Z`. Comparing every installed package origin with those security-fix records found the installed versions at or above the latest recorded fix versions, including OpenSSL 3.5.9-r0, musl 1.2.6-r2, PCRE2 10.49-r0, socat 1.8.1.3-r0, BusyBox 1.37.0-r31, and zlib 1.3.2-r1.
- HAProxy's upstream page listed 3.2.26 as the current 3.2 maintenance release and zero known queued bugs on 2026-10-15.
- A zero-finding result covers only components recognised by the scanner at scan time; it does not prove that the image is vulnerability-free. Full evidence is under `ops/local-supabase/evidence/2026-10-15-phase-b2-resume/`.

Sources: [Docker Hub tag metadata](https://hub.docker.com/_/haproxy/tags), [Alpine 3.24 main security database](https://secdb.alpinelinux.org/v3.24/main.json), [Alpine 3.24 community security database](https://secdb.alpinelinux.org/v3.24/community.json), [HAProxy 3.2.26 known bugs](https://www.haproxy.org/bugs/bugs-3.2.26.html).

## Proxy policy

The proxy listens only on the internal Docker network; it publishes no host port. HAProxy reads the backend exactly as:

```text
server docker "${DOCKER_BACKEND}"
```

The allowlist matches the undecoded canonical path and ignores only the query string. Percent-encoded Docker filter queries remain usable. Encoded path separators/dot segments, repeated or trailing slashes, absolute-form targets, and path parameters are denied.

Allowed GET paths, with or without `/v<major>.<minor>`:

- `/_ping`
- `/version`
- `/events`
- `/containers/json`
- `/containers/<safe-id-or-name>/json`
- `/containers/<safe-id-or-name>/logs`

All non-GET methods return 405. All other paths return 403. There is no `CONTAINERS=1`-style broad access.

## Mock test coverage

Run only the socket-free suite with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/local-supabase/tests/vector-docker-api-proxy/run-tests.ps1
```

The passing run used uniquely labeled containers and one internal network, no published ports, no Docker socket, UID/GID 99, supplementary GID 0, read-only roots, all capabilities dropped, no-new-privileges, no restart policy, 64 MiB/0.25 CPU/64 PID limits, and read-only fixture mounts.

Coverage included all allowlisted endpoints in versioned/unversioned forms, percent-encoded filter queries, chunked streaming completion, POST/DELETE, lifecycle, exec, attach, archive, export, image/info/volume paths, encoded slashes, encoded dot segments, repeated/trailing slashes, path parameters, and absolute-form targets. Every denied request returned the configured status and produced no mock-backend forward marker. Every allowed request preserved the exact request target at the backend.

## Bounded socket probe

The fixture at `ops/local-supabase/tests/vector-docker-api-proxy/probe-docker-api.sh` sends only GET `/_ping`, `/version`, and `/info`. It prints only ping plus daemon ID/name/version/API/OS/architecture; it does not print full `/info`.

The disposable probe retained `--network none`, no ports or host namespaces, read-only socket/script mounts and root filesystem, UID/GID 99 plus observed socket GID 0, all capabilities dropped, no-new-privileges, bounded CPU/memory/PIDs, no restart, pulling disabled, and a five-second per-request timeout. The original `socat` client closed on stdin EOF before response completion; it also lacked chunk decoding and used a greedy nested JSON match. Delayed/chunked mocks demonstrated all three defects. The corrected probe uses `STDIO,ignoreeof`, a four-second inactivity bound inside the hard timeout, chunk-frame removal, and top-level identity extraction. Real GET `/_ping`, `/version`, and `/info` then passed, and the socket identity matched `desktop-linux`. Full evidence is under `ops/local-supabase/evidence/2026-10-15-phase-b2-socket-investigation/`. This was the predeployment result; Phase C was later explicitly authorised and completed as recorded above.

## Exact deployed state

- `[analytics].enabled = true` in `supabase/config.toml`.
- Proxy: `betweener-vector-docker-api-proxy`, pinned `haproxy:3.2.26-alpine@sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2`.
- Proxy logging: `json-file`, `max-size=5m`, `max-file=2`.
- Proxy hardening: UID/GID `99:99`, supplementary GID `0`, read-only root, all capabilities dropped, no-new-privileges, 64 PIDs, 64 MiB, 0.25 CPU, no published ports, read-only configuration and Docker-socket mounts.
- Repair network: internal bridge `betweener_vector_docker_api`; only the proxy and Vector are members.
- Private proxy alias: `host.docker.internal`; no global port 2375 is published.
- Vector retains `supabase_network_betweener-app` and additionally uses `betweener_vector_docker_api`.
- Exact source changes and hashes are recorded under `ops/local-supabase/evidence/2026-10-15-phase-c-complete/`.

## Startup and recovery procedure

These commands are documented for a separately authorised maintenance event. They were not rerun during closeout.

For an existing stopped Vector container with the verified proxy/network state:

1. Confirm `[analytics].enabled = true`.
2. Run the read-only guard:

   ```powershell
   .\scripts\local-supabase.ps1 -Action Plan
   ```

3. If `Plan` confirms the expected daemon, project, Vector identity, pinned image, original Supabase network, and either absent or valid owned repair resources, deploy/reattach and start only Vector:

   ```powershell
   .\scripts\local-supabase.ps1 -Action Deploy -StartVector -Confirm
   ```

4. Confirm proxy health, both expected Vector networks, actual Docker discovery, and bounded local analytics delivery before treating recovery as successful.

The wrapper never edits `supabase/config.toml`, exposes host port 2375, recreates Vector, or stops another service.

### After Vector recreation

A Supabase CLI recreation replaces the Vector container and removes its manual repair-network attachment. The wrapper is required after every Vector recreation, even if the proxy and repair network still exist:

1. Do not assume the replacement Vector can reach Docker through this repair.
2. Run `Plan` and verify the replacement still has the expected project label, pinned Vector image, workdir, `DOCKER_HOST=http://host.docker.internal:2375`, and original Supabase network.
3. If the replacement Vector is stopped, run the approved `Deploy -StartVector -Confirm` command above. It validates/reuses or creates the owned proxy/network, adds only the repair-network attachment, verifies the private alias, and then starts Vector.
4. If the replacement Vector is already running without the complete repair, `Deploy` intentionally refuses. Under separate explicit authorisation, stop only that Vector container, rerun `Plan`, and then run `Deploy -StartVector -Confirm`:

   ```powershell
   docker --context desktop-linux stop --time 10 supabase_vector_betweener-app
   .\scripts\local-supabase.ps1 -Action Plan
   .\scripts\local-supabase.ps1 -Action Deploy -StartVector -Confirm
   ```

Do not force network changes or bypass a wrapper identity, ownership, logging, participant, or security failure. `NORMAL_START_PERSISTENCE = NOT_TESTED`; no Docker Desktop/Supabase restart or recreation lifecycle was performed during Phase C.

## Targeted rollback

Rollback is limited to this repair and requires a separately authorised maintenance event. First run `Plan`. If Vector is running, the explicit `-StopVector` switch is required:

```powershell
.\scripts\local-supabase.ps1 -Action Plan
.\scripts\local-supabase.ps1 -Action Rollback -StopVector -Confirm
```

The rollback action stops only Vector, disconnects only `betweener_vector_docker_api`, removes only the owned proxy and repair network, preserves Vector's original Supabase network, and preserves the cached image and implementation files. It refuses to force removal when labels, settings, endpoints, participants, or identities are unexpected.

The wrapper does not edit `supabase/config.toml`. After the Docker rollback succeeds, restore only the top-level analytics flag:

```toml
[analytics]
enabled = false
```

Then run `Plan` again. A complete rollback must report analytics disabled, Vector stopped on only `supabase_network_betweener-app`, and both `ProxyPresent` and `RepairNetworkPresent` false. Do not remove volumes, recreate containers, restart Docker Desktop/Supabase, or change unrelated configuration as part of this rollback.

## Remaining limitations

- A read-only socket bind does not make the Docker API read-only. HAProxy's method/path policy is the enforcement layer; compromise of the proxy process still exposes a powerful daemon socket.
- The allowed container list, inspection, event, and log endpoints expose metadata and log content for local containers. Logs can contain tokens, personal data, request data, or other secrets. Vector's current source is not project-label-scoped, so confidentiality risk remains even with mutation endpoints denied.
- The private network and lack of host ports reduce reachability but do not remove risk from another container deliberately attached to that network.
- Full Edge Function integration, Docker/Supabase restart persistence, and normal CLI recreation behavior remain untested. One real Kong-to-Vector-to-local-analytics marker was verified during Phase C.
- This is a local functional repair result, not complete function coverage, production-readiness evidence, or authorisation for hosted deployment.

## Audio preservation boundary

No action was taken against `betweener-program-audio`. Any future image archive, container filesystem export, or environment export must be treated as potentially secret-bearing. The missing original image metadata means `docker commit`/save feasibility and recoverability must not be assumed. Audio preservation requires a separate review and explicit approval.

The verified pre-compaction historical backup is `E:\Docker-Backups\offline-before-compaction\docker_data.vhdx`. Its SHA-256 was previously verified to match the stopped original before compaction. It is not a current live snapshot and was not touched during this maintenance. Do not delete, overwrite, mount, or restore it, and do not substitute the earlier unverified `before-compaction` copy for recovery. The configuration backup `E:\Docker-Backups\betweener-config-before-analytics-disable-20261015.toml` was also left untouched. Any backup recovery operation requires separate review and approval.
